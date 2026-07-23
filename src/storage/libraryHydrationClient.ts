import type { StoredGame } from './gameStore'
import { hydrateLibrary } from './libraryHydration'
import type {
  LibraryHydrationRequest,
  LibraryHydrationResponse,
} from './libraryHydrationProtocol'

export interface LibraryHydrationWorkerLike {
  onmessage: ((event: MessageEvent<LibraryHydrationResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: LibraryHydrationRequest): void
  terminate(): void
}

export type LibraryHydrationWorkerFactory = () => LibraryHydrationWorkerLike

type PendingRequest = {
  id: number
  request: LibraryHydrationRequest
  resolve: (games: StoredGame[]) => void
  reject: (reason: Error) => void
}

function abortError(message: string): Error {
  return new DOMException(message, 'AbortError')
}

function canUseWorker(): boolean {
  return typeof Worker === 'function'
}

function defaultWorkerFactory(): LibraryHydrationWorkerLike {
  return new Worker(new URL('./libraryHydration.worker.ts', import.meta.url), {
    type: 'module',
    name: 'knightclub-library',
  })
}

/**
 * One-shot, latest-wins hydration for the browser Library. Its constructor
 * performs no storage read, parser call, or Worker startup: callers request
 * the work only after the Library surface needs persisted game records.
 */
export class LibraryHydrationClient {
  private readonly createWorker: LibraryHydrationWorkerFactory
  private useWorker: boolean
  private worker: LibraryHydrationWorkerLike | null = null
  private pending: PendingRequest | null = null
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null
  private nextId = 1
  private disposed = false

  constructor(
    createWorker: LibraryHydrationWorkerFactory = defaultWorkerFactory,
    useWorker = canUseWorker(),
  ) {
    this.createWorker = createWorker
    this.useWorker = useWorker
  }

  /**
   * Parses the supplied raw mirror in a Worker whenever possible. Restricted
   * runtimes use the same parser only after a macrotask, so the Library shell
   * paints before any local JSON/PGN normalization fallback begins.
   */
  hydrate(raw: string | null): Promise<StoredGame[]> {
    if (this.disposed) {
      return Promise.reject(new Error('Library hydration client is disposed.'))
    }

    this.cancel('Superseded by a newer library hydration request.')
    const request: LibraryHydrationRequest = {
      type: 'hydrate-library',
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
        // Treat that exactly like Worker unavailability and yield the parser.
        this.releaseWorker(worker)
        this.useWorker = false
        this.scheduleFallback(request)
      }
    })
  }

  cancel(message = 'Library hydration cancelled.'): void {
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
    this.cancel('Library hydration client is disposed.')
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

  private scheduleFallback(request: LibraryHydrationRequest): void {
    if (this.fallbackTimer !== null) clearTimeout(this.fallbackTimer)
    this.fallbackTimer = setTimeout(() => {
      this.fallbackTimer = null
      if (!this.pending || this.pending.id !== request.id) return
      try {
        this.finishSuccess(request.id, hydrateLibrary(request.raw))
      } catch (error) {
        this.finishError(
          request.id,
          error instanceof Error ? error : new Error('Could not prepare your saved games.'),
        )
      }
    }, 0)
  }

  private handleWorkerError(worker: LibraryHydrationWorkerLike): void {
    if (this.worker !== worker) return
    this.releaseWorker(worker)
    // A Worker that starts but cannot load its module is unavailable for this
    // session. Fall back exactly once, on the next macrotask.
    this.useWorker = false
    const pending = this.pending
    if (pending) this.scheduleFallback(pending.request)
  }

  private handleMessage(
    worker: LibraryHydrationWorkerLike,
    response: LibraryHydrationResponse,
  ): void {
    const pending = this.pending
    if (!pending || pending.id !== response.id) return
    if (response.type === 'error') {
      this.finishError(response.id, new Error(response.message), worker)
      return
    }
    if (response.type === 'library-hydration-result') {
      this.finishSuccess(response.id, response.games, worker)
      return
    }
    this.finishError(pending.id, new Error('Library Worker returned an unexpected result.'), worker)
  }

  private finishSuccess(
    id: number,
    games: StoredGame[],
    worker?: LibraryHydrationWorkerLike,
  ): void {
    const pending = this.pending
    if (!pending || pending.id !== id) return
    this.pending = null
    if (worker) this.releaseWorker(worker)
    pending.resolve(games)
  }

  private finishError(
    id: number,
    error: Error,
    worker?: LibraryHydrationWorkerLike,
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
