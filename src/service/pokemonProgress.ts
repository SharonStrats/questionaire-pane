import { authn } from 'solid-logic'
import { graph, literal, Namespace, serialize, sym, type LiveStore, type NamedNode } from 'rdflib'
import { createContainerIfMissing, ensureTrailingSlash } from './types'
import { ensureQuestionnaireWorkspace } from '../standalone/library'
import { POKEMON_LEVELS, pokemonChoicesForLevel, pokemonLevelForPoints, pokemonSpriteUrl, type PokemonChoice } from '../data/pokemonLevels'

const POKE_API = 'https://pokeapi.co/api/v2'
const quiz = Namespace('https://sharonstrats.github.io/solidnext-vocab/vocab/quiz#')
const dct = Namespace('http://purl.org/dc/terms/')
const rdf = Namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#')
const progressContainerName = 'quiz-progress/'
const progressDocumentName = 'index.ttl'

export interface PokemonDetails {
  id: number
  name: string
  level: number
  sprite: string | null
  uri: string
}

export interface PendingPokemonChoice {
  level: number
  options: PokemonChoice[]
}

export interface PokemonProgress {
  totalPoints: number
  pokemon: PokemonDetails
  progressDocument: NamedNode
  pendingChoices: PendingPokemonChoice[]
  deferredChoiceLevels: number[]
  currentStreak: number
  longestStreak: number
  lastStudyDate: string | null
}

// Serialize quiz/study writes in this store so simultaneous completions cannot count an attempt twice.
const writes = new WeakMap<LiveStore, Map<string, Promise<unknown>>>()

function serializeWrite<T> (store: LiveStore, user: NamedNode, operation: () => Promise<T>): Promise<T> {
  let queue = writes.get(store)
  if (!queue) {
    queue = new Map()
    writes.set(store, queue)
  }
  const previous = queue.get(user.uri) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(operation)
  queue.set(user.uri, next)
  void next.finally(() => {
    if (queue.get(user.uri) === next) queue.delete(user.uri)
  }).catch(() => undefined)
  return next
}

async function progressDocumentForUser (store: LiveStore, user: NamedNode): Promise<NamedNode> {
  const workspaceUri = await ensureQuestionnaireWorkspace(store, user)
  return sym(`${ensureTrailingSlash(workspaceUri)}${progressContainerName}${progressDocumentName}`)
}

async function loadDocument (store: LiveStore, document: NamedNode): Promise<boolean> {
  if (!store.fetcher) throw new Error('The Solid fetcher is unavailable.')
  try {
    await store.fetcher.load(document)
    return true
  } catch (error) {
    const failure = error as { status?: number, response?: { status?: number }, message?: string }
    if (failure?.status === 404 || failure?.response?.status === 404 || /\b404\b/.test(failure?.message ?? '')) return false
    throw error
  }
}

export async function loadPokemonProgress (
  store: LiveStore,
  user: NamedNode
): Promise<PokemonProgress | undefined> {
  const document = await progressDocumentForUser(store, user)
  if (!await loadDocument(store, document)) return undefined
  return readProgress(store, document)
}

function pokemonDetails (choice: PokemonChoice, level: number): PokemonDetails {
  return {
    id: choice.pokedexId,
    name: choice.pokemon,
    level,
    sprite: pokemonSpriteUrl(choice.pokedexId),
    uri: `${POKE_API}/pokemon/${choice.pokedexId}`
  }
}

export function pokemonForPoints (totalPoints: number): PokemonDetails {
  const definition = pokemonLevelForPoints(totalPoints)
  return pokemonDetails(definition, definition.level)
}

export function hasUndeferredPokemonChoice (progress: PokemonProgress | undefined): boolean {
  return Boolean(progress?.pendingChoices.some(choice => !progress.deferredChoiceLevels.includes(choice.level)))
}

