import { Chess, type Color, type Square } from 'chess.js'
import type { RetryItem, RetryMoveInput } from './retry'

type PromotionPiece = 'q' | 'r' | 'b' | 'n'

export interface RetryLineMove {
  index: number
  color: Color
  moveNumber: number
  san: string
  uci: string
  from: Square
  to: Square
  promotion?: PromotionPiece
}

export interface RetryLine {
  /** An explicitly empty legacy PV safely uses its verified first move. */
  mode: 'single-move' | 'continuation'
  preFen: string
  playerColor: Color
  moves: readonly RetryLineMove[]
}

export interface RetryLinePosition {
  fen: string
  completedPlies: number
  complete: boolean
  next: RetryLineMove | null
  lastMove: RetryLineMove | null
}

export type RetryLineAttempt =
  | { outcome: 'illegal'; position: RetryLinePosition | null }
  | { outcome: 'not-recorded'; position: RetryLinePosition; expected: RetryLineMove }
  | {
    outcome: 'advanced'
    position: RetryLinePosition
    played: RetryLineMove
    autoReply: RetryLineMove | null
  }

const UCI_PATTERN = /^[a-h][1-8][a-h][1-8][qrbn]?$/
const SQUARE_PATTERN = /^[a-h][1-8]$/

function appliedUci(move: { from: Square; to: Square; promotion?: string }): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`
}

function promotionPiece(value: string | undefined): PromotionPiece | undefined {
  return value === 'q' || value === 'r' || value === 'b' || value === 'n' ? value : undefined
}

function moveInput(value: string): RetryMoveInput | null {
  if (!UCI_PATTERN.test(value)) return null
  return {
    from: value.slice(0, 2) as Square,
    to: value.slice(2, 4) as Square,
    promotion: promotionPiece(value[4]),
  }
}

function candidateInput(value: RetryMoveInput): RetryMoveInput | null {
  if (!value
    || !SQUARE_PATTERN.test(value.from)
    || !SQUARE_PATTERN.test(value.to)
    || !(value.promotion === undefined || promotionPiece(value.promotion))) return null
  return {
    from: value.from,
    to: value.to,
    promotion: value.promotion,
  }
}

function applyMove(game: Chess, input: RetryMoveInput | string) {
  try {
    return game.move(input)
  } catch {
    return null
  }
}

function toLineMove(
  index: number,
  color: Color,
  moveNumber: number,
  move: { san: string; from: Square; to: Square; promotion?: string },
): RetryLineMove {
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

function firstRecordedMove(item: RetryItem): RetryLine | null {
  const input = moveInput(item.solutionUci)
  if (!input) return null

  try {
    const game = new Chess(item.preFen)
    const color = game.turn()
    if (game.isGameOver() || color !== item.sideToMove) return null
    const moveNumber = Number(game.fen().split(/\s+/)[5])
    const applied = applyMove(game, input)
    if (!applied || appliedUci(applied) !== item.solutionUci || applied.san !== item.solutionSan) return null
    return {
      mode: 'single-move',
      preFen: item.preFen,
      playerColor: color,
      moves: [toLineMove(0, color, moveNumber, applied)],
    }
  } catch {
    return null
  }
}

/**
 * Reconstructs the stored review PV with chess.js before exposing it to the
 * trainer. An explicitly empty legacy line safely uses its already-validated
 * first move; a non-empty line must replay completely or is rejected.
 */
export function createRetryLine(item: RetryItem): RetryLine | null {
  const fallback = firstRecordedMove(item)
  if (!fallback) return null
  const source = item.solutionLineSan
  if (!Array.isArray(source)) return null
  if (source.length === 0) return fallback
  if (source.length > 6) return null

  try {
    const game = new Chess(item.preFen)
    const moves: RetryLineMove[] = []
    for (const [index, san] of source.entries()) {
      if (typeof san !== 'string' || !san.trim()) return null
      const color = game.turn()
      const moveNumber = Number(game.fen().split(/\s+/)[5])
      const applied = applyMove(game, san)
      if (!applied) return null
      moves.push(toLineMove(index, color, moveNumber, applied))
    }
    if (moves[0]?.uci !== item.solutionUci || moves[0]?.san !== item.solutionSan) return null
    return {
      mode: moves.length > 1 ? 'continuation' : 'single-move',
      preFen: item.preFen,
      playerColor: item.sideToMove,
      moves,
    }
  } catch {
    return null
  }
}

/** Replays only an already-reconstructed line and returns a safe board state. */
export function retryLinePosition(line: RetryLine, completedPlies: number): RetryLinePosition | null {
  if (!Number.isInteger(completedPlies) || completedPlies < 0 || completedPlies > line.moves.length) return null
  try {
    const game = new Chess(line.preFen)
    if (game.turn() !== line.playerColor) return null
    for (const move of line.moves.slice(0, completedPlies)) {
      if (game.turn() !== move.color) return null
      const applied = applyMove(game, {
        from: move.from,
        to: move.to,
        promotion: move.promotion,
      })
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
 * Accepts exactly one player move, then automatically applies the saved
 * opponent reply if the line contains one. No engine is consulted here.
 */
export function attemptRetryLineMove(
  line: RetryLine,
  completedPlies: number,
  candidate: RetryMoveInput,
): RetryLineAttempt {
  const position = retryLinePosition(line, completedPlies)
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
  let autoReply: RetryLineMove | null = null
  const reply = line.moves[nextCompleted] ?? null
  if (reply) {
    if (reply.color === line.playerColor || reply.color !== game.turn()) return { outcome: 'illegal', position }
    const replayed = applyMove(game, {
      from: reply.from,
      to: reply.to,
      promotion: reply.promotion,
    })
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

export function retryLinePlayerMoveCount(line: RetryLine): number {
  return line.moves.filter((move) => move.color === line.playerColor).length
}
