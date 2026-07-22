import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import {
  MAX_VARIATION_PLIES,
  appendVariationMove,
  createVariationState,
  resetVariation,
  undoVariationMove,
  variationPgn,
} from './variationLine'

function stateAt(fen: string, ply = 0) {
  const state = createVariationState(fen, ply)
  if (!state) throw new Error('Expected a valid variation state.')
  return state
}

describe('temporary analysis variations', () => {
  it('keeps the exact main-line anchor and creates canonical SAN moves', () => {
    const game = new Chess()
    game.move('e4')
    const anchorFen = game.fen()
    const initial = stateAt(anchorFen, 1)
    const next = appendVariationMove(initial, { from: 'c7', to: 'c5' })

    expect(initial.line).toEqual({ anchorFen, anchorPly: 1, moves: [] })
    expect(next).toMatchObject({
      line: {
        anchorFen,
        anchorPly: 1,
        moves: [{ color: 'b', moveNumber: 1, san: 'c5', from: 'c7', to: 'c5' }],
      },
      position: { lastMove: { from: 'c7', to: 'c5' } },
    })
    expect(new Chess(next?.position.fen).turn()).toBe('w')
  })

  it('rejects an illegal move without changing the current variation', () => {
    const initial = stateAt(new Chess().fen())

    expect(appendVariationMove(initial, { from: 'e2', to: 'e5' })).toBeNull()
    expect(initial.line.moves).toEqual([])
    expect(initial.position.fen).toBe(new Chess().fen())
  })

  it('keeps the chosen underpromotion and replays it exactly', () => {
    const initial = stateAt('7k/P7/8/8/8/8/8/7K w - - 0 1')
    const next = appendVariationMove(initial, { from: 'a7', to: 'a8', promotion: 'n' })

    expect(next?.line.moves).toEqual([{ color: 'w', moveNumber: 1, san: 'a8=N', from: 'a7', to: 'a8', promotion: 'n' }])
    expect(new Chess(next?.position.fen).get('a8')).toMatchObject({ type: 'n', color: 'w' })
  })

  it('undoes and resets only temporary plies, restoring the anchor exactly', () => {
    const initial = stateAt(new Chess().fen(), 0)
    const one = appendVariationMove(initial, { from: 'e2', to: 'e4' })
    if (!one) throw new Error('Expected a legal variation move.')
    const two = appendVariationMove(one, { from: 'e7', to: 'e5' })
    if (!two) throw new Error('Expected a second legal variation move.')

    const undone = undoVariationMove(two)
    const reset = resetVariation(two)

    // PGN export retains its private replay cache, so an immediately following
    // undo must still restore the line rather than a stale displayed FEN.
    expect(variationPgn(two)).toContain('1. e4 e5')
    expect(undone?.line.moves.map((move) => move.san)).toEqual(['e4'])
    expect(undone?.position.fen).toBe(one.position.fen)
    expect(variationPgn(undone!)).toContain('1. e4')
    expect(reset?.line.moves).toEqual([])
    expect(reset?.position.fen).toBe(initial.position.fen)
    expect(reset?.line.anchorPly).toBe(0)
  })

  it('exports a standalone PGN with the source FEN for a mid-game branch', () => {
    const source = new Chess()
    source.move('e4')
    source.move('e5')
    const initial = stateAt(source.fen(), 2)
    const one = appendVariationMove(initial, { from: 'g1', to: 'f3' })
    if (!one) throw new Error('Expected a legal variation move.')
    const two = appendVariationMove(one, { from: 'b8', to: 'c6' })
    if (!two) throw new Error('Expected a legal variation move.')

    const pgn = variationPgn(two)
    expect(pgn).toContain('[SetUp "1"]')
    expect(pgn).toContain(`[FEN "${initial.line.anchorFen}"]`)
    expect(pgn).toContain('2. Nf3 Nc6')
    const replay = new Chess()
    replay.loadPgn(pgn ?? '')
    expect(replay.fen()).toBe(two.position.fen)
  })

  it('keeps a standard-start branch concise and bounds replay work', () => {
    const standard = appendVariationMove(stateAt(new Chess().fen()), { from: 'e2', to: 'e4' })
    expect(variationPgn(standard!)).not.toContain('[SetUp "1"]')
    expect(variationPgn(standard!)).not.toContain('[FEN "')

    let state = stateAt(new Chess().fen())
    const cycle = [
      { from: 'g1' as const, to: 'f3' as const },
      { from: 'g8' as const, to: 'f6' as const },
      { from: 'f3' as const, to: 'g1' as const },
      { from: 'f6' as const, to: 'g8' as const },
    ]
    for (let index = 0; index < MAX_VARIATION_PLIES; index += 1) {
      const next = appendVariationMove(state, cycle[index % cycle.length]!)
      if (!next) throw new Error(`Expected a legal move at variation ply ${index + 1}.`)
      state = next
    }

    expect(state.line.moves).toHaveLength(MAX_VARIATION_PLIES)
    expect(appendVariationMove(state, cycle[0]!)).toBeNull()
  })

  it('does not export an empty line and fails closed for stale or forged public state', () => {
    const initial = stateAt(new Chess().fen())
    const next = appendVariationMove(initial, { from: 'e2', to: 'e4' })
    if (!next) throw new Error('Expected a legal variation move.')
    const stale = { ...next, position: { ...next.position, fen: initial.position.fen } }
    const forged = {
      ...next,
      line: { ...next.line, moves: [{ ...next.line.moves[0]!, san: 'Qh5' }] },
    }

    expect(variationPgn(initial)).toBeNull()
    expect(appendVariationMove(stale, { from: 'e7', to: 'e5' })).toBeNull()
    expect(variationPgn(forged)).toBeNull()
    expect(createVariationState(initial.position.fen, -1)).toBeNull()
    expect(createVariationState(initial.position.fen, 1.5)).toBeNull()
  })
})
