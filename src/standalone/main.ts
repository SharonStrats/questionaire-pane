import { authn, authSession, solidLogicSingleton, store as solidStore } from 'solid-logic'
import { Namespace, sym, type LiveStore, type NamedNode } from 'rdflib'
import { ns } from 'solid-ui'
import 'solid-ui/components/account'
import 'solid-ui/components/provider'
import 'solid-ui/theme.css'
import questionairePane from '../index'
import '../components/provider/QuestionaireProvider'
import '../components/create/questionaire-pane-create-main-view/QuestionairePaneCreateMainView'
import '../components/take/questionaire-pane-take-main-view/QuestionairePaneTakeMainView'
import '../components/standalone/questionaire-home/QuestionaireHome'
import '../questionairePane.css'
import './standalone.css'
import { isHttpUrl, parseStandaloneUrl } from './url'
import { replaceViewWithRestorableContent } from './viewNavigation'
import {
  addToTypeIndex,
  crawlQuestionnaireContainers,
  ensureQuestionnaireWorkspace,
  entriesFromSubjects,
  discoverSharedQuestionnaires,
  isPublishedQuestionnaire,
  loadTypeIndexes,
  ownPublishedQuestionnaires,
  publishedQuestionnaireForTake,
  questionnaireClass,
  questionnairesInWorkspace,
  type QuestionnaireIndexStatus
} from './library'

const store = solidStore as LiveStore
const app = document.querySelector<HTMLElement>('#app')!
const loginReturnUrlKey = 'questionaire-pane:login-return-url'

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

function message (text: string, kind: 'info' | 'error' = 'info'): void {
  app.innerHTML = ''
  const element = document.createElement(kind === 'error' ? 'p' : 'p')
  element.className = kind
  element.textContent = text
  app.appendChild(element)
}

function renderQuestionnaire (subject: NamedNode): void {
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
  const cancel = document.createElement('button')
  cancel.type = 'button'
  cancel.textContent = 'Cancel'
  controls.append(back, choose, cancel)
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

async function renderLibrary (me: NamedNode): Promise<void> {
  app.innerHTML = ''
  const home = document.createElement('questionaire-home') as HTMLElement & {
    entries: ReturnType<typeof entriesFromSubjects>
    publishedEntries: Awaited<ReturnType<typeof ownPublishedQuestionnaires>>
    sharedEntries: Awaited<ReturnType<typeof discoverSharedQuestionnaires>>
    section: 'mine' | 'shared'
    workspaceReady: boolean
    status: string
    statusKind: 'info' | 'error'
  }
  app.appendChild(home)

  let workspaceUrl = ''
  let subjects: NamedNode[] = []
  let statuses = new Map<string, QuestionnaireIndexStatus>()
  const renderEntries = (): void => {
    home.entries = entriesFromSubjects(store, subjects, statuses)
  }

  const setStatus = (text: string, kind: 'info' | 'error' = 'info'): void => {
    home.status = text
    home.statusKind = kind
  }

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
  home.publishedEntries = await ownPublishedQuestionnaires(store, subjects)
  try {
    const people = await solidLogicSingleton.directory.search({
      user: me,
      sources: ['contacts', 'friends'],
      maxFoafDistance: 1
    })
    home.sharedEntries = await discoverSharedQuestionnaires(store, people)
  } catch {
    // Shared questionnaires are optional: keep the personal library usable if discovery fails.
    home.sharedEntries = []
  }

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
    header.innerHTML = '<solid-ui-provider><solid-ui-account></solid-ui-account></solid-ui-provider>'
  }
  rememberLoginReturnUrl()
  await authn.checkUser()
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
