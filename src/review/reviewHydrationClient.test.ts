import { describe, expect, it, vi } from 'vitest'
import { Chess } from 'chess.js'
import { createPgnTimeline } from '../analysis/analysisModel'
import type { GameReview } from './gameReviewRunner'
import {
  createPersistedReview,
  hydrateBrowserReviewRaw,
  hydratePersistedReview,
  MAX_REVIEW_PLIES,
  type HydratedPersistedReview,
  type PersistedReview,
} from './reviewPersistence'
import {
  ReviewHydrationClient,
  type ReviewHydrationWorkerLike,
} from './reviewHydrationClient'
import type {
  ReviewHydrationRequest,
  ReviewHydrationResponse,
} from './reviewHydrationProtocol'

class FakeReviewHydrationWorker implements ReviewHydrationWorkerLike {
  onmessage: ((event: MessageEvent<ReviewHydrationResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly messages: ReviewHydrationRequest[] = []
  terminated = false

  postMessage(message: ReviewHydrationRequest): void {
    this.messages.push(message)
  }

  terminate(): void {
    this.terminated = true
  }

  reply(response: ReviewHydrationResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<ReviewHydrationResponse>)
  }

  failToStart(): void {
    this.onerror?.({ message: 'Worker module blocked.' } as ErrorEvent)
  }
}

function repeatedKnightPgn(plies: number): string {
  const game = new Chess()
  const cycle = ['Nf3', 'Nf6', 'Ng1', 'Ng8']
  for (let index = 0; index < plies; index += 1) game.move(cycle[index % cycle.length]!)
  return game.pgn()
}

function reportFor(timeline: ReturnType<typeof createPgnTimeline>): GameReview {
  return {
    createdAt: '2026-07-23T00:00:00.000Z',
    engineName: 'Fakefish',
    enginePath: '/fake',
    settings: { moveTimeMs: 100, depth: 12, nodes: null, multiPv: 1, threads: 1, hashMb: 16 },
    totalElapsedMs: 1,
    moves: timeline.moves.map((move) => ({
      ...move,
      classification: 'best' as const,
      accuracy: 100,
      centipawnLoss: 0,
      expectedLoss: 0,
      bestMoveUci: `${move.from}${move.to}${move.promotion ?? ''}`,
      bestMoveSan: move.san,
      isBestMove: true,
      phase: 'opening' as const,
      bestScore: { kind: 'cp' as const, value: 0, bound: null },
      playedScore: { kind: 'cp' as const, value: 0, bound: null },
      bestLineSan: [move.san],
      depth: 12,
      confidence: 'normal' as const,
      feedback: 'Fixture.',
    })),
    summary: {
      accuracy: 100,
      whiteAccuracy: 100,
      blackAccuracy: 100,
      averageCentipawnLoss: 0,
      bestMoveRate: 100,
      classifications: {
        brilliant: 0, great: 0, best: timeline.moves.length, excellent: 0,
        good: 0, book: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0, forced: 0,
      },
      phaseAccuracy: { opening: 100, middlegame: null, endgame: null },
      turningPoints: [],
    },
  }
}

function reviewFixture(plies = 4): PersistedReview {
  const timeline = createPgnTimeline(repeatedKnightPgn(plies))
  return createPersistedReview(timeline, reportFor(timeline))
}

let longFixture: { record: PersistedReview; hydration: HydratedPersistedReview } | null = null

function fullLengthFixture(): { record: PersistedReview; hydration: HydratedPersistedReview } {
  if (longFixture) return longFixture
  const record = reviewFixture(MAX_REVIEW_PLIES)
  longFixture = { record, hydration: hydratePersistedReview(record) }
  return longFixture
}

describe('ReviewHydrationClient', () => {
  it('does not start a Worker until a saved review is explicitly restored', () => {
    let starts = 0
    const client = new ReviewHydrationClient(() => {
      starts += 1
      return new FakeReviewHydrationWorker()
    }, true)

    expect(starts).toBe(0)
    client.dispose()
  })

  it('accepts a matching Worker result and releases its one-shot Worker', async () => {
    const record = reviewFixture()
    const hydration = hydratePersistedReview(record)
    const worker = new FakeReviewHydrationWorker()
    const client = new ReviewHydrationClient(() => worker, true)
    const pending = client.hydrateNative(JSON.parse(JSON.stringify(record)), record.reviewKey)
    const request = worker.messages[0]
    if (!request) throw new Error('Expected a saved-review request.')

    worker.reply({
      type: 'review-hydration-result',
      id: request.id,
      requestType: 'hydrate-native-review',
      hydration: structuredClone(hydration),
    })

    const restored = await pending
    expect(restored?.record.reviewKey).toBe(record.reviewKey)
    expect(restored?.timeline.moves[0]).toMatchObject({ san: 'Nf3' })
    expect(worker.terminated).toBe(true)
    client.dispose()
  })

  it('keeps a full 1,024-ply report off the UI-thread chess replay path', async () => {
    const { record, hydration } = fullLengthFixture()
    const worker = new FakeReviewHydrationWorker()
    const client = new ReviewHydrationClient(() => worker, true)
    const move = vi.spyOn(Chess.prototype, 'move')
    const loadPgn = vi.spyOn(Chess.prototype, 'loadPgn')
    try {
      const pending = client.hydrateNative(JSON.parse(JSON.stringify(record)), record.reviewKey)
      const request = worker.messages[0]
      if (!request) throw new Error('Expected a saved-review request.')
      worker.reply({
        type: 'review-hydration-result',
        id: request.id,
        requestType: 'hydrate-native-review',
        hydration: structuredClone(hydration),
      })

      await expect(pending).resolves.toMatchObject({ record: { moveCount: MAX_REVIEW_PLIES } })
      expect(loadPgn).not.toHaveBeenCalled()
      expect(move).not.toHaveBeenCalled()
    } finally {
      loadPgn.mockRestore()
      move.mockRestore()
      client.dispose()
    }
  })

  it('terminates stale validation so only the latest saved review can resolve', async () => {
    const record = reviewFixture()
    const hydration = hydratePersistedReview(record)
    const workers: FakeReviewHydrationWorker[] = []
    const client = new ReviewHydrationClient(() => {
      const worker = new FakeReviewHydrationWorker()
      workers.push(worker)
      return worker
    }, true)
    const first = client.hydrateNative(record, record.reviewKey)
    const firstOutcome = first.catch((error: unknown) => error)
    const second = client.hydrateNative(record, record.reviewKey)

    await expect(firstOutcome).resolves.toMatchObject({
      name: 'AbortError',
      message: 'Superseded by a newer saved review restoration request.',
    })
    expect(workers[0]?.terminated).toBe(true)
    const request = workers[1]?.messages[0]
    if (!request) throw new Error('Expected replacement saved-review request.')
    workers[1]?.reply({
      type: 'review-hydration-result',
      id: request.id,
      requestType: 'hydrate-native-review',
      hydration: structuredClone(hydration),
    })

    await expect(second).resolves.toMatchObject({ record: { reviewKey: record.reviewKey } })
    client.dispose()
  })

  it('fails visibly instead of falling back to a UI-thread parser when Workers are unavailable', async () => {
    const { record } = fullLengthFixture()
    const client = new ReviewHydrationClient(() => {
      throw new Error('Workers unavailable')
    }, false)
    const move = vi.spyOn(Chess.prototype, 'move')
    const loadPgn = vi.spyOn(Chess.prototype, 'loadPgn')
    try {
      await expect(client.hydrateNative(JSON.parse(JSON.stringify(record)), record.reviewKey)).rejects.toThrow(
        'This saved review needs a local background Worker to open safely.',
      )
      expect(loadPgn).not.toHaveBeenCalled()
      expect(move).not.toHaveBeenCalled()
    } finally {
      loadPgn.mockRestore()
      move.mockRestore()
      client.dispose()
    }
  })

  it('keeps that no-fallback guarantee when a constructed Worker fails to start', async () => {
    const record = reviewFixture()
    const worker = new FakeReviewHydrationWorker()
    const client = new ReviewHydrationClient(() => worker, true)
    const pending = client.hydrateNative(record, record.reviewKey)

    worker.failToStart()

    await expect(pending).rejects.toThrow('This saved review needs a local background Worker to open safely.')
    expect(worker.terminated).toBe(true)
    client.dispose()
  })

  it('fails closed on an unexpected Worker result', async () => {
    const record = reviewFixture()
    const worker = new FakeReviewHydrationWorker()
    const client = new ReviewHydrationClient(() => worker, true)
    const pending = client.hydrateBrowser(JSON.stringify([record]), record.reviewKey)
    const request = worker.messages[0]
    if (!request) throw new Error('Expected a browser saved-review request.')

    worker.reply({
      type: 'review-hydration-result',
      id: request.id,
      requestType: 'hydrate-native-review',
      hydration: null,
    })

    await expect(pending).rejects.toThrow('unexpected result')
    expect(worker.terminated).toBe(true)
    client.dispose()
  })
})

describe('saved-review Worker helpers', () => {
  it('retains the corrupt-newer duplicate fallback while strictly validating the selected record', () => {
    const record = reviewFixture()
    const corrupt = JSON.parse(JSON.stringify(record)) as PersistedReview
    corrupt.reviewedAt = '2026-07-24T00:00:00.000Z'
    corrupt.report.moves[1]!.to = 'a1'

    expect(hydrateBrowserReviewRaw(JSON.stringify([corrupt, record]), record.reviewKey)?.record).toEqual(record)
  })
})
