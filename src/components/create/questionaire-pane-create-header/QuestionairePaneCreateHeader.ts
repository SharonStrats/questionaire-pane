import { html } from 'lit'
import { consume } from '@lit/context'
import { customElement, WebComponent } from 'solid-ui'
import 'solid-ui/components/combobox'
import 'solid-ui/components/combobox-option'
import { Namespace, sym } from 'rdflib'
import { state } from 'lit/decorators.js'
import styles from './QuestionairePaneCreateHeader.styles.css'
import { QuestionaireContext, questionaireContext } from '../../../context'
import { createQuestionaireLogic, getQuestionnaireFormat } from '../../../service/questionaireLogic'

import '~icons/lucide/square-pen'
import '~icons/lucide/check'
import '~icons/lucide/eye'
import '~icons/lucide/pencil'
import '~icons/lucide/clock-3'
import '~icons/lucide/list'
import '~icons/lucide/star'
import '~icons/lucide/share-2'

const dct = Namespace('http://purl.org/dc/terms/')
const quiz = Namespace('http://example.org/ns/quiz#')

function isNamedNode (term: unknown): term is { doc: () => { uri: string } } {
  return Boolean(
    term &&
      typeof term === 'object' &&
      'termType' in term &&
      (term as { termType?: string }).termType === 'NamedNode' &&
      typeof (term as { doc?: () => unknown }).doc === 'function'
  )
}

@customElement('questionaire-pane-create-header')
export default class QuestionairePaneCreateHeader extends WebComponent {
  static styles = styles

  @consume({ context: questionaireContext, subscribe: true })
  accessor questionaire: QuestionaireContext = undefined as unknown as QuestionaireContext

  @state()
  private accessor editingTitle = false

  @state()
  private accessor titleDraft = ''

  @state()
  private accessor published = false

  private async editTitle () {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject
    if (!store || !subject) {
      return
    }

    const currentTitle = store.any(subject, dct('title'))?.value ?? 'Untitled Questionaire'
    this.titleDraft = currentTitle
    this.editingTitle = true
  }

  private cancelTitleEdit () {
    this.editingTitle = false
    this.titleDraft = ''
  }

  private async saveTitleEdit () {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject
    if (!store || !subject) {
      this.cancelTitleEdit()
      return
    }

    const currentTitle = store.any(subject, dct('title'))?.value ?? 'Untitled Questionaire'
    const title = this.titleDraft.trim()

    if (!title || title === currentTitle) {
      this.cancelTitleEdit()
      return
    }

    const baseUrl = subject.doc().uri.replace(/index\.ttl$/, '')
    const questionaireLogic = createQuestionaireLogic(store)
    await questionaireLogic.updateQuestionnaireTitle({ baseUrl, title })
    this.cancelTitleEdit()
  }

