import { html, nothing } from 'lit'
import { property } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import type { QuestionnaireEntry, QuestionnaireIndexStatus, SharedQuestionnaireEntry } from '../../../standalone/library'
import styles from './QuestionaireHome.styles.css'
import { navigateHomeSection, type HomeSection } from './homeNavigation'

import 'solid-ui/components/button'
import '~icons/lucide/check'
import '~icons/lucide/folder-open'
import '~icons/lucide/globe-2'
import '~icons/lucide/lock-keyhole'
import '~icons/lucide/plus'
import '~icons/lucide/search'

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

  private dispatchAction (name: string, detail?: unknown) {
    this.dispatchEvent(new CustomEvent(name, {
      bubbles: true,
      composed: true,
      detail
    }))
  }

  private renderHeader () {
    return html`
      <header class="questionaire-home-header">
        <div class="questionaire-home-header-inner">
          <div class="questionaire-home-brand">
            <div class="questionaire-home-brand-icon" aria-hidden="true">☷</div>
            <div>
              <div class="questionaire-home-brand-title">Questionnaires</div>
              <div class="questionaire-home-brand-subtitle">Create, share, and respond</div>
            </div>
          </div>
          <nav class="questionaire-home-nav" aria-label="Questionnaire sections">
            <button
              class="questionaire-home-nav-item ${this.section === 'mine' ? 'questionaire-home-nav-item--active' : ''}"
              type="button"
              @click=${() => { this.section = navigateHomeSection(this.section, 'mine') }}
            >My questionnaires</button>
            <button
              class="questionaire-home-nav-item ${this.section === 'shared' ? 'questionaire-home-nav-item--active' : ''}"
              type="button"
              @click=${() => { this.section = navigateHomeSection(this.section, 'shared') }}
            >Shared with me</button>
          </nav>
          <div class="questionaire-home-header-actions">
            <solid-ui-button variant="secondary" @click=${() => this.dispatchAction('questionaire-home-open-pod')}>
              <icon-lucide-folder-open slot="icon" aria-hidden="true"></icon-lucide-folder-open>
              Open my Pod
            </solid-ui-button>
          </div>
        </div>
      </header>
    `
  }

  private renderWorkspaceBanner () {
    return html`
      <div class="questionaire-home-workspace-banner ${this.workspaceReady ? 'questionaire-home-workspace-banner--ready' : ''}">
        <div class="questionaire-home-workspace-icon" aria-hidden="true">
          ${this.workspaceReady
            ? html`<icon-lucide-check></icon-lucide-check>`
            : html`<icon-lucide-folder-open></icon-lucide-folder-open>`}
        </div>
        <div class="questionaire-home-workspace-copy">
          <strong>${this.workspaceReady ? 'Questionnaires workspace connected' : 'No dedicated workspace yet'}</strong>
          <span>${this.workspaceReady
            ? 'New questionnaires can be saved to Home / Questionnaires automatically.'
            : 'Create a questionnaire to set up your workspace automatically.'}</span>
        </div>
        <div class="questionaire-home-workspace-preview">
          <span>PREVIEW</span>
          <button type="button" class="questionaire-home-segment questionaire-home-segment--active">With items</button>
          <button type="button" class="questionaire-home-segment" disabled>First-time</button>
        </div>
      </div>
    `
  }

  private renderCard (entry: QuestionnaireEntry) {
    const kindLabel = entry.kind === 'quiz' ? 'Quiz' : 'Survey'
    const indexLabel = (kind: keyof QuestionnaireIndexStatus) => entry.indexes[kind]
      ? html`<span class="questionaire-home-index-status"><icon-lucide-check></icon-lucide-check> Discover ${kind}</span>`
      : html`<solid-ui-button
          variant="ghost"
          @click=${() => this.dispatchAction('questionaire-home-add-index', { subject: entry.subject, kind })}
        >
          ${kind === 'public' ? html`<icon-lucide-globe-2 slot="icon"></icon-lucide-globe-2>` : html`<icon-lucide-lock-keyhole slot="icon"></icon-lucide-lock-keyhole>`}
          Discover ${kind}
        </solid-ui-button>`

    return html`
      <article class="questionaire-home-card">
        <div class="questionaire-home-card-topline">
          <span class="questionaire-home-kind questionaire-home-kind--${entry.kind}">${kindLabel}</span>
        </div>
        <button class="questionaire-home-card-title" type="button" @click=${() => this.dispatchAction('questionaire-home-open', entry.subject)}>
          ${entry.title}
        </button>
        <p class="questionaire-home-card-description">${entry.description || 'A questionnaire ready to share and respond to.'}</p>
        <div class="questionaire-home-card-meta">
          <span>${entry.questionCount} questions</span>
          <span aria-hidden="true">|</span>
          <span>Published questionnaire</span>
        </div>
        <div class="questionaire-home-card-divider"></div>
        <div class="questionaire-home-card-location">
          <icon-lucide-folder-open aria-hidden="true"></icon-lucide-folder-open>
          <span>${entry.kind === 'quiz' ? 'Questionnaires' : 'Projects'} / ${entry.title}</span>
        </div>
        <div class="questionaire-home-card-actions">
          ${indexLabel('public')}
          ${indexLabel('private')}
        </div>
        <p class="questionaire-home-card-updated">Available in your workspace</p>
      </article>
    `
  }

  private renderSharedCard (entry: SharedQuestionnaireEntry) {
    const kindLabel = entry.kind === 'quiz' ? 'Quiz' : 'Survey'
    return html`
      <article class="questionaire-home-card">
        <div class="questionaire-home-card-topline">
          <span class="questionaire-home-kind questionaire-home-kind--${entry.kind}">${kindLabel}</span>
        </div>
        <button class="questionaire-home-card-title" type="button" @click=${() => this.dispatchAction('questionaire-home-open', entry.subject)}>
          ${entry.title}
        </button>
        <p class="questionaire-home-card-description">${entry.description || 'A questionnaire shared with you.'}</p>
        <div class="questionaire-home-card-meta">
          <span>${entry.questionCount} questions</span>
          <span aria-hidden="true">|</span>
          <span>Published questionnaire</span>
        </div>
        <div class="questionaire-home-card-divider"></div>
        <p class="questionaire-home-card-updated">Shared by ${entry.sharedBy.label}</p>
      </article>
    `
  }

  private renderPublishedCard (entry: QuestionnaireEntry) {
    const kindLabel = entry.kind === 'quiz' ? 'Quiz' : 'Survey'
    return html`
      <article class="questionaire-home-card">
        <div class="questionaire-home-card-topline">
          <span class="questionaire-home-kind questionaire-home-kind--${entry.kind}">${kindLabel}</span>
        </div>
        <button class="questionaire-home-card-title" type="button" @click=${() => this.dispatchAction('questionaire-home-open', entry.subject)}>
          ${entry.title}
        </button>
        <p class="questionaire-home-card-description">${entry.description || 'Your published questionnaire is ready to take.'}</p>
        <div class="questionaire-home-card-meta">
          <span>${entry.questionCount} questions</span>
          <span aria-hidden="true">|</span>
          <span>Published questionnaire</span>
        </div>
        <div class="questionaire-home-card-divider"></div>
        <div class="questionaire-home-card-actions">
          <solid-ui-button variant="primary" @click=${() => this.dispatchAction('questionaire-home-open', entry.subject)}>
            Open in Take
          </solid-ui-button>
        </div>
      </article>
    `
  }

  private renderEmptyState () {
    return html`
      <section class="questionaire-home-empty">
        <div class="questionaire-home-empty-icon" aria-hidden="true">
          <icon-lucide-folder-open></icon-lucide-folder-open>
        </div>
        <h2>Create your first questionnaire</h2>
        <p>Start a quiz or survey, or search your Pod for something you made before. We will help you choose where it lives.</p>
        <div class="questionaire-home-empty-actions">
          <solid-ui-button variant="secondary" @click=${() => this.dispatchAction('questionaire-home-search')}>
            <icon-lucide-search slot="icon" aria-hidden="true"></icon-lucide-search>
            Search my Pod
          </solid-ui-button>
          <solid-ui-button variant="primary" @click=${() => this.dispatchAction('questionaire-home-create')}>
            <icon-lucide-plus slot="icon" aria-hidden="true"></icon-lucide-plus>
            Create questionnaire
          </solid-ui-button>
        </div>
      </section>
    `
  }

  render () {
    const showingShared = this.section === 'shared'
    const entries = showingShared ? this.sharedEntries : this.entries
    return html`
      ${this.renderHeader()}
      <main class="questionaire-home-main">
        <div class="questionaire-home-content">
          <div class="questionaire-home-heading-row">
            <div>
              <p class="questionaire-home-kicker">${showingShared ? 'Known people' : 'Your workspace'}</p>
              <h1>${showingShared ? 'Shared with me' : 'My questionnaires'}</h1>
              <p class="questionaire-home-description">${showingShared
                ? 'Published questionnaires registered in the public Type Indexes of your contacts and friends.'
                : 'Everything you create or choose to make discoverable is collected here, even when it lives in different parts of your Pod.'}</p>
            </div>
            ${showingShared ? nothing : html`
              <div class="questionaire-home-heading-actions">
                <solid-ui-button variant="secondary" @click=${() => this.dispatchAction('questionaire-home-search')}>
                  <icon-lucide-search slot="icon" aria-hidden="true"></icon-lucide-search>
                  Search my Pod
                </solid-ui-button>
                <solid-ui-button variant="primary" @click=${() => this.dispatchAction('questionaire-home-create')}>
                  <icon-lucide-plus slot="icon" aria-hidden="true"></icon-lucide-plus>
                  Create questionnaire
                </solid-ui-button>
              </div>
            `}
          </div>
          ${showingShared ? nothing : this.renderWorkspaceBanner()}
          ${!showingShared && this.status
            ? html`<p class="questionaire-home-status questionaire-home-status--${this.statusKind}">${this.status}</p>`
            : nothing}
          ${showingShared
            ? html`
                <div class="questionaire-home-count">${entries.length} questionnaire${entries.length === 1 ? '' : 's'} <span aria-hidden="true">ⓘ</span></div>
                ${entries.length
                  ? html`<div class="questionaire-home-grid">${this.sharedEntries.map(entry => this.renderSharedCard(entry))}</div>`
                  : html`<section class="questionaire-home-empty"><h2>No shared questionnaires found</h2><p>When a contact or friend publicly registers a questionnaire, it will appear here.</p></section>`}
              `
            : html`
                <section class="questionaire-home-section" aria-labelledby="my-published-questionnaires">
                  <div class="questionaire-home-section-heading">
                    <div>
                      <h2 id="my-published-questionnaires">My questionnaires</h2>
                      <p>Published questionnaires ready to open in Take.</p>
                    </div>
                    <span>${this.publishedEntries.length} published</span>
                  </div>
                  ${this.publishedEntries.length
                    ? html`<div class="questionaire-home-grid">${this.publishedEntries.map(entry => this.renderPublishedCard(entry))}</div>`
                    : html`<p class="questionaire-home-status">No published questionnaires yet.</p>`}
                </section>
                <section class="questionaire-home-section" aria-labelledby="questionnaire-library">
                  <div class="questionaire-home-section-heading">
                    <div>
                      <h2 id="questionnaire-library">Questionnaire library</h2>
                      <p>Drafts and all questionnaires in your workspace.</p>
                    </div>
                  </div>
                  <div class="questionaire-home-count">${this.entries.length} questionnaire${this.entries.length === 1 ? '' : 's'} <span aria-hidden="true">ⓘ</span></div>
                  ${this.entries.length
                    ? html`<div class="questionaire-home-grid">${this.entries.map(entry => this.renderCard(entry))}</div>`
                    : this.renderEmptyState()}
                </section>
              `}
        </div>
      </main>
    `
  }
}
