import { quiz } from '../../../namespaces'

export type QuestionaireCreateQuestionTypeKey =
  | 'multiple-choice'
  | 'selection'
  | 'true-false'
  | 'short-answer'
  | 'fill-in-the-blank'
  | 'match'
  | 'ordering'
  | 'confidence'
  | 'custom'

export interface QuestionaireCreateQuestionTypeDefinition {
  key: QuestionaireCreateQuestionTypeKey
  label: string
  description: string
  questionTypeUri: string
  accentClass: string
  qtiInteraction: 'choiceInteraction' | 'textEntryInteraction' | 'extendedTextInteraction' | 'gapMatchInteraction' | 'orderInteraction' | 'matchInteraction' | 'associateInteraction' | 'sliderInteraction'
  qtiSelectionMode?: 'single' | 'multiple'
}

export const questionaireCreateQuestionTypes: QuestionaireCreateQuestionTypeDefinition[] = [
  {
    key: 'multiple-choice',
    label: 'Multiple Choice',
    description: 'Pick exactly one option',
    questionTypeUri: quiz('MultipleChoiceQuestion').value,
    accentClass: 'question-type-card--violet',
    qtiInteraction: 'choiceInteraction',
    qtiSelectionMode: 'single'
  },
  {
    key: 'selection',
    label: 'Selection',
    description: 'Pick one or more options',
    questionTypeUri: quiz('SelectionQuestion').value,
    accentClass: 'question-type-card--green',
    qtiInteraction: 'choiceInteraction',
    qtiSelectionMode: 'multiple'
  },
  {
    key: 'true-false',
    label: 'True / False',
    description: 'Binary correct/incorrect',
    questionTypeUri: quiz('TrueFalseQuestion').value,
    accentClass: 'question-type-card--blue',
    qtiInteraction: 'choiceInteraction',
    qtiSelectionMode: 'single'
  },
  {
    key: 'short-answer',
    label: 'Short Answer',
    description: 'Free-text response',
    questionTypeUri: quiz('ShortAnswerQuestion').value,
    accentClass: 'question-type-card--sky',
    qtiInteraction: 'extendedTextInteraction'
  },
  {
    key: 'fill-in-the-blank',
    label: 'Fill in the Blank',
    description: 'Complete missing words',
    questionTypeUri: quiz('FillInTheBlankQuestion').value,
    accentClass: 'question-type-card--pink',
    qtiInteraction: 'textEntryInteraction'
  },
  {
    key: 'match',
    label: 'Match',
    description: 'Connect two sets of items',
    questionTypeUri: quiz('MatchQuestion').value,
    accentClass: 'question-type-card--orange',
    qtiInteraction: 'matchInteraction'
  },
  {
    key: 'ordering',
    label: 'Ordering',
    description: 'Arrange items in correct order',
    questionTypeUri: quiz('OrderingQuestion').value,
    accentClass: 'question-type-card--lavender',
    qtiInteraction: 'orderInteraction'
  },
  {
    key: 'confidence',
    label: 'Confidence / Rating',
    description: 'Collect a rating or confidence response',
    questionTypeUri: quiz('ConfidenceQuestion').value,
    accentClass: 'question-type-card--teal',
    qtiInteraction: 'sliderInteraction'
  },
  {
    key: 'custom',
    label: 'Custom',
    description: 'Define your own format',
    questionTypeUri: quiz('CustomQuestion').value,
    accentClass: 'question-type-card--amber',
    qtiInteraction: 'choiceInteraction'
  },
]

export function getQuestionaireCreateQuestionTypeByUri (uri?: string | null) {
  if (!uri) {
    return undefined
  }

  return questionaireCreateQuestionTypes.find((questionType) => questionType.questionTypeUri === uri)
}

export function getQuestionaireCreateQuestionTypeByKey (key?: string | null) {
  if (!key) {
    return undefined
  }

  return questionaireCreateQuestionTypes.find((questionType) => questionType.key === key)
}
