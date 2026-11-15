import { describe, expect, it, vi } from 'vitest'
import { graph } from 'rdflib'
import { createStudyCardReviews, updateStudyCardReview } from './studyCardReview'
import { saveAcceptedStudyDeck } from './studyDeckPersistence'

const card = { front: 'Front', back: 'Back', sourceReference: 'notes.md', difficulty: 'easy' as const }

describe('study deck persistence', () => {
  it('creates a private deck container and writes accepted RDF after confirmation', async () => {
    const webOperation = vi.fn().mockResolvedValue(new Response('', { status: 201 }))
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 201 }))
    const store = { fetcher: { webOperation, _fetch: fetch }, graph: graph() } as any
    const reviews = updateStudyCardReview(createStudyCardReviews([card]), 'card-1', { status: 'accepted' })

    const document = await saveAcceptedStudyDeck(
      store,
      'https://pod.example/storage/',
      'Biology Notes',
      reviews,
      'notes.md',
      new Date('2026-11-15T00:00:00.000Z')
    )

    expect(document.uri).toBe('https://pod.example/storage/study-decks/biology-notes-2026-11-15T00-00-00-000Z/index.ttl')
    expect(webOperation).toHaveBeenCalledTimes(1)
    expect(webOperation).toHaveBeenCalledWith('PUT', document.uri, expect.objectContaining({
      data: expect.stringContaining('quiz:StudyCard'),
      contentType: 'text/turtle'
    }))
    const turtle = webOperation.mock.calls[0][2].data as string
    expect(turtle).toContain('quiz:sourceDocument "notes.md"')
    expect(turtle).toContain('quiz:sourceLocator "notes.md"')
  })

  it('does not call the fetcher when no card was accepted', async () => {
    const webOperation = vi.fn()
    const store = { fetcher: { webOperation }, graph: graph() } as any

    await expect(saveAcceptedStudyDeck(store, 'https://pod.example/storage', 'Empty', createStudyCardReviews([card])))
      .rejects.toThrow('Accept at least one study card')
    expect(webOperation).not.toHaveBeenCalled()
  })
})
