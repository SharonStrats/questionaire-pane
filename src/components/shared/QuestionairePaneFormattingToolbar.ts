import { html } from 'lit'
import { customElement, WebComponent } from 'solid-ui'
import styles from './QuestionairePaneFormattingToolbar.styles.css'
import { applyTextFormat, type TextFormat } from './questionaire-pane-formatting'

@customElement('questionaire-pane-formatting-toolbar')
export default class QuestionairePaneFormattingToolbar extends WebComponent {
  static styles = styles

  private format (format: TextFormat) {
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
      <div class="questionaire-pane-formatting-toolbar" role="toolbar" aria-label="Text formatting">
        <span class="questionaire-pane-formatting-toolbar-label">Format selection:</span>
        <button type="button" aria-label="Subscript" title="Subscript" @click=${() => this.format('subscript')}>x<sub>2</sub></button>
        <button type="button" aria-label="Superscript" title="Superscript" @click=${() => this.format('superscript')}>x<sup>2</sup></button>
      </div>
    `
  }
}
