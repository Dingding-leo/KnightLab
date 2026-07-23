import { createPgnTimeline, type AnalysisTimeline } from '../analysis/analysisModel'
import type { GameReview } from './gameReviewRunner'
import type { ReviewedMove } from './reviewModel'
import {
  createReviewKeyFromMoves,
  REVIEW_KEY_SCHEMA_VERSION,
} from './reviewKey'

export { createReviewKeyFromMoves, type ReviewKeyMove } from './reviewKey'

export const REVIEW_SCHEMA_VERSION = REVIEW_KEY_SCHEMA_VERSION
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

/**
 * Only snapshots created inside this module may bypass a second PGN replay at
 * a persistence boundary.  Identity is deliberately part of the contract:
 * JSON clones, native payloads, and caller-assembled objects must all use the
 * strict validator below before they can be saved.
 */
const trustedPersistedReviewSnapshots = new WeakSet<object>()

export interface PersistedReview {
  schemaVersion: typeof REVIEW_SCHEMA_VERSION
  reviewKey: string
  sourcePgn: string
  startFen: string
  moveCount: number
  reviewedAt: string
  report: GameReview
}

/**
 * A strict saved-review validation also produces the exact timeline it had to
 * replay. Keeping the two together lets a background Worker hand Train →
 * Review one verified source instead of asking a second Worker to parse the
 * same PGN again.
 */
export interface HydratedPersistedReview {
  record: PersistedReview
  timeline: AnalysisTimeline
}

export interface ReviewStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * A deliberately cheap shape for indexing browser storage.  It proves that a
 * value can safely participate in replacement/sorting, but it does not replay
 * its PGN or walk every reviewed move. Only a strict browser loader promotes
 * an envelope to a real PersistedReview with `assertPersistedReview`.
 */
interface PersistedReviewEnvelope {
  schemaVersion: typeof REVIEW_SCHEMA_VERSION
  reviewKey: string
  sourcePgn: string
  startFen: string
  moveCount: number
  reviewedAt: string
  report: unknown
}

interface CachedBrowserReviews {
  /** Exact storage text which this private index was derived from. */
  raw: string | null
  /** Never expose unverified envelopes outside this module. */
  items: readonly PersistedReviewEnvelope[]
  /** Includes every same-key candidate so a corrupt newer duplicate cannot hide an older valid review. */
  byKey: ReadonlyMap<string, readonly PersistedReviewEnvelope[]>
}

/**
 * Review reports can each contain a long PGN.  Replaying every report on a
 * normal save makes a 500-review library noticeably stall.  A raw-text keyed
 * cache keeps only a private, shallow index; any direct localStorage rewrite
 * invalidates it before a record can be used again.
 */
const browserReviewCache = new WeakMap<ReviewStorage, CachedBrowserReviews>()

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

