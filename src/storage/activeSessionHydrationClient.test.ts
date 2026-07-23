import { describe, expect, it } from 'vitest'
import type { ActiveSession } from './gameStore'
import {
  hydrateActiveSession,
  reviveHydratedActiveSession,
} from './activeSessionHydration'
import {
  ActiveSessionHydrationClient,
  type ActiveSessionHydrationWorkerLike,
} from './activeSessionHydrationClient'
import type {
  ActiveSessionHydrationRequest,
  ActiveSessionHydrationResponse,
  HydratedActiveSessionWire,
} from './activeSessionHydrationProtocol'

const session: ActiveSession = {
  pgn: '1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 *',
  startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  mode: 'bot',
  botLevel: 'balanced',
  orientation: 'white',
}

function wire(value: ActiveSession = session): HydratedActiveSessionWire {
  const hydrated = hydrateActiveSession(value)
  if (!hydrated) throw new Error('Expected a valid active-session snapshot.')
  return hydrated
}

class FakeActiveSessionWorker implements ActiveSessionHydrationWorkerLike {
  onmessage: ((event: MessageEvent<ActiveSessionHydrationResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly messages: ActiveSessionHydrationRequest[] = []
  terminated = false

  postMessage(message: ActiveSessionHydrationRequest): void {
    this.messages.push(message)
  }

  terminate(): void {
    this.terminated = true
  }

  reply(response: ActiveSessionHydrationResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<ActiveSessionHydrationResponse>)
  }

  failToStart(): void {
    this.onerror?.({ message: 'Worker module blocked.' } as ErrorEvent)
  }
}

describe('ActiveSessionHydrationClient', () => {
  it('does not start a Worker until a saved game explicitly needs restoration', () => {
    let starts = 0
    const client = new ActiveSessionHydrationClient(() => {
      starts += 1
      return new FakeActiveSessionWorker()
    }, true)

    expect(starts).toBe(0)
    client.dispose()
  })

  it('revives a one-shot Worker snapshot with undo and repetition history intact', async () => {
    const worker = new FakeActiveSessionWorker()
    const client = new ActiveSessionHydrationClient(() => worker, true)
    const pending = client.hydrate(session)
    const request = worker.messages[0]
    if (!request) throw new Error('Expected an active-session request.')

    worker.reply({
      type: 'active-session-result',
      id: request.id,
      // Worker postMessage removes the Chess prototype. This mirrors the
      // browser boundary rather than merely returning the source object.
      hydrated: structuredClone(wire()),
    })

    const restored = await pending
    expect(restored?.game.fen()).toBe(wire().finalFen)
    expect(restored?.verboseHistory).toHaveLength(8)
    expect(restored?.game.isThreefoldRepetition()).toBe(true)
    expect(restored?.game.undo()?.san).toBe('Ng8')
    expect(worker.terminated).toBe(true)
    client.dispose()
  })

  it('terminates stale restoration so only the latest snapshot can resolve', async () => {
    const workers: FakeActiveSessionWorker[] = []
    const client = new ActiveSessionHydrationClient(() => {
      const worker = new FakeActiveSessionWorker()
      workers.push(worker)
      return worker
    }, true)
    const first = client.hydrate(session)
    const firstOutcome = first.catch((error: unknown) => error)
    const second = client.hydrate({ ...session, pgn: '1. e4 e5 *' })

    await expect(firstOutcome).resolves.toMatchObject({
      name: 'AbortError',
      message: 'Superseded by a newer saved game restoration request.',
    })
    expect(workers[0]?.terminated).toBe(true)
    const request = workers[1]?.messages[0]
    if (!request) throw new Error('Expected replacement active-session request.')
    workerReply(workers[1], request.id, wire({ ...session, pgn: '1. e4 e5 *' }))

    await expect(second).resolves.toMatchObject({ verboseHistory: [{ san: 'e4' }, { san: 'e5' }] })
    client.dispose()
  })

  it('uses a yielded local parser only when Workers are unavailable', async () => {
    const client = new ActiveSessionHydrationClient(() => {
      throw new Error('Workers unavailable')
    }, false)
    let settled = false
    const pending = client.hydrateRaw(JSON.stringify(session)).then((value) => {
      settled = true
      return value
    })

    expect(settled).toBe(false)
    expect((await pending)?.verboseHistory[0]?.san).toBe('Nf3')
    client.dispose()
  })

  it('uses that same yielded parser after a Worker module is blocked', async () => {
    const worker = new FakeActiveSessionWorker()
    const client = new ActiveSessionHydrationClient(() => worker, true)
    const pending = client.hydrate(session)

    worker.failToStart()

    expect((await pending)?.verboseHistory[0]?.san).toBe('Nf3')
    expect(worker.terminated).toBe(true)
    client.dispose()
  })

  it('fails closed when a Worker snapshot does not verify', async () => {
    const worker = new FakeActiveSessionWorker()
    const client = new ActiveSessionHydrationClient(() => worker, true)
    const outcome = client.hydrate(session).catch((error: unknown) => error)
    const request = worker.messages[0]
    if (!request) throw new Error('Expected active-session request.')

    worker.reply({
      type: 'active-session-result',
      id: request.id,
      hydrated: { ...structuredClone(wire()), finalFen: 'not-a-fen' },
    })

    const error = await outcome
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('snapshot did not verify')
    expect(worker.terminated).toBe(true)
    client.dispose()
  })
})

describe('active-session hydration snapshot boundary', () => {
  it('preserves complete chess state through a Worker-style structured clone', () => {
    const restored = reviveHydratedActiveSession(structuredClone(wire()))

    expect(restored?.verboseHistory.map((move) => move.san)).toEqual([
      'Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8',
    ])
    expect(restored?.game.isThreefoldRepetition()).toBe(true)
    expect(restored?.game.undo()?.san).toBe('Ng8')
  })

  it('keeps PGN headers and comments through the structured clone', () => {
    const annotated: ActiveSession = {
      ...session,
      pgn: '[Event "Local recovery"]\n[Site "KnightClub"]\n\n1. e4 {A saved note} e5 *',
    }
    const restored = reviveHydratedActiveSession(structuredClone(wire(annotated)))

    expect(restored?.game.getHeaders()).toMatchObject({ Event: 'Local recovery', Site: 'KnightClub' })
    expect(restored?.game.getComments()).toEqual([
      expect.objectContaining({ comment: 'A saved note' }),
    ])
  })
})

function workerReply(
  worker: FakeActiveSessionWorker | undefined,
  id: number,
  hydrated: HydratedActiveSessionWire,
): void {
  if (!worker) throw new Error('Expected replacement Worker.')
  worker.reply({ type: 'active-session-result', id, hydrated: structuredClone(hydrated) })
}
