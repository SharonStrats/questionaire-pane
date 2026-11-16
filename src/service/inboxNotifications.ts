import { literal, Namespace, st, sym, type LiveStore, type NamedNode } from 'rdflib'

const quiz = Namespace('https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#')
const ldp = Namespace('http://www.w3.org/ns/ldp#')
const rdf = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#')
const xsd = Namespace('http://www.w3.org/2001/XMLSchema#')

const supportedNotificationTypes = [
  quiz('QuestionnaireShare'),
  quiz('StudyDeckShare'),
  quiz('ChatNotification')
]

export function createNotificationId (): string {
  return globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export function isInboxNotificationRead (store: LiveStore, notification: NamedNode): boolean {
  const value = store.anyValue(notification, quiz('read'), undefined, notification.doc())?.toLowerCase()
  return value === 'true' || value === '1'
}

export async function markInboxNotificationRead (
  store: LiveStore,
  recipient: NamedNode,
  notification: NamedNode
): Promise<void> {
  const fetcher = store.fetcher
  const updater = store.updater
  if (!fetcher || !updater) throw new Error('Unable to mark the inbox item read: no Solid fetcher or updater is available.')

  await fetcher.load(recipient.doc())
  const inbox = store.any(recipient, ldp('inbox'))
  if (inbox?.termType !== 'NamedNode') throw new Error('Your profile does not advertise an inbox.')
  const inboxNode = sym(inbox.value)
  await fetcher.load(inboxNode.doc())

  const document = notification.doc()
  if (!store.holds(inboxNode, ldp('contains'), document, inboxNode.doc())) {
    throw new Error('This notification is not in your inbox.')
  }
  await fetcher.load(document)
  if (!supportedNotificationTypes.some(type => store.holds(notification, rdf('type'), type, document))) {
    throw new Error('This inbox item is not a supported notification.')
  }
  if (isInboxNotificationRead(store, notification)) return

  const id = store.anyValue(notification, quiz('notificationId'), undefined, document) ?? createNotificationId()
  const currentVersion = Number(store.anyValue(notification, quiz('notificationVersion'), undefined, document))
  const version = Number.isInteger(currentVersion) && currentVersion > 0 ? currentVersion : 1
  const deleted = [
    ...store.statementsMatching(notification, quiz('read'), undefined, document),
    ...store.statementsMatching(notification, quiz('notificationId'), undefined, document),
    ...store.statementsMatching(notification, quiz('notificationVersion'), undefined, document)
  ]
  const inserted = [
    st(notification, quiz('notificationId'), literal(id), document),
    st(notification, quiz('notificationVersion'), literal(String(version)), document),
    st(notification, quiz('read'), literal('true', xsd('boolean')), document)
  ]
  await updater.update(deleted, inserted)
}
