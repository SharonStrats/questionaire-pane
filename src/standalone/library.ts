import { Namespace, literal, st, sym, type NamedNode, type Store } from 'rdflib'
import { disco } from '../namespaces'
import { createContainerIfMissing } from '../service/questionaireTypes'

const pim = Namespace('http://www.w3.org/ns/pim/space#')
const solid = Namespace('http://www.w3.org/ns/solid/terms#')
const space = Namespace('http://www.w3.org/ns/pim/space#')
const dct = Namespace('http://purl.org/dc/terms/')
const rdfs = Namespace('http://www.w3.org/2000/01/rdf-schema#')
const ldp = Namespace('http://www.w3.org/ns/ldp#')
const rdf = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#')
const schema = Namespace('https://schema.org/')

export interface QuestionnaireIndexStatus {
  public: boolean
  private: boolean
}

export interface QuestionnaireEntry {
  subject: NamedNode
  title: string
  indexes: QuestionnaireIndexStatus
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

function labelFor (store: Store, subject: NamedNode): string {
  const title = store.any(subject, schema('name'))
  if (title?.termType === 'Literal') return title.value
  const path = new URL(subject.doc().uri).pathname.split('/').filter(Boolean)
  return decodeURIComponent(path[path.length - 2] ?? subject.doc().uri)
}

async function load (store: Store, resource: NamedNode): Promise<void> {
  if (!store.fetcher) throw new Error('No Solid fetcher is available.')
  await store.fetcher.load(resource.doc())
}

export async function loadTypeIndexes (store: Store, me: NamedNode): Promise<Map<string, QuestionnaireIndexStatus>> {
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

export async function addToTypeIndex (
  store: Store,
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

export async function ensureQuestionnaireWorkspace (store: Store, me: NamedNode): Promise<string> {
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

export async function questionnairesInWorkspace (store: Store, workspaceUrl: string): Promise<NamedNode[]> {
  const container = sym(trailingSlash(workspaceUrl))
  await load(store, container)
  const candidates = namedNodes(store.each(container, ldp('contains'))).filter(term => term.uri.endsWith('/'))
  const questionnaires: NamedNode[] = []
  await Promise.all(candidates.map(async candidate => {
    const subject = sym(`${candidate.uri}index.ttl#this`)
    try {
      await load(store, subject)
      if (store.holds(subject, rdf('type'), questionnaireClass, subject.doc())) questionnaires.push(subject)
    } catch {
      // A workspace may hold arbitrary folders; they are not questionnaire packages.
    }
  }))
  return questionnaires
}

export function entriesFromSubjects (
  store: Store,
  subjects: Iterable<NamedNode>,
  statuses: Map<string, QuestionnaireIndexStatus>
): QuestionnaireEntry[] {
  const unique = new Map<string, NamedNode>()
  for (const subject of subjects) unique.set(subject.uri, subject)
  return [...unique.values()].map(subject => ({
    subject,
    title: labelFor(store, subject),
    indexes: statuses.get(subject.uri) ?? { public: false, private: false }
  })).sort((left, right) => left.title.localeCompare(right.title))
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
