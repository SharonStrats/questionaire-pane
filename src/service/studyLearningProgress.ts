import { graph, literal, Namespace, serialize, sym, type LiveStore, type NamedNode } from 'rdflib'
import { createContainerIfMissing, ensureTrailingSlash } from './types'

const quiz = Namespace('https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#')
const dct = Namespace('http://purl.org/dc/terms/')
const rdf = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#')
const day = 24 * 60 * 60 * 1000

export type StudyCardOutcome = 'correct' | 'incorrect' | 'revealed'
export type StudySessionMode = 'all' | 'new' | 'needs-practice'
export interface StudySessionOptions { mode: StudySessionMode, count: number }

export interface StudyCardLearningState {
  correct: number
  incorrect: number
  revealed: number
  streak: number
  lastOutcome: StudyCardOutcome
  lastReviewed: string
  dueAt: string
}

export interface StudyLearningProgress {
  userUri: string
  storageUrl: string
  deckUri: string
  progressDocument: NamedNode
  cards: Record<string, StudyCardLearningState>
}

export interface StudyDeckMetrics {
  score?: number
  completedCardCount: number
}

export function studyDeckMetrics (
  progress: StudyLearningProgress,
  deckCardUris: readonly string[]
): StudyDeckMetrics {
  const cards = [...new Set(deckCardUris)]
  const reviewed = cards.flatMap(uri => progress.cards[uri] ? [progress.cards[uri]] : [])
  return {
    score: cards.length
      ? Math.round(reviewed.filter(card => card.lastOutcome === 'correct').length / cards.length * 100)
      : undefined,
    completedCardCount: reviewed.length
  }
}

function httpUri (uri: string): string {
  const url = new URL(uri)
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Study progress requires absolute HTTP(S) resource URIs.')
  }
  return url.href
}

function validDate (date: Date): number {
  const time = date.getTime()
  if (!Number.isFinite(time)) throw new Error('Study review time must be a valid date.')
  return time
}

async function digest (value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}

async function locationFor (user: NamedNode, storageUrl: string, deckUri: string): Promise<StudyLearningProgress> {
  if (!user || user.termType !== 'NamedNode') throw new Error('Sign in before loading study progress.')
  const userUri = httpUri(user.uri)
  const storage = new URL(httpUri(storageUrl))
  if (storage.hash || storage.search) throw new Error('Use the signed-in user’s Pod storage root for study progress.')
  const deck = httpUri(deckUri)
  const [userId, deckId] = await Promise.all([digest(userUri), digest(deck)])
  const root = ensureTrailingSlash(storage.href)
  return {
    userUri, deckUri: deck, storageUrl: root, cards: {},
    progressDocument: sym(`${root}study-progress/${userId}/${deckId}.ttl`)
  }
}

function statusOf (error: unknown): number | undefined {
  const failure = error as { status?: number, response?: { status?: number } }
  return failure?.response?.status ?? failure?.status
}

function requiredValue (store: LiveStore, subject: NamedNode, name: string, document: NamedNode): string {
  const values = store.each(subject, quiz(name), undefined, document)
  if (values.length !== 1) throw new Error(`Invalid study progress: expected one ${name}.`)
  return values[0].value
}

function readCard (store: LiveStore, subject: NamedNode, document: NamedNode): StudyCardLearningState {
  const count = (name: string): number => {
    const value = requiredValue(store, subject, name, document)
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`Invalid study progress counter: ${name}.`)
    return Number(value)
  }
  const lastOutcome = requiredValue(store, subject, 'lastOutcome', document) as StudyCardOutcome
  if (!['correct', 'incorrect', 'revealed'].includes(lastOutcome)) throw new Error('Invalid study answer outcome.')
  const lastReviewed = requiredValue(store, subject, 'lastReviewed', document)
  const dueAt = requiredValue(store, subject, 'dueAt', document)
  if (![lastReviewed, dueAt].every(value => Number.isFinite(Date.parse(value)))) throw new Error('Invalid study progress review dates.')
  return {
    correct: count('correct'), incorrect: count('incorrect'), revealed: count('revealed'),
    streak: count('streak'), lastOutcome, lastReviewed, dueAt
  }
}