export async function quizAveragesFromProgress (store: LiveStore, document: NamedNode): Promise<Record<string, number>> {
  const subject = sym(`${document.uri}#this`)
  const totals = new Map<string, { percentage: number, attempts: number }>()
  for (const attempt of store.each(subject, quiz('attempt'), undefined, document)) {
    if (attempt.termType !== 'NamedNode') continue
    const attemptNode = attempt as NamedNode
    let earned = store.any(attemptNode, quiz('earnedPoints'), undefined, document)?.value
    let available = store.any(attemptNode, quiz('availablePoints'), undefined, document)?.value
    const questionnaire = store.any(attemptNode, quiz('questionnaire'), undefined, document)
    if (available === undefined && attemptNode.uri.endsWith('/') && store.fetcher) {
      const resultDocument = sym(`${attemptNode.uri}result.ttl`)
      await store.fetcher.load(resultDocument)
      const result = sym(`${resultDocument.uri}#this`)
      earned ??= store.any(result, quiz('score'), undefined, resultDocument)?.value
      available = store.any(result, quiz('outOf'), undefined, resultDocument)?.value
    }
    if (earned === undefined || available === undefined || questionnaire?.termType !== 'NamedNode') continue
    const questionnaireNode = questionnaire as NamedNode
    const earnedPoints = Number(earned)
    const availablePoints = Number(available)
    if (!Number.isFinite(earnedPoints) || earnedPoints < 0 ||
      !Number.isFinite(availablePoints) || availablePoints < 0) {
      throw new Error(`Invalid saved quiz score for ${attemptNode.uri}.`)
    }
    if (availablePoints === 0) continue
    const current = totals.get(questionnaireNode.uri) ?? { percentage: 0, attempts: 0 }
    current.percentage += earnedPoints / availablePoints * 100
    current.attempts += 1
    totals.set(questionnaireNode.uri, current)
  }
  return Object.fromEntries([...totals].map(([uri, value]) => [
    uri,
    Math.round(value.percentage / value.attempts)
  ]))
}

function readProgress (store: LiveStore, document: NamedNode): PokemonProgress {
  const subject = sym(`${document.uri}#this`)
  const totalPoints = storedTotalPoints(store, subject, document)
  const level = pokemonLevelForPoints(totalPoints).level
  const lastStudyDate = store.any(subject, quiz('lastStudyDate'), undefined, document)?.value ?? null
  const storedStreak = numberValue(store.any(subject, quiz('currentStreak'), undefined, document)?.value)
  const currentStreak = isRecentStudyDate(lastStudyDate) ? storedStreak : 0
  const longestStreak = numberValue(store.any(subject, quiz('longestStreak'), undefined, document)?.value) || storedStreak
  const storedId = numberValue(store.any(subject, quiz('pokemonId'), undefined, document)?.value)
  const companion = POKEMON_LEVELS.flatMap(definition => pokemonChoicesForLevel(definition.level))
    .find(choice => choice.pokedexId === storedId)
  const selectedLevels = new Set(store.each(subject, quiz('pokemonSelection'), undefined, document)
    .filter(selection => selection.termType === 'NamedNode')
    .map(selection => numberValue(store.any(selection as NamedNode, quiz('level'), undefined, document)?.value)))
  const pendingLevels = [...new Set(store.each(subject, quiz('pendingPokemonLevel'), undefined, document)
    .map(value => numberValue(value.value)))]
    .filter(pending => pending > 1 && pending <= level && !selectedLevels.has(pending) &&
      POKEMON_LEVELS.some(definition => definition.level === pending))
    .sort((a, b) => a - b)
  const deferredChoiceLevels = [...new Set(store.each(subject, quiz('deferredPokemonLevel'), undefined, document)
    .map(value => numberValue(value.value)))]
    .filter(deferred => pendingLevels.includes(deferred))
  return {
    totalPoints,
    pokemon: companion ? pokemonDetails(companion, level) : pokemonForPoints(totalPoints),
    progressDocument: document,
    pendingChoices: pendingLevels.map(level => ({ level, options: pokemonChoicesForLevel(level) })),
    deferredChoiceLevels,
    currentStreak,
    longestStreak,
    lastStudyDate
  }
}

function studyDate (date: Date): string {
  return date.toISOString().slice(0, 10)
}

function isRecentStudyDate (lastStudyDate: string | null): boolean {
  if (!lastStudyDate) return false
  const today = new Date()
  const last = new Date(`${lastStudyDate}T00:00:00.000Z`)
  const daysSinceStudy = Math.floor((Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - last.getTime()) / 86_400_000)
  return daysSinceStudy === 0 || daysSinceStudy === 1
}

function nextStudyStreak (previous: PokemonProgress, today: string): number {
  if (previous.lastStudyDate === today) return previous.currentStreak
  if (previous.lastStudyDate && isRecentStudyDate(previous.lastStudyDate)) return previous.currentStreak + 1
  return 1
}

