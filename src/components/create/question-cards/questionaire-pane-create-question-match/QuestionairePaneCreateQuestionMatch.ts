import { html } from 'lit'
import { state } from 'lit/decorators.js'
import { customElement } from 'solid-ui'
import styles from './QuestionairePaneCreateQuestionMatch.styles.css'
import QuestionairePaneCreateQuestionCardBase from '../questionaire-pane-create-question-card-base/QuestionairePaneCreateQuestionCardBase'
import '../../../shared/QuestionairePaneFormattingToolbar'
import '../../../shared/QuestionairePaneFormattedTextEditor'
import { readQuestionValue, readQuestionValues } from '../../../../service/questionaireQuestionAccessors'
import '../questionaire-pane-create-question-header/QuestionairePaneCreateQuestionHeader'
import '../questionaire-pane-create-question-footer/QuestionairePaneCreateQuestionFooter'
import '~icons/lucide/chevron-down'
import '~icons/lucide/info'
import '~icons/lucide/plus'

@customElement('questionaire-pane-create-question-match')
export default class QuestionairePaneCreateQuestionMatch extends QuestionairePaneCreateQuestionCardBase {
  static styles = styles

  @state()
  private accessor draftTitle = ''

  @state()
  private accessor draftHint = ''

  @state()
  private accessor draftExplanation = ''

  @state()
  private accessor draftPoints = '1'

  @state()
  private accessor draftLeftItems: string[] = []

  @state()
  private accessor draftRightItems: string[] = []

  @state()
  private accessor loadedQuestionUri: string | null = null

  protected willUpdate () {
    const question = this.question
    if (!question || this.loadedQuestionUri === question.uri) {
      return
    }

    this.draftTitle = this.getQuestionTitle()
    this.draftHint = this.getQuestionHint()
    this.draftExplanation = readQuestionValue(this.getStore()!, question, 'explanation')
    this.draftPoints = String(this.getQuestionPoints())
    this.draftLeftItems = this.getLeftItems()
    this.draftRightItems = this.getRightItems()
    this.loadedQuestionUri = question.uri
  }

  protected resetDraft () {
    super.resetDraft()
    this.loadedQuestionUri = null
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

  private getLeftItems () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return ['', '']
    }

    const items = readQuestionValues(store, question, 'leftItem')

    return items.length > 0 ? items : ['', '']
  }

  private getRightItems () {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return ['', '']
    }

    const items = readQuestionValues(store, question, 'rightItem')

    return items.length > 0 ? items : ['', '']
  }

  private async persistQuestionCard () {
    const question = this.question
    const logic = this.getQuestionLogic()
    if (!question || !logic) {
      return
    }

    const title = this.draftTitle.trim()
    const hint = this.draftHint.trim()
    const explanation = this.draftExplanation.trim()
    const points = Number.parseInt(this.draftPoints, 10)
    const leftItems = this.draftLeftItems.length > 0 ? this.draftLeftItems : ['', '']
    const rightItems = this.draftRightItems.length > 0 ? this.draftRightItems : ['', '']

    await logic.updateQuestionText({ question, title })
    await logic.updateQuestionHint({ question, hint })
    await logic.updateQuestionExplanation({ question, explanation })
    await logic.updateQuestionPoints({ question, points: Number.isFinite(points) ? points : 0 })
    await logic.updateQuestionMatchPairs({ question, leftItems, rightItems })

    this.emitQuestionChanged()
    this.emitQuestionSaved()
  }

  private addPair () {
    const nextLeft = this.draftLeftItems.length > 0 ? this.draftLeftItems.slice() : this.getLeftItems().slice()
    const nextRight = this.draftRightItems.length > 0 ? this.draftRightItems.slice() : this.getRightItems().slice()
    nextLeft.push('')
    nextRight.push('')
    this.draftLeftItems = nextLeft
    this.draftRightItems = nextRight

  }

  render() {
    const store = this.getStore()
    const question = this.question
    if (!store || !question) {
      return html``
    }

    const title = this.draftTitle
    const hint = this.draftHint || this.getQuestionHint()
    const explanation = this.draftExplanation
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
          <label>More details <span>(optional)</span></label>
          <textarea class="questionaire-pane-create-question-match-input" rows="4" placeholder="Shown after an incorrect answer to explain the concept..." .value=${explanation} @input=${(event: Event) => { this.draftExplanation = (event.currentTarget as HTMLTextAreaElement).value }}></textarea>
        </div>

        <div class="questionaire-pane-create-question-match-field">
          <label>Question</label>
          <questionaire-pane-formatted-text-editor
            class="questionaire-pane-create-question-match-textarea"
            placeholder="Type your question here..."
            .value=${title}
            @questionaire-formatted-text-input=${(event: CustomEvent<{ value: string }>) => {
              this.draftTitle = event.detail.value
            }}
          ></questionaire-pane-formatted-text-editor>
          <questionaire-pane-formatting-toolbar></questionaire-pane-formatting-toolbar>
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
                  />
                </div>
              `
            })}
          </div>
          <div class="questionaire-pane-create-question-match-add-area">
            <button class="questionaire-pane-create-question-match-add" type="button" @click=${() => { void this.addPair() }}>
              <icon-lucide-plus></icon-lucide-plus>
              <span>Add pair</span>
            </button>
          </div>
          <div class="questionaire-pane-create-question-match-note">
            <icon-lucide-info></icon-lucide-info>
            <span>Pairs are matched by row order.</span>
          </div>
        </div>

        <questionaire-pane-create-question-footer
          .points=${String(points)}
          .statusLabel=${this.draftDirty ? 'Changes not saved' : 'Saved'}
          .saveDisabled=${!this.draftDirty}
          .cancelDisabled=${!this.draftDirty}
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
