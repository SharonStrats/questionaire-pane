import { appServicesFetch } from './appServicesFetch'

export type DrawingEvaluationDecision = 'correct' | 'possibly-correct' | 'incorrect' | 'needs-review'

export interface DrawingEvaluation {
  decision: DrawingEvaluationDecision
  confidence: number
  feedback: string
  evidence: string[]
  needsReview: boolean
}

export interface DiagramDrawingEvaluationInput {
  question: string
  referenceImage: string
  answerImage: string
}

export interface DiagramDrawingSidecarClientOptions {
  endpoint: string
  fetch?: typeof globalThis.fetch
}

export class DiagramDrawingSidecarError extends Error {
  constructor (
    message: string,
    readonly code: 'network' | 'http' | 'malformed' | 'payload',
    readonly status?: number
  ) {
    super(message)
    this.name = 'DiagramDrawingSidecarError'
  }
}

function isDrawingEvaluation (value: unknown): value is DrawingEvaluation {
  if (!value || typeof value !== 'object') return false
  const response = value as Record<string, unknown>
  return (
    (response.decision === 'correct' ||
      response.decision === 'possibly-correct' ||
      response.decision === 'incorrect' ||
      response.decision === 'needs-review') &&
    typeof response.confidence === 'number' &&
    response.confidence >= 0 &&
    response.confidence <= 1 &&
    typeof response.feedback === 'string' &&
    response.feedback.length > 0 &&
    Array.isArray(response.evidence) &&
    response.evidence.every((item) => typeof item === 'string') &&
    typeof response.needsReview === 'boolean'
  )
}

async function responseMessage (response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: unknown }
    return typeof body.message === 'string'
      ? body.message
      : `Drawing evaluation failed with HTTP ${response.status}`
  } catch {
    return `Drawing evaluation failed with HTTP ${response.status}`
  }
}

export class DiagramDrawingSidecarClient {
  private readonly url: string
  private readonly requestFetch: typeof globalThis.fetch

  constructor (options: DiagramDrawingSidecarClientOptions) {
    this.url = `${options.endpoint.replace(/\/+$/, '')}/api/grade/diagram-drawing`
    this.requestFetch = options.fetch ?? appServicesFetch(options.endpoint)
  }

  async evaluate (input: DiagramDrawingEvaluationInput): Promise<DrawingEvaluation> {
    if (!input.referenceImage.startsWith('data:image/') || !input.answerImage.startsWith('data:image/')) {
      throw new DiagramDrawingSidecarError('Drawing evaluation requires image data.', 'payload')
    }

    let response: Response
    try {
      response = await this.requestFetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      })
    } catch (error) {
      throw new DiagramDrawingSidecarError(
        error instanceof Error ? error.message : 'Unable to reach drawing evaluation service',
        'network'
      )
    }
    if (!response.ok) {
      throw new DiagramDrawingSidecarError(await responseMessage(response), 'http', response.status)
    }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new DiagramDrawingSidecarError('Drawing evaluation returned invalid JSON', 'malformed', response.status)
    }
    if (!isDrawingEvaluation(body)) {
      throw new DiagramDrawingSidecarError('Drawing evaluation returned a malformed response', 'malformed', response.status)
    }
    return body
  }
}