// Older progress documents could hold several totals; the highest is the latest cumulative value.
function storedTotalPoints (store: LiveStore, subject: NamedNode, document: NamedNode): number {
  return store.each(subject, quiz('totalPoints'), undefined, document)
    .reduce((highest, value) => Math.max(highest, numberValue(value.value)), 0)
}

function numberValue (value: string | null | undefined | void): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

async function saveProgress (
  store: LiveStore,
  user: NamedNode,
  progress: PokemonProgress,
  addStatements?: (target: ReturnType<typeof graph>) => void
): Promise<PokemonProgress> {
  const document = progress.progressDocument
  const subject = sym(`${document.uri}#this`)
  const target = graph()
  const replaced = ['totalPoints', 'pokemon', 'pokemonId', 'pokemonSprite', 'level', 'pendingPokemonLevel', 'deferredPokemonLevel', 'currentStreak', 'longestStreak', 'lastStudyDate']
    .map(name => quiz(name).value)
  store.statementsMatching(undefined, undefined, undefined, document).forEach(statement => {
    if (statement.subject.equals(subject) && replaced.includes(statement.predicate.value)) return
    target.add(statement.subject, statement.predicate, statement.object, document)
  })
  target.add(subject, rdf('type'), quiz('QuizProgress'), document)
  target.add(subject, dct('creator'), user, document)
  target.add(subject, quiz('totalPoints'), literal(String(progress.totalPoints)), document)
  target.add(subject, quiz('pokemon'), literal(progress.pokemon.name), document)
  target.add(subject, quiz('pokemonId'), literal(String(progress.pokemon.id)), document)
  target.add(subject, quiz('level'), literal(String(progress.pokemon.level)), document)
  if (progress.pokemon.sprite) target.add(subject, quiz('pokemonSprite'), literal(progress.pokemon.sprite), document)
  target.add(subject, quiz('currentStreak'), literal(String(progress.currentStreak)), document)
  target.add(subject, quiz('longestStreak'), literal(String(progress.longestStreak)), document)
  if (progress.lastStudyDate) target.add(subject, quiz('lastStudyDate'), literal(progress.lastStudyDate), document)
  progress.pendingChoices.forEach(choice => {
    target.add(subject, quiz('pendingPokemonLevel'), literal(String(choice.level)), document)
  })
  progress.deferredChoiceLevels.forEach(level => {
    target.add(subject, quiz('deferredPokemonLevel'), literal(String(level)), document)
  })
  addStatements?.(target)
  const data = serialize(document, target, document.uri, 'text/turtle') as string
  const response = await store.fetcher!.webOperation('PUT', document.uri, { data, contentType: 'text/turtle' })
  if (response && !response.ok) throw new Error(`Unable to save Pokemon progress: HTTP ${response.status}`)
  // PUT does not update rdflib's cached graph. Keep subsequent writes/readers in sync only after success.
  store.removeDocument(document)
  target.statements.forEach(statement => store.add(statement.subject, statement.predicate, statement.object, document))
  return progress
}

export async function updatePokemonProgress (
  store: LiveStore,
  earnedPoints: number,
  attempt: NamedNode,
  questionnaire: NamedNode,
  user: NamedNode | null = authn.currentUser(),
  availablePoints?: number
): Promise<PokemonProgress> {
  if (!user) throw new Error('Unable to save Pokemon progress without a signed-in user.')
  if (!Number.isFinite(earnedPoints) || earnedPoints < 0) throw new Error('Earned points must be a non-negative number.')
  if (availablePoints !== undefined && (!Number.isFinite(availablePoints) || availablePoints < 0)) {
    throw new Error('Available points must be a non-negative number.')
  }
  return serializeWrite(store, user, async () => {
    const document = await progressDocumentForUser(store, user)
    const subject = sym(`${document.uri}#this`)
    await createContainerIfMissing(store, document.uri.slice(0, document.uri.lastIndexOf('/') + 1))
    await loadDocument(store, document)
    const previous = readProgress(store, document)
    const existingAttempt = store.holds(subject, quiz('attempt'), attempt, document)
    if (existingAttempt) return previous
    const totalPoints = previous.totalPoints + earnedPoints
    if (!Number.isFinite(totalPoints)) throw new Error('Total points must be finite.')
    const level = pokemonLevelForPoints(totalPoints).level
    const today = studyDate(new Date())
    const currentStreak = nextStudyStreak(previous, today)
    const newlyUnlocked = POKEMON_LEVELS.filter(definition =>
      definition.level > previous.pokemon.level && definition.level <= level)
      .map(definition => ({ level: definition.level, options: pokemonChoicesForLevel(definition.level) }))
    const progress: PokemonProgress = {
      ...previous,
      totalPoints,
      pokemon: { ...previous.pokemon, level },
      currentStreak,
      longestStreak: Math.max(previous.longestStreak, currentStreak),
      lastStudyDate: today,
      pendingChoices: [...previous.pendingChoices, ...newlyUnlocked]
    }
    return saveProgress(store, user, progress, target => {
      target.add(subject, quiz('attempt'), attempt, document)
      target.add(attempt, quiz('earnedPoints'), literal(String(earnedPoints)), document)
      if (availablePoints !== undefined) {
        target.add(attempt, quiz('availablePoints'), literal(String(availablePoints)), document)
      }
      target.add(attempt, quiz('questionnaire'), questionnaire, document)
      target.add(attempt, dct('created'), literal(new Date().toISOString()), document)
    })
  })
}

