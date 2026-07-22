import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import {
  agreedDraw,
  botAcceptsDraw,
  isGameTermination,
  resignation,
  timedOut,
} from './completion'

describe('game completion domain', () => {
  it('creates exact resignation, draw and timeout results', () => {
    expect(resignation('w')).toEqual({ kind: 'resignation', loser: 'w', result: '0-1', status: 'White resigned — Black wins' })
    expect(resignation('b').result).toBe('1-0')
    expect(agreedDraw('b')).toEqual({ kind: 'draw-agreement', offeredBy: 'b', result: '1/2-1/2', status: 'Draw by agreement' })
    expect(timedOut('w', false).result).toBe('1/2-1/2')
  })

  it('validates persisted variants and rejects malformed records', () => {
    expect(isGameTermination(resignation('w'))).toBe(true)
    expect(isGameTermination(agreedDraw('w'))).toBe(true)
    expect(isGameTermination({ kind: 'resignation', loser: 'x', result: '0-1', status: 'bad' })).toBe(false)
    expect(isGameTermination({ loser: 'w', result: '0-1', status: 'legacy timeout' })).toBe(true)
  })
})

describe('bot draw policy', () => {
  it('never accepts an opening draw and is stricter at higher strength', () => {
    expect(botAcceptsDraw(new Chess(), 'b', 'easy')).toBe(false)

    const downPiece = new Chess('rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 20 11')
    downPiece.remove('b8')
    expect(botAcceptsDraw(downPiece, 'b', 'easy')).toBe(true)
    expect(botAcceptsDraw(downPiece, 'b', 'strong')).toBe(false)
  })

  it('accepts a genuinely quiet late ending but rejects a materially winning one', () => {
    const equalEnding = new Chess('8/5pk1/8/8/8/8/5PK1/8 w - - 40 31')
    expect(botAcceptsDraw(equalEnding, 'b', 'balanced')).toBe(true)

    const winning = new Chess('8/5qk1/8/8/8/8/5PK1/8 w - - 40 31')
    expect(botAcceptsDraw(winning, 'b', 'balanced')).toBe(false)
  })
})
