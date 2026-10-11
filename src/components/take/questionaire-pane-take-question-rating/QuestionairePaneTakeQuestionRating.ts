import { html } from 'lit'
import { consume } from '@lit/context'
import { property, state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import { type NamedNode } from 'rdflib'
import styles from './QuestionairePaneTakeQuestionRating.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../context'
import { readQuestionValue } from '../../../service/questionaireQuestionAccessors'

@customElement('questionaire-pane-take-question-rating')
export default class QuestionairePaneTakeQuestionRating extends WebComponent {
  static styles = styles

  @consume({ context: questionaireContext, subscribe: true })
  accessor questionaire: QuestionaireContext = undefined as unknown as QuestionaireContext

  @property({ attribute: false })
  accessor question: NamedNode | null = null

  @property({ attribute: false })
  accessor answer: string | null = null

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
    const values = ['1', '2', '3', '4', '5']

    return html`
      <section class="questionaire-pane-take-question-rating">
        <div class="questionaire-pane-take-question-rating-type">Confidence / Rating</div>
        <h2 class="questionaire-pane-take-question-rating-title">${title || 'Untitled question'}</h2>
        ${hint ? html`<p class="questionaire-pane-take-question-rating-hint">${hint}</p>` : html``}
        <div class="questionaire-pane-take-question-rating-options">
          ${values.map((value) => html`
            <button
              type="button"
              class="questionaire-pane-take-question-rating-option ${this.draftAnswer === value ? 'questionaire-pane-take-question-rating-option--selected' : ''}"
              @click=${() => this.syncAnswer(value)}
            >
              ${value}
            </button>
          `)}
        </div>
      </section>
    `
  }
}
