import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LiveQuizClient } from './liveQuizClient'

const socket = {
  connect: vi.fn(),
  disconnect: vi.fn(),
  emit: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  once: vi.fn()
}

const socketFactory = vi.fn((_endpoint: string, _options: { autoConnect: boolean }) => socket)

describe('LiveQuizClient', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects an empty endpoint', () => {
    expect(() => new LiveQuizClient({ endpoint: ' ', socketFactory })).toThrow('realtime game endpoint')
  })

  it('emits the live quiz protocol commands', () => {
    const client = new LiveQuizClient({ endpoint: 'https://game.example.test', socketFactory })

    client.createGame({ name: 'Alice', quizUri: 'https://pod.example/quiz/index.ttl#this', questionCount: 3 })
    client.joinGame({ name: 'Bob', lobbyId: 'ABC123' })
    client.startGame()
    client.advanceQuestion()
    client.submitAnswer(0, 1)
    client.finishGame()

    expect(socket.emit).toHaveBeenNthCalledWith(1, 'createGame', {
      name: 'Alice',
      quizUri: 'https://pod.example/quiz/index.ttl#this',
      questionCount: 3
    })
    expect(socket.emit).toHaveBeenNthCalledWith(2, 'joinGame', { name: 'Bob', lobbyId: 'ABC123' })
    expect(socket.emit).toHaveBeenNthCalledWith(3, 'startGame')
    expect(socket.emit).toHaveBeenNthCalledWith(4, 'advanceQuestion')
    expect(socket.emit).toHaveBeenNthCalledWith(5, 'submitAnswer', { questionIndex: 0, score: 1 })
    expect(socket.emit).toHaveBeenNthCalledWith(6, 'finishGame')
  })

  it('returns unsubscribe functions for state and error listeners', () => {
    const client = new LiveQuizClient({ endpoint: 'https://game.example.test', socketFactory })
    const stateListener = vi.fn()
    const errorListener = vi.fn()

    const removeState = client.onState(stateListener)
    const removeError = client.onError(errorListener)
    removeState()
    removeError()

    expect(socket.on).toHaveBeenNthCalledWith(1, 'gameState', stateListener)
    expect(socket.on).toHaveBeenNthCalledWith(2, 'gameError', expect.any(Function))
    expect(socket.off).toHaveBeenNthCalledWith(1, 'gameState', stateListener)
    expect(socket.off).toHaveBeenNthCalledWith(2, 'gameError', expect.any(Function))
  })
})
