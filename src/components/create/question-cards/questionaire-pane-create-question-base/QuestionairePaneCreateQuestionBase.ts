import { html } from 'lit'
import { property } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import styles from './QuestionairePaneCreateQuestionBase.styles.css'
import '../questionaire-pane-create-question-footer/QuestionairePaneCreateQuestionFooter'

@customElement('questionaire-pane-create-question-base')
export default class QuestionairePaneCreateQuestionBase extends WebComponent {
  static styles = styles

  @property({ type: String })
  accessor questionTypeLabel = 'Question'

  @property({ type: String })
  accessor title = ''

  @property({ type: String })
  accessor description = ''

  @property({ type: String, attribute: 'points' })
  accessor points = '1'

  @property({ type: String, attribute: 'status-label' })
  accessor statusLabel = 'Saved'

  @property({ type: String, attribute: 'save-label' })
  accessor saveLabel = 'Save question'

  render() {
    return html`
      <section class="questionaire-pane-create-question-base">
        <div class="questionaire-pane-create-question-base-header">
          <div>
            <p class="questionaire-pane-create-question-base-type">${this.questionTypeLabel}</p>
            <h2 class="questionaire-pane-create-question-base-title">${this.title}</h2>
          </div>
        </div>
        ${this.description
          ? html`<p class="questionaire-pane-create-question-base-description">${this.description}</p>`
          : html``}
        <div class="questionaire-pane-create-question-base-body">
          <slot></slot>
        </div>
        <questionaire-pane-create-question-footer
          .points=${this.points}
          .statusLabel=${this.statusLabel}
          .saveLabel=${this.saveLabel}
        ></questionaire-pane-create-question-footer>
      </section>
    `
  }
}
