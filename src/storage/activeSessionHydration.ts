import { Chess, type Move } from 'chess.js'
import { isClockState } from '../domain/clock'
import {
  normalizeActiveSession,
  normalizeHydratedActiveSession,
  parseActiveSessionRaw,
  type ActiveSession,
} from './gameStore'
import type { HydratedActiveSessionWire } from './activeSessionHydrationProtocol'

const MAX_ACTIVE_SESSION_HISTORY_LENGTH = 100_000

export interface HydratedActiveSession {
  session: ActiveSession
  game: Chess
  verboseHistory: readonly Move[]
}

function hydrateSession(session: ActiveSession | null): HydratedActiveSessionWire | null {
  const normalized = normalizeActiveSession(session)
  if (!normalized) return null

  // Clock snapshots can be as long as a retained game. Filter them beside the
  // PGN replay so Play does not walk a large persisted array during adoption.
  const hydratedSession: ActiveSession = {
    ...normalized,
    clockHistory: Array.isArray(normalized.clockHistory)
      ? normalized.clockHistory.filter(isClockState)
      : [],
  }

  const game = new Chess(hydratedSession.startFen)
  if (hydratedSession.pgn.trim()) game.loadPgn(hydratedSession.pgn)
  const verboseHistory = game.history({ verbose: true })
  return {
    snapshotVersion: 1,
    session: hydratedSession,
    finalFen: game.fen(),
    historyLength: verboseHistory.length,
    // postMessage (or structuredClone in the yielded fallback) deliberately
    // turns this into plain own-property data. The client revives it below.
    gameState: game,
    verboseHistory,
  }
}

/** Worker/fallback parser for the browser's unparsed active-session mirror. */
export function hydrateActiveSessionRaw(raw: string | null): HydratedActiveSessionWire | null {
  return hydrateSession(parseActiveSessionRaw(raw))
}

/** Worker/fallback parser for the authoritative desktop SQLite payload. */
export function hydrateActiveSession(session: ActiveSession | null): HydratedActiveSessionWire | null {
  return hydrateSession(session)
}

function isSquare(value: unknown): boolean {
  return typeof value === 'string' && /^[a-h][1-8]$/.test(value)
}

function isVerboseHistory(value: unknown, expectedLength: number): value is Move[] {
  if (!Array.isArray(value) || value.length !== expectedLength) return false
  return value.every((move) => {
    if (!move || typeof move !== 'object') return false
    const candidate = move as Partial<Move>
    return typeof candidate.san === 'string'
      && typeof candidate.before === 'string'
      && typeof candidate.after === 'string'
      && (candidate.color === 'w' || candidate.color === 'b')
      && isSquare(candidate.from)
      && isSquare(candidate.to)
      && typeof candidate.piece === 'string'
      && typeof candidate.flags === 'string'
  })
}

function reviveGameState(value: unknown): Chess {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Active-session Worker returned an invalid chess snapshot.')
  }
  return Object.assign(Object.create(Chess.prototype), value) as Chess
}

/**
 * Verifies a Worker snapshot through chess.js's public FEN API and its stored
 * undo-stack depth, then exposes the already-computed verbose history so Play
 * does not ask chess.js to rebuild it on the interaction thread.
 */
export function reviveHydratedActiveSession(value: unknown): HydratedActiveSession | null {
  if (value === null) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Active-session Worker returned an invalid response.')
  }
  const hydrated = value as Partial<HydratedActiveSessionWire>
  const session = normalizeHydratedActiveSession(hydrated.session)
  if (!session
    || hydrated.snapshotVersion !== 1
    || typeof hydrated.finalFen !== 'string'
    || !Number.isInteger(hydrated.historyLength)
    || Number(hydrated.historyLength) < 0
    || Number(hydrated.historyLength) > MAX_ACTIVE_SESSION_HISTORY_LENGTH
    || !isVerboseHistory(hydrated.verboseHistory, Number(hydrated.historyLength))) {
    throw new Error('Active-session Worker returned an invalid response.')
  }

  const game = reviveGameState(hydrated.gameState)
  const privateHistory = (game as unknown as { _history?: unknown })._history
  try {
    if (!Array.isArray(privateHistory)
      || privateHistory.length !== hydrated.historyLength
      || game.fen() !== hydrated.finalFen) {
      throw new Error('Active-session Worker snapshot did not verify.')
    }
  } catch (error) {
    throw error instanceof Error
      ? error
      : new Error('Active-session Worker snapshot did not verify.')
  }

  return { session, game, verboseHistory: hydrated.verboseHistory }
}
