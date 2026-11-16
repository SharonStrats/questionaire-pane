import { html, nothing } from 'lit'
import { state } from 'lit/decorators.js'
import { property } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import type { QuestionnaireEntry, SharedQuestionnaireEntry, SharedStudyDeckEntry } from '../../../standalone/library'
import styles from './QuestionaireHome.styles.css'
import type { HomeSection } from './homeNavigation'
import brandIcon from '../../../assets/questionnaire-home/brand.svg'
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
import { pokemonForPoints, type PokemonProgress } from '../../../service/pokemonProgress'
import type { ChatInboxNotification } from '../../../service/chatNotifications'

import 'solid-ui/components/account'
import 'solid-ui/components/button'
import 'solid-ui/components/menu'
import 'solid-ui/components/menu-item'
import 'solid-ui/components/provider'
import '~icons/lucide/file-check-corner'
import '~icons/lucide/square-pen'
import '~icons/lucide/house'
import '~icons/lucide/menu'
import '~icons/lucide/users'
import '~icons/lucide/inbox'
import '~icons/lucide/folder'
import '~icons/lucide/folder-open'
import '~icons/lucide/playing-cards-fan'
import '~icons/lucide/search'
import '~icons/lucide/play'
import '~icons/lucide/file-text'
import '~icons/lucide/message-circle-more'
import '~icons/lucide/book-open'
import '~icons/lucide/flame'
import '~icons/lucide/x'
import '~icons/lucide/check'

@customElement('questionaire-home')
export default class QuestionaireHome extends WebComponent {
  static styles = styles

  @property({ attribute: false })
  accessor entries: QuestionnaireEntry[] = []

  @property({ attribute: false })
  accessor publishedEntries: QuestionnaireEntry[] = []

  @property({ attribute: false })
  accessor savedEntries: QuestionnaireEntry[] = []

  @property({ attribute: false })
  accessor sharedEntries: SharedQuestionnaireEntry[] = []

  @property({ attribute: false })
  accessor section: HomeSection = 'mine'

  @property({ attribute: false })
  accessor workspaceReady = false

  @state()
  accessor workspaceCreated = false

  @property({ attribute: false })
  accessor status = ''

  @property({ attribute: false })
  accessor statusKind: 'info' | 'error' = 'info'

  @property({ attribute: false })
  accessor liveGameEndpoint = ''

  @property({ attribute: false })
  accessor friendCount = 0

  @property({ attribute: false })
  accessor friends: Array<{
    uri: string
    name: string
    nickname?: string
    jobTitle?: string
    organization?: string
    location?: string
    pronouns?: string
  }> = []

  @property({ attribute: false })
  accessor friendSearchResults: Array<{ uri: string, name: string, photo?: string }> = []

  @property({ attribute: false })
  accessor friendSearchStatus = ''

  @property({ attribute: false })
  accessor chatUnread = 0

  @property({ attribute: false })
  accessor chatInboxNotifications: ChatInboxNotification[] = []

  @property({ attribute: false })
  accessor chatInboxUnread = 0

  @property({ attribute: false })
  accessor chatInboxStatus = ''

  @property({ attribute: false })
  accessor pokemonProgress: PokemonProgress | undefined

  @property({ attribute: false })
  accessor quizAverages: Record<string, number> = {}

  @property({ attribute: false })
  accessor studyDecks: Array<{
    uri: string
    title: string
    cardCount: number
    completedCardCount: number
    score?: number
  }> = []

  @property({ attribute: false })
  accessor sharedStudyDecks: SharedStudyDeckEntry[] = []

  @state()
  private accessor friendsOpen = false

  @state()
  private accessor activeNav: 'home' | 'friends' | 'inbox' | 'quizzes' = 'home'

  @state()
  private accessor inboxOpen = false

  @state()
  private accessor inboxSearch = ''

  @state()
  private accessor selectedInboxItem = ''

  @state()
  private accessor searchQuery = ''

  @state()
  private accessor friendSearchQuery = ''

  private friendSearchTimer?: ReturnType<typeof setTimeout>

