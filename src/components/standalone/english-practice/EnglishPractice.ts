import { html, nothing } from 'lit'
import { customElement, WebComponent } from 'solid-ui'
import 'solid-ui/components/combobox'
import 'solid-ui/components/combobox-option'
import { property, state } from 'lit/decorators.js'
import type { LiveStore, NamedNode } from 'rdflib'
import styles from './EnglishPractice.styles.css'
import { englishParagraphPrompts } from '../../../data/englishParagraphPrompts'
import { englishEssayPrompts } from '../../../data/englishEssayPrompts'
import { EssayFeedbackClient, type EssayFeedback } from '../../../service/essayFeedbackClient'
import { EnglishPromptGenerationClient, type GeneratedEnglishPrompt } from '../../../service/englishPromptGenerationClient'
import {
  loadEnglishPracticeAttempts,
  loadEnglishPracticeDraft,
  saveEnglishPracticeAttempt,
  saveEnglishPracticeDraft,
  type EnglishPracticeAttempt,
  type EnglishPracticeType
} from '../../../service/englishPracticePersistence'

import '~icons/lucide/book-open'
import '~icons/lucide/sparkles'

@customElement('questionaire-english-practice')
export default class EnglishPractice extends WebComponent {
  static styles = styles

  @property({ type: String })
  accessor endpoint = ''

  @property({ attribute: false })
  accessor store: LiveStore | undefined = undefined

  @property({ attribute: false })
  accessor user: NamedNode | undefined = undefined

  @property({ type: String })
  accessor workspaceUrl = ''

  @property({ type: String })
  accessor initialPracticeType: EnglishPracticeType = 'paragraph'

  @state()
  private accessor practiceType: EnglishPracticeType = 'paragraph'

  @state()
  private accessor selectedPromptId = englishParagraphPrompts[0].id

  @state()
  private accessor responseText = ''

  @state()
  private accessor feedback: EssayFeedback | undefined

  @state()
  private accessor pendingAttempt: EnglishPracticeAttempt | undefined

  @state()
  private accessor attempts: EnglishPracticeAttempt[] = []

  @state()
  private accessor loading = false

  @state()
  private accessor loadingDraft = false

  @state()
  private accessor loadingHistory = false

  @state()
  private accessor showHistory = false

  @state()
  private accessor error = ''

  @state()
  private accessor draftStatus = ''

  @state()
  private accessor peelDismissed = false

  @state()
  private accessor generatedPrompts: GeneratedEnglishPrompt[] = []

  @state()
  private accessor promptTopic = ''

  @state()
  private accessor promptDifficulty: 'easy' | 'medium' | 'hard' = 'medium'

  @state()
  private accessor generatingPrompts = false

  private draftTimer?: ReturnType<typeof setTimeout>
  private pendingDraftSave: Promise<void> = Promise.resolve()
  private draftDirty = false
  private draftLoadGeneration = 0

  protected firstUpdated (): void {
    this.practiceType = this.initialPracticeType
    this.selectedPromptId = this.prompts[0].id
    this.peelDismissed = localStorage.getItem('english-peel-instructions-dismissed') === 'true'
    void this.loadCurrentDraft()
  }

  private get prompts () {
    const curated = this.practiceType === 'paragraph' ? englishParagraphPrompts : englishEssayPrompts
    return [...curated, ...this.generatedPrompts]
  }

  private get selectedPrompt () {
    return this.prompts.find(prompt => prompt.id === this.selectedPromptId) ?? this.prompts[0]
  }

  private dismissPeel (): void {
    this.peelDismissed = true
    localStorage.setItem('english-peel-instructions-dismissed', 'true')
  }

