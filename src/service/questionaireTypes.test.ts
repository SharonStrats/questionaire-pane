import { describe, expect, it, vi } from 'vitest'
import { createContainerIfMissing } from './questionaireTypes'

function storeWithFetch (fetch: (url: string, init?: RequestInit) => Promise<Response>) {
  return { fetcher: { _fetch: fetch } } as any
}

describe('createContainerIfMissing', () => {
  it('creates a missing container without a preliminary HEAD request', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 201 }))

    await expect(createContainerIfMissing(storeWithFetch(fetch), 'https://pod.example/questions/')).resolves.toBe(true)

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('https://pod.example/questions/', expect.objectContaining({
      method: 'PUT',
      body: ' '
    }))
  })

  it.each([409, 412])('treats an existing container response (%i) as success', async (status) => {
    const fetch = vi.fn().mockResolvedValue(new Response('', { status }))

    await expect(createContainerIfMissing(storeWithFetch(fetch), 'https://pod.example/questions/')).resolves.toBe(false)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
