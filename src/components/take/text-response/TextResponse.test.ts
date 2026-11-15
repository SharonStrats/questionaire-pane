// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { graph, literal, sym } from 'rdflib'
import { questionairePredicates } from '../../../service/predicates'
import './TextResponse'

describe('questionnaire fill-in-the-blank taker rendering', () => {
  it('renders formatted answers as semantic subscript and superscript elements', async () => {
    const store = graph()
    const question = sym('https://example.test/questions/one')
    const answer = sym('https://example.test/questions/one#answer-0')
    const questionDocument = question.doc()
    store.add(question, questionairePredicates.question.title, literal('Water [____]'), questionDocument)
    store.add(question, questionairePredicates.question.answer, answer, questionDocument)
    store.add(answer, questionairePredicates.question.answerText, literal('H[[sub:2]]O and x[[sup:2]]'), questionDocument)

    const container = document.createElement('div')
    const element = document.createElement('questionaire-pane-take-question-text-response') as HTMLElement & {
      question: typeof question
      answer: string[]
      questionaire: { store: typeof store, subject: typeof question, acl: null }
      questionTypeLabel: string
      updateComplete: Promise<void>
    }
    element.questionaire = { store, subject: question, acl: null }
    element.question = question
    element.answer = ['H[[sub:2]]O and x[[sup:2]]']
    element.questionTypeLabel = 'Fill in the Blank'
    container.append(element)
    document.body.append(container)
    await element.updateComplete

    const root = element.shadowRoot ?? element
    const editor = root.querySelector('questionaire-pane-formatted-text-editor') as HTMLElement & {
      updateComplete: Promise<void>
    }
    expect(editor).toBeTruthy()
    await editor.updateComplete
    expect(editor.querySelector('sub')?.textContent).toBe('2')
    expect(editor.querySelector('sup')?.textContent).toBe('2')
    container.remove()
  })
})
