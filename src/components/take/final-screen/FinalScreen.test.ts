// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { sym } from 'rdflib'
import { questionairePredicates } from '../../../service/predicates'
import { formatReviewAnswer } from '../../../service/answerFormatting'
import './FinalScreen'

type FinalScreenElement = HTMLElement & {
  questionnaireTitle: string
  questionSummaries: Array<{
    question: ReturnType<typeof sym>
    title: string
    typeUri: string
    options: string[]
    correctOptions: string[]
  }>
  questionScores: Array<{
    questionUri: string
    questionTypeUri: string
    availablePoints: number
    earnedPoints: number
    correct: boolean
  }>
  answers: Record<string, string | string[] | null>
  availablePoints: number
  earnedPoints: number
  updateComplete: Promise<unknown>
}

describe('formatReviewAnswer', () => {
  it('formats match answers like the displayed correct answer', () => {
    expect(formatReviewAnswer(
      ['Roots|||Absorb water', 'Leaves|||Make food'],
      questionairePredicates.question.questionType.match.value
    )).toBe('Roots → Absorb water · Leaves → Make food')
  })

  it('keeps ordinary answer values readable', () => {
    expect(formatReviewAnswer(['first', 'second'], 'ordering')).toBe('first · second')
    expect(formatReviewAnswer(null, 'match')).toBe('No answer')
  })

  it('shows a navigable review deck for the completed quiz', async () => {
    const firstQuestion = sym('https://example.test/questions/1#this')
    const secondQuestion = sym('https://example.test/questions/2#this')
    const screen = document.createElement('questionaire-pane-take-final-screen') as FinalScreenElement
    screen.questionnaireTitle = 'Science spark'
    screen.questionSummaries = [
      { question: firstQuestion, title: 'Which planet is known as the Red Planet?', typeUri: '', options: [], correctOptions: [] },
      { question: secondQuestion, title: 'Which planet is closest to the Sun?', typeUri: '', options: [], correctOptions: [] }
    ]
    screen.questionScores = [
      {
        questionUri: firstQuestion.uri,
        questionTypeUri: questionairePredicates.question.questionType.multipleChoice.value,
        availablePoints: 1,
        earnedPoints: 0,
        correct: false
      },
      {
        questionUri: secondQuestion.uri,
        questionTypeUri: questionairePredicates.question.questionType.multipleChoice.value,
        availablePoints: 1,
        earnedPoints: 1,
        correct: true
      }
    ]
    screen.answers = { [firstQuestion.uri]: 'Mercury', [secondQuestion.uri]: 'Mercury' }
    screen.availablePoints = 2
    screen.earnedPoints = 1
    document.body.append(screen)
    await screen.updateComplete

    expect(screen.shadowRoot?.querySelector('.questionaire-pane-take-final-screen-brand strong')?.textContent).toBe('Science spark')
    expect(screen.shadowRoot?.querySelector('.questionaire-pane-take-final-screen-review-card h2')?.textContent)
      .toBe('Which planet is known as the Red Planet?')
    expect(screen.shadowRoot?.querySelectorAll('.questionaire-pane-take-final-screen-deck-item')).toHaveLength(2)
    expect(screen.shadowRoot?.querySelector('.questionaire-pane-take-final-screen-answer-comparison')?.textContent)
      .toContain('Mercury')

    screen.shadowRoot?.querySelector<HTMLButtonElement>('.questionaire-pane-take-final-screen-review-navigation button:last-child')?.click()
    await screen.updateComplete
    expect(screen.shadowRoot?.querySelector('.questionaire-pane-take-final-screen-review-card h2')?.textContent)
      .toBe('Which planet is closest to the Sun?')

    document.body.removeChild(screen)
  })

  it('offers retry and exit actions from the review screen', async () => {
    const question = sym('https://example.test/questions/1#this')
    const screen = document.createElement('questionaire-pane-take-final-screen') as FinalScreenElement
    screen.questionSummaries = [{ question, title: 'Question', typeUri: '', options: [], correctOptions: [] }]
    screen.questionScores = [{
      questionUri: question.uri,
      questionTypeUri: questionairePredicates.question.questionType.multipleChoice.value,
      availablePoints: 1,
      earnedPoints: 0,
      correct: false
    }]
    document.body.append(screen)
    await screen.updateComplete

    const events: string[] = []
    screen.addEventListener('questionaire-take-retry', () => events.push('retry'))
    screen.addEventListener('questionaire-take-cancel', () => events.push('exit'))
    screen.shadowRoot?.querySelector<HTMLButtonElement>('.questionaire-pane-take-final-screen-retry')?.click()
    screen.shadowRoot?.querySelector<HTMLButtonElement>('.questionaire-pane-take-final-screen-exit')?.click()

    expect(events).toEqual(['retry', 'exit'])
    document.body.removeChild(screen)
  })
})
