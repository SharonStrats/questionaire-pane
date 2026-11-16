// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'
import { graph, literal, sym, type LiveStore, type Statement } from 'rdflib'
import { createQuestionaireMutations } from './questionMutations'
import { questionairePredicates } from './predicates'
import { readQuestionGradingCriteria } from './questionAccessors'

describe('weighted grading criteria persistence', () => {
  it('replaces legacy literals with ordered weighted criterion resources', async () => {
    const store = graph() as LiveStore
    const update = vi.fn(async (deleted: Statement[], inserted: Statement[]) => {
      store.removeStatements(deleted)
      inserted.forEach(statement => {
        store.add(statement.subject, statement.predicate, statement.object, statement.why)
      })
    })
    Object.defineProperty(store, 'fetcher', { value: { load: vi.fn().mockResolvedValue(undefined) } })
    Object.defineProperty(store, 'updater', { value: { update } })
    const question = sym('https://pod.example/questions/q1.ttl#this')
    store.add(
      question,
      questionairePredicates.question.gradingCriteria,
      literal('legacy criterion'),
      question.doc()
    )

    await createQuestionaireMutations(store).updateQuestionGradingCriteria({
      question,
      criteria: [
        { criterion: 'mentions sunlight', points: 2 },
        { criterion: 'explains food production', points: 1 }
      ]
    })

    expect(store.statementsMatching(question, questionairePredicates.question.gradingCriteria, undefined, question.doc()))
      .toHaveLength(0)
    expect(readQuestionGradingCriteria(store, question)).toEqual([
      { criterion: 'mentions sunlight', points: 2 },
      { criterion: 'explains food production', points: 1 }
    ])
    const weightDatatypes = store.statementsMatching(
      undefined,
      questionairePredicates.question.criterionPoints,
      undefined,
      question.doc()
    ).map(statement => {
      if (statement.object.termType !== 'Literal') throw new Error('Expected criterion weight literals.')
      return statement.object.datatype.value
    })
    expect(weightDatatypes).toEqual([
      'http://www.w3.org/2001/XMLSchema#integer',
      'http://www.w3.org/2001/XMLSchema#integer'
    ])
    expect(update).toHaveBeenCalledOnce()
  })

  it('rejects invalid weights before making a Pod update', async () => {
    const store = graph() as LiveStore
    const update = vi.fn()
    Object.defineProperty(store, 'fetcher', { value: { load: vi.fn().mockResolvedValue(undefined) } })
    Object.defineProperty(store, 'updater', { value: { update } })
    const question = sym('https://pod.example/questions/q1.ttl#this')

    await expect(createQuestionaireMutations(store).updateQuestionGradingCriteria({
      question,
      criteria: [{ criterion: 'mentions sunlight', points: 0 }]
    })).rejects.toThrow('positive whole-number weight')
    expect(update).not.toHaveBeenCalled()
  })
})
