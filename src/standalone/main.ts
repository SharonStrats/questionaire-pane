import { authn, authSession, solidLogicSingleton, store as solidStore } from 'solid-logic'
import { Namespace, sym, type LiveStore, type NamedNode } from 'rdflib'
import { ns, showDialog, utils } from 'solid-ui'
import 'solid-ui/components/account'
import 'solid-ui/components/provider'
import 'solid-ui/theme.css'
import '~icons/lucide/arrow-left'
import '~icons/lucide/check'
import '~icons/lucide/sparkles'
import '~icons/lucide/upload'
import '~icons/lucide/message-circle-more'
import questionairePane from '../index'
import { configureQuizAiService } from '../service/quizAiService'
import { DocumentGenerationClient, type ExtractedDocument } from '../service/documentGenerationClient'
import {
  acceptPendingStudyCardReviews,
  createStudyCardReviews,
  duplicateStudyCardReviewIds,
  removeRejectedStudyCardReviews,
  replaceRejectedStudyCardReviews,
  summarizeStudyCardReviews,
  updateStudyCardReview,
  type StudyCardReview
} from '../service/studyCardReview'
import { serializeStudyDeck } from '../service/studyCardRdf'
import { saveAcceptedStudyDeck } from '../service/studyDeckPersistence'
import { updatePokemonProgress } from '../service/pokemonProgress'
import { loadStudyLearningProgress, recordStudyCardOutcome, studyDeckMetrics } from '../service/studyLearningProgress'
import { showPokemonLevelUp } from '../components/standalone/pokemon-level-up/PokemonLevelUpDialog'
import '../components/standalone/study-session-setup/StudySessionSetup'
import { LiveQuizClient, type LiveQuizChatMessage } from '../service/liveQuizClient'
import { getAppServicesEndpoint } from './quizSidecarConfig'
import '../components/provider/QuestionaireProvider'
import '../components/create/main-view/MainView'
import '../components/take/main-view/MainView'
import '../components/standalone/questionaire-home/QuestionaireHome'
import '../components/standalone/live-quiz/LiveQuiz'
import '../components/standalone/live-quiz/LiveStudyCards'
import '../components/standalone/english-practice/EnglishPractice'
import '../questionairePane.css'
import './standalone.css'
import { isHttpUrl, parseStandaloneUrl } from './url'
import { accountRegistrationUrl, getStandaloneLoginIssuer } from './accountLinks'
import { replaceViewWithRestorableContent } from './viewNavigation'
import {
  addToTypeIndex,
  crawlQuestionnaireContainers,
  discoverInboxSharedQuestionnaires,
  discoverInboxSharedStudyDecks,
  findQuestionnaireWorkspace,
  ensureQuestionnaireWorkspace,
  entriesFromSubjects,
  discoverSharedQuestionnaires,
  isPublishedQuestionnaire,
  loadQuestionnaireMetrics,
  loadStoredQuestionnaireUris,
  loadStoredStudyDeckUris,
  migrateQuestionnaireShareNotifications,
  loadTypeIndexes,
  ownPublishedQuestionnaires,
  publishedQuestionnaireForTake,
  questionnaireClass,
  questionnairesInWorkspace,
  storeSharedQuestionnaire,
  storeSharedStudyDeck,
  type SharedStudyDeckEntry,
  type QuestionnaireIndexStatus,
  type SharedQuestionnaireEntry
} from './library'
import { createContainerIfMissing } from '../service/types'
import {
  hasUndeferredPokemonChoice,
  loadPokemonProgress,
  quizAveragesFromProgress,
  resumeDeferredPokemonChoices,
  type PokemonProgress
} from '../service/pokemonProgress'
import PodQuestionnaireDialog from './PodQuestionnaireDialog'
import PodFileDialog from './PodFileDialog'
import StudyCardConfirmDialog from './StudyCardConfirmDialog'
import { addFriend, loadFriendSummaries, searchContactsAndFriends, searchWebIds, type FriendSummary, type WebIdSearchResult } from '../service/socialFriends'
import { FriendChatClient } from '../service/friendChatClient'
import type FriendChatDialog from '../components/standalone/friend-chat/FriendChatDialog'
import '../components/standalone/friend-chat/FriendChatDialog'
import QuestionnaireShareDialog from '../components/standalone/questionnaire-share/QuestionnaireShareDialog'
import { loadChatInboxNotifications, sendChatInboxNotifications, type ChatInboxNotification } from '../service/chatNotifications'
import { markInboxNotificationRead } from '../service/inboxNotifications'

declare global {
  interface Window {
    SolidLogic?: {
      authSession: typeof authSession
    }
  }
}

const store = solidStore as LiveStore
let friendChatClient: FriendChatClient | undefined
let friendChatDialog: FriendChatDialog | undefined
let unsubscribeChatHome: (() => void) | undefined

function setChatFriends (friends: FriendSummary[]): void {
  friendChatClient?.setFriends(friends)
  if (friendChatDialog) {
    friendChatDialog.friends = friends
    friendChatDialog.requestUpdate()
  }
}
const app = document.querySelector<HTMLElement>('#app')!
const loginReturnUrlKey = 'questionaire-pane:login-return-url'
const authRestoreTimeoutMs = 10_000

app.addEventListener('questionaire-take-review-visibility', (event) => {
  const { visible } = (event as CustomEvent<{ visible: boolean }>).detail
  document.querySelector<HTMLElement>('#PageHeader')?.toggleAttribute('hidden', visible)
})

function getQuizGameEndpoint (): string {
  const configured = import.meta.env.VITE_QUIZ_GAME_ENDPOINT?.trim()
  if (configured) return configured
  if (import.meta.env.DEV) return 'http://localhost:5100'
  return window.location.origin
}

window.SolidLogic = { authSession }

function configureLoginIssuer (): void {
  const currentIssuer = window.localStorage.getItem('loginIssuer')
  const issuer = getStandaloneLoginIssuer(window.location, currentIssuer, import.meta.env.VITE_LOGIN_ISSUER)
  if (issuer && issuer !== currentIssuer) {
    window.localStorage.setItem('loginIssuer', issuer)
  }
}

function configureQuizSidecar (): void {
  const endpoint = getAppServicesEndpoint({
    dev: import.meta.env.DEV,
    appServicesEndpoint: import.meta.env.VITE_SOLID_APP_SERVICES_ENDPOINT,
    legacySidecarEndpoint: import.meta.env.VITE_QUIZ_SIDECAR_ENDPOINT
  })
  if (endpoint) {
    configureQuizAiService({
      sidecarEndpoint: endpoint,
      quizImportEndpoint: import.meta.env.VITE_QUIZ_IMPORT_ENDPOINT?.trim() || undefined
    })
  }
}

function isOAuthCallback (url: URL): boolean {
  return ['code', 'state', 'iss'].some(parameter => url.searchParams.has(parameter))
}

function rememberLoginReturnUrl (): void {
  const url = new URL(window.location.href)
  if (!isOAuthCallback(url) && (url.searchParams.has('base') || url.searchParams.has('baseUrl') || url.searchParams.has('subject'))) {
    window.localStorage.setItem(loginReturnUrlKey, url.href)
  }
}

function restoreLoginReturnUrl (): void {
  const callbackUrl = new URL(window.location.href)
  if (!isOAuthCallback(callbackUrl)) return

  const returnUrl = window.localStorage.getItem(loginReturnUrlKey)
  window.localStorage.removeItem(loginReturnUrlKey)
  if (!returnUrl) return

  const targetUrl = new URL(returnUrl, window.location.origin)
  history.replaceState(null, document.title, `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`)
}

configureLoginIssuer()
configureQuizSidecar()

function message (text: string, kind: 'info' | 'error' = 'info'): void {
  app.classList.remove('app-home', 'app-loading', 'app-welcome')
  app.innerHTML = ''
  const element = document.createElement(kind === 'error' ? 'p' : 'p')
  element.className = kind
  element.textContent = text
  app.appendChild(element)
}

function renderWelcome (): void {
  ensurePageHeaderProvider()
  document.querySelector<HTMLElement>('#PageHeader')?.removeAttribute('hidden')
  app.classList.remove('app-home', 'app-loading')
  app.classList.add('app-welcome')
  app.innerHTML = `
    <div class="welcome-layout">
      <section class="welcome-card" aria-labelledby="welcome-heading">
        <p class="welcome-eyebrow"><span aria-hidden="true">✦</span> Solid Learn</p>
        <div class="welcome-grid">
          <div class="welcome-copy">
            <p class="welcome-kicker">A home for your learning</p>
            <h1 id="welcome-heading">Your learning deserves a place to grow.</h1>
            <p class="welcome-description">
              Log in to continue, or create a Solid account to get your own Pod:
              a personal place to store quizzes, answers, and study materials.
              Your Pod keeps your work together, and you choose what you share.
            </p>
            <div class="welcome-actions">
              <solid-ui-provider class="welcome-auth-provider">
                <solid-ui-login-button>
                  <button class="welcome-button welcome-button-primary" type="button" slot="trigger">Log in</button>
                </solid-ui-login-button>
              </solid-ui-provider>
              <a class="welcome-button welcome-button-secondary" href="${accountRegistrationUrl}"
                target="_blank" rel="noopener noreferrer">Create an account</a>
            </div>
            <p class="welcome-note">Already have a published questionnaire link? Open it directly.</p>
          </div>
          <div class="welcome-visual" aria-hidden="true">
            <div class="welcome-pod-card">
              <div class="welcome-pod-heading">
                <span class="welcome-pod-mark">S</span>
                <div><strong>Your Pod</strong><small>Your personal space</small></div>
                <span class="welcome-pod-status">YOURS</span>
              </div>
              <div class="welcome-pod-items">
                <div class="welcome-pod-item">
                  <span class="welcome-pod-item-icon welcome-pod-item-icon--quiz">Q</span>
                  <div><strong>Quizzes</strong><small>Create and keep learning</small></div>
                </div>
                <div class="welcome-pod-item">
                  <span class="welcome-pod-item-icon welcome-pod-item-icon--cards">✦</span>
                  <div><strong>Study cards</strong><small>Save what you want to remember</small></div>
                </div>
                <div class="welcome-pod-item">
                  <span class="welcome-pod-item-icon welcome-pod-item-icon--progress">↗</span>
                  <div><strong>Your progress</strong><small>Pick up where you left off</small></div>
                </div>
              </div>
              <p class="welcome-pod-footer"><span></span> Stored in your own Pod</p>
            </div>
          </div>
        </div>
      </section>
      <section class="welcome-benefits" aria-label="Your learning space">
        <article><span>01</span><div><h2>Save your learning</h2><p>Keep quizzes and study materials in one place.</p></div></article>
        <article><span>02</span><div><h2>Continue anytime</h2><p>Log in to return to your work and progress.</p></div></article>
        <article><span>03</span><div><h2>Share on your terms</h2><p>Choose what you share with other people.</p></div></article>
      </section>
    </div>
  `
}

