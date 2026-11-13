export function normalizeSidecarEndpoint (endpoint: string, label: string): string {
  const value = endpoint.trim()
  if (!value) throw new Error(`${label} endpoint is disabled.`)
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error(`${label} endpoint must be an absolute HTTP(S) URL.`)
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${label} endpoint must use HTTP(S).`)
  }
  return url.href.replace(/\/+$/, '')
}
