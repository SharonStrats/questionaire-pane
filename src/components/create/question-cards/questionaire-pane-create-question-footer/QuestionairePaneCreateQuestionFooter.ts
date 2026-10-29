import { html } from 'lit'
import { property } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import styles from './QuestionairePaneCreateQuestionFooter.styles.css'
import '~icons/lucide/check'
import '~icons/lucide/star'

@customElement('questionaire-pane-create-question-footer')
export default class QuestionairePaneCreateQuestionFooter extends WebComponent {
  static styles = styles

  @property({ type: String })
  accessor points = '1'

  @property({ type: String, attribute: 'status-label' })
  accessor statusLabel = 'Saved'

  @property({ type: String, attribute: 'save-label' })
  accessor saveLabel = 'Save question'

  @property({ type: Boolean, attribute: 'save-disabled' })
  accessor saveDisabled = false

  @property({ type: Boolean, attribute: 'cancel-disabled' })
  accessor cancelDisabled = false

  private handlePointsInput (event: Event) {
    this.dispatchEvent(new CustomEvent('questionaire-question-footer-points-changed', {
      bubbles: true,
      composed: true,
      detail: { points: (event.currentTarget as HTMLInputElement).value }
    }))
  }

  private handleSaveClick () {
    this.dispatchEvent(new CustomEvent('questionaire-question-footer-save', {
      bubbles: true,
      composed: true
    }))
  }

  private handleCancelClick () {
    this.dispatchEvent(new CustomEvent('questionaire-question-footer-cancel', {
      bubbles: true,
      composed: true
    }))
  }

  render() {
    return html`
      <div class="questionaire-pane-create-question-footer">
        <div class="questionaire-pane-create-question-footer-left">
          <span class="questionaire-pane-create-question-footer-status">${this.statusLabel}</span>
          <div class="questionaire-pane-create-question-footer-points">
            <label class="questionaire-pane-create-question-footer-points-label" for="questionaire-footer-points-input">Points</label>
            <input
              id="questionaire-footer-points-input"
              class="questionaire-pane-create-question-footer-points-input"
              type="number"
              min="0"
              step="1"
              .value=${this.points}
              @input=${(event: Event) => this.handlePointsInput(event)}
            />
          </div>
        </div>
        <div class="questionaire-pane-create-question-footer-actions">
          <button
            class="questionaire-pane-create-question-footer-cancel"
            type="button"
            ?disabled=${this.cancelDisabled}
            @click=${() => this.handleCancelClick()}
          >
            Cancel
          </button>
          <button
            class="questionaire-pane-create-question-footer-save"
            type="button"
            ?disabled=${this.saveDisabled}
            @click=${() => this.handleSaveClick()}
          >
            <icon-lucide-check></icon-lucide-check>
            <span>${this.saveLabel}</span>
          </button>
        </div>
      </div>
    `
  }
}
