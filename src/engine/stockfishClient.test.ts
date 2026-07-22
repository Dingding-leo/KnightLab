import { describe, expect, it, vi } from 'vitest'
import {
  HybridEngineClient,
  StockfishClient,
  isTauriRuntime,
  parseUciMove,
  type StockfishCommandResponse,
} from './stockfishClient'
import { DEFAULT_ENGINE_SETTINGS } from './engineSettings'

const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function response(overrides: Partial<StockfishCommandResponse> = {}): StockfishCommandResponse {
  return {
    requestId: 1,
    fen,
    bestMove: 'e2e4',
    ponder: 'e7e5',
    engineName: 'Stockfish 18',
    enginePath: '/opt/homebrew/bin/stockfish',
    elapsedMs: 18,
    depth: 12,
    nodes: 10_000,
    nps: 500_000,
    ...overrides,
  }
}

describe('Stockfish desktop runtime detection', () => {
  it('detects Tauri without touching browser-only globals', () => {
    expect(isTauriRuntime({ __TAURI_INTERNALS__: {} })).toBe(true)
    expect(isTauriRuntime({})).toBe(false)
  })
})

describe('Hybrid engine startup', () => {
  it('does not create either browser worker until a bot move or explicit verification needs one', () => {
    const worker = vi.fn()
    vi.stubGlobal('Worker', worker)
    const client = new HybridEngineClient()

    expect(worker).not.toHaveBeenCalled()
    client.dispose()
  })
})

describe('UCI move parsing', () => {
  it('parses normal and promotion moves', () => {
    expect(parseUciMove('e2e4')).toEqual({ from: 'e2', to: 'e4', promotion: undefined })
    expect(parseUciMove('e7e8q')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' })
  })

  it('rejects malformed or unsupported moves', () => {
    expect(parseUciMove('e9e4')).toBeNull()
    expect(parseUciMove('e2e4x')).toBeNull()
    expect(parseUciMove('(none)')).toBeNull()
  })
})

describe('StockfishClient', () => {
  it('returns a typed move only for the matching request and FEN', async () => {
    const invoke = vi.fn(async () => response())
    const client = new StockfishClient(invoke)

    await expect(client.search(fen, 'balanced')).resolves.toMatchObject({
      move: { from: 'e2', to: 'e4' },
      engineName: 'Stockfish 18',
    })
  })

  it('sends the normalized executable path and advanced settings', async () => {
    const invoke = vi.fn(async () => response())
    const client = new StockfishClient(invoke)

    await client.search(fen, 'balanced', {
      ...DEFAULT_ENGINE_SETTINGS,
      enginePath: '/opt/local/bin/stockfish',
      profile: 'custom',
      threads: 4,
      hashMb: 256,
      depth: 16,
    })

    expect(invoke).toHaveBeenCalledWith('stockfish_best_move', {
      request: expect.objectContaining({
        enginePath: '/opt/local/bin/stockfish',
        settings: expect.objectContaining({ profile: 'custom', threads: 4, hashMb: 256, depth: 16 }),
      }),
    })
  })

  it('probes automatic and explicit engines without starting a search', async () => {
    const invoke = vi.fn(async () => ({
      engineName: 'Stockfish 18',
      enginePath: '/opt/homebrew/bin/stockfish',
    }))
    const client = new StockfishClient(invoke)

    await expect(client.probe(null)).resolves.toEqual({
      engineName: 'Stockfish 18',
      enginePath: '/opt/homebrew/bin/stockfish',
    })
    expect(invoke).toHaveBeenCalledWith('stockfish_probe', { enginePath: null })
  })

  it('rejects stale responses by both request id and FEN', async () => {
    const staleId = new StockfishClient(vi.fn(async () => response({ requestId: 99 })))
    await expect(staleId.search(fen, 'strong')).rejects.toMatchObject({ name: 'AbortError' })

    const staleFen = new StockfishClient(vi.fn(async () => response({ fen: `${fen} stale` })))
    await expect(staleFen.search(fen, 'strong')).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('invalidates the request and sends a non-blocking stop command on cancel', async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === 'stockfish_best_move') return response()
      return null
    })
    const client = new StockfishClient(invoke)
    const pending = client.search(fen, 'easy')
    client.cancel()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(invoke).toHaveBeenCalledWith('stockfish_stop', { requestId: 1 })
  })
})
