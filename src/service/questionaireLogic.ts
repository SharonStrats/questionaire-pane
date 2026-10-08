import {
  buildTurtleDocument,
  createContainerIfMissing,
  createDocumentIfMissing,
  ensureTrailingSlash,
  slugifyQuestionaireSegment,
  type QuestionaireQuestionOptions,
  type QuestionaireQuestionResult,
  type QuestionaireStructureOptions,
  type QuestionaireStructureResult
} from './questionaireTypes'
import { type NamedNode, Namespace, literal, st, sym, type Statement, type Store } from 'rdflib'
import { ns } from 'solid-ui'
import { DISCO_URI, disco, quiz } from '../namespaces'

const dct = Namespace('http://purl.org/dc/terms/')
const quizQuestion = quiz('question')
const quizHint = quiz('hint')
const quizPoints = quiz('points')
const quizOption = quiz('option')
const quizCorrectOption = quiz('correctOption')
const quizAnswer = quiz('answer')
const quizItem = quiz('item')
const quizLeftItem = quiz('leftItem')
const quizRightItem = quiz('rightItem')
const multipleChoiceQuestionTypeUri = quiz('MultipleChoiceQuestion').value

function registerQuestionairePrefix (store: Store) {
  const registerPrefix = (store as Store & {
    setPrefixForURI?: (prefix: string, uri: string) => void
  }).setPrefixForURI
  registerPrefix?.call(store, 'disco', DISCO_URI)
}

export function getQuestionnaireFormat (store: Store, subject: NamedNode): 'quiz' | 'survey' {
  if (store.holds(subject, ns.rdf('type'), quiz('Survey'))) {
    return 'survey'
  }

  if (store.holds(subject, ns.rdf('type'), quiz('Quiz'))) {
    return 'quiz'
  }

  return 'quiz'
}

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

function getQuestionPointsFromStore (store: Store, question: any) {
  const raw = store.any(question, quizPoints, undefined, question.doc())?.value ?? '1'
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) ? parsed : 1
}

function readQuestionTypeUri (store: Store, question: any) {
  return store.any(question, ns.rdf('type'), undefined, question.doc())?.value ?? ''
}

