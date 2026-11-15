import { describe, expect, it } from 'vitest'
import { createStudyCardReviews, updateStudyCardReview } from './studyCardReview'
import { serializeSolidMemoDeck } from './solidMemoAdapter'

const card = { front: 'Front', back: 'Back', sourceReference: 'notes.md', difficulty: 'easy' as const }

describe('Solid Memo adapter', () => {
  it('projects accepted cards while retaining source provenance', () => {
    const reviews = updateStudyCardReview(createStudyCardReviews([card]), 'card-1', { status: 'accepted' })
    const turtle = serializeSolidMemoDeck('Notes', reviews)

    expect(turtle).toContain('a sm:Deck')
    expect(turtle).toContain('a sm:Card')
    expect(turtle).toContain('sm:front "Front"')
    expect(turtle).toContain('sm:back "Back"')
    expect(turtle).toContain('quiz:sourceLocator "notes.md"')
  })

  it('does not export an empty or unaccepted deck', () => {
    expect(() => serializeSolidMemoDeck('Notes', createStudyCardReviews([card])))
      .toThrow('Accept at least one study card before exporting.')
  })
})
