import type {
  DocumentImportFormat,
  ImportedQuestionType,
  ImportedQuizQuestion,
  NormalizedSourceDocument
} from './quizAiService'
import { normalizeSidecarEndpoint } from './sidecarEndpoint'

export const MAX_AI_IMPORT_QUESTIONS = 6
export const MAX_AI_IMPORT_DOCUMENT_CHARACTERS = 100_000

export interface QuizImportRequest {
  format: DocumentImportFormat
  document: NormalizedSourceDocument
  maxQuestions: number
}

export interface QuizImportResponse {
  questions: ImportedQuizQuestion[]
  warnings: string[]
}

export interface QuizImportSidecarClientOptions {
  /** Base URL for the server-side structured import service. */
  endpoint: string
  fetch?: typeof globalThis.fetch
}

export class QuizImportSidecarError extends Error {
  constructor (
    message: string,
    readonly code: 'network' | 'http' | 'malformed' | 'payload',
    readonly status?: number
  ) {
    super(message)
    this.name = 'QuizImportSidecarError'
  }
}

const questionTypes: ImportedQuestionType[] = [
  'multiple-choice', 'selection', 'true-false', 'fill-in-the-blank',
  'short-answer', 'ordering', 'match'
]

function isStringArray (value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string')
}

function isImportedQuestion (value: unknown): value is ImportedQuizQuestion {
  if (!value || typeof value !== 'object') return false
  const question = value as Record<string, unknown>
  return (
    typeof question.title === 'string' &&
    question.title.trim().length > 0 &&
    questionTypes.includes(question.type as ImportedQuestionType) &&
    isStringArray(question.options) &&
    isStringArray(question.correctAnswers) &&
    (question.sourceItems === undefined || isStringArray(question.sourceItems)) &&
    (question.targetItems === undefined || isStringArray(question.targetItems)) &&
    (question.confidence === undefined ||
      (typeof question.confidence === 'number' && question.confidence >= 0 && question.confidence <= 1)) &&
    (question.warnings === undefined || isStringArray(question.warnings))
  )
}

export function parseQuizImportResponse (value: unknown): QuizImportResponse {
  if (!value || typeof value !== 'object') {
    throw new QuizImportSidecarError('Quiz import service returned a malformed response', 'malformed')
  }
  const response = value as Record<string, unknown>
  if (!Array.isArray(response.questions) || !response.questions.every(isImportedQuestion)) {
    throw new QuizImportSidecarError('Quiz import service returned malformed questions', 'malformed')
  }
  if (response.warnings !== undefined && !isStringArray(response.warnings)) {
    throw new QuizImportSidecarError('Quiz import service returned malformed warnings', 'malformed')
  }
  return {
    questions: response.questions,
    warnings: response.warnings ?? []
  }
}

async function responseMessage (response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: unknown }
    return typeof body.message === 'string'
      ? body.message
      : `Quiz import service failed with HTTP ${response.status}`
  } catch {
    return `Quiz import service failed with HTTP ${response.status}`
  }
}

export class QuizImportSidecarClient {
  private readonly url: string
  private readonly requestFetch: typeof globalThis.fetch

  constructor (options: QuizImportSidecarClientOptions) {
    this.url = `${normalizeSidecarEndpoint(options.endpoint, 'Quiz import service')}/api/import/quiz`
    this.requestFetch = options.fetch ?? globalThis.fetch
  }

  async generate (
    document: NormalizedSourceDocument,
    format: DocumentImportFormat,
    maxQuestions = 6
  ): Promise<QuizImportResponse> {
    if (!Number.isInteger(maxQuestions) || maxQuestions < 1 || maxQuestions > MAX_AI_IMPORT_QUESTIONS) {
      throw new QuizImportSidecarError(
        `maxQuestions must be an integer between 1 and ${MAX_AI_IMPORT_QUESTIONS}.`,
        'payload'
      )
    }
    const documentCharacters = document.blocks.reduce((total, block) => total + block.text.length, 0)
    if (documentCharacters > MAX_AI_IMPORT_DOCUMENT_CHARACTERS) {
      throw new QuizImportSidecarError(
        `The normalized document exceeds the ${MAX_AI_IMPORT_DOCUMENT_CHARACTERS}-character import limit.`,
        'payload'
      )
    }
    const request: QuizImportRequest = { format, document, maxQuestions }
    let response: Response
    try {
      response = await this.requestFetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      })
    } catch (error) {
      throw new QuizImportSidecarError(
        error instanceof Error ? error.message : 'Unable to reach quiz import service',
        'network'
      )
    }
    if (!response.ok) {
      throw new QuizImportSidecarError(await responseMessage(response), 'http', response.status)
    }
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new QuizImportSidecarError('Quiz import service returned invalid JSON', 'malformed', response.status)
    }
    return parseQuizImportResponse(body)
  }
}