function readQuestionValueList (store: Store, question: any, predicate: any) {
  return store
    .statementsMatching(question, predicate, undefined, question.doc())
    .map((statement) => statement.object.value)
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

export function evaluateQuestionAnswer (
  store: Store,
  question: NamedNode,
  answer: string | string[] | null
): QuestionaireQuestionScore {
  const availablePoints = getQuestionPointsFromStore(store, question)
  const questionTypeUri = readQuestionTypeUri(store, question)
  const normalizedAnswer = answerAsArray(answer)
  let correct = false

  const correctOptionValues = readQuestionValueList(store, question, quizCorrectOption)
  const answerValues = readQuestionValueList(store, question, quizAnswer)
  const itemValues = readQuestionValueList(store, question, quizItem)
  const leftItemValues = readQuestionValueList(store, question, quizLeftItem)
  const rightItemValues = readQuestionValueList(store, question, quizRightItem)

  if (questionTypeUri === quiz('MultipleChoiceQuestion').value || questionTypeUri === quiz('TrueFalseQuestion').value) {
    correct = normalizedAnswer.length === 1 && correctOptionValues.some((value) => normalizeTextAnswer(value) === normalizeTextAnswer(normalizedAnswer[0]))
  } else if (questionTypeUri === quiz('SelectionQuestion').value) {
    const expected = correctOptionValues.map(normalizeTextAnswer)
    const actual = normalizedAnswer.map(normalizeTextAnswer)
    correct = expected.length > 0 && sameStringSet(expected, actual)
  } else if (questionTypeUri === quiz('FillInTheBlankQuestion').value || questionTypeUri === quiz('ShortAnswerQuestion').value) {
    const expected = answerValues.length > 0 ? answerValues : correctOptionValues
    correct = expected.some((value) => normalizeTextAnswer(value) === normalizeTextAnswer(normalizedAnswer[0] ?? ''))
  } else if (questionTypeUri === quiz('OrderingQuestion').value) {
    correct = itemValues.length > 0 && normalizedAnswer.length === itemValues.length && normalizedAnswer.every((value, index) => normalizeTextAnswer(value) === normalizeTextAnswer(itemValues[index] ?? ''))
  } else if (questionTypeUri === quiz('MatchQuestion').value) {
    const expectedPairs = leftItemValues.map((left, index) => `${normalizeTextAnswer(left)}|||${normalizeTextAnswer(rightItemValues[index] ?? '')}`)
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
  store: Store,
  subject: NamedNode,
  answersByQuestionUri: Record<string, string | string[] | null>
): QuestionaireScoreSummary {
  const questionStatements = store.statementsMatching(subject, quizQuestion, undefined, subject.doc())
  let availablePoints = 0
  let earnedPoints = 0
  const questionScores = questionStatements.map((statement) => {
    const question = statement.object as NamedNode
    const answer = answersByQuestionUri[question.uri] ?? null
    const score = evaluateQuestionAnswer(store, question, answer)
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

export function createQuestionaireLogic (store: Store) {
  registerQuestionairePrefix(store)

  async function createQuestionnaireDocument (doc: NamedNode, turtle: string) {
    return createDocumentIfMissing(store, doc, turtle)
  }

  async function updateQuestionnaireTitle (options: { baseUrl: string, title: string }) {
    const fetcher = store.fetcher
    const updater = store.updater
    if (!fetcher || !updater) {
      throw new Error('Missing fetcher or updater on questionnaire store')
    }

    const baseUrl = ensureTrailingSlash(options.baseUrl)
    const index = sym(`${baseUrl}index.ttl#this`)
    const indexDoc = index.doc()

    await fetcher.load(indexDoc)

    const del = [
      ...store.statementsMatching(index, dct('title'), undefined, indexDoc)
    ]
    const ins = [
      st(index, dct('title'), literal(options.title), indexDoc)
    ]

    await updater.update(del, ins)
  }

  async function updateQuestionnaireDescription (options: { baseUrl: string, description: string }) {
    const fetcher = store.fetcher
    const updater = store.updater
    if (!fetcher || !updater) {
      throw new Error('Missing fetcher or updater on questionnaire store')
    }

    const baseUrl = ensureTrailingSlash(options.baseUrl)
    const draft = sym(`${baseUrl}draft.ttl`)
    const draftDoc = draft.doc()

    await fetcher.load(draftDoc)

    const del = [
      ...store.statementsMatching(draft, dct('description'), undefined, draftDoc)
    ]
    const ins = options.description.trim()
      ? [st(draft, dct('description'), literal(options.description), draftDoc)]
      : []

    await updater.update(del, ins)
  }

  async function updateQuestionnaireFormat (options: { baseUrl: string, format: 'quiz' | 'survey' }) {
    const fetcher = store.fetcher
    const updater = store.updater
    if (!fetcher || !updater) {
      throw new Error('Missing fetcher or updater on questionnaire store')
    }

    const baseUrl = ensureTrailingSlash(options.baseUrl)
    const index = sym(`${baseUrl}index.ttl#this`)
    const indexDoc = index.doc()

    await fetcher.load(indexDoc)

    const nextType = options.format === 'survey' ? quiz('Survey') : quiz('Quiz')
    const del = [
      ...store.statementsMatching(index, ns.rdf('type'), quiz('Quiz'), indexDoc),
      ...store.statementsMatching(index, ns.rdf('type'), quiz('Survey'), indexDoc)
    ]
    const ins = [
      st(index, ns.rdf('type'), nextType, indexDoc)
    ]

    await updater.update(del, ins)
  }

  async function addQuestionToQuestionnaire (
    options: QuestionaireQuestionOptions
  ): Promise<QuestionaireQuestionResult> {
    const fetcher = store.fetcher
    const updater = store.updater
    if (!fetcher || !updater) {
      throw new Error('Missing fetcher or updater on questionnaire store')
    }

    const baseUrl = ensureTrailingSlash(options.baseUrl)
    const draft = sym(`${baseUrl}draft.ttl`)
    const draftDoc = draft.doc()
    const draftQuestionsUri = `${baseUrl}draft/questions/`
    const questionPredicate = sym(options.questionPredicateUri || quizQuestion.value)
    const questionType = sym(options.questionTypeUri || multipleChoiceQuestionTypeUri)
    const isMultipleChoice = questionType.value === multipleChoiceQuestionTypeUri

    await createContainerIfMissing(store, draftQuestionsUri)
    await fetcher.load(draftDoc)

    const existingQuestionCount = store
      .statementsMatching(draft, questionPredicate, undefined, draftDoc)
      .length
    const questionNumber = existingQuestionCount + 1
    const questionSlug = slugifyQuestionaireSegment(options.title) || `question-${questionNumber}`
    const question = sym(`${draftQuestionsUri}q${questionNumber}.ttl`)
    const questionDoc = question.doc()
    const created = options.created ?? new Date()

    const questionTurtle = buildTurtleDocument(questionDoc, scratch => {
      scratch.add(question, ns.rdf('type'), questionType, questionDoc)
      scratch.add(question, dct('title'), literal(options.title), questionDoc)
      scratch.add(question, dct('created'), created as any, questionDoc)
      scratch.add(question, dct('isPartOf'), draft, questionDoc)
      if (options.author) {
        scratch.add(question, dct('creator'), options.author, questionDoc)
      }
      scratch.add(question, dct('identifier'), literal(questionSlug), questionDoc)
      if (options.hint?.trim()) {
        scratch.add(question, quizHint, literal(options.hint), questionDoc)
      }
      const questionPoints = options.points ?? 1
      scratch.add(question, quizPoints, literal(String(questionPoints)), questionDoc)
      const questionOptions = options.options ?? []
      questionOptions.forEach((option) => {
        scratch.add(question, quizOption, literal(option), questionDoc)
      })
      const correctOption = options.correctOption ?? (isMultipleChoice ? questionOptions[0] : null)
      if (correctOption) {
        scratch.add(question, quizCorrectOption, literal(correctOption), questionDoc)
      }
      options.answers?.forEach((answer) => {
        scratch.add(question, quizAnswer, literal(answer), questionDoc)
      })
      options.items?.forEach((item) => {
        scratch.add(question, quizItem, literal(item), questionDoc)
      })
      options.leftItems?.forEach((item) => {
        scratch.add(question, quizLeftItem, literal(item), questionDoc)
      })
      options.rightItems?.forEach((item) => {
        scratch.add(question, quizRightItem, literal(item), questionDoc)
      })
    })

    await createDocumentIfMissing(store, questionDoc, questionTurtle)
    await updater.update([], [st(draft, questionPredicate, question, draftDoc)])

    return { question, questionDoc, questionNumber }
  }

  async function createQuestionnaireStructure (options: QuestionaireStructureOptions): Promise<QuestionaireStructureResult> {
    const baseUrl = ensureTrailingSlash(options.baseUrl)
    const index = sym(`${baseUrl}index.ttl#this`)
    const indexDoc = index.doc()
    const draft = sym(`${baseUrl}draft.ttl`)
    const draftDoc = draft.doc()
    const draftQuestions = sym(`${baseUrl}draft/questions/`)

    await createContainerIfMissing(store, baseUrl)
    await createContainerIfMissing(store, `${baseUrl}draft/`)
    await createContainerIfMissing(store, `${baseUrl}draft/questions/`)

    const created = options.created ?? new Date()
    const author = options.author ?? null
    const indexTurtle = buildTurtleDocument(indexDoc, scratch => {
      scratch.add(index, ns.rdf('type'), disco('Questionnaire'), indexDoc)
      scratch.add(index, ns.rdf('type'), quiz('Quiz'), indexDoc)
      scratch.add(index, dct('title'), literal(options.title), indexDoc)
      scratch.add(index, dct('created'), created as any, indexDoc)
      if (author) {
        scratch.add(index, dct('creator'), author, indexDoc)
      }
      scratch.add(index, dct('hasPart'), draft, indexDoc)
      scratch.add(index, dct('hasPart'), draftQuestions, indexDoc)
    })

    const draftTurtle = buildTurtleDocument(draftDoc, scratch => {
      scratch.add(draft, ns.rdf('type'), quiz('QuizDraft'), draftDoc)
      scratch.add(draft, dct('isPartOf'), index, draftDoc)
      scratch.add(draft, dct('hasPart'), draftQuestions, draftDoc)
    })

    await createDocumentIfMissing(store, indexDoc, indexTurtle)
    await createDocumentIfMissing(store, draftDoc, draftTurtle)

    return { index, draft, draftQuestions }
  }

  async function updateQuestionText (options: { question: NamedNode, title: string }) {
    const fetcher = store.fetcher
    const updater = store.updater
    if (!fetcher || !updater) {
      throw new Error('Missing fetcher or updater on questionnaire store')
    }

    const questionDoc = options.question.doc()
    await fetcher.load(questionDoc)

    const del = [
      ...store.statementsMatching(options.question, dct('title'), undefined, questionDoc)
    ]
    const title = options.title.trim()
    const ins = title
      ? [st(options.question, dct('title'), literal(title), questionDoc)]
      : []

    await updater.update(del, ins)
  }

  async function updateQuestionHint (options: { question: NamedNode, hint: string }) {
    const fetcher = store.fetcher
    const updater = store.updater
    if (!fetcher || !updater) {
      throw new Error('Missing fetcher or updater on questionnaire store')
    }

    const questionDoc = options.question.doc()
    await fetcher.load(questionDoc)

    const del = [
      ...store.statementsMatching(options.question, quizHint, undefined, questionDoc)
    ]
    const hint = options.hint.trim()
    const ins = hint
      ? [st(options.question, quizHint, literal(hint), questionDoc)]
      : []

    await updater.update(del, ins)
  }

  async function updateQuestionPoints (options: { question: NamedNode, points: number }) {
    const fetcher = store.fetcher
    const updater = store.updater
    if (!fetcher || !updater) {
      throw new Error('Missing fetcher or updater on questionnaire store')
    }

    const questionDoc = options.question.doc()
    await fetcher.load(questionDoc)

    const del = [
      ...store.statementsMatching(options.question, quizPoints, undefined, questionDoc)
    ]
    const ins = [
      st(options.question, quizPoints, literal(String(options.points)), questionDoc)
    ]

    await updater.update(del, ins)
  }

  async function updateQuestionOptions (options: { question: NamedNode, options: string[], correctOption?: string | null, correctOptions?: string[] | null }) {
    const fetcher = store.fetcher
    const updater = store.updater
    if (!fetcher || !updater) {
      throw new Error('Missing fetcher or updater on questionnaire store')
    }

    const questionDoc = options.question.doc()
    await fetcher.load(questionDoc)

    const normalizedOptions = options.options.map((option) => option.trim())
    const desiredCorrectOptions = options.correctOptions?.map((option) => option.trim()).filter((option) => option.length > 0)
    const desiredCorrectOption = options.correctOption?.trim()
    const desiredCorrectValues = desiredCorrectOptions ?? (
      desiredCorrectOption
        ? [desiredCorrectOption]
        : (normalizedOptions.length > 0 ? [normalizedOptions[0]] : [])
    )

    const currentOptionStatements = store.statementsMatching(options.question, quizOption, undefined, questionDoc)
    const currentCorrectOptionStatements = store.statementsMatching(options.question, quizCorrectOption, undefined, questionDoc)
    const currentOptionValues = currentOptionStatements.map((statement) => statement.object.value)
    const currentCorrectOptionValues = currentCorrectOptionStatements.map((statement) => statement.object.value)

    const del: Statement[] = []
    const ins: Statement[] = []

    const applyMultisetDiff = (
      currentStatements: Statement[],
      currentValues: string[],
      desiredValues: string[],
      predicate: NamedNode
    ) => {
      const remainingCurrent = currentStatements.slice()
      const remainingCurrentValues = currentValues.slice()

      desiredValues.forEach((desiredValue) => {
        const currentIndex = remainingCurrentValues.indexOf(desiredValue)
        if (currentIndex >= 0) {
          remainingCurrent.splice(currentIndex, 1)
          remainingCurrentValues.splice(currentIndex, 1)
          return
        }

        ins.push(st(options.question, predicate as any, literal(desiredValue), questionDoc))
      })

      remainingCurrent.forEach((statement) => {
        del.push(statement)
      })
    }

    applyMultisetDiff(currentOptionStatements, currentOptionValues, normalizedOptions, quizOption as any)
    applyMultisetDiff(currentCorrectOptionStatements, currentCorrectOptionValues, desiredCorrectValues, quizCorrectOption as any)

    await updater.update(del, ins)
  }

  async function updateQuestionAnswers (options: { question: NamedNode, answers: string[] }) {
    const fetcher = store.fetcher
    const updater = store.updater
    if (!fetcher || !updater) {
      throw new Error('Missing fetcher or updater on questionnaire store')
    }

    const questionDoc = options.question.doc()
    await fetcher.load(questionDoc)

    const del = [
      ...store.statementsMatching(options.question, quizAnswer, undefined, questionDoc)
    ]
    const ins = options.answers
      .map((answer) => answer.trim())
      .filter((answer) => answer.length > 0)
      .map((answer) => st(options.question, quizAnswer, literal(answer), questionDoc))

    await updater.update(del, ins)
  }

  async function updateQuestionItems (options: { question: NamedNode, items: string[] }) {
    const fetcher = store.fetcher
    const updater = store.updater
    if (!fetcher || !updater) {
      throw new Error('Missing fetcher or updater on questionnaire store')
    }

    const questionDoc = options.question.doc()
    await fetcher.load(questionDoc)

    const del = [
      ...store.statementsMatching(options.question, quizItem, undefined, questionDoc)
    ]
    const ins = options.items
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .map((item) => st(options.question, quizItem, literal(item), questionDoc))

    await updater.update(del, ins)
  }

  async function updateQuestionMatchPairs (options: { question: NamedNode, leftItems: string[], rightItems: string[] }) {
    const fetcher = store.fetcher
    const updater = store.updater
    if (!fetcher || !updater) {
      throw new Error('Missing fetcher or updater on questionnaire store')
    }

    const questionDoc = options.question.doc()
    await fetcher.load(questionDoc)

    const del = [
      ...store.statementsMatching(options.question, quizLeftItem, undefined, questionDoc),
      ...store.statementsMatching(options.question, quizRightItem, undefined, questionDoc)
    ]
    const leftItems = options.leftItems.map((item) => item.trim()).filter((item) => item.length > 0)
    const rightItems = options.rightItems.map((item) => item.trim()).filter((item) => item.length > 0)
    const ins = [
      ...leftItems.map((item) => st(options.question, quizLeftItem, literal(item), questionDoc)),
      ...rightItems.map((item) => st(options.question, quizRightItem, literal(item), questionDoc))
    ]

    await updater.update(del, ins)
  }

  async function deleteQuestionFromQuestionnaire (options: { baseUrl: string, question: NamedNode }) {
    const fetcher = store.fetcher
    const updater = store.updater
    if (!fetcher || !updater) {
      throw new Error('Missing fetcher or updater on questionnaire store')
    }

    const baseUrl = ensureTrailingSlash(options.baseUrl)
    const draft = sym(`${baseUrl}draft.ttl`)
    const draftDoc = draft.doc()
    const questionPredicate = sym(quizQuestion.value)
    const questionDoc = options.question.doc()

    await fetcher.load(draftDoc)

    const del = [
      ...store.statementsMatching(draft, questionPredicate, options.question, draftDoc)
    ]

    await updater.update(del, [])

    try {
      await fetcher.webOperation('DELETE', questionDoc.uri, {})
    } finally {
      store.removeDocument(questionDoc)
    }
  }

  return {
    addQuestionToQuestionnaire,
    createQuestionnaireDocument,
    deleteQuestionFromQuestionnaire,
    updateQuestionnaireDescription,
    updateQuestionnaireTitle,
    updateQuestionnaireFormat,
    createQuestionnaireStructure,
    updateQuestionText,
    updateQuestionHint,
    updateQuestionPoints,
    updateQuestionOptions,
    updateQuestionAnswers,
    updateQuestionItems,
    updateQuestionMatchPairs
  }
}