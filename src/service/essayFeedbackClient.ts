import { appServicesFetch } from './appServicesFetch'

export interface EssayFeedbackRubricItem {
  criterion: string
  points: number
}

export interface EssayFeedback {
  overallFeedback: string
  strengths: string[]
  areasToImprove: string[]
  paragraphFeedback: Array<{ paragraph: number, feedback: string, suggestion: string }>
  needsReview: boolean
}

export class EssayFeedbackError extends Error {
  constructor (message: string, readonly code: 'network' | 'http' | 'malformed') {
    super(message)
    this.name = 'EssayFeedbackError'
  }
}

export function isEssayFeedback (value: unknown): value is EssayFeedback {
  if (!value || typeof value !== 'object') return false
  const result = value as Record<string, unknown>
  return typeof result.overallFeedback === 'string' &&
    Array.isArray(result.strengths) && result.strengths.every(item => typeof item === 'string') &&
    Array.isArray(result.areasToImprove) && result.areasToImprove.every(item => typeof item === 'string') &&
    Array.isArray(result.paragraphFeedback) &&
    result.paragraphFeedback.every(item => {
      if (!item || typeof item !== 'object') return false
      const paragraph = item as Record<string, unknown>
      return Number.isInteger(paragraph.paragraph) &&
        typeof paragraph.feedback === 'string' &&
        typeof paragraph.suggestion === 'string'
    }) &&
    typeof result.needsReview === 'boolean'
}

export class EssayFeedbackClient {
  private readonly url: string
  private readonly requestFetch: typeof globalThis.fetch

  constructor (options: { endpoint: string, fetch?: typeof globalThis.fetch }) {
    this.url = `${options.endpoint.replace(/\/+$/, '')}/api/feedback/essay`
    this.requestFetch = options.fetch ?? appServicesFetch(options.endpoint)
  }

  async assess (input: { essay: string, assignment?: string, paragraphCount?: number, rubric: EssayFeedbackRubricItem[] }): Promise<EssayFeedback> {
    let response: Response
    try {
      response = await this.requestFetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      })
    } catch (error) {
      throw new EssayFeedbackError(error instanceof Error ? error.message : 'Unable to reach the AI feedback service.', 'network')
    }
    if (!response.ok) {
      let message = `AI feedback service failed with HTTP ${response.status}`
      try {
        const body = await response.json() as { message?: unknown }
        if (typeof body.message === 'string') message = body.message
      } catch {
        // Keep the HTTP status message when the service did not return JSON.
      }
      throw new EssayFeedbackError(message, 'http')
    }
    const result: unknown = await response.json()
    if (!isEssayFeedback(result)) throw new EssayFeedbackError('AI feedback service returned malformed feedback.', 'malformed')
    return result
  }
}
