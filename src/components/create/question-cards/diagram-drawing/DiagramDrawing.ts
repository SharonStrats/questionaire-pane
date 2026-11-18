import { html } from 'lit'
import { state } from 'lit/decorators.js'
import { customElement } from 'solid-ui'
import styles from './DiagramDrawing.styles.css'
import QuestionairePaneCreateQuestionCardBase from '../card-base/CardBase'
import { readQuestionValue } from '../../../../service/questionAccessors'
import '../header/Header'
import '../footer/Footer'
import '../image-upload/ImageUpload'
import '../../../shared/FormattedTextEditor'
import '../../../shared/FormattingToolbar'

@customElement('questionaire-pane-create-question-diagram-drawing')
export default class QuestionairePaneCreateQuestionDiagramDrawing extends QuestionairePaneCreateQuestionCardBase {
  static styles = styles

  @state()
  private accessor draftTitle = ''

  @state()
  private accessor draftImage = ''

  @state()
  private accessor draftPoints = '1'

  @state()
  private accessor saveError = ''

  @state()
  private accessor loadedQuestionUri: string | null = null

  protected willUpdate () {
    const question = this.question
    const store = this.getStore()
    if (!question || !store || this.loadedQuestionUri === question.uri) {
      return
    }

    this.draftTitle = readQuestionValue(store, question, 'title')
    this.draftImage = readQuestionValue(store, question, 'image')
    this.draftPoints = readQuestionValue(store, question, 'points') || '1'
    this.loadedQuestionUri = question.uri
  }

  protected resetDraft () {
    super.resetDraft()
    this.loadedQuestionUri = null
    this.saveError = ''
  }

  private async saveQuestion () {
    const question = this.question
    const logic = this.getQuestionLogic()
    if (!question || !logic) {
      return
    }

    const points = Number.parseInt(this.draftPoints, 10)
    try {
      await logic.updateQuestionText({ question, title: this.draftTitle.trim() })
      await logic.updateQuestionImage({ question, image: this.draftImage.trim() })
      await logic.updateQuestionPoints({ question, points: Number.isFinite(points) ? points : 1 })
      this.saveError = ''
      this.emitQuestionChanged()
      this.emitQuestionSaved()
    } catch (error) {
      this.saveError = error instanceof Error ? error.message : 'Unable to save the question.'
    }
  }

  render () {
    const question = this.question
    if (!question) {
      return html``
    }

    return html`
      <section class="questionaire-pane-create-question-diagram-drawing">
        <questionaire-pane-create-question-header
          .questionNumber=${this.getQuestionNumber()}
          .questionTypeLabel=${'Diagram Drawing'}
          @questionaire-question-header-delete=${() => { void this.deleteQuestion() }}
        ></questionaire-pane-create-question-header>

        <div class="questionaire-pane-create-question-diagram-drawing-field">
          <label>Question</label>
          <questionaire-pane-formatted-text-editor
            .value=${this.draftTitle}
            placeholder="Describe what the learner should draw..."
            @questionaire-formatted-text-input=${(event: CustomEvent<{ value: string }>) => {
              this.draftTitle = event.detail.value
            }}
          ></questionaire-pane-formatted-text-editor>
          <questionaire-pane-formatting-toolbar></questionaire-pane-formatting-toolbar>
        </div>

        <questionaire-pane-create-question-image-upload
          .question=${question}
          .image=${this.draftImage}
          @questionaire-question-image-changed=${(event: CustomEvent<{ image: string }>) => {
            this.draftImage = event.detail.image
            this.emitQuestionChanged()
          }}
        ></questionaire-pane-create-question-image-upload>

        <p class="questionaire-pane-create-question-diagram-drawing-note">
          Learners will draw directly over this image. Drawing responses are
          recorded for review and are not automatically graded.
        </p>

        ${this.saveError ? html`<p class="questionaire-pane-create-question-diagram-drawing-error" role="alert">${this.saveError}</p>` : ''}

        <questionaire-pane-create-question-footer
          .points=${this.draftPoints}
          .statusLabel=${this.draftDirty ? 'Unsaved changes' : 'Saved'}
          .saveLabel=${'Save question'}
          @questionaire-question-footer-save=${() => { void this.saveQuestion() }}
          @questionaire-question-footer-points-changed=${(event: CustomEvent<{ points: number }>) => {
            this.draftPoints = String(event.detail.points)
          }}
        ></questionaire-pane-create-question-footer>
      </section>
    `
  }
}
