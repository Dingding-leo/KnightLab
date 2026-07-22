import type { BotLevel } from '../domain/chess'
import {
  DEFAULT_ENGINE_SETTINGS,
  normalizeEngineSettings,
  type EngineSettings,
} from './engineSettings'

const ENGINE_PATH = 'wasm://stockfish-18-lite-single'
const ENGINE_FILE = 'stockfish/stockfish-18-lite-single.js'
const STARTUP_TIMEOUT_MS = 30_000
const READY_TIMEOUT_MS = 5_000
const STOP_TIMEOUT_MS = 1_500
const MAX_BROWSER_HASH_MB = 128

export interface BrowserAnalysisLine {
  multiPv: number
  depth: number
  seldepth: number | null
  score: { kind: 'cp' | 'mate'; value: number; bound: 'lower' | 'upper' | null }
  wdl: [number, number, number] | null
  nodes: number | null
  nps: number | null
  hashfull: number | null
  tbHits: number | null
  timeMs: number | null
  pv: string[]
}

export interface BrowserSearchResult {
  engineName: string
  enginePath: string
  bestMove: string | null
  ponder: string | null
  elapsedMs: number
  depth: number | null
  nodes: number | null
  nps: number | null
  lines: BrowserAnalysisLine[]
}

export interface BrowserSearchOptions {
  moveTimeMs: number
  depth: number | null
  nodes: number | null
  multiPv: number
  hashMb: number
  elo: number
  skillLevel: number
  limitStrength: boolean
  showWdl: boolean
}

export interface StockfishWorker {
  onmessage: ((event: MessageEvent<unknown>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: unknown): void
  terminate(): void
}

type WorkerFactory = () => StockfishWorker

interface LineWaiter {
  predicate: (line: string) => boolean
  resolve: (line: string) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface ActiveSearch {
  onLine: (line: string) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface SearchOperation {
  abort: () => void
}

function abortError(message = 'Stockfish search was cancelled.'): Error {
  return new DOMException(message, 'AbortError')
}

function isUciMove(value: string): boolean {
  return /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(value)
}

function boundedInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)))
}

function fieldInteger(
  fields: string[],
  name: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): number | null {
  const index = fields.indexOf(name)
  if (index < 0 || index + 1 >= fields.length) return null
  const value = Number(fields[index + 1])
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : null
}

export function parseBrowserAnalysisInfo(line: string): BrowserAnalysisLine | null {
  const fields = line.trim().split(/\s+/)
  if (fields[0] !== 'info') return null

  const depth = fieldInteger(fields, 'depth', 0, 255)
  const scoreIndex = fields.indexOf('score')
  const pvIndex = fields.indexOf('pv')
  if (depth === null || scoreIndex < 0 || pvIndex < 0 || pvIndex + 1 >= fields.length) return null

  const scoreKind = fields[scoreIndex + 1]
  const scoreValue = Number(fields[scoreIndex + 2])
  if ((scoreKind !== 'cp' && scoreKind !== 'mate')
    || !Number.isSafeInteger(scoreValue)
    || Math.abs(scoreValue) > 1_000_000) return null

  const pv = fields.slice(pvIndex + 1)
  if (pv.length > 128 || pv.some((move) => !isUciMove(move))) return null

  const multiPv = fieldInteger(fields, 'multipv', 1, 5) ?? 1
  const boundToken = fields[scoreIndex + 3]
  const bound = boundToken === 'lowerbound' ? 'lower'
    : boundToken === 'upperbound' ? 'upper'
      : null

  const wdlIndex = fields.indexOf('wdl')
  let wdl: [number, number, number] | null = null
  if (wdlIndex >= 0) {
    const values = fields.slice(wdlIndex + 1, wdlIndex + 4).map(Number)
    if (values.length === 3
      && values.every((value) => Number.isInteger(value) && value >= 0 && value <= 1000)
      && values.reduce((sum, value) => sum + value, 0) === 1000) {
      wdl = values as [number, number, number]
    }
  }

  return {
    multiPv,
    depth,
    seldepth: fieldInteger(fields, 'seldepth', 0, 255),
    score: { kind: scoreKind, value: scoreValue, bound },
    wdl,
    nodes: fieldInteger(fields, 'nodes'),
    nps: fieldInteger(fields, 'nps'),
    hashfull: fieldInteger(fields, 'hashfull', 0, 1000),
    tbHits: fieldInteger(fields, 'tbhits'),
    timeMs: fieldInteger(fields, 'time', 0, 60_000),
    pv,
  }
}

