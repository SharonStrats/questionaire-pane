import { io, type Socket } from 'socket.io-client'

export interface FriendChatPerson {
  uri: string
  name: string
}

export interface FriendMessage {
  id: string
  senderWebId: string
  recipientWebId: string
  senderName: string
  content: string
  timestamp: number
  conversationId?: string
}

export interface FriendConversation {
  id: string
  creatorWebId: string
  participantWebIds: string[]
  participantNames: string[]
  messages: FriendMessage[]
  updatedAt: number
}

export interface FriendChatSnapshot {
  connection: 'connecting' | 'connected' | 'disconnected'
  online: string[]
  messages: FriendMessage[]
  error: string
  conversations: FriendConversation[]
  unread: Record<string, number>
}

export class FriendChatClient {
  private readonly socket: Socket
  private readonly listeners = new Set<(snapshot: FriendChatSnapshot) => void>()
  private snapshot: FriendChatSnapshot = { connection: 'connecting', online: [], messages: [], error: '', conversations: [], unread: {} }
  private friends: FriendChatPerson[] = []
  private activeConversation = ''
  onIncoming?: (message: FriendMessage) => void
  onInvitation?: (conversation: FriendConversation) => void

  constructor (readonly webId: string, private readonly name: string, endpoint: string) {
    this.socket = io(endpoint, { autoConnect: false, timeout: 5000 })
    this.socket.on('connect', () => this.register())
    this.socket.on('connect_error', () => {
      this.update({ connection: 'disconnected', online: [], error: `Cannot connect to chat at ${endpoint}. Check that the realtime service is running.` })
    })
    this.socket.on('disconnect', () => this.update({ connection: 'disconnected', online: [], error: 'Chat disconnected. Reconnecting…' }))
    this.socket.on('friendPresence', (online: string[]) => this.update({ online }))
    this.socket.on('friendConversation', (conversation: FriendConversation) => this.rememberConversation(conversation))
    this.socket.on('friendChatInvitation', (conversation: FriendConversation) => {
      if (conversation.creatorWebId === this.webId) return
      if (this.activeConversation !== conversation.id) {
        this.update({ unread: { ...this.snapshot.unread, [conversation.id]: (this.snapshot.unread[conversation.id] ?? 0) + 1 } })
        this.onInvitation?.(conversation)
      }
    })
    this.socket.on('friendMessage', (message: FriendMessage) => {
      if (!this.snapshot.messages.some(existing => existing.id === message.id)) {
        const incoming = message.senderWebId !== this.webId
        const id = message.conversationId
        const unread = id && incoming && this.activeConversation !== id
          ? { ...this.snapshot.unread, [id]: (this.snapshot.unread[id] ?? 0) + 1 }
          : this.snapshot.unread
        const conversations = this.snapshot.conversations.map(conversation => conversation.id === id
          ? { ...conversation, messages: [...conversation.messages, message].slice(-100), updatedAt: message.timestamp }
          : conversation)
        this.update({ messages: [...this.snapshot.messages, message].slice(-100), unread, conversations })
        if (incoming && this.activeConversation !== id) this.onIncoming?.(message)
      }
    })
  }

  setFriends (friends: FriendChatPerson[]): void {
    this.friends = friends
    if (this.socket.connected) this.register()
  }

  connect (): void {
    this.socket.connect()
  }

  retry (): void {
    this.update({ connection: 'connecting', error: '' })
    if (this.socket.connected) this.register()
    else this.socket.connect()
  }

  private register (): void {
    this.socket.timeout(5000).emit('registerFriendChat', {
      webId: this.webId, name: this.name, friends: this.friends.map(friend => friend.uri)
    }, (error: Error | null, result?: { error?: string }) => {
      if (error || result?.error) {
        this.update({ connection: 'disconnected', online: [], error: result?.error || 'Chat registration timed out. Please retry.' })
      } else {
        this.update({ connection: 'connected', error: '' })
      }
    })
  }