  private async flushDraft (): Promise<void> {
    if (this.draftTimer) {
      clearTimeout(this.draftTimer)
      this.draftTimer = undefined
    }
    await this.pendingDraftSave.catch(() => undefined)
    if (!this.draftDirty) return
    if (!this.store || !this.user || !this.workspaceUrl) {
      throw new Error('Your Pod is not ready to save English practice.')
    }

    this.draftDirty = false
    const practiceType = this.practiceType
    const promptId = this.selectedPromptId
    const response = this.responseText
    const updatedAt = new Date().toISOString()
    this.draftStatus = 'Saving to your Pod…'
    const operation = saveEnglishPracticeDraft(this.store, this.user, this.workspaceUrl, {
      practiceType, promptId, response, updatedAt
    })
    this.pendingDraftSave = operation
    try {
      await operation
      if (practiceType === this.practiceType && promptId === this.selectedPromptId &&
          response === this.responseText) {
        this.draftStatus = 'Saved to your Pod.'
      }
    } catch (error) {
      this.draftDirty = true
      this.draftStatus = 'Draft not saved.'
      this.error = `Unable to save your English draft to your Pod: ${error instanceof Error ? error.message : String(error)}`
      throw error
    }
  }

  private scheduleDraftSave (): void {
    this.draftDirty = true
    this.draftStatus = 'Unsaved changes.'
    this.error = ''
    if (this.draftTimer) clearTimeout(this.draftTimer)
    this.draftTimer = setTimeout(() => {
      this.draftTimer = undefined
      void this.flushDraft().catch(() => undefined)
    }, 700)
  }

  private async loadCurrentDraft (): Promise<void> {
    if (!this.store || !this.user || !this.workspaceUrl) {
      this.error = 'Your Pod is not ready to load English practice.'
      return
    }
    const generation = ++this.draftLoadGeneration
    const practiceType = this.practiceType
    const promptId = this.selectedPromptId
    this.loadingDraft = true
    this.error = ''
    try {
      const draft = await loadEnglishPracticeDraft(
        this.store, this.user, this.workspaceUrl, practiceType, promptId
      )
      if (generation !== this.draftLoadGeneration) return
      this.responseText = draft?.response ?? ''
      this.feedback = undefined
      this.draftDirty = false
      this.draftStatus = draft ? 'Draft restored from your Pod.' : 'Draft saves automatically to your Pod.'
    } catch (error) {
      if (generation !== this.draftLoadGeneration) return
      this.error = `Unable to load your English draft from your Pod: ${error instanceof Error ? error.message : String(error)}`
    } finally {
      if (generation === this.draftLoadGeneration) this.loadingDraft = false
    }
  }

  private async flushPendingSave (): Promise<boolean> {
    try {
      await this.flushDraft()
      if (this.pendingAttempt) await this.persistPendingAttempt()
      return true
    } catch {
      return false
    }
  }

  private async changePracticeType (practiceType: EnglishPracticeType): Promise<void> {
    if (practiceType === this.practiceType) return
    this.draftLoadGeneration++
    this.loadingDraft = true
    if (!await this.flushPendingSave()) {
      this.loadingDraft = false
      return
    }
    this.responseText = ''
    this.feedback = undefined
    this.generatedPrompts = []
    this.practiceType = practiceType
    this.selectedPromptId = this.prompts[0].id
    this.draftStatus = ''
    this.loadingDraft = false
  }

  private async generatePrompts (): Promise<void> {
    if (!this.endpoint || !this.promptTopic.trim() || this.generatingPrompts) return
    this.generatingPrompts = true
    this.error = ''
    try {
      this.generatedPrompts = await new EnglishPromptGenerationClient({ endpoint: this.endpoint }).generate({
        yearLevel: 9,
        curriculum: 'Australian Victorian Curriculum',
        subject: 'English',
        writingType: this.practiceType,
        topic: this.promptTopic.trim(),
        difficulty: this.promptDifficulty,
        wordCount: this.practiceType === 'paragraph' ? { min: 100, max: 180 } : { min: 500, max: 800 },
        count: 10
      })
      const firstPrompt = this.generatedPrompts[0]
      if (firstPrompt) await this.changePrompt(firstPrompt.id)
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to generate English prompts.'
    } finally {
      this.generatingPrompts = false
    }
  }

  private async changePrompt (promptId: string): Promise<void> {
    if (promptId === this.selectedPromptId) return
    this.draftLoadGeneration++
    this.loadingDraft = true
    if (!await this.flushPendingSave()) {
      this.loadingDraft = false
      return
    }
    this.responseText = ''
    this.feedback = undefined
    this.selectedPromptId = promptId
    this.draftStatus = ''
    this.loadingDraft = false
  }

