import { describe, expect, it } from 'vitest'
import { questionairePredicates } from '../../../service/predicates'
import { formatReviewAnswer } from '../../../service/answerFormatting'

describe('formatReviewAnswer', () => {
  it('formats match answers like the displayed correct answer', () => {
    expect(formatReviewAnswer(
      ['Roots|||Absorb water', 'Leaves|||Make food'],
      questionairePredicates.question.questionType.match.value
    )).toBe('Roots → Absorb water · Leaves → Make food')
  })

  it('keeps ordinary answer values readable', () => {
    expect(formatReviewAnswer(['first', 'second'], 'ordering')).toBe('first · second')
    expect(formatReviewAnswer(null, 'match')).toBe('No answer')
  })
})
