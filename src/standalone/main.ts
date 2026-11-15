import { authn, authSession, solidLogicSingleton, store as solidStore } from 'solid-logic'
import { Namespace, sym, type LiveStore, type NamedNode } from 'rdflib'
import { ns } from 'solid-ui'
import 'solid-ui/components/account'
import 'solid-ui/components/provider'
import 'solid-ui/theme.css'
import questionairePane from '../index'
import { configureQuizAiService } from '../service/quizAiService'
import { DocumentGenerationClient } from '../service/documentGenerationClient'
import { createStudyCardReviews, duplicateStudyCardReviewIds, summarizeStudyCardReviews, updateStudyCardReview, type StudyCardReview } from '../service/studyCardReview'
import { serializeStudyDeck } from '../service/studyCardRdf'
import { saveAcceptedStudyDeck } from '../service/studyDeckPersistence'
import { serializeSolidMemoDeck } from '../service/solidMemoAdapter'
import { getAppServicesEndpoint } from './quizSidecarConfig'
import '../components/provider/QuestionaireProvider'
import '../components/create/main-view/MainView'
import '../components/take/main-view/MainView'
import '../components/standalone/questionaire-home/QuestionaireHome'
import '../components/standalone/live-quiz/LiveQuiz'
import '../questionairePane.css'
import './standalone.css'
import { isHttpUrl, parseStandaloneUrl } from './url'
import { replaceViewWithRestorableContent } from './viewNavigation'
import {
  addToTypeIndex,
  crawlQuestionnaireContainers,
  discoverInboxSharedQuestionnaires,
  ensureQuestionnaireWorkspace,
  entriesFromSubjects,
  discoverSharedQuestionnaires,
  isPublishedQuestionnaire,
  loadQuestionnaireMetrics,
  loadStoredQuestionnaireUris,
  loadTypeIndexes,
  ownPublishedQuestionnaires,
  publishedQuestionnaireForTake,
  questionnaireClass,
  questionnairesInWorkspace,
  storeSharedQuestionnaire,
  type QuestionnaireIndexStatus,
  type SharedQuestionnaireEntry
} from './library'
import { createContainerIfMissing } from '../service/types'
import PodQuestionnaireDialog from './PodQuestionnaireDialog'

declare global {
  interface Window {
    SolidLogic?: {
      authSession: typeof authSession
    }
  }
}

const store = solidStore as LiveStore
const app = document.querySelector<HTMLElement>('#app')!
const loginReturnUrlKey = 'questionaire-pane:login-return-url'
const authRestoreTimeoutMs = 10_000

window.SolidLogic = { authSession }

