import { html } from 'lit'
import { state } from 'lit/decorators.js'
import { customElement } from 'solid-ui'
import styles from './QuestionairePaneCreateQuestionFillInTheBlank.styles.css'
import QuestionairePaneCreateQuestionCardBase from '../questionaire-pane-create-question-card-base/QuestionairePaneCreateQuestionCardBase'
import '../../../shared/QuestionairePaneFormattingToolbar'
import '../../../shared/QuestionairePaneFormattedTextEditor'
import { readQuestionValue, readQuestionValues } from '../../../../service/questionaireQuestionAccessors'
import '../questionaire-pane-create-question-header/QuestionairePaneCreateQuestionHeader'
import '../questionaire-pane-create-question-footer/QuestionairePaneCreateQuestionFooter'
import '../questionaire-pane-create-question-image-upload/QuestionairePaneCreateQuestionImageUpload'
import '~icons/lucide/chevron-down'
import '~icons/lucide/info'

@customElement('questionaire-pane-create-question-fill-in-the-blank')
export default class QuestionairePaneCreateQuestionFillInTheBlank extends QuestionairePaneCreateQuestionCardBase {
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
  private accessor pointsCustomized = false

  @state()
  private accessor draftAnswers: string[] = []

  @state()
  private accessor loadedQuestionUri: string | null = null

  protected willUpdate () {
    const question = this.question
    if (!question || this.loadedQuestionUri === question.uri) {
      return
    }

    const title = this.getQuestionTitle()
    const storedPoints = this.getQuestionPoints()
    this.draftTitle = title
    this.draftHint = this.getQuestionHint()
    this.draftExplanation = readQuestionValue(this.getStore()!, question, 'explanation')
    this.draftImage = readQuestionValue(this.getStore()!, question, 'image')
    this.draftPoints = String(storedPoints)
    this.pointsCustomized = storedPoints !== this.getBlankCount(title)
    this.draftAnswers = this.getQuestionAnswers()
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

  private getQuestionAnswers () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return ['']
    }

