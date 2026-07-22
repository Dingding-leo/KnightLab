import { Chess, SQUARES, type Color, type PieceSymbol, type Square } from 'chess.js'
import type { AnalysisScore, AnalysisTimeline } from '../analysis/analysisModel'
import type { ReviewedMove } from './reviewModel'

export type CoachEvidenceKind =
  | 'missed-mate'
  | 'forcing-check'
  | 'unsupported-piece'
  | 'double-attack'
  | 'absolute-pin'

export interface CoachEvidence {
  kind: CoachEvidenceKind
  statement: string
  squares: Square[]
}

export interface CoachGuidance {
  summary: string
  focus: string
  continuation: string[]
  evidence: CoachEvidence[]
}

export interface CoachInput {
  preFen: string
  postFen: string
  move: ReviewedMove
}

type UciMove = { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }

const ERROR_CLASSES = new Set<ReviewedMove['classification']>([
  'inaccuracy', 'mistake', 'miss', 'blunder',
])

const pieceNames: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

function opposite(color: Color): Color {
  return color === 'w' ? 'b' : 'w'
}

function parseUci(value: unknown): UciMove | null {
  if (typeof value !== 'string' || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(value)) return null
  return {
    from: value.slice(0, 2) as Square,
    to: value.slice(2, 4) as Square,
    promotion: value.length === 5 ? value[4] as UciMove['promotion'] : undefined,
  }
}

function legalRecommendedMove(preFen: string, uci: unknown) {
  const parsed = parseUci(uci)
  if (!parsed) return null
  try {
    const game = new Chess(preFen)
    const move = game.move(parsed)
    return { game, move }
  } catch {
    return null
  }
}

function safeContinuation(preFen: string, values: unknown): string[] {
  if (!Array.isArray(values) || values.length > 128) return []
  const candidate = values.slice(0, 6)
  if (!candidate.every((value) => typeof value === 'string'
    && value.length > 0
    && value.length <= 64
    && !value.includes('\0'))) return []

  try {
    const game = new Chess(preFen)
    return candidate.map((value) => game.move(value).san)
  } catch {
    return []
  }
}

function isAnalysisScore(value: unknown): value is AnalysisScore {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const score = value as Record<string, unknown>
  return (score.kind === 'cp' || score.kind === 'mate')
    && typeof score.value === 'number'
    && Number.isFinite(score.value)
    && (score.bound === null || score.bound === 'lower' || score.bound === 'upper')
}

function continuationEndsInCheckmate(preFen: string, continuation: string[]): boolean {
  if (!continuation.length) return false
  try {
    const game = new Chess(preFen)
    for (const san of continuation) game.move(san)
    return game.isCheckmate()
  } catch {
    return false
  }
}

function canLegallyCaptureFrom(game: Chess, attacker: Color, from: Square, target: Square): boolean {
  try {
    const fenParts = game.fen().split(' ')
    fenParts[1] = attacker
    const attackerTurn = new Chess(fenParts.join(' '))
    return attackerTurn
      .moves({ square: from, verbose: true })
      .some((move) => move.to === target && move.captured !== undefined)
  } catch {
    return false
  }
}

function baseline(move: ReviewedMove, bestSan: string | null, continuation: string[]): CoachGuidance {
  const recommendation = bestSan
    ? `Stockfish's recorded recommendation is ${bestSan}.`
    : continuation.length
      ? `Compare it with the recorded line: ${continuation.join(' ')}.`
      : 'Compare it with the recorded engine line before committing.'
  return {
    summary: `You played ${move.san}. ${recommendation}`,
    focus: 'Before committing, compare your candidate move with the forcing checks, captures, and threats in the recorded line.',
    continuation,
    evidence: [],
  }
}

function findKing(game: Chess, color: Color): Square | null {
  return SQUARES.find((square) => {
    const piece = game.get(square)
    return piece?.color === color && piece.type === 'k'
  }) ?? null
}

function directionBetween(from: Square, to: Square): { file: number; rank: number } | null {
  const fileDelta = to.charCodeAt(0) - from.charCodeAt(0)
  const rankDelta = Number(to[1]) - Number(from[1])
  if (fileDelta === 0 && rankDelta === 0) return null
  const horizontal = rankDelta === 0
  const vertical = fileDelta === 0
  const diagonal = Math.abs(fileDelta) === Math.abs(rankDelta)
  if (!horizontal && !vertical && !diagonal) return null
  return { file: Math.sign(fileDelta), rank: Math.sign(rankDelta) }
}

