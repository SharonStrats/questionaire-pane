import { html } from 'lit'
import { property } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import { applyTextFormat, type TextFormat } from './questionaire-pane-formatting'

function escapeHtml (value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function valueToHtml (value: string) {
  let result = ''
  let cursor = 0
  const pattern = /\[\[(sub|sup):(.*?)\]\]/gs
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0
    result += escapeHtml(value.slice(cursor, index)).replace(/\n/g, '<br>')
    const tag = match[1] === 'sub' ? 'sub' : 'sup'
    result += `<${tag}>${escapeHtml(match[2] ?? '')}</${tag}>`
    cursor = index + match[0].length
  }
  return result + escapeHtml(value.slice(cursor)).replace(/\n/g, '<br>')
}

function htmlToValue (root: Node): string {
  let result = ''
  for (const node of Array.from(root.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent ?? ''
    } else if (node.nodeName === 'BR') {
      result += '\n'
    } else if (node.nodeName === 'SUB' || node.nodeName === 'SUP') {
      const tag = node.nodeName === 'SUB' ? 'sub' : 'sup'
      result += `[[${tag}:${htmlToValue(node)}]]`
    } else {
      result += htmlToValue(node)
    }
  }
  return result
}

@customElement('questionaire-pane-formatted-text-editor')
export default class QuestionairePaneFormattedTextEditor extends WebComponent {
  @property({ type: String })
  accessor value = ''

  @property({ type: String })
  accessor placeholder = ''

  @property({ type: Boolean, attribute: 'single-line' })
  accessor singleLine = false

  private activeFormat: TextFormat | null = null

  createRenderRoot () {
    return this
  }

  private get editable () {
    return this.querySelector<HTMLElement>('[contenteditable="true"]')
  }

  private handleInput () {
    const editable = this.editable
    if (!editable) return
    this.value = htmlToValue(editable)
    this.dispatchEvent(new CustomEvent('questionaire-formatted-text-input', {
      bubbles: true,
      composed: true,
      detail: { value: this.value }
    }))
  }

  private handleBeforeInput (event: InputEvent) {
    if (this.activeFormat !== null && event.inputType === 'insertText' && event.data) {
      event.preventDefault()
      this.insertTextAtSelection(event.data, this.activeFormat)
    }
  }

  private handleKeyDown (event: KeyboardEvent) {
    if (this.singleLine && event.key === 'Enter') {
      event.preventDefault()
    }
  }

  protected updated (changedProperties: Map<PropertyKey, unknown>) {
    if (!changedProperties.has('value')) return
    const editable = this.editable
    if (!editable || htmlToValue(editable) === this.value) return
    editable.innerHTML = valueToHtml(this.value)
  }

  formatSelection (format: TextFormat) {
    const editable = this.editable
    const selection = editable?.ownerDocument.getSelection()
    if (!editable || !selection || selection.rangeCount === 0 || !selection.toString()) return

    const selected = selection.toString()
    const start = this.value.indexOf(selected)
    if (start < 0) return
    const result = applyTextFormat(this.value, start, start + selected.length, format)
    this.value = result.value
    this.requestUpdate()
    void this.updateComplete.then(() => {
      const nextEditable = this.editable
      if (!nextEditable) return
      nextEditable.focus()
      const range = nextEditable.ownerDocument.createRange()
      const walker = nextEditable.ownerDocument.createTreeWalker(nextEditable, NodeFilter.SHOW_TEXT)
      let offset = 0
      let startNode: Text | null = null
      let endNode: Text | null = null
      let startOffset = 0
      let endOffset = 0
      let node: Text | null
      while ((node = walker.nextNode() as Text | null)) {
        const nextOffset = offset + node.data.length
        if (!startNode && result.start >= offset && result.start <= nextOffset) {
          startNode = node
          startOffset = result.start - offset
        }
        if (result.end >= offset && result.end <= nextOffset) {
          endNode = node
          endOffset = result.end - offset
          break
        }
        offset = nextOffset
      }
      if (startNode && endNode) {
        range.setStart(startNode, startOffset)
        range.setEnd(endNode, endOffset)
        selection.removeAllRanges()
        selection.addRange(range)
      }
      this.dispatchEvent(new CustomEvent('questionaire-formatted-text-input', {
        bubbles: true,
        composed: true,
        detail: { value: this.value }
      }))
    })
  }

  toggleFormat (format: TextFormat) {
    const editable = this.editable
    const selection = editable?.ownerDocument.getSelection()
    if (selection && selection.rangeCount > 0 && selection.toString()) {
      this.formatSelection(format)
      this.activeFormat = null
      return
    }
    this.activeFormat = this.activeFormat === format ? null : format
    this.dispatchEvent(new CustomEvent('questionaire-format-changed', {
      bubbles: true,
      composed: true,
      detail: { format: this.activeFormat }
    }))
  }

  isFormatActive (format: TextFormat) {
    return this.activeFormat === format
  }

  insertTextAtSelection (text: string, format: TextFormat | null = null) {
    const editable = this.editable
    const selection = editable?.ownerDocument.getSelection()
    if (!editable || !selection) return

    let range: Range
    if (selection.rangeCount > 0 && editable.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      range = selection.getRangeAt(0)
    } else {
      range = editable.ownerDocument.createRange()
      range.selectNodeContents(editable)
      range.collapse(false)
    }

    range.deleteContents()
    const inserted = format === null
      ? editable.ownerDocument.createTextNode(text)
      : (() => {
          const element = editable.ownerDocument.createElement(format === 'subscript' ? 'sub' : 'sup')
          element.textContent = text
          return element
        })()
    range.insertNode(inserted)
    range.setStartAfter(inserted)
    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    this.handleInput()
  }

  render () {
    return html`
      <div
        contenteditable="true"
        role="textbox"
        aria-multiline=${String(!this.singleLine)}
        data-placeholder=${this.placeholder}
        class=${this.singleLine ? 'single-line' : ''}
        style=${this.singleLine
          ? 'display:block;width:100%;min-height:0;box-sizing:border-box;outline:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
          : 'display:block;width:100%;min-height:96px;box-sizing:border-box;outline:none;white-space:pre-wrap;overflow-wrap:anywhere;'}
        @input=${this.handleInput}
        @beforeinput=${this.handleBeforeInput}
        @keydown=${this.handleKeyDown}
      ></div>
    `
  }
}
