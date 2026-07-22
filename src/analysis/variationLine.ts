import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js'
import { STANDARD_START_FEN } from '../domain/chess'

/** A deliberately small, local-only branch used while inspecting a position. */
export const MAX_VARIATION_PLIES = 256

export type VariationPromotion = Extract<PieceSymbol, 'q' | 'r' | 'b' | 'n'>

export interface VariationMove {
  color: Color
  moveNumber: number
  san: string
  from: Square
  to: Square
  promotion?: VariationPromotion
}

export interface VariationLine {
  /** Immutable position selected from the main game when exploration began. */
  anchorFen: string
  /** Main-game ply for returning to the exact source position. */
  anchorPly: number
  moves: readonly VariationMove[]
}

export interface VariationPosition {
  fen: string
  lastMove: { from: Square; to: Square } | null
}

export interface VariationState {
  line: VariationLine
  position: VariationPosition
}

export interface VariationMoveInput {
  from: Square
  to: Square
  promotion?: VariationPromotion
}

interface CachedReplay {
  /**
   * Kept private and keyed by state identity. It retains chess.js history so a
   * normal sequential branch does not have to replay every earlier ply before
   * accepting its next move or exporting PGN.
   */
  game: Chess
  signature: string
}

const verifiedReplays = new WeakMap<VariationState, CachedReplay>()

function isVariationPromotion(value: unknown): value is VariationPromotion {
  return value === 'q' || value === 'r' || value === 'b' || value === 'n'
}

function moveNumber(game: Chess): number {
  const fullMove = Number(game.fen().split(/\s+/)[5])
  return Number.isInteger(fullMove) && fullMove >= 1 ? fullMove : 1
}

function tryMove(game: Chess, input: VariationMoveInput) {
  try {
    return game.move(input)
  } catch {
    return null
  }
}

function sameMove(move: VariationMove, applied: ReturnType<Chess['move']>, number: number): boolean {
  return move.color === applied.color
    && move.moveNumber === number
    && move.san === applied.san
    && move.from === applied.from
    && move.to === applied.to
    && move.promotion === (isVariationPromotion(applied.promotion) ? applied.promotion : undefined)
}

function toVariationMove(applied: ReturnType<Chess['move']>, number: number): VariationMove {
  return {
    color: applied.color,
    moveNumber: number,
    san: applied.san,
    from: applied.from,
    to: applied.to,
    promotion: isVariationPromotion(applied.promotion) ? applied.promotion : undefined,
  }
}

/**
 * Replay the compact move facts rather than trusting a displayed FEN. The
 * public helpers remain fail-closed if a caller supplies an invalid forged
 * variation, while UI state only ever keeps canonical chess.js moves.
 */
function replay(line: VariationLine): Chess | null {
  if (!Number.isInteger(line.anchorPly) || line.anchorPly < 0 || line.moves.length > MAX_VARIATION_PLIES) return null
  let game: Chess
  try {
    game = new Chess(line.anchorFen)
  } catch {
    return null
  }
  for (const move of line.moves) {
    const number = moveNumber(game)
    const applied = tryMove(game, move)
    if (!applied || !sameMove(move, applied, number)) return null
  }
  return game
}

function positionFor(game: Chess, lastMove: VariationPosition['lastMove']): VariationPosition {
  return { fen: game.fen(), lastMove }
}

function lineSignature(line: VariationLine): string {
  return JSON.stringify([line.anchorFen, line.anchorPly, line.moves])
}

function expectedLastMove(line: VariationLine): VariationPosition['lastMove'] {
  const move = line.moves.at(-1)
  return move ? { from: move.from, to: move.to } : null
}

function positionMatches(state: VariationState, game: Chess): boolean {
  const expected = expectedLastMove(state.line)
  const actual = state.position.lastMove
  if (state.position.fen !== game.fen()) return false
  if (!actual || !expected) return actual === expected
  return actual.from === expected.from && actual.to === expected.to
}

function rememberVerifiedReplay(state: VariationState, game: Chess): VariationState {
  verifiedReplays.set(state, { game, signature: lineSignature(state.line) })
  return state
}

/**
 * Prefer the private replay retained by a state produced here, but verify both
 * its public facts and a compact signature before trusting it. Any cloned,
 * stale or forged public state falls back to strict full replay and fails
 * closed when it cannot be reproduced.
 */
function verifiedGame(state: VariationState): Chess | null {
  const signature = lineSignature(state.line)
  const cached = verifiedReplays.get(state)
  if (cached?.signature === signature && positionMatches(state, cached.game)) return cached.game

  const game = replay(state.line)
  if (!game || !positionMatches(state, game)) return null
  verifiedReplays.set(state, { game, signature })
  return game
}

/** Starts a temporary variation without changing the immutable main line. */
export function createVariationState(anchorFen: string, anchorPly: number): VariationState | null {
  const line: VariationLine = { anchorFen, anchorPly, moves: [] }
  const game = replay(line)
  return game ? rememberVerifiedReplay({ line, position: positionFor(game, null) }, game) : null
}

/** Applies one legal move and returns a fresh canonical variation state. */
export function appendVariationMove(state: VariationState, input: VariationMoveInput): VariationState | null {
  const game = verifiedGame(state)
  if (!game || state.line.moves.length >= MAX_VARIATION_PLIES) return null
  const number = moveNumber(game)
  const applied = tryMove(game, input)
  if (!applied) return null
  const move = toVariationMove(applied, number)
  const line: VariationLine = { ...state.line, moves: [...state.line.moves, move] }
  return rememberVerifiedReplay({ line, position: positionFor(game, { from: move.from, to: move.to }) }, game)
}

/** Removes only the last temporary move; the main-game cursor is untouched. */
export function undoVariationMove(state: VariationState): VariationState | null {
  if (!state.line.moves.length) return state
  const game = verifiedGame(state)
  if (!game || !game.undo()) return null
  const line: VariationLine = { ...state.line, moves: state.line.moves.slice(0, -1) }
  const previous = line.moves.at(-1)
  return rememberVerifiedReplay({
    line,
    position: positionFor(game, previous ? { from: previous.from, to: previous.to } : null),
  }, game)
}

/** Clears explored moves while retaining the original main-game anchor. */
export function resetVariation(state: VariationState): VariationState | null {
  return createVariationState(state.line.anchorFen, state.line.anchorPly)
}

/** Exports a self-contained PGN only after the player has made a branch move. */
export function variationPgn(state: VariationState): string | null {
  if (!state.line.moves.length) return null
  const game = verifiedGame(state)
  if (!game) return null
  if (state.line.anchorFen !== STANDARD_START_FEN) {
    game.setHeader('SetUp', '1')
    game.setHeader('FEN', state.line.anchorFen)
  }
  return game.pgn({ newline: '\n', maxWidth: 0 })
}
