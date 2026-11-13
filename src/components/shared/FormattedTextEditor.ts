import { html } from 'lit'
import { property } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import styles from './FormattedTextEditor.styles.css'
import { applyTextFormat, type TextFormat } from './formatting'

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

function valueToDisplayOffset (value: string, valueOffset: number) {
  let displayOffset = 0
  let cursor = 0
  const pattern = /\[\[(sub|sup):([\s\S]*?)\]\]/g
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0
    if (valueOffset <= index) return displayOffset + Math.max(0, valueOffset - cursor)
    displayOffset += index - cursor
    const content = match[2] ?? ''
    const contentStart = index + 6
    if (valueOffset <= contentStart + content.length) {
      return displayOffset + Math.max(0, valueOffset - contentStart)
    }
    displayOffset += content.length
    cursor = index + match[0].length
  }
  return displayOffset + Math.max(0, valueOffset - cursor)
}

function displayToValueOffset (value: string, displayOffset: number) {
  let visibleOffset = 0
  let cursor = 0
  const pattern = /\[\[(sub|sup):([\s\S]*?)\]\]/g
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0
    const plainLength = index - cursor
    if (displayOffset < visibleOffset + plainLength) {
      return cursor + Math.max(0, displayOffset - visibleOffset)
    }
    visibleOffset += plainLength
    const content = match[2] ?? ''
    const contentStart = index + 6
    if (displayOffset <= visibleOffset + content.length) {
      return contentStart + Math.max(0, displayOffset - visibleOffset)
    }
    visibleOffset += content.length
    cursor = index + match[0].length
  }
  return cursor + Math.max(0, displayOffset - visibleOffset)
}

function textOffset (root: Node, target: Node, targetOffset: number) {
  const document = root.ownerDocument
  if (!document) return 0
  const range = document.createRange()
  range.setStart(root, 0)
  range.setEnd(target, targetOffset)
  return range.toString().length
}

function textNodeAtOffset (root: Node, targetOffset: number) {
  const walker = root.ownerDocument?.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  if (!walker) return null
  let offset = 0
  let node: Text | null
  while ((node = walker.nextNode() as Text | null)) {
    if (targetOffset <= offset + node.data.length) {
      return { node, offset: targetOffset - offset }
    }
    offset += node.data.length
  }
  return null
}

@customElement('questionaire-pane-formatted-text-editor')
export default class FormattedTextEditor extends WebComponent {
  static styles = styles

  @property({ type: String })
  accessor value = ''

  @property({ type: String })
  accessor placeholder = ''

  @property({ type: Boolean, attribute: 'single-line' })
  accessor singleLine = false

  private activeFormat: TextFormat | null = null
  private savedSelection: Range | null = null

  createRenderRoot () {
    return this
  }

  connectedCallback () {
    super.connectedCallback()
    this.ownerDocument.addEventListener('selectionchange', this.rememberSelection)
  }

  disconnectedCallback () {
    this.ownerDocument.removeEventListener('selectionchange', this.rememberSelection)
    super.disconnectedCallback()
  }

  private get editable () {
    return this.querySelector<HTMLElement>('[contenteditable="true"]')
  }

  private rememberSelection = () => {
    const editable = this.editable
    const selection = this.ownerDocument.getSelection()
    if (!editable || !selection || selection.rangeCount === 0) return
    const range = selection.getRangeAt(0)
    if (editable.contains(range.commonAncestorContainer)) {
      this.savedSelection = range.cloneRange()
    }
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

    const range = selection.getRangeAt(0)
    if (!editable.contains(range.commonAncestorContainer)) return
    const displayStart = textOffset(editable, range.startContainer, range.startOffset)
    const displayEnd = textOffset(editable, range.endContainer, range.endOffset)
    const start = displayToValueOffset(this.value, displayStart)
    const end = displayToValueOffset(this.value, displayEnd)
    const result = applyTextFormat(this.value, start, end, format)
    this.value = result.value
    this.requestUpdate()
    void this.updateComplete.then(() => {
      const nextEditable = this.editable
      if (!nextEditable) return
      nextEditable.focus()
      const range = nextEditable.ownerDocument.createRange()
      const startPoint = textNodeAtOffset(nextEditable, valueToDisplayOffset(this.value, result.start))
      const endPoint = textNodeAtOffset(nextEditable, valueToDisplayOffset(this.value, result.end))
      if (startPoint && endPoint) {
        range.setStart(startPoint.node, startPoint.offset)
        range.setEnd(endPoint.node, endPoint.offset)
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
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null
    if (editable && selection && range && editable.contains(range.commonAncestorContainer) && selection.toString()) {
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
    } else if (this.savedSelection && editable.contains(this.savedSelection.commonAncestorContainer)) {
      range = this.savedSelection.cloneRange()
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
    this.savedSelection = range.cloneRange()
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
        @input=${this.handleInput}
        @beforeinput=${this.handleBeforeInput}
        @keydown=${this.handleKeyDown}
      ></div>
    `
  }
}
