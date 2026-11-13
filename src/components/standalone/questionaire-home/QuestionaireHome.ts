import { html, nothing } from 'lit'
import { property } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import type { QuestionnaireEntry, SharedQuestionnaireEntry } from '../../../standalone/library'
import styles from './QuestionaireHome.styles.css'
import type { HomeSection } from './homeNavigation'
import brandIcon from '../../../assets/questionnaire-home/brand.svg'
import folderIcon from '../../../assets/questionnaire-home/folder.svg'
import plusIcon from '../../../assets/questionnaire-home/plus.svg'
import workspaceIcon from '../../../assets/questionnaire-home/workspace.svg'
import infoIcon from '../../../assets/questionnaire-home/info.svg'
import emptyIcon from '../../../assets/questionnaire-home/empty.svg'
import emptySearchIcon from '../../../assets/questionnaire-home/empty-search.svg'
import emptyPlusIcon from '../../../assets/questionnaire-home/empty-plus.svg'
import cardFolderIcon from '../../../assets/questionnaire-home/card-folder.svg'
import discoverPublicIcon from '../../../assets/questionnaire-home/discover-public.svg'
import discoverPrivateIcon from '../../../assets/questionnaire-home/discover-private.svg'
import discoverPublicActiveIcon from '../../../assets/questionnaire-home/discover-public-active.svg'
import discoverPrivateMutedIcon from '../../../assets/questionnaire-home/discover-private-muted.svg'

import 'solid-ui/components/account'
import 'solid-ui/components/button'
import 'solid-ui/components/provider'
import '~icons/lucide/file-check-corner'
import '~icons/lucide/square-pen'

@customElement('questionaire-home')
export default class QuestionaireHome extends WebComponent {
  static styles = styles

  @property({ attribute: false })
  accessor entries: QuestionnaireEntry[] = []

  @property({ attribute: false })
  accessor publishedEntries: QuestionnaireEntry[] = []

  @property({ attribute: false })
  accessor sharedEntries: SharedQuestionnaireEntry[] = []

  @property({ attribute: false })
  accessor section: HomeSection = 'mine'

  @property({ attribute: false })
  accessor workspaceReady = false

  @property({ attribute: false })
  accessor status = ''

  @property({ attribute: false })
  accessor statusKind: 'info' | 'error' = 'info'

