import { Namespace, literal, st, sym, type LiveStore, type NamedNode } from 'rdflib'
import { disco } from '../namespaces'
import { createContainerIfMissing, createDocumentIfMissing } from '../service/types'
import { questionairePredicates } from '../service/predicates'
import { loadQuestionaireQuestionSummaries } from '../service/questionQueries'
import { createNotificationId, isInboxNotificationRead } from '../service/inboxNotifications'

const pim = Namespace('http://www.w3.org/ns/pim/space#')
const solid = Namespace('http://www.w3.org/ns/solid/terms#')
const space = Namespace('http://www.w3.org/ns/pim/space#')
const dct = Namespace('http://purl.org/dc/terms/')
const rdfs = Namespace('http://www.w3.org/2000/01/rdf-schema#')
const ldp = Namespace('http://www.w3.org/ns/ldp#')
const rdf = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#')
const schema = Namespace('https://schema.org/')
const quiz = Namespace('https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#')

export interface QuestionnaireIndexStatus {
  public: boolean
  private: boolean
}

export interface QuestionnaireEntry {
  subject: NamedNode
  title: string
  description: string
  kind: 'quiz' | 'survey'
  questionCount: number
  indexes: QuestionnaireIndexStatus
}

export interface SharedQuestionnaireEntry extends QuestionnaireEntry {
  notification?: NamedNode
  notificationId?: string
  read?: boolean
  unavailableReason?: string
  stored?: boolean
  sharedBy: {
    uri: string
    label: string
  }
}

export interface SharedStudyDeckEntry {
  uri: string
  title: string
  cardCount: number
  notification: NamedNode
  notificationId?: string
  read?: boolean
  unavailableReason?: string
  stored?: boolean
  sharedBy: {
    uri: string
    label: string
  }
}

export interface KnownPerson {
  kind: 'person' | 'group'
  uri: string
  label: string
}

export interface CrawlResult {
  subjects: NamedNode[]
  warnings: string[]
  scanned: number
}

export const questionnaireClass = disco('Questionnaire')

function trailingSlash (url: string): string {
  return url.endsWith('/') ? url : `${url}/`
}

function namedNodes (terms: unknown[]): NamedNode[] {
  return terms.filter(term => (term as { termType?: string }).termType === 'NamedNode') as NamedNode[]
}

function labelFor (store: LiveStore, subject: NamedNode): string {
  const title = store.any(subject, schema('name'))
  if (title?.termType === 'Literal') return title.value
  const path = new URL(subject.doc().uri).pathname.split('/').filter(Boolean)
  return decodeURIComponent(path[path.length - 2] ?? subject.doc().uri)
}

async function load (store: LiveStore, resource: NamedNode): Promise<void> {
  if (!store.fetcher) throw new Error('No Solid fetcher is available.')
  await store.fetcher.load(resource.doc())
}

export async function loadTypeIndexes (store: LiveStore, me: NamedNode): Promise<Map<string, QuestionnaireIndexStatus>> {
  await load(store, me)
  const result = new Map<string, QuestionnaireIndexStatus>()
  const indexSources: Array<[NamedNode, keyof QuestionnaireIndexStatus]> = []
  for (const [predicate, kind] of [
    [solid('publicTypeIndex'), 'public'],
    [solid('privateTypeIndex'), 'private']
  ] as const) {
    for (const index of namedNodes(store.each(me, predicate))) {
      indexSources.push([index, kind])
    }
  }

  await Promise.all(indexSources.map(async ([index, kind]) => {
    await load(store, index)
    const registrations = store.each(undefined, solid('forClass'), questionnaireClass, index.doc()) as any[]
    for (const registration of registrations) {
      if (!store.holds(registration, rdf('type'), solid('TypeRegistration'), index.doc())) continue
      for (const instance of namedNodes(store.each(registration, solid('instance'), undefined, index.doc()))) {
        const status = result.get(instance.uri) ?? { public: false, private: false }
        status[kind] = true
        result.set(instance.uri, status)
      }
    }
  }))
  return result
}

