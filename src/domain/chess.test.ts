import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { cloneGame, evaluateMaterial, gameResult, gameStatus } from './chess'

describe('chess domain', () => {
  it('clones move history and current position', () => {
    const game = new Chess()
    game.move('e4')
    game.move('c5')
    const clone = cloneGame(game)
    expect(clone.fen()).toBe(game.fen())
    expect(clone.history()).toEqual(['e4', 'c5'])
  })

  it('evaluates captured material from white perspective', () => {
    const game = new Chess()
    game.move('e4')
    game.move('d5')
    game.move('exd5')
    expect(evaluateMaterial(game, 'w')).toBe(100)
  })

  it('reports checkmate result and status', () => {
    const game = new Chess()
    game.move('f3')
    game.move('e5')
    game.move('g4')
    game.move('Qh4#')
    expect(gameResult(game)).toBe('0-1')
    expect(gameStatus(game)).toContain('Checkmate')
  })
})
