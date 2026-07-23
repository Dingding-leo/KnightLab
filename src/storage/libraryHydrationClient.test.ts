import { describe, expect, it } from 'vitest'
import type { StoredGame } from './gameStore'
import { hydrateLibrary } from './libraryHydration'
import {
  LibraryHydrationClient,
  type LibraryHydrationWorkerLike,
} from './libraryHydrationClient'
import type {
  LibraryHydrationRequest,
  LibraryHydrationResponse,
} from './libraryHydrationProtocol'

class FakeLibraryHydrationWorker implements LibraryHydrationWorkerLike {
  onmessage: ((event: MessageEvent<LibraryHydrationResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly messages: LibraryHydrationRequest[] = []
  terminated = false

  postMessage(message: LibraryHydrationRequest): void {
    this.messages.push(message)
  }

  terminate(): void {
    this.terminated = true
  }

  reply(response: LibraryHydrationResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<LibraryHydrationResponse>)
  }

  failToStart(): void {
    this.onerror?.({ message: 'Worker module blocked.' } as ErrorEvent)
  }
}

function game(id = 'game-1', playedAt = '2026-07-23T00:00:00.000Z'): StoredGame {
  return {
    id,
    playedAt,
    mode: 'bot',
    result: '1-0',
    pgn: '1. e4 e5 1-0',
    finalFen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    moveCount: 2,
  }
}

describe('LibraryHydrationClient', () => {
  it('does not start a Worker until the Library explicitly hydrates', () => {
    let starts = 0
    const client = new LibraryHydrationClient(() => {
      starts += 1
      return new FakeLibraryHydrationWorker()
    }, true)

    expect(starts).toBe(0)
    client.dispose()
  })

  it('applies the matching dedicated Worker result and releases its one-shot Worker', async () => {
    const item = game()
    const worker = new FakeLibraryHydrationWorker()
    const client = new LibraryHydrationClient(() => worker, true)
    const pending = client.hydrate(JSON.stringify([item]))
    const request = worker.messages[0]
    if (!request) throw new Error('Expected a library hydration request.')

    worker.reply({
      type: 'library-hydration-result',
      id: request.id,
      games: [item],
    })

    await expect(pending).resolves.toEqual([item])
    expect(worker.terminated).toBe(true)
    client.dispose()
  })

  it('terminates stale work so only the latest Library request can resolve', async () => {
    const workers: FakeLibraryHydrationWorker[] = []
    const client = new LibraryHydrationClient(() => {
      const worker = new FakeLibraryHydrationWorker()
      workers.push(worker)
      return worker
    }, true)
    const first = client.hydrate(JSON.stringify([game('first')]))
    const firstOutcome = first.catch((error: unknown) => error)
    const item = game('second', '2026-07-24T00:00:00.000Z')
    const second = client.hydrate(JSON.stringify([item]))

    await expect(firstOutcome).resolves.toMatchObject({
      name: 'AbortError',
      message: 'Superseded by a newer library hydration request.',
    })
    expect(workers[0]?.terminated).toBe(true)
    const request = workers[1]?.messages[0]
    if (!request) throw new Error('Expected a replacement library hydration request.')
    workers[1]?.reply({
      type: 'library-hydration-result',
      id: request.id,
      games: [item],
    })

    await expect(second).resolves.toEqual([item])
    client.dispose()
  })

  it('cancels an in-flight Library hydration immediately when its surface closes', async () => {
    const worker = new FakeLibraryHydrationWorker()
    const client = new LibraryHydrationClient(() => worker, true)
    const pending = client.hydrate(JSON.stringify([game()]))
    const outcome = pending.catch((error: unknown) => error)

    client.cancel('Library surface closed.')

    await expect(outcome).resolves.toMatchObject({ name: 'AbortError', message: 'Library surface closed.' })
    expect(worker.terminated).toBe(true)
    client.dispose()
  })

  it('uses the yielded local parser only when Workers are unavailable', async () => {
    const item = game()
    const client = new LibraryHydrationClient(() => {
      throw new Error('Workers unavailable')
    }, false)
    let settled = false
    const pending = client.hydrate(JSON.stringify([item])).then((items) => {
      settled = true
      return items
    })

    expect(settled).toBe(false)
    await expect(pending).resolves.toEqual([item])
    client.dispose()
  })

  it('yields the parser when a reported Worker cannot be constructed', async () => {
    const item = game()
    const client = new LibraryHydrationClient(() => {
      throw new Error('Worker construction blocked by CSP')
    }, true)
    let settled = false
    const pending = client.hydrate(JSON.stringify([item])).then((items) => {
      settled = true
      return items
    })

    expect(settled).toBe(false)
    await expect(pending).resolves.toEqual([item])
    client.dispose()
  })

  it('uses that same yielded parser after a Worker module is blocked', async () => {
    const item = game()
    const worker = new FakeLibraryHydrationWorker()
    const client = new LibraryHydrationClient(() => worker, true)
    const pending = client.hydrate(JSON.stringify([item]))

    worker.failToStart()

    await expect(pending).resolves.toEqual([item])
    expect(worker.terminated).toBe(true)
    client.dispose()
  })

  it('rejects an unexpected Worker result instead of running a main-thread parser', async () => {
    const worker = new FakeLibraryHydrationWorker()
    const client = new LibraryHydrationClient(() => worker, true)
    const pending = client.hydrate(JSON.stringify([game()]))
    const outcome = pending.catch((error: unknown) => error)
    const request = worker.messages[0]
    if (!request) throw new Error('Expected a library hydration request.')

    worker.reply({ type: 'unexpected-result', id: request.id } as unknown as LibraryHydrationResponse)

    const error = await outcome
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('unexpected result')
    expect(worker.terminated).toBe(true)
    client.dispose()
  })

  it('fails closed for malformed snapshots in the shared Worker/fallback parser', async () => {
    expect(hydrateLibrary('{ definitely not JSON')).toEqual([])
    expect(hydrateLibrary(JSON.stringify([{ id: 'missing-required-fields' }]))).toEqual([])

    const client = new LibraryHydrationClient(() => {
      throw new Error('Workers unavailable')
    }, false)
    await expect(client.hydrate('{ definitely not JSON')).resolves.toEqual([])
    client.dispose()
  })
})
