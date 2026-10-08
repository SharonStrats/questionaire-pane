import { html } from 'lit'
import { consume } from '@lit/context'
import { property, state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import { Namespace, type NamedNode } from 'rdflib'
import styles from './QuestionairePaneCreateQuestionFillInTheBlank.styles.css'
import { questionaireContext, type QuestionaireContext } from '../../../../context'
import { createQuestionaireLogic } from '../../../../service/questionaireLogic'
import '../questionaire-pane-create-question-header/QuestionairePaneCreateQuestionHeader'
import '../questionaire-pane-create-question-footer/QuestionairePaneCreateQuestionFooter'
import '~icons/lucide/chevron-down'
import '~icons/lucide/info'

const dct = Namespace('http://purl.org/dc/terms/')
const quiz = Namespace('http://example.org/ns/quiz#')

@customElement('questionaire-pane-create-question-fill-in-the-blank')
export default class QuestionairePaneCreateQuestionFillInTheBlank extends WebComponent {
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
  private accessor draftAnswer = ''

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
    this.draftAnswer = this.getQuestionAnswer()
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

  private getQuestionAnswer () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return ''
    }

    return store.any(question, quiz('answer'), undefined, question.doc())?.value ?? ''
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
    const answer = this.draftAnswer.trim()

    await logic.updateQuestionText({ question, title })
    await logic.updateQuestionHint({ question, hint })
    await logic.updateQuestionPoints({ question, points: Number.isFinite(points) ? points : 0 })
    await logic.updateQuestionAnswers({ question, answers: answer ? [answer] : [] })

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
    const answer = this.draftAnswer || this.getQuestionAnswer()
    const questionNumber = this.getQuestionNumber()

    return html`
      <section class="questionaire-pane-create-question-fill-in-the-blank">
        <questionaire-pane-create-question-header
          .questionNumber=${questionNumber}
          .questionTypeLabel=${'Fill in the Blank'}
          @questionaire-question-header-delete=${() => { void this.deleteQuestion() }}
        ></questionaire-pane-create-question-header>

        <div class="questionaire-pane-create-question-fill-in-the-blank-field">
          <label>Question type</label>
          <div class="questionaire-pane-create-question-fill-in-the-blank-type-card">
            <div class="questionaire-pane-create-question-fill-in-the-blank-type-icon">U</div>
            <div class="questionaire-pane-create-question-fill-in-the-blank-type-copy">
              <div class="questionaire-pane-create-question-fill-in-the-blank-type-title">Fill in the Blank</div>
              <div class="questionaire-pane-create-question-fill-in-the-blank-type-description">Complete missing words</div>
            </div>
            <div class="questionaire-pane-create-question-fill-in-the-blank-type-chevron">
              <icon-lucide-chevron-down></icon-lucide-chevron-down>
            </div>
          </div>
        </div>

        <div class="questionaire-pane-create-question-fill-in-the-blank-field">
          <div class="questionaire-pane-create-question-fill-in-the-blank-field-header">
            <label>Question</label>
            <button class="questionaire-pane-create-question-fill-in-the-blank-insert" type="button">
              <span>+</span>
              <span>Insert blank</span>
            </button>
          </div>
          <textarea
            class="questionaire-pane-create-question-fill-in-the-blank-textarea"
            placeholder="Type your question here..."
            .value=${title}
            @input=${(event: Event) => {
              this.draftTitle = (event.currentTarget as HTMLTextAreaElement).value
            }}
            @blur=${(event: FocusEvent) => {
              void this.updateQuestionTitle((event.currentTarget as HTMLTextAreaElement).value)
            }}
          ></textarea>
          <p class="questionaire-pane-create-question-fill-in-the-blank-note">1 blank detected — fill in the correct answer(s) below</p>
        </div>

        <div class="questionaire-pane-create-question-fill-in-the-blank-field">
          <label>Hint <span>(optional)</span></label>
          <input
            class="questionaire-pane-create-question-fill-in-the-blank-input"
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

        <div class="questionaire-pane-create-question-fill-in-the-blank-field">
          <label>CORRECT ANSWER(S)</label>
          <div class="questionaire-pane-create-question-fill-in-the-blank-answer-row">
            <div class="questionaire-pane-create-question-fill-in-the-blank-answer-badge">Blank 1</div>
            <input
              class="questionaire-pane-create-question-fill-in-the-blank-answer-input"
              type="text"
              placeholder="Answer"
              .value=${answer}
              @input=${(event: Event) => {
                this.draftAnswer = (event.currentTarget as HTMLInputElement).value
              }}
              @blur=${(event: FocusEvent) => {
                this.draftAnswer = (event.currentTarget as HTMLInputElement).value
                void this.persistQuestionCard()
              }}
            />
          </div>
          <div class="questionaire-pane-create-question-fill-in-the-blank-note">
            <icon-lucide-info></icon-lucide-info>
            <span>Answers are checked case-insensitively.</span>
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
