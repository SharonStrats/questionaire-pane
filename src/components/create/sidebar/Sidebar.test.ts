// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'
import { sym } from 'rdflib'
import Sidebar from './Sidebar'

describe('questionnaire creator mobile question selector', () => {
  it('dispatches the selected question URI', async () => {
    const firstQuestion = sym('https://example.test/quiz/questions/1')
    const secondQuestion = sym('https://example.test/quiz/questions/2')
    const sidebar = new Sidebar()
    sidebar.questions = [
      { question: firstQuestion, title: 'First question', typeUri: 'https://example.test/types/selection' },
      { question: secondQuestion, title: 'Second question', typeUri: 'https://example.test/types/short-answer' }
    ]
    sidebar.selectedQuestionUri = firstQuestion.uri
    document.body.append(sidebar)
    await sidebar.updateComplete

    const select = sidebar.shadowRoot?.querySelector<HTMLSelectElement>('select[aria-label="Choose a question"]')
    expect(select?.options).toHaveLength(2)
    expect(select?.value).toBe(firstQuestion.uri)

    const onSelection = vi.fn()
    sidebar.addEventListener('questionaire-question-selected', onSelection)
    select!.value = secondQuestion.uri
    select!.dispatchEvent(new Event('change', { bubbles: true }))

    expect(onSelection).toHaveBeenCalledOnce()
    expect(onSelection.mock.calls[0][0]).toMatchObject({
      detail: { questionUri: secondQuestion.uri }
    })
    sidebar.remove()
  })
})
