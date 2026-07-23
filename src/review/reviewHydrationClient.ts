import type { HydratedPersistedReview } from './reviewPersistence'
import type {
  ReviewHydrationRequest,
  ReviewHydrationResponse,
} from './reviewHydrationProtocol'

export interface ReviewHydrationWorkerLike {
  onmessage: ((event: MessageEvent<ReviewHydrationResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: ReviewHydrationRequest): void
  terminate(): void
}

export type ReviewHydrationWorkerFactory = () => ReviewHydrationWorkerLike

type HydrationValue = HydratedPersistedReview | null

type ReviewHydrationInput =
  | { type: 'hydrate-browser-review'; raw: string | null; reviewKey: string }
  | { type: 'hydrate-native-review'; record: unknown; reviewKey: string }

type PendingRequest = {
  id: number
  request: ReviewHydrationRequest
  resolve: (value: HydrationValue) => void
  reject: (reason: Error) => void
}

function abortError(message: string): Error {
  return new DOMException(message, 'AbortError')
}

function canUseWorker(): boolean {
  return typeof Worker === 'function'
}

function defaultWorkerFactory(): ReviewHydrationWorkerLike {
  return new Worker(new URL('./reviewHydration.worker.ts', import.meta.url), {
    type: 'module',
    name: 'knightclub-review-hydration',
  })
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The Worker is the strict validation boundary. This inexpensive guard checks
 * only that its structured-clone result belongs to the request; replaying the
 * PGN here would recreate the user-visible stall we are avoiding.
 */
function isHydratedReviewForKey(value: unknown, reviewKey: string): value is HydratedPersistedReview {
  if (!isObject(value) || !isObject(value.record) || !isObject(value.timeline)) return false
  const { record, timeline } = value
  return record.reviewKey === reviewKey
    && typeof record.startFen === 'string'
    && typeof record.sourcePgn === 'string'
    && Number.isInteger(record.moveCount)
    && timeline.source === 'pgn'
    && timeline.startFen === record.startFen
    && typeof timeline.sourcePgn === 'string'
    && Array.isArray(timeline.moves)
    && timeline.moves.length === record.moveCount
    && Array.isArray(timeline.positions)
}

/**
 * One-shot, latest-wins validation for a saved full-game review. A long
 * report can replay up to 1,024 plies, so this deliberately has no
 * main-thread fallback: an unavailable Worker is surfaced as a recoverable
 * error instead of freezing the Review board.
 */
export class ReviewHydrationClient {
  private readonly createWorker: ReviewHydrationWorkerFactory
  private useWorker: boolean
  private worker: ReviewHydrationWorkerLike | null = null
  private pending: PendingRequest | null = null
  private nextId = 1
  private disposed = false

  constructor(
    createWorker: ReviewHydrationWorkerFactory = defaultWorkerFactory,
    useWorker = canUseWorker(),
  ) {
    this.createWorker = createWorker
    this.useWorker = useWorker
  }

  hydrateBrowser(raw: string | null, reviewKey: string): Promise<HydrationValue> {
    return this.request({ type: 'hydrate-browser-review', raw, reviewKey })
  }

  hydrateNative(record: unknown, reviewKey: string): Promise<HydrationValue> {
    return this.request({ type: 'hydrate-native-review', record, reviewKey })
  }

  cancel(message = 'Saved review restoration cancelled.'): void {
    const pending = this.pending
    this.pending = null
    if (pending) this.releaseWorker()
    pending?.reject(abortError(message))
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.cancel('Saved review restoration client disposed.')
    this.releaseWorker()
  }

  private request(input: ReviewHydrationInput): Promise<HydrationValue> {
    if (this.disposed) return Promise.reject(new Error('Saved review restoration client is disposed.'))
    this.cancel('Superseded by a newer saved review restoration request.')
    const request = { ...input, id: this.nextId++ } as ReviewHydrationRequest
    return new Promise((resolve, reject) => {
      this.pending = { id: request.id, request, resolve, reject }
      this.ensureWorker()
      const worker = this.worker
      if (!worker) {
        this.finishError(request.id, this.backgroundWorkerError())
        return
      }
      try {
        worker.postMessage(request)
      } catch {
        this.releaseWorker(worker)
        this.useWorker = false
        this.finishError(request.id, this.backgroundWorkerError())
      }
    })
  }

  private ensureWorker(): void {
    if (!this.useWorker || this.worker || this.disposed) return
    try {
      const worker = this.createWorker()
      worker.onmessage = (event) => this.handleMessage(worker, event.data)
      worker.onerror = () => this.handleWorkerError(worker)
      this.worker = worker
    } catch {
      this.useWorker = false
    }
  }

  private handleWorkerError(worker: ReviewHydrationWorkerLike): void {
    if (this.worker !== worker) return
    this.releaseWorker(worker)
    this.useWorker = false
    const pending = this.pending
    if (pending) this.finishError(pending.id, this.backgroundWorkerError())
  }

  private handleMessage(
    worker: ReviewHydrationWorkerLike,
    response: ReviewHydrationResponse,
  ): void {
    const pending = this.pending
    if (!pending || pending.id !== response.id) return
    if (response.type === 'error') {
      this.finishError(response.id, new Error(response.message), worker)
      return
    }
    if (response.type !== 'review-hydration-result'
      || response.requestType !== pending.request.type) {
      this.finishError(response.id, new Error('Saved-review Worker returned an unexpected result.'), worker)
      return
    }
    if (response.hydration !== null
      && !isHydratedReviewForKey(response.hydration, pending.request.reviewKey)) {
      this.finishError(response.id, new Error('Saved-review Worker returned an invalid result.'), worker)
      return
    }
    this.finishSuccess(response.id, response.hydration, worker)
  }

  private finishSuccess(
    id: number,
    value: HydrationValue,
    worker?: ReviewHydrationWorkerLike,
  ): void {
    const pending = this.pending
    if (!pending || pending.id !== id) return
    this.pending = null
    if (worker) this.releaseWorker(worker)
    pending.resolve(value)
  }

  private finishError(
    id: number,
    error: Error,
    worker?: ReviewHydrationWorkerLike,
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

  private backgroundWorkerError(): Error {
    return new Error('This saved review needs a local background Worker to open safely.')
  }
}
