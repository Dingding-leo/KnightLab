import { Chess } from 'chess.js'
import { describe, expect, it, vi } from 'vitest'
import { completedPgn, pgnFromHistory, STANDARD_START_FEN } from './chess'

describe('result-aware PGN', () => {
  it('adds result and termination headers without mutating the live game', () => {
    const game = new Chess()
    game.move('e4')
    const originalHeaders = game.getHeaders()
    const pgn = completedPgn(game, new Chess().fen(), '0-1', 'White resigned — Black wins')
    expect(pgn).toContain('[Result "0-1"]')
    expect(pgn).toContain('[Termination "White resigned — Black wins"]')
    expect(pgn).toContain('1. e4 0-1')
    expect(game.getHeaders()).toEqual(originalHeaders)
  })

  it('preserves setup metadata for a custom starting position', () => {
    const fen = '8/8/8/8/8/8/4K3/7k w - - 0 1'
    const pgn = completedPgn(new Chess(fen), fen, '1/2-1/2', 'Draw by agreement')
    expect(pgn).toContain('[SetUp "1"]')
    expect(pgn).toContain(`[FEN "${fen}"]`)
  })

  it('matches chess.js PGN for normal moves and setup positions from the supplied snapshot', () => {
    const empty = new Chess()

    const standard = new Chess()
    for (const move of ['e4', 'a6', 'e5', 'd5', 'exd6']) standard.move(move)

    const blackToMoveFen = '8/8/8/8/8/8/4K3/7k b - - 0 17'
    const blackToMove = new Chess(blackToMoveFen)
    blackToMove.move('Kg2')

    const promotionFen = '7k/P7/8/8/8/8/8/7K w - - 0 1'
    const promotion = new Chess(promotionFen)
    promotion.move({ from: 'a7', to: 'a8', promotion: 'q' })

    for (const [game, startFen] of [
      [empty, STANDARD_START_FEN],
      [standard, STANDARD_START_FEN],
      [blackToMove, blackToMoveFen],
      [promotion, promotionFen],
    ] as const) {
      expect(pgnFromHistory(game, startFen, game.history({ verbose: true }))).toBe(game.pgn())
    }
  })

  it('does not ask chess.js to rebuild supplied live history or PGN', () => {
    const game = new Chess()
    const cycle = ['Nf3', 'Nf6', 'Ng1', 'Ng8']
    for (let index = 0; index < 1_024; index += 1) game.move(cycle[index % cycle.length]!)
    const snapshot = game.history({ verbose: true })
    const expected = game.pgn()
    const historySpy = vi.spyOn(game, 'history')
    const pgnSpy = vi.spyOn(game, 'pgn')
    const commentsSpy = vi.spyOn(game, 'getComments')

    expect(pgnFromHistory(game, STANDARD_START_FEN, snapshot)).toBe(expected)
    expect(historySpy).not.toHaveBeenCalled()
    expect(pgnSpy).not.toHaveBeenCalled()
    expect(commentsSpy).not.toHaveBeenCalled()
  })

  it('retains chess.js annotation serialization for imported commented games', () => {
    const game = new Chess()
    game.move('e4')
    game.setComment('A local note')
    const expected = game.pgn()
    const commentsSpy = vi.spyOn(game, 'getComments')

    expect(pgnFromHistory(game, STANDARD_START_FEN, game.history({ verbose: true }))).toBe(expected)
    expect(commentsSpy).toHaveBeenCalledOnce()
  })
})
