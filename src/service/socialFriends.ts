import { ns, utils } from 'solid-ui'
import { st, type LiveStore, type NamedNode } from 'rdflib'
import type { solidLogicSingleton } from 'solid-logic'

export interface FriendSummary {
  uri: string
  name: string
  nickname?: string
  jobTitle?: string
  organization?: string
  location?: string
  pronouns?: string
}

export interface WebIdSearchResult {
  uri: string
  name: string
  photo?: string
}

type FriendsDirectory = Pick<typeof solidLogicSingleton.directory, 'search'>

function labelFor (store: LiveStore, person: NamedNode): string {
  return utils.label(person) ||
    store.anyValue(person, ns.vcard('fn')) ||
    store.anyValue(person, ns.foaf('name')) ||
    store.anyValue(person, ns.foaf('nick')) ||
    (() => {
      try { return new URL(person.uri).hostname } catch { return person.uri }
    })()
}

export async function loadFriendSummaries (store: LiveStore, me: NamedNode): Promise<FriendSummary[]> {
  // Do not fetch every friend's profile before rendering. A profile can be
  // private or slow; the relationship list is already authoritative locally.
  return [...new Map(
    (store.each(me, ns.foaf('knows')) as NamedNode[])
      .filter(friend => friend.termType === 'NamedNode' && friend.uri && friend.uri !== me.uri)
      .map(friend => [friend.uri, {
        uri: friend.uri,
        name: labelFor(store, friend),
        nickname: store.anyValue(friend, ns.vcard('nickname')) || store.anyValue(friend, ns.foaf('nick')) || undefined,
        jobTitle: store.anyValue(friend, ns.vcard('role')) || undefined,
        organization: store.anyValue(friend, ns.vcard('organization-name')) || undefined
      } satisfies FriendSummary])
  ).values()]
}

function validWebId (value: string): string {
  let url: URL
  try { url = new URL(value.trim()) } catch { throw new Error('Enter a complete WebID URL, including https://.') }
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname) {
    throw new Error('WebIDs must use an http or https URL.')
  }
  return url.href
}

async function inspectWebId (store: LiveStore, uri: string): Promise<WebIdSearchResult | undefined> {
  const person = store.sym(uri) as NamedNode
  try {
    await store.fetcher?.load(person.doc())
  } catch {
    return undefined
  }
  const photo = [
    store.anyValue(person, ns.foaf('depiction')),
    store.anyValue(person, ns.foaf('img')),
    store.anyValue(person, ns.vcard('hasPhoto')),
    store.anyValue(person, ns.schema('image'))
  ].find((value): value is string => typeof value === 'string' && /^https?:\/\//i.test(value))
  const profileLabel = labelFor(store, person)
  const pathParts = uri.split('/').filter(Boolean)
  return { uri, name: profileLabel === 'me' ? pathParts[pathParts.length - 3] || profileLabel : profileLabel, photo }
}

export async function searchWebIds (store: LiveStore, query: string): Promise<WebIdSearchResult[]> {
  const value = query.trim()
  if (!/^https?:\/\//i.test(value)) return []
  const uri = validWebId(value)
  const result = await inspectWebId(store, uri)
  return result ? [result] : []
}

export async function searchContactsAndFriends (
  directory: FriendsDirectory,
  user: NamedNode,
  query: string
): Promise<WebIdSearchResult[]> {
  const entries = await directory.search({
    user,
    sources: ['contacts', 'friends'],
    maxFoafDistance: 3,
    query
  })
  return entries
    .filter(entry => entry.kind === 'person')
    .map(entry => ({ uri: entry.uri, name: entry.label }))
}

export async function addFriend (store: LiveStore, me: NamedNode, friendUri: string): Promise<void> {
  const uri = validWebId(friendUri)
  if (uri === me.uri) throw new Error('You cannot add your own WebID.')
  await store.fetcher?.load(me.doc())
  if (!store.updater.editable(me.doc().uri, store)) throw new Error('Your profile is not writable. Sign in to add friends.')
  const friend = store.sym(uri) as NamedNode
  if (store.holds(me, ns.foaf('knows'), friend, me.doc())) return
  await store.updater.update([], [st(me, ns.foaf('knows'), friend, me.doc())])
  store.fetcher?.unload(me.doc())
  await store.fetcher?.load(me.doc())
}
