import { createContext } from '@lit/context'
import { Store, NamedNode } from 'rdflib'

/* Subject and store should really come from solid-ui-provider or file explorer */
export interface QuestionaireContext {
  store: Store | null,
  subject: NamedNode | null
}

export const questionaireContext = createContext<QuestionaireContext>(Symbol('questionaire'))