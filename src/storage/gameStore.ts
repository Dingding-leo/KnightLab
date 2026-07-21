import type { BotLevel, GameMode } from '../domain/chess'

const LIBRARY_KEY = 'knightlab.game-library.v1'
const SESSION_KEY = 'knightlab.active-session.v1'
const MAX_GAMES = 500

export interface StoredGame {
  id: string
  playedAt: string
  mode: GameMode
  botLevel?: BotLevel
  result: string
  pgn: string
  finalFen: string
  moveCount: number
}

export interface ActiveSession {
  pgn: string
  startFen: string
  mode: GameMode
  botLevel: BotLevel
  orientation: 'white' | 'black'
}

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function loadLibrary(): StoredGame[] {
  return safeParse<StoredGame[]>(localStorage.getItem(LIBRARY_KEY), [])
}

export function saveGame(game: StoredGame): StoredGame[] {
  const library = loadLibrary()
  if (library.some((entry) => entry.id === game.id)) return library
  const next = [game, ...library].slice(0, MAX_GAMES)
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(next))
  return next
}

export function clearLibrary(): void {
  localStorage.removeItem(LIBRARY_KEY)
}

export function saveActiveSession(session: ActiveSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function loadActiveSession(): ActiveSession | null {
  return safeParse<ActiveSession | null>(localStorage.getItem(SESSION_KEY), null)
}

export function clearActiveSession(): void {
  localStorage.removeItem(SESSION_KEY)
}
