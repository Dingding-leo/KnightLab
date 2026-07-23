import type { RetryItem } from '../review/retry'
import { hydrateTrainingRetryItems } from './trainingRetryHydration'
import type {
  TrainingRetryHydrationRequest,
  TrainingRetryHydrationResponse,
} from './trainingRetryHydrationProtocol'

export interface TrainingRetryHydrationWorkerLike {
  onmessage: ((event: MessageEvent<TrainingRetryHydrationResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: TrainingRetryHydrationRequest): void
  terminate(): void
}

export type TrainingRetryHydrationWorkerFactory = () => TrainingRetryHydrationWorkerLike

type PendingRequest = {
  id: number
  request: TrainingRetryHydrationRequest
  resolve: (items: RetryItem[]) => void
  reject: (reason: Error) => void
}

function abortError(message: string): Error {
  return new DOMException(message, 'AbortError')
}

function canUseWorker(): boolean {
  return typeof Worker === 'function'
}

function defaultWorkerFactory(): TrainingRetryHydrationWorkerLike {
  return new Worker(new URL('./trainingRetryHydration.worker.ts', import.meta.url), {
    type: 'module',
    name: 'knightclub-training-retries',
  })
}

/**
 * One-shot, latest-wins hydration for the Train tab. Its constructor performs
 * no storage read, parser call, or Worker startup: callers request hydration
 * only once the Train surface needs its retry queue.
 */
export class TrainingRetryHydrationClient {
  private readonly createWorker: TrainingRetryHydrationWorkerFactory
  private useWorker: boolean
  private worker: TrainingRetryHydrationWorkerLike | null = null
  private pending: PendingRequest | null = null
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null
  private nextId = 1
  private disposed = false

  constructor(
    createWorker: TrainingRetryHydrationWorkerFactory = defaultWorkerFactory,
    useWorker = canUseWorker(),
  ) {
    this.createWorker = createWorker
    this.useWorker = useWorker
  }

  /**
   * Parses the supplied raw mirror in a Worker whenever possible. In a
   * restricted runtime, the exact same parser runs only after a macrotask so
   * Train can paint before the bounded fallback work begins.
   */
  hydrate(raw: string | null): Promise<RetryItem[]> {
    if (this.disposed) {
      return Promise.reject(new Error('Training retry hydration client is disposed.'))
    }

    this.cancel('Superseded by a newer training retry hydration request.')
    const request: TrainingRetryHydrationRequest = {
      type: 'hydrate-training-retries',
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
        // That is equivalent to Worker unavailability, so use the yielded
        // parser fallback rather than blocking initial Train paint.
        this.releaseWorker(worker)
        this.useWorker = false
        this.scheduleFallback(request)
      }
    })
  }

  cancel(message = 'Training retry hydration cancelled.'): void {
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
    this.cancel('Training retry hydration client is disposed.')
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

  private scheduleFallback(request: TrainingRetryHydrationRequest): void {
    if (this.fallbackTimer !== null) clearTimeout(this.fallbackTimer)
    this.fallbackTimer = setTimeout(() => {
      this.fallbackTimer = null
      if (!this.pending || this.pending.id !== request.id) return
      try {
        this.finishSuccess(request.id, hydrateTrainingRetryItems(request.raw))
      } catch (error) {
        this.finishError(
          request.id,
          error instanceof Error ? error : new Error('Could not prepare local training history.'),
        )
      }
    }, 0)
  }

  private handleWorkerError(worker: TrainingRetryHydrationWorkerLike): void {
    if (this.worker !== worker) return
    this.releaseWorker(worker)
    // A Worker that starts but cannot load its module is unavailable for this
    // session. Fall back exactly once, on the next macrotask.
    this.useWorker = false
    const pending = this.pending
    if (pending) this.scheduleFallback(pending.request)
  }

  private handleMessage(
    worker: TrainingRetryHydrationWorkerLike,
    response: TrainingRetryHydrationResponse,
  ): void {
    const pending = this.pending
    if (!pending || pending.id !== response.id) return
    if (response.type === 'error') {
      this.finishError(response.id, new Error(response.message), worker)
      return
    }
    if (response.type === 'training-retry-hydration-result') {
      this.finishSuccess(response.id, response.items, worker)
      return
    }
    this.finishError(pending.id, new Error('Training retry Worker returned an unexpected result.'), worker)
  }

  private finishSuccess(
    id: number,
    items: RetryItem[],
    worker?: TrainingRetryHydrationWorkerLike,
  ): void {
    const pending = this.pending
    if (!pending || pending.id !== id) return
    this.pending = null
    if (worker) this.releaseWorker(worker)
    pending.resolve(items)
  }

  private finishError(
    id: number,
    error: Error,
    worker?: TrainingRetryHydrationWorkerLike,
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
