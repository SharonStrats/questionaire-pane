import { html } from 'lit'
import { consume } from '@lit/context'
import { property, state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import { Namespace, type NamedNode } from 'rdflib'
import styles from './QuestionairePaneTakeQuestionMultipleChoice.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../context'

const dct = Namespace('http://purl.org/dc/terms/')
const quiz = Namespace('http://example.org/ns/quiz#')

type AnswerValue = string | string[] | null

@customElement('questionaire-pane-take-question-multiple-choice')
export default class QuestionairePaneTakeQuestionMultipleChoice extends WebComponent {
  static styles = styles

  @consume({ context: questionaireContext, subscribe: true })
  accessor questionaire: QuestionaireContext = undefined as unknown as QuestionaireContext

  @property({ attribute: false })
  accessor question: NamedNode | null = null

  @property({ attribute: false })
  accessor answer: AnswerValue = null

  @property({ type: String, attribute: 'question-type-label' })
  accessor questionTypeLabel = 'Multiple choice'

  @property({ type: String, attribute: 'question-type-description' })
  accessor questionTypeDescription = 'Pick exactly one answer from the list.'

  @property({ type: Boolean, attribute: 'allow-multiple-selections' })
  accessor allowMultipleSelections = false

  @state()
  private accessor draftAnswer: AnswerValue = null

  @state()
  private accessor loadedQuestionUri: string | null = null

  private getStore () {
    return this.questionaire?.store ?? null
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

  protected willUpdate () {
    const question = this.question
    if (!question || this.loadedQuestionUri === question.uri) {
      return
    }

    this.draftAnswer = this.answer
    this.loadedQuestionUri = question.uri
  }

  private syncAnswer (nextAnswer: AnswerValue) {
    this.draftAnswer = nextAnswer
    const question = this.question
    if (!question) {
      return
    }

    this.dispatchEvent(new CustomEvent('questionaire-answer-changed', {
      bubbles: true,
      composed: true,
      detail: { questionUri: question.uri, answer: nextAnswer }
    }))
  }

  private handleChoice (option: string) {
    if (this.allowMultipleSelections) {
      const current = Array.isArray(this.draftAnswer) ? this.draftAnswer : []
      const next = current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option]
      this.syncAnswer(next)
      return
    }

    this.syncAnswer(option)
  }

  private isSelected (option: string) {
    if (this.allowMultipleSelections) {
      return Array.isArray(this.draftAnswer) && this.draftAnswer.includes(option)
    }

    return this.draftAnswer === option
  }

  render() {
    const title = this.getQuestionTitle()
    const hint = this.getQuestionHint()
    const options = this.getQuestionOptions()

    return html`
      <section class="questionaire-pane-take-question-multiple-choice">
        <div class="questionaire-pane-take-question-multiple-choice-type">${this.questionTypeLabel}</div>
        <h2 class="questionaire-pane-take-question-multiple-choice-title">${title || 'Untitled question'}</h2>
        ${hint
          ? html`<p class="questionaire-pane-take-question-multiple-choice-hint">${hint}</p>`
          : html``}
        <div class="questionaire-pane-take-question-multiple-choice-options">
          ${options.map((option) => html`
            <label class="questionaire-pane-take-question-multiple-choice-option ${this.isSelected(option) ? 'questionaire-pane-take-question-multiple-choice-option--selected' : ''}">
              <input
                type=${this.allowMultipleSelections ? 'checkbox' : 'radio'}
                name=${this.question?.uri ?? 'question'}
                .checked=${this.isSelected(option)}
                @change=${() => this.handleChoice(option)}
              />
              <span class="questionaire-pane-take-question-multiple-choice-option-control ${this.allowMultipleSelections ? 'questionaire-pane-take-question-multiple-choice-option-control--checkbox' : 'questionaire-pane-take-question-multiple-choice-option-control--radio'} ${this.isSelected(option) ? 'questionaire-pane-take-question-multiple-choice-option-control--selected' : ''}"></span>
              <span class="questionaire-pane-take-question-multiple-choice-option-label">${option}</span>
            </label>
          `)}
        </div>
        <p class="questionaire-pane-take-question-multiple-choice-note">
          ${this.allowMultipleSelections ? 'Select all answers that apply.' : 'Select one answer.'}
        </p>
      </section>
    `
  }
}
