import { type Chess, type Color } from 'chess.js'
import { evaluateMaterial, timeoutResult, type BotLevel } from './chess'

export interface TimeoutTermination {
  kind: 'timeout'
  loser: Color
  result: string
  status: string
}

export interface ResignationTermination {
  kind: 'resignation'
  loser: Color
  result: string
  status: string
}

export interface DrawAgreementTermination {
  kind: 'draw-agreement'
  offeredBy: Color
  result: '1/2-1/2'
  status: 'Draw by agreement'
}

export interface LegacyTimeoutTermination {
  kind?: undefined
  loser: Color
  result: string
  status: string
}

export type GameTermination = TimeoutTermination | ResignationTermination | DrawAgreementTermination | LegacyTimeoutTermination

export function resignation(loser: Color): ResignationTermination {
  const winner = loser === 'w' ? 'Black' : 'White'
  return {
    kind: 'resignation',
    loser,
    result: loser === 'w' ? '0-1' : '1-0',
    status: `${loser === 'w' ? 'White' : 'Black'} resigned — ${winner} wins`,
  }
}

export function agreedDraw(offeredBy: Color): DrawAgreementTermination {
  return { kind: 'draw-agreement', offeredBy, result: '1/2-1/2', status: 'Draw by agreement' }
}

export function timedOut(loser: Color, opponentHasMatingMaterial: boolean): TimeoutTermination {
  const result = timeoutResult(loser, opponentHasMatingMaterial)
  return {
    kind: 'timeout',
    loser,
    result,
    status: result === '1/2-1/2'
      ? 'Draw on time — opponent has insufficient mating material'
      : `${loser === 'w' ? 'White' : 'Black'} lost on time`,
  }
}

export function isGameTermination(value: unknown): value is GameTermination {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<GameTermination> & { kind?: unknown; loser?: unknown; offeredBy?: unknown }
  if (typeof candidate.result !== 'string' || typeof candidate.status !== 'string') return false
  if (candidate.kind === 'draw-agreement') {
    return (candidate.offeredBy === 'w' || candidate.offeredBy === 'b')
      && candidate.result === '1/2-1/2'
      && candidate.status === 'Draw by agreement'
  }
  if (candidate.kind === 'resignation') {
    if (candidate.loser !== 'w' && candidate.loser !== 'b') return false
    return candidate.result === (candidate.loser === 'w' ? '0-1' : '1-0')
  }
  if (candidate.kind === 'timeout' || candidate.kind === undefined) {
    if (candidate.loser !== 'w' && candidate.loser !== 'b') return false
    return candidate.result === '1/2-1/2' || candidate.result === (candidate.loser === 'w' ? '0-1' : '1-0')
  }
  return false
}

export function botAcceptsDraw(game: Chess, botColor: Color, level: BotLevel): boolean {
  const [, , , , , fullmoveText] = game.fen().split(' ')
  const fullmove = Number(fullmoveText)
  const approximatePly = Math.max(0, (fullmove - 1) * 2 + (game.turn() === 'b' ? 1 : 0))
  if (!Number.isFinite(approximatePly) || approximatePly < 20) return false

  const material = evaluateMaterial(game, botColor)
  const deficitThreshold: Record<BotLevel, number> = { easy: -250, balanced: -350, strong: -450 }
  if (material <= deficitThreshold[level]) return true
  if (material > 100) return false

  const nonKingMaterial = game.board().flat().reduce((total, piece) => {
    if (!piece || piece.type === 'k') return total
    const values = { p: 100, n: 320, b: 330, r: 500, q: 900 }
    return total + values[piece.type]
  }, 0)
  const quietEndingPly: Record<BotLevel, number> = { easy: 40, balanced: 50, strong: 60 }
  return approximatePly >= quietEndingPly[level] && Math.abs(material) <= 100 && nonKingMaterial <= 2_000
}
