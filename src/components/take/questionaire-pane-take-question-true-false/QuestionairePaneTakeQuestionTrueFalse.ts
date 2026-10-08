import { html } from 'lit'
import { consume } from '@lit/context'
import { property, state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import { Namespace, type NamedNode } from 'rdflib'
import styles from './QuestionairePaneTakeQuestionTrueFalse.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../context'

const dct = Namespace('http://purl.org/dc/terms/')
const quiz = Namespace('http://example.org/ns/quiz#')

type AnswerValue = string | null

@customElement('questionaire-pane-take-question-true-false')
export default class QuestionairePaneTakeQuestionTrueFalse extends WebComponent {
  static styles = styles

  @consume({ context: questionaireContext, subscribe: true })
  accessor questionaire: QuestionaireContext = undefined as unknown as QuestionaireContext

  @property({ attribute: false })
  accessor question: NamedNode | null = null

  @property({ attribute: false })
  accessor answer: AnswerValue = null

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

  render() {
    const title = this.getQuestionTitle()
    const hint = this.getQuestionHint()
    const selected = this.draftAnswer

    return html`
      <section class="questionaire-pane-take-question-true-false">
        <div class="questionaire-pane-take-question-true-false-type">True / False</div>
        <h2 class="questionaire-pane-take-question-true-false-title">${title || 'Untitled question'}</h2>
        ${hint
          ? html`<p class="questionaire-pane-take-question-true-false-hint">${hint}</p>`
          : html``}
        <div class="questionaire-pane-take-question-true-false-options">
          <button
            class="questionaire-pane-take-question-true-false-option ${selected === 'true' ? 'questionaire-pane-take-question-true-false-option--selected' : ''}"
            type="button"
            @click=${() => this.syncAnswer('true')}
          >
            True
          </button>
          <button
            class="questionaire-pane-take-question-true-false-option ${selected === 'false' ? 'questionaire-pane-take-question-true-false-option--selected' : ''}"
            type="button"
            @click=${() => this.syncAnswer('false')}
          >
            False
          </button>
        </div>
      </section>
    `
  }
}
