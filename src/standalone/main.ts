import { authn, authSession, store as solidStore } from 'solid-logic'
import { initHeader } from 'solid-ui'
import { literal, sym, type NamedNode, type Store } from 'rdflib'
import { createQuestionaireLogic } from '../service/questionaireLogic'
import { questionairePredicates } from '../service/questionairePredicates'
import '../components/provider/QuestionaireProvider'
import '../components/create/questionaire-pane-create-main-view/QuestionairePaneCreateMainView'
import '../components/take/questionaire-pane-take-main-view/QuestionairePaneTakeMainView'
import '../questionairePane.css'
import './standalone.css'
import { isHttpUrl, parseStandaloneUrl } from './url'

const store = solidStore as Store
const app = document.querySelector<HTMLElement>('#app')!

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

async function openSubject (uri: string): Promise<void> {
  if (!isHttpUrl(uri)) throw new Error('The subject must be an HTTP(S) URL.')
  const subject = sym(uri)
  if (!store.fetcher) throw new Error('Unable to load questionnaire: no Solid fetcher is available.')
  await store.fetcher.load(subject.doc())
  renderQuestionnaire(subject)
}

async function createQuestionnaire (baseUrl: string, me: NamedNode): Promise<void> {
  if (!isHttpUrl(baseUrl)) throw new Error('The base URL must be an HTTP(S) Pod container URL.')
  const structure = await createQuestionaireLogic(store).createQuestionnaireStructure({
    baseUrl,
    title: 'Untitled Questionaire',
    author: me,
    created: new Date()
  })
  renderQuestionnaire(structure.index)
}

async function start (): Promise<void> {
  await initHeader(store, [], { logo: 'https://solidproject.org/assets/img/solid-emblem.svg' })
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
  message('Open a questionnaire with ?subject=<index.ttl URL>, or sign in and provide ?base=<Pod container URL>.')
  authSession.events.on('login', () => { void start() })
}

void start().catch((error: unknown) => {
  message(error instanceof Error ? error.message : 'Unable to load questionnaire.', 'error')
})
