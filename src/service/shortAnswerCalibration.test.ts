import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ShortAnswerSidecarClient } from './shortAnswerSidecarClient'
import { configureQuizAiService, loadQuizAiService } from './quizAiService'
import { shortAnswerCalibrationFixtures } from './shortAnswerCalibrationFixtures'

vi.mock('@huggingface/transformers', () => ({
  pipeline: vi.fn(async () => async () => ({
    tolist: () => [[1, 0], [1, 0]]
  }))
}))

describe('offline short-answer calibration fixtures', () => {
  beforeEach(() => {
    configureQuizAiService()
  })

  for (const fixture of shortAnswerCalibrationFixtures) {
    it(`${fixture.name}: expected ${fixture.expectedAuthoritative ? 'authoritative' : 'review'}`, async () => {
      const fetch = vi.fn().mockImplementation(async () => {
        if (fixture.sidecarFailure) {
          throw new Error('offline sidecar failure')
        }
        return new Response(JSON.stringify(fixture.sidecarResponse), { status: 200 })
      })
      configureQuizAiService({
        sidecarClient: new ShortAnswerSidecarClient({ endpoint: 'http://offline.test', fetch })
      })

      const result = await (await loadQuizAiService()).evaluateShortAnswer(
        fixture.answer,
        fixture.expectedAnswers,
        { question: 'Why do plants need sunlight?', gradingCriteria: fixture.gradingCriteria }
      )

      const authoritative = !result.needsReview
      expect(result.method).toBe(fixture.expectedMethod)
      expect(authoritative).toBe(fixture.expectedAuthoritative)
      expect(result.needsReview).toBe(fixture.expectedNeedsReview)
      if (fixture.expectedScore !== undefined) expect(result.score).toBe(fixture.expectedScore)
      if (fixture.expectedMaxScore !== undefined) expect(result.maxScore).toBe(fixture.expectedMaxScore)
      expect(fetch).toHaveBeenCalledTimes(fixture.expectedMethod === 'exact' ? 0 : 1)
    })
  }
})
