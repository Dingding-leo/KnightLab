import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import { uciPvToSan, type AnalysisScore } from '../analysis/analysisModel'
import type { AnalysisLine } from '../analysis/stockfishAnalysisClient'

export type MoveClassification =
  | 'brilliant'
  | 'great'
  | 'best'
  | 'excellent'
  | 'good'
  | 'book'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder'
  | 'forced'

export type GamePhase = 'opening' | 'middlegame' | 'endgame'

export interface ReviewMoveInput {
  ply: number
  moveNumber: number
  color: Color
  san: string
  from: Square
  to: Square
  promotion?: string
  preFen: string
  postFen: string
  beforeLines: AnalysisLine[]
  afterLine: AnalysisLine | null
}

export interface ReviewedMove {
  ply: number
  moveNumber: number
  color: Color
  san: string
  from: Square
  to: Square
  classification: MoveClassification
  accuracy: number
  centipawnLoss: number
  expectedLoss: number
  bestMoveUci: string | null
  bestMoveSan: string | null
  isBestMove: boolean
  phase: GamePhase
  bestScore: AnalysisScore
  playedScore: AnalysisScore
  bestLineSan: string[]
  depth: number
  confidence: 'normal' | 'limited'
  feedback: string
}

export interface GameReviewSummary {
  accuracy: number
  whiteAccuracy: number | null
  blackAccuracy: number | null
  averageCentipawnLoss: number
  bestMoveRate: number
  classifications: Record<MoveClassification, number>
  phaseAccuracy: Record<GamePhase, number | null>
  turningPoints: ReviewedMove[]
}

const classificationOrder: MoveClassification[] = [
  'brilliant', 'great', 'best', 'excellent', 'good', 'book',
  'inaccuracy', 'mistake', 'miss', 'blunder', 'forced',
]

const pieceNames: Record<PieceSymbol, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
}

function invertScore(score: AnalysisScore): AnalysisScore {
  return {
    ...score,
    value: -score.value,
    bound: score.bound === 'lower' ? 'upper' : score.bound === 'upper' ? 'lower' : null,
  }
}

function terminalScoreForMover(postFen: string): AnalysisScore {
  const game = new Chess(postFen)
  if (game.isCheckmate()) return { kind: 'mate', value: 1, bound: null }
  return { kind: 'cp', value: 0, bound: null }
}

/** Expected game score in [0, 1], using a smooth local model rather than raw CP thresholds. */
export function expectedScore(score: AnalysisScore): number {
  if (score.kind === 'mate') return score.value > 0 ? 1 : score.value < 0 ? 0 : 0.5
  const bounded = Math.max(-2_000, Math.min(2_000, score.value))
  return 1 / (1 + Math.exp(-bounded / 240))
}

function cpEquivalent(score: AnalysisScore): number {
  if (score.kind === 'mate') return Math.sign(score.value) * 1_000
  return score.value
}

function moveAccuracy(expectedLoss: number): number {
  if (expectedLoss <= 0.001) return 100
  return Math.round(100 * Math.exp(-3.5 * Math.pow(expectedLoss, 0.72)))
}

function gamePhase(fen: string, ply: number): GamePhase {
  const game = new Chess(fen)
  const nonPawnValue = game.board().flat().reduce((total, piece) => {
    if (!piece || piece.type === 'p' || piece.type === 'k') return total
    return total + ({ n: 3, b: 3, r: 5, q: 9 }[piece.type] ?? 0)
  }, 0)
  if (nonPawnValue <= 20) return 'endgame'
  return ply <= 20 ? 'opening' : 'middlegame'
}

function actualUci(input: ReviewMoveInput): string {
  return `${input.from}${input.to}${input.promotion ?? ''}`
}

function safeSan(fen: string, pv: string[]): string[] {
  try {
    return uciPvToSan(fen, pv)
  } catch {
    return []
  }
}

function classify(
  input: ReviewMoveInput,
  bestScore: AnalysisScore,
  playedScore: AnalysisScore,
  isBestMove: boolean,
  expectedLoss: number,
  candidateGap: number,
): MoveClassification {
  const legalMoves = new Chess(input.preFen).moves().length
  if (legalMoves === 1) return 'forced'

  const missedMate = bestScore.kind === 'mate' && bestScore.value > 0
    && !(playedScore.kind === 'mate' && playedScore.value > 0)
  if (missedMate) return 'miss'

  const decisiveReversal = expectedScore(bestScore) >= 0.7 && expectedScore(playedScore) <= 0.3
  const concededMate = playedScore.kind === 'mate' && playedScore.value < 0
  if (decisiveReversal || concededMate || expectedLoss >= 0.3) return 'blunder'
  if (expectedLoss >= 0.15) return 'mistake'
  if (expectedLoss >= 0.06) return 'inaccuracy'
  if (isBestMove && candidateGap >= 0.12) return 'great'
  if (isBestMove) return 'best'
  if (expectedLoss <= 0.015) return 'excellent'
  return 'good'
}

