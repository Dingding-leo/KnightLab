import { describe, expect, it, vi } from 'vitest'
import { DatabaseClient, type DatabaseSnapshot } from './databaseClient'
import { DEFAULT_PREFERENCES, type ActiveSession, type StoredGame } from './gameStore'
import { createPersistedReview } from '../review/reviewPersistence'
import { createPgnTimeline } from '../analysis/analysisModel'
import type { GameReview } from '../review/gameReviewRunner'
import type { RetryItem } from '../review/retry'
import { SEED_TACTICS } from '../tactics/seedPuzzles'
import { createTacticsState, recordTacticsTerminalAttempt } from '../tactics/tacticsPersistence'

const snapshot: DatabaseSnapshot = {
  schemaVersion: 5,
  activeSession: {
    pgn: '',
    startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    mode: 'bot',
    botLevel: 'balanced',
    orientation: 'white',
  },
  preferences: DEFAULT_PREFERENCES,
  games: [{
    id: 'game-1',
    playedAt: '2026-07-22T00:00:00.000Z',
    mode: 'bot',
    result: '1-0',
    pgn: '1. e4 e5 1-0',
    finalFen: 'fen',
    moveCount: 2,
  }],
  recoveryBackupPath: null,
}

const review = createPersistedReview(createPgnTimeline('1. e4'), {
  createdAt: '2026-07-22T00:00:00.000Z', engineName: 'Fakefish', enginePath: '/fake',
  settings: { moveTimeMs: 100, depth: 12, nodes: null, multiPv: 2, threads: 1, hashMb: 16 }, totalElapsedMs: 1,
  moves: [{
    ply: 1, moveNumber: 1, color: 'w', san: 'e4', from: 'e2', to: 'e4', classification: 'best', accuracy: 100,
    centipawnLoss: 0, expectedLoss: 0, bestMoveUci: 'e2e4', bestMoveSan: 'e4', isBestMove: true,
    phase: 'opening', bestScore: { kind: 'cp', value: 20, bound: null }, playedScore: { kind: 'cp', value: 20, bound: null },
    bestLineSan: ['e4'], depth: 16, confidence: 'normal', feedback: 'e4 matches the first choice.',
  }],
  summary: {
    accuracy: 0, whiteAccuracy: null, blackAccuracy: null, averageCentipawnLoss: 0, bestMoveRate: 0,
    classifications: { brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, book: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0, forced: 0 },
    phaseAccuracy: { opening: null, middlegame: null, endgame: null }, turningPoints: [],
  },
} satisfies GameReview)

const retry: RetryItem = {
  schemaVersion: 1,
  retryKey: '0123456789abcdef:1',
  reviewKey: '0123456789abcdef',
  sourcePly: 1,
  preFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  sideToMove: 'w',
  playedMoveUci: 'e2e4',
  playedMoveSan: 'e4',
  solutionUci: 'd2d4',
  solutionSan: 'd4',
  solutionLineSan: ['d4', 'd5'],
  classification: 'mistake',
  focus: 'Compare forcing moves before committing.',
  status: 'active',
  attemptCount: 0,
  correctStreak: 0,
  dueAt: '2026-07-22T00:00:00.000Z',
  lastAttemptAt: null,
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-07-22T00:00:00.000Z',
}

const tacticsTransition = recordTacticsTerminalAttempt(createTacticsState(), SEED_TACTICS[0]!, {
  attemptId: 'attempt-001',
  outcome: 'solved',
  elapsedMs: 900,
  moveCount: 1,
  hintCount: 0,
  attemptedAt: '2026-07-22T00:00:00.000Z',
})

