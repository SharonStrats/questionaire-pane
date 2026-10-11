import { type Store } from 'rdflib'
import { createQuestionaireMutations } from './questionaireQuestionMutations'

export function createQuestionaireLogic (store: Store) {
  return createQuestionaireMutations(store)
}
