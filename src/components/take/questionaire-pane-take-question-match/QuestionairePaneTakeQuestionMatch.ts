import { html } from 'lit'
import { consume } from '@lit/context'
import { property, state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import { type NamedNode } from 'rdflib'
import styles from './QuestionairePaneTakeQuestionMatch.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../context'
import { readQuestionValue, readQuestionValues } from '../../../service/questionaireQuestionAccessors'

@customElement('questionaire-pane-take-question-match')
export default class QuestionairePaneTakeQuestionMatch extends WebComponent {
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

  private getLeftItems () {
    const store = this.questionaire?.store
    const question = this.question
    if (!store || !question) {
      return []
    }

    const items = readQuestionValues(store, question, 'leftItem')
    return items.length > 0 ? items : ['Roots', 'Leaves']
  }

  private getRightItems () {
    const store = this.questionaire?.store
    const question = this.question
    if (!store || !question) {
      return []
    }

    const items = readQuestionValues(store, question, 'rightItem')
    return items.length > 0 ? items : ['Absorb water', 'Make food']
  }

  protected willUpdate () {
    const question = this.question
    if (!question || this.loadedQuestionUri === question.uri) {
      return
    }

    const leftItems = this.getLeftItems()
    const rightItems = this.getRightItems()
    this.draftAnswer = this.answer ?? leftItems.map((_left, index) => `${leftItems[index] ?? ''}|||${rightItems[index] ?? rightItems[0] ?? ''}`)
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

  private setMatch (index: number, rightValue: string) {
    const leftItems = this.getLeftItems()
    const current = this.draftAnswer.slice()
    current[index] = `${leftItems[index] ?? ''}|||${rightValue}`
    this.syncAnswer(current)
  }

  render() {
    const title = this.getTitle()
    const hint = this.getHint()
    const leftItems = this.getLeftItems()
    const rightItems = this.getRightItems()
    const current = this.draftAnswer.length > 0 ? this.draftAnswer : leftItems.map((_left, index) => `${leftItems[index] ?? ''}|||${rightItems[index] ?? rightItems[0] ?? ''}`)

    return html`
      <section class="questionaire-pane-take-question-match">
        <div class="questionaire-pane-take-question-match-type">Match</div>
        <h2 class="questionaire-pane-take-question-match-title">${title || 'Untitled question'}</h2>
        ${hint ? html`<p class="questionaire-pane-take-question-match-hint">${hint}</p>` : html``}
        <div class="questionaire-pane-take-question-match-list">
          ${leftItems.map((leftItem, index) => {
            const currentRight = (current[index] ?? '').split('|||')[1] ?? rightItems[0] ?? ''
            return html`
              <div class="questionaire-pane-take-question-match-item">
                <span class="questionaire-pane-take-question-match-item-left">${leftItem}</span>
                <span class="questionaire-pane-take-question-match-item-arrow">→</span>
                <select
                  class="questionaire-pane-take-question-match-item-select"
                  .value=${currentRight}
                  @change=${(event: Event) => this.setMatch(index, (event.currentTarget as HTMLSelectElement).value)}
                >
                  ${rightItems.map((rightItem) => html`<option value=${rightItem}>${rightItem}</option>`)}
                </select>
              </div>
            `
          })}
        </div>
      </section>
    `
  }
}
