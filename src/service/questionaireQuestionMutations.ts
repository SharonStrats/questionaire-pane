import { Collection, graph, Namespace, type LiveStore, type NamedNode, literal, serialize, st, sym, type Statement } from 'rdflib'
import { ns } from 'solid-ui'
import { DISCO_URI, disco } from '../namespaces'
import {
  buildTurtleDocument,
  createContainerIfMissing,
  createDocumentIfMissing,
  ensureTrailingSlash,
  type QuestionaireQuestionOptions,
  type QuestionaireQuestionResult,
  type QuestionaireStructureOptions,
  type QuestionaireStructureResult
} from './questionaireTypes'
import { questionairePredicates } from './questionairePredicates'
import { nextPublishedVersion } from './publishedVersion'

const dct = Namespace('http://purl.org/dc/terms/')
const schema = Namespace('https://schema.org/')

function questionTypeLabel (questionType: NamedNode) {
  const labels: Record<string, string> = {
    MultipleChoiceQuestion: 'Multiple choice',
    SelectionQuestion: 'Selection',
    TrueFalseQuestion: 'True or false',
    FillInTheBlankQuestion: 'Fill in the blank',
    ShortAnswerQuestion: 'Short answer',
    OrderingQuestion: 'Ordering',
    MatchQuestion: 'Match',
    ConfidenceQuestion: 'Confidence'
  }

  return labels[questionType.value.split('#').pop() ?? ''] ?? 'Custom'
}

const quiz = (fragment: string) => {
  switch (fragment) {
    case 'question':
      return questionairePredicates.questionnaire.question
    case 'hint':
      return questionairePredicates.question.hint
    case 'points':
      return questionairePredicates.question.points
    case 'option':
      return questionairePredicates.question.option
    case 'correctOption':
      return questionairePredicates.question.correctOption
    case 'answer':
      return questionairePredicates.question.answer
    case 'item':
      return questionairePredicates.question.item
    case 'leftItem':
      return questionairePredicates.question.sourceItem
    case 'rightItem':
      return questionairePredicates.question.targetItem
    case 'MultipleChoiceQuestion':
      return questionairePredicates.question.questionType.multipleChoice
    case 'SelectionQuestion':
      return questionairePredicates.question.questionType.selection
    case 'TrueFalseQuestion':
      return questionairePredicates.question.questionType.trueFalse
    case 'FillInTheBlankQuestion':
      return questionairePredicates.question.questionType.fillInBlank
    case 'ShortAnswerQuestion':
      return questionairePredicates.question.questionType.shortAnswer
    case 'OrderingQuestion':
      return questionairePredicates.question.questionType.ordering
    case 'MatchQuestion':
      return questionairePredicates.question.questionType.match
    case 'ConfidenceQuestion':
      return questionairePredicates.question.questionType.confidence
    case 'Quiz':
      return questionairePredicates.questionnaire.quizType
    case 'QuizDraft':
      return questionairePredicates.questionnaire.quizType
    case 'Survey':
      return questionairePredicates.questionnaire.surveyType
    case 'PublishedQuiz':
      return questionairePredicates.questionnaire.quizType
    default:
      throw new Error(`Unsupported quiz predicate fragment: ${fragment}`)
  }
}

const quizQuestion = questionairePredicates.questionnaire.question
const quizHint = quiz('hint')
const quizPoints = quiz('points')
const quizOption = quiz('option')
const quizCorrectOption = quiz('correctOption')
const quizAnswer = quiz('answer')
const answerClass = questionairePredicates.question.answerClass
const answerText = questionairePredicates.question.answerText
const eduQuestionType = questionairePredicates.question.eduQuestionType
const questionImage = questionairePredicates.question.image
const orderedItems = questionairePredicates.question.orderedItems
const itemListElement = questionairePredicates.question.itemListElement
const listItemClass = questionairePredicates.question.listItemClass
const itemPredicate = questionairePredicates.question.item
const itemPosition = questionairePredicates.question.position
const quizLeftItem = quiz('leftItem')
const quizRightItem = quiz('rightItem')
const quizMatchPair = questionairePredicates.question.matchPair
const multipleChoiceQuestionTypeUri = quiz('MultipleChoiceQuestion').value
const documentUpdateQueues = new Map<string, Promise<unknown>>()

