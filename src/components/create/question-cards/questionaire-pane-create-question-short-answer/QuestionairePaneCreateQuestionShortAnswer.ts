import { html } from 'lit'
import { state } from 'lit/decorators.js'
import { customElement } from 'solid-ui'
import styles from './QuestionairePaneCreateQuestionShortAnswer.styles.css'
import QuestionairePaneCreateQuestionCardBase from '../questionaire-pane-create-question-card-base/QuestionairePaneCreateQuestionCardBase'
import { readQuestionValue, readQuestionValues } from '../../../../service/questionaireQuestionAccessors'
import { getQuestionnaireFormat } from '../../../../service/questionaireQuestionQueries'
import { uploadQuestionImage } from '../../../../service/questionaireImageUpload'
import '../questionaire-pane-create-question-header/QuestionairePaneCreateQuestionHeader'
import '../questionaire-pane-create-question-footer/QuestionairePaneCreateQuestionFooter'
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
  private accessor draftImage = ''

  @state()
  private accessor draftPoints = '1'

  @state()
  private accessor draftAnswers: string[] = []

  @state()
  private accessor loadedQuestionUri: string | null = null

  protected willUpdate () {
    const question = this.question
    if (!question || this.loadedQuestionUri === question.uri) {
      return
    }

    this.draftTitle = this.getQuestionTitle()
    this.draftHint = this.getQuestionHint()
    this.draftImage = readQuestionValue(this.getStore()!, question, 'image')
    this.draftPoints = String(this.getQuestionPoints())
    this.draftAnswers = readQuestionValues(this.getStore()!, question, 'answer')
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

  private async updateAnswers (answers: string[]) {
    const question = this.question
    const logic = this.getQuestionLogic()
    if (!question || !logic) return
    this.draftAnswers = answers
    await logic.updateQuestionAnswers({ question, answers })
    this.emitQuestionChanged()
  }

  private async persistQuestionCard () {
    const question = this.question
    const logic = this.getQuestionLogic()
    if (!question || !logic) {
      return
    }

    const title = this.draftTitle.trim()
    const hint = this.draftHint.trim()
    const image = this.draftImage.trim()
    const points = Number.parseInt(this.draftPoints, 10)

    await logic.updateQuestionText({ question, title })
    await logic.updateQuestionHint({ question, hint })
    await logic.updateQuestionImage({ question, image })
    await logic.updateQuestionPoints({ question, points: Number.isFinite(points) ? points : 0 })

    this.emitQuestionChanged()
    this.emitQuestionSaved()
  }

  private async updateQuestionTitle (value: string) {
    const question = this.question
    const logic = this.getQuestionLogic()
    if (!question || !logic) {
      return
    }

    this.draftTitle = value
    await logic.updateQuestionText({ question, title: value })
    this.emitQuestionChanged()
    this.requestUpdate()
  }

  private async updateQuestionHint (value: string) {
    const question = this.question
    const logic = this.getQuestionLogic()
    if (!question || !logic) {
      return
    }

    this.draftHint = value
    await logic.updateQuestionHint({ question, hint: value })
    this.emitQuestionChanged()
    this.requestUpdate()
  }

  render() {
    const store = this.getStore()
    const question = this.question

    if (!store || !question) {
      return html``
    }

    const title = this.draftTitle
    const hint = this.draftHint || this.getQuestionHint()
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
          <label>Image <span>(optional)</span></label>
          <label class="questionaire-pane-create-question-short-answer-upload">
            <input type="file" accept="image/*" @change=${async (event: Event) => {
              const file = (event.currentTarget as HTMLInputElement).files?.[0]
              const question = this.question
              const logic = this.getQuestionLogic()
              if (!file || !question || !logic) return
              const image = await uploadQuestionImage(this.getStore()!, question, file)
              this.draftImage = image
              await logic.updateQuestionImage({ question, image })
            }} />
            <span>Drop an image here or choose a file</span>
          </label>
          ${this.draftImage ? html`<img class="questionaire-pane-question-image-preview" src=${this.draftImage} alt="Question preview" />` : ''}
        </div>

        <div class="questionaire-pane-create-question-short-answer-field">
          <label>Question</label>
          <textarea
            class="questionaire-pane-create-question-short-answer-textarea"
            placeholder="Type your question here..."
            .value=${title}
            @input=${(event: Event) => {
              this.draftTitle = (event.currentTarget as HTMLTextAreaElement).value
            }}
            @blur=${(event: FocusEvent) => {
              void this.updateQuestionTitle((event.currentTarget as HTMLTextAreaElement).value)
            }}
          ></textarea>
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
            @blur=${(event: FocusEvent) => {
              void this.updateQuestionHint((event.currentTarget as HTMLInputElement).value)
            }}
          />
        </div>

        ${isQuiz ? html`
          <div class="questionaire-pane-create-question-short-answer-field">
            <div class="questionaire-pane-create-question-short-answer-field-header">
              <label>Answer</label>
            </div>
            <input
              class="questionaire-pane-create-question-short-answer-input"
              type="text"
              required
              placeholder="Enter the answer for grading..."
              .value=${this.draftAnswers[0] ?? ''}
              @input=${(event: Event) => {
                this.draftAnswers = [(event.currentTarget as HTMLInputElement).value]
              }}
              @blur=${(event: FocusEvent) => {
                void this.updateAnswers([(event.currentTarget as HTMLInputElement).value])
              }}
            />
          </div>
        ` : ''}

        <questionaire-pane-create-question-footer
          .points=${String(points)}
          .statusLabel=${this.draftDirty ? 'Changes not saved' : 'Saved'}
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
