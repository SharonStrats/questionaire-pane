import { describe, expect, it, vi } from 'vitest'
import { Fetcher, graph, parse, sym, type LiveStore } from 'rdflib'
import {
  loadStudyLearningProgress, recordStudyCardOutcome, selectStudySession, studyDeckMetrics,
  type StudyCardLearningState
} from './studyLearningProgress'

const user = sym('https://alice.example/profile/card#me')
const storage = 'https://alice.example/storage/'
const deck = 'https://teacher.example/decks/biology.ttl#deck'
const cardUri = 'https://teacher.example/decks/biology.ttl#card-1'
const now = new Date('2026-11-15T00:00:00Z')

function fixture () {
  const store = graph() as LiveStore
  const documents = new Map<string, { data: string, etag: string }>()
  const load = vi.fn(async (document: { uri: string }) => {
    const saved = documents.get(document.uri)
    if (!saved) throw Object.assign(new Error('Not found'), { status: 404 })
    store.removeStatements(store.statementsMatching(undefined, undefined, undefined, sym(document.uri)).slice())
    parse(saved.data, store, document.uri, 'text/turtle')
    return new Response(saved.data, { headers: { etag: saved.etag } })
  })
  const webOperation = vi.fn(async (_method: string, uri: string, options: { data: string, headers: Record<string, string> }) => {
    const saved = documents.get(uri)
    if (saved ? options.headers['If-Match'] !== saved.etag : options.headers['If-None-Match'] !== '*') {
      throw Object.assign(new Error('Conflict'), { status: 412 })
    }
    documents.set(uri, { data: options.data, etag: `"${Number(saved?.etag.replace(/"/g, '') ?? 0) + 1}"` })
    return new Response('', { status: 201 })
  })
  store.fetcher = { load, webOperation, _fetch: vi.fn(async () => new Response('', { status: 201 })) } as any
  return { store, load, webOperation, documents }
}

const learningState = (lastOutcome: StudyCardLearningState['lastOutcome'], dueAt: string): StudyCardLearningState => ({
  correct: Number(lastOutcome === 'correct'), incorrect: Number(lastOutcome === 'incorrect'),
  revealed: Number(lastOutcome === 'revealed'), streak: Number(lastOutcome === 'correct'),
  lastOutcome, dueAt, lastReviewed: now.toISOString()
})

