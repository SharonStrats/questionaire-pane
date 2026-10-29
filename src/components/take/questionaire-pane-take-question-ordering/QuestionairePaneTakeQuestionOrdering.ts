import { html, type PropertyValues } from 'lit'
import { consume } from '@lit/context'
import { property, state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import { type NamedNode } from 'rdflib'
import styles from './QuestionairePaneTakeQuestionOrdering.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../context'
import { readQuestionValue, readQuestionValues } from '../../../service/questionaireQuestionAccessors'
import { shuffleDifferent } from '../../../service/shuffle'
import { renderFormattedText } from '../../shared/questionaire-pane-formatting'
import 'solid-ui/components/button'
import '~icons/lucide/grip-vertical'

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

  private initialAnswerToEmit: string[] | null = null
  private draggedItemIndex: number | null = null
  private dropTargetIndex: number | null = null
  private touchPointerId: number | null = null

  private getTitle () {
    const store = this.questionaire?.store
    const question = this.question
    if (!store || !question) {
      return ''
    }

    return readQuestionValue(store, question, 'title')
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

    this.draftAnswer = this.answer?.length ? this.answer : shuffleDifferent(this.getItems())
    this.initialAnswerToEmit = this.answer?.length ? null : this.draftAnswer.slice()
    this.loadedQuestionUri = question.uri
  }

  protected updated (changedProperties: PropertyValues) {
    if (!changedProperties.has('question') || !this.question || !this.initialAnswerToEmit) {
      return
    }

    const answer = this.initialAnswerToEmit
    this.initialAnswerToEmit = null
    this.dispatchAnswer(answer)
  }

  private dispatchAnswer (value: string[]) {
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

  private syncAnswer (value: string[]) {
    this.draftAnswer = value
    this.dispatchAnswer(value)
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

  private handleDragStart (index: number, event: DragEvent) {
    this.draggedItemIndex = index
    this.dropTargetIndex = index
    event.dataTransfer?.setData('text/plain', String(index))
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move'
    }
  }

  private handleDrop (targetIndex: number, event: DragEvent) {
    event.preventDefault()
    const sourceIndex = this.draggedItemIndex ?? Number(event.dataTransfer?.getData('text/plain'))
    this.draggedItemIndex = null
    this.dropTargetIndex = null

    if (!Number.isInteger(sourceIndex) || sourceIndex < 0 || sourceIndex >= this.draftAnswer.length || sourceIndex === targetIndex) {
      return
    }

    const next = this.draftAnswer.slice()
    const [item] = next.splice(sourceIndex, 1)
    next.splice(targetIndex, 0, item)
    this.syncAnswer(next)
  }

  private handleDragEnd () {
    this.draggedItemIndex = null
    this.dropTargetIndex = null
  }

  private handleDragEnter (index: number) {
    if (this.draggedItemIndex !== null) {
      this.dropTargetIndex = index
    }
  }

  private handleDragOver (index: number, event: DragEvent) {
    event.preventDefault()
    this.handleDragEnter(index)
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move'
    }
  }

  private updateTouchDropTarget (event: PointerEvent) {
    const target = (event.currentTarget as HTMLElement).ownerDocument
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest('[data-questionaire-ordering-index]') as HTMLElement | null
    const nextIndex = Number(target?.dataset.questionaireOrderingIndex)
    if (Number.isInteger(nextIndex)) {
      this.dropTargetIndex = nextIndex
      this.requestUpdate()
    }
  }

  private handlePointerDown (index: number, event: PointerEvent) {
    if (event.pointerType !== 'touch') {
      return
    }

    event.preventDefault()
    this.draggedItemIndex = index
    this.dropTargetIndex = index
    this.touchPointerId = event.pointerId
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  }

  private handlePointerMove (event: PointerEvent) {
    if (event.pointerType !== 'touch' || this.touchPointerId !== event.pointerId || this.draggedItemIndex === null) {
      return
    }

    event.preventDefault()
    this.updateTouchDropTarget(event)
  }

  private handlePointerUp (event: PointerEvent) {
    if (event.pointerType !== 'touch' || this.touchPointerId !== event.pointerId) {
      return
    }

    event.preventDefault()
    this.updateTouchDropTarget(event)
    const sourceIndex = this.draggedItemIndex
    const targetIndex = this.dropTargetIndex
    ;(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId)
    this.touchPointerId = null
    this.draggedItemIndex = null
    this.dropTargetIndex = null

    if (sourceIndex === null || targetIndex === null || sourceIndex === targetIndex) {
      return
    }

    const next = this.draftAnswer.slice()
    const [item] = next.splice(sourceIndex, 1)
    next.splice(targetIndex, 0, item)
    this.syncAnswer(next)
  }

  private handlePointerCancel (event: PointerEvent) {
    if (event.pointerType !== 'touch' || this.touchPointerId !== event.pointerId) {
      return
    }

    this.touchPointerId = null
    this.draggedItemIndex = null
    this.dropTargetIndex = null
  }

  render() {
    const title = this.getTitle()
    const items = this.draftAnswer.length > 0 ? this.draftAnswer : this.getItems()

    return html`
      <section class="questionaire-pane-take-question-ordering">
        <div class="questionaire-pane-take-question-ordering-type">Ordering</div>
        <h2 class="questionaire-pane-take-question-ordering-title">${renderFormattedText(title || 'Untitled question')}</h2>
        <div class="questionaire-pane-take-question-ordering-list">
          ${items.map((item, index) => html`
            <div
              class="questionaire-pane-take-question-ordering-item ${this.dropTargetIndex === index ? 'questionaire-pane-take-question-ordering-item--drop-target' : ''}"
              data-questionaire-ordering-index=${index}
              draggable="true"
              @dragstart=${(event: DragEvent) => this.handleDragStart(index, event)}
              @dragend=${this.handleDragEnd}
              @dragenter=${() => this.handleDragEnter(index)}
              @dragover=${(event: DragEvent) => this.handleDragOver(index, event)}
              @drop=${(event: DragEvent) => this.handleDrop(index, event)}
              @pointerdown=${(event: PointerEvent) => this.handlePointerDown(index, event)}
              @pointermove=${(event: PointerEvent) => this.handlePointerMove(event)}
              @pointerup=${(event: PointerEvent) => this.handlePointerUp(event)}
              @pointercancel=${(event: PointerEvent) => this.handlePointerCancel(event)}
            >
              <solid-ui-button
                class="questionaire-pane-take-question-ordering-item-handle"
                variant="ghost"
                aria-label=${`Move item ${index + 1}`}
                title="Drag to reorder"
                @keydown=${(event: KeyboardEvent) => {
                  if (event.key === 'ArrowUp' && index > 0) {
                    event.preventDefault()
                    this.moveItem(index, -1)
                  } else if (event.key === 'ArrowDown' && index < items.length - 1) {
                    event.preventDefault()
                    this.moveItem(index, 1)
                  }
                }}
              ><icon-lucide-grip-vertical slot="icon"></icon-lucide-grip-vertical></solid-ui-button>
              <span class="questionaire-pane-take-question-ordering-item-index">${index + 1}</span>
              <span class="questionaire-pane-take-question-ordering-item-label">${item}</span>
            </div>
          `)}
        </div>
      </section>
    `
  }
}