function answerResource (question: NamedNode, kind: 'option' | 'answer', index: number) {
  return sym(`${question.doc().uri}#${kind}-${index + 1}`)
}

function registerQuestionairePrefix (store: LiveStore) {
  const registerPrefix = (store as LiveStore & {
    setPrefixForURI?: (prefix: string, uri: string) => void
  }).setPrefixForURI
  registerPrefix?.call(store, 'disco', DISCO_URI)
}

async function enqueueDocumentUpdate<T> (
  document: NamedNode,
  update: () => Promise<T>
): Promise<T> {
  const previous = documentUpdateQueues.get(document.value)
  const current = (previous
    ? previous.then(update, update)
    : update())
  documentUpdateQueues.set(document.value, current)

  try {
    return await current
  } finally {
    if (documentUpdateQueues.get(document.value) === current) {
      documentUpdateQueues.delete(document.value)
    }
  }
}

export interface QuestionaireMutationService {
  createQuestionnaireDocument(doc: NamedNode, turtle: string): Promise<boolean>
  updateQuestionnaireTitle(options: { baseUrl: string, title: string }): Promise<void>
  updateQuestionnaireDescription(options: { baseUrl: string, description: string }): Promise<void>
  updateQuestionnaireFormat(options: { baseUrl: string, format: 'quiz' | 'survey' }): Promise<void>
  addQuestionToQuestionnaire(options: QuestionaireQuestionOptions): Promise<QuestionaireQuestionResult>
  createQuestionnaireStructure(options: QuestionaireStructureOptions): Promise<QuestionaireStructureResult>
  publishQuestionnaire(options: { subject: NamedNode }): Promise<{ snapshot: NamedNode, responseContainer: NamedNode, version: string }>
  updateQuestionText(options: { question: NamedNode, title: string }): Promise<void>
  updateQuestionImage(options: { question: NamedNode, image: string }): Promise<void>
  updateQuestionHint(options: { question: NamedNode, hint: string }): Promise<void>
  updateQuestionPoints(options: { question: NamedNode, points: number }): Promise<void>
  updateQuestionOptions(options: { question: NamedNode, options: string[], correctOption?: string | null, correctOptions?: string[] | null }): Promise<void>
  updateQuestionAnswers(options: { question: NamedNode, answers: string[] }): Promise<void>
  updateQuestionItems(options: { question: NamedNode, items: string[] }): Promise<void>
  updateQuestionMatchPairs(options: { question: NamedNode, leftItems: string[], rightItems: string[] }): Promise<void>
  deleteQuestionFromQuestionnaire(options: { baseUrl: string, question: NamedNode }): Promise<void>
}

