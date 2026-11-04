import { describe, expect, it } from 'vitest'
import { nextQuestionNumber } from './questionaireQuestionNumbering'

describe('nextQuestionNumber', () => {
  it('allocates an unused number after deleting the first question', () => {
    expect(nextQuestionNumber([
      'https://pod.example/test/draft/questions/q2.ttl'
    ])).toBe(3)
  })

  it('allocates the next number after deleting the last question', () => {
    expect(nextQuestionNumber([
      'https://pod.example/test/draft/questions/q1.ttl'
    ])).toBe(2)
  })

  it('starts at one when the only question was deleted', () => {
    expect(nextQuestionNumber([])).toBe(1)
  })

  it('ignores unrelated question resource identifiers', () => {
    expect(nextQuestionNumber([
      'https://pod.example/test/draft/questions/custom.ttl',
      'https://pod.example/test/draft/questions/q4.ttl'
    ])).toBe(5)
  })
})