export async function discoverSharedQuestionnaires (
  store: LiveStore,
  people: Iterable<KnownPerson>
): Promise<SharedQuestionnaireEntry[]> {
  const registrations = new Map<string, KnownPerson>()
  const visitedPeople = new Set<string>()

  for (const person of people) {
    if (person.kind !== 'person' || visitedPeople.has(person.uri)) continue
    visitedPeople.add(person.uri)

    const profile = sym(person.uri)
    try {
      await load(store, profile)
      const publicIndexes = namedNodes(store.each(profile, solid('publicTypeIndex'), undefined, profile.doc()))
      for (const index of publicIndexes) {
        await load(store, index)
        const indexDocument = index.doc()
        const typeRegistrations = (store.each(undefined, solid('forClass'), questionnaireClass, indexDocument) as NamedNode[])
          .filter(registration => store.holds(registration, rdf('type'), solid('TypeRegistration'), indexDocument))
        for (const registration of typeRegistrations) {
          for (const subject of namedNodes(store.each(registration, solid('instance'), undefined, indexDocument))) {
            if (!registrations.has(subject.uri)) registrations.set(subject.uri, person)
          }

        }
      }
    } catch {
      // A known person's public data may be unavailable without preventing other discoveries.
    }
  }

  const subjects = [...registrations.keys()].map(uri => sym(uri))
  await Promise.all(subjects.map(async subject => {
    try {
      await load(store, subject)
    } catch {
      // Keep a public registration available to open even if its document cannot be read yet.
    }
  }))

  return entriesFromSubjects(store, subjects, new Map()).map(entry => ({
    ...entry,
    sharedBy: {
      uri: registrations.get(entry.subject.uri)!.uri,
      label: registrations.get(entry.subject.uri)!.label
    }
  }))
}

export async function discoverInboxSharedQuestionnaires (
  store: LiveStore,
  me: NamedNode
): Promise<SharedQuestionnaireEntry[]> {
  await load(store, me)
  const inbox = store.any(me, ldp('inbox')) as NamedNode | undefined
  if (inbox?.termType !== 'NamedNode' || !store.fetcher) return []

  await load(store, inbox)
  const notifications = namedNodes(store.each(inbox, ldp('contains'), undefined, inbox.doc()))
  const entries = new Map<string, { entry: SharedQuestionnaireEntry, created: string }>()
  for (const notification of notifications) {
    try {
      await load(store, notification)
      if (!store.holds(notification, rdf('type'), quiz('QuestionnaireShare'), notification.doc())) continue
      const subject = store.any(notification, quiz('sharedQuestionnaire'), undefined, notification.doc())
      if (subject?.termType !== 'NamedNode') continue
      const questionnaireSubject = subject as NamedNode
      let publishedSubject = questionnaireSubject
      let unavailableReason: string | undefined
      try {
        await load(store, questionnaireSubject)
        publishedSubject = await publishedQuestionnaireForTake(store, questionnaireSubject)
      } catch {
        unavailableReason = 'This shared questionnaire is no longer available. Ask the sender to reshare it.'
      }
      const creator = store.any(notification, quiz('sharedBy'), undefined, notification.doc())
      const questionnaire = entriesFromSubjects(store, [publishedSubject], new Map())[0] ?? {
        subject: publishedSubject,
        title: store.anyValue(notification, dct('title'), undefined, notification.doc()) ?? 'Shared questionnaire',
        description: '',
        kind: 'quiz' as const,
        questionCount: 0,
        indexes: { public: false, private: false }
      }
      const creatorNode = creator?.termType === 'NamedNode' ? creator as NamedNode : undefined
      const entry = {
        ...questionnaire,
        notification,
        notificationId: store.anyValue(notification, quiz('notificationId'), undefined, notification.doc()) ?? notification.uri,
        read: isInboxNotificationRead(store, notification),
        unavailableReason,
        sharedBy: {
          uri: creatorNode?.uri ?? '',
          label: creatorNode ? labelFor(store, creatorNode) : 'Someone'
        }
      }
      const created = store.anyValue(notification, dct('created'), undefined, notification.doc()) ?? ''
      const existing = entries.get(entry.subject.uri)
      if (!existing || created > existing.created) {
        entries.set(entry.subject.uri, { entry, created })
      }
    } catch {
      // Ignore malformed or unavailable inbox items without hiding other shares.
    }
  }
  return [...entries.values()].map(({ entry }) => entry)
}

