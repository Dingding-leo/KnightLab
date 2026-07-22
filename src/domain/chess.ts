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

export function recordedGameResult(game: Chess): string {
  const boardResult = gameResult(game)
  if (boardResult !== '*') return boardResult
  const headerResult = game.getHeaders().Result
  return ['1-0', '0-1', '1/2-1/2'].includes(headerResult ?? '') ? headerResult : '*'
}

export function completedPgn(game: Chess, startFen: string, result: string, termination: string): string {
  const completed = cloneGame(game, startFen)
  if (startFen !== STANDARD_START_FEN) {
    completed.setHeader('SetUp', '1')
    completed.setHeader('FEN', startFen)
  }
  completed.setHeader('Result', result)
  completed.setHeader('Termination', termination)
  return completed.pgn()
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

export function timeoutResult(loser: Color, opponentHasMatingMaterial: boolean): string {
  if (!opponentHasMatingMaterial) return '1/2-1/2'
  return loser === 'w' ? '0-1' : '1-0'
}

export function hasMatingMaterial(game: Chess, color: Color): boolean {
  const pieces = game.board().flat().filter((piece) => piece?.color === color && piece.type !== 'k')
  if (pieces.some((piece) => piece && ['p', 'r', 'q'].includes(piece.type))) return true
  const bishops = pieces.filter((piece) => piece?.type === 'b').length
  const knights = pieces.filter((piece) => piece?.type === 'n').length
  return bishops >= 2 || (bishops >= 1 && knights >= 1) || knights >= 3
}
