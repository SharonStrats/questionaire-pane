import { Fetcher, graph, Namespace, parse, sym, type LiveStore } from 'rdflib'
import { describe, expect, it, vi } from 'vitest'
import { loadChatInboxNotifications, sendChatInboxNotifications } from './chatNotifications'
import type { FriendConversation } from './friendChatClient'

const ldp = Namespace('http://www.w3.org/ns/ldp#')
const alice = sym('https://pod.example/alice/profile/card#me')
const bob = sym('https://pod.example/bob/profile/card#me')
const inbox = sym('https://pod.example/bob/inbox/')
const conversation: FriendConversation = {
  id: 'a'.repeat(32), creatorWebId: alice.uri,
  participantWebIds: [alice.uri, bob.uri], participantNames: ['Alice', 'Bob'], messages: [], updatedAt: 1
}

function fixture () {
  const store = graph() as LiveStore
  const fetcher = new Fetcher(store)
  fetcher.load = vi.fn().mockResolvedValue(new Response('', { status: 200 }))
  fetcher.webOperation = vi.fn().mockResolvedValue(new Response('', { status: 201 }))
  store.add(bob, ldp('inbox'), inbox, bob.doc())
  return { store, fetcher }
}

describe('chat inbox notifications', () => {
  it('posts a Turtle invitation and discovers its conversation in the recipient inbox', async () => {
    const { store, fetcher } = fixture()
    await sendChatInboxNotifications(store, alice, conversation, 'invitation')
    const [, url, options] = vi.mocked(fetcher.webOperation).mock.calls[0]
    expect(url).toBe(inbox.uri)
    expect(options!.contentType).toBe('text/turtle')
    expect(options!.data).toContain('quiz:notificationId')
    expect(options!.data).toContain('quiz:notificationVersion')
    expect(options!.data).toContain('quiz:read')
    const document = sym(`${inbox.uri}notification.ttl`)
    store.add(inbox, ldp('contains'), document, inbox)
    parse(options!.data!, store, document.uri, 'text/turtle')
    const result = await loadChatInboxNotifications(store, bob)
    expect(result.notifications[0]).toMatchObject({
      conversationId: conversation.id,
      sender: alice.uri,
      message: 'You have been invited to a chat.',
      read: false
    })
    expect(result.warnings).toEqual([])
  })

  it('reports inbox failures separately from successful chat delivery', async () => {
    const { store, fetcher } = fixture()
    vi.mocked(fetcher.webOperation).mockRejectedValue(new Error('403 Forbidden'))
    await expect(sendChatInboxNotifications(store, alice, conversation, 'message')).rejects.toThrow('403 Forbidden')
  })

  it('retains readable notifications when another inbox resource cannot be fetched', async () => {
    const { store, fetcher } = fixture()
    const valid = sym(`${inbox.uri}valid.ttl`)
    const failed = sym(`${inbox.uri}unreadable.ttl`)
    store.add(inbox, ldp('contains'), valid, inbox)
    store.add(inbox, ldp('contains'), failed, inbox)
    parse(`@prefix quiz: <https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#>.
      @prefix dct: <http://purl.org/dc/terms/>.
      <> a quiz:ChatNotification; dct:identifier "${conversation.id}".`, store, valid.uri, 'text/turtle')
    vi.mocked(fetcher.load).mockImplementation(async uri => {
      if (String(uri) === failed.toString()) throw new Error('403 Forbidden')
      return new Response('', { status: 200 })
    })
    const result = await loadChatInboxNotifications(store, bob)
    expect(result.notifications).toHaveLength(1)
    expect(result.warnings[0]).toContain('403 Forbidden')
  })
})
