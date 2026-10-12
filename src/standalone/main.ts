import { authn, authSession, store as solidStore } from 'solid-logic'
import { literal, Namespace, sym, type NamedNode, type Store } from 'rdflib'
import { ns } from 'solid-ui'
import 'solid-ui/components/account'
import 'solid-ui/components/provider'
import 'solid-ui/theme.css'
import { questionairePredicates } from '../service/questionairePredicates'
import questionairePane from '../index'
import '../components/provider/QuestionaireProvider'
import '../components/create/questionaire-pane-create-main-view/QuestionairePaneCreateMainView'
import '../components/take/questionaire-pane-take-main-view/QuestionairePaneTakeMainView'
import '../questionairePane.css'
import './standalone.css'
import { isHttpUrl, parseStandaloneUrl } from './url'
import {
  addToTypeIndex,
  crawlQuestionnaireContainers,
  ensureQuestionnaireWorkspace,
  entriesFromSubjects,
  loadTypeIndexes,
  questionnaireClass,
  questionnairesInWorkspace,
  type QuestionnaireIndexStatus
} from './library'

const store = solidStore as Store
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

function isPublished (subject: NamedNode): boolean {
  const type = store.any(subject, questionairePredicates.question.rdfType)
  return Boolean(
    (type?.equals(questionairePredicates.questionnaire.quizType) || type?.equals(questionairePredicates.questionnaire.surveyType)) &&
    store.holds(subject, questionairePredicates.questionnaire.status, literal('Published'))
  )
}

