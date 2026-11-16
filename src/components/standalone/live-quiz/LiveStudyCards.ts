import { html, nothing } from 'lit'
import { property, state } from 'lit/decorators.js'
import { customElement, WebComponent } from 'solid-ui'
import type { LiveStore, NamedNode } from 'rdflib'
import { sym, Namespace } from 'rdflib'
import { LiveQuizClient, type LiveQuizChatMessage, type LiveQuizState } from '../../../service/liveQuizClient'

export interface LiveStudyCard {
  front: string
  back: string
}

@customElement('questionaire-live-study-cards')
export default class LiveStudyCards extends WebComponent {
  @property({ type: String }) accessor endpoint = ''
  @property({ type: String }) accessor deckUri = ''
  @property({ type: String }) accessor title = 'Study cards'
  @property({ attribute: false }) accessor cards: LiveStudyCard[] = []
  @property({ attribute: false }) accessor store: LiveStore | undefined = undefined
  private client?: LiveQuizClient
  private state?: LiveQuizState
  private mode: 'create' | 'join' = 'create'
  private host = false
  private error = ''
  private submitted: number | null = null
  private messages: LiveQuizChatMessage[] = []
  private removeState?: () => void
  private removeError?: () => void
  private removeChat?: () => void
  @state() private accessor chatOpen = false

  disconnectedCallback (): void {
    this.removeState?.(); this.removeError?.(); this.removeChat?.()
    this.client?.disconnect()
    super.disconnectedCallback()
  }

  private async connect (): Promise<boolean> {
    if (!this.endpoint.trim()) { this.error = 'Enter the realtime game endpoint.'; return false }
    this.client?.disconnect()
    this.client = new LiveQuizClient({ endpoint: this.endpoint })
    this.removeState = this.client.onState(state => {
      if (state.currentQuestionIndex !== this.state?.currentQuestionIndex) this.submitted = null
      this.state = state
      if (state.deckUri && state.deckUri !== this.deckUri) void this.loadDeck(state.deckUri)
      this.requestUpdate()
    })
    this.removeError = this.client.onError(message => { this.error = message; this.requestUpdate() })
    this.removeChat = this.client.onChatMessage(message => {
      this.messages = [...this.messages, message].slice(-100)
      this.requestUpdate()
    })
    try { await this.client.connect(); return true } catch (error) {
      this.error = error instanceof Error ? error.message : 'Unable to connect to the realtime service.'
      this.client.disconnect(); return false
    }
  }

  private async loadDeck (uri: string): Promise<void> {
    if (!this.store?.fetcher) return
    try {
      await this.store.fetcher.load(sym(uri))
      const vocabulary = Namespace('https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#')
      const deck = sym(`${uri}#deck`)
      this.title = this.store.any(deck, vocabulary('name'))?.value || this.title
      this.cards = this.store.each(deck, vocabulary('studyCard'))
        .filter((card): card is NamedNode => card.termType === 'NamedNode')
        .map(card => ({
          front: this.store!.any(card, vocabulary('front'))?.value ?? '',
          back: this.store!.any(card, vocabulary('back'))?.value ?? ''
        }))
      this.requestUpdate()
    } catch { this.error = 'Unable to load the shared study deck.'; this.requestUpdate() }
  }

  private value (form: HTMLFormElement, name: string): string {
    return new FormData(form).get(name)?.toString().trim() ?? ''
  }

  private async create (event: SubmitEvent): Promise<void> {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const name = this.value(form, 'name')
    if (!name || !this.deckUri || !this.cards.length) { this.error = 'This study deck has no cards to play.'; return }
    if (!await this.connect()) return
    this.host = true
    this.client?.createStudyGame({ name, deckUri: this.deckUri, questionCount: this.cards.length })
  }

  private async join (event: SubmitEvent): Promise<void> {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const name = this.value(form, 'name'); const lobbyId = this.value(form, 'lobbyId')
    if (!name || !lobbyId || !await this.connect()) return
    this.host = false
    this.client?.joinGame({ name, lobbyId })
  }

