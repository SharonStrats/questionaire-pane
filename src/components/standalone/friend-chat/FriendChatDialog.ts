import { css, html, nothing } from 'lit'
import { state } from 'lit/decorators.js'
import { customElement, DialogComponent } from 'solid-ui'
import { FriendChatClient, type FriendChatPerson, type FriendChatSnapshot, type FriendConversation } from '../../../service/friendChatClient'
import 'solid-ui/components/dialog'
import 'solid-ui/components/dialog-header'
import 'solid-ui/components/dialog-content'
import 'solid-ui/components/button'
import '~icons/lucide/x'
import '~icons/lucide/message-circle-more'

@customElement('questionaire-friend-chat-dialog')
export default class FriendChatDialog extends DialogComponent<void> {
  static styles = css`
    :host { display: block; }
    solid-ui-dialog-content { display: block; width: min(470px, calc(100vw - 32px)); max-height: min(520px, calc(100vh - 100px)); overflow: auto; }
    solid-ui-dialog-header { user-select: none; }
    .drag-handle { flex: 1; cursor: move; touch-action: none; }
    h1 { margin: 0; font-size: 15px; }
    .close { width: 26px; height: 26px; cursor: pointer; }
    .close icon-lucide-x { width: 16px; height: 16px; }
    .note { margin: 6px 0 10px; color: #667085; font-size: 10px; line-height: 1.4; }
    .layout { display: grid; grid-template-columns: 138px minmax(0, 1fr); gap: 10px; }
    .friends { display: grid; align-content: start; gap: 4px; max-height: 300px; overflow: auto; }
    .person { display: flex; align-items: center; gap: 6px; padding: 6px; border: 1px solid #eaecf0; border-radius: 7px; text-align: left; color: #344054; background: #fff; cursor: pointer; }
    .person.selected { border-color: #6c5ce7; background: #f7f5ff; }
    .avatar { display: grid; flex: 0 0 24px; height: 24px; border-radius: 50%; place-items: center; color: white; font-size: 8px; }
    .person strong { display: block; max-width: 94px; overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
    .person small { display: flex; align-items: center; gap: 4px; color: #667085; font-size: 9px; }
    .person small::before { width: 6px; height: 6px; border-radius: 50%; background: #d04444; content: ''; }
    .person small.online { color: #16815d; }
    .person small.online::before { background: #22a06b; }
    .conversation { display: flex; min-width: 0; min-height: 250px; flex-direction: column; }
    .conversation--empty { justify-content: center; padding: 16px; border: 1px dashed #eaecf0; border-radius: 8px; background: #fcfcfd; }
    .conversation-empty { margin: 0; color: #667085; text-align: center; font-size: 10px; line-height: 1.5; }
    h2 { margin: 0 0 6px; font-size: 12px; }
    .members { display: flex; flex-wrap: wrap; gap: 4px; margin: 0 0 6px; }
    .member { display: inline-flex; align-items: center; gap: 3px; padding: 3px 5px; border-radius: 10px; color: #4434a2; background: #eeeaff; font-size: 9px; }
    .member small { color: #667085; font-size: 8px; }
    .member button { width: 14px; height: 14px; padding: 0; border: 0; border-radius: 50%; color: #4434a2; background: transparent; cursor: pointer; font-size: 12px; line-height: 12px; }
    ol { display: flex; flex: 1; flex-direction: column; gap: 6px; max-height: 250px; margin: 0; padding: 0; overflow: auto; list-style: none; }
    li { align-self: flex-start; max-width: 90%; padding: 6px 8px; border-radius: 8px; color: #344054; background: #f2f4f7; overflow-wrap: anywhere; font-size: 10px; }
    li.mine { align-self: flex-end; color: #4434a2; background: #eeeaff; }
    li strong { display: block; margin-bottom: 2px; font-size: 9px; }
    .empty { color: #667085; font-size: 10px; line-height: 1.4; }
    form { display: flex; gap: 6px; margin-top: 8px; }
    input { min-width: 0; flex: 1; padding: 7px; border: 1px solid #d0d5dd; border-radius: 7px; font: inherit; font-size: 10px; }
    form button, .retry { padding: 6px 9px; border: 0; border-radius: 7px; color: #fff; background: #6c5ce7; cursor: pointer; font-size: 10px; }
    button:disabled { cursor: not-allowed; opacity: .5; }
    .error { color: #b42318; font-size: 12px; }
    .start { margin: 6px 0; padding: 6px; border: 0; border-radius: 7px; color: white; background: #6c5ce7; cursor: pointer; font-size: 10px; }
    .group { padding: 6px; border: 1px solid #eaecf0; border-radius: 7px; background: #f7f5ff; color: #4434a2; text-align: left; cursor: pointer; font-size: 10px; }
    .picker-label { margin: 0; color: #667085; font-size: 10px; font-weight: 600; }
    .recent-chats { margin-top: 4px; padding-top: 6px; border-top: 1px solid #eaecf0; }
    .recent-chats summary { color: #667085; cursor: pointer; font-size: 10px; font-weight: 600; }
    .recent-chat-list { display: grid; gap: 4px; margin-top: 6px; }
    .group { display: grid; gap: 3px; width: 100%; }
    .group small { color: #667085; font-size: 9px; font-weight: 400; }
    .notifications { padding: 4px 0; border: 0; background: transparent; color: #6c5ce7; cursor: pointer; font-size: 10px; }
    .members { display: flex; align-items: center; gap: 4px; margin: 0 0 8px; }
    .member-avatar { display: grid; flex: 0 0 28px; width: 28px; height: 28px; border: 2px solid #fff; border-radius: 50%; place-items: center; color: #fff; font-size: 8px; font-weight: 700; }
    .add-member { display: none; width: 28px; height: 28px; margin-left: 7px; padding: 0; border: 1px solid #d8d2fa; border-radius: 50%; place-items: center; color: #5f52c9; background: #f7f5ff; cursor: pointer; font-size: 18px; line-height: 1; }
    .add-member:focus-visible { outline: 2px solid #6c5ce7; outline-offset: 2px; }
    @media (max-width: 600px) {
      .layout { grid-template-columns: 1fr; }
      .friends { max-height: min(36vh, 250px); }
      .friends.friends--collapsed { display: none; }
      .conversation--empty { display: none; }
      .members { min-height: 30px; }
      .members { gap: 0; }
      .member-avatar + .member-avatar { margin-left: -6px; }
      .add-member { display: grid; }
    }
  `