  private async showAttempts (): Promise<void> {
    if (!await this.flushPendingSave()) return
    if (!this.store || !this.user || !this.workspaceUrl) {
      this.error = 'Your Pod is not ready to load English attempts.'
      return
    }
    this.loadingHistory = true
    this.error = ''
    try {
      this.attempts = await loadEnglishPracticeAttempts(this.store, this.user, this.workspaceUrl)
      this.showHistory = true
    } catch (error) {
      this.error = `Unable to load your English attempts from your Pod: ${error instanceof Error ? error.message : String(error)}`
    } finally {
      this.loadingHistory = false
    }
  }

  private async persistPendingAttempt (): Promise<void> {
    if (!this.pendingAttempt) return
    if (!this.store || !this.user || !this.workspaceUrl) {
      throw new Error('Your Pod is not ready to save this English attempt.')
    }
    try {
      const saved = await saveEnglishPracticeAttempt(
        this.store, this.user, this.workspaceUrl, this.pendingAttempt
      )
      this.attempts = [saved, ...this.attempts.filter(attempt => attempt.id !== saved.id)]
      this.pendingAttempt = undefined
      this.error = ''
    } catch (error) {
      this.error = `Feedback is available, but this English attempt was not saved to your Pod: ${error instanceof Error ? error.message : String(error)}`
      throw error
    }
  }

  private async continueAttempt (attempt: EnglishPracticeAttempt): Promise<void> {
    if (!await this.flushPendingSave()) return
    this.practiceType = attempt.practiceType
    this.selectedPromptId = attempt.promptId
    this.responseText = attempt.response
    this.feedback = attempt.feedback
    this.showHistory = false
    this.scheduleDraftSave()
  }

  private async assess (): Promise<void> {
    if (!this.endpoint || !this.responseText.trim() || this.pendingAttempt) return
    if (!await this.flushPendingSave()) return
    this.loading = true
    this.error = ''
    this.feedback = undefined
    const response = this.responseText
    const paragraphCount = response.trim().split(/\n\s*\n/).filter(Boolean).length || 1
    try {
      const feedback = await new EssayFeedbackClient({ endpoint: this.endpoint }).assess({
        essay: response,
        assignment: [
          'Year level: 9',
          `Writing format: ${this.practiceType}`,
          `Expected length: ${this.selectedPrompt.suggestedWordRange}`,
          `Task: ${this.selectedPrompt.prompt}`
        ].join('\n'),
        paragraphCount,
        rubric: [
          { criterion: 'Ideas and content: relevant, clear and sufficiently developed ideas', points: 5 },
          { criterion: 'Structure: logical organisation appropriate to the requested writing format', points: 5 },
          { criterion: 'Evidence and examples: relevant support that is specific and explained', points: 5 },
          { criterion: 'Vocabulary: appropriate, precise and varied language', points: 5 },
          { criterion: 'Sentence construction: clear, effective and appropriately varied sentences', points: 5 },
          { criterion: 'Grammar and punctuation: accurate spelling, grammar, punctuation and sentence conventions', points: 5 },
          { criterion: 'Critical thinking: explanation, analysis and evaluation appropriate to the task', points: 5 }
        ]
      })
      this.feedback = feedback
      this.pendingAttempt = {
        id: crypto.randomUUID(),
        practiceType: this.practiceType,
        promptId: this.selectedPromptId,
        prompt: this.selectedPrompt.prompt,
        response,
        feedback,
        createdAt: new Date().toISOString()
      }
      await this.persistPendingAttempt().catch(() => undefined)
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to assess this writing.'
    } finally {
      this.loading = false
    }
  }

