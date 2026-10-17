import { html } from 'lit'
import { consume } from '@lit/context'
import { customElement, ns, showDialog, WebComponent } from 'solid-ui'
import 'solid-ui/components/combobox'
import 'solid-ui/components/combobox-option'
import 'solid-ui/components/menu'
import 'solid-ui/components/menu-item'
import { literal, sym, type NamedNode } from 'rdflib'
import { solidLogicSingleton } from 'solid-logic'
import { state } from 'lit/decorators.js'
import styles from './QuestionairePaneCreateHeader.styles.css'
import { QuestionaireContext, questionaireContext } from '../../../context'
import { createQuestionaireLogic } from '../../../service/questionaireLogic'
import { getQuestionnaireFormat } from '../../../service/questionaireQuestionQueries'
import { readQuestionValue } from '../../../service/questionaireQuestionAccessors'
import { questionairePredicates } from '../../../service/questionairePredicates'

import '~icons/lucide/square-pen'
import '~icons/lucide/check'
import '~icons/lucide/eye'
import '~icons/lucide/pencil'
import '~icons/lucide/clock-3'
import '~icons/lucide/list'
import '~icons/lucide/star'
import '~icons/lucide/share-2'
import AccessControlModal from 'solid-ui/components/access-control-modal'

function isNamedNode (term: unknown): term is NamedNode {
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

  @state()
  private accessor publishing = false

  @state()
  private accessor publishError = ''

  @state()
  private accessor draftStats = { count: 0, points: 0, minutes: 0 }

  @state()
  private accessor discoveredPublishedVersions: NamedNode[] = []

  private statsSubjectUri: string | null = null
  private onQuestionUpdated = () => {
    void this.loadDraftQuestionStats()
  }

  connectedCallback () {
    super.connectedCallback()
    window.addEventListener('questionaire-question-updated', this.onQuestionUpdated)
    window.addEventListener('questionaire-question-saved', this.onQuestionUpdated)
  }

  disconnectedCallback () {
    window.removeEventListener('questionaire-question-updated', this.onQuestionUpdated)
    window.removeEventListener('questionaire-question-saved', this.onQuestionUpdated)
    super.disconnectedCallback()
  }

  protected updated () {
    const subject = this.questionaire?.subject
    if (!subject || this.statsSubjectUri === subject.uri) {
      return
    }

    this.statsSubjectUri = subject.uri
    void this.loadDraftQuestionStats()
    void this.loadPublishedVersions()
  }

  private async loadDraftQuestionStats () {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject
    const fetcher = store?.fetcher
    if (!store || !subject || !fetcher) {
      return
    }

    const baseUrl = subject.doc().uri.replace(/index\.ttl$/, '')
    const draft = sym(`${baseUrl}draft.ttl`)
    const draftDocument = draft.doc()

    try {
      await fetcher.load(draftDocument)
      const questions = store.statementsMatching(
        draft,
        questionairePredicates.questionnaire.question,
        undefined,
        draftDocument
      )

      await Promise.all(
        questions
          .map((statement) => statement.object)
          .filter(isNamedNode)
          .map((question) => fetcher.load(question.doc()))
      )

      this.draftStats = this.getDraftQuestionStats()
    } catch (error) {
      console.error('Unable to load questionnaire statistics', error)
    }
  }

  private async loadPublishedVersions () {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject
    const fetcher = store?.fetcher
    if (!store || !subject || !fetcher) {
      return
    }

    const baseUrl = subject.doc().uri.replace(/index\.ttl$/, '')
    const publishedContainer = sym(`${baseUrl}published/`)

    try {
      await fetcher.load(publishedContainer)
      const containers = store.each(publishedContainer, ns.ldp('contains'))
        .filter(isNamedNode)
        .filter((container) => container.uri.endsWith('/'))

      const versions = await Promise.all(containers.map(async (container) => {
        const snapshot = sym(`${container.uri}index.ttl#this`)
        await fetcher.load(snapshot.doc())
        return store.holds(snapshot, questionairePredicates.questionnaire.status, literal('Published'), snapshot.doc())
          ? snapshot
          : null
      }))

      this.discoveredPublishedVersions = versions.filter(isNamedNode)
    } catch (error) {
      console.error('Unable to discover published questionnaire versions', error)
    }
  }

  private async editTitle () {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject
    if (!store || !subject) {
      return
    }

    const currentTitle = readQuestionValue(store, subject, 'title')
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

    const currentTitle = readQuestionValue(store, subject, 'title')
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

  private async publishQuestionnaire () {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject
    if (!store || !subject || !isNamedNode(subject) || this.publishing) {
      return
    }

    this.publishing = true
    this.publishError = ''

    try {
      const questionaireLogic = createQuestionaireLogic(store)
      const result = await questionaireLogic.publishQuestionnaire({ subject })
      this.published = true
      this.dispatchEvent(new CustomEvent('questionaire-published', {
        bubbles: true,
        composed: true,
        detail: result
      }))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.publishError = `Unable to publish questionnaire: ${message}`
      console.error(this.publishError, error)
      this.dispatchEvent(new CustomEvent('questionaire-publish-error', {
        bubbles: true,
        composed: true,
        detail: { error }
      }))
    } finally {
      this.publishing = false
    }
  }

  private getPublishedSnapshot (): NamedNode | null {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const snapshot = questionaire.store && questionaire.subject
      ? questionaire.store.any(questionaire.subject, questionairePredicates.questionnaire.hasVersion, undefined, questionaire.subject.doc())
      : null
    return isNamedNode(snapshot) ? snapshot : null
  }

  private get isPublished (): boolean {
    return this.published || this.getPublishedSnapshot() !== null
  }

  private getShareResources () {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject
    if (!store || !subject) {
      return []
    }

    const containerUri = (uri: string) => uri.replace(/index\.ttl(?:#this)?$/, '')
    const linkedVersions = store.each(subject, questionairePredicates.questionnaire.hasVersion, undefined, subject.doc()).filter(isNamedNode)
    const versions = [...linkedVersions, ...this.discoveredPublishedVersions]
      .filter((version, index, all) => all.findIndex((candidate) => candidate.doc().uri === version.doc().uri) === index)
      .sort((left, right) => left.doc().uri.localeCompare(right.doc().uri))
    return [
      { label: 'Questionnaire draft', uri: containerUri(subject.doc().uri) },
      ...versions.map((version, index) => ({
        label: `Published version ${index + 1} (${version.doc().uri.split('/').slice(-2, -1)[0] ?? 'snapshot'})`,
        uri: containerUri(version.doc().uri)
      }))
    ]
  }

  private async openShareDialog (resource: { label: string, uri: string }) {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    if (!store) {
      return
    }

    try {
      if (solidLogicSingleton.store !== store) {
        throw new Error('This host does not expose its access-control service to the questionnaire.')
      }
      const accessGrants = await solidLogicSingleton.acl.findAccessGrants(resource.uri)
      showDialog<AccessControlModal>(AccessControlModal, {
        props: {
          subjectUri: resource.uri,
          accessGrants
        }
      })
    } catch (error) {
      this.publishError = 'Unable to open sharing controls: ' + (error instanceof Error ? error.message : String(error))
    }
  }
  private getPublishedVersionResources () {
    const questionaire = this.questionaire ?? { store: null, subject: null }
    const store = questionaire.store
    const subject = questionaire.subject
    if (!store || !subject) {
      return []
    }

    const linkedVersions = store.each(subject, questionairePredicates.questionnaire.hasVersion, undefined, subject.doc()).filter(isNamedNode)
    const versions = [...linkedVersions, ...this.discoveredPublishedVersions]
      .filter((version, index, all) => all.findIndex((candidate) => candidate.doc().uri === version.doc().uri) === index)
      .sort((left, right) => left.doc().uri.localeCompare(right.doc().uri))

    return versions.map((version, index) => ({
      label: `Published version ${index + 1} (${version.doc().uri.split('/').slice(-2, -1)[0] ?? 'snapshot'})`,
      version
    }))
  }

  private requestPreview (version: NamedNode) {
    if (!this.isPublished || !version) {
      return
    }

    this.dispatchEvent(new CustomEvent('questionaire-preview-requested', {
      bubbles: true,
      composed: true,
      detail: { published: version }
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
    const questions = store.statementsMatching(draft, questionairePredicates.questionnaire.question, undefined, draftDocument)

    let points = 0
    for (const statement of questions) {
      const question = statement.object
      if (!isNamedNode(question)) {
        continue
      }

      const questionPoints = readQuestionValue(store, question, 'points') || '1'
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
    const displayTitle = readQuestionValue(questionaire.store, questionaire.subject, 'title')
    const stats = this.draftStats

    return html`
      <div class="questionaire-pane-create-header">
        <div class="questionaire-pane-create-header-left">
          <div class="questionaire-pane-create-header-icon">
            <icon-lucide-square-pen></icon-lucide-square-pen>
          </div>
          <div class="questionaire-pane-create-header-copy">
            <p class="questionaire-creator">${this.isPublished ? 'Questionaire Published' : 'Questionaire Creator'}</p>
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
          ${this.publishError
            ? html`<span role="alert">${this.publishError}</span>`
            : ''}
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
          ${this.isPublished ? html`
            <solid-ui-menu class="questionaire-pane-create-header-share-menu">
              <button class="questionaire-pane-create-header-action" type="button" slot="trigger">
                <icon-lucide-share-2></icon-lucide-share-2>
                <span>Share</span>
              </button>
              ${this.getShareResources().map((resource) => html`
                <solid-ui-menu-item @solid-ui-select=${() => { void this.openShareDialog(resource) }}>
                  ${resource.label}
                </solid-ui-menu-item>
              `)}
            </solid-ui-menu>
          ` : ''}
          ${this.isPublished
            ? html`
                <solid-ui-menu class="questionaire-pane-create-header-preview-menu">
                  <button class="questionaire-pane-create-header-action questionaire-pane-create-header-action--muted" type="button" slot="trigger">
                    <icon-lucide-eye></icon-lucide-eye>
                    <span>View live</span>
                  </button>
                  ${this.getPublishedVersionResources().map((resource) => html`
                    <solid-ui-menu-item @solid-ui-select=${() => { this.requestPreview(resource.version) }}>
                      ${resource.label}
                    </solid-ui-menu-item>
                  `)}
                </solid-ui-menu>
              `
            : html`
                <button
                  class="questionaire-pane-create-header-action questionaire-pane-create-header-action--muted"
                  type="button"
                  disabled
                >
                  <icon-lucide-eye></icon-lucide-eye>
                  <span>Preview</span>
                </button>
              `}
          <button
            class="questionaire-pane-create-header-action questionaire-pane-create-header-action--primary"
            type="button"
            ?disabled=${this.publishing}
            @click=${() => { void this.publishQuestionnaire() }}
          >
            <icon-lucide-share-2></icon-lucide-share-2>
            <span>${this.publishing ? 'Publishing…' : (this.isPublished ? 'Published' : 'Publish')}</span>
          </button>
        </div>
      </div>
    `
  }
}
