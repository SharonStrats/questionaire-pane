import { describe, expect, it } from 'vitest'
import { isHttpUrl, parseStandaloneUrl } from './url'

describe('standalone URL contract', () => {
  it('parses subject and base parameters', () => {
    expect(parseStandaloneUrl('https://example.test/?subject=https%3A%2F%2Fpod.test%2Fq%2Findex.ttl&base=https%3A%2F%2Fpod.test%2Fq%2F'))
      .toEqual({ subject: 'https://pod.test/q/index.ttl', baseUrl: 'https://pod.test/q/' })
  })

  it('accepts the descriptive baseUrl alias and ignores blanks', () => {
    expect(parseStandaloneUrl('http://localhost/?subject=&baseUrl=%20')).toEqual({})
  })

  it('validates only HTTP(S) resource URLs', () => {
    expect(isHttpUrl('https://pod.test/')).toBe(true)
    expect(isHttpUrl('mailto:test@example.test')).toBe(false)
    expect(isHttpUrl('not a URL')).toBe(false)
  })
})
