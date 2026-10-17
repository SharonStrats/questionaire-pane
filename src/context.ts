import { createContext } from '@lit/context'
import { type LiveStore, type NamedNode } from 'rdflib'

export interface QuestionaireAcl {
  planGrantContainerContents: (container: NamedNode, subject: { type: 'agent', iri: string }, modes: ['Read']) => Promise<unknown>
  applyPlan: (plan: unknown) => Promise<Response>
}

/* Subject and store should really come from solid-ui-provider or file explorer */
export interface QuestionaireContext {
  store: LiveStore | null,
  subject: NamedNode | null,
  acl: QuestionaireAcl | null
}

export const questionaireContext = createContext<QuestionaireContext>(Symbol('questionaire'))