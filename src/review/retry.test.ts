import { Chess } from 'chess.js'
import { describe, expect, it, vi } from 'vitest'
import { createPgnTimeline, type AnalysisTimeline } from '../analysis/analysisModel'
import type { CoachGuidance } from './coach'
import {
  RETRY_SCHEDULE_DAYS,
  adoptWorkerRetryTimelineVerification,
  createRetryItem,
  createRetryItemFromVerifiedTimeline,
  createVerifiedRetryTimeline,
  evaluateRetryMove,
  isRetryEligibleReviewMove,
  recordRetryAttempt,
  verifyRetryTimelineForWorker,
  type RetryItem,
  type VerifiedRetryTimeline,
} from './retry'
import type { ReviewedMove } from './reviewModel'

function reviewedMove(
  timeline: AnalysisTimeline,
  ply: number,
  options: Partial<ReviewedMove> = {},
): ReviewedMove {
  const source = timeline.moves[ply - 1]
  if (!source) throw new Error('Expected a source move for the test.')
  return {
    ply: source.ply,
    moveNumber: source.moveNumber,
    color: source.color,
    san: source.san,
    from: source.from,
    to: source.to,
    classification: 'mistake',
    accuracy: 55,
    centipawnLoss: 110,
    expectedLoss: 0.2,
    bestMoveUci: 'd2d4',
    bestMoveSan: 'd4',
    isBestMove: false,
    phase: 'opening',
    bestScore: { kind: 'cp', value: 45, bound: null },
    playedScore: { kind: 'cp', value: 5, bound: null },
    bestLineSan: ['d4', 'e5', 'c4'],
    depth: 18,
    confidence: 'normal',
    feedback: 'Recorded review feedback.',
    ...options,
  }
}

function item(now = '2026-07-22T00:00:00.000Z'): RetryItem {
  const timeline = createPgnTimeline('1. e4 e5 2. Nf3 Nc6 *')
  const created = createRetryItem({
    timeline,
    move: reviewedMove(timeline, 1),
    reviewKey: '0123456789abcdef',
    now,
  })
  if (!created) throw new Error('Expected a valid retry item for the test.')
  return created
}

function repeatedKnightTimeline(plies = 1_024): AnalysisTimeline {
  const game = new Chess()
  const cycle = ['Nf3', 'Nf6', 'Ng1', 'Ng8']
  for (let index = 0; index < plies; index += 1) game.move(cycle[index % cycle.length]!)
  return createPgnTimeline(game.pgn())
}