  client!: FriendChatClient
  friends: FriendChatPerson[] = []
  onClose?: () => void
  onNotify?: (conversation: FriendConversation, kind: 'invitation' | 'message') => Promise<void>
  initialConversation = ''

  @state()
  private accessor snapshot: FriendChatSnapshot = { connection: 'connecting', online: [], messages: [], error: '', conversations: [], unread: {} }

  @state()
  private accessor selected: string[] = []

  @state()
  private accessor conversationId = ''

  @state()
  private accessor showingAddFriends = false

  @state()
  private accessor notificationStatus = ''

  @state()
  private accessor draft = ''

  @state()
  private accessor sendError = ''

  @state()
  private accessor sending = false

  private unsubscribe?: () => void
  private dragStart?: { x: number, y: number, left: number, top: number, width: number, height: number, dialog: HTMLDialogElement }
  private readonly dragMove = (event: PointerEvent): void => {
    if (!this.dragStart) return
    const { x, y, left, top, width, height, dialog } = this.dragStart
    dialog.style.left = `${Math.max(0, Math.min(window.innerWidth - width, left + event.clientX - x))}px`
    dialog.style.top = `${Math.max(0, Math.min(window.innerHeight - height, top + event.clientY - y))}px`
  }
  private readonly dragEnd = (): void => {
    this.dragStart = undefined
    window.removeEventListener('pointermove', this.dragMove)
    window.removeEventListener('pointerup', this.dragEnd)
    window.removeEventListener('pointercancel', this.dragEnd)
  }

  protected firstUpdated (): void {
    this.unsubscribe = this.client.subscribe(snapshot => { this.snapshot = snapshot })
    if (this.initialConversation) void this.openConversation(this.initialConversation)
  }

  disconnectedCallback (): void {
    this.dragEnd()
    this.unsubscribe?.()
    this.client.setActiveConversation('')
    super.disconnectedCallback()
  }

  private startDrag (event: PointerEvent): void {
    if (event.button !== 0) return
    const dialog = this.renderRoot.querySelector('solid-ui-dialog')?.shadowRoot?.querySelector('dialog')
    if (!dialog) {
      this.sendError = 'Unable to move chat: the dialog surface is unavailable.'
      return
    }
    const rect = dialog.getBoundingClientRect()
    dialog.style.position = 'fixed'
    dialog.style.margin = '0'
    dialog.style.right = 'auto'
    dialog.style.bottom = 'auto'
    dialog.style.left = `${rect.left}px`
    dialog.style.top = `${rect.top}px`
    event.preventDefault()
    this.dragStart = {
      x: event.clientX,
      y: event.clientY,
      left: rect.left, top: rect.top, width: rect.width, height: rect.height, dialog
    }
    window.addEventListener('pointermove', this.dragMove)
    window.addEventListener('pointerup', this.dragEnd, { once: true })
    window.addEventListener('pointercancel', this.dragEnd, { once: true })
  }