    const answers = readQuestionValues(store, question, 'answer')
    return answers.length > 0 ? answers : ['']
  }

  private getBlankCount (title: string) {
    return Math.max(1, title.match(/\[_{2,}\]/g)?.length ?? 0)
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
    const answers = this.draftAnswers.map((answer) => answer.trim())

    await logic.updateQuestionText({ question, title })
    await logic.updateQuestionHint({ question, hint })
    await logic.updateQuestionExplanation({ question, explanation })
    await logic.updateQuestionImage({ question, image })
    await logic.updateQuestionPoints({ question, points: Number.isFinite(points) ? points : 0 })
    await logic.updateQuestionAnswers({ question, answers: answers.filter((answer) => answer.length > 0) })

    this.emitQuestionChanged()
    this.emitQuestionSaved()
  }

  private insertBlank () {
    const editor = this.renderRoot.querySelector<HTMLElement & {
      insertTextAtSelection: (text: string) => void
    }>('questionaire-pane-formatted-text-editor')
    editor?.insertTextAtSelection('[____]')
  }

  private updateAnswer (index: number, value: string) {
    const answers = this.draftAnswers.slice()
    while (answers.length <= index) {
      answers.push('')
    }
    answers[index] = value
    this.draftAnswers = answers
  }

  private updateQuestionDraftTitle (value: string) {
    this.draftTitle = value
    if (!this.pointsCustomized) {
      this.draftPoints = String(this.getBlankCount(value))
    }
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
    const blankCount = this.getBlankCount(title)
    const answers = this.draftAnswers.concat(
      Array.from({ length: Math.max(0, blankCount - this.draftAnswers.length) }, () => '')
    )
    const questionNumber = this.getQuestionNumber()

    return html`
      <section class="questionaire-pane-create-question-fill-in-the-blank">
        <questionaire-pane-create-question-header
          .questionNumber=${questionNumber}
          .questionTypeLabel=${'Fill in the Blank'}
          @questionaire-question-header-delete=${() => { void this.deleteQuestion() }}
        ></questionaire-pane-create-question-header>

        <div class="questionaire-pane-create-question-fill-in-the-blank-field">
          <label>Question type</label>
          <div class="questionaire-pane-create-question-fill-in-the-blank-type-card">
            <div class="questionaire-pane-create-question-fill-in-the-blank-type-icon">U
            </div>
            <div class="questionaire-pane-create-question-fill-in-the-blank-type-copy">
              <div class="questionaire-pane-create-question-fill-in-the-blank-type-title">Fill in the Blank</div>
              <div class="questionaire-pane-create-question-fill-in-the-blank-type-description">Complete missing words</div>
            </div>
            <div class="questionaire-pane-create-question-fill-in-the-blank-type-chevron">
              <icon-lucide-chevron-down></icon-lucide-chevron-down>
            </div>
          </div>
        </div>

        <div class="questionaire-pane-create-question-fill-in-the-blank-field">
          <label>More details <span>(optional)</span></label>
          <textarea class="questionaire-pane-create-question-fill-in-the-blank-input" rows="4" placeholder="Shown after an incorrect answer to explain the concept..." .value=${explanation} @input=${(event: Event) => { this.draftExplanation = (event.currentTarget as HTMLTextAreaElement).value }}></textarea>
        </div>

        <questionaire-pane-create-question-image-upload
          .question=${question}
          .image=${this.draftImage}
          @questionaire-question-image-changed=${(event: CustomEvent<{ image: string }>) => {
            this.draftImage = event.detail.image
            this.emitQuestionChanged()
          }}
        ></questionaire-pane-create-question-image-upload>

        <div class="questionaire-pane-create-question-fill-in-the-blank-field">
          <label>Question</label>
          <questionaire-pane-formatted-text-editor
            class="questionaire-pane-create-question-fill-in-the-blank-textarea"
            placeholder="Type your question here..."
            .value=${title}
            @questionaire-formatted-text-input=${(event: CustomEvent<{ value: string }>) => {
              this.updateQuestionDraftTitle(event.detail.value)
            }}
          ></questionaire-pane-formatted-text-editor>
          <div class="questionaire-pane-create-question-fill-in-the-blank-question-actions">
            <questionaire-pane-formatting-toolbar></questionaire-pane-formatting-toolbar>
            <button
              class="questionaire-pane-create-question-fill-in-the-blank-insert"
              type="button"
              @mousedown=${(event: MouseEvent) => event.preventDefault()}
              @click=${() => this.insertBlank()}
            >
              <span>+</span>
              <span>Insert blank</span>
            </button>
          </div>
          <p class="questionaire-pane-create-question-fill-in-the-blank-note">${blankCount} ${blankCount === 1 ? 'blank' : 'blanks'} detected — fill in the correct answer(s) below</p>
        </div>

        <div class="questionaire-pane-create-question-fill-in-the-blank-field">
          <label>Hint <span>(optional)</span></label>
          <input
            class="questionaire-pane-create-question-fill-in-the-blank-input"
            type="text"
            placeholder="Shown to respondents as a hint..."
            .value=${hint}
            @input=${(event: Event) => {
              this.draftHint = (event.currentTarget as HTMLInputElement).value
            }}
          />
        </div>

        <div class="questionaire-pane-create-question-fill-in-the-blank-field">
          <label>CORRECT ANSWER(S)</label>
          ${answers.slice(0, blankCount).map((answer, index) => html`
            <div class="questionaire-pane-create-question-fill-in-the-blank-answer-row">
              <div class="questionaire-pane-create-question-fill-in-the-blank-answer-badge">Blank ${index + 1}</div>
              <input
                class="questionaire-pane-create-question-fill-in-the-blank-answer-input"
                type="text"
                placeholder="Answer"
                .value=${answer}
                @input=${(event: Event) => {
                  this.updateAnswer(index, (event.currentTarget as HTMLInputElement).value)
                }}
              />
            </div>
          `)}
          <div class="questionaire-pane-create-question-fill-in-the-blank-note">
            <icon-lucide-info></icon-lucide-info>
            <span>Answers are checked case-insensitively.</span>
          </div>
        </div>

        <questionaire-pane-create-question-footer
          .points=${String(points)}
          .statusLabel=${this.draftDirty ? 'Changes not saved' : 'Saved'}
          .saveDisabled=${!this.draftDirty}
          .cancelDisabled=${!this.draftDirty}
          .saveLabel=${'Save question'}
          @questionaire-question-footer-points-changed=${(event: CustomEvent<{ points: string }>) => {
            this.draftPoints = event.detail.points
            this.pointsCustomized = true
          }}
          @questionaire-question-footer-save=${() => {
            void this.persistQuestionCard()
          }}
        ></questionaire-pane-create-question-footer>
      </section>
    `
  }
}
