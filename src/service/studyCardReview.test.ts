import { describe, expect, it } from 'vitest'
import { createStudyCardReviews, duplicateStudyCardReviewIds, summarizeStudyCardReviews, updateStudyCardReview } from './studyCardReview'

const card = { front: 'Front', back: 'Back', sourceReference: 'notes.md', difficulty: 'easy' as const }

describe('study card review state', () => {
  it('detects repeated cards after normalizing case and whitespace', () => {
    const reviews = createStudyCardReviews([
      { ...card, front: ' What is Solid? ', back: 'A web standard' },
      { ...card, front: 'what IS solid?', back: 'A   web standard' },
      { ...card, front: 'Different', back: 'Answer' }
    ])

    expect(duplicateStudyCardReviewIds(reviews)).toEqual(new Set(['card-2']))
  })

  it('creates pending candidates and preserves stable ids', () => {
    const reviews = createStudyCardReviews([card, { ...card, front: 'Second' }])
    expect(reviews.map(review => [review.id, review.status])).toEqual([
      ['card-1', 'pending'], ['card-2', 'pending']
    ])
  })

  it('edits a card and tracks accept/reject decisions', () => {
    let reviews = createStudyCardReviews([card, { ...card, front: 'Second' }])
    reviews = updateStudyCardReview(reviews, 'card-1', {
      card: { front: 'Edited front' },
      status: 'accepted'
    })
    reviews = updateStudyCardReview(reviews, 'card-2', { status: 'rejected' })

    expect(reviews[0].card.front).toBe('Edited front')
    expect(summarizeStudyCardReviews(reviews)).toEqual({ pending: 0, accepted: 1, rejected: 1 })
  })

  it('does not change another candidate when one is edited', () => {
    const reviews = createStudyCardReviews([card, { ...card, front: 'Second' }])
    const updated = updateStudyCardReview(reviews, 'card-1', { card: { back: 'Edited back' } })

    expect(updated[0].card.back).toBe('Edited back')
    expect(updated[0].status).toBe('pending')
    expect(updated[1]).toEqual(reviews[1])
  })
})
