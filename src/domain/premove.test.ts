import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { canQueuePremove, premoveNeedsPromotion, queuePremove, tryApplyPremove } from './premove'

describe('premove queue preview', () => {
  it('accepts plausible human-piece geometry while rejecting opponent pieces and own targets', () => {
    const game = new Chess()
    game.move('e4')

    expect(canQueuePremove(game, 'w', { from: 'g1', to: 'f3' })).toBe(true)
    expect(canQueuePremove(game, 'w', { from: 'e4', to: 'e5' })).toBe(true)
    expect(canQueuePremove(game, 'w', { from: 'g8', to: 'f6' })).toBe(false)
    expect(canQueuePremove(game, 'w', { from: 'b1', to: 'd2' })).toBe(false)
    expect(canQueuePremove(game, 'w', { from: 'e4', to: 'e7' })).toBe(false)
  })

  it('allows a queued en-passant shape that only becomes legal after the bot move', () => {
    const game = new Chess()
    game.move('e4')
    game.move('a6')
    game.move('e5')
    const queued = queuePremove(game, 'w', { from: 'e5', to: 'd6' })
    const beforeBotMove = game.fen()

    expect(queued?.baseFen).toBe(beforeBotMove)
    game.move('d5')
    const applied = queued ? tryApplyPremove(game, 'w', queued) : null

    expect(applied?.get('d6')).toMatchObject({ color: 'w', type: 'p' })
    expect(applied?.get('d5')).toBeUndefined()
    expect(applied?.history()).toEqual(['e4', 'a6', 'e5', 'd5', 'exd6'])
    expect(applied?.pgn()).toContain('1. e4 a6 2. e5 d5 3. exd6')
    expect(game.get('e5')).toMatchObject({ color: 'w', type: 'p' })
    expect(game.get('d5')).toMatchObject({ color: 'b', type: 'p' })
  })

  it('cancels a queued move that the actual bot reply leaves illegal without mutating the board', () => {
    const game = new Chess()
    game.move('e4')
    game.move('a6')
    game.move('e5')
    const queued = queuePremove(game, 'w', { from: 'e5', to: 'd6' })
    game.move('h6')
    const beforeAttempt = game.fen()

    expect(queued && tryApplyPremove(game, 'w', queued)).toBeNull()
    expect(game.fen()).toBe(beforeAttempt)
  })

  it('requires a real promotion piece for a pawn premove to the back rank', () => {
    const startFen = '4k3/P7/8/8/8/8/8/4K3 b - - 0 1'
    const game = new Chess(startFen)

    expect(premoveNeedsPromotion(game, 'w', 'a7', 'a8')).toBe(true)
    expect(canQueuePremove(game, 'w', { from: 'a7', to: 'a8' })).toBe(false)
    expect(canQueuePremove(game, 'w', { from: 'a7', to: 'a8', promotion: 'q' })).toBe(true)
    expect(canQueuePremove(game, 'w', { from: 'a7', to: 'a8', promotion: 'k' })).toBe(false)

    const queued = queuePremove(game, 'w', { from: 'a7', to: 'a8', promotion: 'q' })
    game.move('Kd7')
    const applied = queued ? tryApplyPremove(game, 'w', queued) : null

    expect(applied?.history()).toEqual(['Kd7', 'a8=Q'])
    expect(applied?.getHeaders().FEN).toBe(startFen)
  })

  it('applies only on the queued human side to move', () => {
    const game = new Chess()
    expect(tryApplyPremove(game, 'b', { from: 'g8', to: 'f6' })).toBeNull()
  })
})
