export interface StandaloneQuestionnaireUrl {
  subject?: string
  baseUrl?: string
}

/**
 * Parse the public standalone contract:
 *   ?subject=<questionnaire-index-url> to open an existing questionnaire
 *   ?base=<container-url> to create a questionnaire in a Pod container
 *
 * `baseUrl` is accepted as a descriptive alias for integrations which prefer
 * an explicit name.
 */
export function parseStandaloneUrl (input: string | URL): StandaloneQuestionnaireUrl {
  const url = typeof input === 'string' ? new URL(input, 'http://localhost') : input
  const subject = url.searchParams.get('subject')?.trim() || undefined
  const baseUrl = (url.searchParams.get('base') || url.searchParams.get('baseUrl'))?.trim() || undefined
  return { subject, baseUrl }
}

export function isHttpUrl (value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
