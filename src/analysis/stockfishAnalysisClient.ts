import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { BrowserStockfishEngine } from '../engine/browserStockfish'
import { isTauriRuntime } from '../engine/runtime'
import type { AnalysisBound, AnalysisScoreKind } from './analysisModel'

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>

export interface AnalysisSettings {
  moveTimeMs: number
  depth: number | null
  nodes: number | null
  multiPv: number
  threads: number
  hashMb: number
}

export interface AnalysisLine {
  multiPv: number
  depth: number
  seldepth: number | null
  score: { kind: AnalysisScoreKind; value: number; bound: AnalysisBound }
  wdl: [number, number, number] | null
  nodes: number | null
  nps: number | null
  hashfull: number | null
  tbHits: number | null
  timeMs: number | null
  pv: string[]
}

export interface AnalysisResponse {
  requestId: number
  fen: string
  engineName: string
  enginePath: string
  elapsedMs: number
  bestMove: string | null
  lines: AnalysisLine[]
}

export const DEFAULT_ANALYSIS_SETTINGS: AnalysisSettings = {
  moveTimeMs: 800,
  depth: 18,
  nodes: null,
  multiPv: 3,
  threads: 1,
  hashMb: 64,
}

const defaultInvoke: Invoke = (command, args) => tauriInvoke(command, args)

function abortError(message: string): Error {
  return new DOMException(message, 'AbortError')
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isInteger(value: unknown, min: number, max: number): value is number {
  return Number.isInteger(value) && Number(value) >= min && Number(value) <= max
}

function isNullableInteger(value: unknown, min: number, max: number): value is number | null {
  return value === null || isInteger(value, min, max)
}

function isUciMove(value: unknown): value is string {
  return typeof value === 'string' && /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(value)
}

function isAnalysisLine(value: unknown): value is AnalysisLine {
  if (!isObject(value) || !isObject(value.score)) return false
  const wdl = value.wdl
  return isInteger(value.multiPv, 1, 5)
    && isInteger(value.depth, 0, 255)
    && isNullableInteger(value.seldepth, 0, 255)
    && (value.score.kind === 'cp' || value.score.kind === 'mate')
    && isInteger(value.score.value, -1_000_000, 1_000_000)
    && (value.score.bound === null || value.score.bound === 'lower' || value.score.bound === 'upper')
    && (wdl === null || (Array.isArray(wdl) && wdl.length === 3
      && wdl.every((item) => isInteger(item, 0, 1000))
      && wdl.reduce((sum, item) => sum + Number(item), 0) === 1000))
    && isNullableInteger(value.nodes, 0, Number.MAX_SAFE_INTEGER)
    && isNullableInteger(value.nps, 0, Number.MAX_SAFE_INTEGER)
    && isNullableInteger(value.hashfull, 0, 1000)
    && isNullableInteger(value.tbHits, 0, Number.MAX_SAFE_INTEGER)
    && isNullableInteger(value.timeMs, 0, 60_000)
    && Array.isArray(value.pv) && value.pv.length >= 1 && value.pv.length <= 128
    && value.pv.every(isUciMove)
}

function parseResponse(value: unknown): AnalysisResponse {
  if (!isObject(value)
    || !isInteger(value.requestId, 1, Number.MAX_SAFE_INTEGER)
    || typeof value.fen !== 'string'
    || typeof value.engineName !== 'string'
    || typeof value.enginePath !== 'string'
    || !isInteger(value.elapsedMs, 0, 60_000)
    || !(value.bestMove === null || isUciMove(value.bestMove))
    || !Array.isArray(value.lines)
    || value.lines.length > 5
    || !value.lines.every(isAnalysisLine)
    || new Set(value.lines.map((line) => (line as AnalysisLine).multiPv)).size !== value.lines.length) {
    throw new Error('Stockfish returned an invalid analysis response.')
  }
  return value as unknown as AnalysisResponse
}

function boundedInteger(value: number, fallback: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback
}

export function normalizeAnalysisSettings(value: Partial<AnalysisSettings>): AnalysisSettings {
  return {
    moveTimeMs: boundedInteger(value.moveTimeMs ?? DEFAULT_ANALYSIS_SETTINGS.moveTimeMs, DEFAULT_ANALYSIS_SETTINGS.moveTimeMs, 100, 10_000),
    depth: value.depth === null ? null : boundedInteger(value.depth ?? DEFAULT_ANALYSIS_SETTINGS.depth!, DEFAULT_ANALYSIS_SETTINGS.depth!, 1, 40),
    nodes: value.nodes === null || value.nodes === undefined ? null : boundedInteger(value.nodes, 100_000, 1_000, 100_000_000),
    multiPv: boundedInteger(value.multiPv ?? DEFAULT_ANALYSIS_SETTINGS.multiPv, DEFAULT_ANALYSIS_SETTINGS.multiPv, 1, 5),
    threads: boundedInteger(value.threads ?? DEFAULT_ANALYSIS_SETTINGS.threads, DEFAULT_ANALYSIS_SETTINGS.threads, 1, 32),
    hashMb: boundedInteger(value.hashMb ?? DEFAULT_ANALYSIS_SETTINGS.hashMb, DEFAULT_ANALYSIS_SETTINGS.hashMb, 16, 4096),
  }
}

export class StockfishAnalysisClient {
  private readonly invoke: Invoke | null
  private readonly browser: BrowserStockfishEngine | null
  private nextRequestId: number
  private activeRequestId: number | null = null

  constructor(invoke?: Invoke, initialRequestId = Date.now()) {
    const desktop = isTauriRuntime()
    this.invoke = invoke ?? (desktop ? defaultInvoke : null)
    this.browser = invoke || desktop ? null : new BrowserStockfishEngine()
    this.nextRequestId = initialRequestId
  }

  async analyze(
    fen: string,
    enginePath: string | null,
    settings: AnalysisSettings = DEFAULT_ANALYSIS_SETTINGS,
  ): Promise<AnalysisResponse> {
    this.cancel()
    const requestId = this.nextRequestId++
    this.activeRequestId = requestId
    const normalized = normalizeAnalysisSettings(settings)
    let raw: unknown
    try {
      if (this.browser) {
        const result = await this.browser.analyze(fen, normalized)
        raw = {
          requestId,
          fen,
          engineName: result.engineName,
          enginePath: result.enginePath,
          elapsedMs: result.elapsedMs,
          bestMove: result.bestMove,
          lines: result.lines,
        }
      } else {
        raw = await this.invoke!('stockfish_analyze', {
          request: { requestId, fen, enginePath, settings: normalized },
        })
      }
    } catch (error) {
      if (this.activeRequestId !== requestId) throw abortError('Stockfish analysis was cancelled.')
      this.activeRequestId = null
      throw error
    }
    const response = parseResponse(raw)
    if (this.activeRequestId !== requestId || response.requestId !== requestId || response.fen !== fen) {
      throw abortError('Discarded stale Stockfish analysis.')
    }
    this.activeRequestId = null
    return response
  }

  cancel(): void {
    this.browser?.cancel()
    if (this.activeRequestId === null) return
    const requestId = this.activeRequestId
    this.activeRequestId = null
    if (this.invoke) void this.invoke('stockfish_analysis_stop', { requestId }).catch(() => undefined)
  }

  dispose(): void {
    this.cancel()
    this.browser?.dispose()
  }
}
