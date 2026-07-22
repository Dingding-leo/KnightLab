import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { createPgnTimeline } from '../analysis/analysisModel'
import type { GameReview } from './gameReviewRunner'
import {
  assertPersistedReview,
  createPersistedReview,
  createReviewKey,
  createReviewKeyFromMoves,
  loadBrowserReview,
  saveBrowserReview,
} from './reviewPersistence'

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string): string | null { return this.values.get(key) ?? null }
  setItem(key: string, value: string): void { this.values.set(key, value) }
  removeItem(key: string): void { this.values.delete(key) }
}

function report(): GameReview {
  return {
    createdAt: '2026-07-22T00:00:00.000Z',
    engineName: 'Fakefish',
    enginePath: '/fake',
    settings: { moveTimeMs: 100, depth: 12, nodes: null, multiPv: 2, threads: 1, hashMb: 16 },
    totalElapsedMs: 20,
    moves: [{
      ply: 1, moveNumber: 1, color: 'w', san: 'e4', from: 'e2', to: 'e4', classification: 'best', accuracy: 100,
      centipawnLoss: 0, expectedLoss: 0, bestMoveUci: 'e2e4', bestMoveSan: 'e4', isBestMove: true,
      phase: 'opening', bestScore: { kind: 'cp', value: 20, bound: null }, playedScore: { kind: 'cp', value: 20, bound: null },
      bestLineSan: ['e4', 'e5'], depth: 16, confidence: 'normal', feedback: 'e4 matches the first choice.',
    }],
    summary: {
      accuracy: 100, whiteAccuracy: 100, blackAccuracy: null, averageCentipawnLoss: 0, bestMoveRate: 100,
      classifications: { brilliant: 0, great: 0, best: 1, excellent: 0, good: 0, book: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0, forced: 0 },
      phaseAccuracy: { opening: 100, middlegame: null, endgame: null }, turningPoints: [],
    },
  }
}

describe('persisted review identity and browser storage', () => {
  it('uses the same stable key for equivalent PGNs and a distinct key for a changed main line', () => {
    const first = createPgnTimeline('[Event "A"]\n\n1. e4 e5 2. Nf3 Nc6 *')
    const same = createPgnTimeline('[Event "Renamed"]\n[Site "Offline"]\n\n1. e4 e5 2. Nf3 Nc6 *')
    const changed = createPgnTimeline('1. e4 c5 2. Nf3 *')
    expect(createReviewKey(first)).toBe(createReviewKey(same))
    expect(createReviewKey(first)).not.toBe(createReviewKey(changed))
  })

  it('creates the same canonical key directly from minimal move facts, including promotion', () => {
    const timeline = createPgnTimeline('[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n\n1. a8=Q+ *')
    const minimalMoves = timeline.moves.map(({ color, from, to, promotion }) => ({ color, from, to, promotion }))

    expect(createReviewKeyFromMoves(timeline.startFen, minimalMoves)).toBe(createReviewKey(timeline))
    expect(createReviewKeyFromMoves(timeline.startFen, minimalMoves)).not.toBe(
      createReviewKeyFromMoves(timeline.startFen, minimalMoves.map((move) => ({ ...move, promotion: undefined }))),
    )
  })

  it('accepts the verbose chess.js history used when a finished game enters the library', () => {
    const startFen = '7k/P7/8/8/8/8/8/7K w - - 0 1'
    const game = new Chess(startFen)
    game.move({ from: 'a7', to: 'a8', promotion: 'q' })
    const timeline = createPgnTimeline(game.pgn())

    expect(createReviewKeyFromMoves(startFen, game.history({ verbose: true }))).toBe(createReviewKey(timeline))
  })

  it('round-trips a versioned report through bounded browser storage and ignores malformed data', () => {
    const storage = new MemoryStorage()
    const timeline = createPgnTimeline('1. e4')
    const record = createPersistedReview(timeline, report())
    saveBrowserReview(record, storage)
    expect(loadBrowserReview(record.reviewKey, storage)).toEqual(record)
    storage.setItem('knightclub.review-reports.v1', JSON.stringify([{ reviewKey: record.reviewKey }]))
    expect(loadBrowserReview(record.reviewKey, storage)).toBeNull()
  })

  it('rejects incomplete, mismatched, or coach-unsafe report moves', () => {
    const record = createPersistedReview(createPgnTimeline('1. e4'), report())

    const incomplete = JSON.parse(JSON.stringify(record)) as Record<string, unknown>
    const incompleteReport = incomplete.report as { moves: unknown[] }
    incompleteReport.moves = []
    expect(() => assertPersistedReview(incomplete)).toThrow('Saved review')

    const mismatched = JSON.parse(JSON.stringify(record)) as Record<string, unknown>
    const mismatchedReport = mismatched.report as { moves: Array<Record<string, unknown>> }
    mismatchedReport.moves[0].to = 'd4'
    expect(() => assertPersistedReview(mismatched)).toThrow('Saved review')

    const missingScore = JSON.parse(JSON.stringify(record)) as Record<string, unknown>
    const missingScoreReport = missingScore.report as { moves: Array<Record<string, unknown>> }
    delete missingScoreReport.moves[0].bestScore
    expect(() => assertPersistedReview(missingScore)).toThrow('Saved review')
  })
})
