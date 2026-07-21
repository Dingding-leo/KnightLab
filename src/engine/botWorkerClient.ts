import type { BotLevel, MoveInput } from '../domain/chess'
import type { BotSearchRequest, BotWorkerResponse } from './botProtocol'

export interface WorkerLike {
  onmessage: ((event: MessageEvent<BotWorkerResponse>) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
  postMessage(message: BotSearchRequest): void
  terminate(): void
}

type WorkerFactory = () => WorkerLike

type PendingSearch = {
  id: number
  fen: string
  resolve: (move: MoveInput | null) => void
  reject: (reason: Error) => void
}

function abortError(message: string): Error {
  return new DOMException(message, 'AbortError')
}

function defaultWorkerFactory(): WorkerLike {
  return new Worker(new URL('./knightBot.worker.ts', import.meta.url), { type: 'module', name: 'knightbot' })
}

export class BotWorkerClient {
  private readonly createWorker: WorkerFactory
  private worker: WorkerLike
  private pending: PendingSearch | null = null
  private nextId = 1
  private disposed = false

  constructor(createWorker: WorkerFactory = defaultWorkerFactory) {
    this.createWorker = createWorker
    this.worker = this.spawnWorker()
  }

  search(fen: string, level: BotLevel): Promise<MoveInput | null> {
    if (this.disposed) return Promise.reject(new Error('Bot worker client is disposed.'))

    this.cancel('Superseded by a newer search.')
    const id = this.nextId++

    return new Promise((resolve, reject) => {
      this.pending = { id, fen, resolve, reject }
      this.worker.postMessage({ type: 'search', id, fen, level })
    })
  }

  cancel(message = 'Bot search cancelled.'): void {
    if (!this.pending) return
    const pending = this.pending
    this.pending = null
    pending.reject(abortError(message))
    this.worker.terminate()
    if (!this.disposed) this.worker = this.spawnWorker()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.pending) {
      const pending = this.pending
      this.pending = null
      pending.reject(abortError('Bot worker client disposed.'))
    }
    this.worker.terminate()
  }

  private spawnWorker(): WorkerLike {
    const worker = this.createWorker()
    worker.onmessage = (event) => this.handleMessage(event.data)
    worker.onerror = (event) => {
      if (!this.pending) return
      const pending = this.pending
      this.pending = null
      pending.reject(new Error(event.message || 'Bot worker failed.'))
    }
    return worker
  }

  private handleMessage(response: BotWorkerResponse): void {
    const pending = this.pending
    if (!pending || response.id !== pending.id || response.fen !== pending.fen) return

    this.pending = null
    if (response.type === 'error') {
      pending.reject(new Error(response.message))
      return
    }
    pending.resolve(response.move)
  }
}
