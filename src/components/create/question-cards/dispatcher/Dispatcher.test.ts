// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { graph, literal, sym } from 'rdflib'
import { quiz } from '../../../../namespaces'
import { questionairePredicates } from '../../../../service/predicates'
import './Dispatcher'

describe('custom question create card', () => {
  it('includes the shared delete control and question reference', async () => {
    const store = graph()
    const subject = sym('https://example.test/quizzes/custom/index.ttl#this')
    const question = sym('https://example.test/quizzes/custom/questions/q1.ttl#this')
    const questionDocument = question.doc()
    store.add(question, questionairePredicates.question.title, literal('Custom prompt'), questionDocument)

    const dispatcher = document.createElement('questionaire-pane-create-question-dispatcher') as HTMLElement & {
      question: typeof question
      questionTypeUri: string
      questionaire: { store: typeof store, subject: typeof subject, acl: null }
      updateComplete: Promise<void>
    }
    dispatcher.questionaire = { store, subject, acl: null }
    dispatcher.question = question
    dispatcher.questionTypeUri = quiz('CustomQuestion').value
    document.body.append(dispatcher)
    await dispatcher.updateComplete

    const base = dispatcher.shadowRoot?.querySelector('questionaire-pane-create-question-base') as HTMLElement & {
      question: typeof question
      updateComplete: Promise<void>
    } | null
    expect(base?.question).toBe(question)
    await base?.updateComplete

    const header = base?.shadowRoot?.querySelector('questionaire-pane-create-question-header') as HTMLElement & {
      updateComplete: Promise<void>
    } | null
    expect(header).toBeTruthy()
    await header?.updateComplete
    expect(header?.shadowRoot?.querySelector('button[aria-label="Delete question"]')).toBeTruthy()
    dispatcher.remove()
  })
})
