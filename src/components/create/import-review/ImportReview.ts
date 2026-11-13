import { html, type PropertyValues } from 'lit'
import { customElement, WebComponent } from 'solid-ui'
import { property, state } from 'lit/decorators.js'
import { loadQuizAiService, type ImportedQuizQuestion } from '../../../service/quizAiService'
import {
  cloneReviewQuestions,
  isHighConfidence,
  moveReviewQuestion,
  needsReview,
  removeReviewQuestion,
  updateReviewQuestion,
  type ReviewQuestion
} from './reviewModel'
import styles from './ImportReview.styles.css'

function safeSourceUri (value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined
  } catch {
    return undefined
  }
}

@customElement('questionaire-pane-create-import-review')
export default class QuestionairePaneCreateImportReview extends WebComponent {
  static styles = styles

  @property({ attribute: false })
  accessor questions: ImportedQuizQuestion[] = []

  @state()
  private accessor draft: ReviewQuestion[] = []

  @state()
  private accessor regenerationState: Record<string, 'loading' | 'unavailable' | 'failed' | undefined> = {}

  @state()
  private accessor regenerationErrors: Record<string, string> = {}

  @state()
  private accessor regenerationPreview: Record<string, ImportedQuizQuestion | undefined> = {}

  protected willUpdate (changed: PropertyValues<this>) {
    if (changed.has('questions')) {
      this.draft = cloneReviewQuestions(this.questions)
    }
  }

  private applyPatch (index: number, patch: Partial<ReviewQuestion>) {
    this.draft = updateReviewQuestion(this.draft, index, patch)
  }

  private moveQuestion (index: number, direction: -1 | 1) {
    this.draft = moveReviewQuestion(this.draft, index, direction)
  }

  private removeQuestion (index: number) {
    this.draft = removeReviewQuestion(this.draft, index)
  }

  private async regenerateQuestion (index: number) {
    const question = this.draft[index]
    if (!question || this.regenerationState[question.id] === 'loading') return
    this.regenerationState = { ...this.regenerationState, [question.id]: undefined }
    this.regenerationErrors = { ...this.regenerationErrors, [question.id]: '' }
    try {
      const result = await (await loadQuizAiService()).regenerateQuestion(question)
      if (result.status === 'success') {
        this.regenerationPreview = { ...this.regenerationPreview, [question.id]: result.question }
        this.regenerationState = { ...this.regenerationState, [question.id]: 'loading' }
      } else {
        this.regenerationState = { ...this.regenerationState, [question.id]: result.status }
        this.regenerationErrors = { ...this.regenerationErrors, [question.id]: result.reason }
      }
    } catch (error) {
      this.regenerationState = { ...this.regenerationState, [question.id]: 'failed' }
      this.regenerationErrors = {
        ...this.regenerationErrors,
        [question.id]: error instanceof Error ? error.message : String(error)
      }
    }
  }

  private acceptRegeneration (index: number) {
    const question = this.draft[index]
    const replacement = question && this.regenerationPreview[question.id]
    if (!question || !replacement) return
    this.draft = updateReviewQuestion(this.draft, index, {
      title: replacement.title,
      type: replacement.type,
      options: [...replacement.options],
      correctAnswers: [...replacement.correctAnswers],
      sourceItems: replacement.sourceItems ? [...replacement.sourceItems] : undefined,
      targetItems: replacement.targetItems ? [...replacement.targetItems] : undefined,
      confidence: question.confidence,
      provenance: question.provenance,
      sourceBlock: question.sourceBlock,
      warnings: [...question.warnings]
    })
    this.regenerationPreview = { ...this.regenerationPreview, [question.id]: undefined }
    this.regenerationState = { ...this.regenerationState, [question.id]: undefined }
  }

  private cancel () {
    this.dispatchEvent(new CustomEvent('questionaire-import-review-cancelled', { bubbles: true, composed: true }))
  }

  private accept () {
    this.dispatchEvent(new CustomEvent<ReviewQuestion[]>('questionaire-import-review-accepted', {
      bubbles: true,
      composed: true,
      detail: this.draft.filter(question => question.approved)
    }))
  }

  private get reviewCount () {
    return this.draft.filter(question => needsReview(question)).length
  }

