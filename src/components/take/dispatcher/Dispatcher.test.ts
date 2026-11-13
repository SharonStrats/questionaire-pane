import { describe, expect, it } from 'vitest'
import { normalizeTextResponseAnswer } from '../../../service/answerFormatting'

describe('normalizeTextResponseAnswer', () => {
  it('preserves fill-in-the-blank answers when they are stored as slots', () => {
    const answer = ['first answer', 'second answer']

    expect(normalizeTextResponseAnswer(answer)).toBe(answer)
  })

  it('preserves regular text answers', () => {
    expect(normalizeTextResponseAnswer('written response')).toBe('written response')
    expect(normalizeTextResponseAnswer(null)).toBeNull()
  })
})
