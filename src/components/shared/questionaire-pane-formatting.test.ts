// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { html, render } from 'lit'
import './QuestionairePaneFormattedTextEditor'
import { applyTextFormat, renderFormattedText } from './questionaire-pane-formatting'

describe('questionaire text formatting', () => {
  it('supports a compact single-line mode', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    render(html`<questionaire-pane-formatted-text-editor single-line></questionaire-pane-formatted-text-editor>`, container)
    const editor = container.firstElementChild as HTMLElement & { updateComplete: Promise<void> }
    await editor.updateComplete

    const editable = editor.querySelector('[contenteditable="true"]') as HTMLElement
    expect(editable.getAttribute('aria-multiline')).toBe('false')
    expect(editable.classList.contains('single-line')).toBe(true)
    expect(editable.getAttribute('style')).toContain('min-height: 0')

    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    editable.dispatchEvent(enter)
    expect(enter.defaultPrevented).toBe(true)
    container.remove()
  })

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

  it('inserts text at the active editor selection', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    render(html`<questionaire-pane-formatted-text-editor .value=${'Before after'}></questionaire-pane-formatted-text-editor>`, container)
    const editor = container.firstElementChild as HTMLElement & {
      insertTextAtSelection: (text: string) => void
      updateComplete: Promise<void>
      value: string
    }
    await editor.updateComplete
    const editable = editor.querySelector('[contenteditable="true"]')!
    const text = editable.firstChild!
    const selection = document.getSelection()!
    const range = document.createRange()
    range.setStart(text, 'Before '.length)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)

    editor.insertTextAtSelection('[____]')

    expect(editor.value).toBe('Before [____]after')
    expect(editable.textContent).toBe('Before [____]after')
    container.remove()
  })

  it('formats the selected DOM text and keeps the formatted value', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    render(html`<questionaire-pane-formatted-text-editor .value=${'H2O'}></questionaire-pane-formatted-text-editor>`, container)
    const editor = container.firstElementChild as HTMLElement & {
      formatSelection: (format: 'subscript' | 'superscript') => void
      updateComplete: Promise<void>
      value: string
    }
    await editor.updateComplete
    const text = editor.querySelector('[contenteditable="true"]')!.firstChild!
    const selection = document.getSelection()!
    const range = document.createRange()
    range.setStart(text, 1)
    range.setEnd(text, 2)
    selection.removeAllRanges()
    selection.addRange(range)

    editor.formatSelection('subscript')
    await editor.updateComplete

    expect(editor.value).toBe('H[[sub:2]]O')
    expect(editor.querySelector('sub')?.textContent).toBe('2')
    container.remove()
  })

  it('removes formatting when the same selected formatted text is toggled again', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    render(html`<questionaire-pane-formatted-text-editor .value=${'H[[sub:2]]O'}></questionaire-pane-formatted-text-editor>`, container)
    const editor = container.firstElementChild as HTMLElement & {
      formatSelection: (format: 'subscript' | 'superscript') => void
      updateComplete: Promise<void>
      value: string
    }
    await editor.updateComplete
    const text = editor.querySelector('sub')!.firstChild!
    const selection = document.getSelection()!
    const range = document.createRange()
    range.selectNodeContents(text)
    selection.removeAllRanges()
    selection.addRange(range)

    editor.formatSelection('subscript')
    await editor.updateComplete

    expect(editor.value).toBe('H2O')
    expect(editor.querySelector('sub')).toBeNull()
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

    it('renders persisted formatting as semantic subscript and superscript elements', () => {
      const container = document.createElement('div')
      document.body.append(container)
      render(html`${renderFormattedText('H[[sub:2]]O and x[[sup:2]]')}`, container)

      expect(container.querySelector('sub')?.textContent).toBe('2')
      expect(container.querySelector('sup')?.textContent).toBe('2')
      container.remove()
    })

    it('round-trips persisted markup through the editor serialization', async () => {
      const container = document.createElement('div')
      document.body.append(container)
      render(html`<questionaire-pane-formatted-text-editor .value=${'H[[sub:2]]O'}></questionaire-pane-formatted-text-editor>`, container)
      const editor = container.firstElementChild as HTMLElement & {
        updateComplete: Promise<void>
        value: string
      }
      await editor.updateComplete
      const editable = editor.querySelector('[contenteditable="true"]') as HTMLElement
      expect(editable.querySelector('sub')?.textContent).toBe('2')
      editable.dispatchEvent(new Event('input', { bubbles: true }))
      expect(editor.value).toBe('H[[sub:2]]O')
      container.remove()
    })
  })

  it('uses the active format for subsequently typed characters and switches modes', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    render(html`<questionaire-pane-formatted-text-editor .value=${''}></questionaire-pane-formatted-text-editor>`, container)
    const editor = container.firstElementChild as HTMLElement & {
      toggleFormat: (format: 'subscript' | 'superscript') => void
      isFormatActive: (format: 'subscript' | 'superscript') => boolean
      updateComplete: Promise<void>
      value: string
    }
    await editor.updateComplete
    const editable = editor.querySelector('[contenteditable="true"]') as HTMLElement
    editable.focus()
    editor.toggleFormat('subscript')
    expect(editor.isFormatActive('subscript')).toBe(true)
    expect(editor.isFormatActive('superscript')).toBe(false)

    editable.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      inputType: 'insertText',
      data: '2',
      cancelable: true
    }))
    expect(editor.value).toBe('[[sub:2]]')
    expect(editable.querySelector('sub')?.textContent).toBe('2')

    editor.toggleFormat('superscript')
    expect(editor.isFormatActive('subscript')).toBe(false)
    expect(editor.isFormatActive('superscript')).toBe(true)
    editor.toggleFormat('superscript')
    expect(editor.isFormatActive('superscript')).toBe(false)
    container.remove()
  })
})