  private async onTitleInputKeydown (event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      await this.saveTitleEdit()
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      this.cancelTitleEdit()
    }
  }

  private async onFormatChange (event: Event) {
    const target = event.currentTarget as HTMLElement & { value?: string } | null
    if (!target) {
      return
    }

    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject
    if (!store || !subject) {
      return
    }

    const nextFormat = target.value === 'survey' ? 'survey' : 'quiz'
    const currentFormat = getQuestionnaireFormat(store, subject)
    if (nextFormat === currentFormat) {
      return
    }

    const baseUrl = subject.doc().uri.replace(/index\.ttl$/, '')
    const questionaireLogic = createQuestionaireLogic(store)
    await questionaireLogic.updateQuestionnaireFormat({ baseUrl, format: nextFormat })
    this.requestUpdate()
  }

  private publishQuestionnaire () {
    this.published = true
    this.dispatchEvent(new CustomEvent('questionaire-published', {
      bubbles: true,
      composed: true
    }))
  }

  private getDraftQuestionStats () {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject
    if (!store || !subject) {
      return { count: 0, points: 0, minutes: 0 }
    }

    const baseUrl = subject.doc().uri.replace(/index\.ttl$/, '')
    const draft = sym(`${baseUrl}draft.ttl`)
    const draftDocument = sym(`${baseUrl}draft.ttl`).doc()
    const questions = store.statementsMatching(draft, quiz('question'), undefined, draftDocument)

    let points = 0
    for (const statement of questions) {
      const question = statement.object
      if (!isNamedNode(question)) {
        continue
      }

      const questionPoints = store.any(question, quiz('points'), undefined, question.doc())?.value ?? '1'
      const parsed = Number.parseInt(questionPoints, 10)
      points += Number.isFinite(parsed) ? parsed : 1
    }

    return {
      count: questions.length,
      points,
      minutes: Math.max(1, Math.ceil(questions.length * 2))
    }
  }

  render() {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    if (!questionaire.store || !questionaire.subject) {
      return html``
    }

    const format = getQuestionnaireFormat(questionaire.store, questionaire.subject)
    const title = questionaire.store.any(questionaire.subject, dct('title'))
    const displayTitle = title?.value ?? 'Untitled Questionaire'
    const stats = this.getDraftQuestionStats()

    return html`
      <div class="questionaire-pane-create-header">
        <div class="questionaire-pane-create-header-left">
          <div class="questionaire-pane-create-header-icon">
            <icon-lucide-square-pen></icon-lucide-square-pen>
          </div>
          <div class="questionaire-pane-create-header-copy">
            <p class="questionaire-creator">${this.published ? 'Questionaire Published' : 'Questionaire Creator'}</p>
            <div class="questionaire-pane-create-header-title-row">
              ${this.editingTitle
                ? html`
                    <input
                      class="questionaire-pane-create-header-title-input"
                      type="text"
                      .value=${this.titleDraft}
                      ?autofocus=${this.editingTitle}
                      spellcheck="false"
                      aria-label="Questionnaire title"
                      @input=${(event: Event) => {
                        this.titleDraft = (event.currentTarget as HTMLInputElement).value
                      }}
                      @keydown=${(event: KeyboardEvent) => { void this.onTitleInputKeydown(event) }}
                      @blur=${() => { void this.saveTitleEdit() }}
                    />
                  `
                : html`
                    <h1>${displayTitle}</h1>
                    <button
                      class="questionaire-pane-create-header-title-edit"
                      type="button"
                      aria-label="Edit questionnaire title"
                      @click=${() => { void this.editTitle() }}
                    >
                      <icon-lucide-pencil></icon-lucide-pencil>
                    </button>
                  `}
            </div>
            <div class="questionaire-pane-create-header-stats" aria-label="Questionnaire summary">
              <span class="questionaire-pane-create-header-stat">
                <icon-lucide-list></icon-lucide-list>
                <span>${stats.count} question${stats.count === 1 ? '' : 's'}</span>
              </span>
              <span class="questionaire-pane-create-header-stat">
                <icon-lucide-star></icon-lucide-star>
                <span>${stats.points} points</span>
              </span>
              <span class="questionaire-pane-create-header-stat">
                <icon-lucide-clock-3></icon-lucide-clock-3>
                <span>~${stats.minutes} min</span>
              </span>
            </div>
          </div>
        </div>
        <div class="questionaire-pane-create-header-actions" aria-label="Questionnaire actions">
          <span class="questionaire-pane-create-header-unsaved">Unsaved changes</span>
          <div class="questionaire-pane-create-header-format-group">
            <span class="questionaire-pane-create-header-format-label">FORMAT</span>
            <solid-ui-combobox
              class="questionaire-pane-create-header-format"
              aria-label="Format"
              .value=${format}
              @change=${this.onFormatChange}
            >
              <solid-ui-combobox-option value="quiz">Quiz</solid-ui-combobox-option>
              <solid-ui-combobox-option value="survey">Survey</solid-ui-combobox-option>
            </solid-ui-combobox>
          </div>
          <button class="questionaire-pane-create-header-action" type="button">
            <icon-lucide-check></icon-lucide-check>
            <span>Save draft</span>
          </button>
          <button class="questionaire-pane-create-header-action questionaire-pane-create-header-action--muted" type="button">
            <icon-lucide-eye></icon-lucide-eye>
            <span>${this.published ? 'View live' : 'Preview'}</span>
          </button>
          <button
            class="questionaire-pane-create-header-action questionaire-pane-create-header-action--primary"
            type="button"
            @click=${() => this.publishQuestionnaire()}
          >
            <icon-lucide-share-2></icon-lucide-share-2>
            <span>${this.published ? 'Published' : 'Publish'}</span>
          </button>
        </div>
      </div>
    `
  }
}
