import { graph, literal, parse, sym, type LiveStore } from 'rdflib'
import { describe, expect, it, vi } from 'vitest'
import {
  choosePokemonCompanion,
  deferPokemonChoice,
  hasUndeferredPokemonChoice,
  loadPokemonProgress,
  pokemonForPoints,
  quizAveragesFromProgress,
  resumeDeferredPokemonChoices,
  updatePokemonProgress
} from './pokemonProgress'
import { POKEMON_LEVELS, pokemonChoicesForLevel } from '../data/pokemonLevels'

vi.mock('../standalone/library', () => ({
  ensureQuestionnaireWorkspace: async () => 'https://pod.example/Questionnaires/'
}))
vi.mock('./types', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./types')>()),
  createContainerIfMissing: async () => undefined
}))

const progressUri = 'https://pod.example/Questionnaires/quiz-progress/index.ttl'
const user = sym('https://pod.example/profile/card#me')
const questionnaire = sym('https://pod.example/quiz.ttl#this')
const predicate = (name: string) => sym(`https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#${name}`)

function podStore () {
  const store = graph() as unknown as LiveStore
  const saved: string[] = []
  ;(store as any).fetcher = {
    load: async () => {
      const latest = saved[saved.length - 1]
      if (!latest) throw new Error('404')
      store.removeDocument(sym(progressUri))
      parse(latest, store, progressUri, 'text/turtle')
    },
    webOperation: async (_method: string, _uri: string, options: { data: string }) => {
      saved.push(options.data)
    }
  }
  return { store, saved }
}

