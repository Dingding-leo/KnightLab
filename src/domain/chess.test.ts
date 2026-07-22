import { describe, expect, it, vi } from 'vitest'
import { Chess } from 'chess.js'
import { cloneGame, cloneGameAtPly, evaluateMaterial, gameResult, gameStatus } from './chess'

describe('chess domain', () => {
  it('clones move history and current position', () => {
    const game = new Chess()
    game.move('e4')
    game.move('c5')
    const clone = cloneGame(game)
    expect(clone.fen()).toBe(game.fen())
    expect(clone.history()).toEqual(['e4', 'c5'])
  })

  it('can reuse a verbose history snapshot without changing the clone', () => {
    const game = new Chess()
    for (const move of ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']) {
      game.move(move)
    }

    const fallback = cloneGame(game)
    const fromSnapshot = cloneGame(game, undefined, game.history({ verbose: true }))

    expect(fromSnapshot.fen()).toBe(fallback.fen())
    expect(fromSnapshot.history()).toEqual(fallback.history())
    expect(fromSnapshot.pgn()).toBe(fallback.pgn())
  })

  it('uses an independent native snapshot for a current game without replaying every move', () => {
    const game = new Chess()
    for (const move of ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']) {
      game.move(move)
    }
    const moveSpy = vi.spyOn(Chess.prototype, 'move')

    const clone = cloneGame(game)

    expect(moveSpy).not.toHaveBeenCalled()
    clone.move('Be2')
    expect(clone.history()).toEqual([...game.history(), 'Be2'])
    expect(game.history()).not.toContain('Be2')
    moveSpy.mockRestore()
  })

  it('rebuilds a bounded historical position from cached moves without changing a custom-start game', () => {
    const startFen = '4k3/8/8/8/8/8/8/4K3 w - - 0 1'
    const game = new Chess(startFen)
    game.move('Kd2')
    game.move('Kd7')
    const verbose = game.history({ verbose: true })

    const preview = cloneGameAtPly(startFen, verbose, 1)

    expect(preview.history()).toEqual(['Kd2'])
    expect(preview.fen()).toBe('4k3/8/8/8/8/8/3K4/8 b - - 1 1')
    expect(game.history()).toEqual(['Kd2', 'Kd7'])
    expect(cloneGameAtPly(startFen, verbose, -1).fen()).toBe(startFen)
    expect(cloneGameAtPly(startFen, verbose, 99).history()).toEqual(game.history())
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
