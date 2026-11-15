import { io, type Socket } from 'socket.io-client'

export interface LiveQuizPlayer {
  id: string
  name: string
  webId?: string
  score: number
  answered: number
  connected: boolean
}

export interface LiveQuizState {
  lobbyId: string
  quizUri: string
  questionCount: number
  currentQuestionIndex: number | null
  status: 'waiting' | 'playing' | 'finished'
  hostPlayerId: string
  players: LiveQuizPlayer[]
}

type LiveQuizSocket = Pick<Socket, 'connect' | 'disconnect' | 'emit' | 'on' | 'off' | 'once'>

export interface LiveQuizClientOptions {
  endpoint: string
  socketFactory?: (endpoint: string, options: { autoConnect: boolean }) => LiveQuizSocket
}

export class LiveQuizClient {
  private readonly socket: LiveQuizSocket

  constructor (options: LiveQuizClientOptions) {
    const endpoint = options.endpoint.trim()
    if (!endpoint) throw new Error('A realtime game endpoint is required.')
    this.socket = (options.socketFactory ?? io)(endpoint, { autoConnect: false })
  }

  connect (): Promise<void> {
    return new Promise((resolve, reject) => {
      const onConnect = (): void => {
        cleanup()
        resolve()
      }
      const onError = (error: Error): void => {
        cleanup()
        reject(error)
      }
      const cleanup = (): void => {
        this.socket.off('connect', onConnect)
        this.socket.off('connect_error', onError)
      }
      this.socket.once('connect', onConnect)
      this.socket.once('connect_error', onError)
      this.socket.connect()
    })
  }

  onState (listener: (state: LiveQuizState) => void): () => void {
    this.socket.on('gameState', listener)
    return () => this.socket.off('gameState', listener)
  }

  onError (listener: (message: string) => void): () => void {
    const handler = (error: { message?: string }): void => {
      listener(error.message || 'The live quiz service reported an error.')
    }
    this.socket.on('gameError', handler)
    return () => this.socket.off('gameError', handler)
  }

  createGame (input: { name: string, webId?: string, quizUri: string, questionCount: number }): void {
    this.socket.emit('createGame', input)
  }

  joinGame (input: { name: string, webId?: string, lobbyId: string }): void {
    this.socket.emit('joinGame', input)
  }

  startGame (): void {
    this.socket.emit('startGame')
  }

  advanceQuestion (): void {
    this.socket.emit('advanceQuestion')
  }

  submitAnswer (questionIndex: number, score: number): void {
    this.socket.emit('submitAnswer', { questionIndex, score })
  }

  finishGame (): void {
    this.socket.emit('finishGame')
  }

  disconnect (): void {
    this.socket.disconnect()
  }
}
