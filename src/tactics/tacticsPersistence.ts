import {
  INITIAL_TACTIC_SEED_REVISION,
  TACTIC_PROGRESS_SCHEMA_VERSION,
  TACTIC_SCHEDULE_DAYS,
  assertTacticProgress,
  assertTacticPuzzle,
  compareTacticProgressRecords,
  type TacticId,
  type TacticProgress,
  type TacticProgressRecord,
  type TacticProgressStatus,
  type TacticPuzzle,
} from './tactics'

/** Wire schema shared by browser storage and the native Tauri envelope. */
export const TACTICS_PERSISTENCE_SCHEMA_VERSION = 1 as const
export const TACTICS_STORAGE_KEY = 'knightclub.tactics-state.v1'
export const MAX_TACTICS_PROGRESS = 128
export const MAX_TACTICS_ATTEMPTS = 500
export const MAX_TACTICS_PROGRESS_BYTES = 2_048
export const MAX_TACTICS_ATTEMPT_BYTES = 1_024
export const MAX_TACTICS_STATE_BYTES = MAX_TACTICS_PROGRESS * (MAX_TACTICS_PROGRESS_BYTES + 1)
  + MAX_TACTICS_ATTEMPTS * (MAX_TACTICS_ATTEMPT_BYTES + 1) + 64
export const MAX_TACTICS_SEED_REVISION = 1_000_000
export const MAX_TACTICS_TOTAL_ATTEMPTS = 1_000_000
export const MAX_TACTICS_ELAPSED_MS = 3_600_000
export const MAX_TACTICS_MOVE_COUNT = 64
export const MAX_TACTICS_HINT_COUNT = 3

const MAX_SEED_ID_BYTES = 96
const MAX_ATTEMPT_ID_BYTES = 128
const MAX_TIMESTAMP_BYTES = 64
const SEED_ID_PATTERN = /^seed-v1:[a-z0-9-]{1,87}$/
const ATTEMPT_ID_PATTERN = /^[A-Za-z0-9._-]+$/
const OUTCOMES = new Set<TacticsAttemptOutcome>([
  'solved',
  'failed',
  'hinted',
  'revealed',
  'skipped',
])

export type TacticsAttemptOutcome = 'solved' | 'failed' | 'hinted' | 'revealed' | 'skipped'

/** Durable, per-seed state; answer material never lives in this payload. */
export interface TacticsProgress {
  schemaVersion: typeof TACTICS_PERSISTENCE_SCHEMA_VERSION
  seedId: TacticId
  seedRevision: number
  dueAt: string
  status: TacticProgressStatus
  attemptCount: number
  solveCount: number
  correctStreak: number
  lastAttemptAt: string | null
  lastOutcome: TacticsAttemptOutcome | null
  bestSolveMs: number | null
  createdAt: string
  updatedAt: string
}

/** Immutable terminal result; a new record is made for every terminal run. */
export interface TacticsAttempt {
  schemaVersion: typeof TACTICS_PERSISTENCE_SCHEMA_VERSION
  attemptId: string
  seedId: TacticId
  seedRevision: number
  attemptedAt: string
  outcome: TacticsAttemptOutcome
  elapsedMs: number
  moveCount: number
  hintCount: number
}

/** Native-compatible envelope passed as `{ tactics: { progress, attempts } }`. */
export interface TacticsState {
  progress: readonly TacticsProgress[]
  attempts: readonly TacticsAttempt[]
}

export type TacticsStateSnapshot = TacticsState

export interface TacticsStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface RecordTacticsTerminalAttemptInput {
  attemptId: string
  outcome: TacticsAttemptOutcome
  elapsedMs: number
  moveCount: number
  hintCount: number
  /** Injectable clock makes the transition deterministic in tests and native calls. */
  attemptedAt?: Date | string
}