async function loadDocument (store: LiveStore, location: StudyLearningProgress): Promise<{
  progress: StudyLearningProgress, exists: boolean, etag?: string
}> {
  const fetcher = store.fetcher
  if (!fetcher) throw new Error('Missing fetcher on study progress store.')
  const document = location.progressDocument
  let etag: string | undefined
  try {
    // Force a fresh document before read/modify/write, not rdflib's cached graph.
    const response = await fetcher.load(document, { force: true, clearPreviousData: true })
    etag = response.headers?.get('etag') ?? undefined
  } catch (error) {
    if (statusOf(error) === 404) return { progress: { ...location, cards: {} }, exists: false }
    throw new Error(`Unable to load study progress at ${document.uri}: ${error instanceof Error ? error.message : String(error)}`)
  }
  const root = sym(`${document.uri}#progress`)
  const creator = store.each(root, dct('creator'), undefined, document)
  if (creator.length !== 1 || creator[0].value !== location.userUri ||
      requiredValue(store, root, 'deck', document) !== location.deckUri) {
    throw new Error('Study progress belongs to a different user or deck.')
  }
  const cards: StudyLearningProgress['cards'] = {}
  for (const subject of store.each(root, quiz('cardProgress'), undefined, document)) {
    if (subject.termType !== 'NamedNode') throw new Error('Invalid study card progress resource.')
    const cardUri = requiredValue(store, subject as NamedNode, 'card', document)
    if (httpUri(cardUri) !== cardUri || cards[cardUri]) throw new Error('Invalid or duplicate study card URI.')
    cards[cardUri] = readCard(store, subject as NamedNode, document)
  }
  return { progress: { ...location, cards }, exists: true, etag }
}

/** storageUrl must be the signed-in user's own Pod root, never the deck owner's root. */
export async function loadStudyLearningProgress (
  store: LiveStore, user: NamedNode, storageUrl: string, deckUri: string
): Promise<StudyLearningProgress> {
  return (await loadDocument(store, await locationFor(user, storageUrl, deckUri))).progress
}

function needsPractice (entry: StudyCardLearningState, time: number): boolean {
  return entry.lastOutcome !== 'correct' || Date.parse(entry.dueAt) <= time
}

/** Keeps saved card URIs and payloads intact; repeated URIs are selected only once. */
export function selectStudySession<T extends { uri: string }> (
  cards: readonly T[], progress: StudyLearningProgress, options: StudySessionOptions, now = new Date()
): T[] {
  const time = validDate(now)
  if (!Number.isSafeInteger(options.count) || options.count < 1) throw new Error('Choose a positive whole number of study cards.')
  if (!['all', 'new', 'needs-practice'].includes(options.mode)) throw new Error('Unknown study session mode.')
  const unique = new Map<string, T>()
  for (const card of cards) {
    if (httpUri(card.uri) !== card.uri) throw new Error('Use the saved RDF URI for each study card.')
    if (!unique.has(card.uri)) unique.set(card.uri, card)
  }
  const rank = (card: T): number => {
    const entry = progress.cards[card.uri]
    if (!entry) return 0
    if (entry.lastOutcome !== 'correct') return 1
    return needsPractice(entry, time) ? 2 : 3
  }
  return [...unique.values()]
    .filter(card => options.mode === 'all' ||
      (options.mode === 'new' ? !progress.cards[card.uri] : Boolean(progress.cards[card.uri] && needsPractice(progress.cards[card.uri], time))))
    .sort((left, right) => {
      const priority = rank(left) - rank(right)
      if (priority) return priority
      const a = progress.cards[left.uri]
      const b = progress.cards[right.uri]
      return a && b ? Date.parse(a.dueAt) - Date.parse(b.dueAt) : 0
    })
    .slice(0, options.count)
}

const writes = new WeakMap<LiveStore, Map<string, Promise<unknown>>>()