function playPreset(level: BotLevel): BrowserSearchOptions {
  if (level === 'easy') {
    return { moveTimeMs: 80, depth: null, nodes: 10_000, multiPv: 1, hashMb: 16, elo: 1320, skillLevel: 2, limitStrength: true, showWdl: false }
  }
  if (level === 'strong') {
    return { moveTimeMs: 280, depth: null, nodes: 70_000, multiPv: 1, hashMb: 32, elo: 2200, skillLevel: 14, limitStrength: true, showWdl: false }
  }
  return { moveTimeMs: 160, depth: null, nodes: 30_000, multiPv: 1, hashMb: 16, elo: 1700, skillLevel: 8, limitStrength: true, showWdl: false }
}

export function resolveBrowserPlayOptions(
  level: BotLevel,
  settings: EngineSettings = DEFAULT_ENGINE_SETTINGS,
): BrowserSearchOptions {
  const normalized = normalizeEngineSettings(settings)
  if (normalized.profile === 'preset') return playPreset(level)
  return {
    moveTimeMs: normalized.moveTimeMs,
    depth: normalized.depth,
    nodes: normalized.nodes,
    multiPv: normalized.multiPv,
    hashMb: Math.min(normalized.hashMb, MAX_BROWSER_HASH_MB),
    elo: normalized.elo,
    skillLevel: normalized.skillLevel,
    limitStrength: normalized.profile === 'elo' || normalized.limitStrength,
    showWdl: false,
  }
}

export function browserStockfishUrl(
  locationHref = globalThis.location?.href ?? 'http://localhost/',
): string {
  const applicationBase = new URL(import.meta.env.BASE_URL, locationHref)
  return new URL(ENGINE_FILE, applicationBase).href
}

function defaultWorkerFactory(): StockfishWorker {
  if (typeof Worker !== 'function' || typeof WebAssembly !== 'object') {
    throw new Error('This browser does not support the WebAssembly chess engine.')
  }
  return new Worker(browserStockfishUrl())
}

function bestMoveFromLine(line: string): { bestMove: string | null; ponder: string | null } | null {
  const fields = line.trim().split(/\s+/)
  if (fields[0] !== 'bestmove') return null
  const rawMove = fields[1]
  if (!rawMove) throw new Error('Stockfish omitted its best move.')
  const bestMove = rawMove === '(none)' || rawMove === '0000' ? null : rawMove
  if (bestMove && !isUciMove(bestMove)) throw new Error('Stockfish returned an invalid best move.')
  const ponderIndex = fields.indexOf('ponder')
  const ponder = ponderIndex >= 0 ? fields[ponderIndex + 1] ?? null : null
  if (ponderIndex >= 0 && !ponder) throw new Error('Stockfish omitted its ponder move.')
  if (ponder && !isUciMove(ponder)) throw new Error('Stockfish returned an invalid ponder move.')
  return { bestMove, ponder }
}

function preferAnalysisLine(current: BrowserAnalysisLine | undefined, next: BrowserAnalysisLine): boolean {
  if (!current) return true
  if (current.score.bound === null && next.score.bound !== null) return false
  if (current.score.bound !== null && next.score.bound === null) return true
  return next.depth >= current.depth
}

export class BrowserStockfishEngine {
  private readonly workerFactory: WorkerFactory
  private worker: StockfishWorker | null = null
  private ready = false
  private initialization: Promise<void> | null = null
  private engineName = 'Stockfish 18 Lite'
  private readonly waiters = new Set<LineWaiter>()
  private activeSearch: ActiveSearch | null = null
  private activeOperation: SearchOperation | null = null
  private setupInFlight: Promise<void> | null = null
  private setupDrain: Promise<void> | null = null
  private idle: Promise<void> = Promise.resolve()
  private disposed = false

  constructor(workerFactory: WorkerFactory = defaultWorkerFactory) {
    this.workerFactory = workerFactory
  }

  async probe(): Promise<{ engineName: string; enginePath: string }> {
    if (this.disposed) throw new Error('Engine client is disposed.')
    await this.idle
    await this.ensureReady()
    return { engineName: this.engineName, enginePath: ENGINE_PATH }
  }

  searchMove(
    fen: string,
    level: BotLevel,
    settings: EngineSettings = DEFAULT_ENGINE_SETTINGS,
  ): Promise<BrowserSearchResult> {
    return this.runSearch(fen, resolveBrowserPlayOptions(level, settings))
  }

  analyze(
    fen: string,
    settings: Pick<BrowserSearchOptions, 'moveTimeMs' | 'depth' | 'nodes' | 'multiPv' | 'hashMb'>,
  ): Promise<BrowserSearchResult> {
    return this.runSearch(fen, {
      ...settings,
      hashMb: Math.min(MAX_BROWSER_HASH_MB, boundedInteger(settings.hashMb, 16, 4096)),
      elo: 3190,
      skillLevel: 20,
      limitStrength: false,
      showWdl: true,
    })
  }

