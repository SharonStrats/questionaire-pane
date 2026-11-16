// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'
import { graph, literal, sym, type Statement } from 'rdflib'
import { questionairePredicates } from '../../../../service/predicates'
import './ShortAnswer'

async function renderShortAnswer (
  answers: string[] = [],
  criteria: Array<{ criterion: string, points: number }> = []
) {
  const store = graph()
  const questionnaire = sym('https://example.test/quiz/index.ttl')
  const question = sym('https://example.test/quiz/draft/questions/q1.ttl')
  const questionDocument = question.doc()

  store.add(questionnaire, questionairePredicates.question.rdfType, questionairePredicates.questionnaire.quizType, questionnaire.doc())
  store.add(question, questionairePredicates.question.title, literal('What is two plus two?'), questionDocument)
  for (const [index, answer] of answers.entries()) {
    const answerResource = sym(`${question.uri}#answer-${index}`)
    store.add(question, questionairePredicates.question.answer, answerResource, questionDocument)
    store.add(answerResource, questionairePredicates.question.answerText, literal(answer), questionDocument)
  }
  for (const [index, criterion] of criteria.entries()) {
    const resource = sym(`${questionDocument.uri}#grading-criterion-question-${index + 1}`)
    store.add(question, questionairePredicates.question.gradingCriterion, resource, questionDocument)
    store.add(resource, questionairePredicates.question.criterionText, literal(criterion.criterion), questionDocument)
    store.add(resource, questionairePredicates.question.criterionPoints, literal(String(criterion.points)), questionDocument)
    store.add(resource, questionairePredicates.question.position, literal(String(index + 1)), questionDocument)
  }

  const element = globalThis.document.createElement('questionaire-pane-create-question-short-answer') as HTMLElement & {
    question: typeof question
    questionaire: { store: typeof store, subject: typeof questionnaire, acl: null }
    updateComplete: Promise<void>
  }
  element.questionaire = { store, subject: questionnaire, acl: null }
  element.question = question
  document.body.append(element)
  await element.updateComplete

  return { element, store, question }
}

describe('short-answer accepted answer editor', () => {
  it('adds and removes accepted answer rows', async () => {
    const { element } = await renderShortAnswer(['4'])
      const root = element.shadowRoot ?? element

      expect(root.querySelectorAll('input[placeholder="Enter an accepted answer..."]')).toHaveLength(1)

      const addButton = root.querySelector<HTMLButtonElement>('.questionaire-pane-create-question-short-answer-add-answer')
      addButton?.click()
      await element.updateComplete
      expect(root.querySelectorAll('input[placeholder="Enter an accepted answer..."]')).toHaveLength(2)

      const removeButton = root.querySelector<HTMLButtonElement>('[aria-label="Remove accepted answer"]')
      removeButton?.click()
      await element.updateComplete
      expect(root.querySelectorAll('input[placeholder="Enter an accepted answer..."]')).toHaveLength(1)

    element.remove()
  })

  it('passes edited accepted answers through the save mutation path', async () => {
    const { element, store, question } = await renderShortAnswer(['4'])
    const root = element.shadowRoot ?? element
    const update = vi.fn(async () => {})
    ;(store as unknown as { fetcher: unknown }).fetcher = { load: vi.fn(async () => {}) }
    ;(store as unknown as { updater: unknown }).updater = { update }

    const addButton = root.querySelector<HTMLButtonElement>('.questionaire-pane-create-question-short-answer-add-answer')
    addButton?.click()
    await element.updateComplete

    const answerInputs = root.querySelectorAll<HTMLInputElement>('input[placeholder="Enter an accepted answer..."]')
    answerInputs[0].value = ' four '
    answerInputs[0].dispatchEvent(new Event('input', { bubbles: true }))
    answerInputs[1].value = '4'
    answerInputs[1].dispatchEvent(new Event('input', { bubbles: true }))
    await element.updateComplete

    const footer = root.querySelector('questionaire-pane-create-question-footer')
    footer?.dispatchEvent(new CustomEvent('questionaire-question-footer-save', { bubbles: true }))
    await vi.waitFor(() => expect(update).toHaveBeenCalled())

    const answerUpdate = update.mock.calls
      .map((call) => (call as unknown as [unknown, Array<{ subject: { value: string }, predicate: { value: string }, object: { value: string } }>])[1])
      .find((statements) => statements.some((statement) =>
        statement.subject.value !== question.uri &&
        statement.predicate.value === questionairePredicates.question.answerText.value
      ))
    expect(answerUpdate?.filter((statement) =>
      statement.subject.value !== question.uri &&
      statement.predicate.value === questionairePredicates.question.answerText.value
    ).map((statement) => statement.object.value)).toEqual(['four', '4'])

    element.remove()
  })

  it('edits weighted criteria and saves criterion resources', async () => {
    const { element, store, question } = await renderShortAnswer([], [
      { criterion: 'mentions sunlight', points: 2 }
    ])
    const root = element.shadowRoot ?? element
    const update = vi.fn(async (_deleted: Statement[], _inserted: Statement[]) => {})
    ;(store as unknown as { fetcher: unknown }).fetcher = { load: vi.fn(async () => {}) }
    ;(store as unknown as { updater: unknown }).updater = { update }

    const criterion = root.querySelector<HTMLInputElement>('input[placeholder="What should a correct answer include?"]')
    const points = root.querySelector<HTMLInputElement>('[aria-label="Criterion 1 weight in points"]')
    expect(criterion?.value).toBe('mentions sunlight')
    expect(points?.value).toBe('2')
    if (!criterion || !points) throw new Error('Expected the weighted grading criterion inputs.')
    criterion.value = 'mentions sunlight and chlorophyll'
    criterion.dispatchEvent(new Event('input', { bubbles: true }))
    points.value = '3'
    points.dispatchEvent(new Event('change', { bubbles: true }))
    await element.updateComplete

    const footer = root.querySelector('questionaire-pane-create-question-footer')
    footer?.dispatchEvent(new CustomEvent('questionaire-question-footer-save', { bubbles: true }))
    await vi.waitFor(() => expect(update).toHaveBeenCalled())

    const savedCriteria = update.mock.calls
      .flatMap(([, inserted]) => inserted)
      .filter(statement => statement.predicate.value === questionairePredicates.question.criterionPoints.value)
    expect(savedCriteria.map(statement => statement.object.value)).toEqual(['3'])
    expect(update.mock.calls.flatMap(([, inserted]) => inserted).some(statement =>
      statement.subject.value === question.uri &&
      statement.predicate.value === questionairePredicates.question.gradingCriterion.value
    )).toBe(true)

    element.remove()
  })
})
