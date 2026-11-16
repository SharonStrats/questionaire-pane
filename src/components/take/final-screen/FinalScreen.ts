import { html, nothing } from 'lit'
import { property, state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import type { LiveStore, NamedNode } from 'rdflib'
import styles from './FinalScreen.styles.css'
import { questionairePredicates } from '../../../service/predicates'
import { formatReviewAnswer } from '../../../service/answerFormatting'
import { readQuestionValue, readQuestionValues } from '../../../service/questionAccessors'
import type { QuestionaireQuestionSummary } from '../../../service/questionQueries'
import type { QuestionaireQuestionScore } from '../../../service/questionScoring'

@customElement('questionaire-pane-take-final-screen')
export default class QuestionairePaneTakeFinalScreen extends WebComponent {
  static styles = styles

  @property({ type: Number, attribute: 'total-questions' })
  accessor totalQuestions = 0

  @property({ type: Number, attribute: 'answered-questions' })
  accessor answeredQuestions = 0

  @property({ type: Number, attribute: 'available-points' })
  accessor availablePoints = 0

  @property({ type: Number, attribute: 'earned-points' })
  accessor earnedPoints = 0

  @property({ type: Boolean, attribute: 'is-survey' })
  accessor isSurvey = false

  @property({ attribute: false })
  accessor store: LiveStore | null = null

  @property({ attribute: false })
  accessor questionSummaries: QuestionaireQuestionSummary[] = []

  @property({ attribute: false })
  accessor questionScores: QuestionaireQuestionScore[] = []

  @property({ attribute: false })
  accessor answers: Record<string, string | string[] | null> = {}

  @property({ attribute: false })
  accessor shareStatus: 'idle' | 'saving' | 'saved' | 'sharing' | 'shared' | 'error' = 'idle'

  @property({ attribute: false })
  accessor shareError = ''

  @property({ attribute: false })
  accessor resultStatus: 'idle' | 'saving' | 'saved' | 'sharing' | 'shared' | 'error' = 'idle'

  @property({ type: Boolean, attribute: 'results-saved' })
  accessor resultsSaved = false

  @state()
  private accessor visibleExplanations = new Set<string>()

  private getCorrectAnswers (question: NamedNode, score: QuestionaireQuestionScore): string[] {
    if (!this.store) return []

    if (score.questionTypeUri === questionairePredicates.question.questionType.ordering.value) {
      return readQuestionValues(this.store, question, 'item')
    }

    if (score.questionTypeUri === questionairePredicates.question.questionType.match.value) {
      const left = readQuestionValues(this.store, question, 'leftItem')
      const right = readQuestionValues(this.store, question, 'rightItem')
      return left.map((item, index) => `${item} → ${right[index] ?? ''}`)
    }

    if (
      score.questionTypeUri === questionairePredicates.question.questionType.shortAnswer.value ||
      score.questionTypeUri === questionairePredicates.question.questionType.fillInBlank.value
    ) {
      return readQuestionValues(this.store, question, 'answer')
    }

    return readQuestionValues(this.store, question, 'correctOption')
  }

  private toggleExplanation (questionUri: string) {
    const visible = new Set(this.visibleExplanations)
    if (visible.has(questionUri)) {
      visible.delete(questionUri)
    } else {
      visible.add(questionUri)
    }
    this.visibleExplanations = visible
  }
  render() {
    const percentage = this.availablePoints > 0
      ? Math.round((this.earnedPoints / this.availablePoints) * 100)
      : 0
    const missed = this.questionScores.filter((score) =>
      !score.correct || Boolean(score.evaluation?.needsReview) || (
        score.evaluation?.method === 'sidecar' &&
        score.evaluation.score < score.evaluation.maxScore
      )
    )

    return html`
      <section class="questionaire-pane-take-final-screen">
        <div class="questionaire-pane-take-final-screen-card">
          <div class="questionaire-pane-take-final-screen-success-icon" aria-hidden="true">✓</div>
          <p class="questionaire-pane-take-final-screen-kicker">Response complete</p>
          <h2>Nice work—you finished.</h2>
          ${this.isSurvey
            ? html`<p class="questionaire-pane-take-final-screen-score">Your responses have been recorded.</p>`
            : html`
                <p class="questionaire-pane-take-final-screen-score">${percentage}%</p>
                <p class="questionaire-pane-take-final-screen-score-detail">${this.earnedPoints} of ${this.availablePoints} automatically graded points</p>
                <p class="questionaire-pane-take-final-screen-score-note">${missed.length ? `${missed.length} question${missed.length === 1 ? '' : 's'} to review.` : 'All automatically graded answers are correct.'}</p>
              `}
          <p class="questionaire-pane-take-final-screen-summary">
            ${this.answeredQuestions} of ${this.totalQuestions} questions answered.
          </p>
          ${!this.isSurvey && missed.length
            ? html`
                <section class="questionaire-pane-take-final-screen-review" aria-labelledby="review-heading">
                  <h3 id="review-heading">Review your answers</h3>
                  ${missed.map((score) => {
                    const summary = this.questionSummaries.find((item) => item.question.uri === score.questionUri)
                    const correctAnswers = summary ? this.getCorrectAnswers(summary.question, score) : []
                    const explanation = summary && this.store
                      ? readQuestionValue(this.store, summary.question, 'explanation').trim()
                      : ''
                    const explanationVisible = this.visibleExplanations.has(score.questionUri)
                    const explanationId = `questionaire-pane-take-final-screen-explanation-${encodeURIComponent(score.questionUri)}`
                    return html`
                      <article class="questionaire-pane-take-final-screen-review-item">
                        <div class="questionaire-pane-take-final-screen-review-heading">
                          <span class="questionaire-pane-take-final-screen-review-status">Review</span>
                          <strong>${summary?.title || 'Question'}</strong>
                        </div>
                        <p><span>Your answer:</span> ${formatReviewAnswer(this.answers[score.questionUri] ?? null, score.questionTypeUri)}</p>
                        ${score.evaluation?.feedback
                          ? html`<p class="questionaire-pane-take-final-screen-feedback"><span>Grading feedback:</span> ${score.evaluation.feedback}</p>`
                          : nothing}
                        ${score.evaluation?.method === 'sidecar'
                          ? html`<p class="questionaire-pane-take-final-screen-confidence">
                              ${score.evaluation.needsReview ? 'Needs review: ' : ''}
                              AI score ${score.evaluation.score} of ${score.evaluation.maxScore}
                            </p>`
                          : nothing}
                        <p class="questionaire-pane-take-final-screen-correct-answer">
                          <span>Correct answer:</span> ${correctAnswers.length ? correctAnswers.join(' · ') : 'See the question instructions.'}
                        </p>
                        ${explanation
                          ? html`
                              <button
                                type="button"
                                class="questionaire-pane-take-final-screen-explanation-button"
                                aria-expanded=${String(explanationVisible)}
                                aria-controls=${explanationId}
                                @click=${() => this.toggleExplanation(score.questionUri)}
                              >
                                ${explanationVisible ? 'Hide details' : 'More details'}
                              </button>
                              ${explanationVisible
                                ? html`<p id=${explanationId} class="questionaire-pane-take-final-screen-explanation">${explanation}</p>`
                                : nothing}
                            `
                          : nothing}
                      </article>
                    `
                  })}
                </section>
              `
            : nothing}
          <section class="questionaire-pane-take-final-screen-share">
            <div>
              <h3>${this.resultsSaved ? 'Your result is saved privately' : this.resultStatus === 'saving' ? 'Saving your result privately' : 'Your result will be saved privately'}</h3>
              <p>Share it to also give the questionnaire creator read access.</p>
            </div>
            <div class="questionaire-pane-take-final-screen-share-actions">
              <button type="button" class="questionaire-pane-take-final-screen-private" ?disabled=${this.resultStatus === 'saving' || this.resultStatus === 'sharing' || this.resultsSaved} @click=${() => this.dispatchEvent(new CustomEvent('questionaire-take-save-results', { bubbles: true, composed: true }))}>${this.resultStatus === 'saving' ? 'Saving…' : this.resultsSaved ? 'Results saved' : this.resultStatus === 'error' ? 'Retry save' : 'Save results'}</button>
              <button type="button" class="questionaire-pane-take-final-screen-share-button" ?disabled=${this.resultStatus === 'saving' || this.resultStatus === 'sharing' || this.resultStatus === 'shared'} @click=${() => this.dispatchEvent(new CustomEvent('questionaire-take-share-results', { bubbles: true, composed: true }))}>${this.resultStatus === 'sharing' ? 'Sharing…' : this.resultStatus === 'shared' ? 'Results shared' : 'Share results'}</button>
              <button type="button" class="questionaire-pane-take-final-screen-restart" ?disabled=${this.resultStatus === 'saving' || this.resultStatus === 'sharing'} @click=${() => this.dispatchEvent(new CustomEvent('questionaire-take-cancel', { bubbles: true, composed: true }))}>Cancel / Exit</button>
            </div>
            ${this.shareError ? html`<p role="alert" class="questionaire-pane-take-final-screen-share-error">${this.shareError}</p>` : nothing}
            ${this.resultStatus === 'saved' ? html`<p role="status" class="questionaire-pane-take-final-screen-share-success">Your result is saved privately and available to you.</p>` : nothing}
            ${this.resultStatus === 'shared' ? html`<p role="status" class="questionaire-pane-take-final-screen-share-success">The creator can now read your results.</p>` : nothing}
          </section>
        </div>
      </section>
    `
  }
}