function renderQuestionnaire (subject: NamedNode): void {
  app.innerHTML = ''
  const provider = document.createElement('questionaire-provider') as HTMLElement & { store?: Store, subject?: NamedNode }
  provider.store = store
  provider.subject = subject
  app.appendChild(provider)
  provider.appendChild(document.createElement(isPublished(subject)
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
  app.innerHTML = ''

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
  app.appendChild(section)

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
  cancel.addEventListener('click', () => { void start() })
  await refresh()
}

async function openSubject (uri: string): Promise<void> {
  if (!isHttpUrl(uri)) throw new Error('The subject must be an HTTP(S) URL.')
  const subject = sym(uri)
  if (!store.fetcher) throw new Error('Unable to load questionnaire: no Solid fetcher is available.')
  await store.fetcher.load(subject.doc())
  renderQuestionnaire(subject)
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

function indexLabel (indexes: QuestionnaireIndexStatus): string {
  if (indexes.public && indexes.private) return 'Public and private type indexes'
  if (indexes.public) return 'Public type index'
  if (indexes.private) return 'Private type index'
  return 'Not registered in a type index'
}

async function renderLibrary (me: NamedNode): Promise<void> {
  app.innerHTML = ''
  const section = document.createElement('section')
  section.className = 'questionnaire-library'
  section.innerHTML = '<h1>My Questionnaires</h1><p>Questionnaires saved in your dedicated <strong>Questionnaires</strong> workspace appear here automatically.</p>'
  const workspace = document.createElement('p')
  workspace.className = 'container-location'
  const status = document.createElement('p')
  status.className = 'info'
  const actions = document.createElement('div')
  actions.className = 'container-controls'
  const create = document.createElement('button')
  create.type = 'button'
  create.className = 'primary'
  create.textContent = 'Create questionnaire'
  const search = document.createElement('button')
  search.type = 'button'
  search.textContent = 'Search my Pod'
  const results = document.createElement('ul')
  results.className = 'questionnaire-results'
  actions.append(create, search)
  section.append(workspace, actions, status, results)
  app.appendChild(section)

  let workspaceUrl: string
  let subjects: NamedNode[] = []
  let statuses = new Map<string, QuestionnaireIndexStatus>()
  const renderEntries = (): void => {
    results.innerHTML = ''
    const entries = entriesFromSubjects(store, subjects, statuses)
    if (!entries.length) {
      const empty = document.createElement('li')
      empty.className = 'empty-results'
      empty.textContent = 'No questionnaires found yet. Create one here or search your Pod.'
      results.appendChild(empty)
      return
    }
    for (const entry of entries) {
      const item = document.createElement('li')
      item.className = 'questionnaire-result'
      const open = document.createElement('button')
      open.type = 'button'
      open.className = 'questionnaire-open'
      open.textContent = entry.title
      open.addEventListener('click', () => { void openSubject(entry.subject.uri).catch(error => message(error instanceof Error ? error.message : 'Unable to open questionnaire.', 'error')) })
      const meta = document.createElement('p')
      meta.textContent = indexLabel(entry.indexes)
      const registrations = document.createElement('div')
      registrations.className = 'registration-controls'
      for (const [kind, label] of [['public', 'Add to public index'], ['private', 'Add to private index']] as const) {
        const add = document.createElement('button')
        add.type = 'button'
        add.textContent = label
        add.disabled = entry.indexes[kind]
        add.addEventListener('click', () => {
          add.disabled = true
          void addToTypeIndex(store, me, entry.subject, kind).then(() => {
            const current = statuses.get(entry.subject.uri) ?? { public: false, private: false }
            current[kind] = true
            statuses.set(entry.subject.uri, current)
            renderEntries()
          }).catch((error: unknown) => {
            add.disabled = false
            status.className = 'error'
            status.textContent = error instanceof Error ? error.message : `Unable to update the ${kind} type index.`
          })
        })
        registrations.appendChild(add)
      }
      const both = document.createElement('button')
      both.type = 'button'
      both.textContent = 'Add to both indexes'
      both.disabled = entry.indexes.public && entry.indexes.private
      both.addEventListener('click', () => {
        both.disabled = true
        Promise.all((['public', 'private'] as const).filter(kind => !entry.indexes[kind]).map(kind => addToTypeIndex(store, me, entry.subject, kind)))
          .then(() => {
            statuses.set(entry.subject.uri, { public: true, private: true })
            renderEntries()
          })
          .catch((error: unknown) => {
            both.disabled = false
            status.className = 'error'
            status.textContent = error instanceof Error ? error.message : 'Unable to update both type indexes.'
          })
      })
      registrations.appendChild(both)
      item.append(open, meta, registrations)
      results.appendChild(item)
    }
  }

  status.textContent = 'Preparing your Questionnaires workspace…'
  try {
    workspaceUrl = await ensureQuestionnaireWorkspace(store, me)
    workspace.textContent = `Workspace: ${workspaceUrl}`
  } catch (error) {
    workspaceUrl = ''
    workspace.textContent = 'Questionnaires workspace could not be prepared.'
    status.className = 'error'
    status.textContent = error instanceof Error ? error.message : 'Unable to prepare your Questionnaires workspace.'
    create.disabled = true
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
    status.className = 'error'
    status.textContent = `Could not load all type indexes: ${error instanceof Error ? error.message : 'unknown error'}`
  }
  if (workspaceUrl) {
    try {
      const workspaceSubjects = await questionnairesInWorkspace(store, workspaceUrl)
      subjects = [...new Map([...subjects, ...workspaceSubjects].map(subject => [subject.uri, subject])).values()]
      if (status.className !== 'error') {
        const indexedOnly = subjects.length - workspaceSubjects.length
        status.textContent = subjects.length
          ? `${workspaceSubjects.length} in your workspace${indexedOnly ? ` and ${indexedOnly} from your type indexes` : ''}.`
          : 'Your workspace is ready.'
      }
    } catch (error) {
      status.className = 'error'
      status.textContent = error instanceof Error ? error.message : 'Unable to load your Questionnaires workspace.'
    }
  }
  renderEntries()

  create.addEventListener('click', () => {
    if (workspaceUrl) void renderContainerPicker(me, workspaceUrl).catch((error: unknown) => {
      message(error instanceof Error ? error.message : 'Unable to browse your Pod.', 'error')
    })
  })
  search.addEventListener('click', () => {
    search.disabled = true
    status.className = 'info'
    status.textContent = 'Searching your Pod for questionnaires…'
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
      search.disabled = false
      status.className = result.warnings.length ? 'error' : 'info'
      status.textContent = result.warnings.length
        ? `Search checked ${result.scanned} containers with partial results. ${result.warnings.slice(0, 3).join(' ')}`
        : `Search checked ${result.scanned} containers.`
    }).catch((error: unknown) => {
      search.disabled = false
      status.className = 'error'
      status.textContent = error instanceof Error ? error.message : 'Unable to search your Pod.'
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
