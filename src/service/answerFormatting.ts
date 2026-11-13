import { questionairePredicates } from './predicates'

export function normalizeTextResponseAnswer (answer: string | string[] | null): string | string[] | null {
  return Array.isArray(answer) || typeof answer === 'string' ? answer : null
}

export function formatReviewAnswer (
  answer: string | string[] | null,
  questionTypeUri: string
): string {
  if (Array.isArray(answer)) {
    const values = answer
      .filter(Boolean)
      .map(value => questionTypeUri === questionairePredicates.question.questionType.match.value
        ? value.split('|||').join(' → ')
        : value)
    return values.join(' · ')
  }
  return answer?.trim() || 'No answer'
}
