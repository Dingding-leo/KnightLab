import { describe, expect, it, vi } from 'vitest'
import { StockfishAnalysisClient, type AnalysisResponse } from './stockfishAnalysisClient'

const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function response(overrides: Partial<AnalysisResponse> = {}): AnalysisResponse {
  return {
    requestId: 10,
    fen,
    engineName: 'Stockfish 18',
    enginePath: '/opt/homebrew/bin/stockfish',
    elapsedMs: 802,
    bestMove: 'e2e4',
    lines: [{
      multiPv: 1,
      depth: 18,
      seldepth: 26,
      score: { kind: 'cp', value: 31, bound: null },
      wdl: [120, 820, 60],
      nodes: 250_000,
      nps: 600_000,
      hashfull: 42,
      tbHits: 0,
      timeMs: 800,
      pv: ['e2e4', 'e7e5', 'g1f3'],
    }],
    ...overrides,
  }
}

describe('StockfishAnalysisClient', () => {
  it('sends bounded analysis resources without Elo weakening settings', async () => {
    const invoke = vi.fn(async () => response())
    const client = new StockfishAnalysisClient(invoke, 10)
    await client.analyze(fen, '/opt/homebrew/bin/stockfish', {
      moveTimeMs: 800, depth: 18, nodes: null, multiPv: 3, threads: 2, hashMb: 128,
    })
    expect(invoke).toHaveBeenCalledWith('stockfish_analyze', {
      request: {
        requestId: 10,
        fen,
        enginePath: '/opt/homebrew/bin/stockfish',
        settings: { moveTimeMs: 800, depth: 18, nodes: null, multiPv: 3, threads: 2, hashMb: 128 },
      },
    })
  })

  it('rejects stale IDs and FENs before exposing engine lines', async () => {
    const staleId = new StockfishAnalysisClient(vi.fn(async () => response({ requestId: 11 })), 10)
    await expect(staleId.analyze(fen, null)).rejects.toMatchObject({ name: 'AbortError' })
    const staleFen = new StockfishAnalysisClient(vi.fn(async () => response({ fen: `${fen} stale` })), 10)
    await expect(staleFen.analyze(fen, null)).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('rejects malformed metrics and sends stop when cancelled', async () => {
    const malformed = new StockfishAnalysisClient(vi.fn(async () => response({
      lines: [{ ...response().lines[0], pv: ['e2e9'] }],
    })), 10)
    await expect(malformed.analyze(fen, null)).rejects.toThrow('invalid analysis response')

    const invoke = vi.fn(async (command: string) => command === 'stockfish_analyze' ? response() : undefined)
    const client = new StockfishAnalysisClient(invoke, 10)
    const pending = client.analyze(fen, null)
    client.cancel()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(invoke).toHaveBeenCalledWith('stockfish_analysis_stop', { requestId: 10 })
  })
})