async function checkUserWithoutBlockingStartup (): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      authn.checkUser(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Authentication restore timed out.')), authRestoreTimeoutMs)
      })
    ])
  } catch (error) {
    console.warn('Unable to restore the previous Solid session during startup.', error)
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

function renderQuestionnaire (subject: NamedNode): void {
  ensurePageHeaderProvider()
  document.querySelector<HTMLElement>('#PageHeader')?.removeAttribute('hidden')
  app.classList.remove('app-home', 'app-loading', 'app-welcome')
  app.innerHTML = ''
  const provider = document.createElement('questionaire-provider') as HTMLElement & { store?: LiveStore, subject?: NamedNode, acl?: typeof solidLogicSingleton.acl }
  provider.store = store
  provider.subject = subject
  provider.acl = solidLogicSingleton.acl
  app.appendChild(provider)
  provider.appendChild(document.createElement(isPublishedQuestionnaire(store, subject)
    ? 'questionaire-pane-take-main-view'
    : 'questionaire-pane-create-main-view'))
}

interface PodContainer {
  url: string
  label: string
}

interface StudyDeckSummary {
  uri: string
  title: string
  cardCount: number
  completedCardCount: number
  score?: number
}

function fileTitle (filename: string): string {
  return filename.replace(/\.[^.]+$/, '') || 'Generated study cards'
}

function escapeHtml (value: string): string {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', [String.fromCharCode(34)]: '&quot;', [String.fromCharCode(39)]: '&#39;'
  })[character]!)
}

const storagePredicate = sym('http://www.w3.org/ns/pim/space#storage')
const pim = Namespace('http://www.w3.org/ns/pim/space#')
const ldp = Namespace('http://www.w3.org/ns/ldp#')
function containerLabel (url: string): string {
  const path = new URL(url).pathname.replace(/\/+$/, '')
  return decodeURIComponent(path.split('/').pop() || new URL(url).host)
}

function parentContainerUrl (url: string): string | undefined {
  const parsed = new URL(url)
  const path = parsed.pathname.endsWith('/') ? parsed.pathname.slice(0, -1) : parsed.pathname
  const parentPath = path.slice(0, path.lastIndexOf('/') + 1)
  if (!parentPath || parentPath === '/') return undefined
  return new URL(parentPath, parsed.origin).href
}

async function loadContainerChildren (url: string): Promise<PodContainer[]> {
  if (!store.fetcher) throw new Error('Unable to browse your Pod: no Solid fetcher is available.')
  const container = sym(url)
  await store.fetcher.load(container.doc())
  const children = store.each(container, ldp('contains'))
    .filter((term): term is NamedNode => term.termType === 'NamedNode')
    .filter(term => term.uri.endsWith('/'))
    .map(term => ({ url: term.uri, label: containerLabel(term.uri) }))
  return children.sort((left, right) => left.label.localeCompare(right.label))
}

async function findStorageContainer (me: NamedNode): Promise<string | undefined> {
  if (!store.fetcher) return undefined
  await store.fetcher.load(me.doc())
  const storage = store.any(me, storagePredicate)
  return storage?.termType === 'NamedNode' ? (storage as NamedNode).uri : undefined
}

const quizVocabulary = Namespace('https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#')

async function loadStudyDecks (
  storageUrl: string,
  user: NamedNode,
  workspaceUrl: string
): Promise<StudyDeckSummary[]> {
  let folders: PodContainer[]
  try {
    folders = await loadContainerChildren(`${storageUrl.replace(/\/+$/, '')}/study-decks/`)
  } catch (error) {
    const failure = error as { status?: number, response?: { status?: number } }
    if (failure.status === 404 || failure.response?.status === 404) return []
    throw error
  }
  const ownedDeckUris = new Set(folders.map(folder => `${folder.url.replace(/\/+$/, '')}/index.ttl`))
  const deckUris = new Set(ownedDeckUris)
  if (workspaceUrl) {
    for (const uri of await loadStoredStudyDeckUris(store, workspaceUrl)) deckUris.add(uri)
  }
  const decks: StudyDeckSummary[] = []
  for (const uri of deckUris) {
    const segments = uri.split('/').filter(Boolean)
    const folderLabel = segments[segments.length - 2] ?? 'Study cards'
    let title: string
    let cardUris: string[]
    try {
      await store.fetcher?.load(sym(uri))
      const deck = sym(`${uri}#deck`)
      title = store.any(deck, quizVocabulary('name'))?.value || folderLabel
      const cardTerms = store.each(deck, quizVocabulary('studyCard'))
      const cards = cardTerms.filter((card): card is NamedNode => card.termType === 'NamedNode')
      if (cards.length !== cardTerms.length) throw new Error('The deck contains an invalid study-card reference.')
      cardUris = cards.map(card => card.uri)
    } catch (error) {
      if (!ownedDeckUris.has(uri)) {
        throw new Error(`Unable to load shared study cards at ${uri}: ${error instanceof Error ? error.message : String(error)}`)
      }
      continue
    }
    const progress = await loadStudyLearningProgress(store, user, storageUrl, uri)
    decks.push({ uri, title, cardCount: cardUris.length, ...studyDeckMetrics(progress, cardUris) })
  }
  return decks.sort((left, right) => left.title.localeCompare(right.title))
}

