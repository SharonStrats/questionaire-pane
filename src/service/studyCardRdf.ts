import type { StudyCardReview } from './studyCardReview'

const quizNamespace = 'https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#'

function turtleString (value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`
}

function resourceId (id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '-')
}

export function serializeStudyDeck (
  title: string,
  reviews: StudyCardReview[],
  sourceDocument?: string
): string {
  const accepted = reviews.filter(review => review.status === 'accepted')
  if (!accepted.length) throw new Error('Accept at least one study card before saving.')

  const deckPredicates = [
    `    quiz:name ${turtleString(title)}`,
    `    quiz:studyCard ${accepted.map(review => `<#${resourceId(review.id)}>`).join(', ')}`
  ]
  if (sourceDocument) deckPredicates.push(`    quiz:sourceDocument ${turtleString(sourceDocument)}`)
  const lines = [
    `@prefix quiz: <${quizNamespace}> .`,
    '',
    '<#deck> a quiz:StudyDeck ;',
    `${deckPredicates.slice(0, -1).map(line => `${line} ;`).join('\n')}${deckPredicates.length > 1 ? '\n' : ''}${deckPredicates[deckPredicates.length - 1]} .`
  ]

  accepted.forEach((review, index) => {
    lines.push(
      '',
      `<#${resourceId(review.id)}> a quiz:StudyCard ;`,
      `    quiz:front ${turtleString(review.card.front)} ;`,
      `    quiz:back ${turtleString(review.card.back)} ;`,
      `    quiz:sourceLocator ${turtleString(review.card.sourceReference)} .`
    )
    if (index === accepted.length - 1) lines.push('')
  })
  return lines.join('\n')
}
