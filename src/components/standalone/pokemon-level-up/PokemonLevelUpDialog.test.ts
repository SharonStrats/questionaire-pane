// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { graph, sym, type LiveStore } from 'rdflib'
import {
  choosePokemonCompanion,
  deferPokemonChoice,
  pokemonForPoints,
  type PokemonProgress
} from '../../../service/pokemonProgress'
import { pokemonChoicesForLevel } from '../../../data/pokemonLevels'
import PokemonLevelUpDialog, { showPokemonLevelUp } from './PokemonLevelUpDialog'

vi.mock('../../../service/pokemonProgress', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../service/pokemonProgress')>()),
  choosePokemonCompanion: vi.fn(),
  deferPokemonChoice: vi.fn()
}))

const user = sym('https://pod.example/profile/card#me')
const store = graph() as unknown as LiveStore

function progress (): PokemonProgress {
  return {
    totalPoints: 5,
    pokemon: { ...pokemonForPoints(0), level: 2 },
    progressDocument: sym('https://pod.example/quiz-progress/index.ttl'),
    pendingChoices: [{ level: 2, options: pokemonChoicesForLevel(2) }],
    deferredChoiceLevels: [],
    currentStreak: 1,
    longestStreak: 1,
    lastStudyDate: '2026-11-15'
  }
}

async function fixture () {
  const dialog = new PokemonLevelUpDialog()
  dialog.store = store
  dialog.user = user
  dialog.progress = progress()
  document.body.append(dialog)
  await dialog.updateComplete
  return dialog
}

afterEach(() => {
  document.body.replaceChildren()
  vi.clearAllMocks()
})

