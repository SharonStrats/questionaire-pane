import { html } from 'lit'
import { property, state } from 'lit/decorators.js'
import { consume } from '@lit/context'
import { customElement, WebComponent } from 'solid-ui'
import { Namespace, type NamedNode } from 'rdflib'
import styles from './QuestionairePaneCreateQuestionConfidence.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../../context'
import { createQuestionaireLogic } from '../../../../service/questionaireLogic'
import '../questionaire-pane-create-question-header/QuestionairePaneCreateQuestionHeader'
import '../questionaire-pane-create-question-footer/QuestionairePaneCreateQuestionFooter'
import '~icons/lucide/chevron-down'
import '~icons/lucide/info'
import '~icons/lucide/heart'

const dct = Namespace('http://purl.org/dc/terms/')
const quiz = Namespace('http://example.org/ns/quiz#')

@customElement('questionaire-pane-create-question-confidence')
export default class QuestionairePaneCreateQuestionConfidence extends WebComponent {
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
  private accessor loadedQuestionUri: string | null = null

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

    await logic.updateQuestionText({ question, title })
    await logic.updateQuestionHint({ question, hint })
    await logic.updateQuestionPoints({ question, points: Number.isFinite(points) ? points : 0 })

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

  render() {
    const store = this.getStore()
    const question = this.question

    if (!store || !question) {
      return html``
    }

    const title = this.draftTitle
    const hint = this.draftHint || this.getQuestionHint()
    const points = this.draftPoints || String(this.getQuestionPoints())
    const questionNumber = this.getQuestionNumber()

    return html`
      <section class="questionaire-pane-create-question-confidence">
        <questionaire-pane-create-question-header
          .questionNumber=${questionNumber}
          .questionTypeLabel=${'Confidence / Rating'}
          @questionaire-question-header-delete=${() => {
            const logic = this.getQuestionLogic()
            const baseUrl = this.questionaire?.subject?.doc().uri.replace(/index\.ttl$/, '')
            if (!logic || !baseUrl || !question) {
              return
            }
            void logic.deleteQuestionFromQuestionnaire({ baseUrl, question })
          }}
        ></questionaire-pane-create-question-header>

        <div class="questionaire-pane-create-question-confidence-field">
          <label>Question type</label>
          <div class="questionaire-pane-create-question-confidence-type-card">
            <div class="questionaire-pane-create-question-confidence-type-icon">
              <icon-lucide-heart></icon-lucide-heart>
            </div>
            <div class="questionaire-pane-create-question-confidence-type-copy">
              <div class="questionaire-pane-create-question-confidence-type-title">Confidence / Rating</div>
              <div class="questionaire-pane-create-question-confidence-type-description">Collect a rating or confidence response</div>
            </div>
            <div class="questionaire-pane-create-question-confidence-type-chevron">
              <icon-lucide-chevron-down></icon-lucide-chevron-down>
            </div>
          </div>
        </div>

        <div class="questionaire-pane-create-question-confidence-field">
          <label>Question</label>
          <textarea
            class="questionaire-pane-create-question-confidence-textarea"
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

        <div class="questionaire-pane-create-question-confidence-field">
          <label>Hint <span>(optional)</span></label>
          <input
            class="questionaire-pane-create-question-confidence-input"
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

        <div class="questionaire-pane-create-question-confidence-field">
          <label>Response scale</label>
          <div class="questionaire-pane-create-question-confidence-scale">
            ${['1', '2', '3', '4', '5'].map((value) => html`<span>${value}</span>`)}
          </div>
        </div>

        <questionaire-pane-create-question-footer
          .points=${points}
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
