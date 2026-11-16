import { graph, literal, Namespace, serialize, sym, type LiveStore, type NamedNode } from 'rdflib'
import type { FriendConversation } from './friendChatClient'
import { createNotificationId, isInboxNotificationRead } from './inboxNotifications'

const quiz = Namespace('https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#')
const dct = Namespace('http://purl.org/dc/terms/')
const ldp = Namespace('http://www.w3.org/ns/ldp#')
const rdf = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#')
const xsd = Namespace('http://www.w3.org/2001/XMLSchema#')

export interface ChatInboxNotification {
  uri: string
  conversationId: string
  sender: string
  created: string
  message: string
  notificationId: string
  read: boolean
}

export async function sendChatInboxNotifications (
  store: LiveStore, sender: NamedNode, conversation: FriendConversation, kind: 'invitation' | 'message'
): Promise<void> {
  if (!store.fetcher) throw new Error('No Solid fetcher is available to send inbox notifications.')
  const fetcher = store.fetcher
  const recipients = conversation.participantWebIds.filter(uri => uri !== sender.uri)
  const outcomes = await Promise.allSettled(recipients.map(async uri => {
    const person = sym(uri)
    await fetcher.load(person.doc())
    const inbox = store.any(person, ldp('inbox'))
    if (inbox?.termType !== 'NamedNode') throw new Error(`${uri} does not advertise an inbox.`)
    const document = sym(inbox.value)
    const data = graph()
    data.add(document, rdf('type'), quiz('ChatNotification'), document)
    data.add(document, dct('identifier'), literal(conversation.id), document)
    data.add(document, dct('creator'), sender, document)
    data.add(document, dct('created'), literal(new Date().toISOString()), document)
    data.add(document, dct('description'), literal(kind === 'invitation' ? 'You have been invited to a chat.' : 'There is a new message in your chat.'), document)
    data.add(document, quiz('notificationId'), literal(createNotificationId()), document)
    data.add(document, quiz('notificationVersion'), literal('1', xsd('integer')), document)
    data.add(document, quiz('read'), literal('false', xsd('boolean')), document)
    for (const participant of conversation.participantWebIds) data.add(document, quiz('participant'), sym(participant), document)
    const turtle = serialize(document, data, document.uri, 'text/turtle')
    if (typeof turtle !== 'string') throw new Error('Unable to serialize the chat inbox notification.')
    await fetcher.webOperation('POST', document.uri, { data: turtle, contentType: 'text/turtle' })
  }))
  const errors = outcomes.flatMap((result, index) => result.status === 'rejected'
    ? [`${recipients[index]}: ${result.reason instanceof Error ? result.reason.message : 'Inbox notification failed.'}`] : [])
  if (errors.length) throw new Error(`Chat is available, but some inbox notifications failed. ${errors.join(' ')}`)
}

export async function loadChatInboxNotifications (store: LiveStore, me: NamedNode): Promise<{ notifications: ChatInboxNotification[], warnings: string[] }> {
  if (!store.fetcher) throw new Error('No Solid fetcher is available to read chat notifications.')
  await store.fetcher.load(me.doc())
  const inbox = store.any(me, ldp('inbox'))
  if (inbox?.termType !== 'NamedNode') return { notifications: [], warnings: ['Your profile does not advertise a Solid inbox.'] }
  await store.fetcher.load(sym(inbox.value))
  const members = store.each(sym(inbox.value), ldp('contains')).filter((term): term is NamedNode => term.termType === 'NamedNode')
  const documents = members.slice(-100)
  const notifications: ChatInboxNotification[] = []
  const warnings: string[] = members.length > 100 ? ['Showing chat notifications from up to 100 listed inbox items.'] : []
  const inspect = async (document: NamedNode): Promise<void> => {
    await store.fetcher.load(document.doc())
    const subjects = store.each(undefined, rdf('type'), quiz('ChatNotification'), document.doc())
    for (const subject of subjects) {
      if (subject.termType !== 'NamedNode') continue
      const notification = sym(subject.value)
      const conversationId = store.anyValue(notification, dct('identifier'), undefined, document.doc())
      if (!conversationId || !/^[a-f0-9]{32}$/.test(conversationId)) continue
      notifications.push({
        uri: notification.uri,
        conversationId,
        sender: store.anyValue(notification, dct('creator'), undefined, document.doc()) || '',
        created: store.anyValue(notification, dct('created'), undefined, document.doc()) || '',
        message: store.anyValue(notification, dct('description'), undefined, document.doc()) || 'Chat notification',
        notificationId: store.anyValue(notification, quiz('notificationId'), undefined, document.doc()) || notification.uri,
        read: isInboxNotificationRead(store, notification)
      })
    }
  }
  for (let offset = 0; offset < documents.length; offset += 6) {
    const batch = documents.slice(offset, offset + 6)
    const results = await Promise.allSettled(batch.map(inspect))
    results.forEach((result, index) => {
      if (result.status === 'rejected') warnings.push(`Unable to read ${batch[index].uri}: ${result.reason instanceof Error ? result.reason.message : 'Inbox item failed to load.'}`)
    })
  }
  return { notifications: notifications.sort((a, b) => b.created.localeCompare(a.created)), warnings }
}
