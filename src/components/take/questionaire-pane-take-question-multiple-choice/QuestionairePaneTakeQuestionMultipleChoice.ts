import { html } from 'lit'
import { consume } from '@lit/context'
import { property, state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import { type NamedNode } from 'rdflib'
import styles from './QuestionairePaneTakeQuestionMultipleChoice.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../context'
import { readQuestionValue, readQuestionValues } from '../../../service/questionaireQuestionAccessors'
import { shuffle } from '../../../service/shuffle'
import { renderFormattedText } from '../../shared/questionaire-pane-formatting'

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

  @state()
  private accessor shuffledOptions: string[] = []

  private loadedOptionsSignature = ''

  private getStore () {
    return this.questionaire?.store ?? null
  }

  private getQuestionTitle () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return ''
    }

    return readQuestionValue(store, question, 'title')
  }

  private getQuestionImage () {
    const store = this.getStore()
    const question = this.question
    return store && question ? readQuestionValue(store, question, 'image') : ''
  }

  private getQuestionOptions () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return []
    }

    const options = readQuestionValues(store, question, 'option')
    const correctOptions = readQuestionValues(store, question, 'correctOption')
    return [...options, ...correctOptions.filter((option) => !options.includes(option))]
  }

  private getDisplayedOptions () {
    const options = this.getQuestionOptions()
    const signature = options.join('\u0000')
    if (signature !== this.loadedOptionsSignature) {
      this.shuffledOptions = shuffle(options)
      this.loadedOptionsSignature = signature
    }
    return this.shuffledOptions
  }

  protected willUpdate () {
    const question = this.question
    if (!question) {
      return
    }

    if (this.loadedQuestionUri !== question.uri) {
      this.draftAnswer = this.answer
      this.loadedQuestionUri = question.uri
      this.loadedOptionsSignature = ''
      this.shuffledOptions = []
    }

    const options = this.getQuestionOptions()
    const signature = options.join('\u0000')
    if (signature !== this.loadedOptionsSignature) {
      this.shuffledOptions = shuffle(options)
      this.loadedOptionsSignature = signature
    }
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
    const image = this.getQuestionImage()
    const options = this.getDisplayedOptions()

    return html`
      <section class="questionaire-pane-take-question-multiple-choice">
        <div class="questionaire-pane-take-question-multiple-choice-type">${this.questionTypeLabel}</div>
        ${image ? html`<img class="questionaire-pane-question-image" src=${image} alt="" />` : ''}
        <h2 class="questionaire-pane-take-question-multiple-choice-title">${renderFormattedText(title || 'Untitled question')}</h2>
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
