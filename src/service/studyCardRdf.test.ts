import { describe, expect, it } from 'vitest'
import { graph, parse, Namespace, sym } from 'rdflib'
import { createStudyCardReviews, updateStudyCardReview } from './studyCardReview'
import { serializeStudyDeck } from './studyCardRdf'

const card = { front: 'What is "solid"?', back: 'A linked data platform', sourceReference: 'notes.md', difficulty: 'easy' as const }

describe('study card RDF serialization', () => {
  it('serializes only accepted cards with escaped text and provenance', () => {
    let reviews = createStudyCardReviews([card, { ...card, front: 'Rejected' }])
    reviews = updateStudyCardReview(reviews, 'card-1', { status: 'accepted' })
    reviews = updateStudyCardReview(reviews, 'card-2', { status: 'rejected' })

    const turtle = serializeStudyDeck('Study "notes"', reviews, 'notes.md')

    expect(turtle).toContain('a quiz:StudyDeck')
    expect(turtle).toContain('quiz:studyCard <#card-1>')
    expect(turtle).not.toContain('card-2')
    expect(turtle).toContain('What is \\"solid\\"?')
    expect(turtle).toContain('quiz:sourceLocator "notes.md"')
    expect(turtle).not.toMatch(/pending|accepted|rejected/)
  })

  it('requires an explicit accepted card before serialization', () => {
    expect(() => serializeStudyDeck('Empty', createStudyCardReviews([card]))).toThrow(
      'Accept at least one study card before saving.'
    )
  })

  it('round-trips accepted card content and provenance as valid Turtle', () => {
    const reviews = updateStudyCardReview(createStudyCardReviews([card]), 'card-1', { status: 'accepted' })
    const turtle = serializeStudyDeck('Study notes', reviews, 'notes.md')
    const store = graph()
    parse(turtle, store, 'https://pod.example/study-decks/notes/index.ttl', 'text/turtle')
    const quiz = Namespace('https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#')
    const deck = sym('https://pod.example/study-decks/notes/index.ttl#deck')
    const cardSubject = sym('https://pod.example/study-decks/notes/index.ttl#card-1')

    expect(store.any(deck, quiz('name'))?.value).toBe('Study notes')
    expect(store.each(deck, quiz('studyCard'))).toHaveLength(1)
    expect(store.any(cardSubject, quiz('front'))?.value).toBe('What is "solid"?')
    expect(store.any(cardSubject, quiz('back'))?.value).toBe('A linked data platform')
    expect(store.any(cardSubject, quiz('sourceLocator'))?.value).toBe('notes.md')
  })
})
