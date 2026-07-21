import { Chess, type Color, type Move, type Square } from 'chess.js'
import { evaluateMaterial, type BotLevel, type MoveInput } from '../domain/chess'

const centerSquares = new Set(['d4', 'e4', 'd5', 'e5'])

function terminalScore(game: Chess, perspective: Color, ply: number): number | null {
  if (game.isCheckmate()) {
    return game.turn() === perspective ? -100_000 + ply : 100_000 - ply
  }
  if (game.isDraw()) return 0
  return null
}

function positionalScore(game: Chess, perspective: Color): number {
  let score = evaluateMaterial(game, perspective)
  const mobility = game.moves().length
  score += game.turn() === perspective ? mobility * 2 : -mobility * 2

  for (const rank of game.board()) {
    for (const piece of rank) {
      if (!piece) continue
      const bonus = centerSquares.has(piece.square) ? 12 : 0
      score += piece.color === perspective ? bonus : -bonus
    }
  }

  if (game.inCheck()) score += game.turn() === perspective ? -35 : 35
  return score
}

function minimax(
  game: Chess,
  depth: number,
  alpha: number,
  beta: number,
  perspective: Color,
  ply: number,
): number {
  const terminal = terminalScore(game, perspective, ply)
  if (terminal !== null) return terminal
  if (depth === 0) return positionalScore(game, perspective)

  const maximizing = game.turn() === perspective
  let best = maximizing ? -Infinity : Infinity

  for (const move of game.moves({ verbose: true })) {
    game.move(move)
    const score = minimax(game, depth - 1, alpha, beta, perspective, ply + 1)
    game.undo()

    if (maximizing) {
      best = Math.max(best, score)
      alpha = Math.max(alpha, best)
    } else {
      best = Math.min(best, score)
      beta = Math.min(beta, best)
    }

    if (beta <= alpha) break
  }

  return best
}

function asInput(move: Move): MoveInput {
  return {
    from: move.from as Square,
    to: move.to as Square,
    promotion: move.promotion,
  }
}

export function chooseBotMove(fen: string, level: BotLevel): MoveInput | null {
  const game = new Chess(fen)
  const moves = game.moves({ verbose: true })
  if (moves.length === 0) return null

  if (level === 'easy') {
    return asInput(moves[Math.floor(Math.random() * moves.length)])
  }

  const perspective = game.turn()
  const depth = level === 'strong' ? 2 : 1
  const scored = moves.map((move) => {
    game.move(move)
    const score = minimax(game, depth, -Infinity, Infinity, perspective, 1)
    game.undo()
    const noise = level === 'balanced' ? (Math.random() - 0.5) * 80 : (Math.random() - 0.5) * 12
    return { move, score: score + noise }
  })

  scored.sort((a, b) => b.score - a.score)
  return asInput(scored[0].move)
}
