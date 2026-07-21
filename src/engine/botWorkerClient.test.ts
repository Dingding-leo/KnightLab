import { describe, expect, it } from 'vitest'
import type { BotSearchRequest, BotWorkerResponse } from './botProtocol'
import { BotWorkerClient, type WorkerLike } from './botWorkerClient'

class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent<BotWorkerResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  messages: BotSearchRequest[] = []
  terminated = false

  postMessage(message: BotSearchRequest) {
    this.messages.push(message)
  }

  terminate() {
    this.terminated = true
  }

  reply(response: BotWorkerResponse) {
    this.onmessage?.({ data: response } as MessageEvent<BotWorkerResponse>)
  }
}

describe('BotWorkerClient', () => {
  it('resolves a matching response', async () => {
    const workers: FakeWorker[] = []
    const client = new BotWorkerClient(() => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker
    })

    const promise = client.search('start-fen', 'easy')
    const request = workers[0].messages[0]
    workers[0].reply({ type: 'result', id: request.id, fen: request.fen, move: { from: 'e2', to: 'e4' }, elapsedMs: 1 })

    await expect(promise).resolves.toEqual({ from: 'e2', to: 'e4' })
    client.dispose()
  })

  it('cancels and terminates a stale search before starting the next one', async () => {
    const workers: FakeWorker[] = []
    const client = new BotWorkerClient(() => {
      const worker = new FakeWorker()
      workers.push(worker)
      return worker
    })

    const first = client.search('fen-one', 'strong')
    const second = client.search('fen-two', 'balanced')

    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
    expect(workers[0].terminated).toBe(true)
    expect(workers).toHaveLength(2)

    const request = workers[1].messages[0]
    workers[1].reply({ type: 'result', id: request.id, fen: request.fen, move: null, elapsedMs: 2 })
    await expect(second).resolves.toBeNull()
    client.dispose()
  })

  it('ignores responses that do not match both request id and FEN', async () => {
    const worker = new FakeWorker()
    const client = new BotWorkerClient(() => worker)
    const promise = client.search('expected-fen', 'easy')
    const request = worker.messages[0]

    worker.reply({ type: 'result', id: request.id, fen: 'stale-fen', move: { from: 'a2', to: 'a3' }, elapsedMs: 1 })
    worker.reply({ type: 'result', id: request.id + 1, fen: request.fen, move: { from: 'a2', to: 'a3' }, elapsedMs: 1 })
    worker.reply({ type: 'result', id: request.id, fen: request.fen, move: { from: 'b2', to: 'b3' }, elapsedMs: 1 })

    await expect(promise).resolves.toEqual({ from: 'b2', to: 'b3' })
    client.dispose()
  })
})
