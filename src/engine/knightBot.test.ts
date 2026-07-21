import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { chooseBotMove } from './knightBot'

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
