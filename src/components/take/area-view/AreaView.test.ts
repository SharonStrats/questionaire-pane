// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sym, type LiveStore } from 'rdflib'
import type { QuestionaireContext } from '../../../context'
import { questionairePredicates } from '../../../service/predicates'
import type { QuestionaireQuestionSummary } from '../../../service/questionQueries'

const mocks = vi.hoisted(() => ({
  loadQuestionaireQuestionSummaries: vi.fn(),
  getQuestionnaireFormat: vi.fn(),
  calculateQuestionnaireScore: vi.fn(),
  persistQuestionnaireResults: vi.fn(),
  sharePersistedQuestionnaireResults: vi.fn(),
  readQuestionValue: vi.fn(() => ''),
  readQuestionValues: vi.fn(() => []),
  readQuestionTypeUri: vi.fn(() => 'unknown'),
  shuffleDifferent: vi.fn((items: unknown[]) => items)
}))

vi.mock('../../../service/questionQueries', () => ({
  loadQuestionaireQuestionSummaries: mocks.loadQuestionaireQuestionSummaries,
  getQuestionnaireFormat: mocks.getQuestionnaireFormat
}))

vi.mock('../../../service/questionScoring', () => ({
  calculateQuestionnaireScore: mocks.calculateQuestionnaireScore
}))

vi.mock('../../../service/shareQuestionnaireResults', () => ({
  persistQuestionnaireResults: mocks.persistQuestionnaireResults,
  sharePersistedQuestionnaireResults: mocks.sharePersistedQuestionnaireResults
}))

vi.mock('../../../service/questionAccessors', () => ({
  readQuestionValue: mocks.readQuestionValue,
  readQuestionValues: mocks.readQuestionValues,
  readQuestionTypeUri: mocks.readQuestionTypeUri
}))

vi.mock('../../../service/shuffle', () => ({
  shuffleDifferent: mocks.shuffleDifferent
}))

vi.mock('../../../service/quizAiService', () => ({
  loadQuizAiService: vi.fn()
}))

vi.mock('../../standalone/pokemon-level-up/PokemonLevelUpDialog', () => ({
  showPokemonLevelUp: vi.fn()
}))

import './AreaView'

const subject = sym('https://creator.example/published/quiz/index.ttl#this')
const question = sym('https://creator.example/published/quiz/questions/q1.ttl#this')
const resultContainer = sym('https://taker.example/storage/questionnaire-results/result-1/')
const summary: QuestionaireQuestionSummary = {
  question,
  title: 'Question',
  typeUri: 'unknown',
  options: [],
  correctOptions: []
}
const score = {
  totalQuestions: 1,
  answeredQuestions: 1,
  availablePoints: 1,
  earnedPoints: 1,
  questionScores: [{
    questionUri: question.uri,
    questionTypeUri: questionairePredicates.question.questionType.multipleChoice.value,
    availablePoints: 1,
    earnedPoints: 1,
    correct: true
  }]
}

type AreaViewElement = HTMLElement & {
  questionaire: QuestionaireContext
  updateComplete: Promise<unknown>
}

type FinalScreenElement = HTMLElement & {
  resultStatus: string
  resultsSaved: boolean
  updateComplete: Promise<unknown>
}

async function settle (area: AreaViewElement): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0))
  await area.updateComplete
  const finalScreen = area.shadowRoot?.querySelector('questionaire-pane-take-final-screen') as FinalScreenElement | null
  await finalScreen?.updateComplete
}

async function startQuiz (): Promise<{
  area: AreaViewElement
  store: LiveStore
  acl: NonNullable<QuestionaireContext['acl']>
  reviewVisibilityEvents: boolean[]
}> {
  const store = {} as LiveStore
  const acl: NonNullable<QuestionaireContext['acl']> = {
    planGrantContainerContents: vi.fn(async () => ({})),
    applyPlan: vi.fn(async () => new Response('', { status: 200 }))
  }
  const area = document.createElement('questionaire-pane-take-question-area-view') as AreaViewElement
  const reviewVisibilityEvents: boolean[] = []
  area.addEventListener('questionaire-take-review-visibility', (event) => {
    reviewVisibilityEvents.push((event as CustomEvent<{ visible: boolean }>).detail.visible)
  })
  area.questionaire = { store, subject, acl }
  document.body.append(area)
  await settle(area)

  const dispatcher = area.shadowRoot?.querySelector('questionaire-pane-take-question-dispatcher')
  expect(dispatcher).toBeTruthy()
  dispatcher?.dispatchEvent(new CustomEvent('questionaire-answer-changed', {
    detail: { questionUri: question.uri, answer: 'Answer' },
    bubbles: true,
    composed: true
  }))
  await settle(area)

  const finishButton = area.shadowRoot?.querySelector<HTMLButtonElement>(
    '.questionaire-pane-take-question-area-view-nav-button--primary'
  )
  expect(finishButton?.textContent).toContain('Finished')
  finishButton?.click()
  await settle(area)
  return { area, store, acl, reviewVisibilityEvents }
}

