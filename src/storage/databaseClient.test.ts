import { describe, expect, it, vi } from 'vitest'
import { Chess } from 'chess.js'
import { DatabaseClient, type DatabaseBootstrap, type DatabaseSnapshot } from './databaseClient'
import { DEFAULT_PREFERENCES, toStoredGameSummary, type ActiveSession, type StoredGame } from './gameStore'
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

const bootstrap: DatabaseBootstrap = {
  schemaVersion: 5,
  activeSession: snapshot.activeSession,
  preferences: snapshot.preferences,
  gameCount: snapshot.games.length,
  isEmpty: false,
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

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (reason?: unknown) => void
}

function createDeferred<T = void>(): Deferred<T> {
  let resolveDeferred: (value: T | PromiseLike<T>) => void = () => undefined
  let rejectDeferred: (reason?: unknown) => void = () => undefined
  const promise = new Promise<T>((resolve, reject) => {
    resolveDeferred = resolve
    rejectDeferred = reject
  })
  return { promise, resolve: resolveDeferred, reject: rejectDeferred }
}

async function flushQueuedWork(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function sessionWithPgn(pgn: string): ActiveSession {
  return { ...snapshot.activeSession!, pgn }
}

describe('DatabaseClient', () => {
  it('skips replay only for trusted review snapshots and rejects tampered clones before native save', async () => {
    const invoke = vi.fn(async () => undefined)
    const client = new DatabaseClient(invoke)
    const move = vi.spyOn(Chess.prototype, 'move')
    try {
      await client.saveReview(review)
      expect(move).not.toHaveBeenCalled()
      expect(invoke).toHaveBeenCalledWith('database_save_review', { review })

      invoke.mockClear()
      const cloned = JSON.parse(JSON.stringify(review)) as typeof review
      await client.saveReview(cloned)
      expect(move).toHaveBeenCalled()
      expect(invoke).toHaveBeenCalledWith('database_save_review', { review: cloned })

      invoke.mockClear()
      const tampered = JSON.parse(JSON.stringify(review)) as typeof review
      tampered.report.moves[0]!.to = 'd4'
      await expect(client.saveReview(tampered)).rejects.toThrow('Saved review')
      expect(invoke).not.toHaveBeenCalled()
    } finally {
      move.mockRestore()
    }
  })

  it('leaves a desktop review payload unparsed for the saved-review Worker', async () => {
    const payload = JSON.parse(JSON.stringify(review)) as typeof review
    const invoke = vi.fn(async (command: string) => command === 'database_load_review' ? payload : null)
    const client = new DatabaseClient(invoke)
    const move = vi.spyOn(Chess.prototype, 'move')
    const loadPgn = vi.spyOn(Chess.prototype, 'loadPgn')
    try {
      await expect(client.loadReviewForHydration(review.reviewKey)).resolves.toEqual(payload)
      expect(invoke).toHaveBeenCalledWith('database_load_review', { reviewKey: review.reviewKey })
      expect(loadPgn).not.toHaveBeenCalled()
      expect(move).not.toHaveBeenCalled()
      await expect(client.loadReviewForHydration('not-a-review-key')).rejects.toThrow('Review key is invalid.')
    } finally {
      loadPgn.mockRestore()
      move.mockRestore()
    }
  })

  it('uses task-specific commands and camelCase payloads', async () => {
    const summaries = snapshot.games.map(toStoredGameSummary)
    const invoke = vi.fn(async (command: string) => {
      if (command === 'database_snapshot') return snapshot
      if (command === 'database_bootstrap') return bootstrap
      if (command === 'database_list_games') return snapshot.games
      if (command === 'database_list_game_summaries') return summaries
      if (command === 'database_load_game') return snapshot.games[0]
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
    await expect(client.bootstrap()).resolves.toEqual(bootstrap)
    await expect(client.listGames()).resolves.toEqual(snapshot.games)
    await expect(client.listGameSummaries()).resolves.toEqual(summaries)
    await expect(client.loadGame(snapshot.games[0].id)).resolves.toEqual(snapshot.games[0])
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
      ['database_bootstrap'],
      ['database_list_games'],
      ['database_list_game_summaries'],
      ['database_load_game', { gameId: snapshot.games[0].id }],
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

  it('coalesces queued active-session snapshots to the latest payload', async () => {
    const blocker = createDeferred<void>()
    const invoke = vi.fn((command: string, args?: Record<string, unknown>) => {
      if (command === 'database_save_preferences') return blocker.promise
      return Promise.resolve({ command, args })
    })
    const client = new DatabaseClient(invoke)
    const preferences = client.savePreferences(snapshot.preferences!)
    await flushQueuedWork()

    const first = client.saveActiveSession(sessionWithPgn('first snapshot'))
    const middle = client.saveActiveSession(sessionWithPgn('middle snapshot'))
    const latest = client.saveActiveSession(sessionWithPgn('latest snapshot'))

    expect(invoke.mock.calls).toEqual([
      ['database_save_preferences', { preferences: snapshot.preferences }],
    ])

    blocker.resolve()
    await Promise.all([preferences, first, middle, latest])

    expect(invoke.mock.calls).toEqual([
      ['database_save_preferences', { preferences: snapshot.preferences }],
      ['database_save_active_session', { activeSession: sessionWithPgn('latest snapshot') }],
    ])
  })

  it('never overlaps an in-flight active-session save with its queued successor', async () => {
    const firstWrite = createDeferred<void>()
    const activeCalls: Array<Record<string, unknown> | undefined> = []
    const invoke = vi.fn((command: string, args?: Record<string, unknown>) => {
      if (command !== 'database_save_active_session') return Promise.resolve(undefined)
      activeCalls.push(args)
      return activeCalls.length === 1 ? firstWrite.promise : Promise.resolve(undefined)
    })
    const client = new DatabaseClient(invoke)
    const first = client.saveActiveSession(sessionWithPgn('in flight'))
    await flushQueuedWork()

    const middle = client.saveActiveSession(sessionWithPgn('queued middle'))
    const latest = client.saveActiveSession(sessionWithPgn('queued latest'))
    await flushQueuedWork()

    expect(activeCalls).toEqual([
      { activeSession: sessionWithPgn('in flight') },
    ])

    firstWrite.resolve()
    await Promise.all([first, middle, latest])

    expect(activeCalls).toEqual([
      { activeSession: sessionWithPgn('in flight') },
      { activeSession: sessionWithPgn('queued latest') },
    ])
  })

  it('settles every coalesced caller and continues queued writes after a native failure', async () => {
    const activeWrite = createDeferred<void>()
    const failure = new Error('SQLite is unavailable')
    const invoke = vi.fn((command: string) => {
      if (command === 'database_save_active_session') return activeWrite.promise
      return Promise.resolve(undefined)
    })
    const client = new DatabaseClient(invoke)
    const first = client.saveActiveSession(sessionWithPgn('first snapshot'))
    const latest = client.saveActiveSession(sessionWithPgn('latest snapshot'))
    const preferences = client.savePreferences(snapshot.preferences!)
    await flushQueuedWork()

    expect(invoke.mock.calls).toEqual([
      ['database_save_active_session', { activeSession: sessionWithPgn('latest snapshot') }],
    ])

    activeWrite.reject(failure)
    const results = await Promise.allSettled([first, latest])
    await expect(preferences).resolves.toBeUndefined()

    expect(results).toEqual([
      { status: 'rejected', reason: failure },
      { status: 'rejected', reason: failure },
    ])
    expect(invoke.mock.calls).toEqual([
      ['database_save_active_session', { activeSession: sessionWithPgn('latest snapshot') }],
      ['database_save_preferences', { preferences: snapshot.preferences }],
    ])
  })

  it('keeps clearActiveSession as a barrier between pending and later snapshots', async () => {
    const blocker = createDeferred<void>()
    const invoke = vi.fn((command: string) => {
      if (command === 'database_save_game') return blocker.promise
      return Promise.resolve(undefined)
    })
    const client = new DatabaseClient(invoke)
    const game = client.saveGame(snapshot.games[0])
    await flushQueuedWork()

    const beforeClear = client.saveActiveSession(sessionWithPgn('before clear'))
    const latestBeforeClear = client.saveActiveSession(sessionWithPgn('latest before clear'))
    const clear = client.clearActiveSession()
    const afterClear = client.saveActiveSession(sessionWithPgn('after clear'))

    expect(invoke.mock.calls).toEqual([
      ['database_save_game', { game: snapshot.games[0] }],
    ])

    blocker.resolve()
    await Promise.all([game, beforeClear, latestBeforeClear, clear, afterClear])

    expect(invoke.mock.calls).toEqual([
      ['database_save_game', { game: snapshot.games[0] }],
      ['database_save_active_session', { activeSession: sessionWithPgn('latest before clear') }],
      ['database_clear_active_session'],
      ['database_save_active_session', { activeSession: sessionWithPgn('after clear') }],
    ])
  })

  it('does not let an invalid session replace or invoke a pending valid snapshot', async () => {
    const blocker = createDeferred<void>()
    const invoke = vi.fn((command: string) => {
      if (command === 'database_save_preferences') return blocker.promise
      return Promise.resolve(undefined)
    })
    const client = new DatabaseClient(invoke)
    const preferences = client.savePreferences(snapshot.preferences!)
    await flushQueuedWork()
    const valid = client.saveActiveSession(sessionWithPgn('valid snapshot'))

    await expect(client.saveActiveSession({
      ...sessionWithPgn('invalid snapshot'),
      colorChoice: 'coin-flip',
    } as unknown as ActiveSession)).rejects.toThrow('Active session is invalid')

    expect(invoke.mock.calls).toEqual([
      ['database_save_preferences', { preferences: snapshot.preferences }],
    ])

    blocker.resolve()
    await Promise.all([preferences, valid])

    expect(invoke.mock.calls).toEqual([
      ['database_save_preferences', { preferences: snapshot.preferences }],
      ['database_save_active_session', { activeSession: sessionWithPgn('valid snapshot') }],
    ])
  })

  it('preserves FIFO order when ordinary writes split active-session batches', async () => {
    const blocker = createDeferred<void>()
    const secondGame: StoredGame = { ...snapshot.games[0], id: 'game-2' }
    const invoke = vi.fn((command: string) => {
      if (command === 'database_save_game') return blocker.promise
      return Promise.resolve(undefined)
    })
    const client = new DatabaseClient(invoke)
    const firstGame = client.saveGame(snapshot.games[0])
    await flushQueuedWork()
    const firstSession = client.saveActiveSession(sessionWithPgn('first session'))
    const preferences = client.savePreferences(snapshot.preferences!)
    const secondSession = client.saveActiveSession(sessionWithPgn('second session'))
    const finalGame = client.saveGame(secondGame)

    blocker.resolve()
    await Promise.all([firstGame, firstSession, preferences, secondSession, finalGame])

    expect(invoke.mock.calls).toEqual([
      ['database_save_game', { game: snapshot.games[0] }],
      ['database_save_active_session', { activeSession: sessionWithPgn('first session') }],
      ['database_save_preferences', { preferences: snapshot.preferences }],
      ['database_save_active_session', { activeSession: sessionWithPgn('second session') }],
      ['database_save_game', { game: secondGame }],
    ])
  })

  it('keeps a lazy game list behind earlier writes and ahead of a later clear', async () => {
    const pendingSave = createDeferred<void>()
    const invoke = vi.fn((command: string) => {
      if (command === 'database_save_game') return pendingSave.promise
      if (command === 'database_list_games') return Promise.resolve(snapshot.games)
      return Promise.resolve(undefined)
    })
    const client = new DatabaseClient(invoke)

    const save = client.saveGame(snapshot.games[0])
    await flushQueuedWork()
    const list = client.listGames()
    const clear = client.clearGames()

    expect(invoke.mock.calls).toEqual([
      ['database_save_game', { game: snapshot.games[0] }],
    ])

    pendingSave.resolve()
    await Promise.all([save, list, clear])

    expect(invoke.mock.calls).toEqual([
      ['database_save_game', { game: snapshot.games[0] }],
      ['database_list_games'],
      ['database_clear_games'],
    ])
  })

  it('rejects malformed native snapshots before they reach React state', async () => {
    const invalid = new DatabaseClient(vi.fn(async () => ({ ...snapshot, schemaVersion: 0 })))
    await expect(invalid.snapshot()).rejects.toThrow('invalid database snapshot')

    const oversized = new DatabaseClient(vi.fn(async () => ({ ...snapshot, games: new Array(501).fill(snapshot.games[0]) })))
    await expect(oversized.snapshot()).rejects.toThrow('invalid database snapshot')
  })

  it('rejects malformed desktop bootstrap and lazy game-list payloads before they reach React state', async () => {
    const malformedBootstrap = new DatabaseClient(vi.fn(async () => ({ ...bootstrap, gameCount: 501 })))
    await expect(malformedBootstrap.bootstrap()).rejects.toThrow('invalid database bootstrap')

    const malformedGames = new DatabaseClient(vi.fn(async () => [{ ...snapshot.games[0], id: '' }]))
    await expect(malformedGames.listGames()).rejects.toThrow('Saved game is invalid')

    const duplicateGames = new DatabaseClient(vi.fn(async () => [snapshot.games[0], snapshot.games[0]]))
    await expect(duplicateGames.listGames()).rejects.toThrow('duplicate saved games')

    const malformedSummaries = new DatabaseClient(vi.fn(async () => [{ ...toStoredGameSummary(snapshot.games[0]), id: '' }]))
    await expect(malformedSummaries.listGameSummaries()).rejects.toThrow('invalid game library')

    const missing = new DatabaseClient(vi.fn(async () => null))
    await expect(missing.loadGame(snapshot.games[0].id)).resolves.toBeNull()
    await expect(missing.loadGame('')).rejects.toThrow('Saved game ID is invalid')
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

  it('preserves named opponents and rejects unknown profile payloads from native storage', async () => {
    const withProfile = {
      ...snapshot,
      activeSession: { ...snapshot.activeSession!, botProfileId: 'rowan-pike' as const },
      games: [{ ...snapshot.games[0], botProfileId: 'rowan-pike' as const }],
    }
    const valid = new DatabaseClient(vi.fn(async () => withProfile))
    await expect(valid.snapshot()).resolves.toEqual(withProfile)

    const malformed = new DatabaseClient(vi.fn(async () => ({
      ...snapshot,
      games: [{ ...snapshot.games[0], botProfileId: 'unknown' }],
    })))
    await expect(malformed.snapshot()).rejects.toThrow('invalid database snapshot')
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
