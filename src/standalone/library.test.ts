import { graph, Namespace, st, sym } from 'rdflib'
import { describe, expect, it, vi } from 'vitest'
import { disco } from '../namespaces'
import { crawlQuestionnaireContainers, loadTypeIndexes } from './library'

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
})
