import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js'
import { cloneGame, STANDARD_START_FEN, type MoveInput } from './chess'

export interface QueuedPremove extends MoveInput {
  /** The opponent-to-move position for which this premove was queued. */
  baseFen: string
}

const promotionPieces = new Set<PieceSymbol>(['q', 'r', 'b', 'n'])
const files = 'abcdefgh'

function squareCoordinates(square: Square): { file: number; rank: number } {
  return { file: files.indexOf(square[0]), rank: Number(square[1]) }
}

function isPromotionRank(square: Square, color: Color): boolean {
  return square[1] === (color === 'w' ? '8' : '1')
}

/**
 * Returns whether a pawn arriving on this destination needs a promotion choice.
 * It deliberately does not decide whether the route is legal after the bot move.
 */
export function premoveNeedsPromotion(game: Chess, humanColor: Color, from: Square, to: Square): boolean {
  const piece = game.get(from)
  return piece?.color === humanColor && piece.type === 'p' && isPromotionRank(to, humanColor)
}

/**
 * Performs a deliberately permissive, non-authoritative premove preview check.
 *
 * The opponent's pending move can open a line, vacate a target, create an
 * en-passant capture, or remove a check. Therefore this only rejects moves that
 * cannot possibly be a move by the human piece. `tryApplyPremove` remains the
 * final rules authority after the opponent's actual move.
 */
export function canQueuePremove(game: Chess, humanColor: Color, move: MoveInput): boolean {
  if (move.from === move.to) return false
  const piece = game.get(move.from)
  const target = game.get(move.to)
  if (!piece || piece.color !== humanColor || target?.color === humanColor) return false

  if (piece.type !== 'p' && move.promotion !== undefined) return false

  const { file: fromFile, rank: fromRank } = squareCoordinates(move.from)
  const { file: toFile, rank: toRank } = squareCoordinates(move.to)
  const fileDelta = Math.abs(toFile - fromFile)
  const rankDelta = Math.abs(toRank - fromRank)

  if (piece.type === 'p') {
    const direction = humanColor === 'w' ? 1 : -1
    const forwardDelta = (toRank - fromRank) * direction
    const reachesPromotion = isPromotionRank(move.to, humanColor)
    if (reachesPromotion !== (move.promotion !== undefined)) return false
    if (move.promotion !== undefined && !promotionPieces.has(move.promotion)) return false

    if (fileDelta === 0) {
      if (forwardDelta === 1) return true
      return forwardDelta === 2 && fromRank === (humanColor === 'w' ? 2 : 7)
    }
    return fileDelta === 1 && forwardDelta === 1
  }

  if (piece.type === 'n') return (fileDelta === 1 && rankDelta === 2) || (fileDelta === 2 && rankDelta === 1)
  if (piece.type === 'b') return fileDelta === rankDelta && fileDelta > 0
  if (piece.type === 'r') return (fileDelta === 0) !== (rankDelta === 0)
  if (piece.type === 'q') return fileDelta === rankDelta || (fileDelta === 0) !== (rankDelta === 0)
  return (fileDelta <= 1 && rankDelta <= 1) || (rankDelta === 0 && fileDelta === 2)
}

/**
 * Lists the deliberately conditional destinations a human piece can preview
 * while the bot is thinking. This uses the same permissive shape check as
 * queueing: a pending bot reply can open a line, make an en-passant capture
 * possible, or otherwise change final legality. Promotion destinations use a
 * queen only for this preview; the UI still asks the player to choose a piece
 * before it queues the move.
 */
export function queueablePremoveTargets(game: Chess, humanColor: Color, from: Square): Square[] {
  const targets: Square[] = []

  for (const rank of '12345678') {
    for (const file of files) {
      const to = `${file}${rank}` as Square
      const move: MoveInput = premoveNeedsPromotion(game, humanColor, from, to)
        ? { from, to, promotion: 'q' }
        : { from, to }
      if (canQueuePremove(game, humanColor, move)) targets.push(to)
    }
  }

  return targets
}

export function queuePremove(game: Chess, humanColor: Color, move: MoveInput): QueuedPremove | null {
  if (!canQueuePremove(game, humanColor, move)) return null
  return { ...move, baseFen: game.fen() }
}

/**
 * Applies a queued premove only after the opponent's move has produced the
 * actual position. This clones the game and lets chess.js reject any route,
 * pin, check, capture or promotion that is no longer legal.
 */
export function tryApplyPremove(game: Chess, humanColor: Color, move: MoveInput): Chess | null {
  if (game.turn() !== humanColor) return null
  // Do not clone only the FEN here. A premove becomes part of the real game,
  // so its returned instance must retain prior PGN, repetition and undo
  // history. chess.js includes FEN in headers for non-standard starts.
  const next = cloneGame(game, game.getHeaders().FEN ?? STANDARD_START_FEN)
  return applyPremoveToOwnedGame(next, humanColor, move) ? next : null
}

/**
 * Applies a queued premove directly only when the caller exclusively owns the
 * supplied game instance. Play uses this after it has already made its bot
 * reply copy, avoiding a second full-history clone on the same turn.
 */
export function applyPremoveToOwnedGame(game: Chess, humanColor: Color, move: MoveInput): Move | null {
  if (game.turn() !== humanColor) return null
  try {
    return game.move(move)
  } catch {
    return null
  }
}
