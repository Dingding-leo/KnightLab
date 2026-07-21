import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js'

export type GameMode = 'local' | 'bot'
export type BotLevel = 'easy' | 'balanced' | 'strong'

export interface MoveInput {
  from: Square
  to: Square
  promotion?: PieceSymbol
}

export const STANDARD_START_FEN = new Chess().fen()

const pieceValues: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
}

export function cloneGame(game: Chess, startFen = STANDARD_START_FEN): Chess {
  const clone = new Chess(startFen)
  for (const move of game.history({ verbose: true })) {
    clone.move({ from: move.from, to: move.to, promotion: move.promotion })
  }
  return clone
}

export function evaluateMaterial(game: Chess, perspective: Color = 'w'): number {
  let score = 0
  for (const rank of game.board()) {
    for (const piece of rank) {
      if (!piece) continue
      const value = pieceValues[piece.type]
      score += piece.color === perspective ? value : -value
    }
  }
  return score
}

export function gameResult(game: Chess): string {
  if (game.isCheckmate()) return game.turn() === 'w' ? '0-1' : '1-0'
  if (game.isDraw()) return '1/2-1/2'
  return '*'
}

export function gameStatus(game: Chess): string {
  if (game.isCheckmate()) {
    return `Checkmate — ${game.turn() === 'w' ? 'Black' : 'White'} wins`
  }
  if (game.isStalemate()) return 'Draw by stalemate'
  if (game.isThreefoldRepetition()) return 'Draw by threefold repetition'
  if (game.isInsufficientMaterial()) return 'Draw by insufficient material'
  if (game.isDrawByFiftyMoves()) return 'Draw by fifty-move rule'
  if (game.isDraw()) return 'Draw'
  if (game.inCheck()) return `${game.turn() === 'w' ? 'White' : 'Black'} to move — check`
  return `${game.turn() === 'w' ? 'White' : 'Black'} to move`
}

export function legalMovesFrom(game: Chess, square: Square): Move[] {
  return game.moves({ square, verbose: true })
}

export function moveToInput(move: Move): MoveInput {
  return { from: move.from, to: move.to, promotion: move.promotion }
}

export function formatEvaluation(score: number): string {
  const pawns = score / 100
  if (Math.abs(pawns) < 0.05) return '0.0'
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`
}