describe('Pokemon level-up dialog', () => {
  it('shows exactly three eligible choices and saves the clicked companion before closing', async () => {
    const dialog = await fixture()
    const updated = { ...progress(), pokemon: { ...pokemonForPoints(0), id: 152, name: 'Chikorita', level: 2 }, pendingChoices: [] }
    vi.mocked(choosePokemonCompanion).mockResolvedValue(updated)
    const done = vi.fn()
    const changed = vi.fn()
    dialog.onDone = done
    dialog.addEventListener('pokemon-progress-changed', changed)
    const choices = dialog.shadowRoot!.querySelectorAll('.choices solid-ui-button')
    expect(choices).toHaveLength(3)
    expect(dialog.shadowRoot!.textContent).toContain('Level 2 unlocked!')
    choices[1].dispatchEvent(new MouseEvent('click'))
    await vi.waitFor(() => expect(done).toHaveBeenCalledWith(updated))
    expect(choosePokemonCompanion).toHaveBeenCalledWith(store, user, 2, 152)
    expect(changed).toHaveBeenCalledTimes(1)
    expect(dialog.isConnected).toBe(false)
  })

  it('keeps an unsuccessful selection pending and allows retry', async () => {
    const dialog = await fixture()
    vi.mocked(choosePokemonCompanion).mockRejectedValueOnce(new Error('Pod is offline'))
    const done = vi.fn()
    dialog.onDone = done
    dialog.shadowRoot!.querySelector('.choices solid-ui-button')!.dispatchEvent(new MouseEvent('click'))
    await vi.waitFor(() => expect(dialog.shadowRoot!.querySelector('[role="alert"]')?.textContent).toContain('Pod is offline'))
    expect(done).not.toHaveBeenCalled()
    expect(dialog.progress.pendingChoices).toHaveLength(1)
    expect(dialog.isConnected).toBe(true)
  })

  it('persists a deferred choice and the helper prevents overlapping dialogs', async () => {
    const before = progress()
    const first = showPokemonLevelUp(store, user, before)
    const second = showPokemonLevelUp(store, user, before)
    expect(first).toBe(second)
    const dialog = document.querySelector('questionaire-pokemon-level-up-dialog') as PokemonLevelUpDialog
    await dialog.updateComplete
    const deferred = { ...before, deferredChoiceLevels: [2] }
    vi.mocked(deferPokemonChoice).mockResolvedValue(deferred)
    dialog.shadowRoot!.querySelector('.actions solid-ui-button')!.dispatchEvent(new MouseEvent('click'))
    expect(await first).toEqual(deferred)
    expect(deferPokemonChoice).toHaveBeenCalledWith(store, user, 2)
    expect(choosePokemonCompanion).not.toHaveBeenCalled()
    expect(document.querySelector('questionaire-pokemon-level-up-dialog')).toBeNull()
  })

  it('does not reopen choices that were already deferred', async () => {
    const deferred = { ...progress(), deferredChoiceLevels: [2] }
    await expect(showPokemonLevelUp(store, user, deferred)).resolves.toEqual(deferred)
    expect(document.querySelector('questionaire-pokemon-level-up-dialog')).toBeNull()
  })

  it('prevents duplicate saves and dismissal while a companion write is in flight', async () => {
    const dialog = await fixture()
    let resolve!: (progress: PokemonProgress) => void
    vi.mocked(choosePokemonCompanion).mockImplementation(() => new Promise(done => { resolve = done }))
    const done = vi.fn()
    dialog.onDone = done
    const choice = dialog.shadowRoot!.querySelector('.choices solid-ui-button')!
    choice.dispatchEvent(new MouseEvent('click'))
    choice.dispatchEvent(new MouseEvent('click'))
    dialog.shadowRoot!.querySelector('.actions solid-ui-button')!.dispatchEvent(new MouseEvent('click'))
    expect(choosePokemonCompanion).toHaveBeenCalledTimes(1)
    expect(done).not.toHaveBeenCalled()
    resolve({ ...progress(), pendingChoices: [] })
    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(1))
  })

  it('continues to the next pending level after saving an earlier choice', async () => {
    const dialog = await fixture()
    const next = { ...progress(), totalPoints: 10, pendingChoices: [{ level: 3, options: pokemonChoicesForLevel(3) }] }
    vi.mocked(choosePokemonCompanion).mockResolvedValue(next)
    dialog.shadowRoot!.querySelector('.choices solid-ui-button')!.dispatchEvent(new MouseEvent('click'))
    await vi.waitFor(() => expect(dialog.shadowRoot!.textContent).toContain('Level 3 unlocked!'))
    expect(dialog.shadowRoot!.querySelectorAll('.choices solid-ui-button')).toHaveLength(3)
    expect(dialog.isConnected).toBe(true)
  })

  it('keeps prompting for other newly unlocked choices after deferring the current one', async () => {
    const first = showPokemonLevelUp(store, user, progress())
    const newer = { ...progress(), totalPoints: 10, pokemon: { ...progress().pokemon, level: 3 },
      pendingChoices: [...progress().pendingChoices, { level: 3, options: pokemonChoicesForLevel(3) }] }
    expect(showPokemonLevelUp(store, user, newer)).toBe(first)
    const dialog = document.querySelector('questionaire-pokemon-level-up-dialog') as PokemonLevelUpDialog
    await dialog.updateComplete
    const deferredLevelTwo = { ...newer, deferredChoiceLevels: [2] }
    const deferredAll = { ...newer, deferredChoiceLevels: [2, 3] }
    vi.mocked(deferPokemonChoice)
      .mockResolvedValueOnce(deferredLevelTwo)
      .mockResolvedValueOnce(deferredAll)
    dialog.shadowRoot!.querySelector('.actions solid-ui-button')!.dispatchEvent(new MouseEvent('click'))
    await vi.waitFor(() => expect(dialog.shadowRoot!.textContent).toContain('Level 3 unlocked!'))
    dialog.shadowRoot!.querySelector('.actions solid-ui-button')!.dispatchEvent(new MouseEvent('click'))
    expect(await first).toEqual(deferredAll)
  })

  it('keeps pending choices when Escape closes the native Solid UI dialog', async () => {
    const result = showPokemonLevelUp(store, user, progress())
    const dialog = document.querySelector('questionaire-pokemon-level-up-dialog') as PokemonLevelUpDialog
    await dialog.updateComplete
    const shell = dialog.shadowRoot!.querySelector('solid-ui-dialog') as HTMLElement & { updateComplete: Promise<unknown> }
    await shell.updateComplete
    shell.shadowRoot!.querySelector('dialog')!.dispatchEvent(new Event('cancel', { cancelable: true }))
    expect((await result).pendingChoices).toHaveLength(1)
    expect(choosePokemonCompanion).not.toHaveBeenCalled()
    expect(deferPokemonChoice).not.toHaveBeenCalled()
  })
})