async function renderStudyDeck (me: NamedNode, uri: string): Promise<void> {
  if (!store.fetcher) throw new Error('Unable to open study cards: no Solid fetcher is available.')
  await store.fetcher.load(sym(uri))
  const deck = sym(`${uri}#deck`)
  const title = store.any(deck, quizVocabulary('name'))?.value || 'Study cards'
  const cards = store.each(deck, quizVocabulary('studyCard'))
    .filter((card): card is NamedNode => card.termType === 'NamedNode')
    .map(card => ({
      uri: card.uri,
      front: store.any(card, quizVocabulary('front'))?.value ?? '',
      back: store.any(card, quizVocabulary('back'))?.value ?? ''
    }))
  const section = document.createElement('section')
  section.className = 'study-card-player'
  const chatRoomId = `study-${[...uri].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 7).toString(16)}`
  const chatPanel = createStudyChatPanel(getQuizGameEndpoint(), chatRoomId)
  const back = document.createElement('button')
  back.type = 'button'
  back.className = 'study-card-player-back'
  back.innerHTML = '<icon-lucide-arrow-left aria-hidden="true"></icon-lucide-arrow-left><span>Back to decks</span>'
  back.setAttribute('aria-label', 'Back to questionnaires')
  back.addEventListener('click', () => { chatPanel.cleanup(); void renderLibrary(me) })
  const liveButton = document.createElement('button')
  liveButton.type = 'button'
  liveButton.className = 'study-card-live-button'
  liveButton.textContent = 'Play together'
  const livePanel = document.createElement('div')
  livePanel.hidden = true
  const liveStudy = document.createElement('questionaire-live-study-cards') as HTMLElement & {
    endpoint: string
    deckUri: string
    title: string
    cards: { front: string, back: string }[]
    store: typeof store
  }
  liveStudy.endpoint = getQuizGameEndpoint()
  liveStudy.deckUri = uri
  liveStudy.title = title
  liveStudy.cards = cards
  liveStudy.store = store
  liveButton.addEventListener('click', () => {
    livePanel.hidden = !livePanel.hidden
    liveButton.textContent = livePanel.hidden ? 'Play together' : 'Close live game'
  })
  livePanel.append(liveStudy)
  const content = document.createElement('div')
  const status = document.createElement('p')
  status.className = 'study-card-prompt'
  status.setAttribute('role', 'status')
  const retry = document.createElement('button')
  retry.type = 'button'
  retry.textContent = 'Retry saving progress'
  retry.hidden = true
  const setup = document.createElement('questionaire-study-session-setup') as HTMLElement & {
    cards: typeof cards
    progress?: Awaited<ReturnType<typeof loadStudyLearningProgress>>
    loading: boolean
    error: string
  }
  setup.cards = cards
  setup.loading = true
  content.append(setup)
  section.append(back, liveButton, livePanel, content, status, retry, chatPanel.element)
  app.innerHTML = ''
  app.append(section)
  let learningProgress: Awaited<ReturnType<typeof loadStudyLearningProgress>>
  try {
    const storageUrl = await findStorageContainer(me)
    if (!storageUrl) throw new Error('Your profile does not advertise a Pod for personal study progress.')
    learningProgress = await loadStudyLearningProgress(store, me, storageUrl, deck.uri)
  } catch (error) {
    setup.error = error instanceof Error ? error.message : 'Unable to load personal study progress.'
    setup.loading = false
    return
  }
  setup.progress = learningProgress
  setup.loading = false
  let sessionCards: typeof cards = []
  let current = 0
  let score = 0
  let saving = false
  let completed = false
  let saveError = ''
  let sessionId = ''
  type CardState = {
    selected?: string
    revealed: boolean
    hintVisible: boolean
    outcome?: 'correct' | 'incorrect' | 'revealed'
    saved: boolean
    awarded: boolean
    alternatives: string[]
  }
  const states = new Map<string, CardState>()
  const shuffle = <T,>(items: T[]): T[] => items
    .map(value => ({ value, sort: Math.random() }))
    .sort((left, right) => left.sort - right.sort)
    .map(item => item.value)

  const render = (): void => {
    const card = sessionCards[current]
    status.textContent = saveError || (saving ? 'Saving your progress…' : '')
    retry.hidden = !saveError || saving
    back.disabled = saving
    content.replaceChildren()
    if (!card) {
      setup.progress = learningProgress
      content.append(setup)
      return
    }
    const state = states.get(card.uri)!
    const { selected, revealed, hintVisible } = state
    const header = document.createElement('header')
    header.className = 'study-card-player-header'
    header.innerHTML = `<div><span class="study-card-kicker">STUDY SESSION</span><h1>${escapeHtml(title)}</h1></div><div class="study-card-xp"><span>XP</span><strong>${score * 2}</strong><small>+2 each</small></div>`
    if (completed) {
      const summary = document.createElement('p')
      summary.textContent = `Session complete — ${sessionCards.length} cards reviewed, ${score} correct without revealing, ${score * 2} XP earned.`
      const another = document.createElement('button')
      another.type = 'button'
      another.textContent = 'Study another set'
      another.disabled = saving || Boolean(saveError)
      another.addEventListener('click', () => { sessionCards = []; completed = false; render() })
      content.append(header, summary, another)
      return
    }
    const progress = document.createElement('div')
    progress.className = 'study-card-progress'
    progress.innerHTML = `<div class="study-card-progress-label"><span>Card ${current + 1} of ${sessionCards.length}</span><strong>${Math.round(((current + 1) / sessionCards.length) * 100)}%</strong></div><div class="study-card-progress-track"><span style="width:${((current + 1) / sessionCards.length) * 100}%"></span></div>`

    const question = document.createElement('article')
    question.className = 'study-card-question'
    question.innerHTML = `<span class="study-card-label">QUESTION</span><p>${escapeHtml(card.front)}</p>`
    const prompt = document.createElement('p')
    prompt.className = 'study-card-prompt'
    prompt.textContent = selected ? (selected === card.back ? 'Correct! Great work.' : `Not quite — the answer is “${card.back}”.`) : 'Choose the best answer'
    const choices = document.createElement('div')
    choices.className = 'study-card-choices'
    state.alternatives.forEach((alternative, index) => {
      const choice = document.createElement('button')
      choice.type = 'button'
      choice.className = 'study-card-choice'
      if (selected) choice.classList.add(alternative === card.back ? 'is-correct' : alternative === selected ? 'is-wrong' : 'is-muted')
      choice.disabled = selected !== undefined || saving || Boolean(saveError)
      choice.innerHTML = `<span>${String.fromCharCode(65 + index)}</span><strong>${escapeHtml(alternative)}</strong>${selected && alternative === card.back ? '<b>✓</b>' : ''}`
      choice.addEventListener('click', () => {
        state.selected = alternative
        if (!state.outcome) {
          state.outcome = alternative === card.back ? 'correct' : 'incorrect'
          void saveOutcome(card, state)
        } else {
          render()
        }
      })
      choices.append(choice)
    })

    const tools = document.createElement('div')
    tools.className = 'study-card-player-tools'
    const hint = document.createElement('button')
    hint.type = 'button'
    hint.className = 'study-card-tool'
    hint.textContent = hintVisible ? `Hint: ${card.back}` : '💡 Hint'
    hint.disabled = saving || Boolean(saveError)
    hint.addEventListener('click', () => {
      state.hintVisible = !hintVisible
      if (!state.outcome) { state.outcome = 'revealed'; void saveOutcome(card, state) } else render()
    })
    const reveal = document.createElement('button')
    reveal.type = 'button'
    reveal.className = 'study-card-tool'
    reveal.textContent = revealed ? `Answer: ${card.back}` : '◉ Reveal answer'
    reveal.disabled = saving || Boolean(saveError)
    reveal.addEventListener('click', () => {
      state.revealed = !revealed
      if (!state.outcome) { state.outcome = 'revealed'; void saveOutcome(card, state) } else render()
    })
    tools.append(hint, reveal)
    if (revealed && !selected) {
      const explanation = document.createElement('p')
      explanation.className = 'study-card-reveal'
      explanation.textContent = card.back
      question.append(explanation)
    }

    const navigation = document.createElement('nav')
    navigation.className = 'study-card-player-navigation'
    const previous = document.createElement('button')
    previous.type = 'button'
    previous.className = 'study-card-nav'
    previous.textContent = '← Previous'
    previous.disabled = current === 0 || saving || Boolean(saveError)
    previous.addEventListener('click', () => { current -= 1; render() })
    const next = document.createElement('button')
    next.type = 'button'
    next.className = 'study-card-nav study-card-next'
    next.textContent = current === sessionCards.length - 1 ? 'Finish session' : 'Next card →'
    next.disabled = !state.saved || saving || Boolean(saveError)
    next.addEventListener('click', () => {
      if (current < sessionCards.length - 1) {
        current += 1
        render()
      } else {
        void finishSession()
      }
    })
    navigation.append(previous, next)
    content.append(header, progress, question, prompt, choices, tools, navigation)
  }
  const saveOutcome = async (card: typeof cards[number], state: CardState): Promise<void> => {
    if (!state.outcome || saving) return
    saving = true
    saveError = ''
    render()
    try {
      if (!state.saved) {
        learningProgress = await recordStudyCardOutcome(store, learningProgress, card.uri, state.outcome)
        state.saved = true
      }
      if (state.outcome === 'correct' && !state.awarded) {
        await updatePokemonProgress(store, 2, sym(`${uri}#study-${sessionId}-${sessionCards.indexOf(card)}`), deck, me)
        state.awarded = true
        score += 1
      }
    } catch (error) {
      saveError = error instanceof Error ? error.message : 'Unable to save your study progress.'
    } finally {
      saving = false
      render()
    }
  }
  const finishSession = async (): Promise<void> => {
    completed = true
    saving = true
    saveError = ''
    render()
    try {
      const progress = await loadPokemonProgress(store, me)
      if (progress) await showPokemonLevelUp(store, me, progress)
    } catch (error) {
      saveError = error instanceof Error ? error.message : 'Unable to load your Pokémon reward.'
    } finally {
      saving = false
      render()
    }
  }
  retry.addEventListener('click', () => {
    if (completed) { void finishSession(); return }
    const card = sessionCards[current]
    const state = card && states.get(card.uri)
    if (state) void saveOutcome(card, state)
  })
  setup.addEventListener('study-session-start', event => {
    sessionCards = (event as CustomEvent<{ cards: typeof cards }>).detail.cards
    current = 0
    score = 0
    completed = false
    saveError = ''
    sessionId = crypto.randomUUID()
    states.clear()
    sessionCards.forEach(card => {
      const distractors = shuffle([...new Set(cards.filter(candidate => candidate.back !== card.back).map(candidate => candidate.back))]).slice(0, 3)
      states.set(card.uri, { revealed: false, hintVisible: false, saved: false, awarded: false, alternatives: shuffle([card.back, ...distractors]) })
    })
    render()
  })
}

function createStudyChatPanel (endpoint: string, roomId: string): {
  element: HTMLElement
  cleanup: () => void
} {
  const element = document.createElement('section')
  element.className = 'study-card-chat'
  if (!endpoint || !roomId) return { element, cleanup: () => {} }
  const client = new LiveQuizClient({ endpoint })
  const messages: LiveQuizChatMessage[] = []
  let joined = false
  let removeMessages = () => {}
  const heading = document.createElement('div')
  heading.className = 'live-quiz-chat-heading'
  const title = document.createElement('h3')
  title.textContent = 'Study room chat'
  const count = document.createElement('span')
  const content = document.createElement('div')
  const render = (): void => {
    count.textContent = `${messages.length} message${messages.length === 1 ? '' : 's'}`
    content.innerHTML = ''
    const list = document.createElement('ol')
    list.setAttribute('aria-live', 'polite')
    messages.forEach(message => {
      const item = document.createElement('li')
      const sender = document.createElement('strong')
      sender.textContent = message.senderName
      const text = document.createElement('span')
      text.textContent = message.content
      item.append(sender, text)
      list.append(item)
    })
    content.append(list)
  }
  heading.append(title, count)
  const joinForm = document.createElement('form')
  joinForm.innerHTML = '<input name="name" required maxlength="80" autocomplete="name" placeholder="Your name"><button class="primary" type="submit">Join chat</button>'
  const status = document.createElement('p')
  status.className = 'study-card-chat-status'
  status.textContent = 'Optional — join this deck’s study room.'
  const toggle = document.createElement('button')
  toggle.className = 'study-card-chat-toggle'
  toggle.type = 'button'
  toggle.setAttribute('aria-label', 'Open study room chat')
  toggle.innerHTML = '<icon-lucide-message-circle-more aria-hidden="true"></icon-lucide-message-circle-more><span>Chat with friends</span>'
  const panel = document.createElement('div')
  panel.className = 'study-card-chat-panel live-quiz-chat'
  panel.hidden = true
  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden
  })
  joinForm.addEventListener('submit', event => {
    event.preventDefault()
    const name = new FormData(joinForm).get('name')?.toString().trim() || ''
    if (!name) return
    status.textContent = 'Connecting…'
    void client.connect().then(() => {
      joined = true
      client.joinChatRoom({ name, roomId })
      status.textContent = 'Connected to study room.'
      joinForm.remove()
      const composer = document.createElement('form')
      composer.innerHTML = '<input name="message" maxlength="500" autocomplete="off" placeholder="Say something to the room"><button class="primary" type="submit">Send</button>'
      composer.addEventListener('submit', submitEvent => {
        submitEvent.preventDefault()
        const input = composer.elements.namedItem('message') as HTMLInputElement
        client.sendChatMessage(input.value)
        input.value = ''
      })
      element.append(composer)
    }).catch(error => {
      status.textContent = error instanceof Error ? error.message : 'Unable to join study chat.'
    })
  })
  removeMessages = client.onChatMessage(message => {
    messages.push(message)
    messages.splice(0, Math.max(0, messages.length - 100))
    render()
  })
  render()
  panel.append(heading, status, joinForm, content)
  element.append(toggle, panel)
  return {
    element,
    cleanup: () => {
      if (joined) client.disconnect()
      removeMessages()
    }
  }
}