describe('personal study learning progress', () => {
  it('creates both missing parent containers before the first document PUT on strict Solid servers', async () => {
    const { store, webOperation } = fixture()
    const containers = new Set([storage])
    const created: string[] = []
    store.fetcher!._fetch = vi.fn(async (input, options) => {
      const uri = String(input)
      const parent = uri.slice(0, uri.slice(0, -1).lastIndexOf('/') + 1)
      if (!containers.has(parent)) return new Response('', { status: 409 })
      expect(options?.method).toBe('PUT')
      expect(options?.headers).toEqual(expect.objectContaining({
        'If-None-Match': '*',
        Link: '<http://www.w3.org/ns/ldp#BasicContainer>; rel="type"'
      }))
      containers.add(uri)
      created.push(uri)
      return new Response('', { status: 201 })
    })
    const write = webOperation.getMockImplementation()!
    webOperation.mockImplementation(async (method, uri, options) => {
      const parent = uri.slice(0, uri.lastIndexOf('/') + 1)
      if (!containers.has(parent)) throw new Error('Missing parent container')
      return write(method, uri, options)
    })
    const empty = await loadStudyLearningProgress(store, user, storage, deck)
    expect(created).toEqual([])
    await recordStudyCardOutcome(store, empty, cardUri, 'correct', now)
    const userContainer = empty.progressDocument.uri.slice(0, empty.progressDocument.uri.lastIndexOf('/') + 1)
    expect(created).toEqual([`${storage}study-progress/`, userContainer])
    expect(webOperation).toHaveBeenCalledTimes(1)
  })

  it('round-trips real saved card URIs and counters in separate user/deck documents', async () => {
    const { store, documents } = fixture()
    const empty = await loadStudyLearningProgress(store, user, storage, deck)
    const otherDeck = await loadStudyLearningProgress(store, user, storage, `${deck}-other`)
    const otherUser = await loadStudyLearningProgress(store, sym('https://bob.example/#me'), storage, deck)
    expect(new Set([empty, otherDeck, otherUser].map(value => value.progressDocument.uri)).size).toBe(3)
    const first = await recordStudyCardOutcome(store, empty, cardUri, 'incorrect', now)
    await recordStudyCardOutcome(store, first, cardUri, 'revealed', new Date(now.getTime() + 1000))
    const latest = await recordStudyCardOutcome(store, empty, cardUri, 'correct', new Date(now.getTime() + 2000))
    expect(latest.cards[cardUri]).toMatchObject({ correct: 1, incorrect: 1, revealed: 1, streak: 1, lastOutcome: 'correct' })
    expect(latest.cards[cardUri].dueAt).toBe('2026-11-16T00:00:02.000Z')
    expect((await loadStudyLearningProgress(store, user, storage, deck)).cards).toEqual(latest.cards)
    expect(documents.get(empty.progressDocument.uri)?.data).toContain('quiz:card bio:card-1')
    expect((await loadStudyLearningProgress(store, user, storage, `${deck}-other`)).cards).toEqual({})
  })

  it('scores each deck card by its latest outcome and reports completion including untouched cards', async () => {
    const empty = await loadStudyLearningProgress(fixture().store, user, storage, deck)
    const deckCards = [cardUri, `${cardUri}-2`, `${cardUri}-3`]
    expect(studyDeckMetrics(empty, deckCards)).toEqual({ score: 0, completedCardCount: 0 })
    const progress = {
      ...empty,
      cards: {
        [cardUri]: { correct: 2, incorrect: 1, revealed: 0, streak: 0, lastOutcome: 'incorrect' as const, lastReviewed: now.toISOString(), dueAt: now.toISOString() },
        [`${cardUri}-2`]: { correct: 1, incorrect: 0, revealed: 1, streak: 0, lastOutcome: 'correct' as const, lastReviewed: now.toISOString(), dueAt: now.toISOString() }
      }
    }
    expect(studyDeckMetrics(progress, deckCards)).toEqual({ score: 33, completedCardCount: 2 })
  })

  it('prioritizes struggling and overdue cards, caps count and filters modes without changing the deck', async () => {
    const { store } = fixture()
    const progress = await loadStudyLearningProgress(store, user, storage, deck)
    const cards = Array.from({ length: 100 }, (_, i) => ({ uri: `${cardUri}-${i}`, front: `Q${i}` }))
    progress.cards[cards[60].uri] = learningState('incorrect', '2026-11-15T00:10:00Z')
    progress.cards[cards[61].uri] = learningState('correct', '2026-11-14T00:00:00Z')
    progress.cards[cards[62].uri] = learningState('correct', '2026-11-16T00:00:00Z')
    const selected = selectStudySession(cards, progress, { mode: 'all', count: 20 }, now)
    expect(selected).toHaveLength(20)
    expect(selected.slice(0, 3)).toEqual([cards[0], cards[1], cards[2]])
    expect(selected.every(card => !progress.cards[card.uri])).toBe(true)
    const fullDeck = selectStudySession(cards, progress, { mode: 'all', count: 100 }, now)
    expect(fullDeck.slice(0, 97).every(card => !progress.cards[card.uri])).toBe(true)
    expect(fullDeck.slice(97, 99)).toEqual([cards[60], cards[61]])
    expect(selectStudySession(cards, progress, { mode: 'needs-practice', count: 20 }, now)).toEqual([cards[60], cards[61]])
    expect(selectStudySession(cards, progress, { mode: 'new', count: 100 }, now)).toHaveLength(97)
    expect(selectStudySession([...cards, cards[0]], progress, { mode: 'all', count: 200 }, now)).toHaveLength(100)
    expect(cards[0].front).toBe('Q0')
    for (const count of [0, -1, 1.5, NaN, Infinity]) {
      expect(() => selectStudySession(cards, progress, { mode: 'all', count }, now)).toThrow('positive whole number')
    }
  })

  it('serializes concurrent writes and grows then resets the review interval', async () => {
    const { store, webOperation } = fixture()
    const empty = await loadStudyLearningProgress(store, user, storage, deck)
    await Promise.all([
      recordStudyCardOutcome(store, empty, cardUri, 'correct', now),
      recordStudyCardOutcome(store, empty, cardUri, 'correct', now)
    ])
    let latest = await loadStudyLearningProgress(store, user, storage, deck)
    expect(latest.cards[cardUri]).toMatchObject({ correct: 2, streak: 2, dueAt: '2026-11-18T00:00:00.000Z' })
    latest = await recordStudyCardOutcome(store, latest, cardUri, 'revealed', now)
    expect(latest.cards[cardUri]).toMatchObject({ correct: 2, incorrect: 0, revealed: 1, streak: 0, dueAt: '2026-11-15T00:10:00.000Z' })
    expect(webOperation.mock.calls[0][2].headers).toEqual({ 'If-None-Match': '*' })
    expect(webOperation.mock.calls[1][2].headers).toEqual({ 'If-Match': '"1"' })
  })

  it('uses rdflib fresh loading without accumulating old RDF values', async () => {
    const source = fixture()
    const empty = await loadStudyLearningProgress(source.store, user, storage, deck)
    await recordStudyCardOutcome(source.store, empty, cardUri, 'correct', now)
    let data = source.documents.get(empty.progressDocument.uri)!.data
    const store = graph() as LiveStore
    const fetch = vi.fn(async () => new Response(data, {
      status: 200, headers: { 'Content-Type': 'text/turtle', etag: '"1"' }
    }))
    store.fetcher = new Fetcher(store, { fetch })
    expect((await loadStudyLearningProgress(store, user, storage, deck)).cards[cardUri].correct).toBe(1)
    data = data.replace('quiz:correct "1"', 'quiz:correct "2"')
    expect((await loadStudyLearningProgress(store, user, storage, deck)).cards[cardUri].correct).toBe(2)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('only initializes on 404 and surfaces missing fetchers, denied access and failed writes', async () => {
    const { store, load, webOperation } = fixture()
    await expect(loadStudyLearningProgress(graph() as LiveStore, user, storage, deck)).rejects.toThrow('Missing fetcher')
    load.mockRejectedValueOnce(Object.assign(new Error('Forbidden'), { response: { status: 403 } }))
    await expect(loadStudyLearningProgress(store, user, storage, deck)).rejects.toThrow('Forbidden')
    const empty = await loadStudyLearningProgress(store, user, storage, deck)
    webOperation.mockRejectedValueOnce(new Error('Pod offline'))
    await expect(recordStudyCardOutcome(store, empty, cardUri, 'correct', now)).rejects.toThrow('Pod offline')
    expect(empty.cards).toEqual({})
    expect((await loadStudyLearningProgress(store, user, storage, deck)).cards).toEqual({})
  })

  it('does not overwrite conflicting, mismatched or malformed documents', async () => {
    const { store, load, documents, webOperation } = fixture()
    const empty = await loadStudyLearningProgress(store, user, storage, deck)
    await recordStudyCardOutcome(store, empty, cardUri, 'correct', now)
    const saved = documents.get(empty.progressDocument.uri)!
    documents.set(empty.progressDocument.uri, {
      ...saved, data: saved.data.replace(/dct:creator [^;]+;/, 'dct:creator <https://other.example/#me>;')
    })
    await expect(loadStudyLearningProgress(store, user, storage, deck)).rejects.toThrow('different user')
    documents.set(empty.progressDocument.uri, saved)
    load.mockImplementationOnce(async document => {
      store.removeStatements(store.statementsMatching(undefined, undefined, undefined, sym(document.uri)).slice())
      parse(saved.data, store, document.uri, 'text/turtle')
      return new Response(saved.data)
    })
    await expect(recordStudyCardOutcome(store, empty, cardUri, 'correct', now)).rejects.toThrow('ETag')
    webOperation.mockRejectedValueOnce(Object.assign(new Error('Conflict'), { status: 412 }))
    await expect(recordStudyCardOutcome(store, empty, cardUri, 'correct', now)).rejects.toThrow('Conflict')
    documents.set(empty.progressDocument.uri, { ...saved, data: saved.data.replace(/correct "1"/, 'correct "not-a-count"') })
    await expect(loadStudyLearningProgress(store, user, storage, deck)).rejects.toThrow('counter')
  })
})

