import { createPgnTimeline, type AnalysisTimeline } from '../analysis/analysisModel'
import type { GameReview } from './gameReviewRunner'
import type { ReviewedMove } from './reviewModel'

export const REVIEW_SCHEMA_VERSION = 1
export const MAX_PERSISTED_REVIEWS = 500
export const MAX_REVIEW_PLIES = 1_024
export const MAX_REVIEW_BYTES = 2_097_152

const REVIEW_STORAGE_KEY = 'knightclub.review-reports.v1'
const MAX_PGN_BYTES = 524_288
const MAX_FEN_BYTES = 1_024
const MAX_SHORT_TEXT = 512
const REVIEW_KEY_PATTERN = /^[0-9a-f]{16}$/
const SQUARE_PATTERN = /^[a-h][1-8]$/
const UCI_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/
const REVIEW_CLASSIFICATIONS = new Set([
  'brilliant', 'great', 'best', 'excellent', 'good', 'book',
  'inaccuracy', 'mistake', 'miss', 'blunder', 'forced',
])
const REVIEW_PHASES = new Set(['opening', 'middlegame', 'endgame'])

export interface PersistedReview {
  schemaVersion: typeof REVIEW_SCHEMA_VERSION
  reviewKey: string
  sourcePgn: string
  startFen: string
  moveCount: number
  reviewedAt: string
  report: GameReview
}

export interface ReviewStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function byteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isBoundedString(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === 'string'
    && value.length >= minimum
    && value.length <= maximum
    && !value.includes('\0')
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum
}

function isBoundedNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum
}

function isNullableBoundedNumber(value: unknown, minimum: number, maximum: number): value is number | null {
  return value === null || isBoundedNumber(value, minimum, maximum)
}

function isAnalysisScore(value: unknown): boolean {
  if (!isObject(value)) return false
  return (value.kind === 'cp' || value.kind === 'mate')
    && isBoundedInteger(value.value, -1_000_000, 1_000_000)
    && (value.bound === null || value.bound === 'lower' || value.bound === 'upper')
}

function isAnalysisSettings(value: unknown): boolean {
  if (!isObject(value)) return false
  return isBoundedInteger(value.moveTimeMs, 100, 10_000)
    && (value.depth === null || isBoundedInteger(value.depth, 1, 40))
    && (value.nodes === null || isBoundedInteger(value.nodes, 1_000, 100_000_000))
    && isBoundedInteger(value.multiPv, 1, 5)
    && isBoundedInteger(value.threads, 1, 32)
    && isBoundedInteger(value.hashMb, 16, 4_096)
}

function isReviewedMove(value: unknown): value is ReviewedMove {
  if (!isObject(value)
    || !isBoundedInteger(value.ply, 1, MAX_REVIEW_PLIES)
    || !isBoundedInteger(value.moveNumber, 1, 1_000_000)
    || (value.color !== 'w' && value.color !== 'b')
    || !isBoundedString(value.san, 1, 64)
    || !isBoundedString(value.from, 2, 2) || !SQUARE_PATTERN.test(value.from)
    || !isBoundedString(value.to, 2, 2) || !SQUARE_PATTERN.test(value.to)
    || !REVIEW_CLASSIFICATIONS.has(String(value.classification))
    || !isBoundedNumber(value.accuracy, 0, 100)
    || !isBoundedInteger(value.centipawnLoss, 0, 1_000)
    || !isBoundedNumber(value.expectedLoss, 0, 1)
    || !(value.bestMoveUci === null || (isBoundedString(value.bestMoveUci, 4, 5) && UCI_PATTERN.test(value.bestMoveUci)))
    || !(value.bestMoveSan === null || isBoundedString(value.bestMoveSan, 1, 64))
    || typeof value.isBestMove !== 'boolean'
    || !REVIEW_PHASES.has(String(value.phase))
    || !isAnalysisScore(value.bestScore)
    || !isAnalysisScore(value.playedScore)
    || !Array.isArray(value.bestLineSan) || value.bestLineSan.length > 128
    || !value.bestLineSan.every((san) => isBoundedString(san, 1, 64))
    || !isBoundedInteger(value.depth, 0, 255)
    || (value.confidence !== 'normal' && value.confidence !== 'limited')
    || !isBoundedString(value.feedback, 1, 4_096)) return false
  return true
}

