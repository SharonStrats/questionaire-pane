import { sym, type LiveStore, type NamedNode } from 'rdflib'
import { createContainerIfMissing, createDocumentIfMissing, ensureTrailingSlash, slugifyQuestionaireSegment } from './types'
import { serializeStudyDeck } from './studyCardRdf'
import type { StudyCardReview } from './studyCardReview'

export async function saveAcceptedStudyDeck (
  store: LiveStore,
  storageUrl: string,
  title: string,
  reviews: StudyCardReview[],
  sourceDocument?: string,
  now = new Date()
): Promise<NamedNode> {
  const turtle = serializeStudyDeck(title, reviews, sourceDocument)
  const root = `${ensureTrailingSlash(storageUrl)}study-decks/`
  const slug = slugifyQuestionaireSegment(title) || 'study-deck'
  const containerUrl = `${root}${slug}-${now.toISOString().replace(/[:.]/g, '-')}/`
  await createContainerIfMissing(store, root)
  await createContainerIfMissing(store, containerUrl)
  const document = sym(`${containerUrl}index.ttl`)
  await createDocumentIfMissing(store, document, turtle)
  return document
}