export function createQuestionaireMutations (store: LiveStore): QuestionaireMutationService {
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
      ...store.statementsMatching(index, questionairePredicates.questionnaire.title, undefined, indexDoc)
    ]
    const ins = [
      st(index, questionairePredicates.questionnaire.title, literal(options.title), indexDoc)
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
    const draft = sym(`${baseUrl}draft.ttl`)
    const draftDoc = draft.doc()
    await fetcher.load(draftDoc)
    const del = [
      ...store.statementsMatching(index, ns.rdf('type'), quiz('Quiz'), indexDoc),
      ...store.statementsMatching(index, ns.rdf('type'), quiz('Survey'), indexDoc),
      ...store.statementsMatching(draft, ns.rdf('type'), quiz('Quiz'), draftDoc),
      ...store.statementsMatching(draft, ns.rdf('type'), quiz('Survey'), draftDoc)
    ]
    const ins = [
      st(index, ns.rdf('type'), nextType, indexDoc),
      st(draft, ns.rdf('type'), nextType, draftDoc)
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
    const questionIdentifier = `q${questionNumber}`
    const question = sym(`${draftQuestionsUri}q${questionNumber}.ttl`)
    const questionDoc = question.doc()
    const created = options.created ?? new Date()

    const questionTurtle = buildTurtleDocument(questionDoc, scratch => {
      scratch.add(question, ns.rdf('type'), schema('Question'), questionDoc)
      scratch.add(question, questionairePredicates.question.title, literal(options.title), questionDoc)
      if (options.image?.trim()) {
        scratch.add(question, questionImage, sym(options.image.trim()), questionDoc)
      }
      scratch.add(question, eduQuestionType, literal(questionTypeLabel(questionType)), questionDoc)
      scratch.add(question, dct('created'), created as any, questionDoc)
      scratch.add(question, dct('isPartOf'), draft, questionDoc)
      if (options.author) {
        scratch.add(question, dct('creator'), options.author, questionDoc)
      }
      scratch.add(question, dct('identifier'), literal(questionIdentifier), questionDoc)
      if (options.hint?.trim()) {
        scratch.add(question, quizHint, literal(options.hint), questionDoc)
      }
      const questionPoints = options.points ?? 1
      scratch.add(question, quizPoints, literal(String(questionPoints)), questionDoc)
      const questionOptions = options.options ?? []
      const correctOption = options.correctOption ?? (isMultipleChoice ? questionOptions[0] : null)
      questionOptions.forEach((option, index) => {
        const answer = answerResource(question, 'option', index)
        scratch.add(question, option === correctOption ? quizCorrectOption : quizOption, answer, questionDoc)
        scratch.add(answer, ns.rdf('type'), answerClass, questionDoc)
        scratch.add(answer, answerText, literal(option), questionDoc)
      })
      options.answers?.forEach((answerValue, index) => {
        const answer = answerResource(question, 'answer', index)
        scratch.add(question, quizAnswer, answer, questionDoc)
        scratch.add(answer, ns.rdf('type'), answerClass, questionDoc)
        scratch.add(answer, answerText, literal(answerValue), questionDoc)
      })
      if (options.items?.length) {
        const list = sym(`${question.doc().uri}#ordered-items`)
        scratch.add(question, orderedItems, list, questionDoc)
        scratch.add(list, ns.rdf('type'), schema('ItemList'), questionDoc)
        const listItems: NamedNode[] = []
        options.items.forEach((item, index) => {
          const listItem = sym(`${question.doc().uri}#ordered-item-${index + 1}`)
          const itemResource = sym(`${question.doc().uri}#ordered-value-${index + 1}`)
          listItems.push(listItem)
          scratch.add(listItem, ns.rdf('type'), listItemClass, questionDoc)
          scratch.add(listItem, itemPosition, literal(String(index + 1)), questionDoc)
          scratch.add(listItem, itemPredicate, itemResource, questionDoc)
          scratch.add(itemResource, answerText, literal(item), questionDoc)
        })
        listItems.forEach((listItem) => {
          scratch.add(list, itemListElement, listItem, questionDoc)
        })
      }
      const matchPairs = (options.leftItems ?? [])
        .map((leftItem, index) => ({
          leftItem: leftItem.trim(),
          rightItem: options.rightItems?.[index]?.trim() ?? ''
        }))
        .filter(({ leftItem, rightItem }) => leftItem.length > 0 && rightItem.length > 0)
      matchPairs.forEach(({ leftItem }) => {
        scratch.add(question, quizLeftItem, literal(leftItem), questionDoc)
      })
      matchPairs.forEach(({ rightItem }) => {
        scratch.add(question, quizRightItem, literal(rightItem), questionDoc)
      })
      matchPairs.forEach(({ leftItem, rightItem }, index) => {
        const pair = sym(`${question.doc().uri}#match-pair-${index + 1}`)
        scratch.add(question, quizMatchPair, pair, questionDoc)
        scratch.add(pair, quizLeftItem, literal(leftItem), questionDoc)
        scratch.add(pair, quizRightItem, literal(rightItem), questionDoc)
        scratch.add(pair, itemPosition, literal(String(index + 1)), questionDoc)
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
    await createContainerIfMissing(store, `${baseUrl}images/`)

    const created = options.created ?? new Date()
    const author = options.author ?? null
    const indexTurtle = buildTurtleDocument(indexDoc, scratch => {
      scratch.add(index, ns.rdf('type'), disco('Questionnaire'), indexDoc)
      scratch.add(index, ns.rdf('type'), quiz('Quiz'), indexDoc)
      scratch.add(index, questionairePredicates.questionnaire.title, literal(options.title), indexDoc)
      scratch.add(index, questionairePredicates.questionnaire.status, literal('Draft'), indexDoc)
      scratch.add(index, dct('created'), created as any, indexDoc)
      if (author) {
        scratch.add(index, dct('creator'), author, indexDoc)
      }
      scratch.add(index, dct('hasPart'), draft, indexDoc)
      scratch.add(index, dct('hasPart'), draftQuestions, indexDoc)
      scratch.add(index, dct('hasPart'), sym(`${baseUrl}images/`), indexDoc)
    })

    const draftTurtle = buildTurtleDocument(draftDoc, scratch => {
      scratch.add(draft, ns.rdf('type'), questionairePredicates.questionnaire.quizType, draftDoc)
      scratch.add(draft, questionairePredicates.questionnaire.status, literal('Draft'), draftDoc)
      scratch.add(draft, dct('isPartOf'), index, draftDoc)
      scratch.add(draft, dct('hasPart'), draftQuestions, draftDoc)
    })

    await createDocumentIfMissing(store, indexDoc, indexTurtle)
    await createDocumentIfMissing(store, draftDoc, draftTurtle)

    return { index, draft, draftQuestions }
  }

  async function publishQuestionnaire (options: { subject: NamedNode }) {
    const fetcher = store.fetcher
    const updater = store.updater
    if (!fetcher || !updater) {
      throw new Error('Missing fetcher or updater on questionnaire store')
    }

    const index = options.subject
    const indexDoc = index.doc()
    const baseUrl = ensureTrailingSlash(indexDoc.uri.replace(/index\.ttl$/, ''))
    const draft = sym(`${baseUrl}draft.ttl`)
    const draftDoc = draft.doc()

    await fetcher.load(indexDoc)
    await fetcher.load(draftDoc)

    const existingVersions = store.each(index, dct('hasVersion'), undefined, indexDoc)
      .filter((version): version is NamedNode => version.termType === 'NamedNode')
      .map((version) => version.uri)
    const version = nextPublishedVersion(existingVersions)
    const publishedBaseUrl = `${baseUrl}published/${version}/`
    const publishedQuestionsUrl = `${publishedBaseUrl}questions/`
    const publishedResponsesUrl = `${publishedBaseUrl}responses/`
    const snapshot = sym(`${publishedBaseUrl}index.ttl#this`)
    const snapshotDoc = snapshot.doc()
    const responseContainer = sym(publishedResponsesUrl)

    await createContainerIfMissing(store, `${baseUrl}published/`)
    await createContainerIfMissing(store, publishedBaseUrl)
    await createContainerIfMissing(store, publishedQuestionsUrl)
    await createContainerIfMissing(store, publishedResponsesUrl)
    const publishedImagesUrl = `${publishedBaseUrl}images/`
    await createContainerIfMissing(store, publishedImagesUrl)

    const questionStatements = [...store.statementsMatching(draft, quizQuestion, undefined, draftDoc)]
    const title = store.any(index, questionairePredicates.questionnaire.title, undefined, indexDoc)
    const creator = store.any(index, questionairePredicates.questionnaire.creator, undefined, indexDoc)
    const questionLinks: NamedNode[] = []

    for (const statement of questionStatements) {
      if (statement.object.termType !== 'NamedNode') {
        continue
      }

      const sourceQuestion = statement.object
      const sourceQuestionDoc = sourceQuestion.doc()
      await fetcher.load(sourceQuestionDoc)

      const questionFile = sourceQuestionDoc.uri.split('/').pop() ?? 'question.ttl'
      const publishedQuestion = sym(`${publishedQuestionsUrl}${questionFile}`)
      const publishedQuestionDoc = publishedQuestion.doc()
      const questionGraph = graph()
      // Published questions must be self-contained.  In particular, options,
      // accepted answers, and ItemList entries are blank resources in the
      // draft document; copying only the question's direct triples leaves the
      // published take view with no labels or ordering values.
      const copied = new Set<string>()
      const mapNode = (node: NamedNode) => {
        if (node.value.startsWith(`${baseUrl}images/`)) {
          return sym(`${publishedImagesUrl}${node.value.split('/').pop()}`)
        }
        return sym(`${publishedQuestionDoc.uri}${node.value.slice(sourceQuestionDoc.uri.length)}`)
      }
      const copyResource = (source: NamedNode, target: NamedNode) => {
        if (copied.has(source.value)) return
        copied.add(source.value)
        store.statementsMatching(source, undefined, undefined, sourceQuestionDoc).forEach((questionStatement) => {
          const object = questionStatement.predicate.equals(questionairePredicates.question.isPartOf)
            ? snapshot
            : questionStatement.object.termType === 'NamedNode' &&
                questionStatement.object.value.startsWith(`${baseUrl}images/`)
              ? mapNode(questionStatement.object as NamedNode)
              : questionStatement.object.termType === 'NamedNode'
                ? mapNode(questionStatement.object as NamedNode)
                : (questionStatement.object as any).termType === 'Collection'
                  ? new Collection(((questionStatement.object as any).elements ?? []).map((member: any) =>
                    member.termType === 'NamedNode' ? mapNode(member) : member
                  ))
                : questionStatement.object
          questionGraph.add(target, questionStatement.predicate, object, publishedQuestionDoc)
          if (questionStatement.object.termType === 'NamedNode' &&
              !questionStatement.predicate.equals(questionairePredicates.question.isPartOf) &&
              !(questionStatement.object as NamedNode).value.startsWith(`${baseUrl}images/`)) {
            copyResource(questionStatement.object as NamedNode, object as NamedNode)
          }
          // rdflib Collections are serialized through their RDF list members.
          if ((questionStatement.object as any).termType === 'Collection') {
            for (const member of ((questionStatement.object as any).elements ?? [])) {
              if (member.termType === 'NamedNode') {
                copyResource(member, mapNode(member))
              }
            }
          }
        })
      }
      copyResource(sourceQuestion, publishedQuestion)
      const questionTurtle = serialize(
        publishedQuestionDoc,
        questionGraph,
        publishedQuestionDoc.uri,
        'text/turtle'
      ) as string

      await createDocumentIfMissing(store, publishedQuestionDoc, questionTurtle)
      const image = store.any(sourceQuestion, questionImage, undefined, sourceQuestionDoc)
      if (image?.termType === 'NamedNode' && image.value.startsWith(`${baseUrl}images/`)) {
        const imageResponse = await fetcher.webOperation('GET', image.value)
        if (!imageResponse.ok) {
          throw new Error(`Unable to read questionnaire image ${image.value}`)
        }
        const imageUri = `${publishedImagesUrl}${image.value.split('/').pop()}`
        const imageData = await imageResponse.arrayBuffer()
        await fetcher.webOperation('PUT', imageUri, {
          data: imageData,
          contentType: imageResponse.headers.get('content-type') || 'application/octet-stream'
        } as any)
      }
      questionLinks.push(publishedQuestion)
    }

    const publishedType = store.holds(index, ns.rdf('type'), questionairePredicates.questionnaire.surveyType, indexDoc)
      ? questionairePredicates.questionnaire.surveyType
      : questionairePredicates.questionnaire.quizType
    const snapshotTurtle = buildTurtleDocument(snapshotDoc, scratch => {
      scratch.add(snapshot, ns.rdf('type'), publishedType, snapshotDoc)
      scratch.add(snapshot, questionairePredicates.questionnaire.status, literal('Published'), snapshotDoc)
      if (title) {
        scratch.add(snapshot, questionairePredicates.questionnaire.title, title, snapshotDoc)
      }
      if (creator) {
        scratch.add(snapshot, dct('creator'), creator, snapshotDoc)
      }
      scratch.add(snapshot, dct('created'), literal(new Date().toISOString()), snapshotDoc)
      scratch.add(snapshot, dct('hasPart'), responseContainer, snapshotDoc)
      questionLinks.forEach((question) => {
        scratch.add(snapshot, questionairePredicates.questionnaire.question, question, snapshotDoc)
      })
    })

    await createDocumentIfMissing(store, snapshotDoc, snapshotTurtle)

    await updater.update([], [
      st(index, dct('hasVersion'), snapshot, indexDoc),
      st(index, dct('modified'), literal(new Date().toISOString()), indexDoc)
    ])

    return { snapshot, responseContainer, version }
  }

  async function updateQuestionText (options: { question: NamedNode, title: string }) {
    const fetcher = store.fetcher
    const updater = store.updater
    if (!fetcher || !updater) {
      throw new Error('Missing fetcher or updater on questionnaire store')
    }

    const questionDoc = options.question.doc()
    await enqueueDocumentUpdate(questionDoc, async () => {
      await fetcher.load(questionDoc)

      const del = [
        ...store.statementsMatching(options.question, questionairePredicates.question.title, undefined, questionDoc)
      ]
      const title = options.title.trim()
      const ins = title
        ? [st(options.question, questionairePredicates.question.title, literal(title), questionDoc)]
        : []

      await updater.update(del, ins)
    })
  }

  async function updateQuestionImage (options: { question: NamedNode, image: string }) {
    const fetcher = store.fetcher
    const updater = store.updater
    if (!fetcher || !updater) {
      throw new Error('Missing fetcher or updater on questionnaire store')
    }

    const questionDoc = options.question.doc()
    await enqueueDocumentUpdate(questionDoc, async () => {
      await fetcher.load(questionDoc)
      const del = [...store.statementsMatching(options.question, questionImage, undefined, questionDoc)]
      const image = options.image.trim()
      const ins = image ? [st(options.question, questionImage, sym(image), questionDoc)] : []
      await updater.update(del, ins)
    })
  }

  async function updateQuestionHint (options: { question: NamedNode, hint: string }) {
    const fetcher = store.fetcher
    const updater = store.updater
    if (!fetcher || !updater) {
      throw new Error('Missing fetcher or updater on questionnaire store')
    }

    const questionDoc = options.question.doc()
    await enqueueDocumentUpdate(questionDoc, async () => {
      await fetcher.load(questionDoc)

      const del = [
        ...store.statementsMatching(options.question, quizHint, undefined, questionDoc)
      ]
      const hint = options.hint.trim()
      const ins = hint
        ? [st(options.question, quizHint, literal(hint), questionDoc)]
        : []

      await updater.update(del, ins)
    })
  }

  async function updateQuestionPoints (options: { question: NamedNode, points: number }) {
    const fetcher = store.fetcher
    const updater = store.updater
    if (!fetcher || !updater) {
      throw new Error('Missing fetcher or updater on questionnaire store')
    }

    const questionDoc = options.question.doc()
    await enqueueDocumentUpdate(questionDoc, async () => {
      await fetcher.load(questionDoc)

      const del = [
        ...store.statementsMatching(options.question, quizPoints, undefined, questionDoc)
      ]
      const ins = [
        st(options.question, quizPoints, literal(String(options.points)), questionDoc)
      ]

      await updater.update(del, ins)
    })
  }

  async function updateQuestionOptions (options: { question: NamedNode, options: string[], correctOption?: string | null, correctOptions?: string[] | null }) {
    const fetcher = store.fetcher
    const updater = store.updater
    if (!fetcher || !updater) {
      throw new Error('Missing fetcher or updater on questionnaire store')
    }

    const questionDoc = options.question.doc()
    await enqueueDocumentUpdate(questionDoc, async () => {
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
      const del: Statement[] = []
      const ins: Statement[] = []

      const currentAnswerStatements = [...currentOptionStatements, ...currentCorrectOptionStatements]
      currentAnswerStatements.forEach((statement) => {
        del.push(statement)
        if (statement.object.termType === 'NamedNode') {
          del.push(...store.statementsMatching(statement.object, undefined, undefined, questionDoc))
        }
      })
      normalizedOptions.forEach((value, index) => {
        const answer = answerResource(options.question, 'option', index)
        const predicate = desiredCorrectValues.includes(value) ? quizCorrectOption : quizOption
        ins.push(st(options.question, predicate, answer, questionDoc))
        ins.push(st(answer, ns.rdf('type'), answerClass, questionDoc))
        ins.push(st(answer, answerText, literal(value), questionDoc))
      })

      await updater.update(del, ins)
    })
  }

  async function updateQuestionAnswers (options: { question: NamedNode, answers: string[] }) {
    const fetcher = store.fetcher
    const updater = store.updater
    if (!fetcher || !updater) {
      throw new Error('Missing fetcher or updater on questionnaire store')
    }

    const questionDoc = options.question.doc()
    await enqueueDocumentUpdate(questionDoc, async () => {
      await fetcher.load(questionDoc)

      const del: Statement[] = []
      const currentAnswers = store.statementsMatching(options.question, quizAnswer, undefined, questionDoc)
      currentAnswers.forEach((statement) => {
        del.push(statement)
        if (statement.object.termType === 'NamedNode') {
          del.push(...store.statementsMatching(statement.object, undefined, undefined, questionDoc))
        }
      })
      const ins = options.answers
        .map((answer) => answer.trim())
        .filter((answer) => answer.length > 0)
        .flatMap((answer, index) => {
          const answerResourceNode = answerResource(options.question, 'answer', index)
          return [
            st(options.question, quizAnswer, answerResourceNode, questionDoc),
            st(answerResourceNode, ns.rdf('type'), answerClass, questionDoc),
            st(answerResourceNode, answerText, literal(answer), questionDoc)
          ]
        })

      await updater.update(del, ins)
    })
  }

  async function updateQuestionItems (options: { question: NamedNode, items: string[] }) {
    const fetcher = store.fetcher
    const updater = store.updater
    if (!fetcher || !updater) {
      throw new Error('Missing fetcher or updater on questionnaire store')
    }

    const questionDoc = options.question.doc()
    await enqueueDocumentUpdate(questionDoc, async () => {
      await fetcher.load(questionDoc)

      const del: Statement[] = []
      const lists = store.statementsMatching(options.question, orderedItems, undefined, questionDoc)
      lists.forEach((statement) => {
        del.push(statement)
        if (statement.object.termType !== 'NamedNode') {
          return
        }

        const listItems = store.statementsMatching(statement.object, itemListElement, undefined, questionDoc)
        del.push(...listItems)
        listItems.forEach((listItemStatement) => {
          if (listItemStatement.object.termType !== 'NamedNode') {
            return
          }

          del.push(...store.statementsMatching(listItemStatement.object, undefined, undefined, questionDoc))
          const itemStatement = store.statementsMatching(
            listItemStatement.object,
            itemPredicate,
            undefined,
            questionDoc
          )[0]
          if (itemStatement?.object.termType === 'NamedNode') {
            del.push(...store.statementsMatching(itemStatement.object, undefined, undefined, questionDoc))
          }
        })
      })
      const orderedResourcePrefix = `${questionDoc.uri}#ordered-`
      store.statementsMatching(undefined, undefined, undefined, questionDoc).forEach((statement) => {
        const subjectUri = statement.subject.termType === 'NamedNode' ? statement.subject.uri : ''
        const objectUri = statement.object.termType === 'NamedNode' ? statement.object.uri : ''
        if (subjectUri.startsWith(orderedResourcePrefix) || objectUri.startsWith(orderedResourcePrefix)) {
          del.push(statement)
        }
      })

      const list = sym(`${options.question.doc().uri}#ordered-items`)
      const listItems: NamedNode[] = []
      const ins: Statement[] = [
        st(options.question, orderedItems, list, questionDoc),
        st(list, ns.rdf('type'), schema('ItemList'), questionDoc)
      ]
      options.items
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .forEach((item, index) => {
          const listItem = sym(`${options.question.doc().uri}#ordered-item-${index + 1}`)
          const itemResource = sym(`${options.question.doc().uri}#ordered-value-${index + 1}`)
          listItems.push(listItem)
          ins.push(
            st(listItem, ns.rdf('type'), listItemClass, questionDoc),
            st(listItem, itemPosition, literal(String(index + 1)), questionDoc),
            st(listItem, itemPredicate, itemResource, questionDoc),
            st(itemResource, answerText, literal(item), questionDoc)
          )
        })
      listItems.forEach((listItem) => {
        ins.push(st(list, itemListElement, listItem, questionDoc))
      })

      await updater.update(del, ins)
    })
  }

  async function updateQuestionMatchPairs (options: { question: NamedNode, leftItems: string[], rightItems: string[] }) {
    const fetcher = store.fetcher
    const updater = store.updater
    if (!fetcher || !updater) {
      throw new Error('Missing fetcher or updater on questionnaire store')
    }

    const questionDoc = options.question.doc()
    await enqueueDocumentUpdate(questionDoc, async () => {
      await fetcher.load(questionDoc)

      const del = [
        ...store.statementsMatching(options.question, quizLeftItem, undefined, questionDoc),
        ...store.statementsMatching(options.question, quizRightItem, undefined, questionDoc),
        ...store.statementsMatching(options.question, quizMatchPair, undefined, questionDoc)
      ]
      store.statementsMatching(options.question, quizMatchPair, undefined, questionDoc).forEach((statement) => {
        if (statement.object.termType === 'NamedNode') {
          del.push(...store.statementsMatching(statement.object, undefined, undefined, questionDoc))
        }
      })
      const matchPairs = options.leftItems
        .map((leftItem, index) => ({
          leftItem: leftItem.trim(),
          rightItem: options.rightItems[index]?.trim() ?? ''
        }))
        .filter(({ leftItem, rightItem }) => leftItem.length > 0 && rightItem.length > 0)
      const ins = [
        ...matchPairs.map(({ leftItem }) => st(options.question, quizLeftItem, literal(leftItem), questionDoc)),
        ...matchPairs.map(({ rightItem }) => st(options.question, quizRightItem, literal(rightItem), questionDoc)),
        ...matchPairs.flatMap(({ leftItem, rightItem }, index) => {
          const pair = sym(`${options.question.doc().uri}#match-pair-${index + 1}`)
          return [
            st(options.question, quizMatchPair, pair, questionDoc),
            st(pair, quizLeftItem, literal(leftItem), questionDoc),
            st(pair, quizRightItem, literal(rightItem), questionDoc),
            st(pair, itemPosition, literal(String(index + 1)), questionDoc)
          ]
        })
      ]

      await updater.update(del, ins)
    })
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
    const questionPredicate = quizQuestion
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
    createQuestionnaireDocument,
    updateQuestionnaireTitle,
    updateQuestionnaireDescription,
    updateQuestionnaireFormat,
    addQuestionToQuestionnaire,
    createQuestionnaireStructure,
    publishQuestionnaire,
    updateQuestionText,
    updateQuestionImage,
    updateQuestionHint,
    updateQuestionPoints,
    updateQuestionOptions,
    updateQuestionAnswers,
    updateQuestionItems,
    updateQuestionMatchPairs,
    deleteQuestionFromQuestionnaire
  }
}