export function isReviewKey(value: unknown): value is string {
  return typeof value === 'string' && REVIEW_KEY_PATTERN.test(value)
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

function isGameReviewEnvelope(value: unknown, moveCount: number): boolean {
  if (!isObject(value)) return false
  return isBoundedString(value.createdAt, 1, MAX_SHORT_TEXT)
    && isBoundedString(value.engineName, 0, MAX_SHORT_TEXT)
    && isBoundedString(value.enginePath, 0, 4_096)
    && isBoundedNumber(value.totalElapsedMs, 0, MAX_REVIEW_PLIES * 20_000)
    && Array.isArray(value.moves)
    && value.moves.length === moveCount
    && isObject(value.settings)
    && isObject(value.summary)
}

function isPersistedReviewEnvelope(value: unknown): value is PersistedReviewEnvelope {
  if (!isObject(value)
    || value.schemaVersion !== REVIEW_SCHEMA_VERSION
    || !isReviewKey(value.reviewKey)
    || !isBoundedString(value.sourcePgn, 1, MAX_PGN_BYTES)
    || !isBoundedString(value.startFen, 1, MAX_FEN_BYTES)
    || !isBoundedInteger(value.moveCount, 1, MAX_REVIEW_PLIES)
    || !isBoundedString(value.reviewedAt, 1, MAX_SHORT_TEXT)) return false

  return isGameReviewEnvelope(value.report, value.moveCount)
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

/** Preserves the timeline-facing API while sharing the direct-history identity path. */
export function createReviewKey(timeline: Pick<AnalysisTimeline, 'startFen' | 'moves'>): string {
  return createReviewKeyFromMoves(timeline.startFen, timeline.moves)
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
  // A completed review can contain hundreds of moves.  Detach it from the
  // live analysis report before validating, then freeze the exact value that
  // will cross the save boundary.  This lets the immediate save skip another
  // expensive PGN replay without trusting any mutable caller-owned object.
  const snapshot = clonePersistedReview(record)
  assertPersistedReview(snapshot)
  const immutableSnapshot = freezeRecursively(snapshot)
  trustedPersistedReviewSnapshots.add(immutableSnapshot)
  return immutableSnapshot
}

export function isPersistedReview(value: unknown): value is PersistedReview {
  try {
    assertPersistedReview(value)
    return true
  } catch {
    return false
  }
}

/**
 * Fully validate an untrusted persisted report and retain the canonical PGN
 * timeline created during that proof. This must run outside an interaction
 * render path for restored long games.
 */
export function hydratePersistedReview(value: unknown): HydratedPersistedReview {
  if (!isObject(value)
    || value.schemaVersion !== REVIEW_SCHEMA_VERSION
    || !isReviewKey(value.reviewKey)
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

  const record = value as unknown as PersistedReview
  const timeline = createPgnTimeline(record.sourcePgn)
  if (timeline.startFen !== record.startFen
    || timeline.moves.length !== record.moveCount
    || createReviewKey(timeline) !== record.reviewKey
    || !matchesSourceTimeline(record.report.moves, timeline)) {
    throw new Error('Saved review does not match its source game.')
  }
  return { record, timeline }
}

export function assertPersistedReview(value: unknown): asserts value is PersistedReview {
  void hydratePersistedReview(value)
}

/**
 * Preserve strict validation for every untrusted value while avoiding a
 * duplicate chess.js replay for the immutable snapshot just produced by
 * `createPersistedReview`.  The registry is private and identity-based, so a
 * deserialized clone can never inherit this trust.
 */
export function assertPersistedReviewForSave(value: unknown): asserts value is PersistedReview {
  if (isObject(value) && trustedPersistedReviewSnapshots.has(value)) return
  assertPersistedReview(value)
}

function browserStorage(storage?: ReviewStorage): ReviewStorage | null {
  if (storage) return storage
  return typeof localStorage === 'undefined' ? null : localStorage
}

/**
 * Returns the opaque browser mirror without parsing it. Review restoration
 * hands this text to a dedicated Worker so JSON parsing and PGN replay never
 * monopolise the Review interaction thread.
 */
export function readBrowserReviewRaw(storage?: ReviewStorage): string | null {
  const target = browserStorage(storage)
  if (!target) return null
  try {
    return target.getItem(REVIEW_STORAGE_KEY)
  } catch {
    // Preserve the old fail-closed browser behavior: inaccessible local
    // storage behaves as an empty review mirror.
    return null
  }
}

function comparePersistedReviews(left: PersistedReviewEnvelope, right: PersistedReviewEnvelope): number {
  return right.reviewedAt.localeCompare(left.reviewedAt)
}

function clonePersistedReview<T extends PersistedReviewEnvelope>(review: T): T {
  // Browser storage contains JSON-compatible data.  Clone the one item that
  // crosses the cache boundary so a caller cannot mutate the private index.
  return JSON.parse(JSON.stringify(review)) as T
}

function freezeRecursively<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const nested of Object.values(value)) freezeRecursively(nested)
  return Object.freeze(value)
}

function parseBrowserReviewEnvelopes(raw: string | null): PersistedReviewEnvelope[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(isPersistedReviewEnvelope)
      .sort(comparePersistedReviews)
      .slice(0, MAX_PERSISTED_REVIEWS)
  } catch {
    return []
  }
}