export async function deferPokemonChoice (
  store: LiveStore,
  user: NamedNode,
  level: number
): Promise<PokemonProgress> {
  return serializeWrite(store, user, async () => {
    const document = await progressDocumentForUser(store, user)
    if (!await loadDocument(store, document)) throw new Error('Pokemon progress has not been saved yet.')
    const previous = readProgress(store, document)
    if (previous.deferredChoiceLevels.includes(level)) return previous
    const nextChoice = previous.pendingChoices.find(choice => !previous.deferredChoiceLevels.includes(choice.level))
    if (nextChoice?.level !== level) throw new Error('This Pokemon level is not awaiting a choice.')
    return saveProgress(store, user, {
      ...previous,
      deferredChoiceLevels: [...previous.deferredChoiceLevels, level]
    })
  })
}

export async function resumeDeferredPokemonChoices (
  store: LiveStore,
  user: NamedNode
): Promise<PokemonProgress> {
  return serializeWrite(store, user, async () => {
    const document = await progressDocumentForUser(store, user)
    if (!await loadDocument(store, document)) throw new Error('Pokemon progress has not been saved yet.')
    const previous = readProgress(store, document)
    if (!previous.deferredChoiceLevels.length) return previous
    return saveProgress(store, user, { ...previous, deferredChoiceLevels: [] })
  })
}

export async function choosePokemonCompanion (
  store: LiveStore,
  user: NamedNode,
  level: number,
  pokedexId: number
): Promise<PokemonProgress> {
  return serializeWrite(store, user, async () => {
    const document = await progressDocumentForUser(store, user)
    if (!await loadDocument(store, document)) throw new Error('Pokemon progress has not been saved yet.')
    const previous = readProgress(store, document)
    const subject = sym(`${document.uri}#this`)
    const selection = sym(`${document.uri}#pokemon-level-${level}`)
    const selectedId = numberValue(store.any(selection, quiz('pokemonId'), undefined, document)?.value)
    if (selectedId === pokedexId && store.holds(subject, quiz('pokemonSelection'), selection, document)) return previous
    const pending = previous.pendingChoices.find(choice => !previous.deferredChoiceLevels.includes(choice.level))
    if (!pending || pending.level !== level) throw new Error('This Pokemon level is not awaiting a choice.')
    const choice = pending.options.find(option => option.pokedexId === pokedexId)
    if (!choice) throw new Error('This Pokemon is not eligible for this level.')
    return saveProgress(store, user, {
      ...previous,
      pokemon: pokemonDetails(choice, previous.pokemon.level),
      pendingChoices: previous.pendingChoices.filter(choice => choice.level !== level),
      deferredChoiceLevels: previous.deferredChoiceLevels.filter(deferred => deferred !== level)
    }, target => {
      target.add(subject, quiz('pokemonSelection'), selection, document)
      target.add(selection, quiz('level'), literal(String(level)), document)
      target.add(selection, quiz('pokemonId'), literal(String(choice.pokedexId)), document)
      target.add(selection, quiz('pokemon'), literal(choice.pokemon), document)
      target.add(selection, dct('created'), literal(new Date().toISOString()), document)
    })
  })
}
