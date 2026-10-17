import { graph, literal, Namespace, st, sym } from 'rdflib'
import { describe, expect, it, vi } from 'vitest'
import { disco } from '../namespaces'
import { crawlQuestionnaireContainers, discoverSharedQuestionnaires, loadTypeIndexes, ownPublishedQuestionnaires, publishedQuestionnaireForTake } from './library'

const solid = (name: string) => sym(`http://www.w3.org/ns/solid/terms#${name}`)
const rdf = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#')

describe('type-index questionnaire registrations', () => {
  it('reports registrations independently for public and private indexes', async () => {
    const store = graph() as any
    const me = sym('https://pod.example/profile/card#me')
    const profile = me.doc()
    const publicIndex = sym('https://pod.example/settings/public.ttl')
    const privateIndex = sym('https://pod.example/settings/private.ttl')
    const publicSubject = sym('https://pod.example/public/index.ttl#this')
    const bothSubject = sym('https://pod.example/both/index.ttl#this')
    const registration = (index: ReturnType<typeof sym>, subject: ReturnType<typeof sym>, name: string) => {
      const node = sym(`${index.uri}#${name}`)
      store.add(st(node, rdf('type'), solid('TypeRegistration'), index))
      store.add(st(node, solid('forClass'), disco('Questionnaire'), index))
      store.add(st(node, solid('instance'), subject, index))
    }
    store.add(st(me, solid('publicTypeIndex'), publicIndex, profile))
    store.add(st(me, solid('privateTypeIndex'), privateIndex, profile))
    registration(publicIndex, publicSubject, 'public')
    registration(publicIndex, bothSubject, 'both-public')
    registration(privateIndex, bothSubject, 'both-private')
    store.fetcher = { load: vi.fn().mockResolvedValue(undefined) }

    await expect(loadTypeIndexes(store, me)).resolves.toEqual(new Map([
      [publicSubject.uri, { public: true, private: false }],
      [bothSubject.uri, { public: true, private: true }]
    ]))
  })
})

