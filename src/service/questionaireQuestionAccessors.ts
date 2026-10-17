import { type LiveStore, type NamedNode } from 'rdflib'
import { questionairePredicates } from './questionairePredicates'

export function readQuestionValue (
  store: LiveStore,
  question: NamedNode,
  field: 'title' | 'image' | 'hint' | 'points' | 'description' | 'identifier' | 'created' | 'isPartOf' | 'creator' | 'answer' | 'correctOption' | 'rdfType' | 'eduQuestionType'
) {
  if (field === 'correctOption' || field === 'answer') {
    return readQuestionValues(store, question, field)[0] ?? ''
  }

  const predicate = field === 'description'
    ? questionairePredicates.questionnaire.description
    : questionairePredicates.question[field]
  const value = store.any(question, predicate, undefined, question.doc())?.value
  if (value !== undefined) {
    return value
  }

  return field === 'title'
    ? store.any(question, questionairePredicates.questionnaire.title, undefined, question.doc())?.value ?? ''
    : ''
}

export function readQuestionValues (
  store: LiveStore,
  question: NamedNode,
  field: 'option' | 'correctOption' | 'answer' | 'item' | 'leftItem' | 'rightItem'
) {
  const resolvedField = field === 'leftItem' ? 'sourceItem' : field === 'rightItem' ? 'targetItem' : field
  const predicate = questionairePredicates.question[resolvedField]

  if (field === 'leftItem' || field === 'rightItem') {
    const pairStatements = store.statementsMatching(
      question,
      questionairePredicates.question.matchPair,
      undefined,
      question.doc()
    )
    if (pairStatements.length > 0) {
      const pairPredicate = field === 'leftItem'
        ? questionairePredicates.question.sourceItem
        : questionairePredicates.question.targetItem
      return pairStatements
        .map((statement) => statement.object as NamedNode)
        .sort((left, right) => {
          const leftPosition = Number(store.any(left, questionairePredicates.question.position, undefined, question.doc())?.value ?? 0)
          const rightPosition = Number(store.any(right, questionairePredicates.question.position, undefined, question.doc())?.value ?? 0)
          return leftPosition - rightPosition
        })
        .map((pair) => store.any(pair, pairPredicate, undefined, question.doc())?.value ?? '')
        .filter((value) => value.length > 0)
    }
  }

  if (field === 'item') {
    const list = store.any(
      question,
      questionairePredicates.question.orderedItems,
      undefined,
      question.doc()
    )
    if (!list || list.termType !== 'NamedNode') {
      return []
    }
    const listNode = list as NamedNode

    const elementStatements = store.statementsMatching(listNode, questionairePredicates.question.itemListElement, undefined, question.doc())
    const elements = elementStatements.reduce<NamedNode[]>((items, statement) => {
      const collection = statement.object as unknown as { elements?: NamedNode[] }
      if (Array.isArray(collection.elements)) {
        items.push(...collection.elements)
      } else if (statement.object.termType === 'NamedNode') {
        items.push(statement.object as NamedNode)
      }
      return items
    }, [])

    const values = elements
      .sort((left, right) => {
        const leftItem = left as NamedNode
        const rightItem = right as NamedNode
        const leftPosition = Number(store.any(leftItem, questionairePredicates.question.position, undefined, question.doc())?.value ?? 0)
        const rightPosition = Number(store.any(rightItem, questionairePredicates.question.position, undefined, question.doc())?.value ?? 0)
        return leftPosition - rightPosition
      })
      .map((statement) => store.any(
        statement as NamedNode,
        questionairePredicates.question.item,
        undefined,
        question.doc()
      ))
      .map((item) => item?.termType === 'NamedNode'
        ? store.any(item as NamedNode, questionairePredicates.question.answerText, undefined, question.doc())?.value ?? ''
        : item?.value ?? '')
      .filter((value) => value.length > 0)

    if (values.length > 0) {
      return values
    }

    const orderedItemPrefix = `${question.doc().uri}#ordered-item-`
    const legacyItems = store.statementsMatching(undefined, undefined, undefined, question.doc())
      .filter((statement) =>
        statement.subject.termType === 'NamedNode' &&
        statement.subject.uri.startsWith(orderedItemPrefix)
      )
      .map((statement) => statement.subject as NamedNode)
      .filter((item, index, all) => all.findIndex((candidate) => candidate.uri === item.uri) === index)
      .sort((left, right) => {
        const leftPosition = Number(store.any(left, questionairePredicates.question.position, undefined, question.doc())?.value ?? 0)
        const rightPosition = Number(store.any(right, questionairePredicates.question.position, undefined, question.doc())?.value ?? 0)
        return leftPosition - rightPosition
      })
      .map((listItem) => {
        const item = store.any(listItem, questionairePredicates.question.item, undefined, question.doc())
        if (!item || item.termType !== 'NamedNode') {
          return ''
        }

        const literals = store.statementsMatching(
          item as NamedNode,
          questionairePredicates.question.answerText,
          undefined,
          question.doc()
        ).map((statement) => statement.object.value)
        const nonPlaceholder = literals.filter((value) => !/^Step \d+$/.test(value.trim()))
        return nonPlaceholder[nonPlaceholder.length - 1] ?? literals[literals.length - 1] ?? ''
      })
      .filter((value) => value.length > 0)

    return legacyItems
  }

  return store
    .statementsMatching(question, predicate, undefined, question.doc())
    .map((statement) => {
      if (statement.object.termType !== 'NamedNode') {
        return statement.object.value
      }

      return store.any(
        statement.object,
        questionairePredicates.question.answerText,
        undefined,
        question.doc()
      )?.value ?? ''
    })
}

export function readQuestionTypeUri (
  store: LiveStore,
  question: NamedNode
) {
  const label = readQuestionValue(store, question, 'eduQuestionType').toLowerCase()
  const typeLabels: Record<string, string> = {
    'multiple choice': questionairePredicates.question.questionType.multipleChoice.value,
    selection: questionairePredicates.question.questionType.selection.value,
    'true or false': questionairePredicates.question.questionType.trueFalse.value,
    'fill in the blank': questionairePredicates.question.questionType.fillInBlank.value,
    'short answer': questionairePredicates.question.questionType.shortAnswer.value,
    ordering: questionairePredicates.question.questionType.ordering.value,
    match: questionairePredicates.question.questionType.match.value,
    confidence: questionairePredicates.question.questionType.confidence.value
  }
  return typeLabels[label] ?? ''
}
