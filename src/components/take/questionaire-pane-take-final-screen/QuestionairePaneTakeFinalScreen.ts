import { html } from 'lit'
import { property } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import styles from './QuestionairePaneTakeFinalScreen.styles.css'

@customElement('questionaire-pane-take-final-screen')
export default class QuestionairePaneTakeFinalScreen extends WebComponent {
  static styles = styles

  @property({ type: Number, attribute: 'total-questions' })
  accessor totalQuestions = 0

  @property({ type: Number, attribute: 'answered-questions' })
  accessor answeredQuestions = 0

  @property({ type: Number, attribute: 'available-points' })
  accessor availablePoints = 0

  @property({ type: Number, attribute: 'earned-points' })
  accessor earnedPoints = 0

  @property({ type: Boolean, attribute: 'is-survey' })
  accessor isSurvey = false

  private handleRestart () {
    this.dispatchEvent(new CustomEvent('questionaire-take-restart', {
      bubbles: true,
      composed: true
    }))
  }

  render() {
    return html`
      <section class="questionaire-pane-take-final-screen">
        <div class="questionaire-pane-take-final-screen-card">
          <p class="questionaire-pane-take-final-screen-kicker">Completed</p>
          <h2>You've finished the questionnaire</h2>
          ${this.isSurvey
            ? html`<p class="questionaire-pane-take-final-screen-score">Your responses have been recorded.</p>`
            : html`<p class="questionaire-pane-take-final-screen-score">Score: ${this.earnedPoints} / ${this.availablePoints} points</p>`}
          <p class="questionaire-pane-take-final-screen-summary">
            ${this.answeredQuestions} of ${this.totalQuestions} questions answered.
          </p>
          <button class="questionaire-pane-take-final-screen-restart" type="button" @click=${() => this.handleRestart()}>
            Start again
          </button>
        </div>
      </section>
    `
  }
}
