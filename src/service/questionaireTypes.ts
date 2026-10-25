import { graph, type LiveStore, type NamedNode, serialize } from 'rdflib'

export interface QuestionaireStructureOptions {
  baseUrl: string
  title: string
  author?: NamedNode | null
  created?: Date
}

export interface QuestionaireStructureResult {
  index: NamedNode
  draft: NamedNode
  draftQuestions: NamedNode
}

export interface QuestionaireQuestionOptions {
  baseUrl: string
  title: string
  author?: NamedNode | null
  created?: Date
  questionPredicateUri?: string
  questionTypeUri?: string
  image?: string
  hint?: string
  explanation?: string
  points?: number
  options?: string[]
  correctOption?: string | null
  correctOptions?: string[] | null
  answers?: string[]
  items?: string[]
  leftItems?: string[]
  rightItems?: string[]
}

export interface QuestionaireQuestionResult {
  question: NamedNode
  questionDoc: NamedNode
  questionNumber: number
}

function deriveQuestionaireTitleFromBaseUrl (baseUrl: string) {
  const normalized = ensureTrailingSlash(baseUrl)
  const parts = normalized.split('/').filter(Boolean)
  const encodedTitle = parts[parts.length - 1] ?? ''
  return decodeURIComponent(encodedTitle)
}

function slugifyQuestionaireSegment (value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function ensureTrailingSlash (url: string) {
  return url.endsWith('/') ? url : `${url}/`
}

function buildTurtleDocument (
  doc: NamedNode,
  build: (scratch: ReturnType<typeof graph>) => void
) {
  const scratch = graph()
  build(scratch)
  return serialize(doc, scratch, doc.uri, 'text/turtle') as string
}

async function createContainerIfMissing (store: LiveStore, url: string) {
  const fetcher = store.fetcher
  if (!fetcher) {
    throw new Error('Missing fetcher on questionnaire store')
  }

  try {
    const response = await fetcher._fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/turtle',
        'If-None-Match': '*',
        Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"'
      },
      body: ' '
    })

    // The conditional PUT is the existence check. Avoiding a preliminary HEAD
    // keeps missing containers from producing expected-but-noisy 404 requests.
    if (response.status === 409 || response.status === 412) {
      return false
    }

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Failed to create container at ${url}: HTTP ${response.status}`)
    }

    return true
  } catch (err: any) {
    const status = err?.response?.status ?? err?.status
    if (status === 409 || status === 412) {
      return false
    }

    throw new Error(`Failed to create container at ${url}: ${err?.message ?? err}`)
  }
}

async function createDocumentIfMissing (store: LiveStore, doc: NamedNode, turtle: string) {
  const fetcher = store.fetcher
  if (!fetcher) {
    throw new Error('Missing fetcher on questionnaire store')
  }

  try {
    await fetcher.webOperation('PUT', doc.uri, {
      data: turtle,
      contentType: 'text/turtle',
      headers: { 'If-None-Match': '*' }
    })
    return true
  } catch (err: any) {
    const status = err?.response?.status ?? err?.status
    if (status === 412) {
      return false
    }
    throw new Error(`Failed to create document at ${doc.uri}: ${err?.message ?? err}`)
  }
}

export {
  buildTurtleDocument,
  createContainerIfMissing,
  createDocumentIfMissing,
  deriveQuestionaireTitleFromBaseUrl,
  ensureTrailingSlash,
  slugifyQuestionaireSegment
}