describe('questionnaire taking results', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.loadQuestionaireQuestionSummaries.mockResolvedValue([summary])
    mocks.getQuestionnaireFormat.mockReturnValue('quiz')
    mocks.calculateQuestionnaireScore.mockReturnValue(score)
    mocks.readQuestionValue.mockReturnValue('')
    mocks.persistQuestionnaireResults.mockResolvedValue({ resultContainer })
    mocks.sharePersistedQuestionnaireResults.mockResolvedValue(undefined)
  })

  it('saves privately on completion and shares that saved result without duplicating it', async () => {
    const { area, store, acl } = await startQuiz()
    const finalScreen = area.shadowRoot?.querySelector('questionaire-pane-take-final-screen') as FinalScreenElement
    const saveButton = finalScreen.shadowRoot?.querySelector<HTMLButtonElement>(
      '.questionaire-pane-take-final-screen-private'
    )
    const shareButton = finalScreen.shadowRoot?.querySelector<HTMLButtonElement>(
      '.questionaire-pane-take-final-screen-share-button'
    )

    expect(mocks.persistQuestionnaireResults).toHaveBeenCalledTimes(1)
    expect(mocks.persistQuestionnaireResults).toHaveBeenCalledWith(
      store,
      acl,
      subject,
      expect.objectContaining({
        answers: { [question.uri]: 'Answer' },
        questionUris: [question.uri],
        shareWithCreator: false
      })
    )
    expect(finalScreen.resultsSaved).toBe(true)
    expect(saveButton?.textContent).toContain('Results saved')
    expect(saveButton?.disabled).toBe(true)
    expect(shareButton?.disabled).toBe(false)

    shareButton?.click()
    await settle(area)

    expect(mocks.sharePersistedQuestionnaireResults).toHaveBeenCalledWith(
      store,
      acl,
      subject,
      resultContainer
    )
    expect(mocks.persistQuestionnaireResults).toHaveBeenCalledTimes(1)
    area.remove()
  })

  it('allows retrying automatic private saving after a failure', async () => {
    mocks.persistQuestionnaireResults
      .mockRejectedValueOnce(new Error('Pod unavailable'))
      .mockResolvedValueOnce({ resultContainer })

    const { area } = await startQuiz()
    const finalScreen = area.shadowRoot?.querySelector('questionaire-pane-take-final-screen') as FinalScreenElement
    const retryButton = finalScreen.shadowRoot?.querySelector<HTMLButtonElement>(
      '.questionaire-pane-take-final-screen-private'
    )

    expect(retryButton?.textContent).toContain('Retry save')
    expect(retryButton?.disabled).toBe(false)
    retryButton?.click()
    await settle(area)

    expect(mocks.persistQuestionnaireResults).toHaveBeenCalledTimes(2)
    expect(finalScreen.resultsSaved).toBe(true)
    area.remove()
  })

  it('restarts the quiz from its review deck', async () => {
    const { area, reviewVisibilityEvents } = await startQuiz()
    expect(reviewVisibilityEvents).toEqual([true])
    const finalScreen = area.shadowRoot?.querySelector('questionaire-pane-take-final-screen') as FinalScreenElement
    finalScreen.shadowRoot?.querySelector<HTMLButtonElement>(
      '.questionaire-pane-take-final-screen-retry'
    )?.click()
    await settle(area)

    expect(area.shadowRoot?.querySelector('questionaire-pane-take-final-screen')).toBeNull()
    expect(area.shadowRoot?.querySelector('questionaire-pane-take-question-dispatcher')).toBeTruthy()
    expect(reviewVisibilityEvents).toEqual([true, false])
    area.remove()
  })
})
