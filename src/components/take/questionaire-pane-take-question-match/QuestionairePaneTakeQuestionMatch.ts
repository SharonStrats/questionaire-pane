import { html } from 'lit'
import { consume } from '@lit/context'
import { property, state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import { type NamedNode } from 'rdflib'
import styles from './QuestionairePaneTakeQuestionMatch.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../context'
import { readQuestionValue, readQuestionValues } from '../../../service/questionaireQuestionAccessors'
import { shuffle } from '../../../service/shuffle'
import { renderFormattedText } from '../../shared/questionaire-pane-formatting'
import '~icons/lucide/grip-vertical'
import '~icons/lucide/x'

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

  @state()
  private accessor shuffledRightItems: string[] = []

  private loadedRightItemsSignature = ''

  private draggedRightIndex: number | null = null

  private getTitle () {
    const store = this.questionaire?.store
    const question = this.question
    if (!store || !question) {
      return ''
    }

    return readQuestionValue(store, question, 'title')
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

  private getDisplayedRightItems () {
    const rightItems = this.getRightItems()
    const signature = rightItems.join('\u0000')
    if (signature !== this.loadedRightItemsSignature) {
      this.shuffledRightItems = shuffle(rightItems)
      this.loadedRightItemsSignature = signature
    }
    return this.shuffledRightItems
  }

  protected willUpdate () {
    const question = this.question
    if (!question) {
      return
    }

    if (this.loadedQuestionUri !== question.uri) {
      const leftItems = this.getLeftItems()
      this.draftAnswer = this.answer ?? leftItems.map((leftItem) => `${leftItem}|||`)
      this.loadedQuestionUri = question.uri
      this.loadedRightItemsSignature = ''
      this.shuffledRightItems = []
    }

    const rightItems = this.getRightItems()
    const signature = rightItems.join('\u0000')
    if (signature !== this.loadedRightItemsSignature) {
      this.shuffledRightItems = shuffle(rightItems)
      this.loadedRightItemsSignature = signature
    }
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

  private getMatchForField (index: number, matches: string[]): string {
    return (matches[index] ?? '').split('|||')[1] ?? ''
  }

  private handleDragStart (index: number, event: DragEvent) {
    this.draggedRightIndex = index
    event.dataTransfer?.setData('text/plain', String(index))
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
    }
  }

  private handleDrop (leftIndex: number, event: DragEvent) {
    event.preventDefault()
    const rightIndex = this.draggedRightIndex ?? Number(event.dataTransfer?.getData('text/plain'))
    this.draggedRightIndex = null

    const rightItems = this.getDisplayedRightItems()
    if (!Number.isInteger(rightIndex) || rightIndex < 0 || rightIndex >= rightItems.length) {
      return
    }

    this.setMatch(leftIndex, rightItems[rightIndex])
  }

  private handleDragEnd () {
    this.draggedRightIndex = null
  }

  private clearMatch (leftIndex: number) {
    const leftItems = this.getLeftItems()
    const current = this.draftAnswer.slice()
    current[leftIndex] = `${leftItems[leftIndex] ?? ''}|||`
    this.syncAnswer(current)
  }

  render() {
    const title = this.getTitle()
    const leftItems = this.getLeftItems()
    const rightItems = this.getDisplayedRightItems()
    const current = this.draftAnswer.length > 0 ? this.draftAnswer : leftItems.map((leftItem) => `${leftItem}|||`)
    const matchedValues = new Set(current.map((value) => value.split('|||')[1]).filter(Boolean))

    return html`
      <section class="questionaire-pane-take-question-match">
        <div class="questionaire-pane-take-question-match-type">Match</div>
        <h2 class="questionaire-pane-take-question-match-title">${renderFormattedText(title || 'Untitled question')}</h2>
        <div class="questionaire-pane-take-question-match-board">
          <div class="questionaire-pane-take-question-match-column">
            <div class="questionaire-pane-take-question-match-column-label">Fields</div>
            <div class="questionaire-pane-take-question-match-fields">
              ${leftItems.map((leftItem, index) => {
                const currentRight = this.getMatchForField(index, current)
                return html`
                  <div class="questionaire-pane-take-question-match-field-card">
                    <div class="questionaire-pane-take-question-match-field-heading">
                      <span class="questionaire-pane-take-question-match-index">${index + 1}</span>
                      <span class="questionaire-pane-take-question-match-field-label">${leftItem}</span>
                    </div>
                    <div
                      class=${currentRight
                        ? 'questionaire-pane-take-question-match-drop-zone questionaire-pane-take-question-match-drop-zone--filled'
                        : 'questionaire-pane-take-question-match-drop-zone'}
                      @dragover=${(event: DragEvent) => {
                        event.preventDefault()
                        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
                      }}
                      @drop=${(event: DragEvent) => this.handleDrop(index, event)}
                    >
                      ${currentRight
                        ? html`
                            <span class="questionaire-pane-take-question-match-check">✓</span>
                            <span>${currentRight}</span>
                            <button
                              type="button"
                              class="questionaire-pane-take-question-match-clear"
                              aria-label=${`Remove match for ${leftItem}`}
                              @click=${() => this.clearMatch(index)}
                            ><icon-lucide-x></icon-lucide-x></button>
                          `
                        : html`<span>Drop definition here</span>`}
                    </div>
                  </div>
                `
              })}
            </div>
          </div>
          <div class="questionaire-pane-take-question-match-column">
            <div class="questionaire-pane-take-question-match-column-label questionaire-pane-take-question-match-column-label--right">Drag definitions to a field</div>
            <div class="questionaire-pane-take-question-match-definitions">
              ${rightItems.map((rightItem, index) => {
                const isMatched = matchedValues.has(rightItem)
                return html`
                  <div
                    class=${isMatched
                      ? 'questionaire-pane-take-question-match-definition questionaire-pane-take-question-match-definition--matched'
                      : 'questionaire-pane-take-question-match-definition'}
                    draggable="true"
                    @dragstart=${(event: DragEvent) => this.handleDragStart(index, event)}
                    @dragend=${this.handleDragEnd}
                  >
                    <icon-lucide-grip-vertical class="questionaire-pane-take-question-match-definition-handle"></icon-lucide-grip-vertical>
                    <span class="questionaire-pane-take-question-match-definition-label">${rightItem}</span>
                    <span class="questionaire-pane-take-question-match-definition-status">${isMatched ? 'Matched' : 'Drag'}</span>
                  </div>
                `
              })}
            </div>
            <p class="questionaire-pane-take-question-match-instruction">On a touch device, tap a definition and then tap its destination.</p>
          </div>
        </div>
      </section>
    `
  }
}