/** Record one final outcome per answer. Revealing is not an additional incorrect answer. */
export async function recordStudyCardOutcome (
  store: LiveStore, progress: StudyLearningProgress, cardUri: string, outcome: StudyCardOutcome, now = new Date()
): Promise<StudyLearningProgress> {
  const time = validDate(now)
  if (!['correct', 'incorrect', 'revealed'].includes(outcome)) throw new Error('Invalid study answer outcome.')
  if (httpUri(cardUri) !== cardUri) throw new Error('Use the saved RDF URI for the study card.')
  const location = await locationFor(sym(progress.userUri), progress.storageUrl, progress.deckUri)
  if (location.progressDocument.uri !== progress.progressDocument.uri) throw new Error('Invalid study progress document location.')
  let queue = writes.get(store)
  if (!queue) {
    queue = new Map()
    writes.set(store, queue)
  }
  const previous = queue.get(location.progressDocument.uri) ?? Promise.resolve()
  const operation = previous.catch(() => undefined).then(async () => {
    const loaded = await loadDocument(store, location)
    if (loaded.exists && !loaded.etag) throw new Error('The Pod did not provide an ETag; study progress cannot safely be updated.')
    const before = loaded.progress.cards[cardUri]
    if (before && time < Date.parse(before.lastReviewed)) throw new Error('Study review time precedes the last saved review.')
    const streak = outcome === 'correct' ? (before?.streak ?? 0) + 1 : 0
    const interval = outcome === 'correct' ? [1, 3, 7, 14, 30][Math.min(streak - 1, 4)] * day : 10 * 60 * 1000
    const updated: StudyLearningProgress = {
      ...loaded.progress,
      cards: {
        ...loaded.progress.cards,
        [cardUri]: {
          correct: (before?.correct ?? 0) + Number(outcome === 'correct'),
          incorrect: (before?.incorrect ?? 0) + Number(outcome === 'incorrect'),
          revealed: (before?.revealed ?? 0) + Number(outcome === 'revealed'),
          streak, lastOutcome: outcome, lastReviewed: now.toISOString(), dueAt: new Date(time + interval).toISOString()
        }
      }
    }
    const document = location.progressDocument
    const root = sym(`${document.uri}#progress`)
    const scratch = graph()
    scratch.add(root, rdf('type'), quiz('StudyLearningProgress'), document)
    scratch.add(root, dct('creator'), sym(location.userUri), document)
    scratch.add(root, quiz('deck'), sym(location.deckUri), document)
    for (const [uri, entry] of Object.entries(updated.cards)) {
      const subject = sym(`${document.uri}#card-${await digest(uri)}`)
      scratch.add(root, quiz('cardProgress'), subject, document)
      scratch.add(subject, quiz('card'), sym(uri), document)
      for (const [name, value] of Object.entries(entry)) scratch.add(subject, quiz(name), literal(String(value)), document)
    }
    const container = document.uri.slice(0, document.uri.lastIndexOf('/') + 1)
    await createContainerIfMissing(store, `${location.storageUrl}study-progress/`)
    await createContainerIfMissing(store, container)
    const response = await store.fetcher!.webOperation('PUT', document.uri, {
      data: serialize(document, scratch, document.uri, 'text/turtle') as string,
      contentType: 'text/turtle',
      headers: loaded.exists ? { 'If-Match': loaded.etag! } : { 'If-None-Match': '*' }
    })
    if (!response.ok) throw new Error(`Unable to save study progress: HTTP ${response.status}`)
    // webOperation does not update rdflib's graph after a PUT.
    store.removeStatements(store.statementsMatching(undefined, undefined, undefined, document).slice())
    for (const statement of scratch.statements) store.add(statement.subject, statement.predicate, statement.object, document)
    return updated
  })
  queue.set(location.progressDocument.uri, operation)
  try {
    return await operation
  } finally {
    if (queue.get(location.progressDocument.uri) === operation) queue.delete(location.progressDocument.uri)
  }
}