export async function storeSharedQuestionnaire (
  store: LiveStore,
  me: NamedNode,
  workspaceUrl: string,
  entry: SharedQuestionnaireEntry
): Promise<void> {
  const registry = sym(`${trailingSlash(workspaceUrl)}learning-library.ttl`)
  const registryDoc = registry.doc()
  await createDocumentIfMissing(store, registryDoc, `
@prefix dct: <http://purl.org/dc/terms/> .
@prefix quiz: <https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
<#this> a quiz:LearningLibrary ;
    dct:creator <${me.uri}> .
`)
  await load(store, registry)
  const existing = namedNodes(store.each(undefined, quiz('sharedQuestionnaire'), entry.subject, registryDoc))
  if (existing.length) return

  const item = sym(`${registryDoc.uri}#saved-${encodeURIComponent(entry.subject.uri).replace(/%/g, '')}`)
  const statements = [
    st(item, rdf('type'), quiz('SavedQuestionnaire'), registryDoc),
    st(item, quiz('sharedQuestionnaire'), entry.subject, registryDoc),
    st(item, dct('created'), literal(new Date().toISOString()), registryDoc)
  ]
  if (entry.notification) statements.push(st(item, quiz('sourceNotification'), entry.notification, registryDoc))
  if (!store.updater) throw new Error('Unable to store this questionnaire: no Pod updater is available.')
  await store.updater.update([], statements)
}

async function loadStoredUris (
  store: LiveStore,
  registryUrl: string,
  predicateName: string
): Promise<Set<string>> {
  const registry = sym(registryUrl)
  const predicate = quiz(predicateName)
  try {
    await load(store, registry)
  } catch (error) {
    const failure = error as { status?: number, response?: { status?: number } }
    if (failure.status === 404 || failure.response?.status === 404) return new Set()
    throw error
  }
  return new Set(
    store.statementsMatching(undefined, predicate, undefined, registry.doc())
      .flatMap(statement => statement.object.termType === 'NamedNode' ? [statement.object.uri] : [])
  )
}

export async function loadStoredQuestionnaireUris (
  store: LiveStore,
  workspaceUrl: string
): Promise<Set<string>> {
  const root = trailingSlash(workspaceUrl)
  const [legacy, library] = await Promise.all([
    loadStoredUris(store, `${root}shared-questionnaires.ttl`, 'sharedQuestionnaire'),
    loadStoredUris(store, `${root}learning-library.ttl`, 'sharedQuestionnaire')
  ])
  return new Set([...legacy, ...library])
}

export async function loadStoredStudyDeckUris (
  store: LiveStore,
  workspaceUrl: string
): Promise<Set<string>> {
  return loadStoredUris(
    store,
    `${trailingSlash(workspaceUrl)}learning-library.ttl`,
    'sharedStudyDeck'
  )
}

export async function storeSharedStudyDeck (
  store: LiveStore,
  me: NamedNode,
  workspaceUrl: string,
  entry: SharedStudyDeckEntry
): Promise<void> {
  const registry = sym(`${trailingSlash(workspaceUrl)}learning-library.ttl`)
  const registryDoc = registry.doc()
  await createDocumentIfMissing(store, registryDoc, `
@prefix dct: <http://purl.org/dc/terms/> .
@prefix quiz: <https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
<#this> a quiz:LearningLibrary ;
    dct:creator <${me.uri}> .
`)
  await load(store, registry)
  const deck = sym(entry.uri)
  if (store.each(undefined, quiz('sharedStudyDeck'), deck, registryDoc).length) return
  const item = sym(`${registryDoc.uri}#saved-${encodeURIComponent(entry.uri).replace(/%/g, '')}`)
  if (!store.updater) throw new Error('Unable to store this study deck: no Pod updater is available.')
  await store.updater.update([], [
    st(item, rdf('type'), quiz('SavedStudyDeck'), registryDoc),
    st(item, quiz('sharedStudyDeck'), deck, registryDoc),
    st(item, dct('created'), literal(new Date().toISOString()), registryDoc)
  ])
}

