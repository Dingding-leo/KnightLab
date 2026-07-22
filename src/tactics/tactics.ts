import { Chess, type Color, type Square } from 'chess.js'

export const TACTIC_SCHEMA_VERSION = 1 as const
export const TACTIC_PROGRESS_SCHEMA_VERSION = 1 as const
export const INITIAL_TACTIC_SEED_REVISION = 1 as const
export const MAX_TACTIC_LINE_PLIES = 6
export const MAX_TACTIC_PROGRESS_RECORDS = 500
export const TACTIC_SCHEDULE_DAYS = [1, 3, 7, 14, 30] as const

const MAX_FEN_BYTES = 1_024
const MAX_ID_BYTES = 64
const MAX_TITLE_BYTES = 128
const MAX_SAN_BYTES = 64
const MAX_TIMESTAMP_BYTES = 64
const MAX_ATTEMPTS = 1_000_000
const MAX_SEED_REVISION = 1_000_000
const UCI_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/
const SQUARE_PATTERN = /^[a-h][1-8]$/
const TACTIC_ID_PATTERN = /^seed-v1:[a-z0-9-]{1,55}$/
const TACTIC_THEMES = new Set<TacticTheme>([
  'mate-in-one',
  'fork',
  'hanging-queen',
  'promotion',
])

export type TacticId = `seed-v1:${string}`
export type TacticTheme = 'mate-in-one' | 'fork' | 'hanging-queen' | 'promotion'
export type TacticSolutionMode = 'unique'
export type TacticProgressStatus = 'active' | 'mastered'
export type TacticAttemptOutcome = 'solved' | 'failed' | 'assisted'

export interface TacticSource {
  kind: 'knightclub-original'
  version: '2026-07'
}

/** A static curation record; it is not trusted instead of board replay. */
export interface TacticEngineProof {
  engine: 'Stockfish 18'
  depth: number
  multiPv: number
  bestMove: string
  scoreGapCp: number | null
  mateIn: number | null
}

export interface TacticPuzzle {
  schemaVersion: typeof TACTIC_SCHEMA_VERSION
  id: TacticId
  /** Bumps when an authored position or its verified answer materially changes. */
  seedRevision: number
  source: TacticSource
  title: string
  fen: string
  sideToMove: Color
  themes: readonly TacticTheme[]
  difficulty: number
  solutionMode: TacticSolutionMode
  solutionUci: readonly string[]
  solutionSan: readonly string[]
  engineProof: TacticEngineProof
}

export interface TacticMoveInput {
  from: Square
  to: Square
  /** Board adapters may pass any piece symbol; q/r/b/n are the only legal values. */
  promotion?: string
}

export interface TacticLineMove {
  index: number
  color: Color
  moveNumber: number
  san: string
  uci: string
  from: Square
  to: Square
  promotion?: 'q' | 'r' | 'b' | 'n'
}

export interface TacticLine {
  puzzleId: TacticId
  preFen: string
  playerColor: Color
  moves: readonly TacticLineMove[]
}

export interface TacticLinePosition {
  fen: string
  completedPlies: number
  complete: boolean
  next: TacticLineMove | null
  lastMove: TacticLineMove | null
}

export type TacticLineAttempt =
  | { outcome: 'illegal'; position: TacticLinePosition | null }
  | { outcome: 'not-recorded'; position: TacticLinePosition; expected: TacticLineMove }
  | {
    outcome: 'advanced'
    position: TacticLinePosition
    played: TacticLineMove
    autoReply: TacticLineMove | null
  }

export interface TacticProgressRecord {
  puzzleId: TacticId
  attemptCount: number
  correctStreak: number
  status: TacticProgressStatus
  dueAt: string
  lastAttemptAt: string
}

