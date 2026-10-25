import { html } from 'lit'
import { consume } from '@lit/context'
import { property, state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import { type NamedNode } from 'rdflib'
import styles from './QuestionairePaneTakeQuestionTextResponse.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../context'
import { readQuestionValue, readQuestionValues } from '../../../service/questionaireQuestionAccessors'
import { loadQuizAiService } from '../../../service/quizAiService'
import { getQuestionnaireFormat } from '../../../service/questionaireQuestionQueries'
import { renderFormattedText } from '../../shared/questionaire-pane-formatting'

@customElement('questionaire-pane-take-question-text-response')
export default class QuestionairePaneTakeQuestionTextResponse extends WebComponent {
  static styles = styles

  @consume({ context: questionaireContext, subscribe: true })
  accessor questionaire: QuestionaireContext = undefined as unknown as QuestionaireContext

  @property({ attribute: false })
  accessor question: NamedNode | null = null

  @property({ attribute: false })
  accessor answer: string | string[] | null = null

  @property({ type: Boolean, attribute: 'multiline' })
  accessor multiline = false

  @property({ type: String, attribute: 'question-type-label' })
  accessor questionTypeLabel = 'Answer'

  @property({ type: String, attribute: 'question-type-description' })
  accessor questionTypeDescription = 'Type your response.'

  @state()
  private accessor draftAnswer = ''

  @state()
  private accessor draftBlankAnswers: string[] = []

  @state()
  private accessor loadedQuestionUri: string | null = null

  private getTitle () {
    const store = this.questionaire?.store
    const question = this.question
    if (!store || !question) {
      return ''
    }

    return readQuestionValue(store, question, 'title')
  }

  private getImage () {
    const store = this.questionaire?.store
    const question = this.question
    return store && question ? readQuestionValue(store, question, 'image') : ''
  }

  protected willUpdate () {
    const question = this.question
    if (!question || this.loadedQuestionUri === question.uri) {
      return
    }

    const answerValues = Array.isArray(this.answer)
      ? this.answer
      : this.answer
        ? [this.answer]
        : []
    this.draftAnswer = typeof this.answer === 'string' ? this.answer : ''
    this.draftBlankAnswers = Array.from(
      { length: this.getBlankCount(this.getTitle()) },
      (_, index) => answerValues[index] ?? ''
    )
    this.loadedQuestionUri = question.uri
  }

  private getBlankCount (title: string) {
    return Math.max(1, title.match(/\[_{2,}\]|_{3,}/g)?.length ?? 0)
  }

  private isFillInTheBlank () {
    return this.questionTypeLabel === 'Fill in the Blank'
  }

  private syncAnswer (value: string) {
    this.draftAnswer = value
    const question = this.question
    if (!question) {
      return
    }

    this.dispatchEvent(new CustomEvent('questionaire-answer-changed', {
      bubbles: true,
      composed: true,
      detail: { questionUri: question.uri, answer: value }
    }))
  }

  private syncBlankAnswer (index: number, value: string) {
    const answers = this.draftBlankAnswers.slice()
    answers[index] = value
    this.draftBlankAnswers = answers

    const question = this.question
    if (!question) {
      return
    }

    this.dispatchEvent(new CustomEvent('questionaire-answer-changed', {
      bubbles: true,
      composed: true,
      detail: { questionUri: question.uri, answer: answers }
    }))
  }

  private renderFillInTheBlank (text: string) {
    const parts = text.split(/(\[_{2,}\]|_{3,})/)
    let blankIndex = 0

    return parts.map((part) => {
      if (!/^(\[_{2,}\]|_{3,})$/.test(part)) {
        return part
      }

      const index = blankIndex++
      return html`
        <input
          class="questionaire-pane-take-question-text-response-blank"
          type="text"
          aria-label=${`Blank ${index + 1}`}
          .value=${this.draftBlankAnswers[index] ?? ''}
          @input=${(event: Event) => this.syncBlankAnswer(index, (event.currentTarget as HTMLInputElement).value)}
        />
      `
    })
  }

  private async checkShortAnswer () {
    const store = this.questionaire?.store
    const subject = this.questionaire?.subject
    if (this.questionTypeLabel !== 'Short Answer' || !this.question || !this.draftAnswer.trim() || !store || !subject ||
        getQuestionnaireFormat(store, subject) !== 'quiz') {
      return
    }

    const expectedAnswers = readQuestionValues(store, this.question, 'answer')
    if (expectedAnswers.length === 0) {
      return
    }

    try {
      const service = await loadQuizAiService()
      const evaluation = await service.evaluateShortAnswer(this.draftAnswer, expectedAnswers)
      this.dispatchEvent(new CustomEvent('questionaire-answer-evaluated', {
        bubbles: true,
        composed: true,
        detail: {
          questionUri: this.question.uri,
          correct: evaluation.correct,
          confidence: evaluation.confidence
        }
      }))
    } catch (error) {
      console.error('Unable to evaluate short answer', error)
    }
  }

  render() {
    const title = this.getTitle()
    const image = this.getImage()
    const fillInTheBlank = this.isFillInTheBlank()
    const fillInTheBlankText = title

    return html`
      <section class="questionaire-pane-take-question-text-response${fillInTheBlank ? ' questionaire-pane-take-question-text-response--fill-in-the-blank' : ''}">
        <div class="questionaire-pane-take-question-text-response-type">${this.questionTypeLabel}</div>
        ${image ? html`<img class="questionaire-pane-question-image" src=${image} alt="" />` : ''}
        ${fillInTheBlank
          ? html`
              <h2 class="questionaire-pane-take-question-text-response-title">${renderFormattedText(title || 'Untitled question')}</h2>
              <div class="questionaire-pane-take-question-text-response-question-body">
                ${this.renderFillInTheBlank(fillInTheBlankText || 'Complete the sentence.')}
              </div>
            `
          : html`
            <h2 class="questionaire-pane-take-question-text-response-title">${renderFormattedText(title || 'Untitled question')}</h2>
          `}
        ${!fillInTheBlank && this.multiline
          ? html`
              <textarea
                class="questionaire-pane-take-question-text-response-input questionaire-pane-take-question-text-response-input--textarea"
                placeholder=${this.questionTypeDescription}
                .value=${this.draftAnswer}
                @input=${(event: Event) => this.syncAnswer((event.currentTarget as HTMLTextAreaElement).value)}
                @blur=${() => { void this.checkShortAnswer() }}
              ></textarea>
            `
          : !fillInTheBlank
            ? html`
              <input
                class="questionaire-pane-take-question-text-response-input"
                type="text"
                placeholder=${this.questionTypeDescription}
                .value=${this.draftAnswer}
                @input=${(event: Event) => this.syncAnswer((event.currentTarget as HTMLInputElement).value)}
                @blur=${() => { void this.checkShortAnswer() }}
              />
            `
            : html``}
      </section>
    `
  }
}
