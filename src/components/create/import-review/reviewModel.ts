import type { ImportedQuizQuestion, QuestionProvenance } from '../../../service/quizAiService'

export interface ReviewQuestion {
  id: string
  title: string
  type: ImportedQuizQuestion['type']
  options: string[]
  correctAnswers: string[]
  sourceItems?: string[]
  targetItems?: string[]
  confidence: number
  provenance?: QuestionProvenance
  sourceBlock?: ImportedQuizQuestion['sourceBlock']
  warnings: string[]
  approved: boolean
}

export const HIGH_CONFIDENCE_THRESHOLD = 0.8

export function isHighConfidence (question: Pick<ImportedQuizQuestion, 'confidence'>): boolean {
  return (question.confidence ?? 0) >= HIGH_CONFIDENCE_THRESHOLD
}

export function needsReview (question: Pick<ImportedQuizQuestion, 'confidence' | 'warnings'>): boolean {
  return !isHighConfidence(question) || (question.warnings?.length ?? 0) > 0
}

export function cloneReviewQuestions (questions: readonly ImportedQuizQuestion[]): ReviewQuestion[] {
  return questions.map((question, index) => ({
    id: `imported-question-${index + 1}`,
    title: question.title,
    type: question.type,
    options: [...question.options],
    correctAnswers: [...question.correctAnswers],
    sourceItems: question.sourceItems ? [...question.sourceItems] : undefined,
    targetItems: question.targetItems ? [...question.targetItems] : undefined,
    confidence: question.confidence ?? 0.55,
    provenance: question.provenance ? { ...question.provenance } : undefined,
    sourceBlock: question.sourceBlock ? { ...question.sourceBlock, warnings: [...question.sourceBlock.warnings] } : undefined,
    warnings: [...(question.warnings ?? [])],
    // Let reliable candidates flow through the normal staged acceptance action,
    // while making uncertain candidates an explicit creator decision.
    approved: isHighConfidence(question)
  }))
}

export function updateReviewQuestion (
  questions: readonly ReviewQuestion[],
  index: number,
  patch: Partial<ReviewQuestion>
): ReviewQuestion[] {
  return questions.map((question, questionIndex) =>
    questionIndex === index
      ? { ...question, ...patch, options: patch.options ? [...patch.options] : question.options, correctAnswers: patch.correctAnswers ? [...patch.correctAnswers] : question.correctAnswers }
      : question
  )
}

export function removeReviewQuestion (
  questions: readonly ReviewQuestion[],
  index: number
): ReviewQuestion[] {
  return questions.filter((_, questionIndex) => questionIndex !== index)
}

export function moveReviewQuestion (
  questions: readonly ReviewQuestion[],
  index: number,
  direction: -1 | 1
): ReviewQuestion[] {
  const targetIndex = index + direction
  if (index < 0 || index >= questions.length || targetIndex < 0 || targetIndex >= questions.length) {
    return [...questions]
  }
  const next = [...questions]
  const [question] = next.splice(index, 1)
  next.splice(targetIndex, 0, question)
  return next
}
