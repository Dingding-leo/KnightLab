import { createPgnTimeline, type AnalysisTimeline } from './analysisModel'
import {
  importAnalysisFile,
  type AnalysisFileImportInput,
  type AnalysisFileImportResult,
} from './fileImport'
import type { RetryTimelineInput, RetryTimelineVerification } from '../review/retry'
import type {
  TimelineWorkerRequest,
  TimelineWorkerResponse,
} from './timelineWorkerProtocol'

export const BACKGROUND_PGN_PARSE_THRESHOLD_BYTES = 2 * 1024

export interface TimelineWorkerLike {
  onmessage: ((event: MessageEvent<TimelineWorkerResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: TimelineWorkerRequest): void
  terminate(): void
}

type WorkerFactory = () => TimelineWorkerLike

type TimelineWorkerValue = AnalysisTimeline | AnalysisFileImportResult | RetryTimelineVerification | null

type PendingRequest = {
  id: number
  type: TimelineWorkerRequest['type']
  request: TimelineWorkerRequest
  resolve: (value: TimelineWorkerValue) => void
  reject: (reason: Error) => void
}

function abortError(message: string): Error {
  return new DOMException(message, 'AbortError')
}

function defaultWorkerFactory(): TimelineWorkerLike {
  return new Worker(new URL('./timeline.worker.ts', import.meta.url), {
    type: 'module',
    name: 'knightclub-timeline',
  })
}

function canUseWorker(): boolean {
  return typeof Worker === 'function'
}

/**
 * Small reviews still render synchronously for an immediate first board. A
 * longer game crosses this deliberately conservative threshold and is parsed
 * after the initial Review shell has painted.
 */
export function shouldParseInitialPgnInWorker(pgn: string): boolean {
  return canUseWorker() && new TextEncoder().encode(pgn.trim()).byteLength > BACKGROUND_PGN_PARSE_THRESHOLD_BYTES
}

/**
 * A single latest-wins parser worker. Cancelling terminates the current worker
 * rather than waiting for `chess.js` to finish a long replay, so a new import
 * or a route change is immediately responsive.
 */
export class TimelineWorkerClient {
  private readonly createWorker: WorkerFactory
  private useWorker: boolean
  private worker: TimelineWorkerLike | null = null
  private pending: PendingRequest | null = null
  private nextId = 1
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false

  constructor(
    createWorker: WorkerFactory = defaultWorkerFactory,
    useWorker = canUseWorker(),
  ) {
    this.createWorker = createWorker
    this.useWorker = useWorker
    this.ensureWorker()
  }

  parsePgn(pgn: string): Promise<AnalysisTimeline> {
    return this.request({ type: 'parse-pgn', id: 0, pgn }) as Promise<AnalysisTimeline>
  }

  importFile(input: AnalysisFileImportInput): Promise<AnalysisFileImportResult> {
    return this.request({ type: 'parse-file', id: 0, input }) as Promise<AnalysisFileImportResult>
  }

  /**
   * Retry verification always has its own transient client. A Worker-less
   * runtime resolves this optional enhancement as unavailable instead of
   * replaying a long game on the interaction thread.
   */
  verifyRetryTimeline(timeline: RetryTimelineInput): Promise<RetryTimelineVerification | null> {
    return this.request({ type: 'verify-retry-timeline', id: 0, timeline }) as Promise<RetryTimelineVerification | null>
  }

