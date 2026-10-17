import { describe, expect, it } from 'vitest'
import { nextPublishedVersion } from './publishedVersion'

describe('nextPublishedVersion', () => {
  it('starts at v1 when no numbered publication exists', () => {
    expect(nextPublishedVersion([])).toBe('v1')
  })

  it('increments the highest existing numbered publication', () => {
    expect(nextPublishedVersion([
      'https://pod.example/questionnaires/published/v1/index.ttl#this',
      'https://pod.example/questionnaires/published/v3/index.ttl#this',
      'https://pod.example/questionnaires/published/2026-10-20T05-52-57.428Z/index.ttl#this'
    ])).toBe('v4')
  })
})
