import { type NamedNode, type Store } from 'rdflib'
import { questionairePredicates } from './questionairePredicates'

export function readQuestionValue (
  store: Store,
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
  store: Store,
  question: NamedNode,
  field: 'option' | 'correctOption' | 'answer' | 'item' | 'leftItem' | 'rightItem'
) {
  const resolvedField = field === 'leftItem' ? 'sourceItem' : field === 'rightItem' ? 'targetItem' : field
  const predicate = questionairePredicates.question[resolvedField]

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

    return elements
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
  store: Store,
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
