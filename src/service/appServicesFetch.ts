export function appServicesFetch (endpoint: string): typeof globalThis.fetch {
  const base = new URL(endpoint)
  const prefix = `${base.pathname.replace(/\/+$/, '')}/api/`
  if (base.username || base.password || base.search || base.hash ||
      (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname)))) {
    throw new Error('App services require HTTPS (except localhost development).')
  }
  return async (input, init) => {
    const request = new Request(input, { ...init, credentials: 'include', redirect: 'error' })
    const target = new URL(request.url)
    if (target.origin !== base.origin || !target.pathname.startsWith(prefix) || request.method !== 'POST') {
      throw new Error('Refusing to send WebID credentials outside the configured app service.')
    }
    const { authSession } = await import('solid-logic')
    if (!authSession.isActive || !authSession.authFetch) {
      throw new Error('Please log in with your Pivot WebID to use AI features.')
    }
    return authSession.authFetch(request)
  }
}
