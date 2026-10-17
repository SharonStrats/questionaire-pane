import { sym, type LiveStore, type NamedNode } from 'rdflib'
import { questionairePredicates } from './questionairePredicates'
import { readQuestionTypeUri as readQuestionTypeUriFromStore } from './questionaireQuestionAccessors'
import { getQuestionnaireFormat } from './questionaireQuestionQueries'

export interface QuestionaireAnswerValue {
  questionUri: string
  answer: string | string[] | null
}

export interface QuestionaireQuestionScore {
  questionUri: string
  questionTypeUri: string
  availablePoints: number
  earnedPoints: number
  correct: boolean
}

export type SemanticAnswerResults = Record<string, boolean>

export interface QuestionaireScoreSummary {
  totalQuestions: number
  answeredQuestions: number
  availablePoints: number
  earnedPoints: number
  questionScores: QuestionaireQuestionScore[]
}

function normalizeTextAnswer (value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

function getQuestionPointsFromStore (store: LiveStore, question: any) {
  const raw = store.any(question, questionairePredicates.question.points, undefined, question.doc())?.value ?? '1'
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : 1
}

function readQuestionTypeUri (store: LiveStore, question: any) {
  return readQuestionTypeUriFromStore(store, question)
}

function readQuestionValueList (store: LiveStore, question: any, predicate: any) {
  return store
    .statementsMatching(question, predicate, undefined, question.doc())
    .map((statement) => statement.object.termType === 'NamedNode'
      ? store.any(statement.object, questionairePredicates.question.answerText, undefined, question.doc())?.value ?? ''
      : statement.object.value)
}

function readMatchPairs (store: LiveStore, question: NamedNode) {
  const doc = question.doc()
  const pairStatements = store.statementsMatching(
    question,
    questionairePredicates.question.matchPair,
    undefined,
    doc
  )
  if (pairStatements.length === 0) {
    const leftItems = readQuestionValueList(store, question, questionairePredicates.question.sourceItem)
    const rightItems = readQuestionValueList(store, question, questionairePredicates.question.targetItem)
    return leftItems.map((left, index) => [left, rightItems[index] ?? ''] as const)
  }

  return pairStatements
    .map((statement) => statement.object as NamedNode)
    .sort((left, right) => {
      const leftPosition = Number(store.any(left, questionairePredicates.question.position, undefined, doc)?.value ?? 0)
      const rightPosition = Number(store.any(right, questionairePredicates.question.position, undefined, doc)?.value ?? 0)
      return leftPosition - rightPosition
    })
    .map((pair) => [
      store.any(pair, questionairePredicates.question.sourceItem, undefined, doc)?.value ?? '',
      store.any(pair, questionairePredicates.question.targetItem, undefined, doc)?.value ?? ''
    ] as const)
}

function sameStringSet (left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false
  }

  const leftSorted = left.slice().sort()
  const rightSorted = right.slice().sort()
  return leftSorted.every((value, index) => value === rightSorted[index])
}

function answerAsArray (answer: string | string[] | null) {
  if (Array.isArray(answer)) {
    return answer.filter((value) => value.trim().length > 0)
  }

  return answer && answer.trim().length > 0 ? [answer] : []
}

function countFillInBlankSlots (title: string) {
  return Math.max(1, title.match(/\[_{2,}\]|_{3,}/g)?.length ?? 0)
}