async function renderContainerPicker (me: NamedNode, initialUrl?: string): Promise<void> {
  const storageUrl = initialUrl || await findStorageContainer(me)
  if (!storageUrl) throw new Error('Your Pod profile does not advertise a storage container.')

  let currentUrl = storageUrl.endsWith('/') ? storageUrl : `${storageUrl}/`
  let children: PodContainer[] = []
  let loading = false
  let canCreate = false

  const section = document.createElement('section')
  section.className = 'questionnaire-create'
  section.innerHTML = '<h1>Create questionnaire</h1><p>Choose a Pod folder for the new questionnaire.</p>'
  const location = document.createElement('p')
  location.className = 'container-location'
  const controls = document.createElement('div')
  controls.className = 'container-controls'
  const list = document.createElement('ul')
  list.className = 'container-list'
  const status = document.createElement('p')
  status.className = 'info'
  const back = document.createElement('button')
  back.type = 'button'
  back.textContent = 'Parent'
  const choose = document.createElement('button')
  choose.type = 'button'
  choose.className = 'primary'
  choose.textContent = 'Create here'
  const createFolder = document.createElement('button')
  createFolder.type = 'button'
  createFolder.textContent = 'Create folder'
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.textContent = 'Cancel'
  controls.append(back, choose, createFolder, cancel)
  section.append(location, controls, status, list)
  const restorePreviousView = replaceViewWithRestorableContent(app, section, () => {
    void start().catch((error: unknown) => {
      message(error instanceof Error ? error.message : 'Unable to restore questionnaire view.', 'error')
    })
  })

  const refresh = async (): Promise<void> => {
    loading = true
    canCreate = false
    status.className = 'info'
    status.textContent = 'Loading folders…'
    list.innerHTML = ''
    location.textContent = `Current folder: ${currentUrl}`
    back.disabled = !parentContainerUrl(currentUrl)
    choose.disabled = false
    createFolder.disabled = true
    try {
      children = await loadContainerChildren(currentUrl)
      canCreate = true
      status.textContent = children.length ? 'Select a child folder, or create here.' : 'No child folders found. You can create here.'
      for (const child of children) {
        const item = document.createElement('li')
        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'container-child'
        button.textContent = `📁 ${child.label}`
        button.addEventListener('click', () => {
          currentUrl = child.url
          void refresh()
        })
        item.appendChild(button)
        list.appendChild(item)
      }
    } catch (caught) {
      const error = caught instanceof Error ? caught.message : 'Unable to browse this Pod folder.'
      status.textContent = error
    } finally {
      loading = false
      choose.disabled = loading
      createFolder.disabled = loading
    }
  }

  back.addEventListener('click', () => {
    const parent = parentContainerUrl(currentUrl)
    if (parent) {
      currentUrl = parent
      void refresh()
    }
  })
  choose.addEventListener('click', () => {
    if (!loading && canCreate) {
      const enteredName = window.prompt('Questionnaire name:')
      if (enteredName === null) {
        status.className = 'info'
        status.textContent = 'Creation cancelled.'
        return
      }

      const name = enteredName.trim()
      if (!name) {
        status.className = 'error'
        status.textContent = 'Please enter a questionnaire name.'
        return
      }

      choose.disabled = true
      void createQuestionnaire(currentUrl, me, name).catch((caught: unknown) => {
        status.className = 'error'
        status.textContent = caught instanceof Error ? caught.message : 'Unable to create the questionnaire.'
        choose.disabled = false
      })
    }
  })
  createFolder.addEventListener('click', () => {
    if (loading || !canCreate) return

    const enteredName = window.prompt('Folder name:')
    if (enteredName === null) {
      status.className = 'info'
      status.textContent = 'Folder creation cancelled.'
      return
    }

    const name = enteredName.trim()
    if (!name) {
      status.className = 'error'
      status.textContent = 'Please enter a folder name.'
      return
    }

    createFolder.disabled = true
    choose.disabled = true
    void (async () => {
      const folderUrl = `${currentUrl}${encodeURIComponent(name)}/`
      const created = await createContainerIfMissing(store, folderUrl)
      currentUrl = folderUrl
      await refresh()
      status.className = created ? 'info' : 'error'
      status.textContent = created
        ? 'Folder created. You can now create the questionnaire here.'
        : 'That folder already exists. You can create the questionnaire here.'
    })().catch((caught: unknown) => {
      status.className = 'error'
      status.textContent = caught instanceof Error ? caught.message : 'Unable to create the folder.'
      createFolder.disabled = false
      choose.disabled = false
    })
  })
  cancel.addEventListener('click', restorePreviousView)
  await refresh()
}

async function openStorageFileDialog (me: NamedNode): Promise<void> {
  const storageUrl = await findStorageContainer(me)
  if (!storageUrl) throw new Error('Your Pod profile does not advertise a storage container.')
  const dialog = new PodFileDialog()
  dialog.store = store
  dialog.storageUrl = storageUrl
  dialog.onSelect = (uri: string) => {
    void openSubject(uri).catch(error => {
      message(error instanceof Error ? error.message : 'Unable to open the selected file.', 'error')
    })
  }
  dialog.onClose = () => dialog.remove()
  document.body.appendChild(dialog)
}

async function openSubject (uri: string): Promise<void> {
  if (!isHttpUrl(uri)) throw new Error('The subject must be an HTTP(S) URL.')
  const subject = sym(uri)
  if (!store.fetcher) throw new Error('Unable to load questionnaire: no Solid fetcher is available.')
  await store.fetcher.load(subject.doc())
  renderQuestionnaire(subject)
}

async function openQuestionnaireDialog (me: NamedNode): Promise<void> {
  const advertisedStorage = store.any(me, storagePredicate) as NamedNode | undefined
  const storageUrl = advertisedStorage?.termType === 'NamedNode'
    ? advertisedStorage.uri
    : await findStorageContainer(me)
  if (!storageUrl) throw new Error('Your Pod profile does not advertise a storage container.')
  const dialog = new PodQuestionnaireDialog()
  dialog.store = store
  dialog.storageUrl = storageUrl
  dialog.onSelect = (subject: NamedNode) => {
    void openSubject(subject.uri).catch(error => message(error instanceof Error ? error.message : 'Unable to open questionnaire.', 'error'))
  }
  dialog.onClose = () => dialog.remove()
  document.body.appendChild(dialog)
}

async function openSharedSubject (uri: string): Promise<void> {
  if (!isHttpUrl(uri)) throw new Error('The subject must be an HTTP(S) URL.')
  const subject = sym(uri)
  if (!store.fetcher) throw new Error('Unable to load questionnaire: no Solid fetcher is available.')
  await store.fetcher.load(subject.doc())
  renderQuestionnaire(await publishedQuestionnaireForTake(store, subject))
}

async function createQuestionnaire (baseUrl: string, me: NamedNode, name?: string): Promise<void> {
  if (!isHttpUrl(baseUrl)) throw new Error('The base URL must be an HTTP(S) Pod container URL.')
  const containerUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  const newBase = name ? `${containerUrl}${encodeURIComponent(name)}/` : containerUrl
  const created = await questionairePane.mintNew({
    session: { store }
  }, {
    newBase,
    title: name,
    me
  })
  if (!created?.newInstance) throw new Error('Unable to create the questionnaire.')
  renderQuestionnaire(created.newInstance)
}

function renderLiveQuiz (me: NamedNode, entry: { subject: NamedNode, title: string, questionCount: number }, endpoint: string): void {
  document.querySelector<HTMLElement>('#PageHeader')?.setAttribute('hidden', '')
  app.classList.add('app-home')
  const section = document.createElement('section')
  section.className = 'questionnaire-create'
  const back = document.createElement('button')
  back.type = 'button'
  back.textContent = 'Home'
  back.addEventListener('click', () => { void renderLibrary(me) })
  const liveQuiz = document.createElement('questionaire-live-quiz') as HTMLElement & {
    endpoint: string
    quizUri: string
    questionCount: number
    store: typeof store
  }
  liveQuiz.endpoint = endpoint
  liveQuiz.quizUri = entry.subject.uri
  liveQuiz.questionCount = entry.questionCount
  liveQuiz.store = store
  section.append(back, liveQuiz)
  app.innerHTML = ''
  app.appendChild(section)
}

async function renderEnglishPractice (
  me: NamedNode,
  initialPracticeType: 'paragraph' | 'essay'
): Promise<void> {
  const workspaceUrl = await ensureQuestionnaireWorkspace(store, me)
  document.querySelector<HTMLElement>('#PageHeader')?.setAttribute('hidden', '')
  app.classList.add('app-home')
  const section = document.createElement('section')
  section.className = 'questionnaire-create'
  const back = document.createElement('button')
  back.type = 'button'
  back.className = 'study-card-back'
  back.textContent = 'Home'
  const practice = document.createElement('questionaire-english-practice') as HTMLElement & {
    endpoint: string
    store: LiveStore
    user: NamedNode
    workspaceUrl: string
    initialPracticeType: 'paragraph' | 'essay'
    flushPendingSave: () => Promise<boolean>
  }
  practice.endpoint = getAppServicesEndpoint({
    dev: import.meta.env.DEV,
    appServicesEndpoint: import.meta.env.VITE_SOLID_APP_SERVICES_ENDPOINT,
    legacySidecarEndpoint: import.meta.env.VITE_QUIZ_SIDECAR_ENDPOINT
  }) ?? ''
  practice.store = store
  practice.user = me
  practice.workspaceUrl = workspaceUrl
  practice.initialPracticeType = initialPracticeType
  back.addEventListener('click', () => {
    void practice.flushPendingSave().then(saved => {
      if (saved) void renderLibrary(me)
    })
  })
  section.append(back, practice)
  app.innerHTML = ''
  app.appendChild(section)
}

