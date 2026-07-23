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

/**
 * chess.js intentionally exposes no public clone method. Modern browser and
 * desktop runtimes can still deep-copy its plain instance state with the
 * platform snapshot primitive; restoring the prototype preserves the complete
 * undo/repetition/PGN history without replaying every earlier move. A public
 * FEN check keeps the established replay path as the safe fallback.
 */
function snapshotGame(game: Chess): Chess | null {
  if (typeof globalThis.structuredClone !== 'function') return null
  try {
    const cloned = Object.assign(
      Object.create(Object.getPrototypeOf(game)),
      globalThis.structuredClone(game),
    ) as Chess
    return cloned.fen() === game.fen() ? cloned : null
  } catch {
    return null
  }
}

/**
 * chess.js keeps its undo stack private. It is safe to use only as an
 * optional fast-path guard here: if a future chess.js release changes that
 * representation, callers fall back to replaying the public verbose moves.
 */
function historyDepth(game: Chess): number | null {
  const candidate = game as unknown as { _history?: unknown }
  return Array.isArray(candidate._history) ? candidate._history.length : null
}

function sameHistoricalMove(left: Move, right: Move): boolean {
  return left.color === right.color
    && left.from === right.from
    && left.to === right.to
    && left.piece === right.piece
    && left.captured === right.captured
    && left.promotion === right.promotion
}

/**
 * When a player is stepping through the later half of a live game, copying
 * the current position and undoing its short suffix is much cheaper than
 * replaying the entire opening. Every private-state assumption is checked
 * against public move/FEN data, so an unexpected snapshot simply falls back
 * to the established replay path.
 */
function snapshotHistoricalPosition(
  sourceGame: Chess,
  verboseHistory: readonly Move[],
  targetPly: number,
): Chess | null {
  const snapshot = snapshotGame(sourceGame)
  const latest = verboseHistory.at(-1)
  if (!snapshot
    || !latest
    || historyDepth(snapshot) !== verboseHistory.length
    || snapshot.fen() !== latest.after) return null

  for (let index = verboseHistory.length - 1; index >= targetPly; index -= 1) {
    const undone = snapshot.undo()
    if (!undone || !sameHistoricalMove(undone, verboseHistory[index])) return null
  }

  const expectedFen = verboseHistory[targetPly - 1]?.after
  return historyDepth(snapshot) === targetPly && snapshot.fen() === expectedFen
    ? snapshot
    : null
}

export function cloneGame(
  game: Chess,
  startFen = STANDARD_START_FEN,
  verboseHistory?: readonly Move[],
): Chess {
  const snapshot = snapshotGame(game)
  if (snapshot) return snapshot
  const clone = new Chess(startFen)
  for (const move of verboseHistory ?? game.history({ verbose: true })) {
    clone.move({ from: move.from, to: move.to, promotion: move.promotion })
  }
  return clone
}

/**
 * Rebuild a read-only historical position without mutating the live game.
 * Supplying the cached verbose history keeps previewing a move list from
 * repeatedly asking chess.js to derive the same timeline.
 */
export function cloneGameAtPly(
  startFen: string,
  verboseHistory: readonly Move[],
  ply: number,
  sourceGame?: Chess,
): Chess {
  const requestedPly = Number.isFinite(ply) ? Math.trunc(ply) : 0
  const boundedPly = Math.max(0, Math.min(verboseHistory.length, requestedPly))
  // Preview navigation usually starts from the newest position and moves
  // backwards. For that later half, clone once and undo the smaller suffix.
  // The complete source game is optional to preserve the public helper's
  // replay-only behavior for imported or otherwise detached timelines.
  if (sourceGame && boundedPly > verboseHistory.length / 2) {
    const snapshot = snapshotHistoricalPosition(sourceGame, verboseHistory, boundedPly)
    if (snapshot) return snapshot
  }
  // A historical preview intentionally represents only a prefix, so it must
  // use the replay path when a verified current-game snapshot is unavailable.
  const clone = new Chess(startFen)
  for (const move of verboseHistory.slice(0, boundedPly)) {
    clone.move({ from: move.from, to: move.to, promotion: move.promotion })
  }
  return clone
}

