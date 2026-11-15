import { graph, literal, Namespace, st, sym } from 'rdflib'
import { describe, expect, it, vi } from 'vitest'
import { disco } from '../namespaces'
import { crawlQuestionnaireContainers, discoverInboxSharedQuestionnaires, discoverSharedQuestionnaires, loadTypeIndexes, ownPublishedQuestionnaires, publishedQuestionnaireForTake, questionnairesInWorkspace, sendQuestionnaireShareNotification } from './library'

const solid = (name: string) => sym(`http://www.w3.org/ns/solid/terms#${name}`)
const rdf = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#')
const ldp = Namespace('http://www.w3.org/ns/ldp#')

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
  it('finds workspace questionnaires without Type Index registrations', async () => {
    const store = graph() as any
    const workspace = sym('https://pod.example/Questionnaires/')
    const nestedFolder = sym('https://pod.example/Questionnaires/Personal/')
    const questionnaire = sym('https://pod.example/Questionnaires/Personal/index.ttl#this')

    store.add(st(workspace, ldp('contains'), nestedFolder, workspace.doc()))
    store.add(st(questionnaire, rdf('type'), disco('Questionnaire'), questionnaire.doc()))
    store.fetcher = { load: vi.fn().mockResolvedValue(undefined) }

    await expect(questionnairesInWorkspace(store, workspace.uri)).resolves.toEqual([questionnaire])
  })

  it('continues crawling nested folders when the workspace root has a questionnaire', async () => {
    const store = graph() as any
    const workspace = sym('https://pod.example/Questionnaires/')
    const rootQuestionnaire = sym('https://pod.example/Questionnaires/index.ttl#this')
    const nestedFolder = sym('https://pod.example/Questionnaires/Personal/')
    const nestedQuestionnaire = sym('https://pod.example/Questionnaires/Personal/index.ttl#this')

    store.add(st(workspace, ldp('contains'), nestedFolder, workspace.doc()))
    store.add(st(workspace, ldp('contains'), sym('https://pod.example/Questionnaires/index.ttl'), workspace.doc()))
    store.add(st(rootQuestionnaire, rdf('type'), disco('Questionnaire'), rootQuestionnaire.doc()))
    store.add(st(nestedQuestionnaire, rdf('type'), disco('Questionnaire'), nestedQuestionnaire.doc()))
    store.fetcher = { load: vi.fn().mockResolvedValue(undefined) }

    await expect(questionnairesInWorkspace(store, workspace.uri)).resolves.toEqual([
      rootQuestionnaire,
      nestedQuestionnaire
    ])
  })

  describe('questionnaire share notifications', () => {
    it('only exposes an inbox share after resolving its published questionnaire', async () => {
      const store = graph() as any
      const me = sym('https://recipient.example/profile/card#me')
      const inbox = sym('https://recipient.example/inbox/')
      const notification = sym('https://recipient.example/inbox/share-1')
      const duplicateNotification = sym('https://recipient.example/inbox/share-2')
      const draft = sym('https://sender.example/questionnaires/example/index.ttl#this')
      const published = sym('https://sender.example/questionnaires/example/published/1/index.ttl#this')
      const sender = sym('https://sender.example/profile/card#me')
      const quizType = sym('https://schema.org/Quiz')
      const status = sym('https://schema.org/creativeWorkStatus')
      const hasVersion = sym('http://purl.org/dc/terms/hasVersion')

      store.add(st(me, ldp('inbox'), inbox, me.doc()))
      store.add(st(inbox, ldp('contains'), notification, inbox.doc()))
      store.add(st(inbox, ldp('contains'), duplicateNotification, inbox.doc()))
      store.add(st(notification, rdf('type'), sym('https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#QuestionnaireShare'), notification.doc()))
      store.add(st(notification, sym('https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#sharedQuestionnaire'), draft, notification.doc()))
      store.add(st(notification, sym('https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#sharedBy'), sender, notification.doc()))
      store.add(st(notification, sym('http://purl.org/dc/terms/created'), literal('2026-11-13T08:00:00.000Z'), notification.doc()))
      store.add(st(duplicateNotification, rdf('type'), sym('https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#QuestionnaireShare'), duplicateNotification.doc()))
      store.add(st(duplicateNotification, sym('https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#sharedQuestionnaire'), draft, duplicateNotification.doc()))
      store.add(st(duplicateNotification, sym('https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#sharedBy'), sender, duplicateNotification.doc()))
      store.add(st(duplicateNotification, sym('http://purl.org/dc/terms/created'), literal('2026-11-13T09:00:00.000Z'), duplicateNotification.doc()))
      store.add(st(draft, hasVersion, published, draft.doc()))
      store.add(st(published, rdf('type'), quizType, published.doc()))
      store.add(st(published, status, literal('Published'), published.doc()))
      store.fetcher = { load: vi.fn().mockResolvedValue(undefined) }

      const entries = await discoverInboxSharedQuestionnaires(store, me)

      expect(entries).toHaveLength(1)
      expect(entries[0].subject).toEqual(published)
      expect(entries[0].notification).toEqual(duplicateNotification)
    })

    it('posts a Turtle share record to the recipient inbox', async () => {
      const store = graph() as any
      const sender = sym('https://sender.example/profile/card#me')
      const recipient = sym('https://recipient.example/profile/card#me')
      const questionnaire = sym('https://sender.example/questionnaires/published/index.ttl#this')
      const inbox = sym('https://recipient.example/inbox/')
      const webOperation = vi.fn().mockResolvedValue(new Response('', { status: 201 }))

      store.add(st(recipient, ldp('inbox'), inbox, recipient.doc()))
      store.fetcher = {
        load: vi.fn().mockResolvedValue(undefined),
        webOperation
      }

      await sendQuestionnaireShareNotification(store, sender, recipient, questionnaire)

      expect(webOperation).toHaveBeenCalledWith('POST', inbox.uri, expect.objectContaining({
        contentType: 'text/turtle',
        data: expect.stringContaining('quiz:QuestionnaireShare')
      }))
      expect(webOperation.mock.calls[0][2].data).toContain(questionnaire.uri)
      expect(webOperation.mock.calls[0][2].data).toContain(sender.uri)
    })

    it('fails explicitly when the recipient has no advertised inbox', async () => {
      const store = graph() as any
      const sender = sym('https://sender.example/profile/card#me')
      const recipient = sym('https://recipient.example/profile/card#me')
      const questionnaire = sym('https://sender.example/questionnaires/published/index.ttl#this')
      store.fetcher = { load: vi.fn().mockResolvedValue(undefined) }

      await expect(sendQuestionnaireShareNotification(store, sender, recipient, questionnaire))
        .rejects.toThrow('does not advertise an inbox')
    })
  })

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

    it('keeps only the latest published version when versions are registered directly', async () => {
      const store = graph() as any
      const questionnaire = sym('https://pod.example/questionnaires/owned/index.ttl#this')
      const oldVersion = sym('https://pod.example/questionnaires/owned/published/old/index.ttl#this')
      const latestVersion = sym('https://pod.example/questionnaires/owned/published/latest/index.ttl#this')
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

      const entries = await ownPublishedQuestionnaires(store, [oldVersion, latestVersion])

      expect(entries.map(entry => entry.subject.uri)).toEqual([latestVersion.uri])
    })
  })
})
