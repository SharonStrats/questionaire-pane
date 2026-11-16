import { html, nothing } from 'lit'
import { property } from 'lit/decorators.js'
import { state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import type { LiveStore, NamedNode } from 'rdflib'
import { sym } from 'rdflib'
import { LiveQuizClient, type LiveQuizChatMessage, type LiveQuizState } from '../../../service/liveQuizClient'
import { loadQuestionaireQuestionSummaries, type QuestionaireQuestionSummary } from '../../../service/questionQueries'
import styles from './LiveQuiz.styles.css'
import '~icons/lucide/message-circle-more'

export interface LiveQuizClientLike {
  connect: () => Promise<void>
  disconnect: () => void
  onState: (listener: (state: LiveQuizState) => void) => () => void
  onError: (listener: (message: string) => void) => () => void
  onChatMessage: (listener: (message: LiveQuizChatMessage) => void) => () => void
  sendChatMessage: (content: string) => void
  createGame: (input: { name: string, quizUri: string, questionCount: number }) => void
  joinGame: (input: { name: string, lobbyId: string }) => void
  startGame: () => void
  advanceQuestion: () => void
  submitAnswer: (questionIndex: number, score: number) => void
  finishGame: () => void
}

export type LiveQuizClientFactory = (endpoint: string) => LiveQuizClientLike

@customElement('questionaire-live-quiz')
export default class LiveQuiz extends WebComponent {
  static styles = styles

  @property({ type: String })
  accessor endpoint = ''

  @property({ type: String })
  accessor quizUri = ''

  @property({ type: Number })
  accessor questionCount = 0

  @property({ attribute: false })
  accessor clientFactory: LiveQuizClientFactory = (endpoint: string) => new LiveQuizClient({ endpoint })

  @property({ attribute: false })
  accessor store: LiveStore | undefined = undefined

  private client?: LiveQuizClientLike
  private removeStateListener?: () => void
  private removeErrorListener?: () => void
  private removeChatListener?: () => void
  private state?: LiveQuizState
  private chatMessages: LiveQuizChatMessage[] = []
  private error = ''
  private mode: 'create' | 'join' = 'create'
  private isHost = false
  private connected = false
  private submittedQuestionIndex: number | null = null
  private questionSummaries: QuestionaireQuestionSummary[] = []

  @state()
  private accessor chatOpen = false

  disconnectedCallback (): void {
    this.removeListeners()
    this.client?.disconnect()
    this.client = undefined
    super.disconnectedCallback()
  }

  private removeListeners (): void {
    this.removeStateListener?.()
    this.removeErrorListener?.()
    this.removeChatListener?.()
    this.removeStateListener = undefined
    this.removeErrorListener = undefined
    this.removeChatListener = undefined
  }

  private async connect (): Promise<LiveQuizClientLike | undefined> {
    this.error = ''
    if (!this.endpoint.trim()) {
      this.error = 'Enter the realtime game endpoint.'
      this.requestUpdate()
      return undefined
    }

    this.removeListeners()
    this.client?.disconnect()
    const client = this.clientFactory(this.endpoint)
    this.client = client
    this.removeStateListener = client.onState(state => {
      if (state.currentQuestionIndex !== this.state?.currentQuestionIndex) {
        this.submittedQuestionIndex = null
      }
      this.state = state
      this.requestUpdate()
    })
    this.removeErrorListener = client.onError(message => {
      this.error = message
      this.requestUpdate()
    })
    this.removeChatListener = client.onChatMessage(message => {
      this.chatMessages = [...this.chatMessages, message].slice(-100)
      this.requestUpdate()
    })
    try {
      await client.connect()
      this.connected = true
      return client
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to connect to the live quiz service.'
      client.disconnect()
      this.connected = false
      this.requestUpdate()
      return undefined
    }
  }

  private async loadQuestions (quizUri: string): Promise<void> {
    if (!this.store) return
    try {
      this.questionSummaries = await loadQuestionaireQuestionSummaries(this.store, sym(quizUri) as NamedNode)
      this.requestUpdate()
    } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to load the published quiz questions.'
      this.requestUpdate()
    }
  }

  private value (form: HTMLFormElement, name: string): string {
    return new FormData(form).get(name)?.toString().trim() ?? ''
  }

  private async createGame (event: SubmitEvent): Promise<void> {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const name = this.value(form, 'name')
    const quizUri = this.value(form, 'quizUri')
    const questionCount = Number(this.value(form, 'questionCount'))
    if (!name || !quizUri || !Number.isInteger(questionCount) || questionCount < 1) {
      this.error = 'Enter your name, a quiz URI, and a question count of at least 1.'
      this.requestUpdate()
      return
    }
    const client = await this.connect()
    if (!client) return
    this.isHost = true
    void this.loadQuestions(quizUri)
    client.createGame({ name, quizUri, questionCount })
  }

  private async joinGame (event: SubmitEvent): Promise<void> {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const name = this.value(form, 'name')
    const lobbyId = this.value(form, 'lobbyId')
    if (!name || !lobbyId) {
      this.error = 'Enter your name and lobby code.'
      this.requestUpdate()
      return
    }
    const client = await this.connect()
    if (!client) return
    this.isHost = false
    client.joinGame({ name, lobbyId })
  }

  private startGame (): void {
    this.error = ''
    this.client?.startGame()
  }

  private submitAnswer (event: SubmitEvent): void {
    event.preventDefault()
    if (!this.state || this.state.currentQuestionIndex === null) return
    const form = event.currentTarget as HTMLFormElement
    const question = this.questionSummaries[this.state.currentQuestionIndex]
    const selectedOption = this.value(form, 'option')
    const score = question?.options.length
      ? question.correctOptions.includes(selectedOption) ? 100 : 0
      : Number(this.value(form, 'score'))
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      this.error = 'Enter a score from 0 to 100 for this answer.'
      this.requestUpdate()
      return
    }
    this.error = ''
    this.client?.submitAnswer(this.state.currentQuestionIndex, score)
    this.submittedQuestionIndex = this.state.currentQuestionIndex
    this.requestUpdate()
  }

  private advanceQuestion (): void {
    this.error = ''
    this.client?.advanceQuestion()
  }

  private finishGame (): void {
    this.error = ''
    this.client?.finishGame()
  }

  private selectMode (mode: 'create' | 'join'): void {
    this.mode = mode
    this.error = ''
    this.requestUpdate()
  }

  private clearError (): void {
    this.error = ''
    this.requestUpdate()
  }

  private sendChatMessage (event: SubmitEvent): void {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const input = form.elements.namedItem('message') as HTMLInputElement
    this.client?.sendChatMessage(input.value)
    input.value = ''
  }

  private renderChat () {
    if (!this.state || !this.connected) return nothing
    if (!this.chatOpen) {
      return html`
        <button class="live-quiz-chat-toggle" type="button" aria-label="Open room chat" @click=${() => { this.chatOpen = true }}>
          <icon-lucide-message-circle-more aria-hidden="true"></icon-lucide-message-circle-more>
          <span>Chat with friends</span>
          ${this.chatMessages.length ? html`<b>${this.chatMessages.length}</b>` : nothing}
        </button>
      `
    }
    return html`
      <section class="live-quiz-chat" aria-label="Room chat">
        <div class="live-quiz-chat-heading"><h3>Room chat</h3><button type="button" @click=${() => { this.chatOpen = false }}>Close</button><span>${this.chatMessages.length} message${this.chatMessages.length === 1 ? '' : 's'}</span></div>
        <ol aria-live="polite">
          ${this.chatMessages.map(message => html`
            <li><strong>${message.senderName}</strong><span>${message.content}</span></li>
          `)}
        </ol>
        <form @submit=${this.sendChatMessage}>
          <input name="message" maxlength="500" autocomplete="off" placeholder="Say something to the room">
          <button class="primary" type="submit">Send</button>
        </form>
      </section>
    `
  }

  private renderCreateForm () {
    return html`
      <form class="live-quiz-form" @submit=${this.createGame}>
        <label>Display name<input name="name" required autocomplete="name"></label>
        <label>Quiz URI<input name="quizUri" required type="url" .value=${this.quizUri} ?readonly=${Boolean(this.quizUri)} placeholder="https://pod.example/quiz"></label>
        <label>Question count<input name="questionCount" required type="number" min="1" step="1" .value=${this.questionCount ? String(this.questionCount) : ''} ?readonly=${this.questionCount > 0}></label>
        <button class="primary" type="submit">Create game</button>
      </form>
    `
  }

  private renderJoinForm () {
    return html`
      <form class="live-quiz-form" @submit=${this.joinGame}>
        <label>Display name<input name="name" required autocomplete="name"></label>
        <label>Lobby code<input name="lobbyId" required autocomplete="off"></label>
        <button class="primary" type="submit">Join game</button>
      </form>
    `
  }

  private renderLobby () {
    if (!this.state) return nothing
    return html`
      <section class="live-quiz-lobby" aria-live="polite">
        <div class="live-quiz-lobby-heading">
          <div><span class="eyebrow">Lobby</span><h2>${this.state.lobbyId}</h2></div>
          <span class="status">${this.state.status}</span>
        </div>
        <p class="live-quiz-meta">${this.state.questionCount} questions · ${this.state.players.length} participant${this.state.players.length === 1 ? '' : 's'}</p>
        <ul class="live-quiz-players">
          ${this.state.players.map(player => html`<li><span>${player.name}</span><span>${player.connected ? 'Connected' : 'Disconnected'}</span></li>`)}
        </ul>
        ${this.state.status === 'playing' ? this.renderQuestion() : nothing}
        ${this.state.status === 'finished' ? this.renderResults() : nothing}
        ${this.isHost && this.state.status === 'waiting'
          ? html`<button class="primary" type="button" @click=${this.startGame}>Start game</button>`
          : nothing}
      </section>
    `
  }

  private renderQuestion () {
    if (!this.state || this.state.currentQuestionIndex === null) return nothing
    const questionNumber = this.state.currentQuestionIndex + 1
    const submitted = this.submittedQuestionIndex === this.state.currentQuestionIndex
    const question = this.questionSummaries[this.state.currentQuestionIndex]
    const allPlayersAnswered = this.state.players
      .filter(player => player.connected)
      .every(player => player.answered > this.state!.currentQuestionIndex!)
    const lastQuestion = questionNumber === this.state.questionCount
    return html`
      <section class="live-quiz-question" aria-live="polite">
        <span class="eyebrow">Question ${questionNumber} of ${this.state.questionCount}</span>
        <h3>${question?.title || `Answer question ${questionNumber}`}</h3>
        <p>${question ? `Question type: ${question.typeUri.split('#').pop() || question.typeUri}` : 'Loading the published question…'}</p>
        <form class="live-quiz-answer-form" @submit=${this.submitAnswer}>
          ${question?.options.length
            ? html`
              <fieldset ?disabled=${submitted}>
                <legend>Choose an answer</legend>
                ${question.options.map(option => html`
                  <label><input name="option" type="radio" value=${option} required> ${option}</label>
                `)}
              </fieldset>
            `
            : html`<label>Your score<input name="score" type="number" min="0" max="100" step="1" ?disabled=${submitted} required></label>`}
          <button class="primary" type="submit" ?disabled=${submitted}>${submitted ? 'Answer recorded' : 'Record answer'}</button>
        </form>
        ${this.isHost && allPlayersAnswered && !lastQuestion
          ? html`<button class="primary" type="button" @click=${this.advanceQuestion}>Next question</button>`
          : nothing}
        ${this.isHost && allPlayersAnswered && lastQuestion
          ? html`<button class="primary" type="button" @click=${this.finishGame}>Show results</button>`
          : nothing}
      </section>
    `
  }

  private renderResults () {
    if (!this.state) return nothing
    const players = [...this.state.players].sort((left, right) => right.score - left.score)
    return html`
      <section class="live-quiz-results" aria-live="polite">
        <span class="eyebrow">Final results</span>
        <h3>Leaderboard</h3>
        <ol>
          ${players.map(player => html`<li><span>${player.name}</span><strong>${player.score}</strong></li>`)}
        </ol>
      </section>
    `
  }

  render () {
    return html`
      <section class="live-quiz-shell">
        <header><span class="eyebrow">Live quiz</span><h1>Play together</h1><p>Start a lobby or join one with a code.</p></header>
        <label class="endpoint">Realtime game endpoint<input .value=${this.endpoint} @input=${(event: InputEvent) => { this.endpoint = (event.target as HTMLInputElement).value }} type="url" required></label>
        <div class="live-quiz-tabs" role="tablist">
          <button type="button" class=${this.mode === 'create' ? 'active' : ''} @click=${() => this.selectMode('create')}>Create</button>
          <button type="button" class=${this.mode === 'join' ? 'active' : ''} @click=${() => this.selectMode('join')}>Join</button>
        </div>
        ${this.mode === 'create' ? this.renderCreateForm() : this.renderJoinForm()}
        ${this.error ? html`<p class="live-quiz-error" role="alert">${this.error}<button type="button" @click=${this.clearError}>Dismiss</button></p>` : nothing}
        ${this.renderLobby()}
        ${this.renderChat()}
        ${this.connected ? html`<p class="live-quiz-connected">Connected to live quiz service.</p>` : nothing}
      </section>
    `
  }
}