/**
 * Create a display-only historical position without replaying its prefix.
 *
 * Verbose chess.js moves carry the exact FEN after each legal move. Play's
 * history preview only reads that position (board, material and transfers),
 * so it does not need the expensive undo/PGN history that cloneGameAtPly
 * preserves. Invalid or externally supplied FEN data still takes the proven
 * replay route, keeping imported timelines safe.
 */
export function previewGameAtPly(
  startFen: string,
  verboseHistory: readonly Move[],
  ply: number,
): Chess {
  const requestedPly = Number.isFinite(ply) ? Math.trunc(ply) : 0
  const boundedPly = Math.max(0, Math.min(verboseHistory.length, requestedPly))
  const positionFen = boundedPly === 0
    ? startFen
    : verboseHistory[boundedPly - 1]?.after

  if (positionFen) {
    try {
      const preview = new Chess(positionFen)
      if (preview.fen() === positionFen) return preview
    } catch {
      // Imported histories can carry stale or malformed FEN. Replay below.
    }
  }

  return cloneGameAtPly(startFen, verboseHistory, boundedPly)
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

export interface GameSummary {
  /** Whether chess.js considers the board position complete, without a manual resignation or timeout. */
  finished: boolean
  result: string
  status: string
}

/**
 * Resolves the complete board outcome in one ordered rules pass.
 *
 * Play renders for selections, premoves and notices without replacing its
 * immutable Chess instance. Keeping status, result and terminal state
 * together lets that UI memoize one summary instead of each render asking
 * chess.js to generate the same legal moves several times. The explicit draw
 * cases are the complete public `isDraw()` contract in the pinned chess.js
 * version; retain their established status wording and priority here.
 */
export function gameSummary(game: Chess): GameSummary {
  if (game.isCheckmate()) {
    const winner = game.turn() === 'w' ? 'Black' : 'White'
    return {
      finished: true,
      result: game.turn() === 'w' ? '0-1' : '1-0',
      status: `Checkmate — ${winner} wins`,
    }
  }
  if (game.isStalemate()) return { finished: true, result: '1/2-1/2', status: 'Draw by stalemate' }
  if (game.isThreefoldRepetition()) return { finished: true, result: '1/2-1/2', status: 'Draw by threefold repetition' }
  if (game.isInsufficientMaterial()) return { finished: true, result: '1/2-1/2', status: 'Draw by insufficient material' }
  if (game.isDrawByFiftyMoves()) return { finished: true, result: '1/2-1/2', status: 'Draw by fifty-move rule' }
  return {
    finished: false,
    result: '*',
    status: game.inCheck()
      ? `${game.turn() === 'w' ? 'White' : 'Black'} to move — check`
      : `${game.turn() === 'w' ? 'White' : 'Black'} to move`,
  }
}

export function gameResult(game: Chess): string {
  return gameSummary(game).result
}

export function recordedGameResult(game: Chess): string {
  const boardResult = gameResult(game)
  if (boardResult !== '*') return boardResult
  const headerResult = game.getHeaders().Result
  return ['1-0', '0-1', '1/2-1/2'].includes(headerResult ?? '') ? headerResult : '*'
}

type PgnHeaderOverrides = Readonly<Record<string, string>>

function pgnMoveNumber(move: Move, fallback: number): number {
  const value = Number(move.before.split(' ')[5])
  return Number.isInteger(value) && value > 0 ? value : fallback
}

function pgnHeaders(
  game: Chess,
  startFen: string,
  result: string,
  overrides: PgnHeaderOverrides,
): Array<[string, string]> {
  const requested: Record<string, string> = { ...overrides, Result: result }
  const consumed = new Set<string>()
  const entries = Object.entries(game.getHeaders()).map(([name, value]) => {
    consumed.add(name)
    return [name, requested[name] ?? value] as [string, string]
  })

  for (const [name, value] of Object.entries(requested)) {
    if (!consumed.has(name)) entries.push([name, value])
  }

  // Chess.js normally creates these tags when it starts from a setup FEN.
  // Retain that standards-compatible export even for a restored legacy game
  // whose header block did not carry the two fields forward.
  if (startFen !== STANDARD_START_FEN) {
    const setUp = entries.find(([name]) => name === 'SetUp')
    const fen = entries.find(([name]) => name === 'FEN')
    if (setUp) setUp[1] = '1'
    else entries.push(['SetUp', '1'])
    if (fen) fen[1] = startFen
    else entries.push(['FEN', startFen])
  }

  return entries
}

function pgnMoveText(history: readonly Move[], result: string): string {
  const rows: string[] = []
  let current = ''
  let fallbackMoveNumber = 1

  for (const move of history) {
    const number = pgnMoveNumber(move, fallbackMoveNumber)
    fallbackMoveNumber = move.color === 'b' ? number + 1 : number

    if (!current && move.color === 'b') {
      current = `${number}. ...`
    } else if (move.color === 'w') {
      if (current) rows.push(current)
      current = `${number}.`
    }
    current = `${current} ${move.san}`
  }

  if (current) rows.push(current)
  rows.push(result)
  return rows.join(' ')
}

/**
 * chess.js currently stores comments in a plain private object. Calling its
 * public `getComments()` always prunes that object by undoing and replaying
 * the full history, even when it is empty. Play writes no comments itself, so
 * recognize only the exact known-empty representation here. Any unfamiliar or
 * non-empty shape deliberately falls back to the public API below, preserving
 * annotations if chess.js changes its internals in a future update.
 */
function hasKnownEmptyCommentStore(game: Chess): boolean {
  const comments = (game as unknown as { _comments?: unknown })._comments
  return typeof comments === 'object'
    && comments !== null
    && !Array.isArray(comments)
    && Object.getPrototypeOf(comments) === Object.prototype
    && Object.keys(comments).length === 0
}

/**
 * Serializes a game from Play's immutable verbose-history snapshot instead of
 * asking chess.js to undo and replay the complete game for every new ply.
 * Comments are uncommon in the live Play path; retain chess.js's authoritative
 * serializer for those imported positions so no annotation can be lost.
 */
export function pgnFromHistory(
  game: Chess,
  startFen: string,
  history: readonly Move[],
  result = game.getHeaders().Result ?? '*',
  overrides: PgnHeaderOverrides = {},
): string {
  if (!hasKnownEmptyCommentStore(game) && game.getComments().length > 0) {
    const annotated = cloneGame(game, startFen, history)
    for (const [name, value] of Object.entries(overrides)) annotated.setHeader(name, value)
    annotated.setHeader('Result', result)
    if (startFen !== STANDARD_START_FEN) {
      annotated.setHeader('SetUp', '1')
      annotated.setHeader('FEN', startFen)
    }
    return annotated.pgn()
  }

  const headers = pgnHeaders(game, startFen, result, overrides)
  const headerText = headers.map(([name, value]) => `[${name} "${value}"]\n`).join('')
  const moveText = pgnMoveText(history, result)
  // Chess.js joins its empty no-move fragment with the mandatory result,
  // which deliberately leaves this leading separator in a fresh export.
  return `${headerText}${headerText && history.length ? '\n' : ''}${history.length ? moveText : ` ${moveText}`}`
}

export function completedPgn(game: Chess, startFen: string, result: string, termination: string): string {
  return pgnFromHistory(
    game,
    startFen,
    game.history({ verbose: true }),
    result,
    { Termination: termination },
  )
}

export function gameStatus(game: Chess): string {
  return gameSummary(game).status
}

export function legalMovesFrom(game: Chess, square: Square): Move[] {
  return game.moves({ square, verbose: true })
}

export function moveToInput(move: Move): MoveInput {
  return { from: move.from, to: move.to, promotion: move.promotion }
}

/**
 * Returns the rules-proven reply when a side has exactly one legal move.
 * Callers can skip engine work in this case because no search result could
 * alter the move while retaining standard chess legality.
 */
export function onlyLegalMove(game: Chess): MoveInput | null {
  const moves = game.moves({ verbose: true })
  return moves.length === 1 ? moveToInput(moves[0]) : null
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