describe('pokemon progression', () => {
  it('maps cumulative points to levels and caps at the last level', () => {
    expect(pokemonForPoints(0)).toMatchObject({ name: 'Bulbasaur', level: 1 })
    expect(pokemonForPoints(4)).toMatchObject({ name: 'Bulbasaur', level: 1 })
    expect(pokemonForPoints(5)).toMatchObject({ name: 'Ivysaur', level: 2 })
    expect(pokemonForPoints(10_000)).toMatchObject({ name: 'Mew', level: 20 })
  })

  it('accumulates points across quiz attempts and counts each attempt once', async () => {
    const { store, saved } = podStore()

    await updatePokemonProgress(store, 4, sym('https://pod.example/results/a/'), questionnaire, user)
    await updatePokemonProgress(store, 3, sym('https://pod.example/results/b/'), questionnaire, user)
    const repeated = await updatePokemonProgress(store, 3, sym('https://pod.example/results/b/'), questionnaire, user)

    expect(repeated.totalPoints).toBe(7)
    expect(repeated.pokemon).toMatchObject({ name: 'Bulbasaur', level: 2 })
    expect(repeated.pendingChoices.map(choice => choice.level)).toEqual([2])
    expect(saved).toHaveLength(2)
    const savedGraph = graph()
    parse(saved[saved.length - 1] ?? '', savedGraph, progressUri, 'text/turtle')
    const totals = savedGraph.each(sym(`${progressUri}#this`), sym('https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#totalPoints'))
    expect(totals.map(total => total.value)).toEqual(['7'])
  })

  it('averages normalized quiz attempt results and ignores surveys and study-card awards', async () => {
    const { store } = podStore()
    await updatePokemonProgress(store, 2, sym('https://pod.example/results/a/'), questionnaire, user, 4)
    const progress = await updatePokemonProgress(store, 3, sym('https://pod.example/results/b/'), questionnaire, user, 4)
    await updatePokemonProgress(store, 0, sym('https://pod.example/results/survey/'), questionnaire, user, 0)
    await updatePokemonProgress(store, 2, sym('https://pod.example/study/session-1#card-1'), questionnaire, user)

    await expect(quizAveragesFromProgress(store, progress.progressDocument)).resolves.toEqual({ [questionnaire.uri]: 63 })
  })

  it('uses saved result documents for attempts created before available points were indexed', async () => {
    const store = graph() as unknown as LiveStore
    const document = sym(progressUri)
    const subject = sym(`${progressUri}#this`)
    const attempt = sym('https://pod.example/questionnaire-results/old-attempt/')
    store.add(subject, predicate('attempt'), attempt, document)
    store.add(attempt, predicate('earnedPoints'), literal('3'), document)
    store.add(attempt, predicate('questionnaire'), questionnaire, document)
    const resultDocument = sym(`${attempt.uri}result.ttl`)
    const result = sym(`${resultDocument.uri}#this`)
    ;(store as any).fetcher = {
      load: vi.fn(async () => {
        store.add(result, predicate('score'), literal('3'), resultDocument)
        store.add(result, predicate('outOf'), literal('5'), resultDocument)
      })
    }

    await expect(quizAveragesFromProgress(store, document)).resolves.toEqual({ [questionnaire.uri]: 60 })
  })

  it('tracks consecutive study days once per attempt and persists the longest streak', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-11-13T10:00:00Z'))
      const { store, saved } = podStore()
      const first = await updatePokemonProgress(store, 1, sym('https://pod.example/results/a/'), questionnaire, user)
      expect(first).toMatchObject({ currentStreak: 1, longestStreak: 1, lastStudyDate: '2026-11-13' })

      vi.setSystemTime(new Date('2026-11-14T10:00:00Z'))
      const second = await updatePokemonProgress(store, 1, sym('https://pod.example/results/b/'), questionnaire, user)
      expect(second).toMatchObject({ currentStreak: 2, longestStreak: 2, lastStudyDate: '2026-11-14' })

      const repeated = await updatePokemonProgress(store, 1, sym('https://pod.example/results/b/'), questionnaire, user)
      expect(repeated).toEqual(second)

      vi.setSystemTime(new Date('2026-11-16T10:00:00Z'))
      const resumed = await updatePokemonProgress(store, 1, sym('https://pod.example/results/c/'), questionnaire, user)
      expect(resumed).toMatchObject({ currentStreak: 1, longestStreak: 2, lastStudyDate: '2026-11-16' })

      const fresh = podStore()
      fresh.saved.push(saved[saved.length - 1])
      expect(await loadPokemonProgress(fresh.store, user)).toEqual(resumed)
    } finally {
      vi.useRealTimers()
    }
  })

  it('counts completed surveys as study days without awarding quiz points', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-11-13T10:00:00Z'))
      const { store } = podStore()
      const first = await updatePokemonProgress(
        store, 4, sym('https://pod.example/results/quiz/'), questionnaire, user, 5
      )

      vi.setSystemTime(new Date('2026-11-14T10:00:00Z'))
      const survey = await updatePokemonProgress(
        store, 0, sym('https://pod.example/results/survey/'), sym('https://pod.example/survey.ttl#this'), user, 0
      )

      expect(survey.totalPoints).toBe(first.totalPoints)
      expect(survey).toMatchObject({ currentStreak: 2, longestStreak: 2, lastStudyDate: '2026-11-14' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('queues each crossed level with three eligible Pokemon and survives a fresh store load', async () => {
    const { store, saved } = podStore()
    const progress = await updatePokemonProgress(store, 20, sym('https://pod.example/results/a/'), questionnaire, user)
    expect(progress.pendingChoices.map(choice => choice.level)).toEqual([2, 3, 4])
    for (const choice of progress.pendingChoices) {
      expect(choice.options).toHaveLength(3)
      expect(new Set(choice.options.map(option => option.pokedexId)).size).toBe(3)
    }
    const fresh = podStore()
    fresh.saved.push(saved[0])
    expect(await loadPokemonProgress(fresh.store, user)).toEqual(progress)
  })

  it('saves a chosen companion, retains it across point updates, and resumes only remaining choices', async () => {
    const { store, saved } = podStore()
    await updatePokemonProgress(store, 5, sym('https://pod.example/results/a/'), questionnaire, user)
    const chosen = await choosePokemonCompanion(store, user, 2, 152)
    expect(chosen.pokemon).toMatchObject({ id: 152, name: 'Chikorita', level: 2 })
    expect(chosen.pendingChoices).toEqual([])
    await choosePokemonCompanion(store, user, 2, 152)
    expect(saved).toHaveLength(2)
    const increased = await updatePokemonProgress(store, 5, sym('https://pod.example/study/session-1#card-1'), questionnaire, user)
    expect(increased.pokemon).toMatchObject({ name: 'Chikorita', level: 3 })
    expect(increased.pendingChoices.map(choice => choice.level)).toEqual([3])
    const fresh = podStore()
    fresh.saved.push(saved[saved.length - 1])
    expect(await loadPokemonProgress(fresh.store, user)).toEqual(increased)
    const history = store.each(sym(`${progressUri}#this`), predicate('pokemonSelection'), undefined, sym(progressUri))
    expect(history.map(node => node.value)).toEqual([`${progressUri}#pokemon-level-2`])
  })

  it('persists a deferred level choice and clears it when selected later', async () => {
    const { store, saved } = podStore()
    const unlocked = await updatePokemonProgress(store, 5, sym('https://pod.example/results/a/'), questionnaire, user)
    expect(hasUndeferredPokemonChoice(unlocked)).toBe(true)

    const deferred = await deferPokemonChoice(store, user, 2)
    expect(deferred.deferredChoiceLevels).toEqual([2])
    expect(hasUndeferredPokemonChoice(deferred)).toBe(false)
    const fresh = podStore()
    fresh.saved.push(saved[saved.length - 1])
    expect(await loadPokemonProgress(fresh.store, user)).toEqual(deferred)

    const resumed = await resumeDeferredPokemonChoices(store, user)
    expect(resumed.deferredChoiceLevels).toEqual([])
    const chosen = await choosePokemonCompanion(store, user, 2, 152)
    expect(chosen.deferredChoiceLevels).toEqual([])
    expect(hasUndeferredPokemonChoice(chosen)).toBe(false)
  })

  it('rejects locked, out-of-order, or ineligible choices without changing progress', async () => {
    const { store, saved } = podStore()
    await updatePokemonProgress(store, 10, sym('https://pod.example/results/a/'), questionnaire, user)
    await expect(choosePokemonCompanion(store, user, 3, 3)).rejects.toThrow(/awaiting a choice/)
    await expect(choosePokemonCompanion(store, user, 20, 151)).rejects.toThrow(/awaiting a choice/)
    await expect(choosePokemonCompanion(store, user, 2, 151)).rejects.toThrow(/not eligible/)
    expect(saved).toHaveLength(1)
    expect((await loadPokemonProgress(store, user))?.pendingChoices.map(choice => choice.level)).toEqual([2, 3])
  })

  it('preserves pending choices when an attempt is replayed or earns no points', async () => {
    const { store } = podStore()
    const attempt = sym('https://pod.example/results/a/')
    const unlocked = await updatePokemonProgress(store, 5, attempt, questionnaire, user)
    expect(await updatePokemonProgress(store, 100, attempt, questionnaire, user)).toEqual(unlocked)
    expect(await updatePokemonProgress(store, 0, sym('https://pod.example/results/b/'), questionnaire, user)).toEqual(unlocked)
  })

  it('serializes simultaneous quiz/study awards and prevents duplicate attempts', async () => {
    const { store } = podStore()
    const attempt = sym('https://pod.example/results/a/')
    await Promise.all([
      updatePokemonProgress(store, 4, attempt, questionnaire, user),
      updatePokemonProgress(store, 4, attempt, questionnaire, user),
      updatePokemonProgress(store, 3, sym('https://pod.example/study/session-1#card-1'), questionnaire, user)
    ])
    expect((await loadPokemonProgress(store, user))?.totalPoints).toBe(7)
  })

  it('migrates legacy totals and companion without retroactively reopening old levels', async () => {
    const { store } = podStore()
    const document = sym(progressUri)
    const subject = sym(`${progressUri}#this`)
    store.add(subject, predicate('totalPoints'), literal('5'), document)
    store.add(subject, predicate('totalPoints'), literal('10'), document)
    store.add(subject, predicate('pokemonId'), literal('3'), document)
    store.fetcher.load = vi.fn().mockResolvedValue(undefined)
    const progress = await updatePokemonProgress(store, 1, sym('https://pod.example/results/a/'), questionnaire, user)
    expect(progress.totalPoints).toBe(11)
    expect(progress.pokemon).toMatchObject({ name: 'Venusaur', level: 3 })
    expect(progress.pendingChoices).toEqual([])
    expect(store.each(subject, predicate('totalPoints'), undefined, document).map(value => value.value)).toEqual(['11'])
  })

  it('does not overwrite selections on a transient load failure or unsuccessful PUT', async () => {
    const { store, saved } = podStore()
    await updatePokemonProgress(store, 5, sym('https://pod.example/results/a/'), questionnaire, user)
    store.fetcher.load = vi.fn().mockRejectedValue(new Error('HTTP 503'))
    await expect(updatePokemonProgress(store, 5, sym('https://pod.example/results/b/'), questionnaire, user)).rejects.toThrow('503')
    expect(saved).toHaveLength(1)
    store.fetcher.load = vi.fn().mockResolvedValue(undefined)
    store.fetcher.webOperation = vi.fn().mockResolvedValue(new Response('', { status: 500 }))
    await expect(choosePokemonCompanion(store, user, 2, 152)).rejects.toThrow('HTTP 500')
    expect((await loadPokemonProgress(store, user))?.pendingChoices).toHaveLength(1)
  })

  it('caps progression without inventing a level or repeating the final pending choice', async () => {
    const { store } = podStore()
    await updatePokemonProgress(store, 650, sym('https://pod.example/results/a/'), questionnaire, user)
    const capped = await updatePokemonProgress(store, 10_000, sym('https://pod.example/results/b/'), questionnaire, user)
    expect(capped.pokemon.level).toBe(20)
    expect(capped.pendingChoices.map(choice => choice.level)).toEqual(POKEMON_LEVELS.slice(1).map(level => level.level))
    expect(pokemonChoicesForLevel(20).map(choice => choice.pokemon)).toEqual(['Mew', 'Celebi', 'Jirachi'])
  })
})