  cancel(): void {
    const operation = this.activeOperation
    this.activeOperation = null
    operation?.abort()

    const active = this.activeSearch
    if (!active) {
      if (operation) this.drainCancelledSetup()
      return
    }
    this.activeSearch = null
    clearTimeout(active.timer)
    active.reject(abortError())

    if (!this.worker) return
    const stopped = this.waitForLine((line) => line.startsWith('bestmove '), STOP_TIMEOUT_MS)
      .then(() => undefined)
      .catch(() => {
        this.dropWorker(new Error('Stockfish did not stop cleanly.'))
      })
    this.idle = stopped
    this.worker.postMessage('stop')
  }

  dispose(): void {
    if (this.disposed) return
    this.cancel()
    this.disposed = true
    this.dropWorker(new Error('Engine client is disposed.'))
  }

  private async runSearch(fen: string, options: BrowserSearchOptions): Promise<BrowserSearchResult> {
    this.cancel()
    if (this.disposed) throw new Error('Engine client is disposed.')
    if (!fen || fen.length > 256 || /[\n\r]/.test(fen) || fen.includes(String.fromCharCode(0))) {
      throw new Error('Invalid FEN for Stockfish.')
    }

    let rejectAbort: (reason?: unknown) => void = () => undefined
    const cancelled = new Promise<never>((_resolve, reject) => {
      rejectAbort = reject
    })
    const operation: SearchOperation = { abort: () => rejectAbort(abortError()) }
    this.activeOperation = operation
    const guarded = <Value>(promise: Promise<Value>) => Promise.race([promise, cancelled])

    try {
      await guarded(this.idle)
      await guarded(this.trackSetup(this.ensureReady()))
      await guarded(this.trackSetup(this.configure(options)))
      return await guarded(this.collectSearch(fen, options))
    } finally {
      if (this.activeOperation === operation) this.activeOperation = null
    }
  }

  private trackSetup(setup: Promise<void>): Promise<void> {
    this.setupInFlight = setup
    void setup.then(
      () => {
        if (this.setupInFlight === setup) this.setupInFlight = null
      },
      () => {
        if (this.setupInFlight === setup) this.setupInFlight = null
      },
    )
    return setup
  }

  private drainCancelledSetup(): void {
    if (this.setupDrain) {
      this.idle = this.setupDrain
      return
    }
    const setup = this.setupInFlight
    if (!setup) return

    // Let the cancelled setup consume its own readyok before fencing the next search.
    const drain = this.waitForCancelledSetup(setup)
    this.setupDrain = drain
    this.idle = drain
    void drain.then(() => {
      if (this.setupDrain === drain) this.setupDrain = null
    })
  }

  private async waitForCancelledSetup(setup: Promise<void>): Promise<void> {
    try {
      await setup
    } catch {
      return
    }

    const worker = this.worker
    if (!worker || !this.ready || this.disposed) return

    try {
      const ready = this.waitForLine((line) => line === 'readyok', READY_TIMEOUT_MS)
      worker.postMessage('isready')
      await ready
    } catch (error) {
      if (this.worker === worker) {
        this.dropWorker(error instanceof Error ? error : new Error('Stockfish did not return to ready state.'))
      }
    }
  }

  private async ensureReady(): Promise<void> {
    if (this.ready && this.worker) return
    if (this.initialization) return this.initialization

    const initialization = this.initializeWorker()
      .catch((error: unknown) => {
        const normalized = error instanceof Error ? error : new Error('Stockfish could not start.')
        this.dropWorker(normalized)
        throw normalized
      })
      .finally(() => {
        if (this.initialization === initialization) this.initialization = null
      })
    this.initialization = initialization
    return initialization
  }

  private async initializeWorker(): Promise<void> {
    const worker = this.workerFactory()
    this.worker = worker
    worker.onmessage = (event) => this.handlePayload(event.data)
    worker.onerror = (event) => {
      this.dropWorker(new Error(event.message || 'The browser Stockfish worker failed.'))
    }

    const uciReady = this.waitForLine((line) => line === 'uciok', STARTUP_TIMEOUT_MS)
    worker.postMessage('uci')
    await uciReady

    const engineReady = this.waitForLine((line) => line === 'readyok', READY_TIMEOUT_MS)
    worker.postMessage('isready')
    await engineReady
    this.ready = true
  }