  private dismiss (): void {
    this.close()
    this.onClose?.()
  }

  private async send (event: SubmitEvent): Promise<void> {
    event.preventDefault()
    const text = this.draft.trim()
    if (!text || this.sending) return
    this.sending = true
    this.sendError = ''
    try {
      await this.client.sendGroupMessage(this.conversationId, text)
      this.draft = ''
      const conversation = this.snapshot.conversations.find(item => item.id === this.conversationId)
      if (conversation) {
        try {
          await this.onNotify?.(conversation, 'message')
        } catch (error) {
          this.notificationStatus = error instanceof Error ? error.message : 'Message sent, but inbox notifications failed.'
        }
      }
    } catch (error) {
      this.sendError = error instanceof Error ? error.message : 'Unable to send message.'
    } finally {
      this.sending = false
    }
  }

    private async startConversation (): Promise<void> {
      this.sending = true
      this.sendError = ''
      this.notificationStatus = ''
      try {
        const current = this.snapshot.conversations.find(item => item.id === this.conversationId)
        const conversation = current
          ? await this.client.addParticipants(current.id, this.selected.filter(uri => !current.participantWebIds.includes(uri)))
          : await this.client.createConversation(this.selected)
        this.conversationId = conversation.id
        this.showingAddFriends = false
        this.client.setActiveConversation(conversation.id)
        this.selected = []
        try {
          await this.onNotify?.(conversation, 'invitation')
        } catch (error) {
          this.notificationStatus = error instanceof Error ? error.message : 'Chat started, but inbox invitations failed.'
        }
      } catch (error) {
        this.sendError = error instanceof Error ? error.message : 'Unable to start chat.'
      } finally {
        this.sending = false
      }
    }

    private async toggleFriendPicker (): Promise<void> {
      this.showingAddFriends = !this.showingAddFriends
      if (!this.showingAddFriends) return
      await this.updateComplete
      this.renderRoot.querySelector<HTMLElement>('.friends')?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
    }

    async openConversation (id: string): Promise<void> {
      this.sendError = ''
      try {
        await this.client.openConversation(id)
        this.conversationId = id
        this.showingAddFriends = false
        this.client.setActiveConversation(id)
        this.draft = ''
      } catch (error) {
        this.sendError = error instanceof Error ? error.message : 'Unable to open chat.'
      }
    }

