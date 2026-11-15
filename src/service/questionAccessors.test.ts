import { describe, expect, it } from 'vitest'
import { graph, literal, sym, type LiveStore } from 'rdflib'
import { questionairePredicates } from './predicates'
import { readQuestionValue, readQuestionValues } from './questionAccessors'

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
})