import { html } from 'lit'
import { state } from 'lit/decorators.js'
import { customElement } from 'solid-ui'
import styles from './QuestionairePaneCreateQuestionTrueFalse.styles.css'
import QuestionairePaneCreateQuestionCardBase from '../questionaire-pane-create-question-card-base/QuestionairePaneCreateQuestionCardBase'
import { readQuestionValue } from '../../../../service/questionaireQuestionAccessors'
import '../questionaire-pane-create-question-header/QuestionairePaneCreateQuestionHeader'
import '../questionaire-pane-create-question-footer/QuestionairePaneCreateQuestionFooter'
import '~icons/lucide/check'
import '~icons/lucide/chevron-down'
import '~icons/lucide/info'

@customElement('questionaire-pane-create-question-true-false')
export default class QuestionairePaneCreateQuestionTrueFalse extends QuestionairePaneCreateQuestionCardBase {
  static styles = styles

  @state()
  private accessor draftTitle = ''

  @state()
  private accessor draftHint = ''

  @state()
  private accessor draftImage = ''

  @state()
  private accessor draftPoints = '1'

  @state()
  private accessor draftCorrectOption = 'false'

  @state()
  private accessor loadedQuestionUri: string | null = null

  protected willUpdate () {
    const question = this.question
    if (!question || this.loadedQuestionUri === question.uri) {
      return
    }

    this.draftTitle = this.getQuestionTitle()
    this.draftHint = this.getQuestionHint()
    this.draftImage = readQuestionValue(this.getStore()!, question, 'image')
    this.draftPoints = String(this.getQuestionPoints())
    this.draftCorrectOption = this.getCorrectOption() || 'false'
    this.loadedQuestionUri = question.uri
  }

  private getQuestionTitle () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return ''
    }

    return readQuestionValue(store, question, 'title')
  }

  private getQuestionHint () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return ''
    }

    return readQuestionValue(store, question, 'hint')
  }

  private getQuestionPoints () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return 1
    }

    const raw = readQuestionValue(store, question, 'points') || '1'
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) ? parsed : 1
  }

  private getCorrectOption () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return ''
    }

    return readQuestionValue(store, question, 'correctOption')
  }

  private async persistQuestionCard () {
    const question = this.question
    const logic = this.getQuestionLogic()
    if (!question || !logic) {
      return
    }

    const title = this.draftTitle.trim()
    const hint = this.draftHint.trim()
    const image = this.draftImage.trim()
    const points = Number.parseInt(this.draftPoints, 10)
    const correctOption = this.draftCorrectOption === 'true' ? 'true' : 'false'

    await logic.updateQuestionText({ question, title })
    await logic.updateQuestionHint({ question, hint })
    await logic.updateQuestionImage({ question, image })
    await logic.updateQuestionPoints({ question, points: Number.isFinite(points) ? points : 0 })
    await logic.updateQuestionOptions({
      question,
      options: ['true', 'false'],
      correctOption
    })

    this.emitQuestionChanged()
    this.emitQuestionSaved()
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

  private async selectCorrectOption (value: 'true' | 'false') {
    const question = this.question
    const logic = this.getQuestionLogic()
    if (!question || !logic) {
      return
    }

    this.draftCorrectOption = value
    await logic.updateQuestionOptions({
      question,
      options: ['true', 'false'],
      correctOption: value
    })
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
    const correctOption = this.draftCorrectOption || this.getCorrectOption() || 'false'
    const questionNumber = this.getQuestionNumber()

    return html`
      <section class="questionaire-pane-create-question-true-false">
        <questionaire-pane-create-question-header
          .questionNumber=${questionNumber}
          .questionTypeLabel=${'True / False'}
          @questionaire-question-header-delete=${() => { void this.deleteQuestion() }}
        ></questionaire-pane-create-question-header>

        <div class="questionaire-pane-create-question-true-false-field">
          <label>Question type</label>
          <div class="questionaire-pane-create-question-true-false-type-card">
            <div class="questionaire-pane-create-question-true-false-type-icon">TF</div>
            <div class="questionaire-pane-create-question-true-false-type-copy">
              <div class="questionaire-pane-create-question-true-false-type-title">True / False</div>
              <div class="questionaire-pane-create-question-true-false-type-description">Binary correct/incorrect</div>
            </div>
            <div class="questionaire-pane-create-question-true-false-type-chevron">
              <icon-lucide-chevron-down></icon-lucide-chevron-down>
            </div>
          </div>
        </div>

        <div class="questionaire-pane-create-question-true-false-field">
          <label>Image <span>(optional)</span></label>
          <input class="questionaire-pane-create-question-true-false-input" type="url" placeholder="Paste an image URL..." .value=${this.draftImage}
            @input=${(event: Event) => { this.draftImage = (event.currentTarget as HTMLInputElement).value }} />
          ${this.draftImage ? html`<img class="questionaire-pane-question-image-preview" src=${this.draftImage} alt="Question preview" />` : ''}
        </div>

        <div class="questionaire-pane-create-question-true-false-field">
          <label>Question</label>
          <textarea
            class="questionaire-pane-create-question-true-false-textarea"
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

        <div class="questionaire-pane-create-question-true-false-field">
          <label>Hint <span>(optional)</span></label>
          <input
            class="questionaire-pane-create-question-true-false-input"
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

        <div class="questionaire-pane-create-question-true-false-field">
          <div class="questionaire-pane-create-question-true-false-field-header">
            <label>Correct answer</label>
          </div>
          <div class="questionaire-pane-create-question-true-false-choice-row">
            <button
              class="questionaire-pane-create-question-true-false-choice ${correctOption === 'true' ? 'questionaire-pane-create-question-true-false-choice--selected' : ''}"
              type="button"
              @click=${() => { void this.selectCorrectOption('true') }}
            >
              <span class="questionaire-pane-create-question-true-false-choice-check">${correctOption === 'true' ? html`<icon-lucide-check></icon-lucide-check>` : html``}</span>
              <span>True</span>
            </button>
            <button
              class="questionaire-pane-create-question-true-false-choice ${correctOption === 'false' ? 'questionaire-pane-create-question-true-false-choice--selected' : ''}"
              type="button"
              @click=${() => { void this.selectCorrectOption('false') }}
            >
              <span class="questionaire-pane-create-question-true-false-choice-check">${correctOption === 'false' ? html`<icon-lucide-check></icon-lucide-check>` : html``}</span>
              <span>False</span>
            </button>
          </div>
          <div class="questionaire-pane-create-question-true-false-note">
            <icon-lucide-info></icon-lucide-info>
            <span>True / False questions use a binary correct answer.</span>
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
