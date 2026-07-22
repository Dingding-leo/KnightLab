import { Chess, type Color, type Move, type Square } from 'chess.js'
import { evaluateMaterial, type BotLevel, type MoveInput } from '../domain/chess'

const centerSquares = new Set(['d4', 'e4', 'd5', 'e5'])

/**
 * KnightBot is only used after Stockfish fails. Keep that safety net helpful
 * without allowing a pathological position to occupy a CPU core indefinitely.
 */
export const FALLBACK_NODE_BUDGET: Readonly<Record<BotLevel, number>> = {
  easy: 0,
  balanced: 500,
  strong: 900,
}

interface SearchBudget {
  remaining: number
  exhausted: boolean
}

function consumeNode(budget: SearchBudget): boolean {
  if (budget.remaining <= 0) {
    budget.exhausted = true
    return false
  }
  budget.remaining -= 1
  return true
}

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
  budget: SearchBudget,
): number {
  const terminal = terminalScore(game, perspective, ply)
  if (terminal !== null) return terminal
  if (!consumeNode(budget) || depth === 0) return positionalScore(game, perspective)

  const maximizing = game.turn() === perspective
  let best = maximizing ? -Infinity : Infinity

  for (const move of game.moves({ verbose: true })) {
    if (budget.exhausted) break
    game.move(move)
    const score = minimax(game, depth - 1, alpha, beta, perspective, ply + 1, budget)
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
  // This is an outage fallback, not a second full engine. A single tactical
  // reply is enough to keep play legal and responsive until Stockfish returns.
  const depth = 1
  const budget: SearchBudget = { remaining: FALLBACK_NODE_BUDGET[level], exhausted: false }
  const scored: Array<{ move: Move; score: number }> = []
  let rootAlpha = -Infinity

  for (const move of moves) {
    if (budget.exhausted && scored.length) break
    game.move(move)
    const score = minimax(
      game,
      depth,
      level === 'strong' ? rootAlpha : -Infinity,
      Infinity,
      perspective,
      1,
      budget,
    )
    game.undo()

    // Strong play selects the actual best searched move. Carrying its root bound
    // into later candidates lets alpha-beta stop losing branches much earlier.
    if (level === 'strong') rootAlpha = Math.max(rootAlpha, score)
    const noise = level === 'balanced' ? (Math.random() - 0.5) * 80 : 0
    scored.push({ move, score: score + noise })
  }

  scored.sort((a, b) => b.score - a.score)
  return asInput(scored[0].move)
}