export function evaluateQuestionAnswer (
  store: LiveStore,
  question: NamedNode,
  answer: string | string[] | null,
  semanticAnswerResults: SemanticAnswerResults = {}
): QuestionaireQuestionScore {
  const parent = store.any(question, questionairePredicates.question.isPartOf, undefined, question.doc())
  const parentNode = parent?.termType === 'NamedNode' ? parent as NamedNode : null
  const questionnaire = parentNode?.uri.endsWith('draft.ttl')
    ? sym(parentNode.uri.replace(/draft\.ttl$/, 'index.ttl'))
    : parentNode
  const format = questionnaire ? getQuestionnaireFormat(store, questionnaire) : 'quiz'
  const availablePoints = format === 'survey' ? 0 : getQuestionPointsFromStore(store, question)
  const questionTypeUri = readQuestionTypeUri(store, question)
  const normalizedAnswer = answerAsArray(answer)
  let correct = false

  if (format === 'survey') {
    return {
      questionUri: question.uri,
      questionTypeUri,
      availablePoints,
      earnedPoints: 0,
      correct: normalizedAnswer.length > 0
    }
  }

  const correctOptionValues = readQuestionValueList(store, question, questionairePredicates.question.correctOption)
  const answerValues = readQuestionValueList(store, question, questionairePredicates.question.answer)
  const itemValues = readQuestionValueList(store, question, questionairePredicates.question.item)
  const expected = answerValues.length > 0 ? answerValues : correctOptionValues

  if (questionTypeUri === questionairePredicates.question.questionType.multipleChoice.value || questionTypeUri === questionairePredicates.question.questionType.trueFalse.value) {
    correct = normalizedAnswer.length === 1 && correctOptionValues.some((value) => normalizeTextAnswer(value) === normalizeTextAnswer(normalizedAnswer[0]))
  } else if (questionTypeUri === questionairePredicates.question.questionType.selection.value) {
    const expected = correctOptionValues.map(normalizeTextAnswer)
    const actual = normalizedAnswer.map(normalizeTextAnswer)
    correct = expected.length > 0 && sameStringSet(expected, actual)
  } else if (questionTypeUri === questionairePredicates.question.questionType.fillInBlank.value) {
    const title = store.any(question, questionairePredicates.question.title, undefined, question.doc())?.value ?? ''
    const slotCount = Math.max(countFillInBlankSlots(title), expected.length)
    const correctAnswerCount = Array.from({ length: slotCount }, (_, index) =>
      normalizeTextAnswer(expected[index] ?? '') === normalizeTextAnswer(normalizedAnswer[index] ?? '') &&
      normalizeTextAnswer(expected[index] ?? '').length > 0
    ).filter(Boolean).length
    correct = slotCount > 0 && correctAnswerCount === slotCount
    return {
      questionUri: question.uri,
      questionTypeUri,
      availablePoints,
      earnedPoints: slotCount > 0 ? availablePoints * correctAnswerCount / slotCount : 0,
      correct
    }
  } else if (questionTypeUri === questionairePredicates.question.questionType.shortAnswer.value) {
    correct = question.uri in semanticAnswerResults
      ? semanticAnswerResults[question.uri]
      : expected.some((value) => normalizeTextAnswer(value) === normalizeTextAnswer(normalizedAnswer[0] ?? ''))
  } else if (questionTypeUri === questionairePredicates.question.questionType.ordering.value) {
    correct = itemValues.length > 0 && normalizedAnswer.length === itemValues.length && normalizedAnswer.every((value, index) => normalizeTextAnswer(value) === normalizeTextAnswer(itemValues[index] ?? ''))
  } else if (questionTypeUri === questionairePredicates.question.questionType.match.value) {
    const expectedPairs = readMatchPairs(store, question)
      .map(([left, right]) => `${normalizeTextAnswer(left)}|||${normalizeTextAnswer(right)}`)
    const actualPairs = normalizedAnswer.map(normalizeTextAnswer)
    correct = expectedPairs.length > 0 && sameStringSet(expectedPairs, actualPairs)
  } else {
    correct = false
  }

  return {
    questionUri: question.uri,
    questionTypeUri,
    availablePoints,
    earnedPoints: correct ? availablePoints : 0,
    correct
  }
}

export function calculateQuestionnaireScore (
  store: LiveStore,
  subject: any,
  answersByQuestionUri: Record<string, string | string[] | null>,
  semanticAnswerResults: SemanticAnswerResults = {}
): QuestionaireScoreSummary {
  const questionStatements = store.statementsMatching(subject, questionairePredicates.questionnaire.question, undefined, subject.doc())
  let availablePoints = 0
  let earnedPoints = 0
  const questionScores = questionStatements.map((statement) => {
    const question = statement.object as NamedNode
    const answer = answersByQuestionUri[question.uri] ?? null
    const score = evaluateQuestionAnswer(store, question, answer, semanticAnswerResults)
    availablePoints += score.availablePoints
    earnedPoints += score.earnedPoints
    return score
  })

  return {
    totalQuestions: questionStatements.length,
    answeredQuestions: Object.values(answersByQuestionUri).filter((value) => {
      if (Array.isArray(value)) {
        return value.length > 0
      }

      return Boolean(value && value.trim().length > 0)
    }).length,
    availablePoints,
    earnedPoints,
    questionScores
  }
}
