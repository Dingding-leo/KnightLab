import { Chess } from 'chess.js'
import { describe, expect, it, vi } from 'vitest'
import { requestPlayMove } from './playMoveRequest'
import type { EngineSearchResult } from './stockfishClient'

const engineResult: EngineSearchResult = {
  move: { from: 'e7', to: 'e5' },
  ponder: null,
  candidates: [],
  provider: 'stockfish',
  engineName: 'Stockfish',
}

describe('Play move request', () => {
  it('keeps an authored opening cue ahead of rules and engine work', async () => {
    const search = vi.fn(async () => engineResult)

    const result = await requestPlayMove({
      game: new Chess(),
      openingMove: { from: 'e2', to: 'e4' },
      search,
    })

    expect(result).toMatchObject({ provider: 'opening-cue', move: { from: 'e2', to: 'e4' } })
    expect(search).not.toHaveBeenCalled()
  })

  it('does not invoke the engine when chess rules prove the only reply', async () => {
    const search = vi.fn(async () => engineResult)

    const result = await requestPlayMove({
      game: new Chess('7k/6Q1/8/8/8/8/6K1/8 b - - 0 1'),
      openingMove: null,
      search,
    })

    expect(result).toMatchObject({ provider: 'forced-move', move: { from: 'h8', to: 'g7' } })
    expect(search).not.toHaveBeenCalled()
  })

  it('uses the bounded engine request only when the bot has a choice', async () => {
    const search = vi.fn(async () => engineResult)

    await expect(requestPlayMove({ game: new Chess(), openingMove: null, search })).resolves.toBe(engineResult)
    expect(search).toHaveBeenCalledOnce()
  })
})
