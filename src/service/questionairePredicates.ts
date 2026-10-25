import { Namespace } from 'rdflib'

const dct = Namespace('http://purl.org/dc/terms/')
const quiz = Namespace('https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#')
const schema = Namespace('https://schema.org/')
const disco = Namespace('http://rdf-vocabulary.ddialliance.org/discovery#')
const rdf = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#')

export const questionairePredicates = {
  questionnaire: {
    question: disco('question'),
    // schema:name: the human-readable name of the questionnaire.
    title: schema('name'),
    // DCMI Terms dct:description: a textual description of the questionnaire.
    description: dct('description'),
    // DCMI Terms dct:creator: the agent responsible for creating the resource.
    creator: dct('creator'),
    // schema:Quiz is the resource type; status distinguishes draft from published.
    quizType: schema('Quiz'),
    surveyType: quiz('Survey'),
    status: schema('creativeWorkStatus'),
    // DCMI Terms dct:modified and dct:hasVersion: publication metadata.
    modified: dct('modified'),
    hasVersion: dct('hasVersion'),
    hasPart: dct('hasPart')
  },
  question: {
    // schema:text: the wording of the question.
    title: schema('text'),
    // schema:image: an optional image shown with supported question types.
    image: schema('image'),
    // schema:eduQuestionType: the human-readable educational format.
    eduQuestionType: schema('eduQuestionType'),
    answerClass: schema('Answer'),
    answerText: schema('text'),
    orderedItems: schema('hasPart'),
    itemListElement: schema('itemListElement'),
    listItemClass: schema('ListItem'),
    item: schema('item'),
    position: schema('position'),
    // Application-specific quiz vocabulary: question guidance and scoring.
    hint: quiz('hint'),
    explanation: quiz('explanation'),
    points: quiz('points'),
    rdfType: rdf('type'),
    // Schema.org: linked suggested and accepted answer resources.
    option: schema('suggestedAnswer'),
    correctOption: schema('acceptedAnswer'),
    answer: schema('acceptedAnswer'),
    // Application-specific match vocabulary aligned with QTI source/target choices.
    sourceItem: quiz('sourceItem'),
    targetItem: quiz('targetItem'),
    matchPair: quiz('matchPair'),
    // DCMI Terms: resource creation, identity, composition, and containment.
    created: dct('created'),
    modified: dct('modified'),
    hasVersion: dct('hasVersion'),
    identifier: dct('identifier'),
    hasPart: dct('hasPart'),
    isPartOf: dct('isPartOf'),
    creator: dct('creator'),
    // These URIs are application-only keys used to select the editor, renderer,
    // and scorer. Published RDF stores schema:eduQuestionType instead.
    questionType: {
      multipleChoice: quiz('MultipleChoiceQuestion'),
      selection: quiz('SelectionQuestion'),
      trueFalse: quiz('TrueFalseQuestion'),
      fillInBlank: quiz('FillInTheBlankQuestion'),
      shortAnswer: quiz('ShortAnswerQuestion'),
      ordering: quiz('OrderingQuestion'),
      match: quiz('MatchQuestion'),
      confidence: quiz('ConfidenceQuestion')
    }
  }
} as const

export type QuestionaireQuestionPredicate = keyof typeof questionairePredicates.question
export type QuestionaireQuestionTypeKey = keyof typeof questionairePredicates.question.questionType
