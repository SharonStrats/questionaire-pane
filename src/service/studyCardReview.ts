import type { GeneratedFlashcard } from './documentGenerationClient'

export type StudyCardReviewStatus = 'pending' | 'accepted' | 'rejected'

export interface StudyCardReview {
  id: string
  card: GeneratedFlashcard
  status: StudyCardReviewStatus
}

function duplicateKey (front: string, back: string): string {
  return `${front.trim().replace(/\s+/g, ' ').toLocaleLowerCase()}\u0000${back.trim().replace(/\s+/g, ' ').toLocaleLowerCase()}`
}

export function createStudyCardReviews (cards: GeneratedFlashcard[]): StudyCardReview[] {
  return cards.map((card, index) => ({ id: `card-${index + 1}`, card: { ...card }, status: 'pending' }))
}

export function duplicateStudyCardReviewIds (reviews: StudyCardReview[]): Set<string> {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const review of reviews) {
    const key = duplicateKey(review.card.front, review.card.back)
    if (seen.has(key)) duplicates.add(review.id)
    else seen.add(key)
  }
  return duplicates
}

export function updateStudyCardReview (
  reviews: StudyCardReview[],
  id: string,
  update: { status?: StudyCardReviewStatus, card?: Partial<GeneratedFlashcard> }
): StudyCardReview[] {
  return reviews.map(review => review.id === id
    ? { ...review, ...update, card: update.card ? { ...review.card, ...update.card } : review.card }
    : review)
}

export function acceptPendingStudyCardReviews (reviews: StudyCardReview[]): StudyCardReview[] {
  return reviews.map(review => review.status === 'pending' ? { ...review, status: 'accepted' } : review)
}

export function removeRejectedStudyCardReviews (reviews: StudyCardReview[]): StudyCardReview[] {
  return reviews.filter(review => review.status !== 'rejected')
}

export function replaceRejectedStudyCardReviews (
  reviews: StudyCardReview[],
  cards: GeneratedFlashcard[]
): StudyCardReview[] {
  let nextId = reviews.reduce((max, review) => {
    const match = /^card-(\d+)$/.exec(review.id)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0) + 1
  let nextCard = 0
  const replacement = (card: GeneratedFlashcard): StudyCardReview => ({
    id: `card-${nextId++}`,
    card: { ...card },
    status: 'pending'
  })

  const updated = reviews.flatMap(review => {
    if (review.status !== 'rejected') return [review]
    const card = cards[nextCard++]
    return card ? [replacement(card)] : []
  })
  return [
    ...updated,
    ...cards.slice(nextCard).map(replacement)
  ]
}

export function summarizeStudyCardReviews (reviews: StudyCardReview[]): Record<StudyCardReviewStatus, number> {
  return reviews.reduce<Record<StudyCardReviewStatus, number>>((summary, review) => {
    summary[review.status] += 1
    return summary
  }, { pending: 0, accepted: 0, rejected: 0 })
}
