import { describe, expect, it } from 'vitest'
import { createPgnTimeline } from '../analysis/analysisModel'
import {
  createRetryItem,
  type RetryItem,
} from '../review/retry'
import type { ReviewedMove } from '../review/reviewModel'
import { MAX_BROWSER_RETRY_STORAGE_BYTES } from '../review/retryPersistence'
import { hydrateTrainingRetryItems } from './trainingRetryHydration'
import {
  TrainingRetryHydrationClient,
  type TrainingRetryHydrationWorkerLike,
} from './trainingRetryHydrationClient'
import type {
  TrainingRetryHydrationRequest,
  TrainingRetryHydrationResponse,
} from './trainingRetryHydrationProtocol'

class FakeTrainingRetryHydrationWorker implements TrainingRetryHydrationWorkerLike {
  onmessage: ((event: MessageEvent<TrainingRetryHydrationResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly messages: TrainingRetryHydrationRequest[] = []
  terminated = false

  postMessage(message: TrainingRetryHydrationRequest): void {
    this.messages.push(message)
  }

  terminate(): void {
    this.terminated = true
  }

  reply(response: TrainingRetryHydrationResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<TrainingRetryHydrationResponse>)
  }

  failToStart(): void {
    this.onerror?.({ message: 'Worker module blocked.' } as ErrorEvent)
  }
}

function retry(now = '2026-07-22T00:00:00.000Z'): RetryItem {
  const timeline = createPgnTimeline('1. e4 e5 *')
  const source = timeline.moves[0]
  if (!source) throw new Error('Expected a source move for the test.')
  const move: ReviewedMove = {
    ply: source.ply,
    moveNumber: source.moveNumber,
    color: source.color,
    san: source.san,
    from: source.from,
    to: source.to,
    classification: 'mistake',
    accuracy: 50,
    centipawnLoss: 100,
    expectedLoss: 0.2,
    bestMoveUci: 'd2d4',
    bestMoveSan: 'd4',
    isBestMove: false,
    phase: 'opening',
    bestScore: { kind: 'cp', value: 40, bound: null },
    playedScore: { kind: 'cp', value: 0, bound: null },
    bestLineSan: ['d4', 'e5'],
    depth: 18,
    confidence: 'normal',
    feedback: 'Recorded review feedback.',
  }
  const item = createRetryItem({ timeline, move, reviewKey: '0123456789abcdef', now })
  if (!item) throw new Error('Expected a retry item for the test.')
  return item
}

describe('TrainingRetryHydrationClient', () => {
  it('applies the matching dedicated Worker result and releases its one-shot Worker', async () => {
    const item = retry()
    const raw = JSON.stringify([item])
    const worker = new FakeTrainingRetryHydrationWorker()
    const client = new TrainingRetryHydrationClient(() => worker, true)
    const pending = client.hydrate(raw)
    const request = worker.messages[0]
    if (!request) throw new Error('Expected a retry hydration request.')

    worker.reply({
      type: 'training-retry-hydration-result',
      id: request.id,
      items: [item],
    })

    await expect(pending).resolves.toEqual([item])
    expect(worker.terminated).toBe(true)
    client.dispose()
  })

  it('terminates stale work so only the latest Train request can resolve', async () => {
    const workers: FakeTrainingRetryHydrationWorker[] = []
    const client = new TrainingRetryHydrationClient(() => {
      const worker = new FakeTrainingRetryHydrationWorker()
      workers.push(worker)
      return worker
    }, true)
    const first = client.hydrate(JSON.stringify([retry('2026-07-22T00:00:00.000Z')]))
    const firstOutcome = first.catch((error: unknown) => error)
    const item = retry('2026-07-23T00:00:00.000Z')
    const second = client.hydrate(JSON.stringify([item]))

    await expect(firstOutcome).resolves.toMatchObject({
      name: 'AbortError',
      message: 'Superseded by a newer training retry hydration request.',
    })
    expect(workers[0]?.terminated).toBe(true)
    const request = workers[1]?.messages[0]
    if (!request) throw new Error('Expected a replacement retry hydration request.')
    workers[1]?.reply({
      type: 'training-retry-hydration-result',
      id: request.id,
      items: [item],
    })

    await expect(second).resolves.toEqual([item])
    client.dispose()
  })

  it('cancels an in-flight Train hydration immediately when its surface closes', async () => {
    const worker = new FakeTrainingRetryHydrationWorker()
    const client = new TrainingRetryHydrationClient(() => worker, true)
    const pending = client.hydrate(JSON.stringify([retry()]))
    const outcome = pending.catch((error: unknown) => error)

    client.cancel('Train surface closed.')

    await expect(outcome).resolves.toMatchObject({ name: 'AbortError', message: 'Train surface closed.' })
    expect(worker.terminated).toBe(true)
    client.dispose()
  })

  it('uses the yielded local parser only when Workers are unavailable', async () => {
    const item = retry()
    const client = new TrainingRetryHydrationClient(() => {
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

  it('uses that same yielded parser after a Worker module is blocked', async () => {
    const item = retry()
    const worker = new FakeTrainingRetryHydrationWorker()
    const client = new TrainingRetryHydrationClient(() => worker, true)
    const pending = client.hydrate(JSON.stringify([item]))

    worker.failToStart()

    await expect(pending).resolves.toEqual([item])
    expect(worker.terminated).toBe(true)
    client.dispose()
  })

  it('rejects an unexpected Worker result instead of running a main-thread parser', async () => {
    const worker = new FakeTrainingRetryHydrationWorker()
    const client = new TrainingRetryHydrationClient(() => worker, true)
    const pending = client.hydrate(JSON.stringify([retry()]))
    const outcome = pending.catch((error: unknown) => error)
    const request = worker.messages[0]
    if (!request) throw new Error('Expected a retry hydration request.')

    worker.reply({ type: 'unexpected-result', id: request.id } as unknown as TrainingRetryHydrationResponse)

    const error = await outcome
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain('unexpected result')
    expect(worker.terminated).toBe(true)
    client.dispose()
  })

  it('fails closed for corrupt snapshots in the shared Worker/fallback parser', async () => {
    expect(hydrateTrainingRetryItems('{ definitely not JSON')).toEqual([])
    expect(hydrateTrainingRetryItems(JSON.stringify([{ retryKey: '0123456789abcdef:1' }]))).toEqual([])
    expect(hydrateTrainingRetryItems('x'.repeat(MAX_BROWSER_RETRY_STORAGE_BYTES + 1))).toEqual([])

    const client = new TrainingRetryHydrationClient(() => {
      throw new Error('Workers unavailable')
    }, false)
    await expect(client.hydrate('{ definitely not JSON')).resolves.toEqual([])
    client.dispose()
  })
})
