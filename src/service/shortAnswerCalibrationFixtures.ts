import type { GradingResponse } from './shortAnswerSidecarClient'

export interface ShortAnswerCalibrationFixture {
  name: string
  answer: string
  expectedAnswers: string[]
  gradingCriteria?: Array<{ criterion: string, points: number }>
  sidecarResponse?: GradingResponse
  sidecarFailure?: boolean
  expectedMethod: 'exact' | 'semantic' | 'sidecar'
  expectedAuthoritative: boolean
  expectedNeedsReview: boolean
}

export const shortAnswerCalibrationFixtures: ShortAnswerCalibrationFixture[] = [
  {
    name: 'exact accepted answer',
    answer: 'Photosynthesis',
    expectedAnswers: ['photosynthesis'],
    expectedMethod: 'exact',
    expectedAuthoritative: true,
    expectedNeedsReview: false
  },
  {
    name: 'equivalent wording',
    answer: 'Plants make food using sunlight.',
    expectedAnswers: ['Plants use sunlight for photosynthesis.'],
    sidecarResponse: {
      decision: 'correct',
      score: 1,
      maxScore: 1,
      confidence: 0.94,
      feedback: 'Equivalent explanation.',
      matchedCriteria: ['explains sunlight use'],
      missingCriteria: [],
      needsReview: false
    },
    expectedMethod: 'sidecar',
    expectedAuthoritative: true,
    expectedNeedsReview: false
  },
  {
    name: 'partial-credit criteria',
    answer: 'Plants make food.',
    expectedAnswers: ['Plants use sunlight for photosynthesis.'],
    gradingCriteria: [
      { criterion: 'mentions sunlight', points: 1 },
      { criterion: 'explains food production', points: 1 }
    ],
    sidecarResponse: {
      decision: 'partial',
      score: 1,
      maxScore: 2,
      confidence: 0.9,
      feedback: 'Mention sunlight as part of the explanation.',
      matchedCriteria: ['explains food production'],
      missingCriteria: ['mentions sunlight'],
      needsReview: false
    },
    expectedMethod: 'sidecar',
    expectedAuthoritative: true,
    expectedNeedsReview: false
  },
  {
    name: 'incorrect response',
    answer: 'Plants need sunlight to sleep.',
    expectedAnswers: ['Plants use sunlight for photosynthesis.'],
    sidecarResponse: {
      decision: 'needs-review',
      score: 0,
      maxScore: 2,
      confidence: 0.88,
      feedback: 'The explanation is incorrect.',
      matchedCriteria: [],
      missingCriteria: ['mentions sunlight', 'explains food production'],
      needsReview: true
    },
    expectedMethod: 'sidecar',
    expectedAuthoritative: false,
    expectedNeedsReview: true
  },
  {
    name: 'ambiguous response',
    answer: 'It helps somehow.',
    expectedAnswers: ['Plants use sunlight for photosynthesis.'],
    sidecarResponse: {
      decision: 'needs-review',
      score: 0,
      maxScore: 2,
      confidence: 0.55,
      feedback: 'The answer is too ambiguous to grade automatically.',
      matchedCriteria: [],
      missingCriteria: ['mentions sunlight', 'explains food production'],
      needsReview: true
    },
    expectedMethod: 'sidecar',
    expectedAuthoritative: false,
    expectedNeedsReview: true
  },
  {
    name: 'sidecar failure fallback',
    answer: 'Plants make their food using sunlight for photosynthesis.',
    expectedAnswers: ['Plants use sunlight for photosynthesis.'],
    sidecarFailure: true,
    expectedMethod: 'semantic',
    expectedAuthoritative: true,
    expectedNeedsReview: false
  },
  {
    name: 'low-confidence response',
    answer: 'Plants make energy.',
    expectedAnswers: ['Plants use sunlight for photosynthesis.'],
    sidecarResponse: {
      decision: 'correct',
      score: 2,
      maxScore: 2,
      confidence: 0.79,
      feedback: 'Possibly correct, but confidence is below the automatic threshold.',
      matchedCriteria: ['general energy explanation'],
      missingCriteria: [],
      needsReview: false
    },
    expectedMethod: 'sidecar',
    expectedAuthoritative: false,
    expectedNeedsReview: true
  }
]
