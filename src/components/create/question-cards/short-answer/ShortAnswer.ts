import { html } from 'lit'
import { state } from 'lit/decorators.js'
import { customElement } from 'solid-ui'
import styles from './ShortAnswer.styles.css'
import QuestionairePaneCreateQuestionCardBase from '../card-base/CardBase'
import { readQuestionValue, readQuestionValues } from '../../../../service/questionAccessors'
import { getQuestionnaireFormat } from '../../../../service/questionQueries'
import '../header/Header'
import '../footer/Footer'
import '../image-upload/ImageUpload'
import '../../../shared/FormattingToolbar'
import '../../../shared/FormattedTextEditor'
import '~icons/lucide/chevron-down'
import '~icons/lucide/info'
import '~icons/lucide/pencil'

@customElement('questionaire-pane-create-question-short-answer')
export default class QuestionairePaneCreateQuestionShortAnswer extends QuestionairePaneCreateQuestionCardBase {
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
  private accessor draftAnswers: string[] = []

  @state()
  private accessor draftCriteria: string[] = []

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
    this.draftAnswers = readQuestionValues(this.getStore()!, question, 'answer')
    this.draftCriteria = readQuestionValues(this.getStore()!, question, 'gradingCriteria')
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
    const image = this.draftImage.trim()
    const points = Number.parseInt(this.draftPoints, 10)

    await logic.updateQuestionText({ question, title })
    await logic.updateQuestionHint({ question, hint })
    await logic.updateQuestionExplanation({ question, explanation })
    await logic.updateQuestionImage({ question, image })
    await logic.updateQuestionPoints({ question, points: Number.isFinite(points) ? points : 0 })
    await logic.updateQuestionAnswers({ question, answers: this.draftAnswers })
    await logic.updateQuestionGradingCriteria({ question, criteria: this.draftCriteria })

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
    const isQuiz = this.questionaire?.subject
      ? getQuestionnaireFormat(store, this.questionaire.subject) === 'quiz'
      : true