describe('questionnaire Pod crawling', () => {
  it('avoids cycles and stops at the container limit while reporting discoveries', async () => {
    const discovered: string[] = []
    const result = await crawlQuestionnaireContainers(
      ['https://pod.example/a/'],
      async url => ({
        children: url.endsWith('/a/') ? ['https://pod.example/b/'] : ['https://pod.example/a/', 'https://pod.example/c/'],
        questionnaire: url.endsWith('/b/') ? sym('https://pod.example/b/index.ttl#this') : undefined
      }),
      subject => discovered.push(subject.uri),
      { maxContainers: 2, concurrency: 1, timeoutMs: 100 }
    )

    expect(discovered).toEqual(['https://pod.example/b/index.ttl#this'])
    expect(result.scanned).toBe(2)
    expect(result.warnings).toContain('Stopped after 2 containers; results may be incomplete.')
  })

  describe('shared questionnaire discovery', () => {
    it('uses only known people public Type Index registrations for questionnaires', async () => {
      const store = graph() as any
      const alice = sym('https://alice.example/profile/card#me')
      const publicIndex = sym('https://alice.example/settings/public.ttl')
      const privateIndex = sym('https://alice.example/settings/private.ttl')
      const publicQuestionnaire = sym('https://alice.example/questionnaires/public/index.ttl#this')
      const privateQuestionnaire = sym('https://alice.example/questionnaires/private/index.ttl#this')
      const otherResource = sym('https://alice.example/notes/index.ttl#this')
      const registration = (index: ReturnType<typeof sym>, instance: ReturnType<typeof sym>, klass: any, name: string) => {
        const node = sym(`${index.uri}#${name}`)
        store.add(st(node, rdf('type'), solid('TypeRegistration'), index))
        store.add(st(node, solid('forClass'), klass, index))
        store.add(st(node, solid('instance'), instance, index))
      }

      store.add(st(alice, solid('publicTypeIndex'), publicIndex, alice.doc()))
      store.add(st(alice, solid('privateTypeIndex'), privateIndex, alice.doc()))
      registration(publicIndex, publicQuestionnaire, disco('Questionnaire'), 'public-questionnaire')
      registration(privateIndex, privateQuestionnaire, disco('Questionnaire'), 'private-questionnaire')
      registration(publicIndex, otherResource, disco('Note'), 'public-note')
      store.fetcher = { load: vi.fn().mockResolvedValue(undefined) }

      const results = await discoverSharedQuestionnaires(store, [
        { kind: 'person', uri: alice.uri, label: 'Alice' },
        { kind: 'group', uri: 'https://alice.example/groups/team#us', label: 'Team' }
      ])

      expect(results.map(result => result.subject.uri)).toEqual([publicQuestionnaire.uri])
      expect(results[0].sharedBy).toEqual({ uri: alice.uri, label: 'Alice' })
      expect(store.fetcher.load).not.toHaveBeenCalledWith(privateIndex.doc())
    })

    it('opens the latest published version of a registered questionnaire in Take', async () => {
      const store = graph() as any
      const questionnaire = sym('https://alice.example/questionnaires/shared/index.ttl#this')
      const oldVersion = sym('https://alice.example/questionnaires/shared/published/old/index.ttl#this')
      const latestVersion = sym('https://alice.example/questionnaires/shared/published/latest/index.ttl#this')
      const status = sym('https://schema.org/creativeWorkStatus')
      const quiz = sym('https://schema.org/Quiz')

      store.add(st(questionnaire, sym('http://purl.org/dc/terms/hasVersion'), oldVersion, questionnaire.doc()))
      store.add(st(questionnaire, sym('http://purl.org/dc/terms/hasVersion'), latestVersion, questionnaire.doc()))
      for (const [version, created] of [[oldVersion, '2026-01-01T00:00:00.000Z'], [latestVersion, '2026-02-01T00:00:00.000Z']] as const) {
        store.add(st(version, rdf('type'), quiz, version.doc()))
        store.add(st(version, status, literal('Published'), version.doc()))
        store.add(st(version, sym('http://purl.org/dc/terms/created'), literal(created), version.doc()))
      }
      store.fetcher = { load: vi.fn().mockResolvedValue(undefined) }

      await expect(publishedQuestionnaireForTake(store, questionnaire)).resolves.toEqual(latestVersion)
    })

    it('lists a logged-in user’s latest published version as a direct Take entry', async () => {
      const store = graph() as any
      const questionnaire = sym('https://pod.example/questionnaires/owned/index.ttl#this')
      const oldVersion = sym('https://pod.example/questionnaires/owned/published/old/index.ttl#this')
      const latestVersion = sym('https://pod.example/questionnaires/owned/published/latest/index.ttl#this')
      const draft = sym('https://pod.example/questionnaires/draft/index.ttl#this')
      const status = sym('https://schema.org/creativeWorkStatus')
      const quiz = sym('https://schema.org/Quiz')
      const created = sym('http://purl.org/dc/terms/created')

      store.add(st(questionnaire, sym('http://purl.org/dc/terms/hasVersion'), oldVersion, questionnaire.doc()))
      store.add(st(questionnaire, sym('http://purl.org/dc/terms/hasVersion'), latestVersion, questionnaire.doc()))
      for (const [version, date] of [[oldVersion, '2026-01-01T00:00:00.000Z'], [latestVersion, '2026-02-01T00:00:00.000Z']] as const) {
        store.add(st(version, rdf('type'), quiz, version.doc()))
        store.add(st(version, status, literal('Published'), version.doc()))
        store.add(st(version, created, literal(date), version.doc()))
      }
      store.fetcher = { load: vi.fn().mockResolvedValue(undefined) }

      const entries = await ownPublishedQuestionnaires(store, [questionnaire, draft, latestVersion])

      expect(entries.map(entry => entry.subject.uri)).toEqual([latestVersion.uri])
      await expect(publishedQuestionnaireForTake(store, entries[0].subject)).resolves.toEqual(latestVersion)
    })
  })
})
