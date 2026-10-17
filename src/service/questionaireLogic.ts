import { type LiveStore } from 'rdflib'
import { createQuestionaireMutations } from './questionaireQuestionMutations'

export function createQuestionaireLogic (store: LiveStore) {
  return createQuestionaireMutations(store)
}
