import { describe, expect, it, vi } from 'vitest'
import { createPgnTimeline } from '../analysis/analysisModel'
import type { AnalysisResponse, AnalysisSettings } from '../analysis/stockfishAnalysisClient'
import { runGameReview } from './gameReviewRunner'

const settings: AnalysisSettings = { moveTimeMs: 100, depth: 12, nodes: null, multiPv: 2, threads: 1, hashMb: 16 }

function response(fen: string, move: string): AnalysisResponse {
  return {
    requestId: 1,
    fen,
    engineName: 'Fakefish',
    enginePath: '/fake',
    elapsedMs: 10,
    bestMove: move,
    lines: [{
      multiPv: 1, depth: 12, seldepth: null,
      score: { kind: 'cp', value: 0, bound: null }, wdl: null,
      nodes: 10, nps: 1000, hashfull: 0, tbHits: 0, timeMs: 10, pv: [move],
    }],
  }
}

describe('full-game review runner', () => {
  it('analyses before and after every ply and reports monotonic progress', async () => {
    const timeline = createPgnTimeline('1. e4 e5')
    const moves = ['e2e4', 'e7e5', 'e7e5', 'g1f3']
    const analyze = vi.fn(async (fen: string) => response(fen, moves.shift()!))
    const progress: number[] = []
    const result = await runGameReview(timeline, analyze, settings, (value) => progress.push(value.completedPly))
    expect(analyze).toHaveBeenCalledTimes(4)
    expect(progress).toEqual([0, 0, 1, 1, 2])
    expect(result.moves).toHaveLength(2)
    expect(result.engineName).toBe('Fakefish')
  })

  it('stops before the next engine request when aborted', async () => {
    const timeline = createPgnTimeline('1. e4 e5 2. Nf3')
    const controller = new AbortController()
    const analyze = vi.fn(async (fen: string) => {
      controller.abort()
      return response(fen, 'e2e4')
    })
    await expect(runGameReview(timeline, analyze, settings, undefined, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(analyze).toHaveBeenCalledTimes(1)
  })

  it('uses the rules-layer result instead of asking Stockfish to analyse checkmate', async () => {
    const timeline = createPgnTimeline('1. f3 e5 2. g4 Qh4# 0-1')
    const replies = ['f2f3', 'e7e5', 'e7e5', 'g2g4', 'g2g4', 'd8h4', 'd8h4']
    const analyze = vi.fn(async (fen: string) => response(fen, replies.shift()!))
    const result = await runGameReview(timeline, analyze, settings)
    expect(analyze).toHaveBeenCalledTimes(7)
    expect(result.moves[3]).toMatchObject({ san: 'Qh4#', isBestMove: true, accuracy: 100 })
  })
})
