import { describe, expect, it } from 'vitest'
import {
  AmbientAnalysisCache,
  ambientAnalysisCacheKey,
  type AmbientAnalysisRequest,
} from './ambientAnalysisCache'
import type { AnalysisResponse } from './stockfishAnalysisClient'

const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function request(overrides: Partial<AmbientAnalysisRequest> = {}): AmbientAnalysisRequest {
  return {
    backend: 'browser',
    enginePath: null,
    fen,
    settings: {
      moveTimeMs: 250,
      depth: 12,
      nodes: null,
      multiPv: 1,
      threads: 1,
      hashMb: 64,
    },
    ...overrides,
  }
}

function response(overrides: Partial<AnalysisResponse> = {}): AnalysisResponse {
  return {
    requestId: 1,
    fen,
    engineName: 'Stockfish 18 Lite',
    enginePath: 'wasm://stockfish-18-lite-single',
    elapsedMs: 250,
    bestMove: 'e2e4',
    lines: [{
      multiPv: 1,
      depth: 12,
      seldepth: 18,
      score: { kind: 'cp', value: 24, bound: null },
      wdl: [120, 760, 120],
      nodes: 50_000,
      nps: 200_000,
      hashfull: 15,
      tbHits: 0,
      timeMs: 250,
      pv: ['e2e4', 'e7e5'],
    }],
    ...overrides,
  }
}

describe('AmbientAnalysisCache', () => {
  it('uses normalized effective settings for the same local analysis identity', () => {
    const canonical = request()
    const equivalent = request({
      enginePath: '   ',
      settings: { ...canonical.settings, moveTimeMs: 250.4, depth: 11.6 },
    })

    expect(ambientAnalysisCacheKey(equivalent)).toBe(ambientAnalysisCacheKey(canonical))
  })

  it('returns an independent hit only for the same backend, path, FEN and settings', () => {
    const cache = new AmbientAnalysisCache()
    const base = request({ backend: 'desktop', enginePath: '/opt/stockfish' })
    cache.set(base, response())

    const hit = cache.get(base)
    expect(hit).not.toBeNull()
    hit!.lines[0].pv[0] = 'd2d4'
    hit!.lines[0].score.value = 999

    expect(cache.get(base)?.lines[0]).toMatchObject({
      pv: ['e2e4', 'e7e5'],
      score: { value: 24 },
    })
    expect(cache.get(request({ ...base, backend: 'browser' }))).toBeNull()
    expect(cache.get(request({ ...base, enginePath: '/usr/bin/stockfish' }))).toBeNull()
    expect(cache.get(request({ ...base, fen: `${fen} stale` }))).toBeNull()
    expect(cache.get(request({ ...base, settings: { ...base.settings, multiPv: 2 } }))).toBeNull()
  })

  it('keeps recent review positions and evicts the least-recently-used result', () => {
    const cache = new AmbientAnalysisCache(2)
    const first = request()
    const second = request({ fen: fen.replace(' w ', ' b ') })
    const third = request({ fen: fen.replace(' 0 1', ' 1 1') })

    cache.set(first, response())
    cache.set(second, response({ fen: second.fen }))
    expect(cache.get(first)).not.toBeNull()
    cache.set(third, response({ fen: third.fen }))

    expect(cache.size).toBe(2)
    expect(cache.get(first)).not.toBeNull()
    expect(cache.get(second)).toBeNull()
    expect(cache.get(third)).not.toBeNull()
  })

  it('does not retain a response for another position', () => {
    const cache = new AmbientAnalysisCache()
    cache.set(request(), response({ fen: `${fen} stale` }))
    expect(cache.size).toBe(0)
    expect(cache.get(request())).toBeNull()
  })
})