  private renderFeedback (feedback: EssayFeedback) {
    return html`
      <section class="english-practice-feedback" aria-label="AI writing feedback">
        <h3>AI feedback</h3>
        <p>${feedback.overallFeedback}</p>
        <h4>Strengths</h4>
        <ul>${feedback.strengths.map(item => html`<li>${item}</li>`)}</ul>
        <h4>Areas to improve</h4>
        <ul>${feedback.areasToImprove.map(item => html`<li>${item}</li>`)}</ul>
        ${feedback.criterionFeedback?.length ? html`
          <h4>Rubric feedback</h4>
          <div class="english-practice-rubric-feedback">
            ${feedback.criterionFeedback.map(item => html`
              <article>
                <h5>${item.criterion}${item.score !== undefined ? html` <span>${item.score}/${item.maxScore ?? 5}</span>` : nothing}</h5>
                <p>${item.assessment}</p>
                <p><strong>Evidence:</strong> ${item.evidence}</p>
                <p><strong>Next step:</strong> ${item.nextStep}</p>
                ${item.exampleRevision ? html`<p><strong>Example improvement:</strong> ${item.exampleRevision}</p>` : nothing}
              </article>
            `)}
          </div>
        ` : nothing}
        ${feedback.nextChallenge ? html`
          <div class="english-practice-next-challenge">
            <h4>Your next challenge</h4>
            <p>${feedback.nextChallenge}</p>
          </div>
        ` : nothing}
      </section>
    `
  }

  private renderHistory () {
    return html`
      <section class="english-practice-card english-practice-history" aria-labelledby="english-attempts-heading">
        <div class="english-practice-history-heading">
          <div>
            <span class="english-practice-label">English learning history</span>
            <h2 id="english-attempts-heading">My English attempts</h2>
            <p>Your responses and feedback are private in your Pod.</p>
          </div>
          <button type="button" @click=${() => { this.showHistory = false }}>Back to practice</button>
        </div>
        ${this.loadingHistory ? html`<p role="status">Loading your English attempts…</p>` : nothing}
        ${!this.loadingHistory && this.attempts.length === 0
          ? html`<p>You do not have any saved English attempts yet. Get AI feedback on a paragraph or essay to start your history.</p>`
          : nothing}
        ${this.attempts.map(attempt => html`
          <details class="english-practice-attempt">
            <summary>
              <span><strong>${attempt.practiceType === 'paragraph' ? 'Paragraph practice' : 'Essay practice'}</strong>${attempt.prompt}</span>
              <time datetime=${attempt.createdAt}>${new Date(attempt.createdAt).toLocaleString()}</time>
            </summary>
            <div class="english-practice-attempt-content">
              <h3>Your response</h3>
              <p class="english-practice-attempt-response">${attempt.response}</p>
              ${this.renderFeedback(attempt.feedback)}
              <button type="button" @click=${() => { void this.continueAttempt(attempt) }}>
                Continue with this response
              </button>
            </div>
          </details>
        `)}
      </section>
    `
  }