function configureLocalLoginIssuer (): void {
  if (window.location.hostname !== 'localhost' || window.location.port !== '4200') return

  const configuredIssuer = import.meta.env.VITE_LOGIN_ISSUER?.trim() || 'http://localhost:3100'
  const currentIssuer = window.localStorage.getItem('loginIssuer')

  if (!currentIssuer || currentIssuer === window.location.origin) {
    window.localStorage.setItem('loginIssuer', configuredIssuer)
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

configureLocalLoginIssuer()
configureQuizSidecar()

function message (text: string, kind: 'info' | 'error' = 'info'): void {
  app.innerHTML = ''
  const element = document.createElement(kind === 'error' ? 'p' : 'p')
  element.className = kind
  element.textContent = text
  app.appendChild(element)
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
  document.querySelector<HTMLElement>('#PageHeader')?.removeAttribute('hidden')
  app.classList.remove('app-home')
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
  back.textContent = 'Back to questionnaires'
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

async function renderLibrary (me: NamedNode): Promise<void> {
  document.querySelector<HTMLElement>('#PageHeader')?.setAttribute('hidden', '')
  app.classList.add('app-home')
  app.innerHTML = ''
  const home = document.createElement('questionaire-home') as HTMLElement & {
    entries: ReturnType<typeof entriesFromSubjects>
    publishedEntries: Awaited<ReturnType<typeof ownPublishedQuestionnaires>>
    sharedEntries: Awaited<ReturnType<typeof discoverSharedQuestionnaires>>
    section: 'mine' | 'shared'
    workspaceReady: boolean
    status: string
    statusKind: 'info' | 'error'
    liveGameEndpoint: string
  }
  app.appendChild(home)
  home.liveGameEndpoint = import.meta.env.VITE_QUIZ_GAME_ENDPOINT?.trim() || ''
  home.addEventListener('questionaire-home-choose', () => {
    void openQuestionnaireDialog(me).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : 'Unable to search your Pod.', 'error')
    })
  })

  let workspaceUrl = ''
  let subjects: NamedNode[] = []
  let statuses = new Map<string, QuestionnaireIndexStatus>()
  const renderEntries = (): void => {
    home.entries = entriesFromSubjects(store, subjects, statuses)
  }

  function renderDocumentGeneration (me: NamedNode, endpoint: string): void {
    const section = document.createElement('section')
    section.className = 'questionnaire-create'
    section.innerHTML = '<h1>Generate study cards</h1><p>Select a document to preview cards before anything is saved to your Pod.</p>'
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,.docx,.md,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain'
    const generate = document.createElement('button')
    generate.type = 'button'
    generate.className = 'primary'
    generate.textContent = 'Generate preview'
    generate.disabled = true
    const back = document.createElement('button')
    back.type = 'button'
    back.textContent = 'Back to questionnaires'
    const confirmSave = document.createElement('button')
    confirmSave.type = 'button'
    confirmSave.textContent = 'Confirm accepted cards'
    confirmSave.disabled = true
    const exportMemo = document.createElement('button')
    exportMemo.type = 'button'
    exportMemo.textContent = 'Export Solid Memo RDF'
    exportMemo.disabled = true
    const status = document.createElement('p')
    status.className = 'info'
    const preview = document.createElement('div')
    let reviews: StudyCardReview[] = []
    section.append(input, document.createElement('br'), generate, back, confirmSave, exportMemo, status, preview)
    app.innerHTML = ''
    app.classList.add('app-home')
    app.appendChild(section)
    input.addEventListener('change', () => {
      generate.disabled = !input.files?.length
      status.textContent = input.files?.[0]?.name ?? ''
    })
    back.addEventListener('click', () => { void renderLibrary(me) })
    const renderReview = (): void => {
      const summary = summarizeStudyCardReviews(reviews)
      const duplicateIds = duplicateStudyCardReviewIds(reviews)
      status.textContent = `${summary.accepted} accepted · ${summary.pending} pending · ${summary.rejected} rejected.${duplicateIds.size ? ` ${duplicateIds.size} duplicate card${duplicateIds.size === 1 ? '' : 's'} detected; review before saving.` : ''} Nothing has been saved.`
      confirmSave.disabled = summary.accepted === 0
      exportMemo.disabled = summary.accepted === 0
      preview.innerHTML = reviews.map((review, index) =>
        `<article class="questionnaire-result" data-card-id="${review.id}">
          <strong>Card ${index + 1} · ${review.status}${duplicateIds.has(review.id) ? ' · duplicate' : ''}</strong>
          <label>Front <input data-card-field="front" value="${escapeHtml(review.card.front)}"></label>
          <label>Back <input data-card-field="back" value="${escapeHtml(review.card.back)}"></label>
          <small>Source: ${escapeHtml(review.card.sourceReference)}</small>
          <div class="registration-controls">
            <button type="button" data-card-action="accept">${review.status === 'accepted' ? 'Accepted' : 'Accept'}</button>
            <button type="button" data-card-action="reject">${review.status === 'rejected' ? 'Rejected' : 'Reject'}</button>
          </div>
        </article>`
      ).join('')
    }
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
      if (!window.confirm('Save the accepted study cards to your Pod? This will create a new study deck.')) return
      const file = input.files?.[0]
      const title = file?.name ?? 'Generated study cards'
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
    })
    exportMemo.addEventListener('click', () => {
      const file = input.files?.[0]
      const output = document.createElement('pre')
      output.className = 'questionnaire-result'
      output.textContent = serializeSolidMemoDeck(file?.name ?? 'Generated study cards', reviews)
      preview.prepend(output)
      status.textContent = 'Solid Memo RDF export preview is ready. No additional Pod write was performed.'
    })
    generate.addEventListener('click', () => {
      const file = input.files?.[0]
      if (!file) return
      generate.disabled = true
      status.textContent = 'Extracting document and generating cards…'
      preview.innerHTML = ''
      void (async () => {
        const client = new DocumentGenerationClient({ endpoint })
        const document = await client.extract(file)
        const result = await client.generateFlashcards(document)
        reviews = createStudyCardReviews(result.cards)
        renderReview()
      })().catch(error => {
        status.className = 'error'
        status.textContent = error instanceof Error ? error.message : 'Unable to generate study cards.'
      }).finally(() => { generate.disabled = false })
    })
  }

  function escapeHtml (value: string): string {
    return value.replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', [String.fromCharCode(34)]: '&quot;', [String.fromCharCode(39)]: '&#39;'
    })[character]!)
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

  setStatus('Preparing your Questionnaires workspace…')
  try {
    workspaceUrl = await ensureQuestionnaireWorkspace(store, me)
    home.workspaceReady = true
  } catch (error) {
    workspaceUrl = ''
    home.workspaceReady = false
    setStatus(error instanceof Error ? error.message : 'Unable to prepare your Questionnaires workspace.', 'error')
  }
  try {
    statuses = await loadTypeIndexes(store, me)
    subjects = [...statuses.keys()].map(uri => sym(uri))
    await Promise.all(subjects.map(async subject => {
      try {
        await store.fetcher?.load(subject.doc())
      } catch {
        // Keep a registered instance visible even if its document is currently unavailable.
      }
    }))
  } catch (error) {
    setStatus(`Could not load all type indexes: ${error instanceof Error ? error.message : 'unknown error'}`, 'error')
  }
  if (workspaceUrl) {
    try {
      const workspaceSubjects = await questionnairesInWorkspace(store, workspaceUrl)
      subjects = [...new Map([...subjects, ...workspaceSubjects].map(subject => [subject.uri, subject])).values()]
      if (home.statusKind !== 'error') {
        const indexedOnly = subjects.length - workspaceSubjects.length
        setStatus(subjects.length
          ? `${workspaceSubjects.length} in your workspace${indexedOnly ? ` and ${indexedOnly} from your type indexes` : ''}.`
          : 'Your workspace is ready.')
      }
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
  try {
    home.sharedEntries = await discoverInboxSharedQuestionnaires(store, me)
    const storedUris = workspaceUrl ? await loadStoredQuestionnaireUris(store, workspaceUrl) : new Set<string>()
    home.sharedEntries = home.sharedEntries.map(entry => ({
      ...entry,
      stored: storedUris.has(entry.subject.uri)
    }))
  } catch {
    home.sharedEntries = []
  }
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
        merged.set(entry.subject.uri, existing ? { ...entry, stored: existing.stored, notification: existing.notification } : entry)
      })
      home.sharedEntries = [...merged.values()]
    } catch {
      // Public discovery is optional; direct inbox shares remain visible.
    }
  })()

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
  home.addEventListener('questionaire-home-play-together', (event) => {
    const entry = (event as CustomEvent<{ subject: NamedNode, title: string, questionCount: number }>).detail
    if (!entry?.subject || !home.liveGameEndpoint) return
    renderLiveQuiz(me, entry, home.liveGameEndpoint)
  })
  home.addEventListener('questionaire-home-store', (event) => {
    const entry = (event as CustomEvent<SharedQuestionnaireEntry>).detail
    if (!entry?.subject || !workspaceUrl) return
    void storeSharedQuestionnaire(store, me, workspaceUrl, entry).then(() => {
      home.sharedEntries = home.sharedEntries.map(candidate =>
        candidate.subject.uri === entry.subject.uri ? { ...candidate, stored: true } : candidate
      )
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
  home.addEventListener('questionaire-home-open-pod', () => {
    void findStorageContainer(me).then(storageUrl => {
      if (!storageUrl) throw new Error('Your Pod profile does not advertise a storage container.')
      return renderContainerPicker(me, storageUrl)
    }).catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : 'Unable to browse your Pod.', 'error')
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

async function start (): Promise<void> {
  const header = document.querySelector<HTMLElement>('#PageHeader')
  if (header && !header.querySelector('solid-ui-provider')) {
    header.innerHTML = `
      <div class="page-header-inner">
        <a class="page-brand" href="/" aria-label="Solid home">S</a>
        <div class="page-header-spacer"></div>
        <button class="page-header-icon" type="button" aria-label="Bookmarks">♡</button>
        <solid-ui-provider><solid-ui-account></solid-ui-account></solid-ui-provider>
      </div>
    `
  }
  rememberLoginReturnUrl()
  await checkUserWithoutBlockingStartup()
  restoreLoginReturnUrl()
  const contract = parseStandaloneUrl(window.location.href)
  if (contract.subject) {
    await openSubject(contract.subject)
    return
  }
  if (contract.baseUrl) {
    const me = authn.currentUser()
    if (!me) {
      message('Sign in to create a questionnaire. You can still open a published questionnaire with ?subject=…')
      return
    }
    await createQuestionnaire(contract.baseUrl, me)
    return
  }
  const me = authn.currentUser()
  if (!me) {
    message('Open a questionnaire with ?subject=<index.ttl URL>, or sign in to create one.')
    return
  }
  await renderLibrary(me)
}

// Keep the requested URL intact while allowing the login flow to resume the
// create route after the identity provider redirects back to this app.
authSession.events.on('login', () => { void start() })

void start().catch((error: unknown) => {
  message(error instanceof Error ? error.message : 'Unable to load questionnaire.', 'error')
})
