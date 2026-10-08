import { html } from 'lit'
import { property, state } from 'lit/decorators.js'
import { consume } from '@lit/context'
import { customElement, WebComponent } from 'solid-ui'
import { Namespace, type NamedNode } from 'rdflib'
import styles from './QuestionairePaneCreateQuestionMultipleChoice.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../../context'
import { createQuestionaireLogic } from '../../../../service/questionaireLogic'
import '../questionaire-pane-create-question-header/QuestionairePaneCreateQuestionHeader'
import '../questionaire-pane-create-question-base/QuestionairePaneCreateQuestionBase'
import '../questionaire-pane-create-question-footer/QuestionairePaneCreateQuestionFooter'
import '~icons/lucide/check'
import '~icons/lucide/chevron-down'
import '~icons/lucide/info'
import '~icons/lucide/plus'
import '~icons/lucide/square'
import '~icons/lucide/check-square'

const dct = Namespace('http://purl.org/dc/terms/')
const quiz = Namespace('http://example.org/ns/quiz#')

@customElement('questionaire-pane-create-question-multiple-choice')
export default class QuestionairePaneCreateQuestionMultipleChoice extends WebComponent {
  static styles = styles

  @consume({ context: questionaireContext, subscribe: true })
  accessor questionaire: QuestionaireContext = undefined as unknown as QuestionaireContext

  @property({ attribute: false })
  accessor question: NamedNode | null = null

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

  private getBaseUrl () {
    const questionaire = this.questionaire ?? { subject: null }
    const subject = questionaire.subject
    if (!subject) {
      return null
    }

    return subject.doc().uri.replace(/index\.ttl$/, '')
  }

  private getStore () {
    return this.questionaire?.store ?? null
  }

  private getQuestionLogic () {
    const store = this.getStore()
    if (!store) {
      return null
    }

    return createQuestionaireLogic(store)
  }

  protected willUpdate () {
    const question = this.question
    if (!question || this.loadedQuestionUri === question.uri) {
      return
    }

    this.draftTitle = this.getQuestionTitle()
    this.draftHint = this.getQuestionHint()
    this.draftPoints = String(this.getQuestionPoints())
    this.draftOptions = this.getQuestionOptions()
    this.draftCorrectOption = this.getCorrectOption()
    this.draftCorrectOptions = this.getCorrectOptions()
    this.loadedQuestionUri = question.uri
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

  private getQuestionNumber () {
    const question = this.question
    if (!question) {
      return 1
    }

    const match = question.uri.match(/q(\d+)\.ttl$/)
    return match ? Number(match[1]) : 1
  }

  private getQuestionTitle () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return ''
    }

