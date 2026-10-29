import { html } from 'lit'
import { state } from 'lit/decorators.js'
import { customElement } from 'solid-ui'
import styles from './QuestionairePaneCreateQuestionConfidence.styles.css'
import QuestionairePaneCreateQuestionCardBase from '../questionaire-pane-create-question-card-base/QuestionairePaneCreateQuestionCardBase'
import '../../../shared/QuestionairePaneFormattingToolbar'
import '../../../shared/QuestionairePaneFormattedTextEditor'
import { readQuestionValue } from '../../../../service/questionaireQuestionAccessors'
import '../questionaire-pane-create-question-header/QuestionairePaneCreateQuestionHeader'
import '../questionaire-pane-create-question-footer/QuestionairePaneCreateQuestionFooter'
import '~icons/lucide/chevron-down'
import '~icons/lucide/info'
import '~icons/lucide/heart'

@customElement('questionaire-pane-create-question-confidence')
export default class QuestionairePaneCreateQuestionConfidence extends QuestionairePaneCreateQuestionCardBase {
  static styles = styles

  @state()
  private accessor draftTitle = ''

  @state()
  private accessor draftHint = ''

  @state()
  private accessor draftExplanation = ''

  @state()
  private accessor draftPoints = '1'

  @state()
  private accessor loadedQuestionUri: string | null = null

  protected willUpdate () {
    const question = this.question
    if (!question || this.loadedQuestionUri === question.uri) {
      return
    }

    this.draftTitle = this.getQuestionTitle()
    this.draftHint = this.getQuestionHint()
    this.draftExplanation = readQuestionValue(this.getStore()!, question, 'explanation')
    this.draftPoints = String(this.getQuestionPoints())
    this.loadedQuestionUri = question.uri
  }

  protected resetDraft () {
    super.resetDraft()
    this.loadedQuestionUri = null
  }

  private getQuestionTitle () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return ''
    }

    return readQuestionValue(store, question, 'title')
  }

  private getQuestionHint () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return ''
    }

    return readQuestionValue(store, question, 'hint')
  }

  private getQuestionPoints () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return 1
    }

    const raw = readQuestionValue(store, question, 'points') || '1'
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) ? parsed : 1
  }

  private async persistQuestionCard () {
    const question = this.question
    const logic = this.getQuestionLogic()
    if (!question || !logic) {
      return
    }

    const title = this.draftTitle.trim()
    const hint = this.draftHint.trim()
    const explanation = this.draftExplanation.trim()
    const points = Number.parseInt(this.draftPoints, 10)

    await logic.updateQuestionText({ question, title })
    await logic.updateQuestionHint({ question, hint })
    await logic.updateQuestionExplanation({ question, explanation })
    await logic.updateQuestionPoints({ question, points: Number.isFinite(points) ? points : 0 })

    this.emitQuestionChanged()
    this.emitQuestionSaved()
  }

  render() {
    const store = this.getStore()
    const question = this.question

    if (!store || !question) {
      return html``
    }

    const title = this.draftTitle
    const hint = this.draftHint || this.getQuestionHint()
    const explanation = this.draftExplanation
    const points = this.draftPoints || String(this.getQuestionPoints())
    const questionNumber = this.getQuestionNumber()

    return html`
      <section class="questionaire-pane-create-question-confidence">
        <questionaire-pane-create-question-header
          .questionNumber=${questionNumber}
          .questionTypeLabel=${'Confidence / Rating'}
          @questionaire-question-header-delete=${() => {
            void this.deleteQuestion()
          }}
        ></questionaire-pane-create-question-header>

        <div class="questionaire-pane-create-question-confidence-field">
          <label>Question type</label>
          <div class="questionaire-pane-create-question-confidence-type-card">
            <div class="questionaire-pane-create-question-confidence-type-icon">
              <icon-lucide-heart></icon-lucide-heart>
            </div>
            <div class="questionaire-pane-create-question-confidence-type-copy">
              <div class="questionaire-pane-create-question-confidence-type-title">Confidence / Rating</div>
              <div class="questionaire-pane-create-question-confidence-type-description">Collect a rating or confidence response</div>
            </div>
            <div class="questionaire-pane-create-question-confidence-type-chevron">
              <icon-lucide-chevron-down></icon-lucide-chevron-down>
            </div>
          </div>
        </div>

        <div class="questionaire-pane-create-question-confidence-field">
          <label>More details <span>(optional)</span></label>
          <textarea class="questionaire-pane-create-question-confidence-input" rows="4" placeholder="Shown after an incorrect answer to explain the concept..." .value=${explanation} @input=${(event: Event) => { this.draftExplanation = (event.currentTarget as HTMLTextAreaElement).value }}></textarea>
        </div>

        <div class="questionaire-pane-create-question-confidence-field">
          <label>Question</label>
          <questionaire-pane-formatted-text-editor
            class="questionaire-pane-create-question-confidence-textarea"
            placeholder="Type your question here..."
            .value=${title}
            @questionaire-formatted-text-input=${(event: CustomEvent<{ value: string }>) => {
              this.draftTitle = event.detail.value
            }}
          ></questionaire-pane-formatted-text-editor>
          <questionaire-pane-formatting-toolbar></questionaire-pane-formatting-toolbar>
        </div>

        <div class="questionaire-pane-create-question-confidence-field">
          <label>Hint <span>(optional)</span></label>
          <input
            class="questionaire-pane-create-question-confidence-input"
            type="text"
            placeholder="Shown to respondents as a hint..."
            .value=${hint}
            @input=${(event: Event) => {
              this.draftHint = (event.currentTarget as HTMLInputElement).value
            }}
          />
        </div>

        <div class="questionaire-pane-create-question-confidence-field">
          <label>Response scale</label>
          <div class="questionaire-pane-create-question-confidence-scale">
            ${['1', '2', '3', '4', '5'].map((value) => html`<span>${value}</span>`)}
          </div>
        </div>

        <questionaire-pane-create-question-footer
          .points=${points}
          .statusLabel=${this.draftDirty ? 'Changes not saved' : 'Saved'}
          .saveDisabled=${!this.draftDirty}
          .cancelDisabled=${!this.draftDirty}
          .saveLabel=${'Save question'}
          @questionaire-question-footer-points-changed=${(event: CustomEvent<{ points: string }>) => {
            this.draftPoints = event.detail.points
          }}
          @questionaire-question-footer-save=${() => {
            void this.persistQuestionCard()
          }}
        ></questionaire-pane-create-question-footer>
      </section>
    `
  }
}
