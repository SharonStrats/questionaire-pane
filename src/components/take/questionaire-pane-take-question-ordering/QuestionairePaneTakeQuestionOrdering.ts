import { html } from 'lit'
import { consume } from '@lit/context'
import { property, state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import { type NamedNode } from 'rdflib'
import styles from './QuestionairePaneTakeQuestionOrdering.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../context'
import { readQuestionValue, readQuestionValues } from '../../../service/questionaireQuestionAccessors'

@customElement('questionaire-pane-take-question-ordering')
export default class QuestionairePaneTakeQuestionOrdering extends WebComponent {
  static styles = styles

  @consume({ context: questionaireContext, subscribe: true })
  accessor questionaire: QuestionaireContext = undefined as unknown as QuestionaireContext

  @property({ attribute: false })
  accessor question: NamedNode | null = null

  @property({ attribute: false })
  accessor answer: string[] | null = null

  @state()
  private accessor draftAnswer: string[] = []

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

  private getItems () {
    const store = this.questionaire?.store
    const question = this.question
    if (!store || !question) {
      return []
    }

    const items = readQuestionValues(store, question, 'item')
    return items.length > 0 ? items : ['Step 1', 'Step 2', 'Step 3']
  }

  protected willUpdate () {
    const question = this.question
    if (!question || this.loadedQuestionUri === question.uri) {
      return
    }

    this.draftAnswer = this.answer ?? this.getItems()
    this.loadedQuestionUri = question.uri
  }

  private syncAnswer (value: string[]) {
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

  private moveItem (index: number, direction: -1 | 1) {
    const next = this.draftAnswer.slice()
    const target = index + direction
    if (target < 0 || target >= next.length) {
      return
    }
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    this.syncAnswer(next)
  }

  render() {
    const title = this.getTitle()
    const hint = this.getHint()
    const items = this.draftAnswer.length > 0 ? this.draftAnswer : this.getItems()

    return html`
      <section class="questionaire-pane-take-question-ordering">
        <div class="questionaire-pane-take-question-ordering-type">Ordering</div>
        <h2 class="questionaire-pane-take-question-ordering-title">${title || 'Untitled question'}</h2>
        ${hint ? html`<p class="questionaire-pane-take-question-ordering-hint">${hint}</p>` : html``}
        <div class="questionaire-pane-take-question-ordering-list">
          ${items.map((item, index) => html`
            <div class="questionaire-pane-take-question-ordering-item">
              <span class="questionaire-pane-take-question-ordering-item-index">${index + 1}</span>
              <span class="questionaire-pane-take-question-ordering-item-label">${item}</span>
              <div class="questionaire-pane-take-question-ordering-item-actions">
                <button type="button" @click=${() => this.moveItem(index, -1)} ?disabled=${index === 0}>↑</button>
                <button type="button" @click=${() => this.moveItem(index, 1)} ?disabled=${index === items.length - 1}>↓</button>
              </div>
            </div>
          `)}
        </div>
      </section>
    `
  }
}
