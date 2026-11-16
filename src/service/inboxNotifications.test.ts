import { describe, expect, it, vi } from 'vitest'
import { graph, Namespace, sym, type LiveStore, type Statement } from 'rdflib'
import { markInboxNotificationRead } from './inboxNotifications'

const quiz = Namespace('https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#')
const ldp = Namespace('http://www.w3.org/ns/ldp#')
const rdf = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#')
const recipient = sym('https://pod.example/profile/card#me')
const inbox = sym('https://pod.example/inbox/')
const notification = sym('https://pod.example/inbox/notification.ttl')

function fixture () {
  const store = graph() as LiveStore
  store.add(recipient, ldp('inbox'), inbox, recipient.doc())
  store.add(inbox, ldp('contains'), notification, inbox.doc())
  store.add(notification, rdf('type'), quiz('QuestionnaireShare'), notification.doc())
  const update = vi.fn(async (deleted: Statement[], inserted: Statement[]) => {
    store.removeStatements(deleted)
    inserted.forEach(statement => {
      store.add(statement.subject, statement.predicate, statement.object, statement.why)
    })
  })
  Object.defineProperty(store, 'fetcher', { value: { load: vi.fn().mockResolvedValue(undefined) } })
  Object.defineProperty(store, 'updater', { value: { update } })
  return { store, update }
}

describe('inbox notification read state', () => {
  it('marks a recipient-owned notification read and lazily adds stable metadata', async () => {
    const { store, update } = fixture()

    await markInboxNotificationRead(store, recipient, notification)

    expect(store.anyValue(notification, quiz('read'), undefined, notification.doc())).toBe('true')
    expect(store.anyValue(notification, quiz('notificationId'), undefined, notification.doc())).toBeTruthy()
    expect(store.anyValue(notification, quiz('notificationVersion'), undefined, notification.doc())).toBe('1')
    expect(update).toHaveBeenCalledOnce()
  })

  it('refuses to modify a notification outside the recipient inbox', async () => {
    const { store, update } = fixture()
    store.removeMatches(inbox, ldp('contains'), notification, inbox.doc())

    await expect(markInboxNotificationRead(store, recipient, notification)).rejects.toThrow('not in your inbox')
    expect(update).not.toHaveBeenCalled()
  })
})
