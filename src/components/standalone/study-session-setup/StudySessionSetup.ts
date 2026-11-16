import { css, html, LitElement, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import {
  selectStudySession,
  type StudyLearningProgress,
  type StudySessionMode,
  type StudySessionOptions
} from '../../../service/studyLearningProgress'

export type { StudySessionOptions } from '../../../service/studyLearningProgress'
export interface StudySessionCard { uri: string, front: string, back: string }
export interface StudySessionStartDetail { cards: StudySessionCard[], options: StudySessionOptions }

@customElement('questionaire-study-session-setup')
export default class StudySessionSetup extends LitElement {
  static styles = css`
    :host { display: block; color: inherit; font: inherit; }
    form { display: grid; gap: 1rem; max-width: 32rem; }
    label { display: grid; gap: .4rem; }
    select, input, button { font: inherit; padding: .7rem; border: 1px solid #94a3b8; border-radius: .5rem; }
    button { background: #065f46; color: white; cursor: pointer; }
    button:disabled { opacity: .5; cursor: not-allowed; }
    [role=alert] { color: #b91c1c; }
    p { margin: 0; }
  `

  @property({ attribute: false })
  accessor cards: StudySessionCard[] = []

  @property({ attribute: false })
  accessor progress: StudyLearningProgress | undefined

  @property({ type: Boolean })
  accessor loading = false

  @property({ type: String })
  accessor error = ''

  @state()
  private accessor mode: StudySessionMode = 'all'

  @state()
  private accessor count = 20

  @state()
  private accessor validationError = ''

  private get available (): number {
    if (!this.progress) return 0
    return selectStudySession(this.cards, this.progress, { mode: this.mode, count: Math.max(1, this.cards.length) }).length
  }

  private start (event: Event): void {
    event.preventDefault()
    if (!this.progress || this.loading || this.error) return
    try {
      const options = { mode: this.mode, count: this.count }
      const cards = selectStudySession(this.cards, this.progress, options)
      if (!cards.length) throw new Error('No cards match this mode. Choose another mode.')
      this.validationError = ''
      this.dispatchEvent(new CustomEvent<StudySessionStartDetail>('study-session-start', {
        detail: { cards, options }, bubbles: true, composed: true
      }))
    } catch (error) {
      this.validationError = error instanceof Error ? error.message : 'Unable to prepare your study session.'
    }
  }

  render () {
    let available = 0
    let selectionError = ''
    try {
      available = this.available
    } catch (error) {
      selectionError = error instanceof Error ? error.message : 'Unable to select study cards.'
    }
    const error = this.error || this.validationError || selectionError
    const validCount = Number.isSafeInteger(this.count) && this.count > 0
    const selected = validCount ? Math.min(this.count, available) : 0
    const completed = this.cards.filter(card => Boolean(this.progress?.cards[card.uri])).length
    return html`
      <form @submit=${this.start}>
        <h2>Set up your study session</h2>
        <p>${this.cards.length} saved cards · ${completed} of ${this.cards.length} completed so far. Your answers are saved to your own Pod.</p>
        <label>Cards to study
          <select aria-label="Cards to study" .value=${this.mode}
            @change=${(event: Event) => {
              this.mode = (event.target as HTMLSelectElement).value as StudySessionMode
              this.validationError = ''
            }}>
            <option value="all">All cards — new first, then struggling and due</option>
            <option value="new">New cards — not studied yet</option>
            <option value="needs-practice">Needs practice — struggling or due for review</option>
          </select>
        </label>
        <label>Session card count
          <input aria-label="Session card count" type="number" min="1" step="1" required .value=${String(this.count)}
            @input=${(event: Event) => {
              this.count = (event.target as HTMLInputElement).valueAsNumber
              this.validationError = ''
            }}>
        </label>
        <p aria-live="polite">${this.loading ? 'Loading your progress…' : `${available} matching cards; ${selected} in this session.`}</p>
        ${!this.loading && this.progress && !available ? html`<p>No cards match this mode. Try another mode.</p>` : nothing}
        ${error ? html`<p role="alert">${error}</p>` : nothing}
        <button type="submit" ?disabled=${this.loading || !this.progress || Boolean(this.error || selectionError) || !available || !validCount}>
          Start session${selected ? ` (${selected} cards)` : ''}
        </button>
      </form>
    `
  }
}
