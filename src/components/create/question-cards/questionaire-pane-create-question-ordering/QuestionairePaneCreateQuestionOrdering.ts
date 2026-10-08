import { html } from 'lit'
import { consume } from '@lit/context'
import { property, state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import { Namespace, type NamedNode } from 'rdflib'
import styles from './QuestionairePaneCreateQuestionOrdering.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../../context'
import { createQuestionaireLogic } from '../../../../service/questionaireLogic'
import '../questionaire-pane-create-question-header/QuestionairePaneCreateQuestionHeader'
import '../questionaire-pane-create-question-footer/QuestionairePaneCreateQuestionFooter'
import '~icons/lucide/chevron-down'
import '~icons/lucide/info'

const dct = Namespace('http://purl.org/dc/terms/')
const quiz = Namespace('http://example.org/ns/quiz#')

@customElement('questionaire-pane-create-question-ordering')
export default class QuestionairePaneCreateQuestionOrdering extends WebComponent {
  static styles = styles

  @consume({ context: questionaireContext, subscribe: true })
  accessor questionaire: QuestionaireContext = undefined as unknown as QuestionaireContext

  @property({ attribute: false })
  accessor question: NamedNode | null = null

  @state()
  private accessor draftTitle = ''

  @state()
  private accessor draftHint = ''

  @state()
  private accessor draftPoints = '1'

  @state()
  private accessor draftItems: string[] = []

  @state()
  private accessor loadedQuestionUri: string | null = null

  private getBaseUrl () {
    const questionaire = this.questionaire ?? { subject: null }
    const subject = questionaire.subject
    if (!subject) {
      return null
    }

    return subject.doc().uri.replace(/index\.ttl$/, '')
  }

  private getStore () {
    return this.questionaire?.store ?? null
  }

  private getQuestionLogic () {
    const store = this.getStore()
    if (!store) {
      return null
    }

    return createQuestionaireLogic(store)
  }

  protected willUpdate () {
    const question = this.question
    if (!question || this.loadedQuestionUri === question.uri) {
      return
    }

    this.draftTitle = this.getQuestionTitle()
    this.draftHint = this.getQuestionHint()
    this.draftPoints = String(this.getQuestionPoints())
    this.draftItems = this.getQuestionItems()
    this.loadedQuestionUri = question.uri
  }

  private getQuestionNumber () {
    const question = this.question
    if (!question) {
      return 1
    }

    const match = question.uri.match(/q(\d+)\.ttl$/)
    return match ? Number(match[1]) : 1
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

  private getQuestionPoints () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return 1
    }

    const raw = store.any(question, quiz('points'), undefined, question.doc())?.value ?? '1'
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) ? parsed : 1
  }

  private getQuestionItems () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return []
    }

    const items = store.statementsMatching(question, quiz('item'), undefined, question.doc())
      .map((statement) => statement.object.value)

    return items.length > 0 ? items : ['Step 1', 'Step 2', 'Step 3']
  }

  private emitQuestionChanged () {
    const question = this.question
    if (!question) {
      return
    }

    this.dispatchEvent(new CustomEvent('questionaire-question-updated', {
      bubbles: true,
      composed: true,
      detail: { questionUri: question.uri }
    }))
  }

  private async persistQuestionCard () {
    const question = this.question
    const logic = this.getQuestionLogic()
    if (!question || !logic) {
      return
    }

    const title = this.draftTitle.trim()
    const hint = this.draftHint.trim()
    const points = Number.parseInt(this.draftPoints, 10)
    const items = this.draftItems.length > 0 ? this.draftItems : ['Step 1', 'Step 2', 'Step 3']

    await logic.updateQuestionText({ question, title })
    await logic.updateQuestionHint({ question, hint })
    await logic.updateQuestionPoints({ question, points: Number.isFinite(points) ? points : 0 })
    await logic.updateQuestionItems({ question, items })

    this.emitQuestionChanged()
    this.dispatchEvent(new CustomEvent('questionaire-question-saved', {
      bubbles: true,
      composed: true,
      detail: { questionUri: question.uri }
    }))
  }

  private async updateQuestionTitle (value: string) {
    const question = this.question
    const logic = this.getQuestionLogic()
    if (!question || !logic) {
      return
    }

    this.draftTitle = value
    await logic.updateQuestionText({ question, title: value })
    this.emitQuestionChanged()
    this.requestUpdate()
  }

  private async updateQuestionHint (value: string) {
    const question = this.question
    const logic = this.getQuestionLogic()
    if (!question || !logic) {
      return
    }

    this.draftHint = value
    await logic.updateQuestionHint({ question, hint: value })
    this.emitQuestionChanged()
    this.requestUpdate()
  }

  private async updateItem (index: number, value: string) {
    const question = this.question
    const logic = this.getQuestionLogic()
    if (!question || !logic) {
      return
    }

    const items = this.draftItems.slice()
    items[index] = value
    this.draftItems = items
    await logic.updateQuestionItems({ question, items })
    this.emitQuestionChanged()
    this.requestUpdate()
  }

  private async addItem () {
    const question = this.question
    const logic = this.getQuestionLogic()
    if (!question || !logic) {
      return
    }

    const items = this.draftItems.length > 0 ? this.draftItems.slice() : this.getQuestionItems().slice()
    items.push(`Step ${items.length + 1}`)
    this.draftItems = items
    await logic.updateQuestionItems({ question, items })
    this.emitQuestionChanged()
    this.requestUpdate()
  }

  private async deleteQuestion () {
    const question = this.question
    const logic = this.getQuestionLogic()
    const baseUrl = this.getBaseUrl()
    if (!question || !logic || !baseUrl) {
      return
    }

    await logic.deleteQuestionFromQuestionnaire({
      baseUrl,
      question
    })

    this.dispatchEvent(new CustomEvent('questionaire-question-deleted', {
      bubbles: true,
      composed: true,
      detail: { questionUri: question.uri }
    }))
  }

  render() {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return html``
    }

    const title = this.draftTitle
    const hint = this.draftHint || this.getQuestionHint()
    const points = this.draftPoints || String(this.getQuestionPoints())
    const items = this.draftItems.length > 0 ? this.draftItems : this.getQuestionItems()
    const questionNumber = this.getQuestionNumber()

    return html`
      <section class="questionaire-pane-create-question-ordering">
        <questionaire-pane-create-question-header
          .questionNumber=${questionNumber}
          .questionTypeLabel=${'Ordering'}
          @questionaire-question-header-delete=${() => { void this.deleteQuestion() }}
        ></questionaire-pane-create-question-header>

        <div class="questionaire-pane-create-question-ordering-field">
          <label>Question type</label>
          <div class="questionaire-pane-create-question-ordering-type-card">
            <div class="questionaire-pane-create-question-ordering-type-icon">01</div>
            <div class="questionaire-pane-create-question-ordering-type-copy">
              <div class="questionaire-pane-create-question-ordering-type-title">Ordering</div>
              <div class="questionaire-pane-create-question-ordering-type-description">Arrange items in correct order</div>
            </div>
            <div class="questionaire-pane-create-question-ordering-type-chevron">
              <icon-lucide-chevron-down></icon-lucide-chevron-down>
            </div>
          </div>
        </div>

        <div class="questionaire-pane-create-question-ordering-field">
          <label>Question</label>
          <textarea
            class="questionaire-pane-create-question-ordering-textarea"
            placeholder="Type your question here..."
            .value=${title}
            @input=${(event: Event) => {
              this.draftTitle = (event.currentTarget as HTMLTextAreaElement).value
            }}
            @blur=${(event: FocusEvent) => {
              void this.updateQuestionTitle((event.currentTarget as HTMLTextAreaElement).value)
            }}
          ></textarea>
        </div>

        <div class="questionaire-pane-create-question-ordering-field">
          <label>Hint <span>(optional)</span></label>
          <input
            class="questionaire-pane-create-question-ordering-input"
            type="text"
            placeholder="Shown to respondents as a hint..."
            .value=${hint}
            @input=${(event: Event) => {
              this.draftHint = (event.currentTarget as HTMLInputElement).value
            }}
            @blur=${(event: FocusEvent) => {
              void this.updateQuestionHint((event.currentTarget as HTMLInputElement).value)
            }}
          />
        </div>

        <div class="questionaire-pane-create-question-ordering-field">
          <div class="questionaire-pane-create-question-ordering-field-header">
            <label>Items — this order is the correct order</label>
          </div>
          <div class="questionaire-pane-create-question-ordering-items">
            ${items.map((item, index) => html`
              <div class="questionaire-pane-create-question-ordering-item">
                <span class="questionaire-pane-create-question-ordering-item-badge">${index + 1}</span>
                <input
                  class="questionaire-pane-create-question-ordering-item-input"
                  type="text"
                  .value=${item}
                  @input=${(event: Event) => {
                    const nextItems = items.slice()
                    nextItems[index] = (event.currentTarget as HTMLInputElement).value
                    this.draftItems = nextItems
                  }}
                  @blur=${(event: FocusEvent) => {
                    void this.updateItem(index, (event.currentTarget as HTMLInputElement).value)
                  }}
                />
              </div>
            `)}
          </div>
          <button class="questionaire-pane-create-question-ordering-add" type="button" @click=${() => { void this.addItem() }}>
            <span>+</span>
            <span>Add item</span>
          </button>
          <div class="questionaire-pane-create-question-ordering-note">
            <icon-lucide-info></icon-lucide-info>
            <span>Items are shuffled when presented. Respondents must restore this order.</span>
          </div>
        </div>

        <questionaire-pane-create-question-footer
          .points=${String(points)}
          .statusLabel=${'Changes not saved'}
          .saveLabel=${'Save question'}
          @questionaire-question-footer-points-changed=${(event: CustomEvent<{ points: string }>) => {
            this.draftPoints = event.detail.points
          }}
          @questionaire-question-footer-save=${() => {
            void this.persistQuestionCard()
          }}
        ></questionaire-pane-create-question-footer>
      </section>
    `
  }
}
