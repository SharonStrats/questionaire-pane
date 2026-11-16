export interface GradingRequest {
  question: string
  studentAnswer: string
  expectedAnswer?: string
  rubric: GradingCriterion[]
  maxScore: number
}

export interface GradingCriterion {
  criterion: string
  points: number
}

export type GradingDecision = 'correct' | 'partial' | 'needs-review'

export interface GradingResponse {
  decision: GradingDecision
  score: number
  maxScore: number
  confidence: number
  feedback: string
  matchedCriteria: string[]
  missingCriteria: string[]
  needsReview: boolean
}

export interface ShortAnswerSidecarInput {
  question: string
  studentAnswer: string
  expectedAnswer?: string
  rubric: GradingCriterion[]
  maxScore: number
}

export interface ShortAnswerSidecarClientOptions {
  /** Base URL for the sidecar, for example http://localhost:5001. */
  endpoint: string
  fetch?: typeof globalThis.fetch
}

export class ShortAnswerSidecarError extends Error {
  constructor(
    message: string,
    readonly code: 'network' | 'http' | 'malformed',
    readonly status?: number
  ) {
    super(message)
    this.name = 'ShortAnswerSidecarError'
  }
}

/** Map pane input to the sidecar's stable grading contract. */
export function toGradingRequest (input: ShortAnswerSidecarInput): GradingRequest {
  return {
    question: input.question.trim(),
    studentAnswer: input.studentAnswer.trim(),
    ...(input.expectedAnswer === undefined ? {} : { expectedAnswer: input.expectedAnswer.trim() }),
    rubric: input.rubric.map(({ criterion, points }) => ({
      criterion: criterion.trim(),
      points
    })),
    maxScore: input.maxScore
  }
}

function isGradingResponse (value: unknown, expectedMaxScore: number): value is GradingResponse {
  if (!value || typeof value !== 'object') return false
  const response = value as Record<string, unknown>
  return (
    (response.decision === 'correct' || response.decision === 'partial' || response.decision === 'needs-review') &&
    Number.isInteger(response.score) &&
    (response.score as number) >= 0 &&
    Number.isInteger(response.maxScore) &&
    response.maxScore === expectedMaxScore &&
    (response.maxScore as number) > 0 &&
    (response.score as number) <= (response.maxScore as number) &&
    typeof response.confidence === 'number' &&
    response.confidence >= 0 &&
    response.confidence <= 1 &&
    typeof response.feedback === 'string' &&
    response.feedback.length > 0 &&
    Array.isArray(response.matchedCriteria) &&
    response.matchedCriteria.every((item) => typeof item === 'string') &&
    Array.isArray(response.missingCriteria) &&
    response.missingCriteria.every((item) => typeof item === 'string') &&
    typeof response.needsReview === 'boolean'
  )
}

async function responseMessage (response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: unknown }
    return typeof body.message === 'string' ? body.message : `Sidecar request failed with HTTP ${response.status}`
  } catch {
    return `Sidecar request failed with HTTP ${response.status}`
  }
}

export class ShortAnswerSidecarClient {
  private readonly url: string
  private readonly requestFetch: typeof globalThis.fetch

  constructor (options: ShortAnswerSidecarClientOptions) {
    this.url = `${options.endpoint.replace(/\/+$/, '')}/api/grade/short-answer`
    this.requestFetch = options.fetch ?? globalThis.fetch
  }

  async grade (input: ShortAnswerSidecarInput): Promise<GradingResponse> {
    const request = toGradingRequest(input)
    const rubricMaxScore = request.rubric.reduce((sum, criterion) => sum + criterion.points, 0)
    if (
      request.rubric.length === 0 ||
      request.rubric.some(criterion => !Number.isInteger(criterion.points) || criterion.points < 1) ||
      rubricMaxScore !== request.maxScore
    ) {
      throw new ShortAnswerSidecarError('Rubric weights must be positive whole numbers that sum to maxScore', 'malformed')
    }
    let response: Response
    try {
      response = await this.requestFetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      })
    } catch (error) {
      throw new ShortAnswerSidecarError(
        error instanceof Error ? error.message : 'Unable to reach grading sidecar',
        'network'
      )
    }

    if (!response.ok) {
      throw new ShortAnswerSidecarError(await responseMessage(response), 'http', response.status)
    }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new ShortAnswerSidecarError('Sidecar returned invalid JSON', 'malformed', response.status)
    }
    if (!isGradingResponse(body, request.maxScore)) {
      throw new ShortAnswerSidecarError('Sidecar returned a malformed grading response', 'malformed', response.status)
    }
    return body
  }
}
