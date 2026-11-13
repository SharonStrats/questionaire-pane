import { type LiveStore } from 'rdflib'
import { createQuestionaireMutations } from './questionMutations'

export function createQuestionaireLogic (store: LiveStore) {
  return createQuestionaireMutations(store)
}
