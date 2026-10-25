import { authn } from 'solid-logic'
import { graph, literal, Namespace, serialize, sym, type LiveStore, type NamedNode } from 'rdflib'
import { questionairePredicates } from './questionairePredicates'
import type { QuestionaireAcl } from '../context'
import { createContainerIfMissing, createDocumentIfMissing, ensureTrailingSlash } from './questionaireTypes'

const HTTP_SCHEMES = new Set(['http:', 'https:'])
const dct = Namespace('http://purl.org/dc/terms/')
const quiz = Namespace('https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#')
const schema = Namespace('https://schema.org/')
const space = Namespace('http://www.w3.org/ns/pim/space#')
const rdf = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#')

export interface ShareQuestionnaireResultsOptions {
  earnedPoints: number
  availablePoints: number
  answers: Record<string, string | string[] | null>
  questionUris: string[]
  user?: NamedNode | null
  storage?: NamedNode | null
}

export interface SharedQuestionnaireResults {
  resultContainer: NamedNode
}

function resultId (): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function answerText (answer: string | string[] | null): string {
  if (Array.isArray(answer)) return answer.filter(Boolean).join(' → ')
  return answer?.trim() || 'No answer'
}

interface ResultDocument {
  document: NamedNode
  data: string
}

function resultDocuments (container: NamedNode, user: NamedNode, questionnaire: NamedNode, options: ShareQuestionnaireResultsOptions): ResultDocument[] {
  const index = sym(`${container.uri}index.ttl#this`)
  const result = sym(`${container.uri}result.ttl#this`)
  const responses = sym(`${container.uri}responses/`)
  const now = new Date().toISOString()
  const store = graph()
  store.add(index, rdf('type'), quiz('Attempt'), index.doc())
  store.add(index, dct('creator'), user, index.doc())
  store.add(index, quiz('questionnaire'), questionnaire, index.doc())
  store.add(index, dct('created'), literal(now), index.doc())
  store.add(index, quiz('result'), result, index.doc())
  store.add(result, rdf('type'), quiz('Result'), result.doc())
  store.add(result, dct('creator'), user, result.doc())
  store.add(result, quiz('score'), literal(String(options.earnedPoints)), result.doc())
  store.add(result, quiz('outOf'), literal(String(options.availablePoints)), result.doc())
  store.add(result, quiz('completed'), literal('true'), result.doc())
  store.add(result, dct('created'), literal(now), result.doc())
  store.add(index, dct('hasPart'), responses, index.doc())

  options.questionUris.forEach((questionUri, indexNumber) => {
    const response = sym(`${container.uri}responses/r${indexNumber + 1}.ttl#this`)
    const selectedAnswer = sym(`${response.doc().uri}#answer`)
    store.add(index, quiz('response'), response, index.doc())
    store.add(response, rdf('type'), quiz('Response'), response.doc())
    store.add(response, dct('creator'), user, response.doc())
    store.add(response, quiz('questionRef'), sym(questionUri), response.doc())
    store.add(response, quiz('selectedAnswer'), selectedAnswer, response.doc())
    store.add(selectedAnswer, rdf('type'), schema('Answer'), response.doc())
    store.add(selectedAnswer, schema('text'), literal(answerText(options.answers[questionUri] ?? null)), response.doc())
  })

  return [
    { document: index.doc(), data: serialize(index.doc(), store, index.doc().uri, 'text/turtle') as string },
    { document: result.doc(), data: serialize(result.doc(), store, result.doc().uri, 'text/turtle') as string },
    ...options.questionUris.map((_questionUri, indexNumber) => {
      const response = sym(`${container.uri}responses/r${indexNumber + 1}.ttl#this`)
      return {
        document: response.doc(),
        data: serialize(response.doc(), store, response.doc().uri, 'text/turtle') as string
      }
    })
  ]
}

export async function shareQuestionnaireResults (
  store: LiveStore,
  acl: QuestionaireAcl,
  questionnaire: NamedNode,
  options: ShareQuestionnaireResultsOptions
): Promise<SharedQuestionnaireResults> {
  const creator = store.any(
    questionnaire,
    questionairePredicates.questionnaire.creator,
    undefined,
    questionnaire.doc()
  )
  if (!creator || creator.termType !== 'NamedNode') {
    throw new Error('The published questionnaire does not contain a creator WebID.')
  }

  let creatorUrl: URL
  try {
    creatorUrl = new URL(creator.value)
  } catch {
    throw new Error(`The questionnaire creator is not a valid WebID: ${creator.value}`)
  }
  if (!HTTP_SCHEMES.has(creatorUrl.protocol)) {
    throw new Error(`The questionnaire creator is not a valid WebID: ${creator.value}`)
  }

  const user = options.user ?? authn.currentUser()
  if (!user) {
    throw new Error('Unable to share questionnaire results because you are not signed in.')
  }
  const storage = options.storage ?? await findStorage(store, user)
  if (!storage) {
    throw new Error('Unable to share questionnaire results because your Pod storage location could not be found.')
  }

  const resultContainer = sym(`${ensureTrailingSlash(storage.uri)}questionnaire-results/${resultId()}/`)
  await createContainerIfMissing(store, `${ensureTrailingSlash(storage.uri)}questionnaire-results/`)
  await createContainerIfMissing(store, resultContainer.uri)
  await createContainerIfMissing(store, `${resultContainer.uri}responses/`)
  for (const document of resultDocuments(resultContainer, user, questionnaire, options)) {
    await createDocumentIfMissing(store, document.document, document.data)
  }

  const plan = await acl.planGrantContainerContents(
    resultContainer,
    { type: 'agent', iri: creator.value },
    ['Read']
  )
  const response = await acl.applyPlan(plan)
  if (!response.ok) {
    throw new Error(`Unable to share questionnaire results: HTTP ${response.status}`)
  }
  return { resultContainer }
}

async function findStorage (store: LiveStore, user: NamedNode): Promise<NamedNode | null> {
  if (!store.fetcher) {
    throw new Error('Unable to find your Pod storage location because the Solid fetcher is unavailable.')
  }
  await store.fetcher.load(user.doc())
  const storage = store.any(user, space('storage'), undefined, user.doc())
  return storage?.termType === 'NamedNode' ? storage as NamedNode : null
}