export interface TacticsTerminalTransition {
  state: TacticsState
  progress: TacticsProgress
  attempt: TacticsAttempt
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function jsonByteLength(value: unknown): number {
  try {
    const serialized = JSON.stringify(value)
    return typeof serialized === 'string' ? byteLength(serialized) : Number.POSITIVE_INFINITY
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

function isBoundedString(value: unknown, minimum: number, maximum: number): value is string {
  return typeof value === 'string'
    && value.length >= minimum
    && byteLength(value) <= maximum
    && !value.includes('\0')
}

function isBoundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (!isBoundedString(value, 1, MAX_TIMESTAMP_BYTES)) return false
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value
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

function addDays(isoTime: string, days: number): string {
  const date = new Date(isoTime)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

function statusForStreak(correctStreak: number): TacticProgressStatus {
  return correctStreak === TACTIC_SCHEDULE_DAYS.length ? 'mastered' : 'active'
}

function expectedDueAt(attemptedAt: string, correctStreak: number): string {
  return correctStreak === 0
    ? attemptedAt
    : addDays(attemptedAt, TACTIC_SCHEDULE_DAYS[correctStreak - 1])
}

function validSeedId(value: unknown): value is TacticId {
  return isBoundedString(value, 9, MAX_SEED_ID_BYTES) && SEED_ID_PATTERN.test(value)
}

function progressFingerprint(value: TacticsProgress): string {
  return [
    value.schemaVersion,
    value.seedId,
    value.seedRevision,
    value.dueAt,
    value.status,
    value.attemptCount,
    value.solveCount,
    value.correctStreak,
    value.lastAttemptAt ?? '',
    value.lastOutcome ?? '',
    value.bestSolveMs ?? '',
    value.createdAt,
    value.updatedAt,
  ].join('\u0001')
}

function attemptFingerprint(value: TacticsAttempt): string {
  return [
    value.schemaVersion,
    value.attemptId,
    value.seedId,
    value.seedRevision,
    value.attemptedAt,
    value.outcome,
    value.elapsedMs,
    value.moveCount,
    value.hintCount,
  ].join('\u0001')
}

function sameAttempt(left: TacticsAttempt, right: TacticsAttempt): boolean {
  return attemptFingerprint(left) === attemptFingerprint(right)
}

/**
 * Mirrors the native replacement rule, then resolves impossible equal-version
 * ties by a stable payload fingerprint so browser/browser merging is order-free.
 */
function compareProgressFreshness(left: TacticsProgress, right: TacticsProgress): number {
  if (left.seedRevision !== right.seedRevision) return left.seedRevision - right.seedRevision
  if (left.updatedAt !== right.updatedAt) return left.updatedAt.localeCompare(right.updatedAt)
  if (left.attemptCount !== right.attemptCount) return left.attemptCount - right.attemptCount
  return progressFingerprint(left).localeCompare(progressFingerprint(right))
}

function browserStorage(storage?: TacticsStorage): TacticsStorage | null {
  if (storage) return storage
  return typeof localStorage === 'undefined' ? null : localStorage
}

/** Validates the exact payload shape accepted by the native tactics tables. */
export function assertTacticsProgress(value: unknown): asserts value is TacticsProgress {
  if (!isObject(value)
    || value.schemaVersion !== TACTICS_PERSISTENCE_SCHEMA_VERSION
    || !validSeedId(value.seedId)
    || !isBoundedInteger(value.seedRevision, INITIAL_TACTIC_SEED_REVISION, MAX_TACTICS_SEED_REVISION)
    || !isCanonicalTimestamp(value.dueAt)
    || (value.status !== 'active' && value.status !== 'mastered')
    || !isBoundedInteger(value.attemptCount, 0, MAX_TACTICS_TOTAL_ATTEMPTS)
    || !isBoundedInteger(value.solveCount, 0, MAX_TACTICS_TOTAL_ATTEMPTS)
    || value.solveCount > value.attemptCount
    || !isBoundedInteger(value.correctStreak, 0, TACTIC_SCHEDULE_DAYS.length)
    || !(value.lastAttemptAt === null || isCanonicalTimestamp(value.lastAttemptAt))
    || !(value.lastOutcome === null || OUTCOMES.has(value.lastOutcome as TacticsAttemptOutcome))
    || !(value.bestSolveMs === null || isBoundedInteger(value.bestSolveMs, 0, MAX_TACTICS_ELAPSED_MS))
    || !isCanonicalTimestamp(value.createdAt)
    || !isCanonicalTimestamp(value.updatedAt)
    || jsonByteLength(value) > MAX_TACTICS_PROGRESS_BYTES) {
    throw new Error('Tactics progress is invalid or too large.')
  }

  const createdAt = Date.parse(value.createdAt)
  const updatedAt = Date.parse(value.updatedAt)
  if (updatedAt < createdAt || value.status !== statusForStreak(value.correctStreak)) {
    throw new Error('Tactics progress chronology or mastery state is invalid.')
  }

  if (value.attemptCount === 0) {
    if (value.solveCount !== 0
      || value.correctStreak !== 0
      || value.lastAttemptAt !== null
      || value.lastOutcome !== null
      || value.bestSolveMs !== null
      || value.status !== 'active'
      || value.dueAt !== value.createdAt
      || value.updatedAt !== value.createdAt) {
      throw new Error('Unattempted tactics progress is invalid.')
    }
    return
  }

  if (value.lastAttemptAt === null || value.lastOutcome === null) {
    throw new Error('Tactics progress is missing its terminal attempt facts.')
  }
  const attemptedAt = Date.parse(value.lastAttemptAt)
  if (attemptedAt < createdAt || updatedAt !== attemptedAt || value.dueAt !== expectedDueAt(value.lastAttemptAt, value.correctStreak)) {
    throw new Error('Tactics progress schedule does not match its terminal attempt.')
  }
  if ((value.lastOutcome === 'solved') !== (value.correctStreak > 0)) {
    throw new Error('Tactics progress streak does not match its terminal outcome.')
  }
  if ((value.solveCount === 0) !== (value.bestSolveMs === null)) {
    throw new Error('Tactics progress solve statistics are incomplete.')
  }
}

export function isTacticsProgress(value: unknown): value is TacticsProgress {
  try {
    assertTacticsProgress(value)
    return true
  } catch {
    return false
  }
}

/** Validates one immutable result payload before it is mirrored or merged. */
export function assertTacticsAttempt(value: unknown): asserts value is TacticsAttempt {
  if (!isObject(value)
    || value.schemaVersion !== TACTICS_PERSISTENCE_SCHEMA_VERSION
    || !isBoundedString(value.attemptId, 1, MAX_ATTEMPT_ID_BYTES)
    || !ATTEMPT_ID_PATTERN.test(value.attemptId)
    || !validSeedId(value.seedId)
    || !isBoundedInteger(value.seedRevision, INITIAL_TACTIC_SEED_REVISION, MAX_TACTICS_SEED_REVISION)
    || !isCanonicalTimestamp(value.attemptedAt)
    || !OUTCOMES.has(value.outcome as TacticsAttemptOutcome)
    || !isBoundedInteger(value.elapsedMs, 0, MAX_TACTICS_ELAPSED_MS)
    || !isBoundedInteger(value.moveCount, 0, MAX_TACTICS_MOVE_COUNT)
    || !isBoundedInteger(value.hintCount, 0, MAX_TACTICS_HINT_COUNT)
    || jsonByteLength(value) > MAX_TACTICS_ATTEMPT_BYTES) {
    throw new Error('Tactics attempt is invalid or too large.')
  }
  if ((value.outcome === 'solved' && value.hintCount !== 0)
    || (value.outcome === 'hinted' && value.hintCount === 0)) {
    throw new Error('Tactics attempt assistance facts are invalid.')
  }
}

export function isTacticsAttempt(value: unknown): value is TacticsAttempt {
  try {
    assertTacticsAttempt(value)
    return true
  } catch {
    return false
  }
}

/** Validates the native-compatible `{ progress, attempts }` envelope. */
export function assertTacticsState(value: unknown): asserts value is TacticsState {
  if (!isObject(value)
    || !Array.isArray(value.progress)
    || !Array.isArray(value.attempts)
    || value.progress.length > MAX_TACTICS_PROGRESS
    || value.attempts.length > MAX_TACTICS_ATTEMPTS
    || jsonByteLength(value) > MAX_TACTICS_STATE_BYTES) {
    throw new Error('Tactics state is invalid or too large.')
  }
  value.progress.forEach(assertTacticsProgress)
  value.attempts.forEach(assertTacticsAttempt)
  if (new Set(value.progress.map((progress) => progress.seedId)).size !== value.progress.length) {
    throw new Error('Tactics state has duplicate seed progress.')
  }
  if (new Set(value.attempts.map((attempt) => attempt.attemptId)).size !== value.attempts.length) {
    throw new Error('Tactics state has duplicate immutable attempts.')
  }
}

export function isTacticsState(value: unknown): value is TacticsState {
  try {
    assertTacticsState(value)
    return true
  } catch {
    return false
  }
}

export function createTacticsState(): TacticsState {
  return { progress: [], attempts: [] }
}

/** Native ordering for a bounded state snapshot. */
export function compareTacticsProgress(left: TacticsProgress, right: TacticsProgress): number {
  const status = (left.status === 'active' ? 0 : 1) - (right.status === 'active' ? 0 : 1)
  if (status) return status
  const due = left.dueAt.localeCompare(right.dueAt)
  if (due) return due
  const updated = right.updatedAt.localeCompare(left.updatedAt)
  if (updated) return updated
  return left.seedId.localeCompare(right.seedId)
}

/** Native ordering for immutable attempt history. */
export function compareTacticsAttempts(left: TacticsAttempt, right: TacticsAttempt): number {
  const attemptedAt = right.attemptedAt.localeCompare(left.attemptedAt)
  if (attemptedAt) return attemptedAt
  return right.attemptId.localeCompare(left.attemptId)
}

function trimTacticsState(progress: TacticsProgress[], attempts: TacticsAttempt[]): TacticsState {
  return {
    progress: [...progress].sort(compareTacticsProgress).slice(0, MAX_TACTICS_PROGRESS),
    attempts: [...attempts].sort(compareTacticsAttempts).slice(0, MAX_TACTICS_ATTEMPTS),
  }
}

/**
 * Reconciles browser/native snapshots deterministically. Attempts are immutable
 * by ID; progress prefers revision, then update time, then attempt count.
 */
export function mergeTacticsState(...states: TacticsState[]): TacticsState {
  const progressBySeed = new Map<TacticId, TacticsProgress>()
  const attemptsById = new Map<string, TacticsAttempt>()
  for (const state of states) {
    assertTacticsState(state)
    for (const progress of state.progress) {
      const current = progressBySeed.get(progress.seedId)
      if (!current || compareProgressFreshness(progress, current) > 0) {
        progressBySeed.set(progress.seedId, progress)
      }
    }
    for (const attempt of state.attempts) {
      const current = attemptsById.get(attempt.attemptId)
      if (current && !sameAttempt(current, attempt)) {
        throw new Error('Tactics attempt ID conflicts with immutable history.')
      }
      attemptsById.set(attempt.attemptId, attempt)
    }
  }
  const merged = trimTacticsState([...progressBySeed.values()], [...attemptsById.values()])
  assertTacticsState(merged)
  return merged
}

export const mergeTacticsStates = mergeTacticsState

/**
 * Builds an immutable terminal attempt and its exact successor progress before
 * one merge/write. No partial calculation state is written through this API.
 */
export function recordTacticsTerminalAttempt(
  state: TacticsState,
  puzzle: TacticPuzzle,
  input: RecordTacticsTerminalAttemptInput,
): TacticsTerminalTransition {
  assertTacticsState(state)
  assertTacticPuzzle(puzzle)
  const attemptedAt = canonicalTimestamp(input.attemptedAt, 'Tactics attempt time')
  const attempt: TacticsAttempt = {
    schemaVersion: TACTICS_PERSISTENCE_SCHEMA_VERSION,
    attemptId: input.attemptId,
    seedId: puzzle.id,
    seedRevision: puzzle.seedRevision,
    attemptedAt,
    outcome: input.outcome,
    elapsedMs: input.elapsedMs,
    moveCount: input.moveCount,
    hintCount: input.hintCount,
  }
  assertTacticsAttempt(attempt)

  const existingAttempt = state.attempts.find((saved) => saved.attemptId === attempt.attemptId)
  if (existingAttempt) {
    if (!sameAttempt(existingAttempt, attempt)) {
      throw new Error('Tactics attempt ID conflicts with immutable history.')
    }
    const current = state.progress.find((progress) => progress.seedId === puzzle.id)
    if (!current) throw new Error('Tactics state is missing progress for its existing attempt.')
    return { state, progress: current, attempt: existingAttempt }
  }

  const saved = state.progress.find((progress) => progress.seedId === puzzle.id)
  if (saved && saved.seedRevision > puzzle.seedRevision) {
    throw new Error('Tactics progress cannot overwrite a newer seed revision.')
  }
  const prior = saved?.seedRevision === puzzle.seedRevision ? saved : null
  if (prior && attemptedAt < prior.updatedAt) {
    throw new Error('Tactics attempt cannot predate current progress.')
  }

  const correctStreak = input.outcome === 'solved'
    ? Math.min(TACTIC_SCHEDULE_DAYS.length, (prior?.correctStreak ?? 0) + 1)
    : 0
  const successor: TacticsProgress = {
    schemaVersion: TACTICS_PERSISTENCE_SCHEMA_VERSION,
    seedId: puzzle.id,
    seedRevision: puzzle.seedRevision,
    dueAt: expectedDueAt(attemptedAt, correctStreak),
    status: statusForStreak(correctStreak),
    attemptCount: (prior?.attemptCount ?? 0) + 1,
    solveCount: (prior?.solveCount ?? 0) + (input.outcome === 'solved' ? 1 : 0),
    correctStreak,
    lastAttemptAt: attemptedAt,
    lastOutcome: input.outcome,
    bestSolveMs: input.outcome === 'solved'
      ? Math.min(prior?.bestSolveMs ?? input.elapsedMs, input.elapsedMs)
      : prior?.bestSolveMs ?? null,
    createdAt: prior?.createdAt ?? attemptedAt,
    updatedAt: attemptedAt,
  }
  assertTacticsProgress(successor)
  const next = mergeTacticsState(state, { progress: [successor], attempts: [attempt] })
  return { state: next, progress: successor, attempt }
}

/**
 * Reads the browser mirror without parsing it. Deferred tactics hydration can
 * hand this opaque snapshot to a Worker, while synchronous callers retain the
 * exact same fail-closed loader below.
 */
export function readBrowserTacticsStateRaw(storage?: TacticsStorage): string | null {
  try {
    return readBrowserTacticsStateRawStrict(storage)
  } catch {
    return null
  }
}

/**
 * Strict raw reader for the deferred Train surface. The synchronous loader
 * remains fail-closed, while this path deliberately exposes blocked storage
 * so Train can show a recoverable history error instead of a false fresh run.
 */
export function readBrowserTacticsStateRawStrict(storage?: TacticsStorage): string | null {
  const target = browserStorage(storage)
  if (!target) return null
  return target.getItem(TACTICS_STORAGE_KEY)
}

/**
 * Validates one raw browser mirror without reading storage. Keeping this
 * boundary pure lets the Worker and synchronous loader share byte-bounded,
 * fail-closed semantics exactly.
 */
export function parseBrowserTacticsStateRaw(raw: string | null): TacticsState {
  try {
    if (raw === null || byteLength(raw) > MAX_TACTICS_STATE_BYTES) return createTacticsState()
    const parsed: unknown = JSON.parse(raw)
    return isTacticsState(parsed) ? mergeTacticsState(parsed) : createTacticsState()
  } catch {
    return createTacticsState()
  }
}

/** Loads the one browser mirror key, failing closed to an empty local state. */
export function loadBrowserTacticsState(storage?: TacticsStorage): TacticsState {
  return parseBrowserTacticsStateRaw(readBrowserTacticsStateRaw(storage))
}

/** Writes the complete mirror in one localStorage operation. */
export function saveBrowserTacticsState(state: TacticsState, storage?: TacticsStorage): void {
  assertTacticsState(state)
  const target = browserStorage(storage)
  if (!target) throw new Error('Local tactics storage is unavailable.')
  const normalized = mergeTacticsState(state)
  const serialized = JSON.stringify(normalized)
  if (byteLength(serialized) > MAX_TACTICS_STATE_BYTES) {
    throw new Error('Local tactics storage exceeds its safe size limit.')
  }
  target.setItem(TACTICS_STORAGE_KEY, serialized)
}

/** Merges one incoming snapshot into the one local browser mirror atomically. */
export function mergeBrowserTacticsState(incoming: TacticsState, storage?: TacticsStorage): TacticsState {
  const merged = mergeTacticsState(loadBrowserTacticsState(storage), incoming)
  saveBrowserTacticsState(merged, storage)
  return merged
}

/**
 * Projects durable native/browser records into the smaller existing queue
 * shape consumed by `dueTactics` and `TacticsSprint`. Stale seed revisions are
 * deliberately omitted, making a revised authored position due as new.
 */
export function tacticsStateToTacticProgress(
  state: TacticsState,
  puzzles: readonly TacticPuzzle[],
): TacticProgress {
  assertTacticsState(state)
  const seeds = new Map<TacticId, TacticPuzzle>()
  for (const puzzle of puzzles) {
    assertTacticPuzzle(puzzle)
    if (seeds.has(puzzle.id)) throw new Error('Tactic progress adapter received duplicate seeds.')
    seeds.set(puzzle.id, puzzle)
  }
  const records: TacticProgressRecord[] = []
  for (const progress of state.progress) {
    const puzzle = seeds.get(progress.seedId)
    if (!puzzle || puzzle.seedRevision !== progress.seedRevision || progress.attemptCount === 0 || !progress.lastAttemptAt) continue
    records.push({
      puzzleId: progress.seedId,
      attemptCount: progress.attemptCount,
      correctStreak: progress.correctStreak,
      status: progress.status,
      dueAt: progress.dueAt,
      lastAttemptAt: progress.lastAttemptAt,
    })
  }
  const adapted: TacticProgress = {
    schemaVersion: TACTIC_PROGRESS_SCHEMA_VERSION,
    records: records.sort(compareTacticProgressRecords),
  }
  assertTacticProgress(adapted)
  return adapted
}

export const toTacticProgress = tacticsStateToTacticProgress
