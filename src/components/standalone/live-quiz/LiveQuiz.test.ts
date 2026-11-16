// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'
import type { LiveQuizState } from '../../../service/liveQuizClient'
import type { LiveQuizClientLike } from './LiveQuiz'
import './LiveQuiz'

const state: LiveQuizState = {
  lobbyId: 'ABC123',
  quizUri: 'https://pod.example/quiz',
  questionCount: 4,
  currentQuestionIndex: null,
  status: 'waiting',
  hostPlayerId: 'host',
  players: [{ id: 'host', name: 'Alice', score: 0, answered: 0, connected: true }]
}

function clientFixture () {
  let stateListener: ((state: LiveQuizState) => void) | undefined
  const client: LiveQuizClientLike = {
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(),
    onState: vi.fn(listener => { stateListener = listener; return () => {} }),
    onError: vi.fn(() => () => {}),
    onChatMessage: vi.fn(() => () => {}),
    sendChatMessage: vi.fn(),
    createGame: vi.fn(),
    joinGame: vi.fn(),
    startGame: vi.fn(),
    advanceQuestion: vi.fn(),
    submitAnswer: vi.fn(),
    finishGame: vi.fn()
  }
  return { client, emitState: () => stateListener?.(state) }
}

describe('questionnaire live quiz component', () => {
  it('creates a game and renders its lobby state', async () => {
    const fixture = clientFixture()
    const element = document.createElement('questionaire-live-quiz') as HTMLElement & {
      endpoint: string
      clientFactory: () => LiveQuizClientLike
      updateComplete: Promise<void>
    }
    element.endpoint = 'https://game.example.test'
    element.clientFactory = () => fixture.client
    document.body.append(element)
    await element.updateComplete

    const root = element.shadowRoot!
    ;(root.querySelector('[name="name"]') as HTMLInputElement).value = 'Alice'
    ;(root.querySelector('[name="quizUri"]') as HTMLInputElement).value = 'https://pod.example/quiz'
    ;(root.querySelector('[name="questionCount"]') as HTMLInputElement).value = '4'
    root.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await new Promise(resolve => setTimeout(resolve, 0))
    await element.updateComplete

    expect(fixture.client.createGame).toHaveBeenCalledWith({
      name: 'Alice', quizUri: 'https://pod.example/quiz', questionCount: 4
    })
    fixture.emitState()
    await element.updateComplete
    expect(element.shadowRoot?.textContent).toContain('ABC123')
    expect(element.shadowRoot?.textContent).toContain('Alice')
    expect(element.shadowRoot?.textContent).toContain('Start game')
    element.remove()
  })

  it('shows validation errors and allows them to be cleared', async () => {
    const fixture = clientFixture()
    const element = document.createElement('questionaire-live-quiz') as HTMLElement & {
      clientFactory: () => LiveQuizClientLike
      updateComplete: Promise<void>
    }
    element.clientFactory = () => fixture.client
    document.body.append(element)
    await element.updateComplete
    element.shadowRoot?.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    await new Promise(resolve => setTimeout(resolve, 0))
    await element.updateComplete
    expect(element.shadowRoot?.querySelector('[role="alert"]')?.textContent).toContain('name')
    ;(element.shadowRoot?.querySelector('.live-quiz-tabs button:nth-child(2)') as HTMLButtonElement)
      .dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 0))
    await element.updateComplete
    expect(element.shadowRoot?.querySelector('[role="alert"]')).toBeNull()
    element.remove()
  })
})
