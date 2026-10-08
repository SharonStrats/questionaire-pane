import { html } from 'lit'
import { consume } from '@lit/context'
import { property, state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import { Namespace, type NamedNode } from 'rdflib'
import styles from './QuestionairePaneCreateQuestionMatch.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../../context'
import { createQuestionaireLogic } from '../../../../service/questionaireLogic'
import '../questionaire-pane-create-question-header/QuestionairePaneCreateQuestionHeader'
import '../questionaire-pane-create-question-footer/QuestionairePaneCreateQuestionFooter'
import '~icons/lucide/chevron-down'
import '~icons/lucide/info'
import '~icons/lucide/plus'

const dct = Namespace('http://purl.org/dc/terms/')
const quiz = Namespace('http://example.org/ns/quiz#')

@customElement('questionaire-pane-create-question-match')
export default class QuestionairePaneCreateQuestionMatch extends WebComponent {
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
  private accessor draftLeftItems: string[] = []

  @state()
  private accessor draftRightItems: string[] = []

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
    this.draftLeftItems = this.getLeftItems()
    this.draftRightItems = this.getRightItems()
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

  private getLeftItems () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return ['Roots', 'Leaves']
    }

    const items = store.statementsMatching(question, quiz('leftItem'), undefined, question.doc())
      .map((statement) => statement.object.value)

    return items.length > 0 ? items : ['Roots', 'Leaves']
  }

  private getRightItems () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return ['Absorb water', 'Make food']
    }

    const items = store.statementsMatching(question, quiz('rightItem'), undefined, question.doc())
      .map((statement) => statement.object.value)

    return items.length > 0 ? items : ['Absorb water', 'Make food']
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
    const leftItems = this.draftLeftItems.length > 0 ? this.draftLeftItems : ['Roots', 'Leaves']
    const rightItems = this.draftRightItems.length > 0 ? this.draftRightItems : ['Absorb water', 'Make food']

    await logic.updateQuestionText({ question, title })
    await logic.updateQuestionHint({ question, hint })
    await logic.updateQuestionPoints({ question, points: Number.isFinite(points) ? points : 0 })
    await logic.updateQuestionMatchPairs({ question, leftItems, rightItems })

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

  private async updatePair (index: number, side: 'left' | 'right', value: string) {
    const question = this.question
    const logic = this.getQuestionLogic()
    if (!question || !logic) {
      return
    }

    if (side === 'left') {
      const nextLeft = this.draftLeftItems.slice()
      nextLeft[index] = value
      this.draftLeftItems = nextLeft
    } else {
      const nextRight = this.draftRightItems.slice()
      nextRight[index] = value
      this.draftRightItems = nextRight
    }

    await logic.updateQuestionMatchPairs({
      question,
      leftItems: this.draftLeftItems,
      rightItems: this.draftRightItems
    })
    this.emitQuestionChanged()
    this.requestUpdate()
  }

  private async addPair () {
    const question = this.question
    const logic = this.getQuestionLogic()
    if (!question || !logic) {
      return
    }

    const nextLeft = this.draftLeftItems.length > 0 ? this.draftLeftItems.slice() : this.getLeftItems().slice()
    const nextRight = this.draftRightItems.length > 0 ? this.draftRightItems.slice() : this.getRightItems().slice()
    nextLeft.push(`Item ${nextLeft.length + 1}`)
    nextRight.push(`Match ${nextRight.length + 1}`)
    this.draftLeftItems = nextLeft
    this.draftRightItems = nextRight

    await logic.updateQuestionMatchPairs({
      question,
      leftItems: nextLeft,
      rightItems: nextRight
    })
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
    const leftItems = this.draftLeftItems.length > 0 ? this.draftLeftItems : this.getLeftItems()
    const rightItems = this.draftRightItems.length > 0 ? this.draftRightItems : this.getRightItems()
    const questionNumber = this.getQuestionNumber()

    return html`
      <section class="questionaire-pane-create-question-match">
        <questionaire-pane-create-question-header
          .questionNumber=${questionNumber}
          .questionTypeLabel=${'Match'}
          @questionaire-question-header-delete=${() => { void this.deleteQuestion() }}
        ></questionaire-pane-create-question-header>

        <div class="questionaire-pane-create-question-match-field">
          <label>Question type</label>
          <div class="questionaire-pane-create-question-match-type-card">
            <div class="questionaire-pane-create-question-match-type-icon">↔</div>
            <div class="questionaire-pane-create-question-match-type-copy">
              <div class="questionaire-pane-create-question-match-type-title">Match</div>
              <div class="questionaire-pane-create-question-match-type-description">Connect two sets of items</div>
            </div>
            <div class="questionaire-pane-create-question-match-type-chevron">
              <icon-lucide-chevron-down></icon-lucide-chevron-down>
            </div>
          </div>
        </div>

        <div class="questionaire-pane-create-question-match-field">
          <label>Question</label>
          <textarea
            class="questionaire-pane-create-question-match-textarea"
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

        <div class="questionaire-pane-create-question-match-field">
          <label>Hint <span>(optional)</span></label>
          <input
            class="questionaire-pane-create-question-match-input"
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

        <div class="questionaire-pane-create-question-match-field">
          <div class="questionaire-pane-create-question-match-field-header">
            <label>Pairs</label>
            <span>Match items in the same row</span>
          </div>
          <div class="questionaire-pane-create-question-match-pairs">
            ${leftItems.map((leftItem, index) => {
              const rightItem = rightItems[index] ?? ''
              return html`
                <div class="questionaire-pane-create-question-match-pair">
                  <span class="questionaire-pane-create-question-match-pair-index">${index + 1}</span>
                  <input
                    class="questionaire-pane-create-question-match-pair-input"
                    type="text"
                    placeholder="Left item"
                    .value=${leftItem}
                    @input=${(event: Event) => {
                      const nextLeftItems = leftItems.slice()
                      nextLeftItems[index] = (event.currentTarget as HTMLInputElement).value
                      this.draftLeftItems = nextLeftItems
                    }}
                    @blur=${(event: FocusEvent) => {
                      void this.updatePair(index, 'left', (event.currentTarget as HTMLInputElement).value)
                    }}
                  />
                  <input
                    class="questionaire-pane-create-question-match-pair-input"
                    type="text"
                    placeholder="Right item"
                    .value=${rightItem}
                    @input=${(event: Event) => {
                      const nextRightItems = rightItems.slice()
                      nextRightItems[index] = (event.currentTarget as HTMLInputElement).value
                      this.draftRightItems = nextRightItems
                    }}
                    @blur=${(event: FocusEvent) => {
                      void this.updatePair(index, 'right', (event.currentTarget as HTMLInputElement).value)
                    }}
                  />
                </div>
              `
            })}
          </div>
          <button class="questionaire-pane-create-question-match-add" type="button" @click=${() => { void this.addPair() }}>
            <icon-lucide-plus></icon-lucide-plus>
            <span>Add pair</span>
          </button>
          <div class="questionaire-pane-create-question-match-note">
            <icon-lucide-info></icon-lucide-info>
            <span>Pairs are matched by row order.</span>
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
