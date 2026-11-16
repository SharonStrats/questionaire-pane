// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sym } from 'rdflib'
import StudySessionSetup, { type StudySessionStartDetail } from './StudySessionSetup'

afterEach(() => { document.body.replaceChildren() })

async function fixture () {
  const element = new StudySessionSetup()
  element.cards = Array.from({ length: 100 }, (_, i) => ({
    uri: `https://teacher.example/deck.ttl#card-${i}`, front: `Question ${i}`, back: `Answer ${i}`
  }))
  element.progress = {
    userUri: 'https://alice.example/#me', storageUrl: 'https://alice.example/',
    deckUri: 'https://teacher.example/deck.ttl#deck', progressDocument: sym('https://alice.example/progress.ttl'), cards: {}
  }
  document.body.append(element)
  await element.updateComplete
  return element
}

describe('study session setup', () => {
  it('starts a bounded session with the exact selected saved cards', async () => {
    const element = await fixture()
    const listener = vi.fn()
    element.addEventListener('study-session-start', listener)
    element.shadowRoot!.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    const detail = (listener.mock.calls[0][0] as CustomEvent<StudySessionStartDetail>).detail
    expect(detail.options).toEqual({ mode: 'all', count: 20 })
    expect(detail.cards).toEqual(element.cards.slice(0, 20))
    expect(element.shadowRoot!.textContent).toContain('100 matching cards; 20 in this session')
  })

  it('starts an all-card session with never-reviewed cards before repeats', async () => {
    const element = await fixture()
    element.progress!.cards[element.cards[0].uri] = {
      correct: 0,
      incorrect: 1,
      revealed: 0,
      streak: 0,
      lastOutcome: 'incorrect',
      lastReviewed: '2026-11-15T00:00:00.000Z',
      dueAt: '2026-11-15T00:10:00.000Z'
    }
    element.requestUpdate()
    await element.updateComplete
    const listener = vi.fn()
    element.addEventListener('study-session-start', listener)
    element.shadowRoot!.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    const detail = (listener.mock.calls[0][0] as CustomEvent<StudySessionStartDetail>).detail
    expect(detail.cards).toEqual(element.cards.slice(1, 21))
    expect(element.shadowRoot!.textContent).toContain('1 of 100 completed so far')
  })

  it('does not silently fill an empty needs-practice session and blocks progress errors', async () => {
    const element = await fixture()
    const listener = vi.fn()
    element.addEventListener('study-session-start', listener)
    const select = element.shadowRoot!.querySelector('select')!
    select.value = 'needs-practice'
    select.dispatchEvent(new Event('change'))
    await element.updateComplete
    expect(element.shadowRoot!.querySelector('button')!.disabled).toBe(true)
    expect(element.shadowRoot!.textContent).toContain('No cards match this mode')
    element.error = 'Pod access denied'
    await element.updateComplete
    expect(element.shadowRoot!.querySelector('[role=alert]')!.textContent).toBe('Pod access denied')
    element.shadowRoot!.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    expect(listener).not.toHaveBeenCalled()
  })

  it('rejects fractional counts and caps counts larger than the matching deck', async () => {
    const element = await fixture()
    const input = element.shadowRoot!.querySelector('input')!
    input.value = '1.5'
    input.dispatchEvent(new Event('input'))
    await element.updateComplete
    expect(element.shadowRoot!.querySelector('button')!.disabled).toBe(true)
    input.value = '200'
    input.dispatchEvent(new Event('input'))
    await element.updateComplete
    expect(element.shadowRoot!.textContent).toContain('100 in this session')
    const listener = vi.fn()
    element.addEventListener('study-session-start', listener)
    element.shadowRoot!.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }))
    expect(listener.mock.calls[0][0].detail.cards).toHaveLength(100)
  })
})