async function renderLibrary (me: NamedNode): Promise<void> {
  const header = document.querySelector<HTMLElement>('#PageHeader')
  header?.setAttribute('hidden', '')
  header?.querySelector('solid-ui-provider')?.remove()
  app.classList.remove('app-loading', 'app-welcome')
  app.classList.add('app-home')
  app.innerHTML = ''
  const home = document.createElement('questionaire-home') as HTMLElement & {
    entries: ReturnType<typeof entriesFromSubjects>
    publishedEntries: Awaited<ReturnType<typeof ownPublishedQuestionnaires>>
    savedEntries: ReturnType<typeof entriesFromSubjects>
    sharedEntries: Awaited<ReturnType<typeof discoverSharedQuestionnaires>>
    section: 'mine' | 'shared'
    workspaceReady: boolean
    workspaceCreated: boolean
    status: string
    statusKind: 'info' | 'error'
    liveGameEndpoint: string
    friendCount: number
    friends: FriendSummary[]
    friendSearchResults: WebIdSearchResult[]
    friendSearchStatus: string
    pokemonProgress?: PokemonProgress
    quizAverages: Record<string, number>
    studyDecks: StudyDeckSummary[]
    sharedStudyDecks: SharedStudyDeckEntry[]
    chatUnread: number
    chatInboxNotifications: ChatInboxNotification[]
    chatInboxUnread: number
    chatInboxStatus: string
  }
  app.appendChild(home)
  home.liveGameEndpoint = getQuizGameEndpoint()
  home.friendCount = 0
  home.friends = []
  home.friendSearchResults = []
  home.friendSearchStatus = ''
  home.pokemonProgress = undefined
  home.quizAverages = {}
  home.studyDecks = []
  home.sharedStudyDecks = []
  home.chatInboxNotifications = []
  home.chatInboxUnread = 0
  home.chatInboxStatus = ''
  if (friendChatClient?.webId !== me.uri) {
    friendChatClient?.disconnect()
    friendChatDialog?.remove()
    friendChatDialog = undefined
    friendChatClient = new FriendChatClient(me.uri, utils.label(me), getQuizGameEndpoint())
    friendChatClient.connect()
  }
  unsubscribeChatHome?.()
  unsubscribeChatHome = friendChatClient!.subscribe(snapshot => {
    home.chatUnread = Object.values(snapshot.unread).reduce((sum, value) => sum + value, 0)
  })
  let workspaceUrl = ''
  const refreshInbox = (): void => {
    home.chatInboxStatus = 'Refreshing inbox…'
    void (async () => {
      const [chatResult, questionnaireResult, deckResult, storedQuestionnaireResult, storedDeckResult] =
        await Promise.allSettled([
          loadChatInboxNotifications(store, me),
          discoverInboxSharedQuestionnaires(store, me),
          discoverInboxSharedStudyDecks(store, me),
          workspaceUrl ? loadStoredQuestionnaireUris(store, workspaceUrl) : Promise.resolve(new Set<string>()),
          workspaceUrl ? loadStoredStudyDeckUris(store, workspaceUrl) : Promise.resolve(new Set<string>())
        ])
      const warnings: string[] = []
      if (chatResult.status === 'fulfilled') {
        const { notifications, warnings: chatWarnings } = chatResult.value
        const latest = new Map<string, ChatInboxNotification>()
        notifications.forEach(item => { if (!latest.has(item.conversationId)) latest.set(item.conversationId, item) })
        home.chatInboxNotifications = [...latest.values()]
        home.chatInboxUnread = notifications.filter(item => !item.read).length
        warnings.push(...chatWarnings)
      } else {
        warnings.push(chatResult.reason instanceof Error ? chatResult.reason.message : 'Unable to load chat inbox notifications.')
      }

      const publicEntries = home.sharedEntries.filter(entry => !entry.notification)
      if (questionnaireResult.status === 'fulfilled') {
        const stored = storedQuestionnaireResult.status === 'fulfilled' ? storedQuestionnaireResult.value : new Set<string>()
        if (storedQuestionnaireResult.status === 'rejected') {
          warnings.push(storedQuestionnaireResult.reason instanceof Error
            ? storedQuestionnaireResult.reason.message
            : 'Unable to load saved questionnaire references.')
        }
        const directEntries = questionnaireResult.value.map(entry => ({
          ...entry,
          stored: stored.has(entry.subject.uri)
        }))
        const merged = new Map<string, SharedQuestionnaireEntry>(directEntries.map(entry => [entry.subject.uri, entry]))
        publicEntries.forEach(entry => {
          const direct = merged.get(entry.subject.uri)
          merged.set(entry.subject.uri, direct
            ? {
                ...entry,
                stored: direct.stored,
                notification: direct.notification,
                notificationId: direct.notificationId,
                read: direct.read,
                unavailableReason: direct.unavailableReason
              }
            : entry)
        })
        home.sharedEntries = [...merged.values()]
      } else {
        warnings.push(questionnaireResult.reason instanceof Error
          ? questionnaireResult.reason.message
          : 'Unable to refresh shared questionnaires.')
      }

      if (deckResult.status === 'fulfilled') {
        const stored = storedDeckResult.status === 'fulfilled' ? storedDeckResult.value : new Set<string>()
        if (storedDeckResult.status === 'rejected') {
          warnings.push(storedDeckResult.reason instanceof Error
            ? storedDeckResult.reason.message
            : 'Unable to load saved study-card references.')
        }
        home.sharedStudyDecks = deckResult.value.map(entry => ({
          ...entry,
          stored: stored.has(entry.uri)
        }))
      } else {
        warnings.push(deckResult.reason instanceof Error ? deckResult.reason.message : 'Unable to refresh shared study cards.')
      }
      home.chatInboxStatus = warnings.join(' ')
    })().catch(error => {
      home.chatInboxStatus = error instanceof Error ? error.message : 'Unable to refresh your inbox.'
    })
  }
  const notifyChat = (title: string, conversationId: string): void => {
    refreshInbox()
    try {
      if ('Notification' in window && Notification.permission === 'granted' &&
        localStorage.getItem('questionaire-chat-notifications') === 'true') {
        const notification = new Notification(title, {
          body: 'Open Solid Learn to view your chat.', tag: conversationId
        })
        notification.onclick = () => {
          window.focus()
          home.dispatchEvent(new CustomEvent('questionaire-home-open-chat-invitation', {
            detail: { conversationId }
          }))
          notification.close()
        }
      }
    } catch (error) {
      home.chatInboxStatus = error instanceof Error ? error.message : 'Unable to show browser notification.'
    }
  }
  friendChatClient!.onIncoming = incoming => notifyChat(`New chat message from ${incoming.senderName}`, incoming.conversationId || '')
  friendChatClient!.onInvitation = conversation => notifyChat('You have been invited to a chat', conversation.id)
  void loadFriendSummaries(store, me).then(friends => {
    home.friends = friends
    home.friendCount = friends.length
    setChatFriends(friends)
  }).catch(error => {
    home.friendSearchStatus = error instanceof Error ? error.message : 'Unable to load friends.'
  })
  void (async () => {
    if (!store.fetcher) throw new Error('Unable to refresh friends: no Solid fetcher is available.')
    await store.fetcher.load(me.doc())
    const friends = await loadFriendSummaries(store, me)
    home.friends = friends
    home.friendCount = friends.length
    setChatFriends(friends)
  })().catch(error => {
    home.friendSearchStatus = error instanceof Error ? error.message : 'Unable to refresh friends.'
  })
  home.addEventListener('questionaire-home-choose', () => {
    void openQuestionnaireDialog(me).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : 'Unable to search your Pod.', 'error')
    })
  })

  let subjects: NamedNode[] = []
  let statuses = new Map<string, QuestionnaireIndexStatus>()
  const renderEntries = (): void => {
    home.entries = entriesFromSubjects(store, subjects, statuses)
  }

  function renderDocumentGeneration (me: NamedNode, endpoint: string): void {
    const section = document.createElement('section')
    section.className = 'questionnaire-create study-card-generator'
    section.innerHTML = '<header class="study-card-generator-header"></header><section class="study-card-upload-heading"><span><icon-lucide-sparkles aria-hidden="true"></icon-lucide-sparkles> GENERATE STUDY CARDS</span><h1>Turn a document into cards</h1><p>Add your notes or a document. You will review every generated card before anything is saved.</p></section>'
    const input = document.createElement('input')
    input.className = 'study-card-source'
    input.type = 'file'
    input.accept = '.pdf,.docx,.pptx,.md,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/markdown,text/plain'
    let selectedFile: File | undefined
    let extractedDocument: ExtractedDocument | undefined
    const generate = document.createElement('button')
    generate.type = 'button'
    generate.className = 'primary study-card-generate'
    generate.innerHTML = '<icon-lucide-sparkles aria-hidden="true"></icon-lucide-sparkles> Generate preview'
    generate.disabled = true
    const back = document.createElement('button')
    back.className = 'study-card-back'
    back.type = 'button'
    const confirmSave = document.createElement('button')
    confirmSave.type = 'button'
    confirmSave.innerHTML = '<icon-lucide-check aria-hidden="true"></icon-lucide-check> Confirm cards'
    confirmSave.disabled = true
    const countLabel = document.createElement('label')
    countLabel.className = 'study-card-count'
    countLabel.innerHTML = '<span>Cards to generate</span>'
    const countSelect = document.createElement('select')
    countSelect.setAttribute('aria-label', 'Cards to generate')
    ;[5, 10, 15, 20, 30, 40, 50, 75, 100].forEach(count => {
      const option = document.createElement('option')
      option.value = String(count)
      option.textContent = String(count)
      option.selected = count === 10
      countSelect.append(option)
    })
    countLabel.append(countSelect)
    const dropzone = document.createElement('label')
    dropzone.className = 'study-card-dropzone'
    dropzone.innerHTML = '<span class="study-card-upload-icon"><icon-lucide-upload aria-hidden="true"></icon-lucide-upload></span><strong>Drop a document here</strong><small>or click to choose a file</small><em>PDF, Word, PowerPoint, Markdown, or text · up to 40 MB</em>'
    dropzone.append(input)
    const uploadDivider = document.createElement('div')
    uploadDivider.className = 'study-card-upload-divider'
    uploadDivider.textContent = 'or'
    const pasteNotes = document.createElement('button')
    pasteNotes.type = 'button'
    pasteNotes.className = 'study-card-paste'
    pasteNotes.innerHTML = '<span>✎</span><strong>Paste your notes instead<small>Perfect for short notes or copied text</small></strong><b>→</b>'
    const pasteEditor = document.createElement('div')
    pasteEditor.className = 'study-card-paste-editor'
    pasteEditor.hidden = true
    pasteEditor.innerHTML = '<label>PASTE YOUR NOTES<textarea placeholder="Paste class notes, an article or any text here…"></textarea></label><div><button type="button" data-paste-cancel>Cancel</button><button type="button" data-paste-use>Use these notes</button></div>'
    const privacyNote = document.createElement('p')
    privacyNote.className = 'study-card-privacy'
    privacyNote.innerHTML = '<strong>◇ You stay in control.</strong> Cards are only saved after you review and accept them.'
    const sourceName = document.createElement('p')
    sourceName.className = 'study-card-source-name'
    sourceName.hidden = true
    const actions = document.createElement('div')
    actions.className = 'study-card-actions'
    actions.append(countLabel, generate, confirmSave)
    const howItWorks = document.createElement('section')
    howItWorks.className = 'study-card-how'
    howItWorks.innerHTML = '<p>HOW IT WORKS</p><div><article><b>1</b><span><strong>Add a source</strong><small>Choose notes or a document.</small></span></article><article><b>2</b><span><strong>Review each card</strong><small>Keep, edit or skip anything.</small></span></article><article><b>3</b><span><strong>Save to your Pod</strong><small>Your accepted cards stay yours.</small></span></article></div>'
    const status = document.createElement('p')
    status.className = 'info'
    const preview = document.createElement('div')
    const reviewActions = document.createElement('div')
    reviewActions.className = 'study-card-review-actions'
    reviewActions.hidden = true
    const acceptPending = document.createElement('button')
    acceptPending.type = 'button'
    acceptPending.textContent = 'Accept all pending'
    const removeRejected = document.createElement('button')
    removeRejected.type = 'button'
    removeRejected.textContent = 'Remove rejected'
    const regenerateRejected = document.createElement('button')
    regenerateRejected.type = 'button'
    regenerateRejected.textContent = 'Regenerate rejected'
    reviewActions.append(acceptPending, removeRejected, regenerateRejected)
    let reviews: StudyCardReview[] = []
    let regenerating = false
    back.innerHTML = '<icon-lucide-arrow-left aria-hidden="true"></icon-lucide-arrow-left>'
    back.setAttribute('aria-label', 'Back to questionnaires')
    back.style.cssText = 'width:32px;height:32px;min-height:32px;padding:0;border:0;display:inline-flex;align-items:center;justify-content:center;line-height:0;'
    back.querySelector('icon-lucide-arrow-left')?.setAttribute('style', 'width:18px;height:18px;display:block;')
    section.querySelector('.study-card-generator-header')?.prepend(back)
    section.append(dropzone, uploadDivider, pasteNotes, pasteEditor, privacyNote, sourceName, actions, howItWorks, status, reviewActions, preview)
    app.innerHTML = ''
    app.classList.add('app-home')
    app.appendChild(section)
    const setSelectedFile = (file: File | undefined): void => {
      if (file !== selectedFile) {
        extractedDocument = undefined
        reviews = []
        preview.replaceChildren()
        confirmSave.disabled = true
        status.className = 'info'
        status.textContent = ''
        syncReviewActions()
      }
      selectedFile = file
      generate.disabled = !file
      sourceName.textContent = file ? fileTitle(file.name) : ''
      sourceName.hidden = !file
      dropzone.classList.toggle('has-file', Boolean(file))
    }
    input.addEventListener('change', () => setSelectedFile(input.files?.[0]))
    dropzone.addEventListener('dragover', event => {
      event.preventDefault()
      dropzone.classList.add('is-dragging')
    })
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-dragging'))
    dropzone.addEventListener('drop', event => {
      event.preventDefault()
      dropzone.classList.remove('is-dragging')
      setSelectedFile(event.dataTransfer?.files[0])
    })
    pasteNotes.addEventListener('click', () => {
      pasteNotes.hidden = true
      pasteEditor.hidden = false
      pasteEditor.querySelector('textarea')?.focus()
    })
    pasteEditor.querySelector('[data-paste-cancel]')?.addEventListener('click', () => {
      pasteEditor.hidden = true
      pasteNotes.hidden = false
    })
    pasteEditor.querySelector('[data-paste-use]')?.addEventListener('click', () => {
      const notes = pasteEditor.querySelector('textarea')?.value.trim() ?? ''
      if (!notes) return
      setSelectedFile(new File([notes], 'Pasted notes.txt', { type: 'text/plain' }))
      pasteEditor.hidden = true
      pasteNotes.hidden = false
    })
    back.addEventListener('click', () => { void renderLibrary(me) })
    const syncReviewActions = (): void => {
      const summary = summarizeStudyCardReviews(reviews)
      reviewActions.hidden = reviews.length === 0
      acceptPending.disabled = summary.pending === 0 || regenerating
      removeRejected.disabled = summary.rejected === 0 || regenerating
      regenerateRejected.disabled = summary.rejected === 0 || !extractedDocument || regenerating
    }
    const renderReview = (): void => {
      const summary = summarizeStudyCardReviews(reviews)
      const duplicateIds = duplicateStudyCardReviewIds(reviews)
      status.textContent = `${summary.accepted} accepted · ${summary.pending} pending · ${summary.rejected} rejected.${duplicateIds.size ? ` ${duplicateIds.size} duplicate card${duplicateIds.size === 1 ? '' : 's'} detected; review before saving.` : ''} Nothing has been saved.`
      confirmSave.disabled = summary.accepted === 0
      syncReviewActions()
      preview.innerHTML = reviews.map((review, index) =>
        `<article class="questionnaire-result study-card-review" data-card-id="${review.id}">
          <div class="study-card-review-header"><strong>Card ${index + 1} · ${review.status}${duplicateIds.has(review.id) ? ' · duplicate' : ''}</strong><span>${review.status.toUpperCase()}</span></div>
          <div class="study-card-review-fields">
            <label>Question <input data-card-field="front" value="${escapeHtml(review.card.front)}"></label>
            <label>Answer <input data-card-field="back" value="${escapeHtml(review.card.back)}"></label>
          </div>
          <small class="study-card-review-source">Source: ${escapeHtml(review.card.sourceReference)}</small>
          <div class="registration-controls">
            <button type="button" data-card-action="accept">${review.status === 'accepted' ? 'Accepted' : 'Accept'}</button>
            <button type="button" data-card-action="reject">${review.status === 'rejected' ? 'Rejected' : 'Reject'}</button>
          </div>
        </article>`
      ).join('')
    }
    acceptPending.addEventListener('click', () => {
      reviews = acceptPendingStudyCardReviews(reviews)
      renderReview()
    })
    removeRejected.addEventListener('click', () => {
      reviews = removeRejectedStudyCardReviews(reviews)
      renderReview()
    })
    regenerateRejected.addEventListener('click', () => {
      const rejectedCount = summarizeStudyCardReviews(reviews).rejected
      if (!extractedDocument || rejectedCount === 0) return
      regenerating = true
      syncReviewActions()
      status.className = 'info'
      status.textContent = `Regenerating ${rejectedCount} rejected card${rejectedCount === 1 ? '' : 's'}… Nothing has been saved.`
      void new DocumentGenerationClient({ endpoint }).generateFlashcards(extractedDocument, rejectedCount)
        .then(result => {
          reviews = replaceRejectedStudyCardReviews(reviews, result.cards)
          renderReview()
        })
        .catch(error => {
          status.className = 'error'
          status.textContent = error instanceof Error ? error.message : 'Unable to regenerate rejected study cards.'
        })
        .finally(() => {
          regenerating = false
          syncReviewActions()
        })
    })
    preview.addEventListener('input', event => {
      const target = event.target as HTMLInputElement
      const card = target.closest<HTMLElement>('[data-card-id]')
      const field = target.dataset.cardField
      if (!card || (field !== 'front' && field !== 'back')) return
      reviews = updateStudyCardReview(reviews, card.dataset.cardId!, {
        card: { [field]: target.value } as Partial<StudyCardReview['card']>
      })
    })
    preview.addEventListener('click', event => {
      const target = event.target as HTMLElement
      const action = target.dataset.cardAction
      const card = target.closest<HTMLElement>('[data-card-id]')
      if (!card || (action !== 'accept' && action !== 'reject')) return
      reviews = updateStudyCardReview(reviews, card.dataset.cardId!, { status: action === 'accept' ? 'accepted' : 'rejected' })
      renderReview()
    })
    confirmSave.addEventListener('click', () => {
      const dialog = new StudyCardConfirmDialog()
      dialog.initialTitle = fileTitle(selectedFile?.name ?? 'Generated study cards')
      dialog.onConfirm = (title: string) => {
        const file = selectedFile
        const turtle = serializeStudyDeck(title, reviews, file?.name)
        const output = document.createElement('pre')
        output.className = 'questionnaire-result'
        output.textContent = turtle
        preview.prepend(output)
        status.textContent = 'Confirmation received. Saving accepted cards to your Pod…'
        confirmSave.disabled = true
        void findStorageContainer(me).then(storageUrl => {
          if (!storageUrl) throw new Error('Your Pod profile does not advertise a storage container.')
          return saveAcceptedStudyDeck(store, storageUrl, title, reviews, file?.name)
        }).then(document => {
          status.textContent = `Saved accepted cards to ${document.uri}`
        }).catch(error => {
          status.className = 'error'
          status.textContent = error instanceof Error ? error.message : 'Unable to save study cards.'
          confirmSave.disabled = false
        })
      }
      dialog.onClose = () => dialog.remove()
      document.body.appendChild(dialog)
    })
    generate.addEventListener('click', () => {
      const file = selectedFile
      if (!file) return
      generate.disabled = true
      extractedDocument = undefined
      reviews = []
      confirmSave.disabled = true
      syncReviewActions()
      status.textContent = 'Extracting document and generating cards…'
      status.className = 'info'
      preview.innerHTML = ''
      void (async () => {
        const client = new DocumentGenerationClient({ endpoint })
        extractedDocument = await client.extract(file)
        const result = await client.generateFlashcards(extractedDocument, Number(countSelect.value))
        reviews = createStudyCardReviews(result.cards)
        renderReview()
      })().catch(error => {
        status.className = 'error'
        status.textContent = error instanceof Error ? error.message : 'Unable to generate study cards.'
      }).finally(() => { generate.disabled = false })
    })
  }

  const setStatus = (text: string, kind: 'info' | 'error' = 'info'): void => {
    home.status = text
    home.statusKind = kind
  }

  home.addEventListener('questionaire-home-generate-cards', () => {
    const endpoint = getAppServicesEndpoint({
      dev: import.meta.env.DEV,
      appServicesEndpoint: import.meta.env.VITE_SOLID_APP_SERVICES_ENDPOINT,
      legacySidecarEndpoint: import.meta.env.VITE_QUIZ_SIDECAR_ENDPOINT
    })
    if (!endpoint) {
      setStatus('Configure the application-services endpoint to generate study cards.', 'error')
      return
    }
    renderDocumentGeneration(me, endpoint)
  })
  home.addEventListener('questionaire-home-open-english', event => {
    const practiceType = (event as CustomEvent<unknown>).detail === 'essay' ? 'essay' : 'paragraph'
    void renderEnglishPractice(me, practiceType).catch(error => {
      app.innerHTML = ''
      const message = document.createElement('p')
      message.setAttribute('role', 'alert')
      message.textContent = `Unable to open English practice: ${error instanceof Error ? error.message : String(error)}`
      app.appendChild(message)
    })
  })
  home.addEventListener('questionaire-home-open-pod', () => {
    void openStorageFileDialog(me).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : 'Unable to browse your Pod.', 'error')
    })
  })
  const openFriendChat = (conversationId = ''): void => {
    if (!friendChatClient) return
    if (friendChatDialog?.isConnected) {
      if (conversationId) void friendChatDialog.openConversation(conversationId)
      return
    }
    const dialog = document.createElement('questionaire-friend-chat-dialog') as FriendChatDialog
    dialog.client = friendChatClient
    dialog.friends = home.friends
    dialog.initialConversation = conversationId
    dialog.onNotify = async (conversation, kind) => {
      await sendChatInboxNotifications(store, me, conversation, kind)
    }
    dialog.onClose = () => {
      dialog.remove()
      friendChatDialog = undefined
    }
    friendChatDialog = dialog
    document.body.append(dialog)
  }
  home.addEventListener('questionaire-home-open-chat', () => openFriendChat())
  home.addEventListener('questionaire-home-refresh-inbox', refreshInbox)
  home.addEventListener('questionaire-home-mark-notification-read', event => {
    const uri = (event as CustomEvent<string>).detail
    if (!uri) return
    void markInboxNotificationRead(store, me, sym(uri)).then(() => {
      home.chatInboxNotifications = home.chatInboxNotifications.map(notification =>
        notification.uri === sym(uri).uri ? { ...notification, read: true } : notification)
      home.chatInboxUnread = Math.max(0, home.chatInboxUnread - 1)
      home.sharedEntries = home.sharedEntries.map(entry =>
        entry.notification?.uri === sym(uri).uri ? { ...entry, read: true } : entry)
      home.sharedStudyDecks = home.sharedStudyDecks.map(entry =>
        entry.notification.uri === sym(uri).uri ? { ...entry, read: true } : entry)
    }).catch(error => {
      const failure = error instanceof Error ? error.message : 'Unable to mark the inbox item as read.'
      home.chatInboxStatus = failure
      setStatus(failure, 'error')
    })
  })
  home.addEventListener('questionaire-home-open-chat-invitation', event => {
    const notification = (event as CustomEvent<{ conversationId?: string }>).detail
    openFriendChat(notification?.conversationId)
  })
  home.addEventListener('questionaire-home-open-study-deck', event => {
    const uri = (event as CustomEvent<string>).detail
    void renderStudyDeck(me, uri).catch(error => {
      setStatus(error instanceof Error ? error.message : 'Unable to open study cards.', 'error')
    })
  })
  home.addEventListener('questionaire-home-share-study-deck', event => {
    const uri = (event as CustomEvent<string>).detail
    if (!uri) return
    try {
      if (solidLogicSingleton.store !== store) {
        throw new Error('This host does not expose its access-control service to study cards.')
      }
      showDialog<QuestionnaireShareDialog>(QuestionnaireShareDialog, {
        props: { subjectUri: uri, store, resourceType: 'study-deck' }
      })
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to open study-card sharing.', 'error')
    }
  })
  home.addEventListener('questionaire-home-store-study-deck', event => {
    const entry = (event as CustomEvent<SharedStudyDeckEntry>).detail
    if (!entry) return
    void (async () => {
      workspaceUrl ||= await ensureQuestionnaireWorkspace(store, me)
      home.workspaceReady = true
      await storeSharedStudyDeck(store, me, workspaceUrl, entry)
      home.sharedStudyDecks = home.sharedStudyDecks.map(deck =>
        deck.uri === entry.uri ? { ...deck, stored: true } : deck)
      const storageUrl = await findStorageContainer(me)
      if (storageUrl) home.studyDecks = await loadStudyDecks(storageUrl, me, workspaceUrl)
      home.status = `${entry.title} is now in your study-card library.`
      home.statusKind = 'info'
    })().catch(error => {
      setStatus(error instanceof Error ? error.message : 'Unable to store shared study cards.', 'error')
    })
  })
  home.addEventListener('questionaire-home-resume-pokemon-choice', () => {
    void (async () => {
      const progress = home.pokemonProgress ?? await loadPokemonProgress(store, me)
      if (!progress?.pendingChoices.length) return
      const resumed = await resumeDeferredPokemonChoices(store, me)
      home.pokemonProgress = resumed
      await showPokemonLevelUp(store, me, resumed, updated => {
        home.pokemonProgress = updated
      })
    })().catch(error => {
      setStatus(error instanceof Error ? error.message : 'Unable to reopen your Pokémon choice.', 'error')
    })
  })

  setStatus('Preparing your Questionnaires workspace…')
  try {
    workspaceUrl = await findQuestionnaireWorkspace(store, me) ?? ''
    home.workspaceReady = Boolean(workspaceUrl)
  } catch (error) {
    workspaceUrl = ''
    home.workspaceReady = false
    setStatus(error instanceof Error ? error.message : 'Unable to prepare your Questionnaires workspace.', 'error')
  }
  void (async () => {
    const storageUrl = await findStorageContainer(me)
    if (storageUrl) home.studyDecks = await loadStudyDecks(storageUrl, me, workspaceUrl)
  })().catch(error => {
    home.status = error instanceof Error ? error.message : 'Unable to load saved or shared study cards.'
    home.statusKind = 'error'
  })
  try {
    statuses = await loadTypeIndexes(store, me)
    subjects = [...statuses.keys()].map(uri => sym(uri))
    // Show the home from the type-index results immediately. Individual
    // documents can hydrate their titles and metrics after the first paint.
    renderEntries()
    void Promise.all(subjects.map(async subject => {
      try {
        await store.fetcher?.load(subject.doc())
      } catch {
        // Keep a registered instance visible even if its document is currently unavailable.
      }
    })).then(() => { renderEntries() })
  } catch (error) {
    setStatus(`Could not load all type indexes: ${error instanceof Error ? error.message : 'unknown error'}`, 'error')
  }
  if (workspaceUrl) {
    try {
      const workspaceSubjects = await questionnairesInWorkspace(store, workspaceUrl)
      subjects = [...new Map([...subjects, ...workspaceSubjects].map(subject => [subject.uri, subject])).values()]
      if (home.statusKind !== 'error') setStatus('')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to load your Questionnaires workspace.', 'error')
    }
  }
  renderEntries()
  void Promise.all(home.entries.map(async entry => {
    try {
      const metrics = await loadQuestionnaireMetrics(store, entry.subject)
      const current = home.entries.find(candidate => candidate.subject.uri === entry.subject.uri)
      if (current) {
        current.questionCount = metrics.questionCount
        home.entries = [...home.entries]
      }
    } catch {
      // Keep the initially discovered entry visible when metric documents are unavailable.
    }
  }))
  home.publishedEntries = await ownPublishedQuestionnaires(store, subjects)
  let storedUris = new Set<string>()
  if (workspaceUrl) {
    try {
      storedUris = await loadStoredQuestionnaireUris(store, workspaceUrl)
      const savedSubjects = [...storedUris].map(uri => sym(uri))
      const savedResults = await Promise.all(savedSubjects.map(async subject => {
        try {
          if (!store.fetcher) throw new Error('No Pod fetcher is available.')
          await store.fetcher.load(subject.doc())
          return { subject }
        } catch (error) {
          return { error: `${subject.uri}: ${error instanceof Error ? error.message : 'Unable to load saved questionnaire.'}` }
        }
      }))
      const loadedSubjects = savedResults.flatMap(result => 'subject' in result && result.subject ? [result.subject] : [])
      home.savedEntries = entriesFromSubjects(store, loadedSubjects, new Map())
      const failedLoads = savedResults.filter(result => 'error' in result)
      if (failedLoads.length) {
        setStatus(`${failedLoads.length} saved questionnaire${failedLoads.length === 1 ? '' : 's'} could not be loaded: ${failedLoads.map(result => 'error' in result ? result.error : '').join('; ')}`, 'error')
      }
    } catch (error) {
      setStatus(`Unable to load saved questionnaires: ${error instanceof Error ? error.message : 'unknown error'}`, 'error')
    }
  }
  const migrationSenders = new Set([
    'https://sharonsolidosplayground.com/profile/card#me',
    'https://sharonsolidosplayground.com/sharon/profile/card#me'
  ])
  const migrationKey = `questionnaire-share-migration-resend:${me.uri}`
  if (migrationSenders.has(me.uri) && home.publishedEntries.length && localStorage.getItem(migrationKey) !== 'complete') {
    const migrationRecipients = [
      'https://sharonsolidosplayground.com/dimitri/profile/card#me',
      'https://sharonsolidosplayground.com/timmy/profile/card#me',
      'https://sharonsolidosplayground.com/marcus/profile/card#me'
    ].map(uri => sym(uri))
    void migrateQuestionnaireShareNotifications(store, me, migrationRecipients, home.publishedEntries, true).then(result => {
      if (!result.failed.length) localStorage.setItem(migrationKey, 'complete')
      if (result.failed.length) {
        home.status = `Share migration sent ${result.sent} notification${result.sent === 1 ? '' : 's'}; ${result.failed.length} failed.`
        home.statusKind = 'error'
      } else if (result.sent || result.skipped) {
        home.status = `Share migration checked ${result.sent + result.skipped} published share${result.sent + result.skipped === 1 ? '' : 's'}: ${result.sent} notification${result.sent === 1 ? '' : 's'} sent.`
        home.statusKind = 'info'
      }
    }).catch(error => {
      home.status = error instanceof Error ? `Share migration failed: ${error.message}` : 'Share migration failed.'
      home.statusKind = 'error'
    })
  }
  refreshInbox()
  void (async () => {
    try {
      const people = await solidLogicSingleton.directory.search({
        user: me,
        sources: ['contacts', 'friends'],
        maxFoafDistance: 1
      })
      const publicEntries = await discoverSharedQuestionnaires(store, people)
      const merged = new Map(home.sharedEntries.map(entry => [entry.subject.uri, entry]))
      publicEntries.forEach(entry => {
        const existing = merged.get(entry.subject.uri)
        merged.set(entry.subject.uri, existing
          ? {
              ...entry,
              stored: existing.stored,
              notification: existing.notification,
              notificationId: existing.notificationId,
              read: existing.read,
              unavailableReason: existing.unavailableReason
            }
          : entry)
      })
      home.sharedEntries = [...merged.values()]
    } catch {
      // Public discovery is optional; direct inbox shares remain visible.
    }
  })()
  void loadPokemonProgress(store, me).then(async progress => {
    home.pokemonProgress = progress
    if (progress) home.quizAverages = await quizAveragesFromProgress(store, progress.progressDocument)
    if (progress && home.isConnected && hasUndeferredPokemonChoice(progress)) {
      return showPokemonLevelUp(store, me, progress, updated => { home.pokemonProgress = updated })
    }
  }).catch(error => {
    home.status = error instanceof Error ? error.message : 'Unable to load Pokémon progress.'
    home.statusKind = 'error'
  })

  home.addEventListener('questionaire-home-create', () => {
    if (workspaceUrl) void renderContainerPicker(me, workspaceUrl).catch((error: unknown) => {
      message(error instanceof Error ? error.message : 'Unable to browse your Pod.', 'error')
    })
  })
  home.addEventListener('questionaire-home-open', (event) => {
    const subject = (event as CustomEvent<NamedNode>).detail
    if (subject?.uri) {
      const open = home.section === 'shared' ? openSharedSubject : openSubject
      void open(subject.uri).catch(error => message(error instanceof Error ? error.message : 'Unable to open questionnaire.', 'error'))
    }
  })
  home.addEventListener('questionaire-home-open-profile', () => {
    window.open(me.uri, '_blank', 'noopener,noreferrer')
  })
  home.addEventListener('questionaire-home-create-workspace', () => {
    home.status = 'Creating your Questionaire workspace…'
    home.statusKind = 'info'
    void ensureQuestionnaireWorkspace(store, me).then(createdUrl => {
      workspaceUrl = createdUrl
      home.workspaceReady = true
      home.workspaceCreated = true
      home.status = ''
      window.setTimeout(() => { home.workspaceCreated = false }, 4_000)
    }).catch(error => {
      home.status = error instanceof Error ? error.message : 'Unable to create your Questionaire workspace.'
      home.statusKind = 'error'
    })
  })
  home.addEventListener('questionaire-home-play-together', (event) => {
    const entry = (event as CustomEvent<{ subject: NamedNode, title: string, questionCount: number }>).detail
    if (!entry?.subject || !home.liveGameEndpoint) return
    renderLiveQuiz(me, entry, home.liveGameEndpoint)
  })
  home.addEventListener('questionaire-home-open-friends', () => {
    setStatus(home.friendCount
      ? `${home.friendCount} friend${home.friendCount === 1 ? '' : 's'} loaded from your profile.`
      : 'No outgoing foaf:knows friends were found in your profile.')
  })
  home.addEventListener('questionaire-home-search-friends', event => {
    const query = (event as CustomEvent<string>).detail?.trim() ?? ''
    home.friendSearchStatus = ''
    home.friendSearchResults = []
    if (!query) {
      home.friendSearchStatus = 'Enter a name or exact WebID URL.'
      return
    }
    const isWebId = /^https?:\/\//i.test(query)
    home.friendSearchStatus = isWebId ? 'Checking that WebID…' : 'Searching your contacts and friends…'
    const search = isWebId
      ? searchWebIds(store, query)
      : searchContactsAndFriends(solidLogicSingleton.directory, me, query)
    void search.then(results => {
      home.friendSearchResults = results
      home.friendSearchStatus = results.length
        ? `${results.length} result${results.length === 1 ? '' : 's'} found.`
        : isWebId
          ? 'No accessible WebID profile found.'
          : 'No matching contact or friend found. You can also enter their exact WebID URL.'
    }).catch(error => {
      home.friendSearchStatus = error instanceof Error ? error.message : 'Unable to search for that WebID.'
    })
  })
  home.addEventListener('questionaire-home-add-friend', event => {
    const uri = (event as CustomEvent<string>).detail
    home.friendSearchStatus = 'Saving the friend link to your profile…'
    void addFriend(store, me, uri).then(async () => {
      home.friends = await loadFriendSummaries(store, me)
      home.friendCount = home.friends.length
      setChatFriends(home.friends)
      home.friendSearchStatus = 'Friend added to your profile.'
    }).catch(error => {
      home.friendSearchStatus = error instanceof Error ? error.message : 'Unable to add this friend. Check that your profile is writable.'
    })
  })
  home.addEventListener('questionaire-home-scroll-top', () => {
    home.shadowRoot?.querySelector('.questionaire-home-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
  home.addEventListener('questionaire-home-scroll-files', () => {
    home.shadowRoot?.querySelector('.questionaire-home-files')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
  home.addEventListener('questionaire-home-store', (event) => {
    const entry = (event as CustomEvent<SharedQuestionnaireEntry>).detail
    if (!entry?.subject || !workspaceUrl) return
    void storeSharedQuestionnaire(store, me, workspaceUrl, entry).then(() => {
      home.sharedEntries = home.sharedEntries.map(candidate =>
        candidate.subject.uri === entry.subject.uri ? { ...candidate, stored: true } : candidate
      )
      if (!home.savedEntries.some(candidate => candidate.subject.uri === entry.subject.uri)) {
        home.savedEntries = [...home.savedEntries, entry]
      }
    }).catch(error => {
      message(error instanceof Error ? error.message : 'Unable to store this questionnaire.', 'error')
    })
  })
  home.addEventListener('questionaire-home-add-index', (event) => {
    const detail = (event as CustomEvent<{ subject: NamedNode, kind: keyof QuestionnaireIndexStatus }>).detail
    if (!detail?.subject) return
    void addToTypeIndex(store, me, detail.subject, detail.kind).then(() => {
      const current = statuses.get(detail.subject.uri) ?? { public: false, private: false }
      current[detail.kind] = true
      statuses.set(detail.subject.uri, current)
      renderEntries()
    }).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : `Unable to update the ${detail.kind} type index.`, 'error')
    })
  })
  home.addEventListener('questionaire-home-search', () => {
    setStatus('Searching your Pod for questionnaires…')
    const roots = (store.each(me, pim('storage')) as NamedNode[])
      .filter(term => term.termType === 'NamedNode')
      .map(term => term.uri)
    void crawlQuestionnaireContainers(roots, async url => {
      const container = sym(url)
      await store.fetcher!.load(container.doc())
      const children = (store.each(container, ldp('contains')) as NamedNode[])
        .filter(term => term.termType === 'NamedNode' && term.uri.endsWith('/'))
        .map(term => term.uri)
      const subject = sym(`${url}index.ttl#this`)
      try {
        await store.fetcher!.load(subject.doc())
        return { children, questionnaire: store.holds(subject, ns.rdf('type'), questionnaireClass, subject.doc()) ? subject : undefined }
      } catch {
        return { children }
      }
    }, subject => {
      if (!subjects.some(existing => existing.uri === subject.uri)) {
        subjects.push(subject)
        renderEntries()
      }
    }).then(result => {
      setStatus(result.warnings.length
        ? `Search checked ${result.scanned} containers with partial results. ${result.warnings.slice(0, 3).join(' ')}`
        : `Search checked ${result.scanned} containers.`, result.warnings.length ? 'error' : 'info')
    }).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : 'Unable to search your Pod.', 'error')
    })
  })
}

