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

@customElement('questionaire-pane-take-question-text-response')
export default class QuestionairePaneTakeQuestionTextResponse extends WebComponent {
  static styles = styles

  @consume({ context: questionaireContext, subscribe: true })
  accessor questionaire: QuestionaireContext = undefined as unknown as QuestionaireContext

  @property({ attribute: false })
  accessor question: NamedNode | null = null

  @property({ attribute: false })
  accessor answer: string | null = null

  @property({ type: Boolean, attribute: 'multiline' })
  accessor multiline = false

  @property({ type: String, attribute: 'question-type-label' })
  accessor questionTypeLabel = 'Answer'

  @property({ type: String, attribute: 'question-type-description' })
  accessor questionTypeDescription = 'Type your response.'

  @state()
  private accessor draftAnswer = ''

  @state()
  private accessor loadedQuestionUri: string | null = null

  @state()
  private accessor semanticStatus: 'idle' | 'checking' | 'correct' | 'incorrect' | 'unavailable' = 'idle'

  private getTitle () {
    const store = this.questionaire?.store
    const question = this.question
    if (!store || !question) {
      return ''
    }

    return readQuestionValue(store, question, 'title')
  }

  private getHint () {
    const store = this.questionaire?.store
    const question = this.question
    if (!store || !question) {
      return ''
    }

    return readQuestionValue(store, question, 'hint')
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

    this.draftAnswer = this.answer ?? ''
    this.loadedQuestionUri = question.uri
    this.semanticStatus = 'idle'
  }

  private syncAnswer (value: string) {
    this.draftAnswer = value
    this.semanticStatus = 'idle'
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

    this.semanticStatus = 'checking'
    try {
      const service = await loadQuizAiService()
      const evaluation = await service.evaluateShortAnswer(this.draftAnswer, expectedAnswers)
      this.semanticStatus = evaluation.correct ? 'correct' : 'incorrect'
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
      this.semanticStatus = 'unavailable'
      console.error('Unable to evaluate short answer', error)
    }
  }

  render() {
    const title = this.getTitle()
    const hint = this.getHint()
    const image = this.getImage()

    return html`
      <section class="questionaire-pane-take-question-text-response">
        <div class="questionaire-pane-take-question-text-response-type">${this.questionTypeLabel}</div>
        ${image ? html`<img class="questionaire-pane-question-image" src=${image} alt="" />` : ''}
        <h2 class="questionaire-pane-take-question-text-response-title">${title || 'Untitled question'}</h2>
        ${hint ? html`<p class="questionaire-pane-take-question-text-response-hint">${hint}</p>` : html``}
        ${this.multiline
          ? html`
              <textarea
                class="questionaire-pane-take-question-text-response-input questionaire-pane-take-question-text-response-input--textarea"
                placeholder=${this.questionTypeDescription}
                .value=${this.draftAnswer}
                @input=${(event: Event) => this.syncAnswer((event.currentTarget as HTMLTextAreaElement).value)}
                @blur=${() => { void this.checkShortAnswer() }}
              ></textarea>
            `
          : html`
              <input
                class="questionaire-pane-take-question-text-response-input"
                type="text"
                placeholder=${this.questionTypeDescription}
                .value=${this.draftAnswer}
                @input=${(event: Event) => this.syncAnswer((event.currentTarget as HTMLInputElement).value)}
                @blur=${() => { void this.checkShortAnswer() }}
              />
            `}
        ${this.semanticStatus === 'checking'
          ? html`<p class="questionaire-pane-take-question-text-response-feedback">Checking your answer…</p>`
          : this.semanticStatus === 'correct'
          ? html`<p class="questionaire-pane-take-question-text-response-feedback questionaire-pane-take-question-text-response-feedback--correct">This answer looks correct.</p>`
          : this.semanticStatus === 'incorrect'
          ? html`<p class="questionaire-pane-take-question-text-response-feedback questionaire-pane-take-question-text-response-feedback--incorrect">This answer may need another look.</p>`
          : this.semanticStatus === 'unavailable'
          ? html`<p class="questionaire-pane-take-question-text-response-feedback">Answer checking is unavailable, so the response will use the normal exact-match score.</p>`
          : html``}
      </section>
    `
  }
}
