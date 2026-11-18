// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import './QuestionImage'

const originalCreateObjectUrl = URL.createObjectURL
const originalRevokeObjectUrl = URL.revokeObjectURL

afterEach(() => {
  if (originalCreateObjectUrl) {
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: originalCreateObjectUrl })
  } else {
    Reflect.deleteProperty(URL, 'createObjectURL')
  }
  if (originalRevokeObjectUrl) {
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectUrl })
  } else {
    Reflect.deleteProperty(URL, 'revokeObjectURL')
  }
})

describe('questionnaire take question image', () => {
  it('fetches Pod images with the authenticated fetcher and renders the image', async () => {
    const createObjectUrl = vi.fn(() => 'blob:question-image')
    const revokeObjectUrl = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrl })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrl })

    const fetcher = {
      _fetch: vi.fn(async () => new Response(new Blob(['image']), {
        status: 200,
        headers: { 'Content-Type': 'image/png' }
      }))
    }

    const element = document.createElement('questionaire-pane-take-question-image') as HTMLElement & {
      src: string
      fetcher: { _fetch: typeof fetcher._fetch }
      updateComplete: Promise<void>
    }
    element.src = 'https://pod.example.test/images/question.png'
    element.fetcher = fetcher
    document.body.append(element)
    await new Promise(resolve => setTimeout(resolve, 0))
    await element.updateComplete

    expect(fetcher._fetch).toHaveBeenCalledWith(element.src, {
      method: 'GET',
      credentials: 'include'
    })
    expect(element.shadowRoot?.querySelector('img')?.getAttribute('src')).toBe('blob:question-image')
    expect(createObjectUrl).toHaveBeenCalledOnce()

    element.remove()
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:question-image')
  })

  it('shows an explicit message when an authenticated image request fails', async () => {
    const fetcher = {
      _fetch: vi.fn(async () => new Response(null, { status: 403 }))
    }

    const element = document.createElement('questionaire-pane-take-question-image') as HTMLElement & {
      src: string
      fetcher: { _fetch: typeof fetcher._fetch }
      updateComplete: Promise<void>
    }
    element.src = 'https://pod.example.test/images/private.png'
    element.fetcher = fetcher
    document.body.append(element)
    await new Promise(resolve => setTimeout(resolve, 0))
    await element.updateComplete

    expect(element.shadowRoot?.querySelector('img')).toBeNull()
    expect(element.shadowRoot?.querySelector('[role="status"]')?.textContent).toContain('could not be loaded')
    element.remove()
  })
})
