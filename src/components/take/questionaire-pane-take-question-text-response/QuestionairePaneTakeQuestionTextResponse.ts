import { html } from 'lit'
import { consume } from '@lit/context'
import { property, state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import { Namespace, type NamedNode } from 'rdflib'
import styles from './QuestionairePaneTakeQuestionTextResponse.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../context'

const dct = Namespace('http://purl.org/dc/terms/')
const quiz = Namespace('http://example.org/ns/quiz#')

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

  private getTitle () {
    const store = this.questionaire?.store
    const question = this.question
    if (!store || !question) {
      return ''
    }

    return store.any(question, dct('title'), undefined, question.doc())?.value ?? ''
  }

  private getHint () {
    const store = this.questionaire?.store
    const question = this.question
    if (!store || !question) {
      return ''
    }

    return store.any(question, quiz('hint'), undefined, question.doc())?.value ?? ''
  }

  protected willUpdate () {
    const question = this.question
    if (!question || this.loadedQuestionUri === question.uri) {
      return
    }

    this.draftAnswer = this.answer ?? ''
    this.loadedQuestionUri = question.uri
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

  render() {
    const title = this.getTitle()
    const hint = this.getHint()

    return html`
      <section class="questionaire-pane-take-question-text-response">
        <div class="questionaire-pane-take-question-text-response-type">${this.questionTypeLabel}</div>
        <h2 class="questionaire-pane-take-question-text-response-title">${title || 'Untitled question'}</h2>
        ${hint ? html`<p class="questionaire-pane-take-question-text-response-hint">${hint}</p>` : html``}
        ${this.multiline
          ? html`
              <textarea
                class="questionaire-pane-take-question-text-response-input questionaire-pane-take-question-text-response-input--textarea"
                placeholder=${this.questionTypeDescription}
                .value=${this.draftAnswer}
                @input=${(event: Event) => this.syncAnswer((event.currentTarget as HTMLTextAreaElement).value)}
              ></textarea>
            `
          : html`
              <input
                class="questionaire-pane-take-question-text-response-input"
                type="text"
                placeholder=${this.questionTypeDescription}
                .value=${this.draftAnswer}
                @input=${(event: Event) => this.syncAnswer((event.currentTarget as HTMLInputElement).value)}
              />
            `}
      </section>
    `
  }
}
