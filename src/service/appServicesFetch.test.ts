import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appServicesFetch } from './appServicesFetch'

const session = vi.hoisted(() => ({ isActive: true, authFetch: vi.fn() }))
vi.mock('solid-logic', () => ({ authSession: session }))

beforeEach(() => {
  session.isActive = true
  session.authFetch.mockReset().mockResolvedValue(new Response('{}'))
})

describe('app services authenticated transport', () => {
  const endpoint = 'https://quiz.example'

  it('uses the existing WebID session for JSON and multipart requests without redirects', async () => {
    const fetch = appServicesFetch(endpoint)
    await fetch(`${endpoint}/api/grade/short-answer`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"answer":"test"}'
    })
    const json = session.authFetch.mock.calls[0][0] as Request
    expect(json.redirect).toBe('error')
    expect(json.headers.get('Content-Type')).toBe('application/json')
    expect(await json.text()).toBe('{"answer":"test"}')
    const body = new FormData()
    body.append('file', new Blob(['hello']), 'test.txt')
    await fetch(`${endpoint}/api/import/document`, { method: 'POST', body })
    const upload = session.authFetch.mock.calls[1][0] as Request
    expect((await upload.formData()).get('file')).toBeTruthy()
  })

  it('does not make anonymous AI requests after logout', async () => {
    session.isActive = false
    await expect(appServicesFetch(endpoint)(`${endpoint}/api/test`, { method: 'POST' })).rejects.toThrow('log in')
    expect(session.authFetch).not.toHaveBeenCalled()
  })

  it('refuses credential forwarding to other origins, paths, methods, or insecure endpoints', async () => {
    const fetch = appServicesFetch(endpoint)
    for (const url of ['https://evil.example/api/test', `${endpoint}/.oidc/token`, `${endpoint}/api/../../other`]) {
      await expect(fetch(url, { method: 'POST' })).rejects.toThrow('Refusing')
    }
    await expect(fetch(`${endpoint}/api/test`)).rejects.toThrow('Refusing')
    expect(() => appServicesFetch('http://quiz.example')).toThrow('HTTPS')
    expect(session.authFetch).not.toHaveBeenCalled()
  })
})