  private answer (card: LiveStudyCard, answer: string): void {
    if (!this.state || this.state.currentQuestionIndex === null || this.submitted !== null) return
    this.submitted = this.state.currentQuestionIndex
    this.client?.submitAnswer(this.submitted, answer === card.back ? 100 : 0)
    this.requestUpdate()
  }

  private renderChat () {
    if (!this.state) return nothing
    return html`<section class="live-quiz-chat">
      <button type="button" class="study-card-chat-toggle" @click=${() => { this.chatOpen = !this.chatOpen }}>💬 ${this.chatOpen ? 'Hide chat' : 'Chat with players'}</button>
      ${this.chatOpen ? html`<ol aria-live="polite">${this.messages.map(message => html`<li><strong>${message.senderName}</strong> ${message.content}</li>`)}</ol>
        <form @submit=${(event: SubmitEvent) => { event.preventDefault(); const input = (event.currentTarget as HTMLFormElement).elements.namedItem('message') as HTMLInputElement; this.client?.sendChatMessage(input.value); input.value = '' }}>
          <input name="message" maxlength="500" placeholder="Say something to the room"><button class="primary">Send</button>
        </form>` : nothing}
    </section>`
  }

  private renderLobby () {
    if (!this.state) return nothing
    const index = this.state.currentQuestionIndex
    const card = index === null ? undefined : this.cards[index]
    const answered = this.submitted === index
    const options = card ? [...new Set([card.back, ...this.cards.filter((_, i) => i !== index).map(item => item.back)])].sort(() => Math.random() - .5).slice(0, 4) : []
    const allAnswered = index !== null && this.state.players.filter(player => player.connected).every(player => player.answered > index)
    return html`<section class="live-study-lobby">
      <header><span>STUDY ROOM</span><h2>${this.title}</h2><strong>Code: ${this.state.lobbyId}</strong><p>${this.state.players.length} player${this.state.players.length === 1 ? '' : 's'} · ${this.state.status}</p></header>
      <ul>${this.state.players.map(player => html`<li>${player.name}<b>${player.score}</b></li>`)}</ul>
      ${this.state.status === 'playing' && card ? html`<article class="study-card-question"><span>Card ${(index ?? 0) + 1} of ${this.state.questionCount}</span><p>${card.front}</p></article>
        <div class="study-card-choices">${options.map(option => html`<button ?disabled=${answered} class=${answered && option === card.back ? 'is-correct' : ''} @click=${() => this.answer(card!, option)}>${option}</button>`)}</div>
        ${this.host && allAnswered ? html`<button class="primary" @click=${() => index === this.state!.questionCount - 1 ? this.client?.finishGame() : this.client?.advanceQuestion()}>${index === this.state.questionCount - 1 ? 'Show results' : 'Next card'}</button>` : nothing}`
        : nothing}
      ${this.state.status === 'finished' ? html`<h3>Final scores</h3><ol>${[...this.state.players].sort((a, b) => b.score - a.score).map(player => html`<li>${player.name}<strong>${player.score}</strong></li>`)}</ol>` : nothing}
      ${this.host && this.state.status === 'waiting' ? html`<button class="primary" @click=${() => this.client?.startGame()}>Start game</button>` : nothing}
    </section>`
  }

  render () {
    return html`<section class="live-study-shell"><header><span>PLAY TOGETHER</span><h1>Live study cards</h1><p>Race through this saved deck with friends.</p></header>
      ${!this.state ? html`<div class="live-quiz-tabs"><button class=${this.mode === 'create' ? 'active' : ''} @click=${() => { this.mode = 'create' }}>Host</button><button class=${this.mode === 'join' ? 'active' : ''} @click=${() => { this.mode = 'join' }}>Join</button></div>
        ${this.mode === 'create' ? html`<form class="live-quiz-form" @submit=${this.create}><label>Your name<input name="name" required></label><button class="primary">Create room</button></form>` : html`<form class="live-quiz-form" @submit=${this.join}><label>Your name<input name="name" required></label><label>Room code<input name="lobbyId" required></label><button class="primary">Join room</button></form>`}` : this.renderLobby()}
      ${this.error ? html`<p class="live-quiz-error">${this.error}</p>` : nothing}${this.renderChat()}</section>`
  }
}
