import { describe, expect, it } from 'vitest'
import { getDevelopmentSidecarEndpoint } from './quizSidecarConfig'

describe('standalone quiz sidecar configuration', () => {
  it('defaults development watch mode to the local sidecar', () => {
    expect(getDevelopmentSidecarEndpoint({ dev: true })).toBe('http://localhost:5001')
  })

  it('uses the configured development endpoint', () => {
    expect(getDevelopmentSidecarEndpoint({
      dev: true,
      configuredEndpoint: ' https://sidecar.example.test '
    })).toBe('https://sidecar.example.test')
  })

  it('does not configure a sidecar for production builds', () => {
    expect(getDevelopmentSidecarEndpoint({
      dev: false,
      configuredEndpoint: 'http://localhost:5001'
    })).toBeUndefined()
  })
})