function isReviewSummary(value: unknown): boolean {
  if (!isObject(value)) return false
  const classifications = value.classifications
  const phaseAccuracy = value.phaseAccuracy
  if (
    !isBoundedNumber(value.accuracy, 0, 100)
    || !isNullableBoundedNumber(value.whiteAccuracy, 0, 100)
    || !isNullableBoundedNumber(value.blackAccuracy, 0, 100)
    || !isBoundedNumber(value.averageCentipawnLoss, 0, 1_000)
    || !isBoundedNumber(value.bestMoveRate, 0, 100)
    || !isObject(classifications)
    || !isObject(phaseAccuracy)
    || !Array.isArray(value.turningPoints)
    || value.turningPoints.length > 5) return false

  return [...REVIEW_CLASSIFICATIONS].every((classification) => isBoundedInteger(classifications[classification], 0, MAX_REVIEW_PLIES))
    && Object.keys(classifications).length === REVIEW_CLASSIFICATIONS.size
    && [...REVIEW_PHASES].every((phase) => isNullableBoundedNumber(phaseAccuracy[phase], 0, 100))
    && Object.keys(phaseAccuracy).length === REVIEW_PHASES.size
    && value.turningPoints.every(isReviewedMove)
}

function isGameReview(value: unknown): value is GameReview {
  if (!isObject(value)
    || !isBoundedString(value.createdAt, 1, MAX_SHORT_TEXT)
    || !isBoundedString(value.engineName, 0, MAX_SHORT_TEXT)
    || !isBoundedString(value.enginePath, 0, 4_096)
    || !isBoundedNumber(value.totalElapsedMs, 0, MAX_REVIEW_PLIES * 20_000)
    || !Array.isArray(value.moves)
    || value.moves.length > MAX_REVIEW_PLIES
    || !isAnalysisSettings(value.settings)
    || !isReviewSummary(value.summary)) return false

  return value.moves.every(isReviewedMove)
}

function matchesSourceTimeline(reviewedMoves: ReviewedMove[], timeline: AnalysisTimeline): boolean {
  return reviewedMoves.length === timeline.moves.length
    && reviewedMoves.every((reviewed, index) => {
      const source = timeline.moves[index]
      return reviewed.ply === source.ply
        && reviewed.moveNumber === source.moveNumber
        && reviewed.color === source.color
        && reviewed.san === source.san
        && reviewed.from === source.from
        && reviewed.to === source.to
    })
}

function stableHash(input: string): string {
  // FNV-1a 64 is tiny, deterministic and stable across browser/native builds.
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn
  for (const byte of new TextEncoder().encode(input)) {
    hash ^= BigInt(byte)
    hash = (hash * prime) & mask
  }
  return hash.toString(16).padStart(16, '0')
}

export function createReviewKey(timeline: Pick<AnalysisTimeline, 'startFen' | 'moves'>): string {
  const line = timeline.moves
    .map((move) => `${move.color}:${move.from}${move.to}${move.promotion ?? ''}`)
    .join('|')
  return stableHash(`knightclub-review-v${REVIEW_SCHEMA_VERSION}\n${timeline.startFen}\n${line}`)
}