describe('retry item domain', () => {
  it('reconstructs a self-contained retry item from the exact reviewed pre-move position', () => {
    const timeline = createPgnTimeline('1. e4 e5 2. Nf3 Nc6 *')
    const guidance: CoachGuidance = {
      summary: 'A recorded comparison.',
      focus: 'Start with forcing checks before committing.',
      continuation: [],
      evidence: [],
    }

    expect(createRetryItem({
      timeline,
      move: reviewedMove(timeline, 1),
      reviewKey: '0123456789abcdef',
      guidance,
      now: '2026-07-22T00:00:00.000Z',
    })).toEqual({
      schemaVersion: 1,
      retryKey: '0123456789abcdef:1',
      reviewKey: '0123456789abcdef',
      sourcePly: 1,
      preFen: timeline.positions[0].fen,
      sideToMove: 'w',
      playedMoveUci: 'e2e4',
      playedMoveSan: 'e4',
      solutionUci: 'd2d4',
      solutionSan: 'd4',
      solutionLineSan: ['d4', 'e5', 'c4'],
      classification: 'mistake',
      focus: 'Start with forcing checks before committing.',
      status: 'active',
      attemptCount: 0,
      correctStreak: 0,
      dueAt: '2026-07-22T00:00:00.000Z',
      lastAttemptAt: null,
      createdAt: '2026-07-22T00:00:00.000Z',
      updatedAt: '2026-07-22T00:00:00.000Z',
    })
  })

  it('uses the reviewed side and the exact pre-move FEN for black retries', () => {
    const timeline = createPgnTimeline('1. e4 e5 2. Nf3 Nc6 *')
    const retry = createRetryItem({
      timeline,
      move: reviewedMove(timeline, 2, {
        bestMoveUci: 'c7c5',
        bestMoveSan: 'c5',
        bestLineSan: ['c5', 'Nf3'],
      }),
      reviewKey: '0123456789abcdef',
      now: '2026-07-22T00:00:00.000Z',
    })

    expect(retry).toMatchObject({
      sourcePly: 2,
      preFen: timeline.positions[1].fen,
      sideToMove: 'b',
      playedMoveUci: 'e7e5',
      solutionUci: 'c7c5',
    })
  })

  it('requires an exact UCI target, including the promotion piece', () => {
    const timeline = createPgnTimeline(
      '[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n\n1. a8=Q+ *',
    )
    const retry = createRetryItem({
      timeline,
      move: reviewedMove(timeline, 1, {
        bestMoveUci: 'a7a8n',
        bestMoveSan: 'a8=N',
        bestLineSan: ['a8=N'],
      }),
      reviewKey: '0123456789abcdef',
      now: '2026-07-22T00:00:00.000Z',
    })
    if (!retry) throw new Error('Expected promotion retry item.')

    expect(evaluateRetryMove(retry, { from: 'a7', to: 'a8', promotion: 'q' })).toBe('not-recorded')
    expect(evaluateRetryMove(retry, { from: 'a7', to: 'a8', promotion: 'n' })).toBe('recorded-solution')
    expect(evaluateRetryMove(retry, { from: 'a7', to: 'a8' })).toBe('illegal')
  })

  it('drops a malformed recorded continuation but keeps a legal one-move retry', () => {
    const timeline = createPgnTimeline('1. e4 e5 *')
    const retry = createRetryItem({
      timeline,
      move: reviewedMove(timeline, 1, { bestLineSan: ['d4', 'not legal'] }),
      reviewKey: '0123456789abcdef',
      now: '2026-07-22T00:00:00.000Z',
    })

    expect(retry?.solutionLineSan).toEqual([])
    expect(retry?.solutionSan).toBe('d4')
  })

  it('fails closed for non-adverse, low-confidence, best, mismatched, and illegal source data', () => {
    const timeline = createPgnTimeline('1. e4 e5 *')
    const base = { timeline, move: reviewedMove(timeline, 1), reviewKey: '0123456789abcdef' }

    expect(createRetryItem({ ...base, move: reviewedMove(timeline, 1, { classification: 'good' }) })).toBeNull()
    expect(createRetryItem({ ...base, move: reviewedMove(timeline, 1, { confidence: 'limited' }) })).toBeNull()
    expect(createRetryItem({ ...base, move: reviewedMove(timeline, 1, { isBestMove: true }) })).toBeNull()
    expect(createRetryItem({ ...base, move: reviewedMove(timeline, 1, { to: 'e3' }) })).toBeNull()
    expect(createRetryItem({ ...base, move: reviewedMove(timeline, 1, { bestMoveUci: 'a1a8' }) })).toBeNull()
    expect(createRetryItem({ ...base, reviewKey: 'not-a-review-key' })).toBeNull()
  })

  it('keeps lightweight Review eligibility separate from fail-closed retry creation', () => {
    const timeline = createPgnTimeline('1. e4 e5 *')
    const eligible = reviewedMove(timeline, 1)
    const illegalButWellFormed = reviewedMove(timeline, 1, { bestMoveUci: 'a1a8' })

    expect(isRetryEligibleReviewMove(eligible)).toBe(true)
    expect(isRetryEligibleReviewMove(reviewedMove(timeline, 1, { classification: 'good' }))).toBe(false)
    expect(isRetryEligibleReviewMove(reviewedMove(timeline, 1, { confidence: 'limited' }))).toBe(false)
    expect(isRetryEligibleReviewMove(reviewedMove(timeline, 1, { isBestMove: true }))).toBe(false)
    expect(isRetryEligibleReviewMove(reviewedMove(timeline, 1, { bestMoveUci: null }))).toBe(false)

    // UI eligibility intentionally avoids a chess replay; the save boundary
    // still rejects a syntactically valid but illegal recorded solution.
    expect(isRetryEligibleReviewMove(illegalButWellFormed)).toBe(true)
    expect(createRetryItem({
      timeline,
      move: illegalButWellFormed,
      reviewKey: '0123456789abcdef',
    })).toBeNull()
  })

  it('reuses one immutable verified timeline without weakening the standalone fail-closed replay', () => {
    const timeline = createPgnTimeline('1. e4 e5 2. Nf3 Nc6 *')
    const move = reviewedMove(timeline, 2, {
      bestMoveUci: 'c7c5',
      bestMoveSan: 'c5',
      bestLineSan: ['c5', 'Nf3'],
    })
    const verifiedTimeline = createVerifiedRetryTimeline(timeline)
    if (!verifiedTimeline) throw new Error('Expected a verified retry timeline.')

    const input = {
      move,
      reviewKey: '0123456789abcdef',
      now: '2026-07-22T00:00:00.000Z',
    }
    const strict = createRetryItem({ timeline, ...input })
    const reused = createRetryItemFromVerifiedTimeline({ verifiedTimeline, ...input })

    expect(reused).toEqual(strict)
    expect(Object.isFrozen(verifiedTimeline)).toBe(true)
    expect(Object.isFrozen(verifiedTimeline.moves)).toBe(true)
    expect(Object.isFrozen(verifiedTimeline.moves[1])).toBe(true)

    // A later raw-object mutation cannot alter the captured facts. The
    // original public path still replays every move and rejects it.
    timeline.positions[2]!.fen = timeline.positions[1]!.fen
    expect(createRetryItem({ timeline, ...input })).toBeNull()
    expect(createRetryItemFromVerifiedTimeline({ verifiedTimeline, ...input })).toMatchObject({
      sourcePly: 2,
      preFen: strict?.preFen,
      playedMoveUci: 'e7e5',
    })

    const forged = { moves: verifiedTimeline.moves } as unknown as VerifiedRetryTimeline
    expect(createRetryItemFromVerifiedTimeline({ verifiedTimeline: forged, ...input })).toBeNull()
  })

  it('refuses a malformed timeline before it can become a reusable retry snapshot', () => {
    const timeline = createPgnTimeline('1. e4 e5 2. Nf3 Nc6 *')
    timeline.moves[3]!.san = 'Na9'

    expect(createVerifiedRetryTimeline(timeline)).toBeNull()
  })

  it('does not replay a 1,024-ply game again for each Review practice prompt', () => {
    const timeline = repeatedKnightTimeline()
    const first = reviewedMove(timeline, 1)
    const second = reviewedMove(timeline, 2, {
      bestMoveUci: 'c7c5',
      bestMoveSan: 'c5',
      bestLineSan: ['c5', 'Nf3'],
    })
    const move = vi.spyOn(Chess.prototype, 'move')

    try {
      const verifiedTimeline = createVerifiedRetryTimeline(timeline)
      if (!verifiedTimeline) throw new Error('Expected a verified long retry timeline.')
      expect(move.mock.calls.length).toBeGreaterThanOrEqual(1_024)

      move.mockClear()
      expect(createRetryItemFromVerifiedTimeline({
        verifiedTimeline,
        move: first,
        reviewKey: '0123456789abcdef',
        now: '2026-07-22T00:00:00.000Z',
      })).not.toBeNull()
      expect(createRetryItemFromVerifiedTimeline({
        verifiedTimeline,
        move: second,
        reviewKey: '0123456789abcdef',
        now: '2026-07-22T00:00:00.000Z',
      })).not.toBeNull()

      expect(move.mock.calls.length).toBeLessThan(30)
    } finally {
      move.mockRestore()
    }
  })

  it('adopts only a matching Worker replay without replaying the long game on the UI thread', () => {
    const timeline = repeatedKnightTimeline()
    const first = reviewedMove(timeline, 1)
    const verification = verifyRetryTimelineForWorker(timeline)
    if (!verification) throw new Error('Expected a Worker retry verification.')

    const move = vi.spyOn(Chess.prototype, 'move')
    try {
      const verifiedTimeline = adoptWorkerRetryTimelineVerification(timeline, verification)
      if (!verifiedTimeline) throw new Error('Expected the Worker verification to be adopted.')

      // All chess.js work occurred in the Worker-side verification above.
      // Adoption only compares immutable facts, freezes a new snapshot, and
      // registers its main-realm identity.
      expect(move).not.toHaveBeenCalled()
      expect(createRetryItemFromVerifiedTimeline({
        verifiedTimeline,
        move: first,
        reviewKey: '0123456789abcdef',
        now: '2026-07-22T00:00:00.000Z',
      })).not.toBeNull()
      expect(move.mock.calls.length).toBeLessThan(30)
    } finally {
      move.mockRestore()
    }
  })

  it('fails closed when a Worker replay payload no longer matches the timeline', () => {
    const timeline = createPgnTimeline('1. e4 e5 2. Nf3 Nc6 *')
    const verification = verifyRetryTimelineForWorker(timeline)
    if (!verification) throw new Error('Expected a Worker retry verification.')

    const corruptions = [
      (value: typeof verification) => { value.startFen = 'not a FEN' },
      (value: typeof verification) => { value.finalFen = timeline.positions[2]!.fen },
      (value: typeof verification) => { value.moves[1]!.preFen = timeline.positions[0]!.fen },
      (value: typeof verification) => { value.moves[1]!.san = 'Na9' },
      (value: typeof verification) => { value.moves[1]!.playedMoveUci = 'a1a8' },
      (value: typeof verification) => { value.moves[1]!.ply = 1 },
    ]

    for (const corrupt of corruptions) {
      const candidate = JSON.parse(JSON.stringify(verification)) as typeof verification
      corrupt(candidate)
      expect(adoptWorkerRetryTimelineVerification(timeline, candidate)).toBeNull()
    }

    const changedTimeline = createPgnTimeline('1. d4 d5 2. c4 e6 *')
    expect(adoptWorkerRetryTimelineVerification(changedTimeline, verification)).toBeNull()
  })

  it('uses a deterministic 1, 3, 7, 14, 30 day schedule and resets alternatives for immediate retry', () => {
    expect(RETRY_SCHEDULE_DAYS).toEqual([1, 3, 7, 14, 30])
    let retry = item()
    const starts = [
      '2026-07-22T00:00:00.000Z',
      '2026-07-23T00:00:00.000Z',
      '2026-07-26T00:00:00.000Z',
      '2026-08-02T00:00:00.000Z',
      '2026-08-16T00:00:00.000Z',
    ]
    const due = [
      '2026-07-23T00:00:00.000Z',
      '2026-07-26T00:00:00.000Z',
      '2026-08-02T00:00:00.000Z',
      '2026-08-16T00:00:00.000Z',
      '2026-09-15T00:00:00.000Z',
    ]

    starts.forEach((at, index) => {
      retry = recordRetryAttempt(retry, 'recorded-solution', at)
      expect(retry).toMatchObject({
        attemptCount: index + 1,
        correctStreak: index + 1,
        dueAt: due[index],
        status: index === 4 ? 'mastered' : 'active',
        lastAttemptAt: at,
      })
    })

    retry = recordRetryAttempt(retry, 'not-recorded', '2026-08-17T00:00:00.000Z')
    expect(retry).toMatchObject({
      status: 'active',
      attemptCount: 6,
      correctStreak: 0,
      dueAt: '2026-08-17T00:00:00.000Z',
      lastAttemptAt: '2026-08-17T00:00:00.000Z',
    })

    retry = recordRetryAttempt(retry, 'hinted', '2026-08-18T00:00:00.000Z')
    expect(retry).toMatchObject({
      status: 'active',
      attemptCount: 7,
      correctStreak: 0,
      dueAt: '2026-08-18T00:00:00.000Z',
      lastAttemptAt: '2026-08-18T00:00:00.000Z',
    })
  })
})