function cacheBrowserReviewEnvelopes(
  storage: ReviewStorage,
  raw: string | null,
  items: readonly PersistedReviewEnvelope[],
): CachedBrowserReviews {
  // All callers pass either JSON parsed from `raw` or a prior private cache
  // plus a clone of the newly validated record.  A fresh array prevents a
  // later caller-side array mutation from changing this snapshot.
  const privateItems = [...items]
  const byKey = new Map<string, PersistedReviewEnvelope[]>()
  for (const item of privateItems) {
    const candidates = byKey.get(item.reviewKey)
    if (candidates) candidates.push(item)
    else byKey.set(item.reviewKey, [item])
  }
  const cached: CachedBrowserReviews = { raw, items: privateItems, byKey }
  browserReviewCache.set(storage, cached)
  return cached
}

function readBrowserReviewSnapshot(storage: ReviewStorage): CachedBrowserReviews {
  const raw = readBrowserReviewRaw(storage)

  const cached = browserReviewCache.get(storage)
  if (cached && cached.raw === raw) return cached
  return cacheBrowserReviewEnvelopes(storage, raw, parseBrowserReviewEnvelopes(raw))
}

function insertBrowserReview(
  items: readonly PersistedReviewEnvelope[],
  record: PersistedReview,
): PersistedReviewEnvelope[] {
  // Remove every duplicate legacy identity.  The binary insertion preserves
  // the existing newest-first order without re-sorting a 500-review library.
  const withoutExisting = items.filter((item) => item.reviewKey !== record.reviewKey)
  const incoming = clonePersistedReview(record)
  let start = 0
  let end = withoutExisting.length
  while (start < end) {
    const middle = Math.floor((start + end) / 2)
    if (comparePersistedReviews(incoming, withoutExisting[middle]!) <= 0) end = middle
    else start = middle + 1
  }
  return [
    ...withoutExisting.slice(0, start),
    incoming,
    ...withoutExisting.slice(start),
  ].slice(0, MAX_PERSISTED_REVIEWS)
}

function findValidatedBrowserReview(
  snapshot: CachedBrowserReviews,
  reviewKey: string,
): PersistedReview | null {
  // A same-key duplicate can be malformed (or fail its PGN consistency
  // check).  Validate each requested candidate fully and only return a record
  // after its own source line has been replayed successfully.
  for (const candidate of snapshot.byKey.get(reviewKey) ?? []) {
    if (isPersistedReview(candidate)) return candidate
  }
  return null
}

/**
 * Worker-safe strict browser restore. It reuses the exact shallow envelope
 * rules and newest-first duplicate fallback of `loadBrowserReview`, but keeps
 * JSON parsing and each target PGN replay off the UI thread.
 */
export function hydrateBrowserReviewRaw(
  raw: string | null,
  reviewKey: string,
): HydratedPersistedReview | null {
  if (!isReviewKey(reviewKey)) return null
  const candidates = parseBrowserReviewEnvelopes(raw)
  for (const candidate of candidates) {
    if (candidate.reviewKey !== reviewKey) continue
    try {
      return hydratePersistedReview(candidate)
    } catch {
      // A malformed newer duplicate must not shadow an older valid record.
    }
  }
  return null
}

export function saveBrowserReview(record: PersistedReview, storage?: ReviewStorage): void {
  assertPersistedReviewForSave(record)
  const target = browserStorage(storage)
  if (!target) throw new Error('Local review storage is unavailable.')
  const next = insertBrowserReview(readBrowserReviewSnapshot(target).items, record)
  const serialized = JSON.stringify(next)
  target.setItem(REVIEW_STORAGE_KEY, serialized)
  cacheBrowserReviewEnvelopes(target, serialized, next)
}

export function loadBrowserReview(reviewKey: string, storage?: ReviewStorage): PersistedReview | null {
  if (!isReviewKey(reviewKey)) return null
  const target = browserStorage(storage)
  if (!target) return null
  const review = findValidatedBrowserReview(readBrowserReviewSnapshot(target), reviewKey)
  return review ? clonePersistedReview(review) : null
}
