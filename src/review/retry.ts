import { Chess, type Color, type Square } from 'chess.js'
import type { AnalysisMove, AnalysisTimeline } from '../analysis/analysisModel'
import type { CoachGuidance } from './coach'
import type { MoveClassification, ReviewedMove } from './reviewModel'

export const RETRY_SCHEMA_VERSION = 1
export const MAX_RETRY_ITEMS = 500
export const MAX_RETRY_BYTES = 32_768
export const MAX_RETRY_PLIES = 1_024
export const RETRY_SCHEDULE_DAYS = [1, 3, 7, 14, 30] as const

const REVIEW_KEY_PATTERN = /^[0-9a-f]{16}$/
const UCI_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/
const SQUARE_PATTERN = /^[a-h][1-8]$/
const ERROR_CLASSIFICATIONS = new Set<MoveClassification>([
  'inaccuracy', 'mistake', 'miss', 'blunder',
])
const MAX_FEN_BYTES = 1_024
const MAX_SAN_BYTES = 64
const MAX_FOCUS_BYTES = 4_096
const MAX_TIMESTAMP_BYTES = 64
const MAX_ATTEMPTS = 1_000_000

export type RetryClassification = 'inaccuracy' | 'mistake' | 'miss' | 'blunder'
export type RetryStatus = 'active' | 'mastered'
export type RetryMoveOutcome = 'recorded-solution' | 'not-recorded' | 'illegal'
export type RetryAttemptOutcome = Exclude<RetryMoveOutcome, 'illegal'> | 'hinted' | 'revealed' | 'skipped'

export interface RetryMoveInput {
  from: Square
  to: Square
  /** Board adapters may pass any chess piece symbol; only q/r/b/n is legal. */
  promotion?: string
}