export interface TacticProgress {
  schemaVersion: typeof TACTIC_PROGRESS_SCHEMA_VERSION
  records: readonly TacticProgressRecord[]
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
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

function promotionPiece(value: string | undefined): TacticLineMove['promotion'] {
  return value === 'q' || value === 'r' || value === 'b' || value === 'n' ? value : undefined
}

function appliedUci(move: { from: Square; to: Square; promotion?: string }): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`
}

function parseUci(value: unknown): TacticMoveInput | null {
  if (typeof value !== 'string' || !UCI_PATTERN.test(value)) return null
  return {
    from: value.slice(0, 2) as Square,
    to: value.slice(2, 4) as Square,
    promotion: promotionPiece(value[4]),
  }
}

function candidateInput(value: TacticMoveInput): TacticMoveInput | null {
  if (!value
    || !SQUARE_PATTERN.test(value.from)
    || !SQUARE_PATTERN.test(value.to)
    || !(value.promotion === undefined || promotionPiece(value.promotion))) return null
  return { from: value.from, to: value.to, promotion: value.promotion }
}

function applyMove(game: Chess, input: TacticMoveInput) {
  try {
    return game.move(input)
  } catch {
    return null
  }
}

function timestamp(value: unknown): number | null {
  if (!isBoundedString(value, 1, MAX_TIMESTAMP_BYTES)) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
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

function toLineMove(
  index: number,
  color: Color,
  moveNumber: number,
  move: { san: string; from: Square; to: Square; promotion?: string },
): TacticLineMove {
  return {
    index,
    color,
    moveNumber,
    san: move.san,
    uci: appliedUci(move),
    from: move.from,
    to: move.to,
    promotion: promotionPiece(move.promotion),
  }
}

function validateEngineProof(value: unknown, firstMove: string): value is TacticEngineProof {
  if (!isObject(value)
    || value.engine !== 'Stockfish 18'
    || !isBoundedInteger(value.depth, 1, 40)
    || !isBoundedInteger(value.multiPv, 1, 5)
    || typeof value.bestMove !== 'string'
    || !UCI_PATTERN.test(value.bestMove)
    || value.bestMove !== firstMove
    || !(value.scoreGapCp === null || isBoundedInteger(value.scoreGapCp, 1, 1_000_000))
    || !(value.mateIn === null || isBoundedInteger(value.mateIn, 1, 100))) return false
  return true
}

function validateSource(value: unknown): value is TacticSource {
  return isObject(value) && value.kind === 'knightclub-original' && value.version === '2026-07'
}

/**
 * Verifies every durable fact that is required to show a seed to a player.
 * It intentionally proves board legality and exact replay locally; Stockfish
 * uniqueness/gap evidence remains the explicit curation record on the seed.
 */
export function assertTacticPuzzle(value: unknown): asserts value is TacticPuzzle {
  if (!isObject(value)
    || value.schemaVersion !== TACTIC_SCHEMA_VERSION
    || !isBoundedString(value.id, 9, MAX_ID_BYTES)
    || !TACTIC_ID_PATTERN.test(value.id)
    || !isBoundedInteger(value.seedRevision, INITIAL_TACTIC_SEED_REVISION, MAX_SEED_REVISION)
    || !validateSource(value.source)
    || !isBoundedString(value.title, 1, MAX_TITLE_BYTES)
    || !isBoundedString(value.fen, 1, MAX_FEN_BYTES)
    || (value.sideToMove !== 'w' && value.sideToMove !== 'b')
    || !Array.isArray(value.themes)
    || value.themes.length < 1
    || value.themes.length > 4
    || !value.themes.every((theme) => TACTIC_THEMES.has(theme as TacticTheme))
    || new Set(value.themes).size !== value.themes.length
    || !isBoundedInteger(value.difficulty, 100, 3_000)
    || value.solutionMode !== 'unique'
    || !Array.isArray(value.solutionUci)
    || !Array.isArray(value.solutionSan)
    || value.solutionUci.length < 1
    || value.solutionUci.length > MAX_TACTIC_LINE_PLIES
    || value.solutionUci.length !== value.solutionSan.length
    || !value.solutionUci.every((move) => isBoundedString(move, 4, 5) && UCI_PATTERN.test(move))
    || !value.solutionSan.every((san) => isBoundedString(san, 1, MAX_SAN_BYTES))
    || !validateEngineProof(value.engineProof, value.solutionUci[0])) {
    throw new Error('Tactic puzzle is invalid or too large.')
  }

  let game: Chess
  try {
    game = new Chess(value.fen)
  } catch {
    throw new Error('Tactic position is invalid.')
  }
  if (game.fen() !== value.fen || game.isGameOver() || game.turn() !== value.sideToMove) {
    throw new Error('Tactic position does not match its side to move.')
  }

  for (const [index, encoded] of value.solutionUci.entries()) {
    const input = parseUci(encoded)
    const applied = input ? applyMove(game, input) : null
    if (!applied || appliedUci(applied) !== encoded || applied.san !== value.solutionSan[index]) {
      throw new Error('Tactic solution line cannot be replayed exactly.')
    }
  }
}

export function isTacticPuzzle(value: unknown): value is TacticPuzzle {
  try {
    assertTacticPuzzle(value)
    return true
  } catch {
    return false
  }
}

/** Reconstructs a seed's exact local PV before exposing it to a training UI. */
export function createTacticLine(puzzle: TacticPuzzle): TacticLine | null {
  if (!isTacticPuzzle(puzzle)) return null
  try {
    const game = new Chess(puzzle.fen)
    const playerColor = game.turn()
    const moves: TacticLineMove[] = []
    for (const [index, encoded] of puzzle.solutionUci.entries()) {
      const input = parseUci(encoded)
      const color = game.turn()
      const moveNumber = Number(game.fen().split(/\s+/)[5])
      const applied = input ? applyMove(game, input) : null
      if (!applied || appliedUci(applied) !== encoded || applied.san !== puzzle.solutionSan[index]) return null
      moves.push(toLineMove(index, color, moveNumber, applied))
    }
    return { puzzleId: puzzle.id, preFen: puzzle.fen, playerColor, moves }
  } catch {
    return null
  }
}

/** Replays only a reconstructed line and returns a safe board position. */
export function tacticLinePosition(line: TacticLine, completedPlies: number): TacticLinePosition | null {
  if (!Number.isInteger(completedPlies) || completedPlies < 0 || completedPlies > line.moves.length) return null
  try {
    const game = new Chess(line.preFen)
    if (game.turn() !== line.playerColor) return null
    for (const move of line.moves.slice(0, completedPlies)) {
      if (game.turn() !== move.color) return null
      const applied = applyMove(game, { from: move.from, to: move.to, promotion: move.promotion })
      if (!applied || appliedUci(applied) !== move.uci || applied.san !== move.san) return null
    }
    const next = line.moves[completedPlies] ?? null
    if (next && next.color !== game.turn()) return null
    return {
      fen: game.fen(),
      completedPlies,
      complete: next === null,
      next,
      lastMove: completedPlies ? line.moves[completedPlies - 1] ?? null : null,
    }
  } catch {
    return null
  }
}

/**
 * Accepts one exact player move and auto-plays only the recorded opposing
 * continuation. A legal alternative remains deliberately unanalysed.
 */
export function attemptTacticLineMove(
  line: TacticLine,
  completedPlies: number,
  candidate: TacticMoveInput,
): TacticLineAttempt {
  const position = tacticLinePosition(line, completedPlies)
  if (!position || !position.next || position.next.color !== line.playerColor) {
    return { outcome: 'illegal', position }
  }
  const input = candidateInput(candidate)
  if (!input) return { outcome: 'illegal', position }

  let game: Chess
  try {
    game = new Chess(position.fen)
  } catch {
    return { outcome: 'illegal', position: null }
  }
  const applied = applyMove(game, input)
  if (!applied) return { outcome: 'illegal', position }
  if (appliedUci(applied) !== position.next.uci) {
    return { outcome: 'not-recorded', position, expected: position.next }
  }

  let nextCompleted = completedPlies + 1
  let autoReply: TacticLineMove | null = null
  const reply = line.moves[nextCompleted] ?? null
  if (reply) {
    if (reply.color === line.playerColor || reply.color !== game.turn()) return { outcome: 'illegal', position }
    const replayed = applyMove(game, { from: reply.from, to: reply.to, promotion: reply.promotion })
    if (!replayed || appliedUci(replayed) !== reply.uci || replayed.san !== reply.san) {
      return { outcome: 'illegal', position }
    }
    autoReply = reply
    nextCompleted += 1
  }

  const next = line.moves[nextCompleted] ?? null
  if (next && next.color !== line.playerColor) return { outcome: 'illegal', position }
  return {
    outcome: 'advanced',
    played: position.next,
    autoReply,
    position: {
      fen: game.fen(),
      completedPlies: nextCompleted,
      complete: next === null,
      next,
      lastMove: autoReply ?? position.next,
    },
  }
}

export function tacticLinePlayerMoveCount(line: TacticLine): number {
  return line.moves.filter((move) => move.color === line.playerColor).length
}

function assertProgressRecord(value: unknown): asserts value is TacticProgressRecord {
  if (!isObject(value)
    || !isBoundedString(value.puzzleId, 9, MAX_ID_BYTES)
    || !TACTIC_ID_PATTERN.test(value.puzzleId)
    || !isBoundedInteger(value.attemptCount, 1, MAX_ATTEMPTS)
    || !isBoundedInteger(value.correctStreak, 0, TACTIC_SCHEDULE_DAYS.length)
    || (value.status !== 'active' && value.status !== 'mastered')
    || !isBoundedString(value.dueAt, 1, MAX_TIMESTAMP_BYTES)
    || !isBoundedString(value.lastAttemptAt, 1, MAX_TIMESTAMP_BYTES)) {
    throw new Error('Tactic progress record is invalid.')
  }
  const dueAt = timestamp(value.dueAt)
  const attemptedAt = timestamp(value.lastAttemptAt)
  if (dueAt === null || attemptedAt === null || value.status !== statusForStreak(value.correctStreak)) {
    throw new Error('Tactic progress schedule is invalid.')
  }
  const expectedDue = value.correctStreak === 0
    ? attemptedAt
    : Date.parse(addDays(value.lastAttemptAt, TACTIC_SCHEDULE_DAYS[value.correctStreak - 1]))
  if (dueAt !== expectedDue) throw new Error('Tactic progress due date does not match its schedule.')
}

export function createTacticProgress(): TacticProgress {
  return { schemaVersion: TACTIC_PROGRESS_SCHEMA_VERSION, records: [] }
}

export function assertTacticProgress(value: unknown): asserts value is TacticProgress {
  if (!isObject(value)
    || value.schemaVersion !== TACTIC_PROGRESS_SCHEMA_VERSION
    || !Array.isArray(value.records)
    || value.records.length > MAX_TACTIC_PROGRESS_RECORDS) {
    throw new Error('Tactic progress is invalid or too large.')
  }
  value.records.forEach(assertProgressRecord)
  const ids = value.records.map((record) => record.puzzleId)
  if (new Set(ids).size !== ids.length) throw new Error('Tactic progress has duplicate puzzle records.')
}

export function isTacticProgress(value: unknown): value is TacticProgress {
  try {
    assertTacticProgress(value)
    return true
  } catch {
    return false
  }
}

export function tacticProgressRecord(progress: TacticProgress, puzzleId: TacticId): TacticProgressRecord | null {
  if (!isTacticProgress(progress) || !TACTIC_ID_PATTERN.test(puzzleId)) return null
  return progress.records.find((record) => record.puzzleId === puzzleId) ?? null
}

export function compareTacticProgressRecords(left: TacticProgressRecord, right: TacticProgressRecord): number {
  const status = (left.status === 'active' ? 0 : 1) - (right.status === 'active' ? 0 : 1)
  if (status) return status
  const due = Date.parse(left.dueAt) - Date.parse(right.dueAt)
  if (due) return due
  return left.puzzleId.localeCompare(right.puzzleId)
}

/**
 * Records one completed tactic outcome. Partial PV progress is intentionally
 * absent from this API: callers schedule only after a complete solve, an
 * explicit failed attempt, or assisted reveal.
 */
export function recordTacticAttempt(
  progress: TacticProgress,
  puzzle: TacticPuzzle,
  outcome: TacticAttemptOutcome,
  at?: Date | string,
): TacticProgress {
  assertTacticProgress(progress)
  assertTacticPuzzle(puzzle)
  if (outcome !== 'solved' && outcome !== 'failed' && outcome !== 'assisted') {
    throw new Error('Tactic attempt outcome is invalid.')
  }
  const attemptedAt = canonicalTimestamp(at, 'Tactic attempt time')
  const existing = tacticProgressRecord(progress, puzzle.id)
  if (existing && Date.parse(attemptedAt) < Date.parse(existing.lastAttemptAt)) {
    throw new Error('Tactic attempt cannot predate its existing record.')
  }
  if (existing?.attemptCount === MAX_ATTEMPTS) throw new Error('Tactic attempt count has reached its limit.')
  if (!existing && progress.records.length >= MAX_TACTIC_PROGRESS_RECORDS) {
    throw new Error('Tactic progress record limit has been reached.')
  }

  const correctStreak = outcome === 'solved'
    ? Math.min(TACTIC_SCHEDULE_DAYS.length, (existing?.correctStreak ?? 0) + 1)
    : 0
  const next: TacticProgressRecord = {
    puzzleId: puzzle.id,
    attemptCount: (existing?.attemptCount ?? 0) + 1,
    correctStreak,
    status: statusForStreak(correctStreak),
    dueAt: correctStreak === 0
      ? attemptedAt
      : addDays(attemptedAt, TACTIC_SCHEDULE_DAYS[correctStreak - 1]),
    lastAttemptAt: attemptedAt,
  }
  assertProgressRecord(next)
  const records = [
    ...progress.records.filter((record) => record.puzzleId !== puzzle.id),
    next,
  ].sort(compareTacticProgressRecords)
  return { schemaVersion: TACTIC_PROGRESS_SCHEMA_VERSION, records }
}

/** Returns first-time and due active puzzles in a deterministic queue order. */
export function dueTactics(
  puzzles: readonly TacticPuzzle[],
  progress: TacticProgress,
  now?: Date | string,
): TacticPuzzle[] {
  assertTacticProgress(progress)
  const nowAt = Date.parse(canonicalTimestamp(now, 'Tactic queue time'))
  const ids = new Set<string>()
  const records = new Map(progress.records.map((record) => [record.puzzleId, record]))
  const queued = puzzles.map((puzzle, index) => {
    assertTacticPuzzle(puzzle)
    if (ids.has(puzzle.id)) throw new Error('Tactic queue has duplicate puzzle identities.')
    ids.add(puzzle.id)
    const record = records.get(puzzle.id)
    return { puzzle, index, record }
  })

  return queued
    .filter(({ record }) => !record || (record.status === 'active' && Date.parse(record.dueAt) <= nowAt))
    .sort((left, right) => {
      const leftDue = left.record ? Date.parse(left.record.dueAt) : Number.NEGATIVE_INFINITY
      const rightDue = right.record ? Date.parse(right.record.dueAt) : Number.NEGATIVE_INFINITY
      if (leftDue !== rightDue) return leftDue - rightDue
      return left.index - right.index
    })
    .map(({ puzzle }) => puzzle)
}
