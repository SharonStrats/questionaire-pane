import { graph, literal, Namespace, serialize, sym, type LiveStore, type NamedNode } from 'rdflib'
import { isEssayFeedback, type EssayFeedback } from './essayFeedbackClient'
import { createContainerIfMissing, ensureTrailingSlash } from './types'

const quiz = Namespace('https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#')
const dct = Namespace('http://purl.org/dc/terms/')
const rdf = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#')

export type EnglishPracticeType = 'paragraph' | 'essay'

export interface EnglishPracticeDraft {
  practiceType: EnglishPracticeType
  promptId: string
  response: string
  updatedAt: string
}

export interface EnglishPracticeAttempt {
  id: string
  practiceType: EnglishPracticeType
  promptId: string
  prompt: string
  response: string
  feedback: EssayFeedback
  createdAt: string
}

function isEnglishPracticeType (value: string): value is EnglishPracticeType {
  return value === 'paragraph' || value === 'essay'
}

function validHttpUri (uri: string): string {
  const url = new URL(uri)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('English practice requires an absolute Pod or workspace HTTP(S) URL.')
  }
  return url.href
}

function validateIdentity (practiceType: EnglishPracticeType, promptId: string): void {
  if (!['paragraph', 'essay'].includes(practiceType) || !/^[a-z0-9-]+$/.test(promptId)) {
    throw new Error('English practice requires a valid practice type and prompt ID.')
  }
}

function rootFor (document: NamedNode): NamedNode {
  return sym(`${document.uri}#this`)
}

function statusOf (error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const failure = error as { status?: number, response?: { status?: number } }
  return failure.response?.status ?? failure.status
}

function requiredLiteral (store: LiveStore, subject: NamedNode, name: string, document: NamedNode): string {
  const values = store.each(subject, quiz(name), undefined, document)
  if (values.length !== 1 || values[0].termType !== 'Literal') {
    throw new Error(`Invalid English practice data: expected one ${name}.`)
  }
  return values[0].value
}

function assertOwner (store: LiveStore, document: NamedNode, user: NamedNode): void {
  const owners = store.each(rootFor(document), dct('creator'), undefined, document)
  if (owners.length !== 1 || owners[0].value !== user.uri) {
    throw new Error('English practice data belongs to a different user or is invalid.')
  }
}