  cancel(message = 'Game preparation cancelled.'): void {
    const pending = this.pending
    const hasActiveRequest = pending !== null || this.fallbackTimer !== null
    this.pending = null
    if (this.fallbackTimer !== null) {
      clearTimeout(this.fallbackTimer)
      this.fallbackTimer = null
    }
    if (pending) pending.reject(abortError(message))
    if (hasActiveRequest && this.worker) {
      this.worker.terminate()
      this.worker = null
      this.ensureWorker()
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const pending = this.pending
    this.pending = null
    if (this.fallbackTimer !== null) {
      clearTimeout(this.fallbackTimer)
      this.fallbackTimer = null
    }
    pending?.reject(abortError('Game preparation client disposed.'))
    this.worker?.terminate()
    this.worker = null
  }

  private request(request: TimelineWorkerRequest): Promise<TimelineWorkerValue> {
    if (this.disposed) return Promise.reject(new Error('Game preparation client is disposed.'))
    this.cancel('Superseded by a newer game preparation request.')
    const id = this.nextId++
    const next = { ...request, id } as TimelineWorkerRequest
    return new Promise((resolve, reject) => {
      this.pending = { id, type: next.type, request: next, resolve, reject }
      this.ensureWorker()
      if (this.worker) {
        try {
          this.worker.postMessage(next)
        } catch {
          // A constructor can succeed while a restrictive WebView still
          // rejects module messages. Use the same yielded local fallback that
          // covers a failed Worker constructor before surfacing an error.
          this.worker.terminate()
          this.worker = null
          this.useWorker = false
          this.scheduleFallback(next)
        }
        return
      }

      // Web Workers are available in every supported target. Parsing still
      // has a yielded local fallback in an unusual restricted runtime, while
      // optional retry preparation stays unavailable rather than replaying a
      // long game on the interaction thread.
      this.scheduleFallback(next)
    })
  }

  private spawnWorker(): TimelineWorkerLike {
    const worker = this.createWorker()
    worker.onmessage = (event) => this.handleMessage(event.data)
    worker.onerror = () => {
      if (this.worker !== worker) return
      this.worker = null
      worker.terminate()
      // Module-resource, CSP and runtime Worker errors should not make local
      // PGN/FEN loading unavailable. Fall back once (after yielding) to the
      // exact same bounded parser on the main thread.
      this.useWorker = false
      const pending = this.pending
      if (pending) this.scheduleFallback(pending.request)
    }
    return worker
  }

  private ensureWorker(): void {
    if (!this.useWorker || this.worker || this.disposed) return
    try {
      this.worker = this.spawnWorker()
    } catch {
      // A restricted WebView may expose Worker but reject construction. Keep
      // the same local parser available through the yielding fallback below.
      this.useWorker = false
    }
  }

  private scheduleFallback(request: TimelineWorkerRequest): void {
    if (this.fallbackTimer !== null) clearTimeout(this.fallbackTimer)
    this.fallbackTimer = setTimeout(() => {
      this.fallbackTimer = null
      if (!this.pending || this.pending.id !== request.id) return
      try {
        const value = request.type === 'parse-pgn'
          ? createPgnTimeline(request.pgn)
          : request.type === 'parse-file'
            ? importAnalysisFile(request.input)
            : null
        this.finishSuccess(request.id, value)
      } catch (error) {
        this.finishError(request.id, error instanceof Error ? error : new Error('Could not prepare this game locally.'))
      }
    }, 0)
  }

  private handleMessage(response: TimelineWorkerResponse): void {
    const pending = this.pending
    if (!pending || pending.id !== response.id) return
    if (response.type === 'error') {
      this.finishError(response.id, new Error(response.message))
      return
    }
    if (response.type === 'timeline-result' && pending.type === 'parse-pgn') {
      this.finishSuccess(response.id, response.timeline)
      return
    }
    if (response.type === 'file-result' && pending.type === 'parse-file') {
      this.finishSuccess(response.id, response.result)
      return
    }
    if (response.type === 'retry-timeline-result' && pending.type === 'verify-retry-timeline') {
      this.finishSuccess(response.id, response.verification)
      return
    }
    this.finishError(response.id, new Error('Game preparation worker returned an unexpected result.'))
  }

  private finishSuccess(id: number, value: TimelineWorkerValue): void {
    const pending = this.pending
    if (!pending || pending.id !== id) return
    this.pending = null
    pending.resolve(value)
  }

  private finishError(id: number, error: Error): void {
    const pending = this.pending
    if (!pending || pending.id !== id) return
    this.pending = null
    pending.reject(error)
  }
}
