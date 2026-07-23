import { describe, expect, it } from 'vitest'
import { SEED_TACTICS } from '../tactics/seedPuzzles'
import {
  MAX_TACTICS_STATE_BYTES,
  createTacticsState,
  recordTacticsTerminalAttempt,
  type TacticsState,
} from '../tactics/tacticsPersistence'
import { hydrateTacticsState } from './tacticsHydration'
import {
  TacticsHydrationClient,
  type TacticsHydrationWorkerLike,
} from './tacticsHydrationClient'
import type {
  TacticsHydrationRequest,
  TacticsHydrationResponse,
} from './tacticsHydrationProtocol'

class FakeTacticsHydrationWorker implements TacticsHydrationWorkerLike {
  onmessage: ((event: MessageEvent<TacticsHydrationResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly messages: TacticsHydrationRequest[] = []
  terminated = false

  postMessage(message: TacticsHydrationRequest): void {
    this.messages.push(message)
  }

  terminate(): void {
    this.terminated = true
  }

  reply(response: TacticsHydrationResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<TacticsHydrationResponse>)
  }

  failToStart(): void {
    this.onerror?.({ message: 'Worker module blocked.' } as ErrorEvent)
  }
}

function tacticsState(now = '2026-07-22T00:00:00.000Z'): TacticsState {
  const puzzle = SEED_TACTICS[1]
  if (!puzzle) throw new Error('Expected a tactic puzzle for the test.')
  return recordTacticsTerminalAttempt(createTacticsState(), puzzle, {
    attemptId: `attempt-${now}`.replace(/[^A-Za-z0-9._-]/g, '-'),
    attemptedAt: now,
    outcome: 'solved',
    elapsedMs: 1_200,
    moveCount: 2,
    hintCount: 0,
  }).state
}

describe('TacticsHydrationClient', () => {
  it('keeps construction inert, then applies the matching dedicated Worker result and releases it', async () => {
    const state = tacticsState()
    const worker = new FakeTacticsHydrationWorker()
    let created = 0
    const client = new TacticsHydrationClient(() => {
      created += 1
      return worker
    }, true)

    expect(created).toBe(0)
    const pending = client.hydrate(JSON.stringify(state))
    expect(created).toBe(1)
    const request = worker.messages[0]
    if (!request) throw new Error('Expected a tactics hydration request.')

    worker.reply({
      type: 'tactics-hydration-result',
      id: request.id,
      state,
    })

    await expect(pending).resolves.toEqual(state)
    expect(worker.terminated).toBe(true)
    client.dispose()
  })

  it('terminates stale work so only the latest tactics request can resolve', async () => {
    const workers: FakeTacticsHydrationWorker[] = []
    const client = new TacticsHydrationClient(() => {
      const worker = new FakeTacticsHydrationWorker()
      workers.push(worker)
      return worker
    }, true)
    const first = client.hydrate(JSON.stringify(tacticsState('2026-07-22T00:00:00.000Z')))
    const firstOutcome = first.catch((error: unknown) => error)
    const state = tacticsState('2026-07-23T00:00:00.000Z')
    const second = client.hydrate(JSON.stringify(state))

    await expect(firstOutcome).resolves.toMatchObject({
      name: 'AbortError',
      message: 'Superseded by a newer tactics hydration request.',
    })
    expect(workers[0]?.terminated).toBe(true)
    const request = workers[1]?.messages[0]
    if (!request) throw new Error('Expected a replacement tactics hydration request.')
    workers[1]?.reply({
      type: 'tactics-hydration-result',
      id: request.id,
      state,
    })

    await expect(second).resolves.toEqual(state)
    client.dispose()
  })

  it('cancels in-flight tactics hydration immediately when its surface closes', async () => {
    const worker = new FakeTacticsHydrationWorker()
    const client = new TacticsHydrationClient(() => worker, true)
    const pending = client.hydrate(JSON.stringify(tacticsState()))
    const outcome = pending.catch((error: unknown) => error)

    client.cancel('Tactics surface closed.')

    await expect(outcome).resolves.toMatchObject({ name: 'AbortError', message: 'Tactics surface closed.' })
    expect(worker.terminated).toBe(true)
    client.dispose()
  })

  it('uses the yielded local parser only when Workers are unavailable', async () => {
    const state = tacticsState()
    const client = new TacticsHydrationClient(() => {
      throw new Error('Workers unavailable')
    }, true)
    let settled = false
    const pending = client.hydrate(JSON.stringify(state)).then((hydrated) => {
      settled = true
      return hydrated
    })

    expect(settled).toBe(false)
    await expect(pending).resolves.toEqual(state)
    client.dispose()
  })

  it('uses that same yielded parser after a Worker module is blocked', async () => {
    const state = tacticsState()
    const worker = new FakeTacticsHydrationWorker()
    const client = new TacticsHydrationClient(() => worker, true)
    const pending = client.hydrate(JSON.stringify(state))

    worker.failToStart()

    await expect(pending).resolves.toEqual(state)
    expect(worker.terminated).toBe(true)
    client.dispose()
  })

  it('rejects an unexpected Worker result instead of running a main-thread parser', async () => {
    const worker = new FakeTacticsHydrationWorker()
    const client = new TacticsHydrationClient(() => worker, true)
    const pending = client.hydrate(JSON.stringify(tacticsState()))
    const outcome = pending.catch((error: unknown) => error)
    const request = worker.messages[0]
    if (!request) throw new Error('Expected a tactics hydration request.')

    worker.reply({ type: 'unexpected-result', id: request.id } as unknown as TacticsHydrationResponse)

    const error = await outcome
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('unexpected result')
    expect(worker.terminated).toBe(true)
    client.dispose()
  })

  it('fails closed for corrupt and oversized snapshots in the shared Worker/fallback parser', async () => {
    expect(hydrateTacticsState('{ definitely not JSON')).toEqual(createTacticsState())
    expect(hydrateTacticsState(JSON.stringify({ progress: [{ seedId: 'seed-v1:missing-fields' }], attempts: [] })))
      .toEqual(createTacticsState())
    expect(hydrateTacticsState('x'.repeat(MAX_TACTICS_STATE_BYTES + 1))).toEqual(createTacticsState())

    const client = new TacticsHydrationClient(() => {
      throw new Error('Workers unavailable')
    }, false)
    await expect(client.hydrate('{ definitely not JSON')).resolves.toEqual(createTacticsState())
    client.dispose()
  })
})