describe('DatabaseClient', () => {
  it('uses task-specific commands and camelCase payloads', async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === 'database_snapshot') return snapshot
      if (command === 'database_load_review') return review
      if (command === 'database_load_retry_item') return retry
      if (command === 'database_list_retry_items') return [retry]
      if (command === 'database_list_tactics_state') return tacticsTransition.state
      if (command === 'database_merge_tactics_state') return tacticsTransition.state
      if (command === 'database_record_tactics_attempt') return tacticsTransition.state
      return true
    })
    const client = new DatabaseClient(invoke)

    await expect(client.snapshot()).resolves.toEqual(snapshot)
    await client.importLegacy({ activeSession: null, preferences: snapshot.preferences, games: snapshot.games })
    await client.saveActiveSession(snapshot.activeSession!)
    await client.savePreferences(snapshot.preferences!)
    await client.saveGame(snapshot.games[0])
    await client.saveReview(review)
    await expect(client.loadReview(review.reviewKey)).resolves.toEqual(review)
    await client.saveRetryItem(retry)
    await expect(client.loadRetryItem(retry.retryKey)).resolves.toEqual(retry)
    await expect(client.listRetryItems()).resolves.toEqual([retry])
    await expect(client.deleteRetryItem(retry.retryKey)).resolves.toBe(true)
    await expect(client.listTacticsState()).resolves.toEqual(tacticsTransition.state)
    await expect(client.mergeTacticsState(tacticsTransition.state)).resolves.toEqual(tacticsTransition.state)
    await expect(client.recordTacticsAttempt(tacticsTransition.progress, tacticsTransition.attempt)).resolves.toEqual(tacticsTransition.state)
    await client.clearActiveSession()
    await client.clearGames()

    expect(invoke.mock.calls).toEqual([
      ['database_snapshot'],
      ['database_import_legacy', { legacy: { activeSession: null, preferences: snapshot.preferences, games: snapshot.games } }],
      ['database_save_active_session', { activeSession: snapshot.activeSession }],
      ['database_save_preferences', { preferences: snapshot.preferences }],
      ['database_save_game', { game: snapshot.games[0] }],
      ['database_save_review', { review }],
      ['database_load_review', { reviewKey: review.reviewKey }],
      ['database_save_retry_item', { retryItem: retry }],
      ['database_load_retry_item', { retryKey: retry.retryKey }],
      ['database_list_retry_items'],
      ['database_delete_retry_item', { retryKey: retry.retryKey }],
      ['database_list_tactics_state'],
      ['database_merge_tactics_state', { tactics: tacticsTransition.state }],
      ['database_record_tactics_attempt', { progress: tacticsTransition.progress, attempt: tacticsTransition.attempt }],
      ['database_clear_active_session'],
      ['database_clear_games'],
    ])
  })

  it('rejects malformed native snapshots before they reach React state', async () => {
    const invalid = new DatabaseClient(vi.fn(async () => ({ ...snapshot, schemaVersion: 0 })))
    await expect(invalid.snapshot()).rejects.toThrow('invalid database snapshot')

    const oversized = new DatabaseClient(vi.fn(async () => ({ ...snapshot, games: new Array(501).fill(snapshot.games[0]) })))
    await expect(oversized.snapshot()).rejects.toThrow('invalid database snapshot')
  })

  it('preserves valid player-side data and rejects malformed values from native storage', async () => {
    const withResolvedSides = {
      ...snapshot,
      activeSession: {
        ...snapshot.activeSession!,
        humanColor: 'b' as const,
        colorChoice: 'random' as const,
      },
      games: [{
        ...snapshot.games[0],
        humanColor: 'w' as const,
        colorChoice: 'white' as const,
      }],
    }
    const valid = new DatabaseClient(vi.fn(async () => withResolvedSides))
    await expect(valid.snapshot()).resolves.toEqual(withResolvedSides)

    const malformedGame = new DatabaseClient(vi.fn(async () => ({
      ...snapshot,
      games: [{ ...snapshot.games[0], humanColor: 'white' }],
    })))
    await expect(malformedGame.snapshot()).rejects.toThrow('invalid database snapshot')

    const malformedSession = new DatabaseClient(vi.fn(async () => ({
      ...snapshot,
      activeSession: { ...snapshot.activeSession!, colorChoice: 'coin-flip' },
    })))
    await expect(malformedSession.snapshot()).rejects.toThrow('invalid database snapshot')
  })

  it('rejects oversized writes before invoking native code', async () => {
    const invoke = vi.fn(async () => undefined)
    const client = new DatabaseClient(invoke)
    await expect(client.saveActiveSession({
      ...snapshot.activeSession!,
      pgn: 'x'.repeat(1_100_000),
    })).rejects.toThrow('too large')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('rejects malformed player-side writes before invoking native code', async () => {
    const invoke = vi.fn(async () => undefined)
    const client = new DatabaseClient(invoke)

    await expect(client.saveGame({
      ...snapshot.games[0],
      humanColor: 'white',
    } as unknown as StoredGame)).rejects.toThrow('Saved game is invalid')
    await expect(client.saveActiveSession({
      ...snapshot.activeSession!,
      colorChoice: 'coin-flip',
    } as unknown as ActiveSession)).rejects.toThrow('Active session is invalid')

    expect(invoke).not.toHaveBeenCalled()
  })

  it('rejects malformed retry payloads before native storage or React state', async () => {
    const write = vi.fn(async () => undefined)
    const client = new DatabaseClient(write)
    await expect(client.saveRetryItem({ ...retry, solutionSan: 'e4' })).rejects.toThrow('Retry move facts')
    expect(write).not.toHaveBeenCalled()

    const invalidNative = new DatabaseClient(vi.fn(async () => ({ ...retry, sideToMove: 'x' })))
    await expect(invalidNative.loadRetryItem(retry.retryKey)).rejects.toThrow('Retry item')
  })

  it('rejects malformed tactics payloads before crossing the native boundary', async () => {
    const invoke = vi.fn(async () => undefined)
    const client = new DatabaseClient(invoke)
    await expect(client.recordTacticsAttempt(
      { ...tacticsTransition.progress, solveCount: 99 },
      tacticsTransition.attempt,
    )).rejects.toThrow('Tactics progress')
    expect(invoke).not.toHaveBeenCalled()

    const invalidNative = new DatabaseClient(vi.fn(async () => ({ progress: [], attempts: [{ ...tacticsTransition.attempt, hintCount: 2, outcome: 'solved' }] })))
    await expect(invalidNative.listTacticsState()).rejects.toThrow('Tactics attempt')
  })
})
