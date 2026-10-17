import type { LiveStore, NamedNode } from 'rdflib'
import { questionairePredicates } from './questionairePredicates'
import type { QuestionaireAcl } from '../context'

const HTTP_SCHEMES = new Set(['http:', 'https:'])

export async function shareQuestionnaireResults (
  store: LiveStore,
  acl: QuestionaireAcl,
  questionnaire: NamedNode
): Promise<void> {
  const creator = store.any(
    questionnaire,
    questionairePredicates.questionnaire.creator,
    undefined,
    questionnaire.doc()
  )
  if (!creator || creator.termType !== 'NamedNode') {
    throw new Error('The published questionnaire does not contain a creator WebID.')
  }

  let creatorUrl: URL
  try {
    creatorUrl = new URL(creator.value)
  } catch {
    throw new Error(`The questionnaire creator is not a valid WebID: ${creator.value}`)
  }
  if (!HTTP_SCHEMES.has(creatorUrl.protocol)) {
    throw new Error(`The questionnaire creator is not a valid WebID: ${creator.value}`)
  }

  const responseContainer = store.any(
    questionnaire,
    questionairePredicates.questionnaire.hasPart,
    undefined,
    questionnaire.doc()
  )
  if (!responseContainer || responseContainer.termType !== 'NamedNode' || !responseContainer.value.endsWith('/')) {
    throw new Error('The published questionnaire does not contain a valid results folder.')
  }

  const plan = await acl.planGrantContainerContents(
    responseContainer as NamedNode,
    { type: 'agent', iri: creator.value },
    ['Read']
  )
  const response = await acl.applyPlan(plan)
  if (!response.ok) {
    throw new Error(`Unable to share questionnaire results: HTTP ${response.status}`)
  }
}
