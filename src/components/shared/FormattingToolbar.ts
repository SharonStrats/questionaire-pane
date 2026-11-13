import { html } from 'lit'
import { customElement, WebComponent } from 'solid-ui'
import styles from './FormattingToolbar.styles.css'
import { applyTextFormat, type TextFormat } from './formatting'
import './FormattedTextEditor'

@customElement('questionaire-pane-formatting-toolbar')
export default class FormattingToolbar extends WebComponent {
  static styles = styles

  private format (format: TextFormat) {
    const editor = this.parentElement?.querySelector<HTMLElement>('questionaire-pane-formatted-text-editor') as
      | (HTMLElement & { toggleFormat?: (value: TextFormat) => void; isFormatActive?: (value: TextFormat) => boolean })
      | null
    if (editor?.toggleFormat) {
      editor.toggleFormat?.(format)
      return
    }
    const target = this.parentElement?.querySelector<HTMLTextAreaElement>('textarea, input')
    if (!target || target.selectionStart === target.selectionEnd) return
    const result = applyTextFormat(target.value, target.selectionStart, target.selectionEnd, format)
    target.value = result.value
    target.focus()
    target.setSelectionRange(result.start, result.end)
    target.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, inputType: 'formatText' }))
  }

  render () {
    return html`
      <div class="questionaire-pane-formatting-toolbar" role="toolbar" aria-label="Text formatting" @questionaire-format-changed=${() => this.requestUpdate()}>
        <span class="questionaire-pane-formatting-toolbar-label">Format selection:</span>
        <button type="button" aria-label="Subscript" title="Subscript" aria-pressed=${this.editor?.isFormatActive?.('subscript') ?? false} @mousedown=${(event: MouseEvent) => event.preventDefault()} @click=${() => this.format('subscript')}>x<sub>2</sub></button>
        <button type="button" aria-label="Superscript" title="Superscript" aria-pressed=${this.editor?.isFormatActive?.('superscript') ?? false} @mousedown=${(event: MouseEvent) => event.preventDefault()} @click=${() => this.format('superscript')}>x<sup>2</sup></button>
      </div>
    `
  }

  private get editor () {
    return this.parentElement?.querySelector<HTMLElement & { isFormatActive?: (value: TextFormat) => boolean }>('questionaire-pane-formatted-text-editor')
  }
}