    return store.any(question, dct('title'), undefined, question.doc())?.value ?? ''
  }

  private getQuestionHint () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return ''
    }

    return store.any(question, quiz('hint'), undefined, question.doc())?.value ?? ''
  }

  private getQuestionPoints () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return 1
    }

    const raw = store.any(question, quiz('points'), undefined, question.doc())?.value ?? '1'
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) ? parsed : 1
  }

  private getQuestionOptions () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return []
    }

    return store
      .statementsMatching(question, quiz('option'), undefined, question.doc())
      .map((statement) => statement.object.value)
  }

  private getCorrectOption () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return ''
    }

    return store.any(question, quiz('correctOption'), undefined, question.doc())?.value ?? ''
  }

  private getCorrectOptions () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return []
    }

    return store
      .statementsMatching(question, quiz('correctOption'), undefined, question.doc())
      .map((statement) => statement.object.value)
  }

  private emitQuestionChanged () {
    const question = this.question
    if (!question) {
      return
    }

    this.dispatchEvent(new CustomEvent('questionaire-question-updated', {
      bubbles: true,
      composed: true,
      detail: { questionUri: question.uri }
    }))
  }

  private async persistQuestionCard () {
    const question = this.question
    const logic = this.getQuestionLogic()
    if (!question || !logic) {
      return
    }

    const title = this.draftTitle.trim()
    const hint = this.draftHint.trim()
    const points = Number.parseInt(this.draftPoints, 10)
    const options = this.draftOptions.map((option) => option.trim()).filter((option) => option.length > 0)
    const correctOption = this.draftCorrectOption.trim() || undefined
    const correctOptions = this.draftCorrectOptions.map((option) => option.trim()).filter((option) => option.length > 0)

    await logic.updateQuestionText({ question, title })
    await logic.updateQuestionHint({ question, hint })
    await logic.updateQuestionPoints({ question, points: Number.isFinite(points) ? points : 0 })
    await logic.updateQuestionOptions({
      question,
      options: options.length > 0 ? options : ['Option 1'],
      correctOption: this.allowMultipleCorrectAnswers ? null : correctOption,
      correctOptions: this.allowMultipleCorrectAnswers ? correctOptions : null
    })

    this.emitQuestionChanged()
    this.dispatchEvent(new CustomEvent('questionaire-question-saved', {
      bubbles: true,
      composed: true,
      detail: { questionUri: question.uri }
    }))
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

  private async updateQuestionOption (index: number, value: string) {
    const question = this.question
    const logic = this.getQuestionLogic()
    if (!question || !logic) {
      return
    }

    const options = this.draftOptions.length > 0 ? this.draftOptions.slice() : this.getQuestionOptions().slice()
    options[index] = value
    this.draftOptions = options
    await logic.updateQuestionOptions({
      question,
      options,
      correctOption: this.allowMultipleCorrectAnswers ? null : this.draftCorrectOption || undefined,
      correctOptions: this.allowMultipleCorrectAnswers ? this.draftCorrectOptions : null
    })
    this.emitQuestionChanged()
    this.requestUpdate()
  }

  private async addQuestionOption () {
    const question = this.question
    const logic = this.getQuestionLogic()
    if (!question || !logic) {
      return
    }

    const options = this.draftOptions.length > 0 ? this.draftOptions.slice() : this.getQuestionOptions().slice()
    options.push(`Option ${options.length + 1}`)
    this.draftOptions = options
    this.pendingOptionFocusIndex = options.length - 1
    await logic.updateQuestionOptions({
      question,
      options,
      correctOption: this.allowMultipleCorrectAnswers ? null : this.draftCorrectOption || undefined,
      correctOptions: this.allowMultipleCorrectAnswers ? this.draftCorrectOptions : null
    })
    this.emitQuestionChanged()
    this.requestUpdate()
  }

  private async removeQuestionOption (index: number) {
    const question = this.question
    const logic = this.getQuestionLogic()
    if (!question || !logic) {
      return
    }

    const options = this.draftOptions.length > 0 ? this.draftOptions.slice() : this.getQuestionOptions().slice()
    const removedOption = options[index]
    options.splice(index, 1)
    if (options.length === 0) {
      options.push('Option 1')
    }

    this.draftOptions = options
    const nextCorrectOptions = this.allowMultipleCorrectAnswers
      ? this.draftCorrectOptions.filter((option) => option !== removedOption)
      : this.draftCorrectOptions
    await logic.updateQuestionOptions({
      question,
      options,
      correctOption: this.allowMultipleCorrectAnswers ? null : this.draftCorrectOption || undefined,
      correctOptions: this.allowMultipleCorrectAnswers ? nextCorrectOptions : null
    })
    this.emitQuestionChanged()
    this.requestUpdate()
  }

  private async setCorrectOption (option: string) {
    const question = this.question
    const logic = this.getQuestionLogic()
    if (!question || !logic) {
      return
    }

    this.draftCorrectOption = option
    await logic.updateQuestionOptions({
      question,
      options: this.draftOptions.length > 0 ? this.draftOptions : this.getQuestionOptions(),
      correctOption: option,
      correctOptions: null
    })
    this.emitQuestionChanged()
    this.requestUpdate()
  }

  private async toggleCorrectOption (option: string) {
    const question = this.question
    const logic = this.getQuestionLogic()
    if (!question || !logic) {
      return
    }

    const nextCorrectOptions = this.draftCorrectOptions.includes(option)
      ? this.draftCorrectOptions.filter((item) => item !== option)
      : [...this.draftCorrectOptions, option]
    this.draftCorrectOptions = nextCorrectOptions
    await logic.updateQuestionOptions({
      question,
      options: this.draftOptions.length > 0 ? this.draftOptions : this.getQuestionOptions(),
      correctOption: null,
      correctOptions: nextCorrectOptions
    })
    this.emitQuestionChanged()
    this.requestUpdate()
  }

  private async deleteQuestion () {
    const question = this.question
    const logic = this.getQuestionLogic()
    const baseUrl = this.getBaseUrl()
    if (!question || !logic || !baseUrl) {
      return
    }

    await logic.deleteQuestionFromQuestionnaire({
      baseUrl,
      question
    })

    this.dispatchEvent(new CustomEvent('questionaire-question-deleted', {
      bubbles: true,
      composed: true,
      detail: { questionUri: question.uri }
    }))
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
    const options = this.draftOptions.length > 0 ? this.draftOptions : this.getQuestionOptions()
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
          <label>Question</label>
          <textarea
            class="questionaire-pane-create-question-multiple-choice-textarea"
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
            @blur=${(event: FocusEvent) => {
              void this.updateQuestionHint((event.currentTarget as HTMLInputElement).value)
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
                    @blur=${(event: FocusEvent) => {
                      void this.updateQuestionOption(index, (event.currentTarget as HTMLInputElement).value)
                    }}
                  />
                  <button
                    class="questionaire-pane-create-question-multiple-choice-option-correct ${this.allowMultipleCorrectAnswers ? 'questionaire-pane-create-question-multiple-choice-option-correct--checkbox' : ''}"
                    type="button"
                    aria-pressed=${isCorrect ? 'true' : 'false'}
                    @click=${() => {
                      if (this.allowMultipleCorrectAnswers) {
                        void this.toggleCorrectOption(option)
                        return
                      }
                      void this.setCorrectOption(option)
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
          .statusLabel=${'Changes not saved'}
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
