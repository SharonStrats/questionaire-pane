import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FriendChatClient } from './friendChatClient'

const mock = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => void>(),
  socket: {
    connected: false,
    on: vi.fn(),
    emit: vi.fn(),
    timeout: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    removeAllListeners: vi.fn()
  }
}))

vi.mock('socket.io-client', () => ({ io: () => mock.socket }))
vi.mock('./realtimeTicket', () => ({ fetchRealtimeTicket: vi.fn(async () => 'test-ticket') }))

describe('friend chat client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mock.handlers.clear()
    mock.socket.connected = false
    mock.socket.on.mockImplementation((name, handler) => mock.handlers.set(name, handler))
    mock.socket.timeout.mockReturnValue(mock.socket)
  })

  it('registers identity and friends on every connection and shows connection failures', () => {
    const client = new FriendChatClient('https://example/alice#me', 'Alice', 'http://localhost:5100')
    client.setFriends([{ uri: 'https://example/bob#me', name: 'Bob' }])
    const listener = vi.fn()
    client.subscribe(listener)
    client.connect()
    mock.handlers.get('connect')?.()
    const [event, identity, reply] = mock.socket.emit.mock.calls[0]
    expect(event).toBe('registerFriendChat')
    expect(identity.friends).toEqual(['https://example/bob#me'])
    reply(null, {})
    expect(listener.mock.lastCall?.[0].connection).toBe('connected')
    mock.handlers.get('connect_error')?.()
    expect(listener.mock.lastCall?.[0].error).toContain('realtime service is running')
    expect(listener.mock.lastCall?.[0].online).toEqual([])
    client.disconnect()
    expect(mock.socket.disconnect).toHaveBeenCalled()
  })

  it('keeps the draft caller informed of rejected delivery instead of reporting success', async () => {
    const client = new FriendChatClient('https://example/alice#me', 'Alice', 'http://localhost:5100')
    mock.handlers.get('connect')?.()
    mock.socket.emit.mock.calls[0][2](null, {})
    const sending = client.send('https://example/bob#me', 'Hello')
    const [event, payload, reply] = mock.socket.emit.mock.lastCall!
    expect(event).toBe('sendFriendMessage')
    expect(payload.content).toBe('Hello')
    reply(null, { error: 'Your friend is offline.' })
    await expect(sending).rejects.toThrow('offline')
    client.disconnect()
  })

  it('counts unread group messages once, and clears them when opening that conversation', () => {
    const client = new FriendChatClient('https://example/alice#me', 'Alice', 'http://localhost:5100')
    const listener = vi.fn()
    client.subscribe(listener)
    const incoming = vi.fn()
    client.onIncoming = incoming
    const message = {
      id: 'one', conversationId: 'group', senderWebId: 'https://example/bob#me',
      recipientWebId: '', senderName: 'Bob', content: 'Hello', timestamp: 1
    }
    mock.handlers.get('friendMessage')?.(message)
    mock.handlers.get('friendMessage')?.(message)
    expect(listener.mock.lastCall?.[0].unread.group).toBe(1)
    expect(incoming).toHaveBeenCalledTimes(1)
    client.setActiveConversation('group')
    mock.handlers.get('friendMessage')?.({ ...message, id: 'two' })
    expect(listener.mock.lastCall?.[0].unread.group).toBe(0)
    expect(incoming).toHaveBeenCalledTimes(1)
    client.disconnect()
  })

  it('merges replayed history with newer group messages in chronological order', () => {
    const client = new FriendChatClient('https://example/alice#me', 'Alice', 'http://localhost:5100')
    const listener = vi.fn()
    client.subscribe(listener)
    const conversation = {
      id: 'group', creatorWebId: client.webId, participantWebIds: [client.webId],
      participantNames: ['Alice'], updatedAt: 1, messages: []
    }
    mock.handlers.get('friendConversation')?.(conversation)
    const newer = {
      id: 'newer', conversationId: 'group', senderWebId: 'https://example/bob#me',
      recipientWebId: '', senderName: 'Bob', content: 'New message', timestamp: 2
    }
    mock.handlers.get('friendMessage')?.(newer)
    mock.handlers.get('friendConversation')?.({
      ...conversation, messages: [{ ...newer, id: 'older', timestamp: 1, content: 'Earlier message' }]
    })
    expect(listener.mock.lastCall?.[0].conversations[0].messages.map((message: { id: string }) => message.id)).toEqual(['older', 'newer'])
    client.disconnect()
  })
})