  async send (recipientWebId: string, content: string): Promise<void> {
    if (this.snapshot.connection !== 'connected') throw new Error('Chat is not connected.')
    await new Promise<void>((resolve, reject) => {
      this.socket.timeout(5000).emit('sendFriendMessage', { recipientWebId, content }, (error: Error | null, result?: { error?: string }) => {
        if (error || result?.error) reject(new Error(result?.error || 'Message delivery timed out.'))
        else resolve()
      })
    })
  }

  private rememberConversation (conversation: FriendConversation): void {
    if (!conversation.participantWebIds.includes(this.webId)) {
      this.update({
        conversations: this.snapshot.conversations.filter(item => item.id !== conversation.id),
        messages: this.snapshot.messages.filter(message => message.conversationId !== conversation.id),
        unread: Object.fromEntries(Object.entries(this.snapshot.unread).filter(([id]) => id !== conversation.id))
      })
      if (this.activeConversation === conversation.id) this.activeConversation = ''
      return
    }
    const ids = new Set(this.snapshot.messages.map(message => message.id))
    const retained = this.snapshot.conversations.find(item => item.id === conversation.id)?.messages ?? []
    const historyIds = new Set(conversation.messages.map(message => message.id))
    const messages = [...conversation.messages, ...retained.filter(message => !historyIds.has(message.id))]
      .sort((a, b) => a.timestamp - b.timestamp).slice(-100)
    this.update({
      conversations: [...this.snapshot.conversations.filter(item => item.id !== conversation.id), { ...conversation, messages }],
      messages: [...this.snapshot.messages, ...conversation.messages.filter(message => !ids.has(message.id))].slice(-100)
    })
  }

  private async requestConversation (event: string, input: object): Promise<FriendConversation> {
    if (this.snapshot.connection !== 'connected') throw new Error('Chat is not connected.')
    const conversation = await new Promise<FriendConversation>((resolve, reject) => {
      this.socket.timeout(5000).emit(event, input, (error: Error | null, result?: { error?: string, conversation?: FriendConversation }) => {
        if (error || result?.error || !result?.conversation) reject(new Error(result?.error || 'Chat request timed out.'))
        else resolve(result.conversation)
      })
    })
    this.rememberConversation(conversation)
    return conversation
  }

  createConversation (recipients: string[]): Promise<FriendConversation> {
    return this.requestConversation('createFriendConversation', { recipients })
  }

  addParticipants (conversationId: string, recipients: string[]): Promise<FriendConversation> {
    return this.requestConversation('addFriendConversationParticipants', { conversationId, recipients })
  }

  removeParticipant (conversationId: string, participantWebId: string): Promise<FriendConversation> {
    return this.requestConversation('removeFriendConversationParticipant', { conversationId, participantWebId })
  }

  openConversation (id: string): Promise<FriendConversation> {
    return this.requestConversation('openFriendConversation', { id })
  }

  async sendGroupMessage (conversationId: string, content: string): Promise<void> {
    if (this.snapshot.connection !== 'connected') throw new Error('Chat is not connected.')
    await new Promise<void>((resolve, reject) => {
      this.socket.timeout(5000).emit('sendGroupMessage', { conversationId, content }, (error: Error | null, result?: { error?: string }) => {
        if (error || result?.error) reject(new Error(result?.error || 'Message delivery timed out.'))
        else resolve()
      })
    })
  }

  setActiveConversation (id: string): void {
    this.activeConversation = id
    if (id) this.update({ unread: { ...this.snapshot.unread, [id]: 0 } })
  }

  subscribe (listener: (snapshot: FriendChatSnapshot) => void): () => void {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => { this.listeners.delete(listener) }
  }

  private update (change: Partial<FriendChatSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...change }
    for (const listener of this.listeners) listener(this.snapshot)
  }

  disconnect (): void {
    this.socket.removeAllListeners()
    this.socket.disconnect()
    this.listeners.clear()
  }
}
