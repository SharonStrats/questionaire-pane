// @vitest-environment happy-dom
import { graph, st, sym } from 'rdflib'
import { createDirectoryLogic, solidLogicSingleton } from 'solid-logic'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { searchContactsAndFriends, searchWebIds } from './socialFriends'

describe('searchWebIds', () => {
  it('checks an exact WebID URL', async () => {
    const store = graph() as any
    store.fetcher = { load: vi.fn().mockResolvedValue(undefined) }

    const results = await searchWebIds(store, 'https://sharonsolidosplayground.com/timmy/profile/card#me')
    expect(results).toHaveLength(1)
    expect(results[0].uri).toBe('https://sharonsolidosplayground.com/timmy/profile/card#me')
  })

  it('leaves name searches to the Solid Logic directory', async () => {
    const store = graph() as any
    await expect(searchWebIds(store, 'ti')).resolves.toEqual([])
  })
})

describe('searchContactsAndFriends', () => {
  afterEach(() => vi.restoreAllMocks())

  it('searches contacts and up to three FOAF friend levels by name', async () => {
    const search = vi.spyOn(solidLogicSingleton.directory, 'search').mockResolvedValue([])
    const user = sym('https://pod.example/profile/card#me')

    await searchContactsAndFriends(solidLogicSingleton.directory, user, 'Marcus')

    expect(search).toHaveBeenCalledWith({
      user,
      sources: ['contacts', 'friends'],
      maxFoafDistance: 3,
      query: 'Marcus'
    })
  })

  it('finds a second-degree friend by the WebID account name', async () => {
    const store = graph() as any
    const user = sym('https://pod.example/profile/card#me')
    const friend = sym('https://pod.example/dimitri/profile/card#me')
    const marcus = sym('https://sharonsolidosplayground.com/marcus/profile/card#me')
    const knows = store.sym('http://xmlns.com/foaf/0.1/knows')
    store.add(st(user, knows, friend, user.doc()))
    store.add(st(friend, knows, marcus, friend.doc()))
    store.fetcher = { load: vi.fn().mockResolvedValue(undefined) }
    const directory = createDirectoryLogic(store, {} as any, {} as any)

    await expect(searchContactsAndFriends(directory, user, 'Marcus')).resolves.toContainEqual({
      uri: marcus.value,
      name: 'marcus'
    })
  })
})
