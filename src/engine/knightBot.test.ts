import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { chooseBotMove, FALLBACK_NODE_BUDGET } from './knightBot'

for (const level of ['easy', 'balanced', 'strong'] as const) {
  describe(`KnightBot ${level}`, () => {
    it('always returns a legal move from the starting position', () => {
      const game = new Chess()
      const move = chooseBotMove(game.fen(), level)
      expect(move).not.toBeNull()
      expect(() => game.move(move!)).not.toThrow()
    })
  })
}

describe('KnightBot terminal positions', () => {
  it('returns null when there are no legal moves', () => {
    const game = new Chess('7k/5Q2/7K/8/8/8/8/8 b - - 0 1')
    expect(chooseBotMove(game.fen(), 'strong')).toBeNull()
  })
})

describe('KnightBot strong', () => {
  it('chooses a deterministic legal move for the same position', () => {
    const game = new Chess()
    const first = chooseBotMove(game.fen(), 'strong')
    const second = chooseBotMove(game.fen(), 'strong')

    expect(first).not.toBeNull()
    expect(first).toEqual(second)
    expect(() => game.move(first!)).not.toThrow()
  })

  it('keeps every fallback search within a finite local node budget', () => {
    expect(FALLBACK_NODE_BUDGET).toEqual({ easy: 0, balanced: 500, strong: 900 })
  })
})