  private async configure(options: BrowserSearchOptions): Promise<void> {
    const worker = this.worker
    if (!worker || !this.ready) throw new Error('Stockfish is not ready.')
    const commands = [
      'setoption name Threads value 1',
      `setoption name Hash value ${Math.min(MAX_BROWSER_HASH_MB, boundedInteger(options.hashMb, 16, 4096))}`,
      `setoption name MultiPV value ${boundedInteger(options.multiPv, 1, 5)}`,
      `setoption name Skill Level value ${boundedInteger(options.skillLevel, 0, 20)}`,
      `setoption name UCI_LimitStrength value ${options.limitStrength ? 'true' : 'false'}`,
      `setoption name UCI_Elo value ${boundedInteger(options.elo, 1320, 3190)}`,
      `setoption name UCI_ShowWDL value ${options.showWdl ? 'true' : 'false'}`,
    ]
    for (const command of commands) worker.postMessage(command)
    const ready = this.waitForLine((line) => line === 'readyok', READY_TIMEOUT_MS)
    worker.postMessage('isready')
    await ready
  }

  private collectSearch(fen: string, options: BrowserSearchOptions): Promise<BrowserSearchResult> {
    const worker = this.worker
    if (!worker) return Promise.reject(new Error('Stockfish is not ready.'))

    const startedAt = Date.now()
    const lines = new Map<number, BrowserAnalysisLine>()
    let depth: number | null = null
    let nodes: number | null = null
    let nps: number | null = null

    return new Promise<BrowserSearchResult>((resolve, reject) => {
      const finish = (line: string) => {
        let bestMove: { bestMove: string | null; ponder: string | null } | null
        try {
          bestMove = bestMoveFromLine(line)
        } catch (error) {
          this.activeSearch = null
          clearTimeout(timer)
          reject(error)
          this.dropWorker(error instanceof Error ? error : new Error('Stockfish returned an invalid move.'))
          return
        }
        if (!bestMove) return
        this.activeSearch = null
        clearTimeout(timer)
        resolve({
          engineName: this.engineName,
          enginePath: ENGINE_PATH,
          ...bestMove,
          elapsedMs: Math.max(0, Date.now() - startedAt),
          depth,
          nodes,
          nps,
          lines: [...lines.values()].sort((left, right) => left.multiPv - right.multiPv),
        })
      }

      const timer = setTimeout(() => {
        if (!this.activeSearch) return
        this.activeSearch = null
        const error = new Error('Browser Stockfish timed out.')
        reject(error)
        this.dropWorker(error)
      }, boundedInteger(options.moveTimeMs, 50, 30_000) + 5_000)

      this.activeSearch = {
        timer,
        reject,
        onLine: (line) => {
          if (line.startsWith('info ')) {
            const fields = line.trim().split(/\s+/)
            depth = fieldInteger(fields, 'depth', 0, 255) ?? depth
            nodes = fieldInteger(fields, 'nodes') ?? nodes
            nps = fieldInteger(fields, 'nps') ?? nps
            const analysisLine = parseBrowserAnalysisInfo(line)
            if (analysisLine && preferAnalysisLine(lines.get(analysisLine.multiPv), analysisLine)) {
              lines.set(analysisLine.multiPv, analysisLine)
            }
          }
          finish(line)
        },
      }

      worker.postMessage(`position fen ${fen}`)
      let go = `go movetime ${boundedInteger(options.moveTimeMs, 50, 30_000)}`
      if (options.depth !== null) go += ` depth ${boundedInteger(options.depth, 1, 40)}`
      if (options.nodes !== null) go += ` nodes ${boundedInteger(options.nodes, 1_000, 100_000_000)}`
      worker.postMessage(go)
    })
  }

  private handlePayload(payload: unknown): void {
    if (typeof payload !== 'string') return
    for (const rawLine of payload.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line) continue
      if (line.startsWith('id name ')) this.engineName = line.slice('id name '.length).trim()

      for (const waiter of [...this.waiters]) {
        if (!waiter.predicate(line)) continue
        clearTimeout(waiter.timer)
        this.waiters.delete(waiter)
        waiter.resolve(line)
      }
      this.activeSearch?.onLine(line)
    }
  }

  private waitForLine(predicate: (line: string) => boolean, timeoutMs: number): Promise<string> {
    if (!this.worker) return Promise.reject(new Error('Stockfish worker is not running.'))
    return new Promise<string>((resolve, reject) => {
      const waiter: LineWaiter = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          this.waiters.delete(waiter)
          reject(new Error('Stockfish did not answer in time.'))
        }, timeoutMs),
      }
      this.waiters.add(waiter)
    })
  }

  private dropWorker(error: Error): void {
    const worker = this.worker
    this.worker = null
    this.ready = false
    this.initialization = null
    if (worker) {
      worker.onmessage = null
      worker.onerror = null
      worker.terminate()
    }

    for (const waiter of this.waiters) {
      clearTimeout(waiter.timer)
      waiter.reject(error)
    }
    this.waiters.clear()

    if (this.activeSearch) {
      clearTimeout(this.activeSearch.timer)
      this.activeSearch.reject(error)
      this.activeSearch = null
    }
    this.idle = Promise.resolve()
  }
}
