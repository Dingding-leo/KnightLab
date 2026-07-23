import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import type { BotLevel, MoveInput } from '../domain/chess'
import { BrowserStockfishEngine } from './browserStockfish'
import { BotWorkerClient } from './botWorkerClient'
import {
  normalizePlayCandidates,
  parseUciMove,
  type EngineCandidate,
} from './playCandidates'
import {
  DEFAULT_ENGINE_SETTINGS,
  type EngineSettings,
} from './engineSettings'
import { resolvePlayEngineBudget } from './playEngineBudget'
export { isTauriRuntime } from './runtime'
import { isTauriRuntime } from './runtime'

export interface StockfishCommandResponse {
  requestId: number
  fen: string
  bestMove: string | null
  ponder: string | null
  engineName: string
  enginePath: string
  elapsedMs: number
  depth: number | null
  nodes: number | null
  nps: number | null
  lines?: unknown[]
}

export interface EngineSearchResult {
  move: MoveInput | null
  ponder: MoveInput | null
  /** Alternatives from the same bounded search, never a separate engine call. */
  candidates: EngineCandidate[]
  /** Local providers are rules-validated in Play and do not start an engine search. */
  provider: 'stockfish' | 'knightbot' | 'opening-cue' | 'forced-move'
  engineName: string
  enginePath?: string
  elapsedMs?: number
  depth?: number | null
  nodes?: number | null
  nps?: number | null
  warning?: string
}

export { parseUciMove } from './playCandidates'

export interface StockfishProbeResult {
  engineName: string
  enginePath: string
}

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>

function abortError(message: string): Error {
  return new DOMException(message, 'AbortError')
}

const defaultInvoke: Invoke = (command, args) => tauriInvoke(command, args)

export class StockfishClient {
  private readonly invoke: Invoke
  private nextRequestId = 1
  private activeRequestId: number | null = null

  constructor(invoke: Invoke = defaultInvoke, initialRequestId = 1) {
    this.invoke = invoke
    this.nextRequestId = initialRequestId
  }

  async search(
    fen: string,
    level: BotLevel,
    settings: EngineSettings = DEFAULT_ENGINE_SETTINGS,
    candidateCount?: 1 | 2,
  ): Promise<EngineSearchResult> {
    this.cancel()
    const requestId = this.nextRequestId++
    this.activeRequestId = requestId
    // `stockfish_best_move` is the live Play boundary. Keep custom/Elo
    // preferences from accidentally turning each bot turn into a Review-size
    // calculation; the same cap is independently enforced by the native
    // command for a renderer that bypasses this client.
    const normalized = resolvePlayEngineBudget(level, settings)
    const { enginePath, ...searchSettings } = normalized
    let raw: unknown
    try {
      raw = await this.invoke('stockfish_best_move', {
        request: {
          requestId,
          fen,
          level,
          enginePath,
          settings: searchSettings,
          ...(candidateCount === undefined ? {} : { candidateCount }),
        },
      })
    } catch (error) {
      if (this.activeRequestId !== requestId) {
        throw abortError('Stockfish search was cancelled.')
      }
      this.activeRequestId = null
      throw error
    }
    const response = raw as StockfishCommandResponse
    if (this.activeRequestId !== requestId || response.requestId !== requestId || response.fen !== fen) {
      throw abortError('Discarded a stale Stockfish response.')
    }
    this.activeRequestId = null
    const move = parseUciMove(response.bestMove)
    if (response.bestMove && !move) throw new Error('Stockfish returned an invalid UCI move.')
    return {
      move,
      ponder: parseUciMove(response.ponder),
      candidates: normalizePlayCandidates(response.lines),
      provider: 'stockfish',
      engineName: response.engineName,
      enginePath: response.enginePath,
      elapsedMs: response.elapsedMs,
      depth: response.depth,
      nodes: response.nodes,
      nps: response.nps,
    }
  }

  async probe(enginePath: string | null): Promise<StockfishProbeResult> {
    const raw = await this.invoke('stockfish_probe', { enginePath })
    const response = raw as Partial<StockfishProbeResult>
    if (typeof response.engineName !== 'string' || typeof response.enginePath !== 'string') {
      throw new Error('Stockfish probe returned an invalid response.')
    }
    return { engineName: response.engineName, enginePath: response.enginePath }
  }

  cancel(): void {
    if (this.activeRequestId === null) return
    const requestId = this.activeRequestId
    this.activeRequestId = null
    void this.invoke('stockfish_stop', { requestId }).catch(() => undefined)
  }
}

export class HybridEngineClient {
  private readonly stockfish = new StockfishClient(defaultInvoke, Date.now())
  // Both browser engines allocate a Worker when constructed. Keep them absent
  // until a player actually asks the bot to move (or explicitly verifies it),
  // so opening a board is idle and does not compete with first paint.
  private browserStockfish: BrowserStockfishEngine | null = null
  private fallback: BotWorkerClient | null = null
  private readonly desktop = isTauriRuntime()
  private disposed = false

  async search(
    fen: string,
    level: BotLevel,
    settings: EngineSettings = DEFAULT_ENGINE_SETTINGS,
    candidateCount?: 1 | 2,
  ): Promise<EngineSearchResult> {
    if (this.disposed) throw new Error('Engine client is disposed.')
    if (this.desktop) {
      try {
        return await this.stockfish.search(fen, level, settings, candidateCount)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error
        const move = await this.fallbackClient().search(fen, level)
        return {
          move,
          ponder: null,
          candidates: [],
          provider: 'knightbot',
          engineName: 'KnightBot fallback',
          warning: error instanceof Error ? error.message : 'Stockfish was unavailable.',
        }
      }
    }
    try {
      const result = await this.browserEngine().searchMove(fen, level, settings, candidateCount)
      return {
        move: parseUciMove(result.bestMove),
        ponder: parseUciMove(result.ponder),
        candidates: normalizePlayCandidates(result.lines),
        provider: 'stockfish',
        engineName: result.engineName,
        enginePath: result.enginePath,
        elapsedMs: result.elapsedMs,
        depth: result.depth,
        nodes: result.nodes,
        nps: result.nps,
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error
      return {
        move: await this.fallbackClient().search(fen, level),
        ponder: null,
        candidates: [],
        provider: 'knightbot',
        engineName: 'KnightBot browser fallback',
        warning: error instanceof Error ? error.message : 'Browser Stockfish was unavailable.',
      }
    }
  }

  async probe(enginePath: string | null): Promise<StockfishProbeResult> {
    return this.desktop ? this.stockfish.probe(enginePath) : this.browserEngine().probe()
  }

  cancel(): void {
    this.stockfish.cancel()
    this.browserStockfish?.cancel()
    this.fallback?.cancel()
  }

  /**
   * Release Play's retained browser workers once their caller has confirmed
   * they are idle. This frees both the Stockfish hash and a fallback Worker so
   * Review, Train and the rest of the shell do not inherit a past game's
   * allocation. Native Stockfish remains owned by its desktop pool.
   */
  releaseIdleBrowserRuntime(): void {
    if (this.disposed || this.desktop) return
    this.browserStockfish?.dispose()
    this.browserStockfish = null
    this.fallback?.dispose()
    this.fallback = null
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.stockfish.cancel()
    this.browserStockfish?.dispose()
    this.fallback?.dispose()
  }

  private browserEngine(): BrowserStockfishEngine {
    this.browserStockfish ??= new BrowserStockfishEngine()
    return this.browserStockfish
  }

  private fallbackClient(): BotWorkerClient {
    this.fallback ??= new BotWorkerClient()
    return this.fallback
  }
}