function squaresBetween(from: Square, to: Square): Square[] {
  const direction = directionBetween(from, to)
  if (!direction) return []
  const result: Square[] = []
  let file = from.charCodeAt(0) + direction.file
  let rank = Number(from[1]) + direction.rank
  while (file !== to.charCodeAt(0) || rank !== Number(to[1])) {
    result.push(`${String.fromCharCode(file)}${rank}` as Square)
    file += direction.file
    rank += direction.rank
  }
  return result
}

function compatibleSlider(type: PieceSymbol, from: Square, to: Square): boolean {
  const direction = directionBetween(from, to)
  if (!direction) return false
  const straight = direction.file === 0 || direction.rank === 0
  const diagonal = direction.file !== 0 && direction.rank !== 0
  return type === 'q' || (type === 'r' && straight) || (type === 'b' && diagonal)
}

function findAbsolutePins(game: Chess, attacker: Color): CoachEvidence[] {
  const defender = opposite(attacker)
  const king = findKing(game, defender)
  if (!king) return []

  const pins: CoachEvidence[] = []
  for (const square of SQUARES) {
    const slider = game.get(square)
    if (!slider || slider.color !== attacker || !compatibleSlider(slider.type, square, king)) continue
    const between = squaresBetween(square, king)
    const blockers = between.filter((candidate) => game.get(candidate))
    if (blockers.length !== 1) continue
    const pinnedSquare = blockers[0]
    const pinned = game.get(pinnedSquare)
    if (!pinned || pinned.color !== defender) continue
    pins.push({
      kind: 'absolute-pin',
      statement: `The ${pieceNames[slider.type]} on ${square} pins the ${pieceNames[pinned.type]} on ${pinnedSquare} to the king on ${king}.`,
      squares: [square, pinnedSquare, king],
    })
  }
  return pins
}

function findDoubleAttack(game: Chess, from: Square, attacker: Color): CoachEvidence | null {
  const movingPiece = game.get(from)
  if (!movingPiece || movingPiece.color !== attacker) return null
  const defender = opposite(attacker)
  const defenderKing = findKing(game, defender)
  const targets = SQUARES
    .map((square) => ({ square, piece: game.get(square) }))
    .filter((entry): entry is { square: Square; piece: NonNullable<ReturnType<Chess['get']>> } => (
      Boolean(entry.piece)
      && entry.piece!.color === defender
      && (entry.piece!.type === 'k'
        ? entry.square === defenderKing
          && game.turn() === defender
          && game.isCheck()
          && game.attackers(entry.square, attacker).includes(from)
        : canLegallyCaptureFrom(game, attacker, from, entry.square))
    ))
    .filter(({ piece }) => piece.type !== 'p')

  const valuableTargets = targets.filter(({ piece }) => piece.type === 'k' || piece.type === 'q' || piece.type === 'r' || piece.type === 'b' || piece.type === 'n')
  if (valuableTargets.length < 2) return null
  const targetText = valuableTargets.slice(0, 2).map(({ square, piece }) => `${pieceNames[piece.type]} on ${square}`).join(' and ')
  return {
    kind: 'double-attack',
    statement: `The ${pieceNames[movingPiece.type]} on ${from} directly attacks ${targetText}, creating a second target to handle.`,
    squares: [from, ...valuableTargets.slice(0, 2).map(({ square }) => square)],
  }
}

function unsupportedMovedPiece(postFen: string, move: ReviewedMove): CoachEvidence | null {
  try {
    const game = new Chess(postFen)
    const moved = game.get(move.to)
    if (!moved || moved.color !== move.color || moved.type === 'k') return null
    const attackingColor = opposite(moved.color)
    const attackers = game.attackers(move.to, attackingColor)
      .filter((square) => canLegallyCaptureFrom(game, attackingColor, square, move.to))
    const defenders = game.attackers(move.to, moved.color)
    if (!attackers.length || defenders.length) return null
    const attacker = attackers[0]
    const attackerPiece = game.get(attacker)
    return {
      kind: 'unsupported-piece',
      statement: `After ${move.san}, the ${pieceNames[moved.type]} on ${move.to} is attacked${attackerPiece ? ` by the ${pieceNames[attackerPiece.type]} on ${attacker}` : ''} and has no supporting defender.`,
      squares: attackerPiece ? [move.to, attacker] : [move.to],
    }
  } catch {
    return null
  }
}

