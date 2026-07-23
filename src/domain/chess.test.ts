import { describe, expect, it, vi } from 'vitest'
import { Chess } from 'chess.js'
import { cloneGame, cloneGameAtPly, evaluateMaterial, gameResult, gameStatus, gameSummary, onlyLegalMove, previewGameAtPly } from './chess'

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

  it('uses a verified current-game snapshot for a late history preview', () => {
    const game = new Chess()
    for (const move of ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']) {
      game.move(move)
    }
    const verbose = game.history({ verbose: true })
    const expected = cloneGameAtPly(new Chess().fen(), verbose, 9)
    const moveSpy = vi.spyOn(Chess.prototype, 'move')

    const preview = cloneGameAtPly(new Chess().fen(), verbose, 9, game)

    expect(moveSpy).not.toHaveBeenCalled()
    expect(preview.fen()).toBe(expected.fen())
    expect(preview.history()).toEqual(expected.history())
    expect(game.history()).toHaveLength(10)
    moveSpy.mockRestore()
  })

  it('falls back to prefix replay when the optional source game is not the requested history', () => {
    const game = new Chess()
    for (const move of ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6']) {
      game.move(move)
    }
    const verbose = game.history({ verbose: true })
    const moveSpy = vi.spyOn(Chess.prototype, 'move')

    const preview = cloneGameAtPly(new Chess().fen(), verbose, 9, new Chess())

    expect(moveSpy).toHaveBeenCalledTimes(9)
    expect(preview.history()).toEqual(game.history().slice(0, 9))
    moveSpy.mockRestore()
  })

  it('uses the stored historical FEN for a read-only preview without replaying moves', () => {
    const game = new Chess()
    for (const move of ['e4', 'e6', 'e5', 'd5', 'exd6', 'Bxd6', 'Nf3', 'Nf6', 'Be2', 'O-O', 'O-O', 'Re8']) {
      game.move(move)
    }
    const verbose = game.history({ verbose: true })
    const moveSpy = vi.spyOn(Chess.prototype, 'move')

    const enPassantPreview = previewGameAtPly(new Chess().fen(), verbose, 5)
    const castledPreview = previewGameAtPly(new Chess().fen(), verbose, 11)

    expect(moveSpy).not.toHaveBeenCalled()
    expect(enPassantPreview.fen()).toBe(verbose[4].after)
    expect(castledPreview.fen()).toBe(verbose[10].after)
    expect(enPassantPreview.history()).toEqual([])
    expect(castledPreview.history()).toEqual([])
    moveSpy.mockRestore()
  })

  it('falls back to the verified prefix replay when a read-only preview FEN is invalid', () => {
    const game = new Chess()
    game.move('e4')
    game.move('e5')
    const verbose = game.history({ verbose: true })
    const invalidHistory = [{ ...verbose[0], after: 'not a FEN' } as unknown as (typeof verbose)[number], verbose[1]]
    const moveSpy = vi.spyOn(Chess.prototype, 'move')

    const preview = previewGameAtPly(new Chess().fen(), invalidHistory, 1)

    expect(moveSpy).toHaveBeenCalledOnce()
    expect(preview.fen()).toBe(verbose[0].after)
    expect(preview.history()).toEqual(['e4'])
    moveSpy.mockRestore()
  })

  it('evaluates captured material from white perspective', () => {
    const game = new Chess()
    game.move('e4')
    game.move('d5')
    game.move('exd5')
    expect(evaluateMaterial(game, 'w')).toBe(100)
  })

  it('returns the only legal reply without asking an engine to choose one', () => {
    const forced = new Chess('7k/6Q1/8/8/8/8/6K1/8 b - - 0 1')

    expect(forced.moves()).toEqual(['Kxg7'])
    expect(onlyLegalMove(forced)).toEqual({ from: 'h8', to: 'g7' })
    expect(onlyLegalMove(new Chess())).toBeNull()
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

  it('keeps one complete board outcome aligned with the established status and result helpers', () => {
    const normal = new Chess()
    normal.move('e4')
    normal.move('e5')

    const mate = new Chess()
    for (const move of ['f3', 'e5', 'g4', 'Qh4#']) mate.move(move)

    const stalemate = new Chess('7k/5Q2/7K/8/8/8/8/8 b - - 0 1')
    const threefold = new Chess()
    for (const move of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) threefold.move(move)
    const insufficient = new Chess('8/8/8/8/8/8/4k3/7K w - - 0 1')
    const fiftyMove = new Chess('4k3/8/8/8/8/8/8/R3K3 w Q - 100 1')

    for (const game of [normal, mate, stalemate, threefold, insufficient, fiftyMove]) {
      expect(gameSummary(game)).toEqual({
        finished: game.isGameOver(),
        result: gameResult(game),
        status: gameStatus(game),
      })
    }
  })

  it('needs one legal-move generation for a normal position summary', () => {
    const game = new Chess()
    for (const move of ['e4', 'e5', 'Nf3', 'Nc6']) game.move(move)
    const moveGenerator = vi.spyOn(
      game as unknown as { _moves: () => unknown[] },
      '_moves',
    )

    expect(gameSummary(game)).toMatchObject({ finished: false, result: '*', status: 'White to move' })
    expect(moveGenerator).toHaveBeenCalledOnce()
  })
})
