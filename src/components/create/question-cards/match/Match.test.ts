// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { graph, literal, sym } from 'rdflib'
import { questionairePredicates } from '../../../../service/predicates'
import './Match'

describe('match create card', () => {
  it('offers the shared question image uploader', async () => {
    const store = graph()
    const subject = sym('https://example.test/quizzes/match/index.ttl#this')
    const question = sym('https://example.test/quizzes/match/questions/q1.ttl#this')
    const questionDocument = question.doc()
    store.add(question, questionairePredicates.question.title, literal('Match the pairs'), questionDocument)

    const element = document.createElement('questionaire-pane-create-question-match') as HTMLElement & {
      question: typeof question
      questionaire: { store: typeof store, subject: typeof subject, acl: null }
      updateComplete: Promise<void>
    }
    element.questionaire = { store, subject, acl: null }
    element.question = question
    document.body.append(element)
    await element.updateComplete

    expect(element.shadowRoot?.querySelector('questionaire-pane-create-question-image-upload')).toBeTruthy()
    expect(element.shadowRoot?.querySelector('.questionaire-pane-create-question-match-pair-remove')).toBeTruthy()
    element.remove()
  })
})