    private async enableNotifications (): Promise<void> {
      if (!('Notification' in window)) {
        this.notificationStatus = 'Browser notifications are not supported here.'
        return
      }
      try {
        const permission = await Notification.requestPermission()
        localStorage.setItem('questionaire-chat-notifications', permission === 'granted' ? 'true' : 'false')
        this.notificationStatus = permission === 'granted' ? 'Browser notifications enabled.' : 'Notifications were not enabled. You can change this in browser settings.'
      } catch (error) {
        this.notificationStatus = error instanceof Error ? error.message : 'Unable to enable browser notifications.'
      }
    }
  protected render () {
    const conversation = this.snapshot.conversations.find(item => item.id === this.conversationId)
    const conversationsByParticipants = new Map<string, FriendConversation>()
    for (const item of this.snapshot.conversations) {
      const key = JSON.stringify([...item.participantWebIds].sort())
      const current = conversationsByParticipants.get(key)
      if (!current || item.updatedAt > current.updatedAt) conversationsByParticipants.set(key, item)
    }
    const conversations = [...conversationsByParticipants.values()].sort((a, b) => b.updatedAt - a.updatedAt)
    const messages = conversation?.messages ?? []
    const nameFor = (item: FriendConversation, uri: string, index: number): string =>
      this.friends.find(friend => friend.uri === uri)?.name || item.participantNames[index] || uri
    const titleFor = (item: FriendConversation) => item.participantWebIds
      .map((uri, index) => uri === this.client.webId ? '' : nameFor(item, uri, index))
      .filter(Boolean).join(', ')
    const initialsFor = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
    const colors = ['#6c5ce7', '#e67871', '#2d9d97', '#d29a35', '#7b6fd0', '#4a9cc4']
    return html`
      <solid-ui-dialog>
        <solid-ui-dialog-header slot="header">
          <div class="drag-handle" @pointerdown=${this.startDrag}><h1>Chat with friends</h1></div>
          <solid-ui-button class="close" variant="ghost" aria-label="Close chat" @click=${this.dismiss}>
            <icon-lucide-x slot="icon"></icon-lucide-x>
          </solid-ui-button>
        </solid-ui-dialog-header>
        <solid-ui-dialog-content>
          <button class="notifications" @click=${this.enableNotifications}>Enable browser notifications</button>
          ${this.snapshot.error ? html`<p class="error" role="alert">${this.snapshot.error}</p>
            <button class="retry" @click=${() => this.client.retry()}>Retry connection</button>` : nothing}
          <div class="layout">
            <nav class="friends ${this.conversationId && !this.showingAddFriends ? 'friends--collapsed' : ''}" aria-label="Chat friends">
              <p class="picker-label">${this.conversationId ? 'Add people to this chat' : 'Start a new chat'}</p>
              ${this.friends.map((person, index) => html`
                <button class="person ${this.selected.includes(person.uri) ? 'selected' : ''}" aria-pressed=${this.selected.includes(person.uri)}
                  ?disabled=${Boolean(this.conversationId && this.snapshot.conversations.find(item => item.id === this.conversationId)?.participantWebIds.includes(person.uri))}
                  @click=${() => {
                  this.selected = this.selected.includes(person.uri) ? this.selected.filter(uri => uri !== person.uri) : [...this.selected, person.uri]
                  this.sendError = ''
                }}>
                  <span class="avatar" style="background:${colors[index % colors.length]}">${person.name.slice(0, 2).toUpperCase()}</span>
                  <span><strong>${person.name}</strong>
                    <small class=${this.snapshot.online.includes(person.uri) ? 'online' : ''}>${this.snapshot.online.includes(person.uri) ? 'Online' : 'Offline'}</small></span>
                </button>
              `)}
              ${!this.friends.length ? html`<p class="empty">Add people from the Friends dialog to start chatting.</p>` : nothing}
              <button class="start" ?disabled=${!this.selected.length || this.selected.length > 9 || this.sending || this.snapshot.connection !== 'connected'} @click=${this.startConversation}>
                ${this.conversationId ? 'Add to chat' : 'Start chat'} (${this.selected.length} selected)
              </button>
              ${!conversation && conversations.length ? html`
                <details class="recent-chats">
                  <summary>Recent chats (${conversations.length})</summary>
                  <div class="recent-chat-list">
                    ${conversations.map(item => html`
                      <button class="group" @click=${() => this.openConversation(item.id)}>
                        <span>${titleFor(item)}</span>
                        <small>${item.messages.length ? `${item.messages.length} messages` : 'No messages yet'}
                          ${this.snapshot.unread[item.id] ? ` · ${this.snapshot.unread[item.id]} new` : ''}</small>
                      </button>
                    `)}
                  </div>
                </details>
              ` : nothing}
            </nav>
            <section class="conversation ${conversation ? 'conversation--active' : 'conversation--empty'}" aria-label="Conversation">
              ${conversation ? html`
                <div class="members" aria-label="Chat participants">
                  ${conversation.participantWebIds.map((uri, index) => {
                    const name = nameFor(conversation, uri, index)
                    return html`<span class="member-avatar" role="img" aria-label=${name} title=${name}
                      style="background:${colors[index % colors.length]}">${initialsFor(name)}</span>`
                  })}
                  <button class="add-member" type="button" aria-label=${this.showingAddFriends ? 'Close people picker' : 'Add people to chat'}
                    aria-expanded=${this.showingAddFriends} @click=${this.toggleFriendPicker}>
                    +
                  </button>
                </div>
                <ol aria-live="polite">${messages.map(message => html`
                  <li class=${message.senderWebId === this.client.webId ? 'mine' : ''}><strong>${message.senderName}</strong>${message.content}</li>
                `)}</ol>
                <form @submit=${this.send}>
                  <input aria-label="Message" placeholder="Type a message" maxlength="500" .value=${this.draft}
                    ?disabled=${this.snapshot.connection !== 'connected'}
                    @input=${(event: Event) => { this.draft = (event.target as HTMLInputElement).value }}>
                  <button type="submit" ?disabled=${this.snapshot.connection !== 'connected' || !this.draft.trim() || this.sending}>${this.sending ? 'Sending…' : 'Send'}</button>
                </form>
                ${this.notificationStatus ? html`<p class="note" role="status">${this.notificationStatus}</p>` : nothing}
              ` : html`<p class="conversation-empty">Choose friends to start a chat, or open a recent chat.</p>`}
            </section>
          </div>
          ${this.sendError ? html`<p class="error" role="alert">${this.sendError}</p>` : nothing}
        </solid-ui-dialog-content>
      </solid-ui-dialog>
    `
  }
}

