import { describe, expect, it } from 'vitest'
import { graph, literal, sym, type LiveStore } from 'rdflib'
import { questionairePredicates } from './predicates'
import { readQuestionGradingCriteria, readQuestionValue, readQuestionValues } from './questionAccessors'

describe('question accessors', () => {
  it('reads a scalar question value from the question document', () => {
    const store = graph()
    const question = sym('https://example.test/questions/one')
    store.add(question, questionairePredicates.question.title, literal('What is RDF?'), question.doc())

    const liveStore = store as LiveStore
    expect(readQuestionValue(liveStore, question, 'title')).toBe('What is RDF?')
    expect(readQuestionValue(liveStore, question, 'description')).toBe('')
  })

  it('reads linked answer resources in document order', () => {
    const store = graph()
    const question = sym('https://example.test/questions/one')
    const firstAnswer = sym(`${question.uri}#answer-1`)
    const secondAnswer = sym(`${question.uri}#answer-2`)

    store.add(question, questionairePredicates.question.answer, firstAnswer, question.doc())
    store.add(question, questionairePredicates.question.answer, secondAnswer, question.doc())
    store.add(firstAnswer, questionairePredicates.question.answerText, literal('First'), question.doc())
    store.add(secondAnswer, questionairePredicates.question.answerText, literal('Second'), question.doc())

    const liveStore = store as LiveStore
    expect(readQuestionValues(liveStore, question, 'answer')).toEqual(['First', 'Second'])
    expect(readQuestionValue(liveStore, question, 'answer')).toBe('First')
  })

  it('reads weighted criterion resources in position order', () => {
    const store = graph()
    const question = sym('https://example.test/questions/one#this')
    const first = sym('https://example.test/questions/one#criterion-a')
    const second = sym('https://example.test/questions/one#criterion-b')
    const predicate = questionairePredicates.question
    store.add(question, predicate.gradingCriterion, second, question.doc())
    store.add(question, predicate.gradingCriterion, first, question.doc())
    store.add(first, predicate.criterionText, literal('mentions sunlight'), question.doc())
    store.add(first, predicate.criterionPoints, literal('2'), question.doc())
    store.add(first, predicate.position, literal('1'), question.doc())
    store.add(second, predicate.criterionText, literal('explains food production'), question.doc())
    store.add(second, predicate.criterionPoints, literal('1'), question.doc())
    store.add(second, predicate.position, literal('2'), question.doc())

    expect(readQuestionGradingCriteria(store as LiveStore, question)).toEqual([
      { criterion: 'mentions sunlight', points: 2 },
      { criterion: 'explains food production', points: 1 }
    ])
  })

  it('treats legacy literal criteria as equal one-point rubric entries', () => {
    const store = graph()
    const question = sym('https://example.test/questions/legacy')
    store.add(question, questionairePredicates.question.gradingCriteria, literal('mentions sunlight'), question.doc())

    expect(readQuestionGradingCriteria(store as LiveStore, question)).toEqual([
      { criterion: 'mentions sunlight', points: 1 }
    ])
    expect(readQuestionValues(store as LiveStore, question, 'gradingCriteria')).toEqual(['mentions sunlight'])
  })
})