import type { TacticsState } from '../tactics/tacticsPersistence'
import { hydrateTacticsState } from './tacticsHydration'
import type {
  TacticsHydrationRequest,
  TacticsHydrationResponse,
} from './tacticsHydrationProtocol'

export interface TacticsHydrationWorkerLike {
  onmessage: ((event: MessageEvent<TacticsHydrationResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: TacticsHydrationRequest): void
  terminate(): void
}

export type TacticsHydrationWorkerFactory = () => TacticsHydrationWorkerLike

type PendingRequest = {
  id: number
  request: TacticsHydrationRequest
  resolve: (state: TacticsState) => void
  reject: (reason: Error) => void
}

function abortError(message: string): Error {
  return new DOMException(message, 'AbortError')
}

function canUseWorker(): boolean {
  return typeof Worker === 'function'
}

function defaultWorkerFactory(): TacticsHydrationWorkerLike {
  return new Worker(new URL('./tacticsHydration.worker.ts', import.meta.url), {
    type: 'module',
    name: 'knightclub-tactics-history',
  })
}

/**
 * One-shot, latest-wins hydration for local tactics history. Its constructor
 * performs no storage read, parser call, or Worker startup: callers opt in
 * only when the Tactics surface needs durable progress.
 */
export class TacticsHydrationClient {
  private readonly createWorker: TacticsHydrationWorkerFactory
  private useWorker: boolean
  private worker: TacticsHydrationWorkerLike | null = null
  private pending: PendingRequest | null = null
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null
  private nextId = 1
  private disposed = false

  constructor(
    createWorker: TacticsHydrationWorkerFactory = defaultWorkerFactory,
    useWorker = canUseWorker(),
  ) {
    this.createWorker = createWorker
    this.useWorker = useWorker
  }

  /**
   * Parses the supplied raw mirror in a Worker whenever possible. Restricted
   * runtimes use the identical parser only after a macrotask, giving the
   * tactics shell a chance to paint before bounded fallback work starts.
   */
  hydrate(raw: string | null): Promise<TacticsState> {
    if (this.disposed) {
      return Promise.reject(new Error('Tactics hydration client is disposed.'))
    }

    this.cancel('Superseded by a newer tactics hydration request.')
    const request: TacticsHydrationRequest = {
      type: 'hydrate-tactics-state',
      id: this.nextId++,
      raw,
    }
    return new Promise((resolve, reject) => {
      this.pending = { id: request.id, request, resolve, reject }
      this.ensureWorker()
      const worker = this.worker
      if (!worker) {
        this.scheduleFallback(request)
        return
      }

      try {
        worker.postMessage(request)
      } catch {
        // Some embedded WebViews expose Worker but reject module messages.
        // Treat that as unavailability and keep fallback parser work yielded.
        this.releaseWorker(worker)
        this.useWorker = false
        this.scheduleFallback(request)
      }
    })
  }

  cancel(message = 'Tactics hydration cancelled.'): void {
    const pending = this.pending
    const hasActiveRequest = pending !== null || this.fallbackTimer !== null
    this.pending = null
    if (this.fallbackTimer !== null) {
      clearTimeout(this.fallbackTimer)
      this.fallbackTimer = null
    }
    if (hasActiveRequest) this.releaseWorker()
    pending?.reject(abortError(message))
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.cancel('Tactics hydration client is disposed.')
    this.releaseWorker()
  }

  private ensureWorker(): void {
    if (!this.useWorker || this.worker || this.disposed) return
    try {
      const worker = this.createWorker()
      worker.onmessage = (event) => this.handleMessage(worker, event.data)
      worker.onerror = () => this.handleWorkerError(worker)
      this.worker = worker
    } catch {
      // CSP and embedded runtime restrictions are resolved through the one
      // yielded fallback below. The parser itself is never called here.
      this.useWorker = false
    }
  }

  private scheduleFallback(request: TacticsHydrationRequest): void {
    if (this.fallbackTimer !== null) clearTimeout(this.fallbackTimer)
    this.fallbackTimer = setTimeout(() => {
      this.fallbackTimer = null
      if (!this.pending || this.pending.id !== request.id) return
      try {
        this.finishSuccess(request.id, hydrateTacticsState(request.raw))
      } catch (error) {
        this.finishError(
          request.id,
          error instanceof Error ? error : new Error('Could not prepare local tactics history.'),
        )
      }
    }, 0)
  }

  private handleWorkerError(worker: TacticsHydrationWorkerLike): void {
    if (this.worker !== worker) return
    this.releaseWorker(worker)
    // A Worker that starts but cannot load its module is unavailable for this
    // session. Fall back exactly once, on the next macrotask.
    this.useWorker = false
    const pending = this.pending
    if (pending) this.scheduleFallback(pending.request)
  }

  private handleMessage(
    worker: TacticsHydrationWorkerLike,
    response: TacticsHydrationResponse,
  ): void {
    const pending = this.pending
    if (!pending || pending.id !== response.id) return
    if (response.type === 'error') {
      this.finishError(response.id, new Error(response.message), worker)
      return
    }
    if (response.type === 'tactics-hydration-result') {
      this.finishSuccess(response.id, response.state, worker)
      return
    }
    this.finishError(pending.id, new Error('Tactics hydration Worker returned an unexpected result.'), worker)
  }

  private finishSuccess(
    id: number,
    state: TacticsState,
    worker?: TacticsHydrationWorkerLike,
  ): void {
    const pending = this.pending
    if (!pending || pending.id !== id) return
    this.pending = null
    if (worker) this.releaseWorker(worker)
    pending.resolve(state)
  }

  private finishError(
    id: number,
    error: Error,
    worker?: TacticsHydrationWorkerLike,
  ): void {
    const pending = this.pending
    if (!pending || pending.id !== id) return
    this.pending = null
    if (worker) this.releaseWorker(worker)
    pending.reject(error)
  }

  private releaseWorker(worker = this.worker): void {
    if (!worker) return
    if (this.worker === worker) this.worker = null
    worker.terminate()
  }
}