export async function discoverInboxSharedStudyDecks (
  store: LiveStore,
  me: NamedNode
): Promise<SharedStudyDeckEntry[]> {
  await load(store, me)
  const inbox = store.any(me, ldp('inbox')) as NamedNode | undefined
  if (inbox?.termType !== 'NamedNode' || !store.fetcher) return []
  await load(store, inbox)
  const notifications = namedNodes(store.each(inbox, ldp('contains'), undefined, inbox.doc()))
  const entries = new Map<string, { entry: SharedStudyDeckEntry, created: string }>()
  for (const notification of notifications) {
    try {
      await load(store, notification)
      if (!store.holds(notification, rdf('type'), quiz('StudyDeckShare'), notification.doc())) continue
      const target = store.any(notification, quiz('sharedStudyDeck'), undefined, notification.doc())
      if (target?.termType !== 'NamedNode') continue
      const deck = target as NamedNode
      let unavailableReason: string | undefined
      try {
        await load(store, deck)
      } catch {
        unavailableReason = 'These study cards are no longer available. Ask the sender to reshare them.'
      }
      const creator = store.any(notification, quiz('sharedBy'), undefined, notification.doc())
      const creatorNode = creator?.termType === 'NamedNode' ? creator as NamedNode : undefined
      const entry: SharedStudyDeckEntry = {
        uri: deck.uri,
        title: store.anyValue(sym(`${deck.uri}#deck`), quiz('name'), undefined, deck.doc()) ??
          store.anyValue(notification, dct('title'), undefined, notification.doc()) ?? 'Study cards',
        cardCount: unavailableReason ? 0 : store.each(sym(`${deck.uri}#deck`), quiz('studyCard'), undefined, deck.doc()).length,
        notification,
        notificationId: store.anyValue(notification, quiz('notificationId'), undefined, notification.doc()) ?? notification.uri,
        read: isInboxNotificationRead(store, notification),
        unavailableReason,
        sharedBy: {
          uri: creatorNode?.uri ?? '',
          label: creatorNode ? labelFor(store, creatorNode) : 'Someone'
        }
      }
      const created = store.anyValue(notification, dct('created'), undefined, notification.doc()) ?? ''
      const previous = entries.get(deck.uri)
      if (!previous || created > previous.created) entries.set(deck.uri, { entry, created })
    } catch {
      // Ignore unavailable or malformed inbox items without hiding other shares.
    }
  }
  return [...entries.values()].map(({ entry }) => entry)
}

export async function sendQuestionnaireShareNotification (
  store: LiveStore,
  sender: NamedNode,
  recipient: NamedNode,
  questionnaire: NamedNode
): Promise<void> {
  if (!store.fetcher) throw new Error('Unable to notify the recipient: no Solid fetcher is available.')
  await load(store, recipient)
  const inbox = store.any(recipient, ldp('inbox')) as NamedNode | undefined
  if (inbox?.termType !== 'NamedNode') {
    throw new Error('The recipient profile does not advertise an inbox.')
  }

  const notification = `
@prefix dct: <http://purl.org/dc/terms/> .
@prefix quiz: <https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
<> a quiz:QuestionnaireShare ;
    quiz:sharedQuestionnaire <${questionnaire.uri}> ;
    quiz:sharedBy <${sender.uri}> ;
    quiz:notificationId "${createNotificationId()}" ;
    quiz:notificationVersion 1 ;
    quiz:read false ;
    dct:created "${new Date().toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
`
  const response = await store.fetcher.webOperation('POST', inbox.uri, {
    data: notification,
    contentType: 'text/turtle'
  })
  if (!response.ok) throw new Error(`Unable to send questionnaire notification: HTTP ${response.status}`)
}

export async function sendStudyDeckShareNotification (
  store: LiveStore,
  sender: NamedNode,
  recipient: NamedNode,
  deck: NamedNode
): Promise<void> {
  if (!store.fetcher) throw new Error('Unable to notify the recipient: no Solid fetcher is available.')
  await load(store, recipient)
  const inbox = store.any(recipient, ldp('inbox')) as NamedNode | undefined
  if (inbox?.termType !== 'NamedNode') throw new Error('The recipient profile does not advertise an inbox.')
  const response = await store.fetcher.webOperation('POST', inbox.uri, {
    data: `
@prefix dct: <http://purl.org/dc/terms/> .
@prefix quiz: <https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
<> a quiz:StudyDeckShare ;
    quiz:sharedStudyDeck <${deck.uri}> ;
    quiz:sharedBy <${sender.uri}> ;
    quiz:notificationId "${createNotificationId()}" ;
    quiz:notificationVersion 1 ;
    quiz:read false ;
    dct:created "${new Date().toISOString()}"^^<http://www.w3.org/2001/XMLSchema#dateTime> .
`,
    contentType: 'text/turtle'
  })
  if (!response.ok) throw new Error(`Unable to send study-card notification: HTTP ${response.status}`)
}

