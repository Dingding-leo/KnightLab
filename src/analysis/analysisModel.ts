import { Chess, type Color, type Square } from 'chess.js'
import { STANDARD_START_FEN } from '../domain/chess'

const MAX_PGN_BYTES = 524_288
// A FEN is normally far smaller, but the public import boundary permits the
// same documented 1 KiB ceiling regardless of whether it came from a picker
// or the paste field.
const MAX_FEN_BYTES = 1024

export type EvaluationPerspective = 'sideToMove' | 'white'
export type AnalysisScoreKind = 'cp' | 'mate'
export type AnalysisBound = 'lower' | 'upper' | null

export interface AnalysisScore {
  kind: AnalysisScoreKind
  value: number
  bound: AnalysisBound
}

export interface AnalysisMove {
  ply: number
  moveNumber: number
  color: Color
  san: string
  from: Square
  to: Square
  promotion?: string
}

export interface AnalysisPosition {
  ply: number
  fen: string
  turn: Color
  lastMove: { from: Square; to: Square } | null
}

export interface AnalysisTimeline {
  source: 'pgn' | 'fen'
  startFen: string
  /** The normalized original PGN, retained only for durable full-game reviews. */
  sourcePgn: string | null
  positions: AnalysisPosition[]
  moves: AnalysisMove[]
}

function position(game: Chess, ply: number, lastMove: AnalysisPosition['lastMove']): AnalysisPosition {
  return { ply, fen: game.fen(), turn: game.turn(), lastMove }
}

function validationError(prefix: string, error: unknown, fallback: string): Error {
  const message = error instanceof Error ? error.message : fallback
  return new Error(message.startsWith(prefix) ? message : `${prefix}${message}`)
}

export function createPgnTimeline(pgn: string): AnalysisTimeline {
  const normalized = pgn.trim()
  if (!normalized || new TextEncoder().encode(normalized).byteLength > MAX_PGN_BYTES) {
    throw new Error('Invalid PGN: the game is empty or too large.')
  }
  try {
    const parsed = new Chess()
    parsed.loadPgn(normalized)
    // `Chess#fen()` gives review identity a canonical starting position even if
    // equivalent PGNs use different FEN whitespace or header formatting.
    const replay = new Chess(parsed.getHeaders().FEN ?? STANDARD_START_FEN)
    const startFen = replay.fen()
    const history = parsed.history({ verbose: true })
    const positions = [position(replay, 0, null)]
    const moves: AnalysisMove[] = []
    for (const [index, sourceMove] of history.entries()) {
      const moveNumber = Number(replay.fen().split(/\s+/)[5])
      const applied = replay.move({
        from: sourceMove.from,
        to: sourceMove.to,
        promotion: sourceMove.promotion,
      })
      moves.push({
        ply: index + 1,
        moveNumber,
        color: sourceMove.color,
        san: applied.san,
        from: applied.from,
        to: applied.to,
        promotion: applied.promotion,
      })
      positions.push(position(replay, index + 1, { from: applied.from, to: applied.to }))
    }
    return { source: 'pgn', startFen, sourcePgn: normalized, positions, moves }
  } catch (error) {
    throw validationError('Invalid PGN: ', error, 'could not parse game.')
  }
}

export function createFenTimeline(fen: string): AnalysisTimeline {
  const normalized = fen.trim()
  if (!normalized || new TextEncoder().encode(normalized).byteLength > MAX_FEN_BYTES) {
    throw new Error('Invalid FEN: the position is empty or too large.')
  }
  try {
    const game = new Chess(normalized)
    const canonicalFen = game.fen()
    return {
      source: 'fen',
      startFen: canonicalFen,
      sourcePgn: null,
      positions: [position(game, 0, null)],
      moves: [],
    }
  } catch (error) {
    throw validationError('Invalid FEN: ', error, 'could not parse position.')
  }
}

function parseUci(value: string): { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' } {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(value)) {
    throw new Error(`Stockfish returned an illegal principal variation move: ${value}`)
  }
  return {
    from: value.slice(0, 2) as Square,
    to: value.slice(2, 4) as Square,
    promotion: value.length === 5 ? value[4] as 'q' | 'r' | 'b' | 'n' : undefined,
  }
}

export function uciPvToSan(fen: string, pv: string[]): string[] {
  try {
    const game = new Chess(fen)
    return pv.map((uci) => game.move(parseUci(uci)).san)
  } catch (error) {
    throw new Error(`Stockfish returned an illegal principal variation: ${error instanceof Error ? error.message : 'unknown move.'}`)
  }
}

export function evaluationForPerspective(
  score: AnalysisScore,
  fen: string,
  perspective: EvaluationPerspective,
): AnalysisScore {
  if (perspective === 'sideToMove' || fen.split(/\s+/)[1] === 'w') return { ...score }
  return {
    ...score,
    value: -score.value,
    bound: score.bound === 'lower' ? 'upper' : score.bound === 'upper' ? 'lower' : null,
  }
}

export function wdlForPerspective(
  wdl: [number, number, number] | null,
  fen: string,
  perspective: EvaluationPerspective,
): [number, number, number] | null {
  if (!wdl) return null
  if (perspective === 'sideToMove' || fen.split(/\s+/)[1] === 'w') return [...wdl]
  return [wdl[2], wdl[1], wdl[0]]
}

export function formatAnalysisScore(score: AnalysisScore): string {
  const prefix = score.bound === 'lower' ? '≥ ' : score.bound === 'upper' ? '≤ ' : ''
  if (score.kind === 'mate') {
    const value = score.value > 0 ? `+${score.value}` : score.value < 0 ? `−${Math.abs(score.value)}` : '0'
    return `${prefix}M${value}`
  }
  const pawns = score.value / 100
  const value = pawns > 0 ? `+${pawns.toFixed(2)}` : pawns < 0 ? `−${Math.abs(pawns).toFixed(2)}` : '0.00'
  return `${prefix}${value}`
}
