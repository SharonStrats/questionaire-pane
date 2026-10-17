import { graph, sym } from 'rdflib'
import { describe, expect, it, vi } from 'vitest'
import { questionairePredicates } from './questionairePredicates'
import { shareQuestionnaireResults } from './shareQuestionnaireResults'

const creator = sym('https://creator.example/profile#me')
const questionnaire = sym('https://creator.example/published/v1/index.ttl#this')
const results = sym('https://creator.example/published/v1/responses/')

function fixture () {
  const store = graph()
  store.add(questionnaire, questionairePredicates.questionnaire.creator, creator, questionnaire.doc())
  store.add(questionnaire, questionairePredicates.questionnaire.hasPart, results, questionnaire.doc())
  const plan = { inserts: [] }
  const acl = {
    planGrantContainerContents: vi.fn().mockResolvedValue(plan),
    applyPlan: vi.fn().mockResolvedValue(new Response('', { status: 200 }))
  }
  return { store: store as any, acl, plan }
}

describe('shareQuestionnaireResults', () => {
  it('grants the published results folder and its contents to the questionnaire creator', async () => {
    const { store, acl, plan } = fixture()

    await shareQuestionnaireResults(store, acl, questionnaire)

    expect(acl.planGrantContainerContents).toHaveBeenCalledWith(
      results,
      { type: 'agent', iri: creator.value },
      ['Read']
    )
    expect(acl.applyPlan).toHaveBeenCalledWith(plan)
  })

  it.each([
    ['missing', (store: any) => store.removeMatches(questionnaire, questionairePredicates.questionnaire.creator, undefined, questionnaire.doc())],
    ['invalid', (store: any) => {
      store.removeMatches(questionnaire, questionairePredicates.questionnaire.creator, undefined, questionnaire.doc())
      store.add(questionnaire, questionairePredicates.questionnaire.creator, sym('mailto:creator@example.com'), questionnaire.doc())
    }]
  ])('rejects a %s creator WebID', async (_label, mutate) => {
    const { store, acl } = fixture()
    mutate(store)

    await expect(shareQuestionnaireResults(store, acl, questionnaire)).rejects.toThrow(/creator.*WebID/i)
    expect(acl.planGrantContainerContents).not.toHaveBeenCalled()
  })

  it('surfaces ACL plan failures', async () => {
    const { store, acl } = fixture()
    acl.planGrantContainerContents.mockRejectedValue(new Error('ACL lookup failed'))

    await expect(shareQuestionnaireResults(store, acl, questionnaire)).rejects.toThrow('ACL lookup failed')
  })

  it('surfaces ACL apply failures', async () => {
    const { store, acl } = fixture()
    acl.applyPlan.mockResolvedValue(new Response('', { status: 500 }))

    await expect(shareQuestionnaireResults(store, acl, questionnaire)).rejects.toThrow('HTTP 500')
  })
})