async function hasQuestionnaireShareNotification (
  store: LiveStore,
  recipient: NamedNode,
  sender: NamedNode,
  questionnaire: NamedNode
): Promise<boolean> {
  await load(store, recipient)
  const inbox = store.any(recipient, ldp('inbox')) as NamedNode | undefined
  if (inbox?.termType !== 'NamedNode') return false
  await load(store, inbox)
  const notifications = namedNodes(store.each(inbox, ldp('contains'), undefined, inbox.doc()))
  for (const notification of notifications) {
    try {
      await load(store, notification)
    } catch {
      continue
    }
    if (store.holds(notification, rdf('type'), quiz('QuestionnaireShare'), notification.doc()) &&
      store.holds(notification, quiz('sharedQuestionnaire'), questionnaire, notification.doc()) &&
      store.holds(notification, quiz('sharedBy'), sender, notification.doc())) return true
  }
  return false
}

export async function migrateQuestionnaireShareNotifications (
  store: LiveStore,
  sender: NamedNode,
  recipients: NamedNode[],
  publishedQuestionnaires: QuestionnaireEntry[],
  forceResend = false
): Promise<{ sent: number, skipped: number, failed: string[] }> {
  const result = { sent: 0, skipped: 0, failed: [] as string[] }
  for (const recipient of recipients) {
    for (const entry of publishedQuestionnaires) {
      try {
        if (!forceResend && await hasQuestionnaireShareNotification(store, recipient, sender, entry.subject)) {
          result.skipped += 1
          continue
        }
        await sendQuestionnaireShareNotification(store, sender, recipient, entry.subject)
        result.sent += 1
      } catch (error) {
        result.failed.push(`${recipient.uri} / ${entry.title}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  }
  return result
}

export function isPublishedQuestionnaire (store: LiveStore, subject: NamedNode): boolean {
  const type = store.any(subject, rdf('type'))
  return Boolean(
    (type?.equals(questionairePredicates.questionnaire.quizType) || type?.equals(questionairePredicates.questionnaire.surveyType)) &&
    store.holds(subject, questionairePredicates.questionnaire.status, literal('Published'))
  )
}

export async function publishedQuestionnaireForTake (store: LiveStore, subject: NamedNode): Promise<NamedNode> {
  if (isPublishedQuestionnaire(store, subject)) return subject

  const versions = namedNodes(store.each(subject, dct('hasVersion'), undefined, subject.doc()))
  await Promise.all(versions.map(async version => {
    try {
      await load(store, version)
    } catch {
      // Continue looking for another public version.
    }
  }))
  const publishedVersions = versions.filter(version => isPublishedQuestionnaire(store, version))
  if (!publishedVersions.length) {
    throw new Error('This shared questionnaire does not advertise a published version.')
  }
  return publishedVersions.sort((left, right) => {
    return publishedDate(store, right).localeCompare(publishedDate(store, left))
  })[0]
}

export async function ownPublishedQuestionnaires (
  store: LiveStore,
  subjects: Iterable<NamedNode>
): Promise<QuestionnaireEntry[]> {
  const published = new Map<string, NamedNode>()
  for (const subject of subjects) {
    try {
      const version = await publishedQuestionnaireForTake(store, subject)
      const parent = (store.each(undefined, dct('hasVersion'), version) as NamedNode[])
        .find(candidate => candidate.termType === 'NamedNode')
      const key = parent?.uri ?? version.uri
      const existing = published.get(key)
      if (!existing || publishedDate(store, version) > publishedDate(store, existing)) {
        published.set(key, version)
      }
    } catch {
      // Drafts and unavailable questionnaires do not belong in the Take library.
    }
  }
  return entriesFromSubjects(store, published.values(), new Map())
}

function publishedDate (store: LiveStore, subject: NamedNode): string {
  return store.anyValue(subject, dct('created'), undefined, subject.doc()) ?? ''
}

export async function addToTypeIndex (
  store: LiveStore,
  me: NamedNode,
  subject: NamedNode,
  kind: keyof QuestionnaireIndexStatus
): Promise<void> {
  await load(store, me)
  const index = store.any(me, solid(`${kind}TypeIndex`)) as NamedNode | undefined
  if (!index || index.termType !== 'NamedNode') {
    throw new Error(`Your profile does not advertise a ${kind} type index.`)
  }
  if (!store.fetcher || !store.updater) throw new Error('Your Solid session cannot update a type index.')
  await load(store, index)

  const existing = store.each(undefined, solid('forClass'), questionnaireClass, index.doc())
    .find(registration =>
      store.holds(registration, rdf('type'), solid('TypeRegistration'), index.doc()) &&
      store.holds(registration, solid('instance'), subject, index.doc()))
  if (existing) return

  const fragment = `questionnaire-${encodeURIComponent(subject.doc().uri).replace(/%/g, '')}`
  const registration = sym(`${index.doc().uri}#${fragment}`)
  const insertions = [
    st(registration, rdf('type'), solid('TypeRegistration'), index.doc()),
    st(registration, solid('forClass'), questionnaireClass, index.doc()),
    st(registration, solid('instance'), subject, index.doc())
  ].filter(statement => !store.holds(statement.subject, statement.predicate, statement.object, statement.why))
  if (insertions.length) await store.updater.update([], insertions)
}

export async function findQuestionnaireWorkspace (store: LiveStore, me: NamedNode): Promise<string | undefined> {
  await load(store, me)
  const preferences = store.any(me, pim('preferencesFile')) as NamedNode | undefined
  if (preferences?.termType === 'NamedNode') {
    await load(store, preferences)
    const existing = (store.each(me, space('workspace'), undefined, preferences.doc()) as any[])
      .find(workspace => {
        const prefix = store.any(workspace, space('uriPrefix'), undefined, preferences.doc()) as NamedNode | undefined
        const title = store.any(workspace, dct('title'), undefined, preferences.doc()) ?? store.any(workspace, rdfs('label'), undefined, preferences.doc())
        return (prefix?.termType === 'NamedNode' && /\/questionnaires\/?$/i.test(prefix.uri)) ||
          (title?.termType === 'Literal' && title.value.toLowerCase() === 'questionnaires')
      })
    const existingPrefix = existing && store.any(existing, space('uriPrefix'), undefined, preferences.doc()) as NamedNode | undefined
    if (existingPrefix?.termType === 'NamedNode') return trailingSlash(existingPrefix.uri)
  }
  return undefined
}

export async function ensureQuestionnaireWorkspace (store: LiveStore, me: NamedNode): Promise<string> {
  const existing = await findQuestionnaireWorkspace(store, me)
  if (existing) return existing
  await load(store, me)
  const preferences = store.any(me, pim('preferencesFile')) as NamedNode | undefined

  const storage = store.any(me, pim('storage')) as NamedNode | undefined
  if (!storage || storage.termType !== 'NamedNode') throw new Error('Your Pod profile does not advertise a storage container.')
  const container = `${trailingSlash(storage.uri)}Questionnaires/`
  await createContainerIfMissing(store, container)

  if (preferences?.termType === 'NamedNode' && store.updater) {
    const workspace = sym(`${preferences.doc().uri}#questionnaires-workspace`)
    const insertions = [
      st(me, space('workspace'), workspace, preferences.doc()),
      st(workspace, rdf('type'), space('Workspace'), preferences.doc()),
      st(workspace, space('uriPrefix'), sym(container), preferences.doc()),
      st(workspace, dct('title'), literal('Questionnaires'), preferences.doc())
    ].filter(statement => !store.holds(statement.subject, statement.predicate, statement.object, statement.why))
    if (insertions.length) await store.updater.update([], insertions)
  }
  return container
}

export async function questionnairesInWorkspace (store: LiveStore, workspaceUrl: string): Promise<NamedNode[]> {
  const container = sym(trailingSlash(workspaceUrl))
  await load(store, container)
  const children = namedNodes(store.each(container, ldp('contains')))
  const candidates = [
    sym(`${container.uri}index.ttl#this`),
    ...children
      .filter(term => term.uri.endsWith('/'))
      .map(folder => sym(`${folder.uri}index.ttl#this`)),
    ...children
      .filter(term => /\/index\.ttl$/.test(term.uri))
      .map(index => sym(`${index.uri}#this`))
  ]
  const candidatesByUri = new Map(candidates.map(candidate => [candidate.uri, candidate]))
  const questionnaires: NamedNode[] = []
  await Promise.all(Array.from(candidatesByUri.values()).map(async subject => {
    try {
      await load(store, subject)
      if (store.holds(subject, rdf('type'), questionnaireClass, subject.doc())) questionnaires.push(subject)
    } catch {
      // A workspace may hold arbitrary folders; they are not questionnaire packages.
    }
  }))
  const uniqueQuestionnaires = new Map(questionnaires.map(subject => [subject.uri, subject]))
  questionnaires.splice(0, questionnaires.length, ...uniqueQuestionnaires.values())
  const found = new Set(uniqueQuestionnaires.keys())
  const crawl = await crawlQuestionnaireContainers(
    [container.uri],
    async url => {
      const nestedContainer = sym(trailingSlash(url))
      await load(store, nestedContainer)
      const nestedChildren = namedNodes(store.each(nestedContainer, ldp('contains')))
        .filter(term => term.uri.endsWith('/'))
        .map(term => term.uri)
      const subject = sym(`${nestedContainer.uri}index.ttl#this`)
      try {
        await load(store, subject)
        return {
          children: nestedChildren,
          questionnaire: store.holds(subject, rdf('type'), questionnaireClass, subject.doc()) ? subject : undefined
        }
      } catch {
        return { children: nestedChildren }
      }
    },
    subject => {
      if (!found.has(subject.uri)) {
        found.add(subject.uri)
        questionnaires.push(subject)
      }
    },
    { maxContainers: 100, concurrency: 8, timeoutMs: 2_000 }
  )
  if (crawl.warnings.length && questionnaires.length === 0) {
    return []
  }
  return questionnaires
}

export function entriesFromSubjects (
  store: LiveStore,
  subjects: Iterable<NamedNode>,
  statuses: Map<string, QuestionnaireIndexStatus>
): QuestionnaireEntry[] {
  const unique = new Map<string, NamedNode>()
  for (const subject of subjects) unique.set(subject.uri, subject)
  return [...unique.values()].map(subject => ({
    subject,
    title: labelFor(store, subject),
    description: store.any(subject, dct('description'))?.value ?? '',
    kind: store.holds(subject, rdf('type'), schema('Quiz'), subject.doc()) ? 'quiz' as const : 'survey' as const,
    questionCount: store.each(subject, disco('question')).length,
    indexes: statuses.get(subject.uri) ?? { public: false, private: false }
  })).sort((left, right) => left.title.localeCompare(right.title))
}

export async function loadQuestionnaireMetrics (
  store: LiveStore,
  subject: NamedNode
): Promise<{ questionCount: number }> {
  const questions = await loadQuestionaireQuestionSummaries(store, subject)
  return { questionCount: questions.length }
}

export async function crawlQuestionnaireContainers (
  roots: string[],
  readContainer: (url: string) => Promise<{ children: string[], questionnaire?: NamedNode }>,
  onFound: (subject: NamedNode) => void,
  options: { maxContainers?: number, concurrency?: number, timeoutMs?: number } = {}
): Promise<CrawlResult> {
  const maxContainers = options.maxContainers ?? 200
  const concurrency = options.concurrency ?? 4
  const timeoutMs = options.timeoutMs ?? 12_000
  const queued = new Set(roots.map(trailingSlash))
  const queue = [...queued]
  const visited = new Set<string>()
  const found = new Map<string, NamedNode>()
  const warnings: string[] = []

  const withTimeout = async <T>(work: Promise<T>): Promise<T> => await Promise.race([
    work,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Timed out')), timeoutMs))
  ])

  const worker = async (): Promise<void> => {
    while (true) {
      const url = queue.shift()
      if (!url) return
      if (visited.has(url)) continue
      if (visited.size >= maxContainers) {
        warnings.push(`Stopped after ${maxContainers} containers; results may be incomplete.`)
        return
      }
      visited.add(url)
      try {
        const result = await withTimeout(readContainer(url))
        if (result.questionnaire && !found.has(result.questionnaire.uri)) {
          found.set(result.questionnaire.uri, result.questionnaire)
          onFound(result.questionnaire)
        }
        for (const child of result.children) {
          const normalized = trailingSlash(child)
          if (!visited.has(normalized) && !queued.has(normalized)) {
            queued.add(normalized)
            queue.push(normalized)
          }
        }
      } catch (error) {
        warnings.push(`${url}: ${error instanceof Error ? error.message : 'could not be read'}`)
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return { subjects: [...found.values()], warnings, scanned: visited.size }
}
