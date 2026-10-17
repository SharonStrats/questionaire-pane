import { graph, literal, st, sym, type LiveStore, type NamedNode } from 'rdflib'
import { describe, expect, it } from 'vitest'
import { questionairePredicates } from './questionairePredicates'
import { calculateQuestionnaireScore } from './questionaireQuestionScoring'

function addMatchPair (
  store: LiveStore,
  question: NamedNode,
  position: number,
  left: string,
  right: string
) {
  const doc = question.doc()
  const pair = sym(`${question.uri}#match-pair-${position}`)
  store.add(st(question, questionairePredicates.question.matchPair, pair, doc))
  store.add(st(pair, questionairePredicates.question.position, literal(String(position)), doc))
  store.add(st(pair, questionairePredicates.question.sourceItem, literal(left), doc))
  store.add(st(pair, questionairePredicates.question.targetItem, literal(right), doc))
}

describe('calculateQuestionnaireScore', () => {
  it('scores every correct match pair when separate source and target triples have a different order', () => {
    const store = graph() as LiveStore
    const questionnaire = sym('https://pod.example/questionnaire/index.ttl#this')
    const draft = sym('https://pod.example/questionnaire/draft.ttl')
    const question = sym('https://pod.example/questionnaire/draft/questions/q1.ttl')
    const indexDoc = questionnaire.doc()
    const questionDoc = question.doc()

    store.add(st(questionnaire, questionairePredicates.question.rdfType, questionairePredicates.questionnaire.quizType, indexDoc))
    store.add(st(questionnaire, questionairePredicates.questionnaire.question, question, indexDoc))
    store.add(st(question, questionairePredicates.question.isPartOf, draft, questionDoc))
    store.add(st(question, questionairePredicates.question.eduQuestionType, literal('Match'), questionDoc))

    // Legacy top-level triples can be reordered by an RDF store. Pair resources
    // retain the author-defined source/target identity independently of that order.
    store.add(st(question, questionairePredicates.question.sourceItem, literal('Pizza'), questionDoc))
    store.add(st(question, questionairePredicates.question.sourceItem, literal('Running'), questionDoc))
    store.add(st(question, questionairePredicates.question.sourceItem, literal('Swimming'), questionDoc))
    store.add(st(question, questionairePredicates.question.sourceItem, literal('Tennis'), questionDoc))
    store.add(st(question, questionairePredicates.question.targetItem, literal('Racket'), questionDoc))
    store.add(st(question, questionairePredicates.question.targetItem, literal('bathers'), questionDoc))
    store.add(st(question, questionairePredicates.question.targetItem, literal('tennis shoes'), questionDoc))
    store.add(st(question, questionairePredicates.question.targetItem, literal('Mozzerella'), questionDoc))

    addMatchPair(store, question, 1, 'Pizza', 'Mozzerella')
    addMatchPair(store, question, 2, 'Running', 'tennis shoes')
    addMatchPair(store, question, 3, 'Swimming', 'bathers')
    addMatchPair(store, question, 4, 'Tennis', 'Racket')

    const score = calculateQuestionnaireScore(store, questionnaire, {
      [question.uri]: [
        'Pizza|||Mozzerella',
        'Running|||tennis shoes',
        'Swimming|||bathers',
        'Tennis|||Racket'
      ]
    })

    expect(score.earnedPoints).toBe(1)
    expect(score.questionScores).toEqual([expect.objectContaining({
      questionUri: question.uri,
      correct: true,
      earnedPoints: 1
    })])
  })

  it('awards one point per fill-in-the-blank answer', () => {
    const store = graph() as LiveStore
    const questionnaire = sym('https://pod.example/fill-questionnaire/index.ttl#this')
    const draft = sym('https://pod.example/fill-questionnaire/draft.ttl')
    const question = sym('https://pod.example/fill-questionnaire/draft/questions/q1.ttl')
    const indexDoc = questionnaire.doc()
    const questionDoc = question.doc()

    store.add(st(questionnaire, questionairePredicates.question.rdfType, questionairePredicates.questionnaire.quizType, indexDoc))
    store.add(st(questionnaire, questionairePredicates.questionnaire.question, question, indexDoc))
    store.add(st(question, questionairePredicates.question.isPartOf, draft, questionDoc))
    store.add(st(question, questionairePredicates.question.eduQuestionType, literal('Fill in the blank'), questionDoc))
    store.add(st(question, questionairePredicates.question.title, literal('The [____] is [____].'), questionDoc))
    store.add(st(question, questionairePredicates.question.points, literal('2'), questionDoc))
    store.add(st(question, questionairePredicates.question.answer, literal('sky'), questionDoc))
    store.add(st(question, questionairePredicates.question.answer, literal('blue'), questionDoc))

    const partial = calculateQuestionnaireScore(store, questionnaire, {
      [question.uri]: ['sky', 'green']
    })
    expect(partial.questionScores[0]).toEqual(expect.objectContaining({
      availablePoints: 2,
      earnedPoints: 1,
      correct: false
    }))

    const complete = calculateQuestionnaireScore(store, questionnaire, {
      [question.uri]: ['sky', 'blue']
    })
    expect(complete.questionScores[0]).toEqual(expect.objectContaining({
      availablePoints: 2,
      earnedPoints: 2,
      correct: true
    }))
  })
})
