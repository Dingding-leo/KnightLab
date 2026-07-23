import type { BotLevel, GameMode } from '../domain/chess'
import type { ClockState, TimeControl } from '../domain/clock'
import type { GameTermination } from '../domain/completion'
import {
  DEFAULT_BOT_PROFILE_ID,
  isBotProfileId,
  type BotProfileId,
} from '../bots/profiles'
import {
  DEFAULT_ENGINE_SETTINGS,
  normalizeEngineSettings,
  type EngineSettings,
} from '../engine/engineSettings'

/** Browser mirror used before a desktop SQLite migration takes ownership. */
export const LIBRARY_STORAGE_KEY = 'knightclub.game-library.v1'
const SESSION_KEY = 'knightclub.active-session.v1'
const PREFERENCES_KEY = 'knightclub.preferences.v1'
const MAX_GAMES = 500

export type HumanColor = 'w' | 'b'
export type ColorChoice = 'white' | 'black' | 'random'

export interface StoredGame {
  id: string
  playedAt: string
  mode: GameMode
  botLevel?: BotLevel
  /** Named local opponent. Omitted by games created before the opponent roster. */
  botProfileId?: BotProfileId
  result: string
  pgn: string
  finalFen: string
  moveCount: number
  timeControl?: TimeControl
  whiteTimeMs?: number | null
  blackTimeMs?: number | null
  termination?: GameTermination | string
  reviewed?: boolean
  reviewKey?: string
  /** Resolved human side for bot games. Omitted by records saved before color selection existed. */
  humanColor?: HumanColor
  /** The selection that resolved to `humanColor`; `random` remains meaningful after resolution. */
  colorChoice?: ColorChoice
}

/** Minimal browser-storage surface needed to read the legacy game library. */
export interface LibraryStorage {
  getItem(key: string): string | null
}

export interface ActiveSession {
  pgn: string
  startFen: string
  mode: GameMode
  botLevel: BotLevel
  /** Named local opponent. Omitted by sessions created before the opponent roster. */
  botProfileId?: BotProfileId
  orientation: 'white' | 'black'
  timeControl?: TimeControl
  clock?: ClockState
  clockHistory?: ClockState[]
  termination?: GameTermination | null
  /** Resolved human side for bot games. Omitted by sessions saved before color selection existed. */
  humanColor?: HumanColor
  /** The selection that resolved to `humanColor`; `random` remains meaningful after resolution. */
  colorChoice?: ColorChoice
}

export interface Preferences {
  soundsEnabled: boolean
  engine: EngineSettings
  botProfileId: BotProfileId
}

export const DEFAULT_PREFERENCES: Preferences = {
  soundsEnabled: true,
  engine: DEFAULT_ENGINE_SETTINGS,
  botProfileId: DEFAULT_BOT_PROFILE_ID,
}

export function isHumanColor(value: unknown): value is HumanColor {
  return value === 'w' || value === 'b'
}

export function isColorChoice(value: unknown): value is ColorChoice {
  return value === 'white' || value === 'black' || value === 'random'
}

/**
 * The side fields are optional so records written before color selection remain readable.
 * Once present, each field must use one of the persisted wire values.
 */
export function hasValidPlayerSideFields(value: unknown): value is {
  humanColor?: HumanColor
  colorChoice?: ColorChoice
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const side = value as { humanColor?: unknown; colorChoice?: unknown }
  return (side.humanColor === undefined || isHumanColor(side.humanColor))
    && (side.colorChoice === undefined || isColorChoice(side.colorChoice))
}

/** Profile IDs are optional for backwards compatibility, but never accepted when malformed. */
export function hasValidBotProfileField(value: unknown): value is { botProfileId?: BotProfileId } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const profile = value as { botProfileId?: unknown }
  return profile.botProfileId === undefined || isBotProfileId(profile.botProfileId)
}

function isStoredGame(value: unknown): value is StoredGame {
  if (!value || typeof value !== 'object') return false
  const game = value as Partial<StoredGame>
  return typeof game.id === 'string' && game.id.length > 0 && game.id.length <= 512
    && typeof game.playedAt === 'string' && game.playedAt.length <= 512
    && (game.mode === 'bot' || game.mode === 'local')
    && typeof game.result === 'string' && game.result.length <= 32
    && typeof game.pgn === 'string' && game.pgn.length <= 524_288
    && typeof game.finalFen === 'string' && game.finalFen.length > 0 && game.finalFen.length <= 1_024
    && Number.isInteger(game.moveCount) && Number(game.moveCount) >= 0 && Number(game.moveCount) <= 100_000
    && (game.reviewed === undefined || typeof game.reviewed === 'boolean')
    && (game.reviewKey === undefined || (typeof game.reviewKey === 'string' && /^[0-9a-f]{16}$/.test(game.reviewKey)))
    && hasValidPlayerSideFields(game)
    && hasValidBotProfileField(game)
}

function isActiveSession(value: unknown): value is ActiveSession {
  if (!hasValidPlayerSideFields(value) || !hasValidBotProfileField(value)) return false
  const session = value as Partial<ActiveSession>
  return typeof session.pgn === 'string'
    && typeof session.startFen === 'string' && session.startFen.length > 0
    && (session.mode === 'bot' || session.mode === 'local')
    && (session.botLevel === 'easy' || session.botLevel === 'balanced' || session.botLevel === 'strong')
    && (session.orientation === 'white' || session.orientation === 'black')
}

