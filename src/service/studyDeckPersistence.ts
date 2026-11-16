import { sym, type LiveStore, type NamedNode } from 'rdflib'
import { createContainerIfMissing, createDocumentIfMissing, ensureTrailingSlash, slugifyQuestionaireSegment } from './types'
import { serializeStudyDeck } from './studyCardRdf'
import type { StudyCardReview } from './studyCardReview'

const quizName = sym('https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#name')

async function uniqueDeckTitle (store: LiveStore, root: string, requestedTitle: string): Promise<string> {
  const titles: string[] = []
  try {
    await store.fetcher?.load(sym(root))
    for (const child of store.each(sym(root), sym('http://www.w3.org/ns/ldp#contains'))) {
      if (child.termType !== 'NamedNode' || !child.value.endsWith('/')) continue
      const childUri = child.value
      const document = sym(`${childUri}index.ttl`)
      await store.fetcher?.load(document)
      const title = store.any(sym(`${document.uri}#deck`), quizName)?.value
      if (title) titles.push(title)
    }
  } catch {
    // A missing or unreadable deck is not a reason to block saving a new one.
  }
  if (!titles.includes(requestedTitle)) return requestedTitle
  const escaped = requestedTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const suffixes = titles
    .map(title => title.match(new RegExp(`^${escaped} \\((\\d+)\\)$`)))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map(match => Number(match[1]))
  return `${requestedTitle} (${Math.max(0, ...suffixes) + 1})`
}

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
  const savedTitle = await uniqueDeckTitle(store, root, title)
  const savedTurtle = savedTitle === title ? turtle : serializeStudyDeck(savedTitle, reviews, sourceDocument)
  const slug = slugifyQuestionaireSegment(title) || 'study-deck'
  const containerUrl = `${root}${slug}-${now.toISOString().replace(/[:.]/g, '-')}/`
  await createContainerIfMissing(store, root)
  await createContainerIfMissing(store, containerUrl)
  const document = sym(`${containerUrl}index.ttl`)
  await createDocumentIfMissing(store, document, savedTurtle)
  return document
}
