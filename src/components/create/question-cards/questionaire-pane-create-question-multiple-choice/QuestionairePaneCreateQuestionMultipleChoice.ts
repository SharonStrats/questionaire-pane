import { html } from 'lit'
import { property, state } from 'lit/decorators.js'
import { customElement } from 'solid-ui'
import styles from './QuestionairePaneCreateQuestionMultipleChoice.styles.css'
import QuestionairePaneCreateQuestionCardBase from '../questionaire-pane-create-question-card-base/QuestionairePaneCreateQuestionCardBase'
import '../../../shared/QuestionairePaneFormattingToolbar'
import '../../../shared/QuestionairePaneFormattedTextEditor'
import { readQuestionValue, readQuestionValues } from '../../../../service/questionaireQuestionAccessors'
import '../questionaire-pane-create-question-header/QuestionairePaneCreateQuestionHeader'
import '../questionaire-pane-create-question-base/QuestionairePaneCreateQuestionBase'
import '../questionaire-pane-create-question-footer/QuestionairePaneCreateQuestionFooter'
import '../questionaire-pane-create-question-image-upload/QuestionairePaneCreateQuestionImageUpload'
import '~icons/lucide/check'
import '~icons/lucide/chevron-down'
import '~icons/lucide/info'
import '~icons/lucide/plus'
import '~icons/lucide/square'
import '~icons/lucide/check-square'

@customElement('questionaire-pane-create-question-multiple-choice')
export default class QuestionairePaneCreateQuestionMultipleChoice extends QuestionairePaneCreateQuestionCardBase {
  static styles = styles

  @property({ type: String, attribute: 'question-type-label' })
  accessor questionTypeLabel = 'Multiple choice'

  @property({ type: String, attribute: 'question-type-description' })
  accessor questionTypeDescription = 'Pick exactly one answer from the list.'

  @property({ type: String, attribute: 'question-type-icon' })
  accessor questionTypeIcon = 'MC'

  @property({ type: Boolean, attribute: 'allow-multiple-correct-answers' })
  accessor allowMultipleCorrectAnswers = false

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
  private accessor draftOptions: string[] = []

  @state()
  private accessor draftCorrectOption = ''

  @state()
  private accessor draftCorrectOptions: string[] = []

  @state()
  private accessor loadedQuestionUri: string | null = null

