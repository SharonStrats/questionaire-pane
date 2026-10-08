import { html } from 'lit'
import { property } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import styles from './QuestionairePaneCreateQuestionHeader.styles.css'
import '~icons/lucide/trash-2'

@customElement('questionaire-pane-create-question-header')
export default class QuestionairePaneCreateQuestionHeader extends WebComponent {
  static styles = styles

  @property({ type: Number, attribute: 'question-number' })
  accessor questionNumber = 1

  @property({ type: String, attribute: 'question-type-label' })
  accessor questionTypeLabel = 'Question'

  private handleDeleteClick () {
    this.dispatchEvent(new CustomEvent('questionaire-question-header-delete', {
      bubbles: true,
      composed: true
    }))
  }

  render() {
    return html`
      <header class="questionaire-pane-create-question-header">
        <div class="questionaire-pane-create-question-header-copy">
          <div class="questionaire-pane-create-question-header-badge-row">
            <span class="questionaire-pane-create-question-header-index">${this.questionNumber}</span>
            <span class="questionaire-pane-create-question-header-pill">${this.questionTypeLabel}</span>
          </div>
          <p class="questionaire-pane-create-question-header-title">Question card</p>
        </div>
        <div class="questionaire-pane-create-question-header-actions">
          <button class="questionaire-pane-create-question-header-delete" type="button" aria-label="Delete question" @click=${() => this.handleDeleteClick()}>
            <icon-lucide-trash-2></icon-lucide-trash-2>
          </button>
        </div>
      </header>
    `
  }
}
