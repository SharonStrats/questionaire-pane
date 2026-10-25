import { graph, sym } from 'rdflib'
import { describe, expect, it, vi } from 'vitest'
import { questionairePredicates } from './questionairePredicates'
import { shareQuestionnaireResults } from './shareQuestionnaireResults'

const creator = sym('https://creator.example/profile#me')
const user = sym('https://taker.example/profile#me')
const storage = sym('https://taker.example/storage/')
const questionnaire = sym('https://creator.example/published/v1/index.ttl#this')

function fixture () {
  const store = graph()
  store.add(questionnaire, questionairePredicates.questionnaire.creator, creator, questionnaire.doc())
  store.add(user, sym('http://www.w3.org/ns/pim/space#storage'), storage, user.doc())
  ;(store as any).fetcher = {
    load: vi.fn().mockResolvedValue(undefined),
    _fetch: vi.fn().mockResolvedValue(new Response('', { status: 201 })),
    webOperation: vi.fn().mockResolvedValue(new Response('', { status: 201 }))
  }
  const plan = { inserts: [] }
  const acl = {
    planGrantContainerContents: vi.fn().mockResolvedValue(plan),
    applyPlan: vi.fn().mockResolvedValue(new Response('', { status: 200 }))
  }
  return { store: store as any, acl, plan, options: {
    earnedPoints: 8,
    availablePoints: 10,
    answers: { 'https://creator.example/published/v1/questions/q1.ttl': 'Answer' },
    questionUris: ['https://creator.example/published/v1/questions/q1.ttl'],
    user,
    storage
  } }
}

describe('shareQuestionnaireResults', () => {
  it('grants the published results folder and its contents to the questionnaire creator', async () => {
    const { store, acl, plan, options } = fixture()

    const result = await shareQuestionnaireResults(store, acl, questionnaire, options)

    expect(acl.planGrantContainerContents).toHaveBeenCalledWith(
      result.resultContainer,
      { type: 'agent', iri: creator.value },
      ['Read']
    )
    expect(acl.applyPlan).toHaveBeenCalledWith(plan)
    expect(store.fetcher._fetch).toHaveBeenCalled()
  })

  it.each([
    ['missing', (store: any) => store.removeMatches(questionnaire, questionairePredicates.questionnaire.creator, undefined, questionnaire.doc())],
    ['invalid', (store: any) => {
      store.removeMatches(questionnaire, questionairePredicates.questionnaire.creator, undefined, questionnaire.doc())
      store.add(questionnaire, questionairePredicates.questionnaire.creator, sym('mailto:creator@example.com'), questionnaire.doc())
    }]
  ])('rejects a %s creator WebID', async (_label, mutate) => {
    const { store, acl, options } = fixture()
    mutate(store)

    await expect(shareQuestionnaireResults(store, acl, questionnaire, options)).rejects.toThrow(/creator.*WebID/i)
    expect(acl.planGrantContainerContents).not.toHaveBeenCalled()
  })

  it('surfaces ACL plan failures', async () => {
    const { store, acl, options } = fixture()
    acl.planGrantContainerContents.mockRejectedValue(new Error('ACL lookup failed'))

    await expect(shareQuestionnaireResults(store, acl, questionnaire, options)).rejects.toThrow('ACL lookup failed')
  })

  it('surfaces ACL apply failures', async () => {
    const { store, acl, options } = fixture()
    acl.applyPlan.mockResolvedValue(new Response('', { status: 500 }))

    await expect(shareQuestionnaireResults(store, acl, questionnaire, options)).rejects.toThrow('HTTP 500')
  })
})