export interface RetryItem {
  schemaVersion: typeof RETRY_SCHEMA_VERSION
  retryKey: string
  reviewKey: string
  sourcePly: number
  preFen: string
  sideToMove: Color
  playedMoveUci: string
  playedMoveSan: string
  solutionUci: string
  solutionSan: string
  solutionLineSan: string[]
  classification: RetryClassification
  focus: string
  status: RetryStatus
  attemptCount: number
  correctStreak: number
  dueAt: string
  lastAttemptAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateRetryItemInput {
  timeline: Pick<AnalysisTimeline, 'startFen' | 'positions' | 'moves'>
  move: ReviewedMove
  reviewKey: string
  guidance?: CoachGuidance | null
  /** Injectable clock for deterministic creation and tests. */
  now?: Date | string
}

type UciMove = RetryMoveInput

interface VerifiedTimelineMove {
  preFen: string
  source: AnalysisMove
  playedMoveUci: string
  playedMoveSan: string
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function isBoundedString(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === 'string'
    && value.length >= minimum
    && bytes(value) <= maximum
    && !value.includes('\0')
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum
}

function parseUci(value: unknown): UciMove | null {
  if (typeof value !== 'string' || !UCI_PATTERN.test(value)) return null
  return {
    from: value.slice(0, 2) as Square,
    to: value.slice(2, 4) as Square,
    promotion: value.length === 5 ? value[4] as UciMove['promotion'] : undefined,
  }
}

function uci(move: RetryMoveInput): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`
}

function appliedUci(move: { from: Square; to: Square; promotion?: string }): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`
}

function legalMove(fen: string, candidate: UciMove) {
  try {
    const game = new Chess(fen)
    return game.move(candidate)
  } catch {
    return null
  }
}

function legalMoveFromGame(game: Chess, candidate: UciMove) {
  try {
    return game.move(candidate)
  } catch {
    return null
  }
}

function canonicalTimestamp(value: Date | string | undefined, label: string): string {
  const date = value instanceof Date
    ? new Date(value.getTime())
    : typeof value === 'string'
      ? new Date(value)
      : new Date()
  if (!Number.isFinite(date.getTime())) throw new Error(`${label} is invalid.`)
  return date.toISOString()
}

function timestamp(value: unknown): number | null {
  if (!isBoundedString(value, 1, MAX_TIMESTAMP_BYTES)) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function addDays(isoTime: string, days: number): string {
  const date = new Date(isoTime)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

function validFocus(guidance: CoachGuidance | null | undefined): string | null {
  const focus = guidance?.focus
  return isBoundedString(focus, 1, MAX_FOCUS_BYTES) ? focus : null
}

function validatedContinuation(preFen: string, values: unknown, solutionUci: string): string[] {
  if (!Array.isArray(values) || values.length > 128) return []
  const entries = values.slice(0, 6)
  if (!entries.every((value) => isBoundedString(value, 1, MAX_SAN_BYTES))) return []
  if (!entries.length) return []

  try {
    const game = new Chess(preFen)
    const canonical = entries.map((entry) => game.move(entry).san)
    const first = new Chess(preFen).move(entries[0])
    if (appliedUci(first) !== solutionUci) return []
    return canonical
  } catch {
    return []
  }
}

function sourceUci(move: AnalysisMove): UciMove | null {
  const promotion = move.promotion === undefined ? '' : move.promotion
  return parseUci(`${move.from}${move.to}${promotion}`)
}

function isTimelineMove(value: unknown, index: number, game: Chess): value is AnalysisMove {
  if (!isObject(value)
    || !isBoundedInteger(value.ply, index + 1, index + 1)
    || !isBoundedInteger(value.moveNumber, 1, 1_000_000)
    || (value.color !== 'w' && value.color !== 'b')
    || !isBoundedString(value.san, 1, MAX_SAN_BYTES)
    || !isBoundedString(value.from, 2, 2) || !SQUARE_PATTERN.test(value.from)
    || !isBoundedString(value.to, 2, 2) || !SQUARE_PATTERN.test(value.to)
    || !(value.promotion === undefined || value.promotion === 'q' || value.promotion === 'r'
      || value.promotion === 'b' || value.promotion === 'n')) return false

  const moveNumber = Number(game.fen().split(/\s+/)[5])
  return value.moveNumber === moveNumber && value.color === game.turn()
}

function matchesTimelinePosition(
  value: unknown,
  index: number,
  game: Chess,
  lastMove: { from: Square; to: Square } | null,
): boolean {
  if (!isObject(value)
    || !isBoundedInteger(value.ply, index, index)
    || !isBoundedString(value.fen, 1, MAX_FEN_BYTES)
    || (value.turn !== 'w' && value.turn !== 'b')
    || value.fen !== game.fen()
    || value.turn !== game.turn()) return false

  if (lastMove === null) return value.lastMove === null
  return isObject(value.lastMove)
    && value.lastMove.from === lastMove.from
    && value.lastMove.to === lastMove.to
}

function verifyTimelineMove(
  timeline: Pick<AnalysisTimeline, 'startFen' | 'positions' | 'moves'>,
  reviewed: ReviewedMove,
): VerifiedTimelineMove | null {
  if (!timeline
    || !isBoundedString(timeline.startFen, 1, MAX_FEN_BYTES)
    || !Array.isArray(timeline.moves)
    || !Array.isArray(timeline.positions)
    || timeline.moves.length === 0
    || timeline.moves.length > MAX_RETRY_PLIES
    || timeline.positions.length !== timeline.moves.length + 1
    || !isBoundedInteger(reviewed?.ply, 1, timeline.moves.length)) return null

  let game: Chess
  try {
    game = new Chess(timeline.startFen)
  } catch {
    return null
  }
  if (game.fen() !== timeline.startFen) return null
  if (!matchesTimelinePosition(timeline.positions[0], 0, game, null)) return null

  let verified: VerifiedTimelineMove | null = null
  for (const [index, source] of timeline.moves.entries()) {
    if (!isTimelineMove(source, index, game)) return null
    const candidate = sourceUci(source)
    if (!candidate) return null
    const preFen = game.fen()
    const applied = legalMoveFromGame(game, candidate)
    if (!applied
      || applied.from !== source.from
      || applied.to !== source.to
      || (applied.promotion ?? undefined) !== candidate.promotion
      || applied.san !== source.san
      || !matchesTimelinePosition(
        timeline.positions[index + 1],
        index + 1,
        game,
        { from: applied.from, to: applied.to },
      )) return null

    if (index === reviewed.ply - 1) {
      if (reviewed.moveNumber !== source.moveNumber
        || reviewed.color !== source.color
        || reviewed.san !== source.san
        || reviewed.from !== source.from
        || reviewed.to !== source.to) return null
      verified = {
        preFen,
        source,
        playedMoveUci: uci(candidate),
        playedMoveSan: applied.san,
      }
    }
  }

  return verified
}

function retryStatusForStreak(correctStreak: number): RetryStatus {
  return correctStreak === RETRY_SCHEDULE_DAYS.length ? 'mastered' : 'active'
}

function assertRetrySchedule(value: RetryItem): void {
  const created = timestamp(value.createdAt)
  const updated = timestamp(value.updatedAt)
  const due = timestamp(value.dueAt)
  if (created === null || updated === null || due === null || updated < created) {
    throw new Error('Retry timestamps are invalid.')
  }

  if (value.attemptCount === 0) {
    if (value.lastAttemptAt !== null || value.correctStreak !== 0 || value.status !== 'active' || due !== created || updated !== created) {
      throw new Error('Unattempted retry scheduling is invalid.')
    }
    return
  }

  const attempted = timestamp(value.lastAttemptAt)
  if (attempted === null || attempted < created || updated < attempted) {
    throw new Error('Retry attempt timestamps are invalid.')
  }
  if (value.status !== retryStatusForStreak(value.correctStreak)) {
    throw new Error('Retry mastery state is invalid.')
  }
  const expectedDue = value.correctStreak === 0
    ? attempted
    : Date.parse(addDays(value.lastAttemptAt!, RETRY_SCHEDULE_DAYS[value.correctStreak - 1]))
  if (due !== expectedDue) throw new Error('Retry due date does not match its schedule.')
}

export function isRetryKey(value: unknown): value is string {
  if (!isBoundedString(value, 18, 21)) return false
  const separator = value.lastIndexOf(':')
  if (separator !== 16 || !REVIEW_KEY_PATTERN.test(value.slice(0, separator))) return false
  const sourcePly = Number(value.slice(separator + 1))
  return isBoundedInteger(sourcePly, 1, MAX_RETRY_PLIES) && `${value.slice(0, separator)}:${sourcePly}` === value
}

export function createRetryKey(reviewKey: string, sourcePly: number): string {
  if (!REVIEW_KEY_PATTERN.test(reviewKey) || !isBoundedInteger(sourcePly, 1, MAX_RETRY_PLIES)) {
    throw new Error('Retry identity is invalid.')
  }
  return `${reviewKey}:${sourcePly}`
}

/**
 * Converts one fully reviewed adverse move into a durable, engine-free retry
 * prompt. Any mismatch in the replay data returns null instead of making a
 * best-effort exercise from untrusted review data.
 */
export function createRetryItem(input: CreateRetryItemInput): RetryItem | null {
  if (!input
    || !ERROR_CLASSIFICATIONS.has(input.move?.classification)
    || input.move.isBestMove !== false
    || input.move.confidence !== 'normal'
    || !REVIEW_KEY_PATTERN.test(input.reviewKey)) return null

  const verified = verifyTimelineMove(input.timeline, input.move)
  if (!verified) return null

  let preGame: Chess
  try {
    preGame = new Chess(verified.preFen)
  } catch {
    return null
  }
  if (preGame.isGameOver() || preGame.turn() !== input.move.color) return null

  const solution = parseUci(input.move.bestMoveUci)
  if (!solution) return null
  const appliedSolution = legalMove(verified.preFen, solution)
  if (!appliedSolution || appliedUci(appliedSolution) !== uci(solution)) return null

  let createdAt: string
  try {
    createdAt = canonicalTimestamp(input.now, 'Retry creation time')
  } catch {
    return null
  }
  const focus = validFocus(input.guidance)
    ?? 'Compare the forcing checks, captures, and threats before choosing the recorded move.'
  const item: RetryItem = {
    schemaVersion: RETRY_SCHEMA_VERSION,
    retryKey: createRetryKey(input.reviewKey, input.move.ply),
    reviewKey: input.reviewKey,
    sourcePly: input.move.ply,
    preFen: verified.preFen,
    sideToMove: preGame.turn(),
    playedMoveUci: verified.playedMoveUci,
    playedMoveSan: verified.playedMoveSan,
    solutionUci: uci(solution),
    solutionSan: appliedSolution.san,
    solutionLineSan: validatedContinuation(verified.preFen, input.move.bestLineSan, uci(solution)),
    classification: input.move.classification as RetryClassification,
    focus,
    status: 'active',
    attemptCount: 0,
    correctStreak: 0,
    dueAt: createdAt,
    lastAttemptAt: null,
    createdAt,
    updatedAt: createdAt,
  }
  try {
    assertRetryItem(item)
    return item
  } catch {
    return null
  }
}

export const createRetryItemFromReview = createRetryItem

export function isRetryItem(value: unknown): value is RetryItem {
  try {
    assertRetryItem(value)
    return true
  } catch {
    return false
  }
}

/** Validates all durable retry fields, including legal move reconstruction. */
export function assertRetryItem(value: unknown): asserts value is RetryItem {
  if (!isObject(value)
    || value.schemaVersion !== RETRY_SCHEMA_VERSION
    || !isRetryKey(value.retryKey)
    || !isBoundedString(value.reviewKey, 16, 16)
    || !REVIEW_KEY_PATTERN.test(value.reviewKey)
    || !isBoundedInteger(value.sourcePly, 1, MAX_RETRY_PLIES)
    || value.retryKey !== createRetryKey(value.reviewKey, value.sourcePly)
    || !isBoundedString(value.preFen, 1, MAX_FEN_BYTES)
    || (value.sideToMove !== 'w' && value.sideToMove !== 'b')
    || !isBoundedString(value.playedMoveUci, 4, 5) || !UCI_PATTERN.test(value.playedMoveUci)
    || !isBoundedString(value.playedMoveSan, 1, MAX_SAN_BYTES)
    || !isBoundedString(value.solutionUci, 4, 5) || !UCI_PATTERN.test(value.solutionUci)
    || !isBoundedString(value.solutionSan, 1, MAX_SAN_BYTES)
    || !Array.isArray(value.solutionLineSan) || value.solutionLineSan.length > 6
    || !value.solutionLineSan.every((san) => isBoundedString(san, 1, MAX_SAN_BYTES))
    || !ERROR_CLASSIFICATIONS.has(value.classification as MoveClassification)
    || !isBoundedString(value.focus, 1, MAX_FOCUS_BYTES)
    || (value.status !== 'active' && value.status !== 'mastered')
    || !isBoundedInteger(value.attemptCount, 0, MAX_ATTEMPTS)
    || !isBoundedInteger(value.correctStreak, 0, RETRY_SCHEDULE_DAYS.length)
    || !(value.lastAttemptAt === null || isBoundedString(value.lastAttemptAt, 1, MAX_TIMESTAMP_BYTES))
    || !isBoundedString(value.dueAt, 1, MAX_TIMESTAMP_BYTES)
    || !isBoundedString(value.createdAt, 1, MAX_TIMESTAMP_BYTES)
    || !isBoundedString(value.updatedAt, 1, MAX_TIMESTAMP_BYTES)
    || bytes(JSON.stringify(value)) > MAX_RETRY_BYTES) {
    throw new Error('Retry item is invalid or too large.')
  }

  let game: Chess
  try {
    game = new Chess(value.preFen)
  } catch {
    throw new Error('Retry position is invalid.')
  }
  if (game.fen() !== value.preFen || game.isGameOver() || game.turn() !== value.sideToMove) {
    throw new Error('Retry position does not match its side to move.')
  }

  const played = legalMove(value.preFen, parseUci(value.playedMoveUci)!)
  const solution = legalMove(value.preFen, parseUci(value.solutionUci)!)
  if (!played || !solution
    || appliedUci(played) !== value.playedMoveUci
    || appliedUci(solution) !== value.solutionUci
    || played.san !== value.playedMoveSan
    || solution.san !== value.solutionSan) {
    throw new Error('Retry move facts are invalid.')
  }

  const item = value as unknown as RetryItem
  if (item.solutionLineSan.length) {
    const canonical = validatedContinuation(item.preFen, item.solutionLineSan, item.solutionUci)
    if (canonical.length !== item.solutionLineSan.length
      || canonical.some((san, index) => san !== item.solutionLineSan[index])) {
      throw new Error('Retry solution line is invalid.')
    }
  }
  assertRetrySchedule(item)
}

function parseCandidate(candidate: RetryMoveInput | string): UciMove | null {
  if (typeof candidate === 'string') return parseUci(candidate)
  if (!candidate
    || !SQUARE_PATTERN.test(candidate.from)
    || !SQUARE_PATTERN.test(candidate.to)
    || !(candidate.promotion === undefined || candidate.promotion === 'q' || candidate.promotion === 'r'
      || candidate.promotion === 'b' || candidate.promotion === 'n')) return null
  return { ...candidate }
}

/**
 * Gives an intentionally narrow answer: a legal move either matches the
 * recorded first choice exactly, or it is simply not that recorded move.
 */
export function evaluateRetryMove(item: RetryItem, candidate: RetryMoveInput | string): RetryMoveOutcome {
  if (!isRetryItem(item)) return 'illegal'
  const parsed = parseCandidate(candidate)
  if (!parsed) return 'illegal'
  const applied = legalMove(item.preFen, parsed)
  if (!applied) return 'illegal'
  return appliedUci(applied) === item.solutionUci ? 'recorded-solution' : 'not-recorded'
}

/**
 * Advances deterministic local repetition metadata. Alternatives, hinted
 * answers, reveals and skips are due immediately so the player can try again
 * without a fresh engine evaluation; only an unassisted exact match advances
 * the fixed schedule.
 */
export function recordRetryAttempt(
  item: RetryItem,
  outcome: RetryAttemptOutcome,
  at?: Date | string,
): RetryItem {
  assertRetryItem(item)
  if (outcome !== 'recorded-solution'
    && outcome !== 'not-recorded'
    && outcome !== 'hinted'
    && outcome !== 'revealed'
    && outcome !== 'skipped') {
    throw new Error('Retry attempt outcome is invalid.')
  }
  if (item.attemptCount >= MAX_ATTEMPTS) throw new Error('Retry attempt count has reached its limit.')
  const attemptedAt = canonicalTimestamp(at, 'Retry attempt time')
  const attempted = Date.parse(attemptedAt)
  const previous = item.lastAttemptAt === null ? Date.parse(item.createdAt) : Date.parse(item.lastAttemptAt)
  if (attempted < previous) throw new Error('Retry attempt cannot predate the existing item.')

  const correctStreak = outcome === 'recorded-solution'
    ? Math.min(RETRY_SCHEDULE_DAYS.length, item.correctStreak + 1)
    : 0
  const next: RetryItem = {
    ...item,
    status: retryStatusForStreak(correctStreak),
    attemptCount: item.attemptCount + 1,
    correctStreak,
    dueAt: correctStreak === 0
      ? attemptedAt
      : addDays(attemptedAt, RETRY_SCHEDULE_DAYS[correctStreak - 1]),
    lastAttemptAt: attemptedAt,
    updatedAt: attemptedAt,
  }
  assertRetryItem(next)
  return next
}

export function compareRetryItems(left: RetryItem, right: RetryItem): number {
  const status = (left.status === 'active' ? 0 : 1) - (right.status === 'active' ? 0 : 1)
  if (status) return status
  const due = Date.parse(left.dueAt) - Date.parse(right.dueAt)
  if (due) return due
  const updated = Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  if (updated) return updated
  return left.retryKey.localeCompare(right.retryKey)
}

export function dueRetryItems(items: readonly RetryItem[], now?: Date | string): RetryItem[] {
  const nowAt = Date.parse(canonicalTimestamp(now, 'Retry queue time'))
  return items
    .filter((item) => isRetryItem(item) && item.status === 'active' && Date.parse(item.dueAt) <= nowAt)
    .sort(compareRetryItems)
}
