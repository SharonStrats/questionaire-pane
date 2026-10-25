import { html } from 'lit'
import { state } from 'lit/decorators.js'
import { customElement } from 'solid-ui'
import styles from './QuestionairePaneCreateQuestionTrueFalse.styles.css'
import QuestionairePaneCreateQuestionCardBase from '../questionaire-pane-create-question-card-base/QuestionairePaneCreateQuestionCardBase'
import '../../../shared/QuestionairePaneFormattingToolbar'
import '../../../shared/QuestionairePaneFormattedTextEditor'
import { readQuestionValue } from '../../../../service/questionaireQuestionAccessors'
import '../questionaire-pane-create-question-header/QuestionairePaneCreateQuestionHeader'
import '../questionaire-pane-create-question-footer/QuestionairePaneCreateQuestionFooter'
import '../questionaire-pane-create-question-image-upload/QuestionairePaneCreateQuestionImageUpload'
import '~icons/lucide/check'
import '~icons/lucide/chevron-down'
import '~icons/lucide/info'

@customElement('questionaire-pane-create-question-true-false')
export default class QuestionairePaneCreateQuestionTrueFalse extends QuestionairePaneCreateQuestionCardBase {
  static styles = styles

  @state()
  private accessor draftTitle = ''

  @state()
  private accessor draftHint = ''

  @state()
  private accessor draftExplanation = ''

  @state()
  private accessor draftImage = ''

  @state()
  private accessor draftPoints = '1'

  @state()
  private accessor draftCorrectOption = 'false'

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
    this.draftImage = readQuestionValue(this.getStore()!, question, 'image')
    this.draftPoints = String(this.getQuestionPoints())
    this.draftCorrectOption = this.getCorrectOption() || 'false'
    this.loadedQuestionUri = question.uri
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

  private getCorrectOption () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return ''
    }

    return readQuestionValue(store, question, 'correctOption')
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
    const image = this.draftImage.trim()
    const points = Number.parseInt(this.draftPoints, 10)
    const correctOption = this.draftCorrectOption === 'true' ? 'true' : 'false'

    await logic.updateQuestionText({ question, title })
    await logic.updateQuestionHint({ question, hint })
    await logic.updateQuestionExplanation({ question, explanation })
    await logic.updateQuestionImage({ question, image })
    await logic.updateQuestionPoints({ question, points: Number.isFinite(points) ? points : 0 })
    await logic.updateQuestionOptions({
      question,
      options: ['true', 'false'],
      correctOption
    })

    this.emitQuestionChanged()
    this.emitQuestionSaved()
  }

  private selectCorrectOption (value: 'true' | 'false') {
    this.draftCorrectOption = value
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
    const correctOption = this.draftCorrectOption || this.getCorrectOption() || 'false'
    const questionNumber = this.getQuestionNumber()

    return html`
      <section class="questionaire-pane-create-question-true-false">
        <questionaire-pane-create-question-header
          .questionNumber=${questionNumber}
          .questionTypeLabel=${'True / False'}
          @questionaire-question-header-delete=${() => { void this.deleteQuestion() }}
        ></questionaire-pane-create-question-header>

        <div class="questionaire-pane-create-question-true-false-field">
          <label>Question type</label>
          <div class="questionaire-pane-create-question-true-false-type-card">
            <div class="questionaire-pane-create-question-true-false-type-icon">TF</div>
            <div class="questionaire-pane-create-question-true-false-type-copy">
              <div class="questionaire-pane-create-question-true-false-type-title">True / False</div>
              <div class="questionaire-pane-create-question-true-false-type-description">Binary correct/incorrect</div>
            </div>
            <div class="questionaire-pane-create-question-true-false-type-chevron">
              <icon-lucide-chevron-down></icon-lucide-chevron-down>
            </div>
          </div>
        </div>

        <div class="questionaire-pane-create-question-true-false-field">
          <label>More details <span>(optional)</span></label>
          <textarea class="questionaire-pane-create-question-true-false-input" rows="4" placeholder="Shown after an incorrect answer to explain the concept..." .value=${explanation} @input=${(event: Event) => { this.draftExplanation = (event.currentTarget as HTMLTextAreaElement).value }}></textarea>
        </div>

        <questionaire-pane-create-question-image-upload
          .question=${question}
          .image=${this.draftImage}
          @questionaire-question-image-changed=${(event: CustomEvent<{ image: string }>) => {
            this.draftImage = event.detail.image
            this.emitQuestionChanged()
          }}
        ></questionaire-pane-create-question-image-upload>

        <div class="questionaire-pane-create-question-true-false-field">
          <label>Question</label>
          <questionaire-pane-formatted-text-editor
            class="questionaire-pane-create-question-true-false-textarea"
            placeholder="Type your question here..."
            .value=${title}
            @questionaire-formatted-text-input=${(event: CustomEvent<{ value: string }>) => {
              this.draftTitle = event.detail.value
            }}
          ></questionaire-pane-formatted-text-editor>
          <questionaire-pane-formatting-toolbar></questionaire-pane-formatting-toolbar>
        </div>

        <div class="questionaire-pane-create-question-true-false-field">
          <label>Hint <span>(optional)</span></label>
          <input
            class="questionaire-pane-create-question-true-false-input"
            type="text"
            placeholder="Shown to respondents as a hint..."
            .value=${hint}
            @input=${(event: Event) => {
              this.draftHint = (event.currentTarget as HTMLInputElement).value
            }}
          />
        </div>

        <div class="questionaire-pane-create-question-true-false-field">
          <div class="questionaire-pane-create-question-true-false-field-header">
            <label>Correct answer</label>
          </div>
          <div class="questionaire-pane-create-question-true-false-choice-row">
            <button
              class="questionaire-pane-create-question-true-false-choice ${correctOption === 'true' ? 'questionaire-pane-create-question-true-false-choice--selected' : ''}"
              type="button"
              @click=${() => this.selectCorrectOption('true')}
            >
              <span class="questionaire-pane-create-question-true-false-choice-check">${correctOption === 'true' ? html`<icon-lucide-check></icon-lucide-check>` : html``}</span>
              <span>True</span>
            </button>
            <button
              class="questionaire-pane-create-question-true-false-choice ${correctOption === 'false' ? 'questionaire-pane-create-question-true-false-choice--selected' : ''}"
              type="button"
              @click=${() => this.selectCorrectOption('false')}
            >
              <span class="questionaire-pane-create-question-true-false-choice-check">${correctOption === 'false' ? html`<icon-lucide-check></icon-lucide-check>` : html``}</span>
              <span>False</span>
            </button>
          </div>
          <div class="questionaire-pane-create-question-true-false-note">
            <icon-lucide-info></icon-lucide-info>
            <span>True / False questions use a binary correct answer.</span>
          </div>
        </div>

        <questionaire-pane-create-question-footer
          .points=${String(points)}
          .statusLabel=${this.draftDirty ? 'Changes not saved' : 'Saved'}
          .saveDisabled=${!this.draftDirty}
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