  @state()
  private accessor pendingOptionFocusIndex: number | null = null

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
    this.draftOptions = this.getQuestionOptions()
    this.draftCorrectOption = this.getCorrectOption()
    this.draftCorrectOptions = this.getCorrectOptions()
    this.loadedQuestionUri = question.uri
  }

  protected resetDraft () {
    super.resetDraft()
    this.loadedQuestionUri = null
  }

  protected updated () {
    const pendingOptionFocusIndex = this.pendingOptionFocusIndex
    if (pendingOptionFocusIndex === null) {
      return
    }

    const optionInput = this.renderRoot.querySelector<HTMLInputElement>(`[data-option-index="${pendingOptionFocusIndex}"]`)
    if (!optionInput) {
      return
    }

    optionInput.focus({ preventScroll: true })
    optionInput.setSelectionRange(0, 0)
    this.pendingOptionFocusIndex = null
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

  private getQuestionOptions () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return []
    }

    const options = readQuestionValues(store, question, 'option')
    const acceptedOptions = readQuestionValues(store, question, 'correctOption')
    return [...options, ...acceptedOptions.filter((option) => !options.includes(option))]
  }

  private getCorrectOption () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return ''
    }

    return readQuestionValue(store, question, 'correctOption')
  }

  private getCorrectOptions () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return []
    }

    return readQuestionValues(store, question, 'correctOption')
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
    const options = this.draftOptions.map((option) => option.trim()).filter((option) => option.length > 0)
    const correctOption = this.draftCorrectOption.trim() || undefined
    const correctOptions = this.draftCorrectOptions.map((option) => option.trim()).filter((option) => option.length > 0)

    await logic.updateQuestionText({ question, title })
    await logic.updateQuestionHint({ question, hint })
    await logic.updateQuestionExplanation({ question, explanation })
    await logic.updateQuestionImage({ question, image })
    await logic.updateQuestionPoints({ question, points: Number.isFinite(points) ? points : 0 })
    await logic.updateQuestionOptions({
      question,
      options: options.length > 0 ? options : [''],
      correctOption: this.allowMultipleCorrectAnswers ? null : correctOption,
      correctOptions: this.allowMultipleCorrectAnswers ? correctOptions : null
    })

    this.emitQuestionChanged()
    this.emitQuestionSaved()
  }

  private addQuestionOption () {
    const options = this.draftOptions.length > 0 ? this.draftOptions.slice() : this.getQuestionOptions().slice()
    options.push('')
    this.draftOptions = options
    this.pendingOptionFocusIndex = options.length - 1
  }

  private removeQuestionOption (index: number) {
    const options = this.draftOptions.length > 0 ? this.draftOptions.slice() : this.getQuestionOptions().slice()
    options.splice(index, 1)
    if (options.length === 0) {
      options.push('')
    }

    this.draftOptions = options
  }

  private setCorrectOption (option: string) {
    this.draftCorrectOption = option
  }

  private toggleCorrectOption (option: string) {
    const nextCorrectOptions = this.draftCorrectOptions.includes(option)
      ? this.draftCorrectOptions.filter((item) => item !== option)
      : [...this.draftCorrectOptions, option]
    this.draftCorrectOptions = nextCorrectOptions
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
    const options = this.draftOptions.length > 0 ? this.draftOptions : (this.getQuestionOptions().length > 0 ? this.getQuestionOptions() : [''])
    const correctOptions = this.draftCorrectOptions.length > 0 ? this.draftCorrectOptions : this.getCorrectOptions()
    const correctOption = this.draftCorrectOption || this.getCorrectOption()
    const questionNumber = this.getQuestionNumber()

    return html`
      <section class="questionaire-pane-create-question-multiple-choice">
        <questionaire-pane-create-question-header
          .questionNumber=${questionNumber}
          .questionTypeLabel=${this.questionTypeLabel}
          @questionaire-question-header-delete=${() => { void this.deleteQuestion() }}
        ></questionaire-pane-create-question-header>

        <div class="questionaire-pane-create-question-multiple-choice-field">
          <label>Question type</label>
          <div class="questionaire-pane-create-question-multiple-choice-type-card">
            <div class="questionaire-pane-create-question-multiple-choice-type-icon">${this.questionTypeIcon}</div>
            <div class="questionaire-pane-create-question-multiple-choice-type-copy">
              <div class="questionaire-pane-create-question-multiple-choice-type-title">${this.questionTypeLabel}</div>
              <div class="questionaire-pane-create-question-multiple-choice-type-description">${this.questionTypeDescription}</div>
            </div>
            <div class="questionaire-pane-create-question-multiple-choice-type-chevron">
              <icon-lucide-chevron-down></icon-lucide-chevron-down>
            </div>
          </div>
        </div>

        <div class="questionaire-pane-create-question-multiple-choice-field">
          <label>More details <span>(optional)</span></label>
          <textarea class="questionaire-pane-create-question-multiple-choice-input" rows="4" placeholder="Shown after an incorrect answer to explain the concept..." .value=${explanation} @input=${(event: Event) => { this.draftExplanation = (event.currentTarget as HTMLTextAreaElement).value }}></textarea>
        </div>

        <questionaire-pane-create-question-image-upload
          .question=${question}
          .image=${this.draftImage}
          @questionaire-question-image-changed=${(event: CustomEvent<{ image: string }>) => {
            this.draftImage = event.detail.image
            this.emitQuestionChanged()
          }}
        ></questionaire-pane-create-question-image-upload>

        <div class="questionaire-pane-create-question-multiple-choice-field">
          <label>Question</label>
          <questionaire-pane-formatted-text-editor
            class="questionaire-pane-create-question-multiple-choice-textarea"
            placeholder="Type your question here..."
            .value=${title}
            @questionaire-formatted-text-input=${(event: CustomEvent<{ value: string }>) => {
              this.draftTitle = event.detail.value
            }}
          ></questionaire-pane-formatted-text-editor>
          <questionaire-pane-formatting-toolbar></questionaire-pane-formatting-toolbar>
        </div>

        <div class="questionaire-pane-create-question-multiple-choice-field">
          <label>Hint <span>(optional)</span></label>
          <input
            class="questionaire-pane-create-question-multiple-choice-input"
            type="text"
            placeholder="Shown to respondents as a hint..."
            .value=${hint}
            @input=${(event: Event) => {
              this.draftHint = (event.currentTarget as HTMLInputElement).value
            }}
          />
        </div>

        <div class="questionaire-pane-create-question-multiple-choice-field">
          <div class="questionaire-pane-create-question-multiple-choice-field-header">
            <label>Options</label>
            <span>${this.allowMultipleCorrectAnswers ? 'Mark all correct answers on the right' : 'Mark the correct answer on the right'}</span>
          </div>
          <div class="questionaire-pane-create-question-multiple-choice-options">
            ${options.map((option, index) => {
              const isCorrect = this.allowMultipleCorrectAnswers
                ? correctOptions.includes(option)
                : option === correctOption
              return html`
                <div class="questionaire-pane-create-question-multiple-choice-option ${isCorrect ? 'questionaire-pane-create-question-multiple-choice-option--correct' : ''}">
                  <span class="questionaire-pane-create-question-multiple-choice-option-badge">${String.fromCharCode(65 + index)}</span>
                  <input
                    data-option-index=${index}
                    type="text"
                    placeholder=${`Option ${index + 1}`}
                    .value=${option}
                    @input=${(event: Event) => {
                      const nextOptions = options.slice()
                      nextOptions[index] = (event.currentTarget as HTMLInputElement).value
                      this.draftOptions = nextOptions
                    }}
                    @keydown=${(event: KeyboardEvent) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        this.addQuestionOption()
                      }
                    }}
                  />
                  <button
                    class="questionaire-pane-create-question-multiple-choice-option-correct ${this.allowMultipleCorrectAnswers ? 'questionaire-pane-create-question-multiple-choice-option-correct--checkbox' : ''}"
                    type="button"
                    aria-pressed=${isCorrect ? 'true' : 'false'}
                    @click=${() => {
                      if (this.allowMultipleCorrectAnswers) {
                        this.toggleCorrectOption(option)
                        return
                      }
                      this.setCorrectOption(option)
                    }}
                  >
                    ${this.allowMultipleCorrectAnswers
                      ? html`
                          <span class="questionaire-pane-create-question-multiple-choice-option-correct-checkbox">
                            ${isCorrect ? html`<icon-lucide-check-square></icon-lucide-check-square>` : html`<icon-lucide-square></icon-lucide-square>`}
                          </span>
                          <span>${isCorrect ? 'Selected' : 'Select'}</span>
                        `
                      : isCorrect
                        ? html`<icon-lucide-check></icon-lucide-check><span>Correct</span>`
                        : html`<span>Mark correct</span>`}
                  </button>
                  <button
                    class="questionaire-pane-create-question-multiple-choice-option-delete"
                    type="button"
                    aria-label=${`Delete option ${index + 1}`}
                    @click=${() => { void this.removeQuestionOption(index) }}
                  >
                    <icon-lucide-trash-2></icon-lucide-trash-2>
                  </button>
                </div>
              `
            })}
          </div>
          <button class="questionaire-pane-create-question-multiple-choice-add" type="button" @click=${() => { void this.addQuestionOption() }}>
            <icon-lucide-plus></icon-lucide-plus>
            <span>Add option</span>
          </button>
          <div class="questionaire-pane-create-question-multiple-choice-note">
            <icon-lucide-info></icon-lucide-info>
            <span>${this.allowMultipleCorrectAnswers ? 'Choose all correct options for scoring.' : 'Choose one correct option for scoring. The rest stay available as distractors.'}</span>
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
          }}
          @questionaire-question-footer-save=${() => {
            void this.persistQuestionCard()
          }}
        ></questionaire-pane-create-question-footer>
      </section>
    `
  }
}