export function normalizeLibrary(value: unknown): StoredGame[] {
  if (!Array.isArray(value)) return []
  return value.filter(isStoredGame).slice(0, MAX_GAMES)
}

/**
 * Merges a delayed native library response with the current in-memory list.
 * The latter wins for matching IDs so a just-saved game or review flag cannot
 * be erased by a request that started before its SQLite write completed.
 */
export function mergeLibraryGames(
  nativeGames: readonly StoredGame[],
  currentGames: readonly StoredGame[],
): StoredGame[] {
  const byId = new Map<string, StoredGame>()
  for (const game of nativeGames) byId.set(game.id, game)
  for (const game of currentGames) byId.set(game.id, game)
  return [...byId.values()]
    .sort((left, right) => right.playedAt.localeCompare(left.playedAt) || right.id.localeCompare(left.id))
    .slice(0, MAX_GAMES)
}

export interface MarkLibraryReviewedResult {
  /** Keeps non-matching records referentially stable for memoized Library views. */
  games: StoredGame[]
  /** Only records whose visible review status actually changed. */
  changedGames: StoredGame[]
}

/**
 * Marks records that already carry the canonical review identity. This is
 * deliberately a single pass over lightweight metadata: it never opens or
 * parses stored PGN text on the UI thread.
 */
export function markLibraryGamesReviewed(
  games: readonly StoredGame[],
  reviewKey: string,
): MarkLibraryReviewedResult {
  const changedGames: StoredGame[] = []
  const nextGames = games.map((game) => {
    if (game.reviewKey !== reviewKey || game.reviewed) return game
    const next = { ...game, reviewed: true }
    changedGames.push(next)
    return next
  })
  return { games: nextGames, changedGames }
}

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function browserLibraryStorage(storage?: LibraryStorage): LibraryStorage | null {
  if (storage) return storage
  return typeof localStorage === 'undefined' ? null : localStorage
}

/**
 * Reads the legacy browser mirror without parsing it. The Library surface can
 * hand this text to a dedicated Worker, while synchronous callers retain the
 * same normalized loader below.
 */
export function readBrowserLibraryRaw(storage?: LibraryStorage): string | null {
  try {
    return readBrowserLibraryRawStrict(storage)
  } catch {
    return null
  }
}

/**
 * Raw reader for the opt-in Library surface. Unlike the synchronous legacy
 * loader above, this preserves a storage-access failure so the UI can offer a
 * retry instead of pretending an unreadable private library is empty.
 */
export function readBrowserLibraryRawStrict(storage?: LibraryStorage): string | null {
  const target = browserLibraryStorage(storage)
  if (!target) return null
  return target.getItem(LIBRARY_STORAGE_KEY)
}

/**
 * Pure fail-closed parser shared by the browser loader and deferred Worker
 * hydration. It deliberately keeps the historic library normalization rules:
 * malformed entries are dropped and a malformed snapshot becomes an empty
 * library rather than leaking unknown persisted data into the UI.
 */
export function parseBrowserLibraryRaw(raw: string | null): StoredGame[] {
  return normalizeLibrary(safeParse<unknown>(raw, []))
}

export function loadLibrary(): StoredGame[] {
  return parseBrowserLibraryRaw(readBrowserLibraryRaw())
}

export function saveGame(game: StoredGame): StoredGame[] {
  const library = loadLibrary()
  if (library.some((entry) => entry.id === game.id)) return library
  const next = [game, ...library].slice(0, MAX_GAMES)
  localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(next))
  return next
}

/** Replaces metadata for a known game without creating a duplicate library row. */
export function updateGame(game: StoredGame): StoredGame[] {
  const library = loadLibrary()
  const index = library.findIndex((entry) => entry.id === game.id)
  if (index < 0) return saveGame(game)
  const next = [...library]
  next[index] = game
  localStorage.setItem(LIBRARY_STORAGE_KEY, JSON.stringify(next))
  return next
}

export function clearLibrary(): void {
  localStorage.removeItem(LIBRARY_STORAGE_KEY)
}

export function saveActiveSession(session: ActiveSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

/**
 * Older sessions do not have a player-side preference, so their missing fields
 * are valid. A present but malformed side field invalidates the whole session.
 */
export function normalizeActiveSession(value: unknown): ActiveSession | null {
  return isActiveSession(value) ? value : null
}

export function loadActiveSession(): ActiveSession | null {
  return normalizeActiveSession(safeParse<unknown>(localStorage.getItem(SESSION_KEY), null))
}

export function clearActiveSession(): void {
  localStorage.removeItem(SESSION_KEY)
}

export function normalizePreferences(value: unknown): Preferences {
  if (!value || typeof value !== 'object') return { ...DEFAULT_PREFERENCES }
  const preferences = value as Partial<Preferences>
  return {
    soundsEnabled: typeof preferences.soundsEnabled === 'boolean'
      ? preferences.soundsEnabled
      : DEFAULT_PREFERENCES.soundsEnabled,
    engine: normalizeEngineSettings(preferences.engine),
    botProfileId: isBotProfileId(preferences.botProfileId)
      ? preferences.botProfileId
      : DEFAULT_PREFERENCES.botProfileId,
  }
}

export function loadPreferences(): Preferences {
  return normalizePreferences(safeParse<unknown>(localStorage.getItem(PREFERENCES_KEY), null))
}

export function savePreferences(preferences: Preferences): void {
  localStorage.setItem(PREFERENCES_KEY, JSON.stringify(normalizePreferences(preferences)))
}
