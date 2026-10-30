// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { html, render } from 'lit'
import './QuestionairePaneFormattedTextEditor'
import { applyTextFormat } from './questionaire-pane-formatting'

describe('questionaire text formatting', () => {
  it('does not replace editable contents when input updates the value', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    render(html`<questionaire-pane-formatted-text-editor .value=${'abc'}></questionaire-pane-formatted-text-editor>`, container)
    const editor = container.firstElementChild as HTMLElement
    await (editor as HTMLElement & { updateComplete: Promise<void> }).updateComplete
    const editable = editor.querySelector('[contenteditable="true"]') as HTMLElement
    editable.textContent = 'abcd'
    const editableTextNode = editable.firstChild

    ;(editor as HTMLElement & { value: string }).value = 'abcd'
    await (editor as HTMLElement & { updateComplete: Promise<void> }).updateComplete

    expect(editable.textContent).toBe('abcd')
    expect(editable.firstChild).toBe(editableTextNode)
    container.remove()
  })

  it('wraps the selected text with the explicit subscript representation', () => {
    expect(applyTextFormat('H2O', 1, 2, 'subscript')).toEqual({
      value: 'H[[sub:2]]O',
      start: 7,
      end: 8
    })
  })

  it('wraps superscript selections and toggles the same selection off', () => {
    const formatted = applyTextFormat('x2', 1, 2, 'superscript')
    expect(formatted.value).toBe('x[[sup:2]]')
    expect(applyTextFormat(formatted.value, formatted.start, formatted.end, 'superscript')).toEqual({
      value: 'x2',
      start: 1,
      end: 2
    })
  })

  it('does not change the value when there is no selection', () => {
    expect(applyTextFormat('plain', 2, 2, 'subscript')).toEqual({
      value: 'plain',
      start: 2,
      end: 2
    })
  })
})