  private dispatchAction (name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, {
      bubbles: true,
      composed: true,
      detail
    }))
  }

  private get quizzesToTake (): QuestionnaireEntry[] {
    const query = this.searchQuery.trim().toLocaleLowerCase()
    const available = this.publishedEntries.length ? this.publishedEntries : this.filteredEntries
    const matchesSearch = (entry: QuestionnaireEntry) =>
      !query || `${entry.title} ${entry.description ?? ''}`.toLocaleLowerCase().includes(query)
    return [...new Map(
      [...available, ...this.savedEntries]
        .filter(matchesSearch)
        .map(entry => [entry.subject.uri, entry])
    ).values()]
  }

  private renderInboxPanel () {
    if (!this.inboxOpen) return nothing
    const shared = this.sharedEntries.filter(entry => entry.notification && !entry.stored && !entry.read).slice(0, 3)
    const sharedDecks = this.sharedStudyDecks.filter(entry => !entry.stored && !entry.read).slice(0, 3)
    const notifications = this.chatInboxNotifications.filter(item => !item.read).slice(0, 3)
    const rows = [
      ...notifications.map(notification => ({
        title: notification.message,
        detail: notification.sender,
        icon: html`<icon-lucide-message-circle-more aria-hidden="true"></icon-lucide-message-circle-more>`,
        tone: 'purple',
        notificationUri: notification.uri,
        action: () => this.dispatchAction('questionaire-home-open-chat-invitation', notification)
      })),
      ...shared.map(entry => ({
        title: entry.title,
        detail: entry.description || 'Someone shared a questionnaire with you.',
        icon: html`<icon-lucide-file-check-corner aria-hidden="true"></icon-lucide-file-check-corner>`,
        tone: 'teal',
        notificationUri: entry.notification?.uri,
        action: () => this.dispatchAction('questionaire-home-open', entry.subject)
      })),
      ...sharedDecks.map(entry => ({
        title: entry.title,
        detail: `${entry.cardCount} cards · Shared by ${entry.sharedBy.label}`,
        icon: html`<icon-lucide-playing-cards-fan aria-hidden="true"></icon-lucide-playing-cards-fan>`,
        tone: 'gold',
        notificationUri: entry.notification.uri,
        action: () => this.dispatchAction('questionaire-home-open-study-deck', entry.uri)
      }))
    ].slice(0, 3)
    return html`
      <div class="questionaire-home-inbox-backdrop" @click=${(event: Event) => {
        if (event.target === event.currentTarget) this.inboxOpen = false
      }}>
        <section class="questionaire-home-inbox-panel" role="dialog" aria-modal="true" aria-labelledby="inbox-panel-title">
          <header class="questionaire-home-inbox-heading">
            <div class="questionaire-home-inbox-title">
              <span><icon-lucide-inbox aria-hidden="true"></icon-lucide-inbox></span>
              <div><small>Your space</small><h2 id="inbox-panel-title">Inbox</h2></div>
            </div>
            <button type="button" aria-label="Close inbox" @click=${() => { this.inboxOpen = false }}>
              <icon-lucide-x aria-hidden="true"></icon-lucide-x>
            </button>
          </header>
          <div class="questionaire-home-inbox-list">
            ${rows.length ? rows.map(row => html`
              <button class="questionaire-home-inbox-row" type="button" @click=${() => {
                if (row.notificationUri) this.dispatchAction('questionaire-home-mark-notification-read', row.notificationUri)
                this.inboxOpen = false
                row.action()
              }}>
                <i class="questionaire-home-inbox-dot" aria-hidden="true"></i>
                <span class="questionaire-home-inbox-row-icon questionaire-home-inbox-row-icon--${row.tone}">${row.icon}</span>
                <span class="questionaire-home-inbox-row-copy"><strong>${row.title}</strong><small>${row.detail}</small><em>Recently</em></span>
                <span class="questionaire-home-inbox-row-action">${row.icon}</span>
              </button>
            `) : html`<p class="questionaire-home-inbox-empty">No new messages or shares.</p>`}
          </div>
          <button class="questionaire-home-inbox-full" type="button" @click=${() => {
            this.inboxOpen = false
            this.section = 'shared'
            this.dispatchAction('questionaire-home-refresh-inbox')
          }}>Open full inbox <span aria-hidden="true">›</span></button>
        </section>
      </div>
    `
  }

  private get filteredEntries (): QuestionnaireEntry[] {
    const query = this.searchQuery.trim().toLocaleLowerCase()
    if (!query) return this.entries
    return this.entries.filter(entry =>
      `${entry.title} ${entry.description ?? ''}`.toLocaleLowerCase().includes(query)
    )
  }

  private get inboxUnreadCount () {
    return this.sharedEntries.filter(entry => entry.notification && !entry.stored && !entry.read).length +
      this.sharedStudyDecks.filter(entry => !entry.stored && !entry.read).length +
      this.chatInboxUnread
  }

  private renderHeaderCountBadge (count: number, kind: 'friends' | 'inbox') {
    if (count <= 0) return nothing
    return html`
      <span class="questionaire-home-header-badge questionaire-home-header-badge--${kind}" aria-hidden="true">
        ${count > 99 ? '99+' : count}
      </span>
    `
  }

  private renderSidebar (showingShared: boolean) {
    const unreadCount = this.inboxUnreadCount
    const selectHome = () => { this.activeNav = 'home'; this.section = 'mine'; this.dispatchAction('questionaire-home-scroll-top') }
    const selectFriends = () => { this.activeNav = 'friends'; this.friendsOpen = true; this.dispatchAction('questionaire-home-open-friends') }
    const selectInbox = () => { this.activeNav = 'inbox'; this.section = 'shared'; this.dispatchAction('questionaire-home-refresh-inbox') }
    const selectQuizzes = () => { this.activeNav = 'quizzes'; this.section = 'mine' }
    const selectEnglish = (activity: 'paragraph' | 'essay') => this.dispatchAction('questionaire-home-open-english', activity)
    return html`
      <aside class="questionaire-home-sidebar">
        <div class="questionaire-home-sidebar-brand">
          <div class="questionaire-home-brand-icon"><img src=${brandIcon} alt="" aria-hidden="true"></div>
          <solid-ui-menu class="questionaire-home-mobile-menu" placement="bottom-start" distance="6">
            <button type="button" slot="trigger" class="questionaire-home-mobile-menu-trigger"
              aria-label="Open questionnaire navigation">
              <icon-lucide-menu aria-hidden="true"></icon-lucide-menu>
            </button>
            <solid-ui-menu-item ?selected=${this.activeNav === 'home'} @solid-ui-select=${selectHome}>
              <icon-lucide-house slot="left-icon" aria-hidden="true"></icon-lucide-house>Home
            </solid-ui-menu-item>
            <solid-ui-menu-item ?selected=${this.activeNav === 'quizzes'} @solid-ui-select=${selectQuizzes}>
              <icon-lucide-folder slot="left-icon" aria-hidden="true"></icon-lucide-folder>My quizzes
            </solid-ui-menu-item>
            <solid-ui-menu-item @solid-ui-select=${() => selectEnglish('paragraph')}>
              <icon-lucide-square-pen slot="left-icon" aria-hidden="true"></icon-lucide-square-pen>Paragraph Practice
            </solid-ui-menu-item>
            <solid-ui-menu-item @solid-ui-select=${() => selectEnglish('essay')}>
              <icon-lucide-file-text slot="left-icon" aria-hidden="true"></icon-lucide-file-text>Essay Practice
            </solid-ui-menu-item>
          </solid-ui-menu>
          <strong>Solid Learn</strong>
        </div>
        <nav class="questionaire-home-sidebar-nav" aria-label="Questionnaire navigation">
          <button class="questionaire-home-sidebar-item ${this.activeNav === 'home' ? 'questionaire-home-sidebar-item--active' : ''}" type="button"
            @click=${selectHome}>
            <icon-lucide-house aria-hidden="true"></icon-lucide-house> Home
          </button>
          <button class="questionaire-home-sidebar-item ${this.activeNav === 'friends' ? 'questionaire-home-sidebar-item--active' : ''}" type="button"
            @click=${selectFriends}>
            <icon-lucide-users aria-hidden="true"></icon-lucide-users> Friends
            ${this.friendCount ? html`<b class="questionaire-home-sidebar-count">${this.friendCount}</b>` : nothing}
          </button>
          <button class="questionaire-home-sidebar-item ${showingShared || this.activeNav === 'inbox' ? 'questionaire-home-sidebar-item--active' : ''}"
            type="button" @click=${selectInbox}>
            <icon-lucide-inbox aria-hidden="true"></icon-lucide-inbox> Inbox
            ${unreadCount ? html`<b class="questionaire-home-sidebar-badge">${unreadCount}</b>` : nothing}
          </button>
          <button class="questionaire-home-sidebar-item ${this.activeNav === 'quizzes' ? 'questionaire-home-sidebar-item--active' : ''}" type="button"
            @click=${selectQuizzes}>
            <icon-lucide-folder aria-hidden="true"></icon-lucide-folder> My quizzes
          </button>
          <div class="questionaire-home-sidebar-group">
            <div class="questionaire-home-sidebar-group-title">
              <span>English</span>
            </div>
            <button class="questionaire-home-sidebar-item questionaire-home-sidebar-subitem" type="button"
              @click=${() => selectEnglish('paragraph')}>
              <icon-lucide-square-pen aria-hidden="true"></icon-lucide-square-pen> Paragraph Practice
            </button>
            <button class="questionaire-home-sidebar-item questionaire-home-sidebar-subitem" type="button"
              @click=${() => selectEnglish('essay')}>
              <icon-lucide-file-text aria-hidden="true"></icon-lucide-file-text> Essay Practice
            </button>
          </div>
        </nav>
        <div class="questionaire-home-streak">
          <span aria-hidden="true"><icon-lucide-flame></icon-lucide-flame></span>
          <div>
            <strong>${this.pokemonProgress?.currentStreak ? `${this.pokemonProgress.currentStreak} day streak` : 'Start your streak'}</strong>
            <small>${this.pokemonProgress?.currentStreak ? 'Keep it going today' : 'Study today to begin'}</small>
          </div>
        </div>
        ${this.renderButton('Create a quiz', plusIcon, 'questionaire-home-create', true)}
      </aside>
    `
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

  private renderEmptyHome () {
    const companion = this.pokemonProgress?.pokemon ?? pokemonForPoints(0)
    return html`
      <div class="questionaire-home-empty-home">
        <section class="questionaire-home-empty-hero">
          <div>
            <span class="questionaire-home-kicker">✦ &nbsp; Welcome to Solid Learn</span>
            <h1>Your learning space<br>is ready</h1>
            <p>Start with a quiz, bring in your notes, or connect with a friend.</p>
          </div>
          <div class="questionaire-home-empty-hero-art">
            <span class="questionaire-home-empty-hero-play" aria-hidden="true"><icon-lucide-play></icon-lucide-play></span>
            <span class="questionaire-home-empty-hero-friends" aria-hidden="true"><icon-lucide-users></icon-lucide-users></span>
            ${this.pokemonProgress?.pendingChoices.length
              ? html`
                <button class="questionaire-home-empty-hero-pokemon questionaire-home-empty-hero-pokemon--actionable"
                  type="button"
                  aria-label=${`Choose your new Pokémon companion; current companion ${companion.name}, level ${companion.level}`}
                  @click=${() => this.dispatchAction('questionaire-home-resume-pokemon-choice')}>
                  <img src=${companion.sprite ?? ''} alt="">
                  <span><strong>${companion.name}</strong><small>Level ${companion.level}</small></span>
                  <em>Choose your Pokémon</em>
                </button>
              `
              : html`
                <div class="questionaire-home-empty-hero-pokemon" role="img" aria-label=${`${companion.name}, Level ${companion.level}`}>
                  <img src=${companion.sprite ?? ''} alt="">
                  <span><strong>${companion.name}</strong><small>Level ${companion.level}</small></span>
                </div>
              `}
          </div>
        </section>
        ${!this.workspaceReady || this.workspaceCreated ? html`
          <section class="questionaire-home-empty-setup ${this.workspaceCreated ? 'questionaire-home-empty-setup--connected' : ''}">
            <span class="questionaire-home-empty-icon questionaire-home-empty-icon--purple">${this.workspaceCreated ? html`<icon-lucide-check></icon-lucide-check>` : html`<icon-lucide-folder></icon-lucide-folder>`}</span>
            <div><span class="questionaire-home-kicker">${this.workspaceCreated ? 'Ready to learn' : 'One quick setup'}</span><h2>${this.workspaceCreated ? 'Questionnaire workspace connected' : 'Create your questionnaire workspace'}</h2><p>${this.workspaceCreated ? 'Home / Questionnaires · Private' : 'Choose a private place in your Solid Pod for quizzes, responses and study cards.'}</p></div>
            <button type="button" @click=${() => this.dispatchAction('questionaire-home-create-workspace')} ?disabled=${this.workspaceReady}>${this.workspaceCreated ? html`<icon-lucide-check></icon-lucide-check> Created` : html`Create workspace <span aria-hidden="true">＋</span>`}</button>
          </section>
        ` : nothing}
        <section class="questionaire-home-empty-library">
          <div class="questionaire-home-empty-section-heading"><span class="questionaire-home-empty-icon questionaire-home-empty-icon--purple"><icon-lucide-folder></icon-lucide-folder></span><span><h2>Your library</h2><p>Things you save or create will live here</p></span></div>
          <div class="questionaire-home-empty-library-cards">
            <div><strong>0</strong><span><b>My quizzes</b><small>Quizzes you create or save</small></span><button type="button" @click=${() => this.dispatchAction('questionaire-home-create')}>＋ Create</button></div>
            <div><strong>0</strong><span><b>Study cards</b><small>Card sets made from your notes</small></span><button type="button" @click=${() => this.dispatchAction('questionaire-home-generate-cards')}>＋ Generate</button></div>
          </div>
        </section>
        ${this.renderStudyCrew()}
      </div>
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
        ${this.quizAverages[entry.subject.uri] !== undefined
          ? html`<span class="questionaire-home-average questionaire-home-average--plain">AVG ${this.quizAverages[entry.subject.uri]}%</span>`
          : nothing}
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

  private renderTakeCard (entry: QuestionnaireEntry, index: number) {
    const tone = ['violet', 'coral', 'teal'][index % 3]
    const average = this.quizAverages[entry.subject.uri]
    return html`
      <article class="questionaire-home-take-card">
        <div class="questionaire-home-take-art questionaire-home-take-art--${tone}">
          <span>${entry.kind === 'survey' ? 'Survey' : 'Quiz'}</span>
          <strong>${index + 1}</strong>
          ${average !== undefined ? html`<span class="questionaire-home-average">AVG ${average}%</span>` : nothing}
        </div>
        <div class="questionaire-home-take-copy">
          <span class="questionaire-home-take-subject">${entry.kind === 'survey' ? 'SURVEY' : 'QUIZ'}</span>
          <button class="questionaire-home-take-title" type="button"
            @click=${() => this.dispatchAction('questionaire-home-open', entry.subject)}>
            ${entry.title}
          </button>
          <p>${entry.description || `${entry.questionCount} questions ready to try`}</p>
          <div class="questionaire-home-take-meta">
            <span>${entry.questionCount} questions</span>
            <div class="questionaire-home-take-actions">
              <button type="button" aria-label="Take quiz"
                @click=${() => this.dispatchAction('questionaire-home-open', entry.subject)}>
                <icon-lucide-play aria-hidden="true"></icon-lucide-play>
              </button>
              ${this.liveGameEndpoint && entry.kind === 'quiz' ? html`
                <button type="button" aria-label="Play live quiz"
                  @click=${() => this.dispatchAction('questionaire-home-play-together', entry)}>
                  <icon-lucide-users aria-hidden="true"></icon-lucide-users>
                </button>
              ` : nothing}
            </div>
          </div>
        </div>
      </article>
    `
  }

  private renderTakeSection (entries: QuestionnaireEntry[], showAll = false) {
    return html`
      <section class="questionaire-home-take-section" aria-labelledby="questionnaires-to-take">
        <div class="questionaire-home-take-heading">
          <div>
            <span class="questionaire-home-kicker">Ready when you are</span>
            <h2 id="questionnaires-to-take">Quizzes to take <span>${entries.length}</span></h2>
            <p>Shared with you and ready to start</p>
          </div>
          ${!showAll ? html`
            <button type="button" @click=${() => this.dispatchAction('questionaire-home-scroll-files')}>
              See all <span aria-hidden="true">→</span>
            </button>
          ` : nothing}
        </div>
        ${entries.length
          ? html`<div class="questionaire-home-take-grid">${(showAll ? entries : entries.slice(0, 6)).map((entry, index) => this.renderTakeCard(entry, index))}</div>`
          : html`
            <div class="questionaire-home-take-empty">
              <strong>No quizzes are ready yet</strong>
              <span>Create one or ask someone to share a quiz with you.</span>
            </div>
          `}
      </section>
    `
  }

  private renderMyQuizzesView () {
    return html`
      <section class="questionaire-home-my-quizzes">
        <div class="questionaire-home-my-quizzes-heading">
          <span class="questionaire-home-kicker">Your learning space</span>
          <h1>My quizzes</h1>
          <p>Quizzes shared with you and questionnaires you can take, alongside your study cards.</p>
        </div>
        ${this.status ? html`<p class="questionaire-home-status questionaire-home-status--${this.statusKind}">${this.status}</p>` : nothing}
        ${this.renderTakeSection(this.quizzesToTake, true)}
        ${this.renderStudyCardsSection()}
      </section>
    `
  }

  private renderStudyCardsSection () {
    return html`
      <section class="questionaire-home-study-section" aria-labelledby="study-cards">
        <div class="questionaire-home-study-heading">
          <div class="questionaire-home-study-title">
            <span class="questionaire-home-study-title-icon"><icon-lucide-file-text aria-hidden="true"></icon-lucide-file-text></span>
            <span><h2 id="study-cards">Study cards</h2><p>Quick sets made from your notes and documents</p></span>
          </div>
          <button class="questionaire-home-study-generate" type="button"
            @click=${() => this.dispatchAction('questionaire-home-generate-cards')}>
            <span aria-hidden="true">＋</span> Generate new
          </button>
        </div>
        ${this.studyDecks.length ? html`
          <div class="questionaire-home-study-deck-grid">
            ${this.studyDecks.map((deck, index) => html`
              <article class="questionaire-home-study-deck-card questionaire-home-study-deck-card--${index % 2 ? 'teal' : 'purple'}">
                <div class="questionaire-home-study-deck-art"><icon-lucide-file-text aria-hidden="true"></icon-lucide-file-text></div>
                <div class="questionaire-home-study-deck-copy">
                  <span class="questionaire-home-study-badge">${deck.title.toLocaleLowerCase().includes('physics') ? 'PHYSICS' : 'STUDY SET'}</span>
                  ${deck.score !== undefined ? html`<span class="questionaire-home-average questionaire-home-average--study">Score ${deck.score}%</span>` : nothing}
                  <span class="questionaire-home-study-source"><icon-lucide-file-text aria-hidden="true"></icon-lucide-file-text>${deck.title.toLocaleLowerCase().endsWith('.pptx') ? 'PowerPoint' : 'Notes'}</span>
                  <strong>${deck.title}</strong>
                  <small>${deck.completedCardCount} of ${deck.cardCount} completed</small>
                  <div class="questionaire-home-study-deck-actions">
                    <button type="button" aria-label=${`Open ${deck.title}`}
                      @click=${() => this.dispatchAction('questionaire-home-open-study-deck', deck.uri)}>→</button>
                    <button type="button" aria-label=${`Share ${deck.title}`}
                      @click=${() => this.dispatchAction('questionaire-home-share-study-deck', deck.uri)}>
                      <icon-lucide-users aria-hidden="true"></icon-lucide-users>
                    </button>
                  </div>
                </div>
              </article>
            `)}
          </div>
        ` : html`<div class="questionaire-home-study-empty">
          <div class="questionaire-home-study-icon"><img src=${cardFolderIcon} alt="" aria-hidden="true"></div>
          <div>
            <strong>Your study cards live separately from quizzes</strong>
            <span>Generate a set, review every card, then save the accepted cards to your Pod.</span>
          </div>
          <button type="button" @click=${() => this.dispatchAction('questionaire-home-generate-cards')}>
            Open generator <span aria-hidden="true">→</span>
          </button>
        </div>`}
      </section>
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
        ${this.quizAverages[entry.subject.uri] !== undefined
          ? html`<span class="questionaire-home-average questionaire-home-average--inline">AVG ${this.quizAverages[entry.subject.uri]}%</span>`
          : nothing}
        <div class="questionaire-home-quiz-actions">
          ${showingShared && !sharedEntry.stored ? html`
            <button class="questionaire-home-store-button" type="button"
              @click=${() => this.dispatchAction('questionaire-home-store', sharedEntry)}>
              Store for me
            </button>
          ` : nothing}
          ${this.liveGameEndpoint && entry.kind === 'quiz' ? html`
            <button class="questionaire-home-live-button" type="button"
              @click=${() => this.dispatchAction('questionaire-home-play-together', entry)}>
              Play together
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
    const quizzesToTake = this.quizzesToTake
    return html`
      ${this.renderTakeSection(quizzesToTake)}
      ${this.renderStudyCardsSection()}
      <div class="questionaire-home-lower-grid">${this.renderStudyCrew()}</div>
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
      ${this.renderTakeSection(availableEntries)}
      <section class="questionaire-home-shared-section" aria-label="Chat notifications">
        <h2>Chat notifications</h2>
        ${this.chatInboxStatus ? html`<p role="status">${this.chatInboxStatus}</p>` : nothing}
        ${this.chatInboxNotifications.map(notification => html`
          <div class="questionaire-home-quiz-row">
            <icon-lucide-message-circle-more style="width:20px;height:20px" aria-hidden="true"></icon-lucide-message-circle-more>
            <div class="questionaire-home-quiz-copy"><strong>${notification.message}</strong><span>${notification.sender}</span></div>
            <button class="questionaire-home-button" @click=${() => this.dispatchAction('questionaire-home-open-chat-invitation', notification)}>Open chat</button>
          </div>
        `)}
        ${!this.chatInboxNotifications.length && !this.chatInboxStatus ? html`<p>No chat notifications yet.</p>` : nothing}
      </section>
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

  private renderInboxPage (entries: SharedQuestionnaireEntry[]) {
    type InboxItem = {
      key: string
      kind: 'message' | 'quiz' | 'study-deck'
      title: string
      detail: string
      description: string
      action: () => void
      notificationUri: string
      read: boolean
      unavailableReason?: string
      entry?: SharedQuestionnaireEntry
      deck?: SharedStudyDeckEntry
    }
    const items: InboxItem[] = [
      ...this.chatInboxNotifications.map(notification => ({
        key: `chat:${notification.notificationId}`,
        kind: 'message' as const,
        title: notification.message,
        detail: notification.sender,
        description: 'New chat message',
        notificationUri: notification.uri,
        read: notification.read,
        action: () => this.dispatchAction('questionaire-home-open-chat-invitation', notification)
      })),
      ...entries.filter(entry => entry.notification && !entry.stored).map(entry => ({
        key: `share:${entry.notificationId ?? entry.notification!.uri}`,
        kind: 'quiz' as const,
        title: entry.title,
        detail: entry.unavailableReason ?? (entry.description || 'Someone shared a quiz with you.'),
        description: entry.unavailableReason ? 'Unavailable share' : 'Shared quiz',
        notificationUri: entry.notification!.uri,
        read: entry.read ?? false,
        unavailableReason: entry.unavailableReason,
        entry,
        action: () => {
          if (!entry.unavailableReason) this.dispatchAction('questionaire-home-open', entry.subject)
        }
      })),
      ...this.sharedStudyDecks.filter(entry => !entry.stored).map(deck => ({
        key: `study-deck:${deck.notificationId ?? deck.notification.uri}`,
        kind: 'study-deck' as const,
        title: deck.title,
        detail: deck.unavailableReason ?? `${deck.cardCount} cards · Shared by ${deck.sharedBy.label}`,
        description: deck.unavailableReason ? 'Unavailable share' : 'Shared study cards',
        notificationUri: deck.notification.uri,
        read: deck.read ?? false,
        unavailableReason: deck.unavailableReason,
        deck,
        action: () => {
          if (!deck.unavailableReason) this.dispatchAction('questionaire-home-open-study-deck', deck.uri)
        }
      }))
    ]
    const query = this.inboxSearch.trim().toLocaleLowerCase()
    const visibleItems = query
      ? items.filter(item => `${item.title} ${item.detail}`.toLocaleLowerCase().includes(query))
      : items
    const selected = visibleItems.find(item => item.key === this.selectedInboxItem) ?? visibleItems[0]
    const messages = this.chatInboxUnread
    const shared = entries.filter(entry => entry.notification && !entry.stored && !entry.read).length
    const sharedDecks = this.sharedStudyDecks.filter(entry => !entry.stored && !entry.read).length
    return html`
      <div class="questionaire-home-inbox-page">
        <div class="questionaire-home-inbox-page-heading">
          <div><h1>Inbox</h1><p>Messages and things your friends have shared with you.</p>
            ${this.chatInboxStatus ? html`<p role="status">${this.chatInboxStatus}</p>` : nothing}
          </div>
          <button class="questionaire-home-inbox-profile" type="button" @click=${() => this.dispatchAction('questionaire-home-refresh-inbox')}>Refresh inbox</button>
          <button class="questionaire-home-inbox-profile" type="button" @click=${() => this.dispatchAction('questionaire-home-open-profile')}>Create profile</button>
        </div>
        <div class="questionaire-home-inbox-stats">
          <div><span class="questionaire-home-inbox-stat-icon questionaire-home-inbox-stat-icon--purple"><icon-lucide-message-circle-more aria-hidden="true"></icon-lucide-message-circle-more></span><strong>${messages}</strong><small>Messages</small></div>
          <div><span class="questionaire-home-inbox-stat-icon questionaire-home-inbox-stat-icon--teal"><icon-lucide-file-check-corner aria-hidden="true"></icon-lucide-file-check-corner></span><strong>${shared}</strong><small>Shared quizzes</small></div>
          <div><span class="questionaire-home-inbox-stat-icon questionaire-home-inbox-stat-icon--gold"><icon-lucide-playing-cards-fan aria-hidden="true"></icon-lucide-playing-cards-fan></span><strong>${sharedDecks}</strong><small>Study-card sets</small></div>
        </div>
        <div class="questionaire-home-inbox-browser">
          <div class="questionaire-home-inbox-list-column">
            <label class="questionaire-home-inbox-search"><icon-lucide-search aria-hidden="true"></icon-lucide-search>
              <input type="search" .value=${this.inboxSearch} placeholder="Search inbox" aria-label="Search inbox"
                @input=${(event: Event) => { this.inboxSearch = (event.target as HTMLInputElement).value }}>
            </label>
            <div class="questionaire-home-inbox-tabs"><button class="active" type="button">All</button><button type="button">Messages</button><button type="button">Shared with me</button></div>
            <div class="questionaire-home-inbox-items">
              ${visibleItems.length ? visibleItems.map(item => html`
                <button class="questionaire-home-inbox-item ${selected?.key === item.key ? 'selected' : ''} ${item.read ? 'is-read' : 'is-unread'}" type="button"
                  @click=${() => {
                    this.selectedInboxItem = item.key
                    if (!item.read) this.dispatchAction('questionaire-home-mark-notification-read', item.notificationUri)
                  }}>
                  <span class="questionaire-home-inbox-item-icon questionaire-home-inbox-item-icon--${item.kind}">
                    ${item.kind === 'message'
                      ? html`<icon-lucide-message-circle-more aria-hidden="true"></icon-lucide-message-circle-more>`
                      : item.kind === 'study-deck'
                        ? html`<icon-lucide-playing-cards-fan aria-hidden="true"></icon-lucide-playing-cards-fan>`
                        : html`<icon-lucide-file-check-corner aria-hidden="true"></icon-lucide-file-check-corner>`}
                  </span>
                  <span><strong>${item.title}</strong><small>${item.detail}</small><em>${item.description} · ${item.read ? 'Read' : 'Unread'}</em></span><b>›</b>
                </button>
              `) : html`<p class="questionaire-home-inbox-page-empty">No inbox items found.</p>`}
            </div>
          </div>
          <div class="questionaire-home-inbox-detail">
            ${selected ? html`
              <span class="questionaire-home-inbox-detail-icon questionaire-home-inbox-item-icon--${selected.kind}">
                ${selected.kind === 'message'
                  ? html`<icon-lucide-message-circle-more aria-hidden="true"></icon-lucide-message-circle-more>`
                  : selected.kind === 'study-deck'
                    ? html`<icon-lucide-playing-cards-fan aria-hidden="true"></icon-lucide-playing-cards-fan>`
                    : html`<icon-lucide-file-check-corner aria-hidden="true"></icon-lucide-file-check-corner>`}
              </span>
              <small>${selected.description}</small>
              <h2>${selected.detail}</h2>
              <blockquote>${selected.title}</blockquote>
              <p>${selected.unavailableReason ?? (selected.kind === 'message'
                ? 'Open the chat to reply and continue the conversation.'
                : selected.kind === 'study-deck'
                  ? 'Save a reference to these study cards in your library or open them now.'
                  : 'Open this shared quiz to start learning.')}</p>
              <p>${selected.read ? 'Read' : 'Unread'}</p>
              ${selected.entry && !selected.entry.stored && !selected.unavailableReason ? html`
                <button type="button" @click=${() => this.dispatchAction('questionaire-home-store', selected.entry)}>＋ Add to My quizzes</button>
              ` : nothing}
              ${selected.deck && !selected.deck.stored && !selected.unavailableReason ? html`
                <button type="button" @click=${() => this.dispatchAction('questionaire-home-store-study-deck', selected.deck)}>＋ Store for me</button>
              ` : nothing}
              <button type="button" ?disabled=${Boolean(selected.unavailableReason)} @click=${() => {
                if (!selected.read) this.dispatchAction('questionaire-home-mark-notification-read', selected.notificationUri)
                selected.action()
              }}>${selected.unavailableReason ? 'Unavailable' : selected.kind === 'message' ? 'Open chat' : selected.kind === 'study-deck' ? 'Open study cards' : 'Open quiz'}</button>
            ` : html`<p>Select an inbox item to see its details.</p>`}
          </div>
        </div>
      </div>
    `
  }

  private renderFriendsPanel () {
    if (!this.friendsOpen) return nothing
    return html`
      <div class="questionaire-home-friends-backdrop" role="presentation"
        @click=${(event: Event) => { if (event.target === event.currentTarget) this.friendsOpen = false }}>
        <section class="questionaire-home-friends-panel" role="dialog" aria-modal="true" aria-labelledby="friends-panel-title">
          <div class="questionaire-home-friends-panel-heading">
            <div>
              <span class="questionaire-home-kicker">Your social space</span>
              <h2 id="friends-panel-title">Friends</h2>
            </div>
            <button type="button" aria-label="Close friends" @click=${() => { this.friendsOpen = false }}>×</button>
          </div>
          <p>These are the people linked from your profile with <code>foaf:knows</code>. Search your contacts and friends by name, or enter an exact WebID URL.</p>
          <div class="questionaire-home-friend-search">
            <input type="search" .value=${this.friendSearchQuery} @input=${(event: Event) => {
              this.friendSearchQuery = (event.target as HTMLInputElement).value
              clearTimeout(this.friendSearchTimer)
              this.friendSearchTimer = setTimeout(() => {
                this.dispatchAction('questionaire-home-search-friends', this.friendSearchQuery)
              }, 250)
            }} placeholder="Name or WebID" aria-label="Search contacts and friends">
          </div>
          ${this.friendSearchStatus ? html`<p class="questionaire-home-friend-search-status">${this.friendSearchStatus}</p>` : nothing}
          ${this.friendSearchResults.length ? html`<div class="questionaire-home-friend-results">
            ${this.friendSearchResults.map((result, index) => html`<div class="questionaire-home-friend-result">
              <span class="questionaire-home-friend-avatar questionaire-home-friend-avatar--${index % 6}">
                <span>${result.name.slice(0, 2).toUpperCase()}</span>
                ${result.photo ? html`<img src=${result.photo} alt="" @error=${(event: Event) => { (event.target as HTMLImageElement).style.display = 'none' }}>` : nothing}
              </span>
              <div><strong>${result.name}</strong><code>${result.uri}</code></div>
              ${this.friends.some(friend => friend.uri === result.uri)
                ? html`<small>Already connected</small>`
                : html`<button type="button" @click=${() => this.dispatchAction('questionaire-home-add-friend', result.uri)}>Add</button>`}
            </div>`)}
          </div>` : nothing}
          ${this.friends.length
            ? html`<div class="questionaire-home-friend-list">
                ${this.friends.map(friend => html`
                  <a href=${friend.uri} target="_blank" rel="noreferrer" class="questionaire-home-friend-row">
                    <span>${friend.name.slice(0, 2).toUpperCase()}</span>
                    <div>
                      <strong>${friend.name}${friend.nickname ? ` (${friend.nickname})` : ''}</strong>
                      <small>${friend.jobTitle || friend.organization || friend.location || ''}</small>
                      <code>${friend.uri}</code>
                    </div>
                  </a>
                `)}
              </div>`
            : html`<div class="questionaire-home-friends-empty">
                <strong>No outgoing friends found</strong>
                <span>Check the Friends pane for incoming requests and mutual connections.</span>
              </div>`}
        </section>
      </div>
    `
  }

  private renderStudyCrew () {
    return html`
      <section class="questionaire-home-crew-card">
        <div class="questionaire-home-crew-title">
          <span aria-hidden="true"><icon-lucide-users></icon-lucide-users></span>
          <div><h2>Your study crew</h2><p>Learning is better together</p></div>
        </div>
        <div class="questionaire-home-crew-avatars">
          ${this.friends.slice(0, 4).map((friend, index) => html`
            <a href=${friend.uri} target="_blank" rel="noreferrer"
              class="questionaire-home-crew-avatar questionaire-home-crew-avatar--${index % 3}"
              title=${`${friend.name} — ${friend.uri}`}>${friend.name.slice(0, 2).toUpperCase()}</a>
          `)}
          <button type="button" aria-label="Open friends"
            @click=${() => { this.friendsOpen = true; this.dispatchAction('questionaire-home-open-friends') }}>+</button>
        </div>
        ${this.friends.length
          ? html`<p class="questionaire-home-crew-summary">${this.friends.length} friend${this.friends.length === 1 ? '' : 's'} connected</p>`
          : html`<p class="questionaire-home-crew-summary">Connect with friends to learn together</p>`}
        <button class="questionaire-home-crew-action" type="button"
          @click=${() => { this.friendsOpen = true; this.dispatchAction('questionaire-home-open-friends') }}>
          <span><icon-lucide-user-plus aria-hidden="true"></icon-lucide-user-plus> Find friends</span>
          <span aria-hidden="true">→</span>
        </button>
      </section>
    `
  }

  render () {
    const showingShared = this.section === 'shared'
    const showingMyQuizzes = !showingShared && this.activeNav === 'quizzes'
    const entries = showingShared ? this.sharedEntries : this.filteredEntries
    const hasQuizzesToTake = !showingShared && this.quizzesToTake.length > 0
    const showEmptyHome = !showingShared && !showingMyQuizzes && entries.length === 0 && !hasQuizzesToTake
    const companion = this.pokemonProgress?.pokemon ?? pokemonForPoints(0)
    const inboxCount = this.inboxUnreadCount
    return html`
      <div class="questionaire-home-shell questionaire-home-shell--redesigned">
        ${this.renderSidebar(showingShared)}
        <div class="questionaire-home-page">
          <header class="questionaire-home-header">
            <div class="questionaire-home-header-inner">
              <label class="questionaire-home-search">
                <icon-lucide-search aria-hidden="true"></icon-lucide-search>
                <input type="search" .value=${this.searchQuery}
                  @input=${(event: Event) => { this.searchQuery = (event.target as HTMLInputElement).value }}
                  placeholder="Search quizzes">
              </label>
              <div class="questionaire-home-header-actions">
                <button class="questionaire-home-header-icon" type="button"
                  aria-label=${this.friendCount
                    ? `Open friends, ${this.friendCount} ${this.friendCount === 1 ? 'friend' : 'friends'}`
                    : 'Open friends'}
                  @click=${() => { this.friendsOpen = true; this.dispatchAction('questionaire-home-open-friends') }}>
                  <icon-lucide-users aria-hidden="true"></icon-lucide-users>
                  ${this.renderHeaderCountBadge(this.friendCount, 'friends')}
                </button>
                <button class="questionaire-home-header-icon" type="button"
                  aria-label=${inboxCount
                    ? `Open inbox, ${inboxCount} ${inboxCount === 1 ? 'item' : 'items'}`
                    : 'Open inbox'}
                  @click=${() => { this.inboxOpen = true; this.dispatchAction('questionaire-home-refresh-inbox') }}>
                  <icon-lucide-inbox aria-hidden="true"></icon-lucide-inbox>
                  ${this.renderHeaderCountBadge(inboxCount, 'inbox')}
                </button>
                <button class="questionaire-home-header-icon" type="button"
                  aria-label="Chat with friends" title="Chat with friends"
                  @click=${() => this.dispatchAction('questionaire-home-open-chat')}>
                  <icon-lucide-message-circle-more aria-hidden="true"></icon-lucide-message-circle-more>
                  ${this.chatUnread ? html`<span class="questionaire-home-sidebar-badge">${this.chatUnread}</span>` : nothing}
                </button>
                <button class="questionaire-home-pod-button" type="button" aria-label="Open my Pod" title="Open my Pod"
                  @click=${() => this.dispatchAction('questionaire-home-open-pod')}>
                  <icon-lucide-folder-open aria-hidden="true"></icon-lucide-folder-open>
                </button>
                <solid-ui-provider><solid-ui-account hide-signup></solid-ui-account></solid-ui-provider>
              </div>
            </div>
          </header>
          <main class="questionaire-home-main">
            <div class="questionaire-home-content">
            ${showingMyQuizzes ? this.renderMyQuizzesView() : html`
            ${!showEmptyHome ? html`
            <div class="questionaire-home-heading-row">
              <div>
                <span class="questionaire-home-kicker">Your learning space</span>
                ${showingShared ? html`<h1>Inbox</h1>` : nothing}
                ${!showingShared ? html`
                  <p class="questionaire-home-description">Take a quiz, make one of your own, or turn your notes into study cards.</p>
                ` : nothing}
              </div>
              ${!showingShared ? html`
                <div class="questionaire-home-heading-actions">
                  <button class="questionaire-home-button" type="button"
                    @click=${() => this.dispatchAction('questionaire-home-generate-cards')}>
                    <icon-lucide-playing-cards-fan aria-hidden="true"></icon-lucide-playing-cards-fan>
                    Generate study cards
                  </button>
                  ${this.renderButton('Create questionnaire', plusIcon, 'questionaire-home-create', true)}
                </div>
              ` : nothing}
              ${!showingShared ? html`
                <button class="questionaire-home-pokemon" type="button"
                  ?disabled=${!this.pokemonProgress?.pendingChoices.length}
                  aria-label=${this.pokemonProgress?.pendingChoices.length
                    ? `Choose your new Pokémon companion; current companion ${companion.name}, level ${companion.level}`
                    : `Current Pokémon companion ${companion.name}, level ${companion.level}`}
                  @click=${() => this.dispatchAction('questionaire-home-resume-pokemon-choice')}>
                  <img src=${companion.sprite ?? ''} alt="">
                  <span><strong>${companion.name}</strong><small>Level ${companion.level}</small></span>
                  ${this.pokemonProgress?.pendingChoices.length
                    ? html`<em>Choose your Pokémon</em>`
                    : nothing}
                </button>
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
            ` : nothing}
            ${!showingShared && this.status && (!showEmptyHome || this.statusKind === 'error')
              ? html`<p class="questionaire-home-status questionaire-home-status--${this.statusKind}">${this.status}</p>`
              : nothing}
            ${!showEmptyHome && !showingShared && entries.length ? html`
              <div class="questionaire-home-count">${entries.length} questionnaire${entries.length === 1 ? '' : 's'}
                <img src=${infoIcon} alt="" aria-hidden="true">
              </div>
            ` : nothing}
            ${!showingShared && entries.length === 0 && !hasQuizzesToTake
              ? this.renderEmptyHome()
              : showingShared
              ? this.renderInboxPage(entries as SharedQuestionnaireEntry[])
              : entries.length || hasQuizzesToTake
                ? this.renderEntries(entries, showingShared)
              : showingShared
                ? (this.chatInboxNotifications.length || this.chatInboxStatus ? this.renderSharedEntries([]) : this.renderSharedEmptyState())
                : this.renderEmptyState()}
            `}
            </div>
          </main>
          ${this.renderFriendsPanel()}
          ${this.renderInboxPanel()}
          </div>
      </div>
    `
  }
}
