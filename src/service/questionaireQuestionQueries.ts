import { sym, type LiveStore, type NamedNode } from 'rdflib'
import { ensureTrailingSlash } from './questionaireTypes'
import { questionairePredicates } from './questionairePredicates'
import { readQuestionTypeUri } from './questionaireQuestionAccessors'

export interface QuestionaireQuestionSummary {
  question: NamedNode
  title: string
  typeUri: string
}

export async function loadQuestionaireQuestionSummaries (store: LiveStore, subject: NamedNode): Promise<QuestionaireQuestionSummary[]> {
  const fetcher = store.fetcher
  if (!fetcher) {
    throw new Error('Missing fetcher on questionnaire store')
  }

  const baseUrl = ensureTrailingSlash(subject.doc().uri.replace(/index\.ttl$/, ''))
  const draft = sym(`${baseUrl}draft.ttl`)
  const draftDoc = draft.doc()
  const publishedQuestionStatements = store.statementsMatching(subject, questionairePredicates.questionnaire.question, undefined, subject.doc())
  if (publishedQuestionStatements.length === 0) {
    await fetcher.load(draftDoc)
  }

  const questionStatements = publishedQuestionStatements.length > 0
    ? publishedQuestionStatements
    : store.statementsMatching(draft, questionairePredicates.questionnaire.question, undefined, draftDoc)
  const questionSummaries = await Promise.all(
    questionStatements.map(async (statement) => {
      const question = statement.object as NamedNode
      await fetcher.load(question.doc())

      return {
        question,
        title: store.any(question, questionairePredicates.question.title, undefined, question.doc())?.value ?? '',
        typeUri: readQuestionTypeUri(store, question)
      }
    })
  )

  return questionSummaries.sort((left, right) => left.question.uri.localeCompare(right.question.uri, undefined, { numeric: true, sensitivity: 'base' }))
}

export function getQuestionnaireFormat (store: LiveStore, subject: NamedNode): 'quiz' | 'survey' {
  if (store.holds(subject, questionairePredicates.question.rdfType, questionairePredicates.questionnaire.surveyType)) {
    return 'survey'
  }

  if (store.holds(subject, questionairePredicates.question.rdfType, questionairePredicates.questionnaire.quizType)) {
    return 'quiz'
  }

  return 'quiz'
}
