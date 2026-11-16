import { describe, expect, it } from 'vitest'
import { getStandaloneLoginIssuer } from './accountLinks'

describe('standalone identity provider defaults', () => {
  const quiz = new URL('https://quiz.sharonsolidosplayground.com')

  it('uses Pivot on first visit and repairs saved quiz-host defaults', () => {
    for (const saved of [null, quiz.origin, `${quiz.origin}/`]) {
      expect(getStandaloneLoginIssuer(quiz, saved)).toBe('https://sharonsolidosplayground.com')
    }
  })

  it('preserves an explicitly chosen provider and supports a configured default', () => {
    expect(getStandaloneLoginIssuer(quiz, 'https://chosen.example')).toBe('https://chosen.example')
    expect(getStandaloneLoginIssuer(quiz, null, ' https://configured.example ')).toBe('https://configured.example')
  })

  it('preserves localhost development behavior and leaves other deployments alone', () => {
    expect(getStandaloneLoginIssuer(new URL('http://localhost:4200'), null)).toBe('http://localhost:3100')
    expect(getStandaloneLoginIssuer(new URL('https://other.example'), null)).toBeUndefined()
  })
})
