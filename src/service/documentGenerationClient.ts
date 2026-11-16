import { normalizeSidecarEndpoint } from './sidecarEndpoint'
import { appServicesFetch } from './appServicesFetch'

export interface GeneratedFlashcard {
  front: string
  back: string
  sourceReference: string
  difficulty: 'easy' | 'medium' | 'hard'
}

export interface ExtractedDocument {
  filename: string
  mediaType: string
  text: string
  characters: number
  sourceDocumentHash: string
  sourceDocumentVersion: string
  warnings: string[]
}

export interface GeneratedFlashcards {
  title: string
  cards: GeneratedFlashcard[]
}

export class DocumentGenerationError extends Error {
  constructor (message: string, readonly code: 'network' | 'http' | 'malformed') {
    super(message)
    this.name = 'DocumentGenerationError'
  }
}

function isFlashcards (value: unknown): value is GeneratedFlashcards {
  if (!value || typeof value !== 'object') return false
  const result = value as Record<string, unknown>
  return typeof result.title === 'string' &&
    Array.isArray(result.cards) &&
    result.cards.length > 0 &&
    result.cards.every(card => {
      if (!card || typeof card !== 'object') return false
      const item = card as Record<string, unknown>
      return typeof item.front === 'string' && item.front.trim() &&
        typeof item.back === 'string' && item.back.trim() &&
        typeof item.sourceReference === 'string' && item.sourceReference.trim() &&
        ['easy', 'medium', 'hard'].includes(item.difficulty as string)
    })
}

async function errorMessage (response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: unknown }
    if (typeof body.message === 'string') return body.message
  } catch {
    // Use the status below when the service did not return JSON.
  }
  return `Document service failed with HTTP ${response.status}`
}

function isExtractedDocument (value: unknown): value is ExtractedDocument {
  if (!value || typeof value !== 'object') return false
  const result = value as Record<string, unknown>
  return typeof result.filename === 'string' &&
    typeof result.mediaType === 'string' &&
    typeof result.text === 'string' &&
    typeof result.characters === 'number' &&
    typeof result.sourceDocumentHash === 'string' &&
    typeof result.sourceDocumentVersion === 'string' &&
    Array.isArray(result.warnings) &&
    result.warnings.every(warning => typeof warning === 'string')
}

export class DocumentGenerationClient {
  private readonly baseUrl: string
  private readonly requestFetch: typeof globalThis.fetch

  constructor (options: { endpoint: string, fetch?: typeof globalThis.fetch }) {
    this.baseUrl = normalizeSidecarEndpoint(options.endpoint, 'Document service')
    this.requestFetch = options.fetch ?? appServicesFetch(options.endpoint)
  }

  async extract (file: File): Promise<ExtractedDocument> {
    const body = new FormData()
    body.append('file', file)
    let response: Response
    try {
      response = await this.requestFetch(`${this.baseUrl}/api/import/document`, { method: 'POST', body })
    } catch (error) {
      throw new DocumentGenerationError(error instanceof Error ? error.message : 'Unable to reach document service', 'network')
    }
    if (!response.ok) throw new DocumentGenerationError(await errorMessage(response), 'http')
    const result = await response.json() as unknown
    if (!result || typeof result !== 'object' || !isExtractedDocument(result)) {
      throw new DocumentGenerationError('Document service returned malformed extracted text', 'malformed')
    }
    return result
  }

  async generateFlashcards (document: ExtractedDocument, count = 6): Promise<GeneratedFlashcards> {
    let response: Response
    try {
      response = await this.requestFetch(`${this.baseUrl}/api/generate/flashcards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: document.text, title: document.filename, count, difficulty: 'mixed' })
      })
    } catch (error) {
      throw new DocumentGenerationError(error instanceof Error ? error.message : 'Unable to reach document service', 'network')
    }
    if (!response.ok) throw new DocumentGenerationError(await errorMessage(response), 'http')
    const result = await response.json() as unknown
    if (!isFlashcards(result)) throw new DocumentGenerationError('Document service returned malformed study cards', 'malformed')
    return result
  }
}
