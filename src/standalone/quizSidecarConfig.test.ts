import { describe, expect, it } from 'vitest'
import { getAppServicesEndpoint, getDevelopmentSidecarEndpoint } from './quizSidecarConfig'

describe('standalone quiz sidecar configuration', () => {
  it('defaults development watch mode to the local sidecar', () => {
    expect(getDevelopmentSidecarEndpoint({ dev: true })).toBe('http://127.0.0.1:5001')
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

  it('prefers the generic app-services endpoint over the legacy sidecar endpoint', () => {
    expect(getAppServicesEndpoint({
      dev: false,
      appServicesEndpoint: ' https://services.example.test ',
      legacySidecarEndpoint: 'https://legacy.example.test'
    })).toBe('https://services.example.test')
  })

  it('keeps the legacy endpoint working when the generic endpoint is absent', () => {
    expect(getAppServicesEndpoint({
      dev: false,
      legacySidecarEndpoint: 'https://legacy.example.test'
    })).toBe('https://legacy.example.test')
  })
})