function ensurePageHeaderProvider (): void {
  const header = document.querySelector<HTMLElement>('#PageHeader')
  if (!header || header.querySelector('solid-ui-provider')) return
  header.innerHTML = `
    <div class="page-header-inner">
      <a class="page-brand" href="/" aria-label="Solid home">S</a>
      <div class="page-header-spacer"></div>
      <a class="page-header-register" href="${accountRegistrationUrl}" hidden
        target="_blank" rel="noopener noreferrer">Sign up</a>
      <button class="page-header-icon" type="button" aria-label="Bookmarks">♡</button>
      <solid-ui-provider><solid-ui-account></solid-ui-account></solid-ui-provider>
    </div>
  `
}

function updatePageHeaderRegistrationLink (loggedIn = Boolean(authn.currentUser())): void {
  const registrationLink = document.querySelector<HTMLElement>('#PageHeader .page-header-register')
  if (registrationLink) registrationLink.hidden = loggedIn
}

async function start (): Promise<void> {
  ensurePageHeaderProvider()
  rememberLoginReturnUrl()
  await checkUserWithoutBlockingStartup()
  updatePageHeaderRegistrationLink()
  restoreLoginReturnUrl()
  const contract = parseStandaloneUrl(window.location.href)
  if (contract.subject) {
    await openSubject(contract.subject)
    return
  }
  if (contract.baseUrl) {
    const me = authn.currentUser()
    if (!me) {
      renderWelcome()
      return
    }
    await createQuestionnaire(contract.baseUrl, me)
    return
  }
  const me = authn.currentUser()
  if (!me) {
    renderWelcome()
    return
  }
  await renderLibrary(me)
}

// Keep the requested URL intact while allowing the login flow to resume the
// create route after the identity provider redirects back to this app.
authSession.events.on('login', () => {
  updatePageHeaderRegistrationLink(true)
  void start()
})
authSession.events.on('logout', () => {
  updatePageHeaderRegistrationLink(false)
  unsubscribeChatHome?.()
  unsubscribeChatHome = undefined
  friendChatClient?.disconnect()
  friendChatClient = undefined
  friendChatDialog?.remove()
  friendChatDialog = undefined
})

void start().catch((error: unknown) => {
  message(error instanceof Error ? error.message : 'Unable to load questionnaire.', 'error')
})