async function loadDocument (
  store: LiveStore, document: NamedNode
): Promise<{ exists: boolean, etag?: string }> {
  if (!store.fetcher) throw new Error('Missing fetcher on English practice store.')
  try {
    const response = await store.fetcher.load(document, { force: true, clearPreviousData: true })
    return { exists: true, etag: response.headers?.get('etag') ?? undefined }
  } catch (error) {
    if (statusOf(error) === 404) return { exists: false }
    throw new Error(`Unable to load English practice data at ${document.uri}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const writes = new WeakMap<LiveStore, Map<string, Promise<unknown>>>()

async function serializeWrite<T> (store: LiveStore, uri: string, write: () => Promise<T>): Promise<T> {
  let queue = writes.get(store)
  if (!queue) {
    queue = new Map()
    writes.set(store, queue)
  }
  const previous = queue.get(uri) ?? Promise.resolve()
  const operation = previous.catch(() => undefined).then(write)
  queue.set(uri, operation)
  try {
    return await operation as T
  } finally {
    if (queue.get(uri) === operation) queue.delete(uri)
  }
}

async function putDocument (
  store: LiveStore,
  user: NamedNode,
  document: NamedNode,
  preserveExisting: boolean,
  build: (target: ReturnType<typeof graph>) => void
): Promise<void> {
  const fetcher = store.fetcher
  if (!fetcher) throw new Error('Missing fetcher on English practice store.')
  const loaded = await loadDocument(store, document)
  if (loaded.exists && !loaded.etag) {
    throw new Error('The Pod did not provide an ETag; English practice cannot safely be updated.')
  }
  if (loaded.exists) assertOwner(store, document, user)

  const target = graph()
  if (loaded.exists && preserveExisting) {
    for (const statement of store.statementsMatching(undefined, undefined, undefined, document)) {
      target.add(statement.subject, statement.predicate, statement.object, document)
    }
  }
  build(target)
  const response = await fetcher.webOperation('PUT', document.uri, {
    data: serialize(document, target, document.uri, 'text/turtle') as string,
    contentType: 'text/turtle',
    headers: loaded.exists ? { 'If-Match': loaded.etag! } : { 'If-None-Match': '*' }
  })
  if (!response.ok) throw new Error(`Unable to save English practice data: HTTP ${response.status}`)

  store.removeDocument(document)
  for (const statement of target.statements) {
    store.add(statement.subject, statement.predicate, statement.object, document)
  }
}

function practicePaths (workspaceUrl: string, practiceType: EnglishPracticeType, promptId: string) {
  validateIdentity(practiceType, promptId)
  const root = `${ensureTrailingSlash(validHttpUri(workspaceUrl))}english-practice/`
  return {
    root,
    draft: sym(`${root}drafts/${practiceType}-${promptId}.ttl`),
    attempts: sym(`${root}attempts.ttl`)
  }
}

export async function loadEnglishPracticeDraft (
  store: LiveStore,
  user: NamedNode,
  workspaceUrl: string,
  practiceType: EnglishPracticeType,
  promptId: string
): Promise<EnglishPracticeDraft | undefined> {
  const { draft } = practicePaths(workspaceUrl, practiceType, promptId)
  const loaded = await loadDocument(store, draft)
  if (!loaded.exists) return undefined
  assertOwner(store, draft, user)
  const root = rootFor(draft)
  const savedType = requiredLiteral(store, root, 'practiceType', draft)
  const savedPromptId = requiredLiteral(store, root, 'promptId', draft)
  const response = requiredLiteral(store, root, 'response', draft)
  const updatedAt = requiredLiteral(store, root, 'updatedAt', draft)
  if (savedType !== practiceType || savedPromptId !== promptId || !Number.isFinite(Date.parse(updatedAt))) {
    throw new Error('Invalid English practice draft metadata.')
  }
  return { practiceType, promptId, response, updatedAt }
}

export async function saveEnglishPracticeDraft (
  store: LiveStore,
  user: NamedNode,
  workspaceUrl: string,
  draft: EnglishPracticeDraft
): Promise<void> {
  const paths = practicePaths(workspaceUrl, draft.practiceType, draft.promptId)
  if (!Number.isFinite(Date.parse(draft.updatedAt))) throw new Error('English practice draft time must be a valid date.')
  await createContainerIfMissing(store, paths.root)
  await createContainerIfMissing(store, `${paths.root}drafts/`)
  await serializeWrite(store, paths.draft.uri, async () => {
    await putDocument(store, user, paths.draft, false, target => {
      const root = rootFor(paths.draft)
      target.add(root, rdf('type'), quiz('EnglishPracticeDraft'), paths.draft)
      target.add(root, dct('creator'), user, paths.draft)
      target.add(root, quiz('practiceType'), literal(draft.practiceType), paths.draft)
      target.add(root, quiz('promptId'), literal(draft.promptId), paths.draft)
      target.add(root, quiz('response'), literal(draft.response), paths.draft)
      target.add(root, quiz('updatedAt'), literal(draft.updatedAt), paths.draft)
    })
  })
}

export async function saveEnglishPracticeAttempt (
  store: LiveStore,
  user: NamedNode,
  workspaceUrl: string,
  attempt: EnglishPracticeAttempt
): Promise<EnglishPracticeAttempt> {
  const paths = practicePaths(workspaceUrl, attempt.practiceType, attempt.promptId)
  if (!/^[a-zA-Z0-9-]+$/.test(attempt.id) ||
      !Number.isFinite(Date.parse(attempt.createdAt)) ||
      !isEssayFeedback(attempt.feedback)) {
    throw new Error('English practice attempt metadata or feedback is invalid.')
  }
  await createContainerIfMissing(store, paths.root)
  return await serializeWrite(store, paths.attempts.uri, async () => {
    await putDocument(store, user, paths.attempts, true, target => {
      const root = rootFor(paths.attempts)
      const subject = sym(`${paths.attempts.uri}#attempt-${attempt.id}`)
      target.add(root, rdf('type'), quiz('EnglishPracticeHistory'), paths.attempts)
      target.add(root, dct('creator'), user, paths.attempts)
      target.add(root, quiz('englishAttempt'), subject, paths.attempts)
      target.add(subject, rdf('type'), quiz('EnglishPracticeAttempt'), paths.attempts)
      target.add(subject, dct('creator'), user, paths.attempts)
      target.add(subject, quiz('practiceType'), literal(attempt.practiceType), paths.attempts)
      target.add(subject, quiz('promptId'), literal(attempt.promptId), paths.attempts)
      target.add(subject, quiz('prompt'), literal(attempt.prompt), paths.attempts)
      target.add(subject, quiz('response'), literal(attempt.response), paths.attempts)
      target.add(subject, quiz('feedback'), literal(JSON.stringify(attempt.feedback)), paths.attempts)
      target.add(subject, quiz('createdAt'), literal(attempt.createdAt), paths.attempts)
    })
    return attempt
  })
}

export async function loadEnglishPracticeAttempts (
  store: LiveStore,
  user: NamedNode,
  workspaceUrl: string
): Promise<EnglishPracticeAttempt[]> {
  const root = `${ensureTrailingSlash(validHttpUri(workspaceUrl))}english-practice/`
  const document = sym(`${root}attempts.ttl`)
  const loaded = await loadDocument(store, document)
  if (!loaded.exists) return []
  assertOwner(store, document, user)

  const history = rootFor(document)
  const attempts = store.each(history, quiz('englishAttempt'), undefined, document)
  const results: EnglishPracticeAttempt[] = attempts.map(term => {
    if (term.termType !== 'NamedNode') throw new Error('Invalid English practice attempt resource.')
    const subject = term as NamedNode
    const id = subject.uri.startsWith(`${document.uri}#attempt-`)
      ? subject.uri.slice(`${document.uri}#attempt-`.length)
      : ''
    const practiceType = requiredLiteral(store, subject, 'practiceType', document)
    const promptId = requiredLiteral(store, subject, 'promptId', document)
    const prompt = requiredLiteral(store, subject, 'prompt', document)
    const response = requiredLiteral(store, subject, 'response', document)
    const serializedFeedback = requiredLiteral(store, subject, 'feedback', document)
    const createdAt = requiredLiteral(store, subject, 'createdAt', document)
    if (!isEnglishPracticeType(practiceType)) throw new Error('Invalid English practice type.')
    validateIdentity(practiceType, promptId)
    if (!/^[a-zA-Z0-9-]+$/.test(id) || !Number.isFinite(Date.parse(createdAt))) {
      throw new Error('Invalid English practice attempt metadata.')
    }
    let feedback: unknown
    try {
      feedback = JSON.parse(serializedFeedback)
    } catch {
      throw new Error(`Invalid saved feedback for English practice attempt ${id}.`)
    }
    if (!isEssayFeedback(feedback)) throw new Error(`Invalid saved feedback for English practice attempt ${id}.`)
    return {
      id, practiceType, promptId,
      prompt, response, feedback, createdAt
    }
  })
  return results.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
}