    return html`
      <section class="questionaire-pane-create-question-short-answer">
        <questionaire-pane-create-question-header
          .questionNumber=${questionNumber}
          .questionTypeLabel=${'Short Answer'}
          @questionaire-question-header-delete=${() => { void this.deleteQuestion() }}
        ></questionaire-pane-create-question-header>

        <div class="questionaire-pane-create-question-short-answer-field">
          <label>Question type</label>
          <div class="questionaire-pane-create-question-short-answer-type-card">
            <div class="questionaire-pane-create-question-short-answer-type-icon">
              <icon-lucide-pencil></icon-lucide-pencil>
            </div>
            <div class="questionaire-pane-create-question-short-answer-type-copy">
              <div class="questionaire-pane-create-question-short-answer-type-title">Short Answer</div>
              <div class="questionaire-pane-create-question-short-answer-type-description">Free-text response</div>
            </div>
            <div class="questionaire-pane-create-question-short-answer-type-chevron">
              <icon-lucide-chevron-down></icon-lucide-chevron-down>
            </div>
          </div>
        </div>

        <div class="questionaire-pane-create-question-short-answer-field">
          <label>More details <span>(optional)</span></label>
          <textarea
            class="questionaire-pane-create-question-short-answer-input"
            rows="4"
            placeholder="Shown after an incorrect answer to explain the concept..."
            .value=${explanation}
            @input=${(event: Event) => {
              this.draftExplanation = (event.currentTarget as HTMLTextAreaElement).value
            }}
          ></textarea>
        </div>

        <questionaire-pane-create-question-image-upload
          .question=${question}
          .image=${this.draftImage}
          @questionaire-question-image-changed=${(event: CustomEvent<{ image: string }>) => {
            this.draftImage = event.detail.image
            this.emitQuestionChanged()
          }}
        ></questionaire-pane-create-question-image-upload>

        <div class="questionaire-pane-create-question-short-answer-field">
          <label>Question</label>
          <questionaire-pane-formatted-text-editor
            class="questionaire-pane-create-question-short-answer-textarea"
            placeholder="Type your question here..."
            .value=${title}
            @questionaire-formatted-text-input=${(event: CustomEvent<{ value: string }>) => {
              this.draftTitle = event.detail.value
            }}
          ></questionaire-pane-formatted-text-editor>
          <questionaire-pane-formatting-toolbar></questionaire-pane-formatting-toolbar>
        </div>

        <div class="questionaire-pane-create-question-short-answer-field">
          <label>Hint <span>(optional)</span></label>
          <input
            class="questionaire-pane-create-question-short-answer-input"
            type="text"
            placeholder="Shown to respondents as a hint..."
            .value=${hint}
            @input=${(event: Event) => {
              this.draftHint = (event.currentTarget as HTMLInputElement).value
            }}
          />
        </div>

        ${isQuiz ? html`
          <div class="questionaire-pane-create-question-short-answer-field">
            <div class="questionaire-pane-create-question-short-answer-field-header">
              <label>Accepted answers</label>
              <button
                class="questionaire-pane-create-question-short-answer-add-answer"
                type="button"
                @click=${() => { this.draftAnswers = [...this.draftAnswers, ''] }}
              >Add answer</button>
            </div>
            ${this.draftAnswers.length > 0
              ? this.draftAnswers.map((answer, index) => html`
                <div class="questionaire-pane-create-question-short-answer-answer">
                  <input
                    class="questionaire-pane-create-question-short-answer-input"
                    type="text"
                    required=${index === 0}
                    placeholder="Enter an accepted answer..."
                    .value=${answer}
                    @input=${(event: Event) => {
                      const answers = this.draftAnswers.slice()
                      answers[index] = (event.currentTarget as HTMLInputElement).value
                      this.draftAnswers = answers
                    }}
                  />
                  ${index > 0 ? html`
                    <button
                      class="questionaire-pane-create-question-short-answer-remove-answer"
                      type="button"
                      aria-label="Remove accepted answer"
                      @click=${() => {
                        this.draftAnswers = this.draftAnswers.filter((_, answerIndex) => answerIndex !== index)
                      }}
                    >Remove</button>
                  ` : ''}
                </div>
              `)
              : html`<div class="questionaire-pane-create-question-short-answer-criteria-note">Add at least one accepted answer.</div>`}
          </div>
          <div class="questionaire-pane-create-question-short-answer-field">
            <div class="questionaire-pane-create-question-short-answer-field-header">
              <label>Grading criteria <span>(optional)</span></label>
              <button
                class="questionaire-pane-create-question-short-answer-add-criterion"
                type="button"
                @click=${() => { this.draftCriteria = [...this.draftCriteria, ''] }}
              >Add criterion</button>
            </div>
            ${this.draftCriteria.length > 0
              ? this.draftCriteria.map((criterion, index) => html`
                <div class="questionaire-pane-create-question-short-answer-criterion">
                  <input
                    class="questionaire-pane-create-question-short-answer-input"
                    type="text"
                    placeholder="What should a correct answer include?"
                    .value=${criterion}
                    @input=${(event: Event) => {
                      const criteria = this.draftCriteria.slice()
                      criteria[index] = (event.currentTarget as HTMLInputElement).value
                      this.draftCriteria = criteria
                    }}
                  />
                  <button
                    class="questionaire-pane-create-question-short-answer-remove-criterion"
                    type="button"
                    aria-label="Remove criterion"
                    @click=${() => {
                      this.draftCriteria = this.draftCriteria.filter((_, criterionIndex) => criterionIndex !== index)
                    }}
                  >Remove</button>
                </div>
              `)
              : html`<div class="questionaire-pane-create-question-short-answer-criteria-note">Accepted answers remain the fallback when no criteria are added. Each criterion is worth one point.</div>`}
          </div>
        ` : ''}

        <questionaire-pane-create-question-footer
          .points=${String(points)}
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
