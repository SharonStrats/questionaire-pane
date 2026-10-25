import { html, nothing } from 'lit'
import { property, state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import type { LiveStore, NamedNode } from 'rdflib'
import styles from './QuestionairePaneTakeFinalScreen.styles.css'
import { questionairePredicates } from '../../../service/questionairePredicates'
import { readQuestionValue, readQuestionValues } from '../../../service/questionaireQuestionAccessors'
import type { QuestionaireQuestionSummary } from '../../../service/questionaireQuestionQueries'
import type { QuestionaireQuestionScore } from '../../../service/questionaireQuestionScoring'

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
  accessor shareStatus: 'idle' | 'sharing' | 'shared' | 'error' = 'idle'

  @property({ attribute: false })
  accessor shareError = ''

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

  private formatAnswer (answer: string | string[] | null): string {
    if (Array.isArray(answer)) return answer.filter(Boolean).join(' → ')
    return answer?.trim() || 'No answer'
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
  private handleRestart () {
    this.dispatchEvent(new CustomEvent('questionaire-take-restart', {
      bubbles: true,
      composed: true
    }))
  }

  render() {
    const percentage = this.availablePoints > 0
      ? Math.round((this.earnedPoints / this.availablePoints) * 100)
      : 0
    const missed = this.questionScores.filter((score) => !score.correct)

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
                      ? readQuestionValue(this.store, summary.question, 'explanation')
                      : ''
                    const explanationVisible = this.visibleExplanations.has(score.questionUri)
                    return html`
                      <article class="questionaire-pane-take-final-screen-review-item">
                        <div class="questionaire-pane-take-final-screen-review-heading">
                          <span class="questionaire-pane-take-final-screen-review-status">Review</span>
                          <strong>${summary?.title || 'Question'}</strong>
                        </div>
                        <p><span>Your answer:</span> ${this.formatAnswer(this.answers[score.questionUri] ?? null)}</p>
                        <p class="questionaire-pane-take-final-screen-correct-answer">
                          <span>Correct answer:</span> ${correctAnswers.length ? correctAnswers.join(' · ') : 'See the question instructions.'}
                        </p>
                        ${explanation
                          ? html`
                              <button
                                type="button"
                                class="questionaire-pane-take-final-screen-explanation-button"
                                aria-expanded=${String(explanationVisible)}
                                @click=${() => this.toggleExplanation(score.questionUri)}
                              >
                                ${explanationVisible ? 'Hide more details' : 'Show more details'}
                              </button>
                              ${explanationVisible
                                ? html`<p class="questionaire-pane-take-final-screen-explanation">${explanation}</p>`
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
              <h3>Share with the creator?</h3>
              <p>Your answers and completion result can be shared with the questionnaire creator.</p>
            </div>
            <div class="questionaire-pane-take-final-screen-share-actions">
              <button type="button" class="questionaire-pane-take-final-screen-private">Keep private</button>
              <button type="button" class="questionaire-pane-take-final-screen-share-button" ?disabled=${this.shareStatus === 'sharing' || this.shareStatus === 'shared'} @click=${() => this.dispatchEvent(new CustomEvent('questionaire-take-share-results', { bubbles: true, composed: true }))}>${this.shareStatus === 'sharing' ? 'Sharing…' : this.shareStatus === 'shared' ? 'Results shared' : 'Share results'}</button>
            </div>
            ${this.shareStatus === 'error' ? html`<p role="alert" class="questionaire-pane-take-final-screen-share-error">${this.shareError}</p>` : nothing}
            ${this.shareStatus === 'shared' ? html`<p role="status" class="questionaire-pane-take-final-screen-share-success">The creator can now read your results.</p>` : nothing}
          </section>
          <button class="questionaire-pane-take-final-screen-restart" type="button" @click=${() => this.handleRestart()}>
            Return to start
          </button>
        </div>
      </section>
    `
  }
}
