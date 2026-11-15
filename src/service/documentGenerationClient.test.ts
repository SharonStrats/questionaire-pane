import { describe, expect, it, vi } from 'vitest'
import { DocumentGenerationClient } from './documentGenerationClient'

function response (body: unknown, ok = true): Response {
  return new Response(JSON.stringify(body), { status: ok ? 200 : 502, headers: { 'Content-Type': 'application/json' } })
}

describe('DocumentGenerationClient', () => {
  it('extracts a selected document and generates cards from it', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({
        filename: 'notes.md',
        mediaType: 'text/markdown',
        text: 'Facts',
        characters: 5,
        sourceDocumentHash: 'abc123',
        sourceDocumentVersion: 'sha256-abc123',
        warnings: []
      }))
      .mockResolvedValueOnce(response({
        title: 'notes.md',
        cards: [{ front: 'What?', back: 'Facts', sourceReference: 'notes.md', difficulty: 'easy' }]
      }))
    const client = new DocumentGenerationClient({ endpoint: 'https://services.example/', fetch })

    const document = await client.extract(new File(['Facts'], 'notes.md', { type: 'text/markdown' }))
    const cards = await client.generateFlashcards(document)

    expect(fetch).toHaveBeenCalledWith('https://services.example/api/import/document', expect.objectContaining({ method: 'POST' }))
    expect(fetch).toHaveBeenLastCalledWith('https://services.example/api/generate/flashcards', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"text":"Facts"')
    }))
    expect(cards.cards[0].front).toBe('What?')
  })

  it('rejects extracted documents without provenance metadata', async () => {
    const client = new DocumentGenerationClient({
      endpoint: 'https://services.example',
      fetch: vi.fn().mockResolvedValue(response({
        filename: 'notes.md',
        mediaType: 'text/markdown',
        text: 'Facts',
        characters: 5
      }))
    })

    await expect(client.extract(new File(['Facts'], 'notes.md', { type: 'text/markdown' })))
      .rejects.toMatchObject({ code: 'malformed' })
  })

  it('rejects malformed generation responses', async () => {
    const client = new DocumentGenerationClient({
      endpoint: 'https://services.example',
      fetch: vi.fn().mockResolvedValue(response({ title: 'empty', cards: [] }))
    })

    await expect(client.generateFlashcards({
      filename: 'notes.md',
      mediaType: 'text/markdown',
      text: 'Facts',
      characters: 5,
      sourceDocumentHash: 'abc123',
      sourceDocumentVersion: 'sha256-abc123',
      warnings: []
    })).rejects.toMatchObject({ code: 'malformed' })
  })
})
