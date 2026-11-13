import { describe, expect, it, vi } from 'vitest'
import {
  ShortAnswerSidecarClient,
  ShortAnswerSidecarError,
  toGradingRequest
} from './shortAnswerSidecarClient'

const input = {
  question: ' Explain photosynthesis. ',
  studentAnswer: ' Plants make food. ',
  expectedAnswer: 'Plants use sunlight for photosynthesis.',
  rubric: [{ criterion: ' mentions sunlight ', points: 1 }, { criterion: 'explains food', points: 1 }],
  maxScore: 2
}

const validResponse = {
  decision: 'partial',
  score: 1,
  maxScore: 2,
  confidence: 0.8,
  feedback: 'Mention sunlight.',
  matchedCriteria: ['explains food'],
  missingCriteria: ['mentions sunlight'],
  needsReview: false
}

describe('ShortAnswerSidecarClient', () => {
  it('maps and sends the sidecar grading contract', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(validResponse), { status: 200 }))
    const client = new ShortAnswerSidecarClient({ endpoint: 'http://localhost:5001/', fetch })

    await client.grade(input)

    expect(fetch).toHaveBeenCalledWith('http://localhost:5001/api/grade/short-answer', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(toGradingRequest(input))
    }))
  })

  it('rejects malformed responses', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ score: 1 }), { status: 200 }))
    const client = new ShortAnswerSidecarClient({ endpoint: 'http://localhost:5001', fetch })

    await expect(client.grade(input)).rejects.toMatchObject({ code: 'malformed' } satisfies Partial<ShortAnswerSidecarError>)
  })

  it('reports HTTP errors without exposing client credentials', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'invalid request' }), { status: 400 }))
    const client = new ShortAnswerSidecarClient({ endpoint: 'http://localhost:5001', fetch })

    await expect(client.grade(input)).rejects.toMatchObject({ code: 'http', status: 400, message: 'invalid request' })
    expect(fetch.mock.calls[0][1]).not.toHaveProperty('headers.Authorization')
  })
})