function assertPersistableTimeline(timeline: AnalysisTimeline): asserts timeline is AnalysisTimeline & { source: 'pgn'; sourcePgn: string } {
  if (timeline.source !== 'pgn' || !timeline.sourcePgn) {
    throw new Error('Only a PGN game can be saved as a full review.')
  }
  if (timeline.moves.length === 0 || timeline.moves.length > MAX_REVIEW_PLIES) {
    throw new Error(`A saved review must contain 1 to ${MAX_REVIEW_PLIES} plies.`)
  }
  if (new TextEncoder().encode(timeline.sourcePgn).byteLength > MAX_PGN_BYTES) {
    throw new Error('The source PGN is too large to save with this review.')
  }
}

export function createPersistedReview(timeline: AnalysisTimeline, report: GameReview, reviewedAt = new Date().toISOString()): PersistedReview {
  assertPersistableTimeline(timeline)
  const record: PersistedReview = {
    schemaVersion: REVIEW_SCHEMA_VERSION,
    reviewKey: createReviewKey(timeline),
    sourcePgn: timeline.sourcePgn,
    startFen: timeline.startFen,
    moveCount: timeline.moves.length,
    reviewedAt,
    report,
  }
  assertPersistedReview(record)
  return record
}

export function isPersistedReview(value: unknown): value is PersistedReview {
  try {
    assertPersistedReview(value)
    return true
  } catch {
    return false
  }
}

export function assertPersistedReview(value: unknown): asserts value is PersistedReview {
  if (!isObject(value)
    || value.schemaVersion !== REVIEW_SCHEMA_VERSION
    || !isBoundedString(value.reviewKey, 16, 16)
    || !REVIEW_KEY_PATTERN.test(value.reviewKey)
    || !isBoundedString(value.sourcePgn, 1, MAX_PGN_BYTES)
    || !isBoundedString(value.startFen, 1, MAX_FEN_BYTES)
    || !Number.isInteger(value.moveCount)
    || Number(value.moveCount) < 1
    || Number(value.moveCount) > MAX_REVIEW_PLIES
    || !isBoundedString(value.reviewedAt, 1, MAX_SHORT_TEXT)
    || !isGameReview(value.report)
    || byteLength(value) > MAX_REVIEW_BYTES) {
    throw new Error('Saved review is invalid or too large.')
  }

  const timeline = createPgnTimeline(value.sourcePgn)
  if (timeline.startFen !== value.startFen
    || timeline.moves.length !== value.moveCount
    || createReviewKey(timeline) !== value.reviewKey
    || !matchesSourceTimeline(value.report.moves, timeline)) {
    throw new Error('Saved review does not match its source game.')
  }
}

function browserStorage(storage?: ReviewStorage): ReviewStorage | null {
  if (storage) return storage
  return typeof localStorage === 'undefined' ? null : localStorage
}

function loadBrowserReviews(storage?: ReviewStorage): PersistedReview[] {
  const target = browserStorage(storage)
  if (!target) return []
  try {
    const parsed: unknown = JSON.parse(target.getItem(REVIEW_STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(isPersistedReview)
      .sort((left, right) => right.reviewedAt.localeCompare(left.reviewedAt))
      .slice(0, MAX_PERSISTED_REVIEWS)
  } catch {
    return []
  }
}

export function saveBrowserReview(record: PersistedReview, storage?: ReviewStorage): void {
  assertPersistedReview(record)
  const target = browserStorage(storage)
  if (!target) throw new Error('Local review storage is unavailable.')
  const next = [record, ...loadBrowserReviews(target).filter((item) => item.reviewKey !== record.reviewKey)]
    .sort((left, right) => right.reviewedAt.localeCompare(left.reviewedAt))
    .slice(0, MAX_PERSISTED_REVIEWS)
  target.setItem(REVIEW_STORAGE_KEY, JSON.stringify(next))
}

export function loadBrowserReview(reviewKey: string, storage?: ReviewStorage): PersistedReview | null {
  if (!REVIEW_KEY_PATTERN.test(reviewKey)) return null
  return loadBrowserReviews(storage).find((item) => item.reviewKey === reviewKey) ?? null
}
