import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { completedPgn } from './chess'

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
})