  render () {
    return html`
      <main class="english-practice-shell">
        <header class="english-practice-header">
          <div>
            <span class="english-practice-eyebrow">English</span>
            <h1>Practice English</h1>
            <p>Build confidence with short, focused practice sessions.</p>
          </div>
          <button type="button" class="english-practice-history-button" ?disabled=${this.loadingHistory}
            @click=${this.showAttempts}>
            ${this.loadingHistory ? 'Loading attempts…' : `My English attempts${this.attempts.length ? ` (${this.attempts.length})` : ''}`}
          </button>
        </header>

        ${this.showHistory ? this.renderHistory() : html`
          <section class="english-practice-card" aria-labelledby="english-practice-coming-soon">
            <div class="english-practice-icon" aria-hidden="true">
              <icon-lucide-book-open></icon-lucide-book-open>
            </div>
            <div>
              <span class="english-practice-label">Practice workspace</span>
              <h2 id="english-practice-coming-soon">Your English practice starts here</h2>
              <p>Choose a prompt, write a response, and review AI feedback. Your draft and each submitted English attempt are saved privately to your Pod.</p>
            </div>
            <div class="english-practice-form" aria-label="English practice setup">
              <label>
                Practice type
                <select .value=${this.practiceType} ?disabled=${this.loading || this.loadingDraft}
                  @change=${(event: Event) => {
                    void this.changePracticeType((event.target as HTMLSelectElement).value as EnglishPracticeType)
                  }}>
                  <option value="paragraph">Paragraph practice</option>
                  <option value="essay">Essay practice</option>
                </select>
              </label>
              <label>
                Prompt
                <solid-ui-combobox
                  class="english-practice-prompt-combobox"
                  select-only
                  aria-label="Prompt"
                  .value=${this.selectedPromptId}
                  ?disabled=${this.loading || this.loadingDraft}
                  @change=${(event: Event) => {
                    void this.changePrompt((event.currentTarget as HTMLElement & { value: string }).value)
                  }}
                >
                  ${this.prompts.map(item => html`<solid-ui-combobox-option value=${item.id}>${item.prompt}</solid-ui-combobox-option>`)}
                </solid-ui-combobox>
              </label>
              <div class="english-practice-prompt-generation">
                <label>
                  Generate prompts about
                  <input type="text" placeholder="e.g. life skills" .value=${this.promptTopic}
                    ?disabled=${this.loading || this.loadingDraft || this.generatingPrompts}
                    @input=${(event: Event) => { this.promptTopic = (event.target as HTMLInputElement).value }}>
                </label>
                <label>
                  Difficulty
                  <select .value=${this.promptDifficulty} ?disabled=${this.loading || this.loadingDraft || this.generatingPrompts}
                    @change=${(event: Event) => { this.promptDifficulty = (event.target as HTMLSelectElement).value as typeof this.promptDifficulty }}>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </label>
                <button type="button" ?disabled=${this.loading || this.loadingDraft || this.generatingPrompts || !this.promptTopic.trim() || !this.endpoint}
                  @click=${this.generatePrompts}>
                  ${this.generatingPrompts ? 'Generating…' : 'Generate a new set of 10'}
                </button>
              </div>
              <button type="button" ?disabled=${this.loading || this.loadingDraft || Boolean(this.pendingAttempt) || !this.responseText.trim() || !this.endpoint}
                @click=${this.assess}>
                <icon-lucide-sparkles aria-hidden="true"></icon-lucide-sparkles>
                ${this.loading ? 'Assessing…' : 'Get AI feedback'}
              </button>
            </div>
            <label class="english-practice-response" ?aria-busy=${this.loadingDraft}>${this.practiceType === 'paragraph' ? 'Your paragraph' : 'Your essay'}
              <textarea rows="9" placeholder="Write your response here…" .value=${this.responseText}
                ?disabled=${this.loading || this.loadingDraft}
                @input=${(event: Event) => {
                  this.responseText = (event.target as HTMLTextAreaElement).value
                  this.feedback = undefined
                  this.scheduleDraftSave()
                }}></textarea>
            </label>
            <p class="english-practice-note">Practice time: ${this.selectedPrompt.suggestedMinutes}; suggested length: ${this.selectedPrompt.suggestedWordRange}. Feedback covers ideas, structure, evidence, vocabulary, sentences, grammar and critical thinking.</p>
            <p class="english-practice-save-status" role="status">${this.draftStatus}</p>
            ${!this.peelDismissed && this.practiceType === 'paragraph' ? html`
              <aside class="english-peel-guide" aria-label="PEEL paragraph structure">
                <div class="english-peel-guide-heading">
                  <div><span>Writing guide</span><h3>Use the PEEL paragraph structure</h3></div>
                  <button type="button" aria-label="Dismiss PEEL guide" @click=${this.dismissPeel}>×</button>
                </div>
                <ol>
                  <li><strong>P — Point</strong><span>State the main idea or argument.</span></li>
                  <li><strong>E — Evidence</strong><span>Give an example, quotation, fact or detail.</span></li>
                  <li><strong>E — Explanation</strong><span>Explain how the evidence supports your point.</span></li>
                  <li><strong>L — Link</strong><span>Connect back to the question or overall argument.</span></li>
                </ol>
                <p><strong>Example:</strong> Mobile phones can reduce concentration. Notifications distract students from lessons, making it harder to understand new information. Therefore, restricting phone use can create a more focused learning environment.</p>
              </aside>
            ` : nothing}
            ${this.pendingAttempt ? html`
              <button type="button" class="english-practice-retry-save"
                @click=${() => { void this.persistPendingAttempt().catch(() => undefined) }}>
                Save this attempt to your Pod
              </button>
            ` : nothing}
            ${this.error ? html`<p class="english-practice-error" role="alert">${this.error}</p>` : nothing}
            ${this.feedback ? this.renderFeedback(this.feedback) : nothing}
          </section>
        `}
      </main>
    `
  }
}
