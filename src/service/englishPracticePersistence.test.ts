import { graph, parse, sym, type Fetcher, type LiveStore } from 'rdflib'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  loadEnglishPracticeAttempts,
  loadEnglishPracticeDraft,
  saveEnglishPracticeAttempt,
  saveEnglishPracticeDraft,
  type EnglishPracticeAttempt
} from './englishPracticePersistence'

vi.mock('./types', () => ({
  createContainerIfMissing: vi.fn().mockResolvedValue(false),
  ensureTrailingSlash: (uri: string) => uri.endsWith('/') ? uri : `${uri}/`
}))

const user = sym('https://learner.example/profile/card#me')
const workspace = 'https://learner.example/storage/Questionnaires/'
const feedback = {
  overallFeedback: 'Good use of evidence.',
  strengths: ['Clear point'],
  areasToImprove: ['Explain the example'],
  paragraphFeedback: [{ paragraph: 1, feedback: 'Clear support.', suggestion: 'Add a link.' }],
  needsReview: false
}

function fixture () {
  const store = graph() as LiveStore
  const documents = new Map<string, { data: string, etag: string }>()
  const load = vi.fn(async (document: { uri: string }) => {
    const saved = documents.get(document.uri)
    if (!saved) throw Object.assign(new Error('Not found'), { status: 404 })
    store.removeDocument(sym(document.uri))
    parse(saved.data, store, document.uri, 'text/turtle')
    return new Response(saved.data, { headers: { etag: saved.etag } })
  })
  const webOperation = vi.fn(async (_method: string, uri: string, options: {
    data: string
    headers: Record<string, string>
  }) => {
    const saved = documents.get(uri)
    const conditionMatches = saved
      ? options.headers['If-Match'] === saved.etag
      : options.headers['If-None-Match'] === '*'
    if (!conditionMatches) return new Response('', { status: 412 })
    const etag = `"${Number(saved?.etag.replace(/"/g, '') ?? 0) + 1}"`
    documents.set(uri, { data: options.data, etag })
    return new Response('', { status: 201, headers: { etag } })
  })
  store.fetcher = { load, webOperation } as unknown as Fetcher
  return { store, load, webOperation, documents }
}

function attempt (id: string, createdAt: string): EnglishPracticeAttempt {
  return {
    id,
    practiceType: 'paragraph',
    promptId: 'persuasive-1',
    prompt: 'Explain why students should or should not use phones during school breaks.',
    response: `Attempt ${id}`,
    feedback,
    createdAt
  }
}

describe('English practice Pod persistence', () => {
  beforeEach(() => vi.clearAllMocks())

  it('saves and restores private drafts per practice type and prompt', async () => {
    const { store, webOperation } = fixture()
    const draft = {
      practiceType: 'paragraph' as const,
      promptId: 'persuasive-1',
      response: 'My saved paragraph.',
      updatedAt: '2026-11-18T10:00:00.000Z'
    }

    await expect(loadEnglishPracticeDraft(store, user, workspace, draft.practiceType, draft.promptId))
      .resolves.toBeUndefined()
    await saveEnglishPracticeDraft(store, user, workspace, draft)

    await expect(loadEnglishPracticeDraft(store, user, workspace, draft.practiceType, draft.promptId))
      .resolves.toEqual(draft)
    expect(webOperation.mock.calls[0]?.[2].headers).toEqual({ 'If-None-Match': '*' })

    await saveEnglishPracticeDraft(store, user, workspace, { ...draft, response: 'Updated paragraph.' })
    expect(webOperation.mock.calls[1]?.[2].headers).toEqual({ 'If-Match': '"1"' })
    await expect(loadEnglishPracticeDraft(store, user, workspace, 'essay', 'persuasive-argumentative-1'))
      .resolves.toBeUndefined()
  })

  it('keeps every submitted response and feedback in an ordered history', async () => {
    const { store, documents } = fixture()
    const older = attempt('older', '2026-11-17T10:00:00.000Z')
    const newer = attempt('newer', '2026-11-18T10:00:00.000Z')

    await saveEnglishPracticeAttempt(store, user, workspace, older)
    await saveEnglishPracticeAttempt(store, user, workspace, newer)
    await saveEnglishPracticeAttempt(store, user, workspace, newer)

    await expect(loadEnglishPracticeAttempts(store, user, workspace)).resolves.toEqual([newer, older])
    const saved = documents.get(`${workspace}english-practice/attempts.ttl`)
    expect(saved?.data).toContain('Attempt older')
    expect(saved?.data).toContain('Attempt newer')
    expect(saved?.data).toContain('Good use of evidence.')
  })

  it('rejects history that belongs to another Pod user', async () => {
    const { store } = fixture()
    await saveEnglishPracticeDraft(store, user, workspace, {
      practiceType: 'paragraph',
      promptId: 'persuasive-1',
      response: 'Private response',
      updatedAt: '2026-11-18T10:00:00.000Z'
    })

    await expect(loadEnglishPracticeDraft(
      store, sym('https://another.example/profile/card#me'), workspace, 'paragraph', 'persuasive-1'
    )).rejects.toThrow(/different user/)
  })
})