  private dispatchAction (name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, {
      bubbles: true,
      composed: true,
      detail
    }))
  }

  private renderButton (label: string, icon: string, action: string, primary = false) {
    return html`
      <button class="questionaire-home-button ${primary ? 'questionaire-home-button--primary' : ''}" type="button"
        @click=${() => this.dispatchAction(action)}>
        <img src=${icon} alt="" aria-hidden="true">
        ${label}
      </button>
    `
  }

  private renderEmptyState () {
    return html`
      <section class="questionaire-home-empty">
        <div class="questionaire-home-empty-icon"><img src=${emptyIcon} alt="" aria-hidden="true"></div>
        <h2>Create your first questionnaire</h2>
        <p>Start a quiz or survey, or search your Pod for something you made before. We will help you choose where it lives.</p>
        <div class="questionaire-home-empty-actions">
          ${this.renderButton('Search my Pod', emptySearchIcon, 'questionaire-home-search')}
          ${this.renderButton('Create questionnaire', emptyPlusIcon, 'questionaire-home-create', true)}
        </div>
      </section>
    `
  }

  private renderSharedEmptyState () {
    return html`
      <section class="questionaire-home-empty">
        <div class="questionaire-home-empty-icon"><img src=${emptyIcon} alt="" aria-hidden="true"></div>
        <h2>Nothing has been shared with you yet</h2>
        <p>When someone shares a published questionnaire with you, it will appear here.</p>
      </section>
    `
  }

  private folderLabel (entry: QuestionnaireEntry): string {
    const segments = new URL(entry.subject.uri).pathname
      .split('/')
      .filter(Boolean)
      .map(segment => decodeURIComponent(segment))
    const index = segments.findIndex(segment => segment.toLocaleLowerCase() === 'questionnaires')
    const publishedIndex = segments.findIndex(segment => segment.toLocaleLowerCase() === 'published')
    if (index >= 0 && publishedIndex > index + 1) {
      return segments.slice(index + 1, publishedIndex - 1).join(' / ') || 'Questionnaires'
    }
    const resourceFolderEnd = Math.max(0, segments.length - 2)
    const folderSegments = index >= 0
      ? segments.slice(index + 1, resourceFolderEnd)
      : segments.slice(Math.max(0, resourceFolderEnd - 2), resourceFolderEnd)
    return folderSegments.join(' / ') || 'Questionnaires'
  }

  private renderFileCard (entry: QuestionnaireEntry) {
    const kind = entry.kind === 'quiz' ? 'quiz' : 'survey'
    const publicIndexed = entry.indexes.public
    const privateIndexed = entry.indexes.private
    const discoveryButton = (kind: 'public' | 'private', indexed: boolean) => {
      const publicKind = kind === 'public'
      const icon = publicKind
        ? (indexed ? discoverPublicActiveIcon : discoverPublicIcon)
        : (indexed ? discoverPrivateIcon : discoverPrivateMutedIcon)
      return html`
        <button class="questionaire-home-discovery ${indexed ? 'questionaire-home-discovery--active' : ''}" type="button"
          @click=${() => this.dispatchAction('questionaire-home-add-index', { subject: entry.subject, kind })}>
          <img src=${icon} alt="" aria-hidden="true">
          ${publicKind ? 'Discover publicly' : 'Discover privately'}
        </button>
      `
    }

    return html`
      <article class="questionaire-home-card">
        <div class="questionaire-home-card-heading">
          <div class="questionaire-home-card-icon">
            ${kind === 'quiz'
              ? html`<icon-lucide-file-check-corner aria-hidden="true"></icon-lucide-file-check-corner>`
              : html`<img src=${workspaceIcon} alt="" aria-hidden="true">`}
          </div>
          <div class="questionaire-home-card-copy">
            <button class="questionaire-home-card-title" type="button"
              @click=${() => this.dispatchAction('questionaire-home-open', entry.subject)}>
              ${entry.title}
            </button>
            <span class="questionaire-home-kind questionaire-home-kind--${kind}">${kind}</span>
            <p class="questionaire-home-card-description">${entry.description || 'A questionnaire ready to share and respond to.'}</p>
          </div>
          <solid-ui-button class="questionaire-home-edit" variant="ghost" aria-label="Edit questionnaire"
            @click=${() => this.dispatchAction('questionaire-home-open', entry.subject)}>
            <icon-lucide-square-pen slot="icon"></icon-lucide-square-pen>
          </solid-ui-button>
        </div>
        <div class="questionaire-home-card-meta">
          <span>${entry.questionCount} questions</span>
          <span>Updated recently</span>
        </div>
        <div class="questionaire-home-card-actions">
          ${discoveryButton('public', publicIndexed)}
          ${discoveryButton('private', privateIndexed)}
        </div>
      </article>
    `
  }

  private groupEntries (entries: QuestionnaireEntry[]): Array<[string, QuestionnaireEntry[]]> {
    const groups = new Map<string, QuestionnaireEntry[]>()
    for (const entry of entries) {
      const folder = this.folderLabel(entry)
      const group = groups.get(folder) ?? []
      group.push(entry)
      groups.set(folder, group)
    }
    return [...groups.entries()]
  }

  private renderFileGroup (folder: string, entries: QuestionnaireEntry[]) {
    return html`
      <div class="questionaire-home-file-group">
        <div class="questionaire-home-file-group-heading">
          <img src=${cardFolderIcon} alt="" aria-hidden="true">
          <span>${folder}</span>
          <small>${entries.length} item${entries.length === 1 ? '' : 's'}</small>
        </div>
        <div class="questionaire-home-file-group-cards">
          ${entries.map(entry => this.renderFileCard(entry))}
        </div>
      </div>
    `
  }

  private renderQuizGroup (folder: string, entries: QuestionnaireEntry[], showingShared = false) {
    return html`
      <div class="questionaire-home-quiz-group">
        <div class="questionaire-home-quiz-group-heading">
          <img src=${cardFolderIcon} alt="" aria-hidden="true">
          <span>${folder}</span>
          <small>${entries.length} available</small>
        </div>
        ${entries.map(entry => this.renderQuizRow(entry, showingShared))}
      </div>
    `
  }

  private renderQuizRow (entry: QuestionnaireEntry, showingShared = false) {
    const type = entry.kind === 'survey' ? 'survey' : 'quiz'
    const sharedEntry = entry as SharedQuestionnaireEntry
    return html`
      <div class="questionaire-home-quiz-row">
        <div class="questionaire-home-card-icon"><icon-lucide-file-check-corner aria-hidden="true"></icon-lucide-file-check-corner></div>
        <div class="questionaire-home-quiz-copy">
          <strong>${entry.title}</strong>
          <span>Latest published version · ${entry.questionCount} questions</span>
        </div>
        <div class="questionaire-home-quiz-actions">
          ${showingShared && !sharedEntry.stored ? html`
            <button class="questionaire-home-store-button" type="button"
              @click=${() => this.dispatchAction('questionaire-home-store', sharedEntry)}>
              Store for me
            </button>
          ` : nothing}
          <button class="questionaire-home-take-button" type="button"
            @click=${() => this.dispatchAction('questionaire-home-open', entry.subject)}>
            Take ${type} →
          </button>
        </div>
      </div>
    `
  }

  private renderEntries (entries: QuestionnaireEntry[], showingShared = false) {
    if (showingShared) {
      return this.renderSharedEntries(entries as SharedQuestionnaireEntry[])
    }

    const files = this.groupEntries(entries)
    const quizzes = this.groupEntries(this.publishedEntries.length ? this.publishedEntries : entries)
    return html`
      <section class="questionaire-home-files" aria-labelledby="questionnaire-files">
        <div class="questionaire-home-section-heading">
          <div>
            <h2 id="questionnaire-files">Questionnaire files <span>${files.length}</span></h2>
            <p>Your editable working copies. Open one to change its questions or publish a new version.</p>
          </div>
          <img src=${infoIcon} alt="" aria-hidden="true">
        </div>
        <div class="questionaire-home-file-grid">${files.map(([folder, entries]) => this.renderFileGroup(folder, entries))}</div>
      </section>
      <section class="questionaire-home-quizzes" aria-labelledby="quizzes-surveys">
        <div class="questionaire-home-quizzes-heading">
          <div class="questionaire-home-quizzes-icon"><img src=${emptyIcon} alt="" aria-hidden="true"></div>
          <div>
            <h2 id="quizzes-surveys">Quizzes &amp; Surveys <span>${quizzes.length}</span></h2>
            <p>Ready-to-take questionnaires. Editing the original questionnaire file won't change one that is already available here.</p>
          </div>
        </div>
        ${quizzes.map(([folder, groupEntries]) => this.renderQuizGroup(folder, groupEntries, showingShared))}
      </section>
    `
  }

  private renderSharedEntries (entries: SharedQuestionnaireEntry[]) {
    const inboxEntries = entries.filter(entry => entry.notification && !entry.stored)
    const availableEntries = entries.filter(entry => !entry.notification || entry.stored)
    const renderSection = (
      id: string,
      title: string,
      description: string,
      sectionEntries: SharedQuestionnaireEntry[],
      emptyMessage: string
    ) => html`
      <section class="questionaire-home-quizzes questionaire-home-shared-section" aria-labelledby=${id}>
        <div class="questionaire-home-quizzes-heading">
          <div class="questionaire-home-quizzes-icon"><img src=${emptyIcon} alt="" aria-hidden="true"></div>
          <div>
            <h2 id=${id}>${title} <span>${sectionEntries.length}</span></h2>
            <p>${description}</p>
          </div>
        </div>
        ${sectionEntries.length
          ? sectionEntries.map(entry => this.renderQuizRow(entry, true))
          : html`<p class="questionaire-home-shared-empty">${emptyMessage}</p>`}
      </section>
    `

    return html`
      ${renderSection(
        'shared-inbox',
        'Inbox',
        'Questionnaires shared directly with you appear here first.',
        inboxEntries,
        'No direct questionnaire shares are waiting for you.'
      )}
      ${renderSection(
        'shared-discovered',
        'Quizzes & Surveys',
        'Published questionnaires discovered through your contacts and friends, or saved from your inbox.',
        availableEntries,
        'No quizzes or surveys are available yet.'
      )}
    `
  }

  render () {
    const showingShared = this.section === 'shared'
    const entries = showingShared ? this.sharedEntries : this.entries
    return html`
      <div class="questionaire-home-shell">
        <header class="questionaire-home-header">
          <div class="questionaire-home-header-inner">
            <div class="questionaire-home-brand">
              <div class="questionaire-home-brand-icon"><img src=${brandIcon} alt="" aria-hidden="true"></div>
              <div>
                <div class="questionaire-home-brand-title">Questionnaires</div>
                <div class="questionaire-home-brand-subtitle">Create, share, and respond</div>
              </div>
            </div>
            <nav class="questionaire-home-nav" aria-label="Questionnaire sections">
              <button class="questionaire-home-nav-item ${!showingShared ? 'questionaire-home-nav-item--active' : ''}"
                type="button" @click=${() => { this.section = 'mine' }}>My questionnaires</button>
              <button class="questionaire-home-nav-item ${showingShared ? 'questionaire-home-nav-item--active' : ''}"
                type="button" @click=${() => { this.section = 'shared' }}>Shared with me</button>
            </nav>
            <div class="questionaire-home-header-actions">
              ${this.renderButton('Open my Pod', folderIcon, 'questionaire-home-open-pod')}
              <solid-ui-provider><solid-ui-account></solid-ui-account></solid-ui-provider>
            </div>
          </div>
        </header>
        <main class="questionaire-home-main">
          <div class="questionaire-home-content">
            <div class="questionaire-home-heading-row">
              <div>
                <h1>${showingShared ? 'Shared with me' : 'My questionnaires'}</h1>
                ${!showingShared ? html`
                  <p class="questionaire-home-description">Everything you create or choose to make discoverable is collected here, even when it lives in different parts of your Pod.</p>
                ` : nothing}
              </div>
              ${!showingShared ? html`
                <div class="questionaire-home-heading-actions">
                  ${this.renderButton('Choose from my Pod', folderIcon, 'questionaire-home-choose')}
                  ${this.renderButton('Create questionnaire', plusIcon, 'questionaire-home-create', true)}
                </div>
              ` : nothing}
            </div>
            ${!showingShared ? html`
              <div class="questionaire-home-workspace-banner">
                <div class="questionaire-home-workspace-icon"><img src=${workspaceIcon} alt="" aria-hidden="true"></div>
                <div class="questionaire-home-workspace-copy">
                  <strong>${this.workspaceReady ? 'Questionnaires workspace connected' : 'No dedicated workspace yet'}</strong>
                  <span>${this.workspaceReady
                    ? 'New questionnaires can be saved to Home / Questionnaires automatically.'
                    : 'You can create one the next time you make a questionnaire, or choose any Pod folder.'}</span>
                </div>
              </div>
            ` : nothing}
            ${!showingShared && this.status
              ? html`<p class="questionaire-home-status questionaire-home-status--${this.statusKind}">${this.status}</p>`
              : nothing}
            ${!showingShared ? html`
              <div class="questionaire-home-count">${entries.length} questionnaire${entries.length === 1 ? '' : 's'}
                <img src=${infoIcon} alt="" aria-hidden="true">
              </div>
            ` : nothing}
            ${entries.length
              ? this.renderEntries(entries, showingShared)
              : showingShared
                ? this.renderSharedEmptyState()
                : this.renderEmptyState()}
          </div>
        </main>
      </div>
    `
  }
}