function focusFor(evidence: CoachEvidence[]): string {
  if (evidence.some((item) => item.kind === 'missed-mate')) {
    return 'Before a quiet move, scan every forcing check and verify whether it ends the game.'
  }
  if (evidence.some((item) => item.kind === 'unsupported-piece')) {
    return 'Before moving a piece, check whether its destination is attacked and whether another piece supports it.'
  }
  if (evidence.some((item) => item.kind === 'double-attack')) {
    return 'After every forcing move, look for a second valuable target the opponent cannot address at the same time.'
  }
  if (evidence.some((item) => item.kind === 'absolute-pin')) {
    return 'Trace open files, ranks, and diagonals to the king before deciding whether a piece can freely move.'
  }
  if (evidence.some((item) => item.kind === 'forcing-check')) {
    return 'Check forcing moves first: a check can limit the opponent to king-safety responses.'
  }
  return 'Before committing, compare your candidate move with the forcing checks, captures, and threats in the recorded line.'
}

/**
 * Produces conservative coaching from a completed review. It deliberately
 * refuses to infer a tactic from a score alone: every tactical statement is
 * derived from a legal reconstructed board.
 */
export function buildCoachGuidance(input: CoachInput): CoachGuidance | null {
  const { move } = input
  if (!ERROR_CLASSES.has(move.classification)) return null

  const best = legalRecommendedMove(input.preFen, move.bestMoveUci)
  const bestSan = best?.move.san ?? null
  const parsedContinuation = safeContinuation(input.preFen, move.bestLineSan)
  const continuation = bestSan && parsedContinuation.length && parsedContinuation[0] !== bestSan
    ? []
    : parsedContinuation
  const neutral = baseline(move, bestSan, continuation)

  if (move.confidence !== 'normal') {
    return {
      ...neutral,
      summary: `This review was recorded with limited search confidence. ${neutral.summary}`,
    }
  }
  if (!best) {
    return {
      ...neutral,
      summary: `KnightClub could not safely reconstruct a legal recommended move. ${neutral.summary}`,
    }
  }
  if (!isAnalysisScore(move.bestScore)) {
    return {
      ...neutral,
      summary: `KnightClub could not safely validate the recorded engine score. ${neutral.summary}`,
    }
  }

  const evidence: CoachEvidence[] = []
  const confirmedMate = best.game.isCheckmate() || continuationEndsInCheckmate(input.preFen, continuation)
  if (move.bestScore.kind === 'mate' && move.bestScore.value > 0 && confirmedMate) {
    evidence.push({
      kind: 'missed-mate',
      statement: best.game.isCheckmate()
        ? `${bestSan} is checkmate on ${best.move.to}.`
        : `The recorded continuation ends in checkmate after ${continuation.join(' ')}.`,
      squares: [best.move.from, best.move.to],
    })
  }
  if (best.game.isCheck() && !best.game.isCheckmate()) {
    const king = findKing(best.game, best.game.turn())
    evidence.push({
      kind: 'forcing-check',
      statement: `${bestSan} checks the ${best.game.turn() === 'w' ? 'white' : 'black'} king${king ? ` on ${king}` : ''} and forces a king-safety response.`,
      squares: king ? [best.move.to, king] : [best.move.to],
    })
  }

  const unsupported = unsupportedMovedPiece(input.postFen, move)
  if (unsupported) evidence.push(unsupported)

  const doubleAttack = findDoubleAttack(best.game, best.move.to, best.move.color)
  if (doubleAttack) evidence.push(doubleAttack)
  evidence.push(...findAbsolutePins(best.game, best.move.color))

  return {
    summary: evidence.length
      ? `You played ${move.san}. ${bestSan} was a stronger concrete choice.`
      : neutral.summary,
    focus: focusFor(evidence),
    continuation,
    evidence,
  }
}

/** Connects a persisted reviewed move to the exact replay positions that produced it. */
export function buildCoachGuidanceFromTimeline(
  timeline: Pick<AnalysisTimeline, 'positions'>,
  move: ReviewedMove | null,
): CoachGuidance | null {
  if (!move || move.ply < 1) return null
  const prePosition = timeline.positions[move.ply - 1]
  const postPosition = timeline.positions[move.ply]
  if (!prePosition || !postPosition) return null
  return buildCoachGuidance({ move, preFen: prePosition.fen, postFen: postPosition.fen })
}