function hangingPieceSentence(input: ReviewMoveInput): string | null {
  const game = new Chess(input.postFen)
  const movedPiece = game.get(input.to)
  if (!movedPiece || movedPiece.type === 'p' || movedPiece.type === 'k') return null
  const opponent = game.turn()
  const mover = opponent === 'w' ? 'b' : 'w'
  const attackers = game.attackers(input.to, opponent)
  const defenders = game.attackers(input.to, mover)
  if (!attackers.length || defenders.length) return null
  return `The ${pieceNames[movedPiece.type]} on ${input.to} is attacked and has no supporting defender.`
}

function explanation(
  input: ReviewMoveInput,
  classification: MoveClassification,
  bestMoveSan: string | null,
  bestLineSan: string[],
  expectedLoss: number,
): string {
  const line = bestLineSan.length ? ` A stronger continuation is ${bestLineSan.slice(0, 6).join(' ')}.` : ''
  if (classification === 'forced') return `${input.san} was forced; it was the only legal move.${line}`
  if (classification === 'miss') return `${input.san} missed a forced mate. ${bestMoveSan ?? 'The engine line'} keeps the mating sequence.${line}`
  if (classification === 'best' || classification === 'great') {
    return `${input.san} matches Stockfish's first choice${classification === 'great' ? ' and was clearly stronger than the alternatives' : ''}.${line}`
  }
  const loss = `${Math.round(expectedLoss * 100)} expected-score points`
  const better = bestMoveSan ? ` ${bestMoveSan} was stronger.` : ''
  const hanging = hangingPieceSentence(input)
  return `${input.san} gave up about ${loss}.${better}${hanging ? ` ${hanging}` : ''}${line}`
}

export function classifyReviewedMove(input: ReviewMoveInput): ReviewedMove {
  const bestLine = input.beforeLines[0]
  if (!bestLine) throw new Error(`Review analysis returned no candidate for ply ${input.ply}.`)
  const bestScore = bestLine.score
  const playedScore = input.afterLine ? invertScore(input.afterLine.score) : terminalScoreForMover(input.postFen)
  const bestExpectation = expectedScore(bestScore)
  const playedExpectation = expectedScore(playedScore)
  const secondExpectation = input.beforeLines[1] ? expectedScore(input.beforeLines[1].score) : bestExpectation
  const candidateGap = Math.max(0, bestExpectation - secondExpectation)
  const bestMoveUci = bestLine.pv[0] ?? null
  const isBestMove = bestMoveUci === actualUci(input)
  // The after-position search is independent and can drift a few centipawns.
  // A move that exactly matches PV1 must not be penalized for that search noise.
  const loss = isBestMove ? 0 : Math.max(0, bestExpectation - playedExpectation)
  const bestLineSan = safeSan(input.preFen, bestLine.pv)
  const bestMoveSan = bestLineSan[0] ?? bestMoveUci
  const classification = classify(input, bestScore, playedScore, isBestMove, loss, candidateGap)
  const rawCpLoss = isBestMove ? 0 : Math.max(0, cpEquivalent(bestScore) - cpEquivalent(playedScore))
  const centipawnLoss = Math.min(1_000, Math.round(rawCpLoss))
  const confidence = bestLine.score.bound || input.afterLine?.score.bound || bestLine.depth < 12 ? 'limited' : 'normal'

  return {
    ply: input.ply,
    moveNumber: input.moveNumber,
    color: input.color,
    san: input.san,
    from: input.from,
    to: input.to,
    classification,
    accuracy: moveAccuracy(loss),
    centipawnLoss,
    expectedLoss: loss,
    bestMoveUci,
    bestMoveSan,
    isBestMove,
    phase: gamePhase(input.preFen, input.ply),
    bestScore,
    playedScore,
    bestLineSan,
    depth: bestLine.depth,
    confidence,
    feedback: explanation(input, classification, bestMoveSan, bestLineSan, loss),
  }
}

function average(values: number[]): number | null {
  if (!values.length) return null
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}

export function summarizeGameReview(moves: ReviewedMove[]): GameReviewSummary {
  if (!moves.length) throw new Error('A game review requires at least one move.')
  const classifications = Object.fromEntries(classificationOrder.map((key) => [key, 0])) as Record<MoveClassification, number>
  for (const move of moves) classifications[move.classification] += 1
  return {
    accuracy: average(moves.map((move) => move.accuracy)) ?? 0,
    whiteAccuracy: average(moves.filter((move) => move.color === 'w').map((move) => move.accuracy)),
    blackAccuracy: average(moves.filter((move) => move.color === 'b').map((move) => move.accuracy)),
    averageCentipawnLoss: average(moves.map((move) => move.centipawnLoss)) ?? 0,
    bestMoveRate: Math.round(100 * moves.filter((move) => move.isBestMove).length / moves.length),
    classifications,
    phaseAccuracy: {
      opening: average(moves.filter((move) => move.phase === 'opening').map((move) => move.accuracy)),
      middlegame: average(moves.filter((move) => move.phase === 'middlegame').map((move) => move.accuracy)),
      endgame: average(moves.filter((move) => move.phase === 'endgame').map((move) => move.accuracy)),
    },
    turningPoints: moves
      .filter((move) => move.expectedLoss >= 0.06)
      .sort((left, right) => right.expectedLoss - left.expectedLoss)
      .slice(0, 5),
  }
}