  render () {
    const selectedCount = this.draft.filter(question => question.approved).length
    const highConfidenceCount = this.draft.filter(question => isHighConfidence(question)).length
    return html`
      <div class="review" role="dialog" aria-modal="true" aria-label="Review imported questions">
        <header class="review-header">
          <div>
            <p class="review-kicker">Review import</p>
            <h2>Check your questions</h2>
            <p>High-confidence questions are selected for acceptance. Keep warnings visible and review the others before accepting.</p>
          </div>
          <button type="button" class="close" aria-label="Cancel import review" @click=${this.cancel}>×</button>
        </header>
        <div class="questions">
          ${this.draft.map((question, index) => html`
            <article class="question-card">
              <div class="question-actions">
                <button type="button" aria-label="Move question up" ?disabled=${index === 0} @click=${() => this.moveQuestion(index, -1)}>↑</button>
                <button type="button" aria-label="Move question down" ?disabled=${index === this.draft.length - 1} @click=${() => this.moveQuestion(index, 1)}>↓</button>
                <button type="button" aria-label="Remove question" @click=${() => this.removeQuestion(index)}>Remove</button>
              </div>
              <label class="include">
                <input type="checkbox" .checked=${question.approved} @change=${(event: Event) => this.applyPatch(index, { approved: (event.currentTarget as HTMLInputElement).checked })}>
                ${question.approved ? 'Include this question' : 'Review before including'}
              </label>
              <div class="regeneration">
                <button type="button" ?disabled=${this.regenerationState[question.id] === 'loading'} @click=${() => { void this.regenerateQuestion(index) }}>
                  ${this.regenerationState[question.id] === 'loading' ? 'Generating…' : 'Regenerate question'}
                </button>
                ${this.regenerationPreview[question.id] ? html`
                  <div class="regeneration-preview" role="status">
                    <strong>Generated alternative</strong>
                    <p>${this.regenerationPreview[question.id]?.title}</p>
                    <button type="button" @click=${() => this.acceptRegeneration(index)}>Use generated question</button>
                    <button type="button" @click=${() => { this.regenerationPreview = { ...this.regenerationPreview, [question.id]: undefined } }}>Keep current</button>
                  </div>
                ` : html``}
                ${this.regenerationErrors[question.id] ? html`<p class="regeneration-error" role="alert">${this.regenerationErrors[question.id]}</p>` : html``}
              </div>
              <div class="metadata">
                <strong class=${isHighConfidence(question) ? 'confidence-high' : 'confidence-low'}>${Math.round(question.confidence * 100)}% confidence${isHighConfidence(question) ? '' : ' · review needed'}</strong>
                ${question.provenance ? html`
                  <span>
                    Source:
                    ${safeSourceUri(question.provenance.sourceDocumentUri)
                      ? html`<a href=${safeSourceUri(question.provenance.sourceDocumentUri)} target="_blank" rel="noopener noreferrer">${question.provenance.sourceDocument}</a>`
                      : question.provenance.sourceDocument}
                    ${question.provenance.page ? ` · page ${question.provenance.page}` : ''}
                    ${question.provenance.slide ? ` · slide ${question.provenance.slide}` : ''}
                    ${question.provenance.block ? ` · block ${question.provenance.block}` : ''}
                  </span>
                  ${question.provenance.excerpt ? html`<span class="excerpt">“${question.provenance.excerpt}”</span>` : html``}
                ` : html`<span>Source location unavailable</span>`}
              </div>
              ${question.warnings.length > 0 ? html`
                <div class="warnings" role="note" aria-label="Review warnings">
                  <strong>Review warning${question.warnings.length === 1 ? '' : 's'}</strong>
                  <ul>${question.warnings.map(warning => html`<li>${warning}</li>`)}</ul>
                </div>
              ` : html``}
              <label>Question
                <textarea rows="2" .value=${question.title} @input=${(event: Event) => this.applyPatch(index, { title: (event.currentTarget as HTMLTextAreaElement).value })}></textarea>
              </label>
              ${question.options.length > 0 ? html`
                <label>Options (one per line)
                  <textarea rows="3" .value=${question.options.join('\n')} @input=${(event: Event) => this.applyPatch(index, { options: (event.currentTarget as HTMLTextAreaElement).value.split('\n').map(value => value.trim()).filter(Boolean) })}></textarea>
                </label>
              ` : html``}
              <label>Correct answer${question.correctAnswers.length === 1 ? '' : 's'} (one per line)
                <textarea rows="2" .value=${question.correctAnswers.join('\n')} @input=${(event: Event) => this.applyPatch(index, { correctAnswers: (event.currentTarget as HTMLTextAreaElement).value.split('\n').map(value => value.trim()).filter(Boolean) })}></textarea>
              </label>
            </article>
          `)}
        </div>
        <footer class="actions">
          <p class="selection-summary" role="status">
            ${selectedCount} of ${this.draft.length} selected
            · ${highConfidenceCount} high-confidence
            ${this.reviewCount > 0 ? html` · ${this.reviewCount} need${this.reviewCount === 1 ? 's' : ''} review` : html``}
          </p>
          <button type="button" @click=${this.cancel}>Cancel</button>
          <button type="button" class="primary" ?disabled=${this.draft.every(question => !question.approved)} @click=${this.accept}>Accept selected questions</button>
        </footer>
      </div>
    `
  }
}
