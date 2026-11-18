import { appServicesFetch } from './appServicesFetch'

export async function fetchRealtimeTicket (endpoint: string): Promise<string> {
  const origin = new URL(endpoint).origin
  const response = await appServicesFetch(origin)(`${origin}/api/realtime/ticket`, { method: 'POST' })
  if (!response.ok) throw new Error('Your WebID session could not be verified for realtime features.')
  const body = await response.json() as { ticket?: unknown }
  if (typeof body.ticket !== 'string' || !body.ticket) throw new Error('Realtime authentication did not return a ticket.')
  return body.ticket
}
