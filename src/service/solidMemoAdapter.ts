import type { StudyCardReview } from './studyCardReview'

const solidMemoNamespace = 'https://solidmemo.org/ns#'
const quizNamespace = 'https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#'

function turtleString (value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`
}

export function serializeSolidMemoDeck (title: string, reviews: StudyCardReview[]): string {
  const accepted = reviews.filter(review => review.status === 'accepted')
  if (!accepted.length) throw new Error('Accept at least one study card before exporting.')

  const cards = accepted.map(review => `<#${review.id.replace(/[^a-zA-Z0-9_-]/g, '-')}>`)
  const lines = [
    `@prefix sm: <${solidMemoNamespace}> .`,
    `@prefix quiz: <${quizNamespace}> .`,
    '',
    '<#deck> a sm:Deck ;',
    `    sm:name ${turtleString(title)} ;`,
    `    sm:card ${cards.join(', ')} .`
  ]
  accepted.forEach(review => {
    const id = review.id.replace(/[^a-zA-Z0-9_-]/g, '-')
    lines.push(
      '',
      `<#${id}> a sm:Card ;`,
      `    sm:front ${turtleString(review.card.front)} ;`,
      `    sm:back ${turtleString(review.card.back)} ;`,
      `    quiz:sourceLocator ${turtleString(review.card.sourceReference)} .`
    )
  })
  return `${lines.join('\n')}\n`
}
