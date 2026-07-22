import { describe, expect, it } from 'vitest'
import { SEED_TACTICS } from './seedPuzzles'
import {
  MAX_TACTICS_ATTEMPTS,
  MAX_TACTICS_PROGRESS,
  MAX_TACTICS_STATE_BYTES,
  TACTICS_STORAGE_KEY,
  createTacticsState,
  isTacticsAttempt,
  isTacticsProgress,
  isTacticsState,
  loadBrowserTacticsState,
  mergeBrowserTacticsState,
  mergeTacticsState,
  recordTacticsTerminalAttempt,
  saveBrowserTacticsState,
  tacticsStateToTacticProgress,
  type TacticsState,
  type TacticsStorage,
} from './tacticsPersistence'

const [, whiteFork, blackFork] = SEED_TACTICS

class MemoryStorage implements TacticsStorage {
  readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

function solved(
  state: TacticsState,
  attemptId: string,
  attemptedAt: string,
  elapsedMs = 1_200,
) {
  return recordTacticsTerminalAttempt(state, whiteFork, {
    attemptId,
    attemptedAt,
    outcome: 'solved',
    elapsedMs,
    moveCount: 2,
    hintCount: 0,
  })
}

describe('native-compatible tactics persistence', () => {
  it('creates one immutable terminal attempt and its exact first successor together', () => {
    const transition = solved(createTacticsState(), 'attempt-001', '2026-07-22T00:00:00.000Z')

    expect(transition.attempt).toEqual({
      schemaVersion: 1,
      attemptId: 'attempt-001',
      seedId: whiteFork.id,
      seedRevision: 1,
      attemptedAt: '2026-07-22T00:00:00.000Z',
      outcome: 'solved',
      elapsedMs: 1_200,
      moveCount: 2,
      hintCount: 0,
    })
    expect(transition.progress).toEqual({
      schemaVersion: 1,
      seedId: whiteFork.id,
      seedRevision: 1,
      dueAt: '2026-07-23T00:00:00.000Z',
      status: 'active',
      attemptCount: 1,
      solveCount: 1,
      correctStreak: 1,
      lastAttemptAt: '2026-07-22T00:00:00.000Z',
      lastOutcome: 'solved',
      bestSolveMs: 1_200,
      createdAt: '2026-07-22T00:00:00.000Z',
      updatedAt: '2026-07-22T00:00:00.000Z',
    })
    expect(transition.state).toEqual({ progress: [transition.progress], attempts: [transition.attempt] })
    expect(isTacticsAttempt(transition.attempt)).toBe(true)
    expect(isTacticsProgress(transition.progress)).toBe(true)
    expect(isTacticsState(transition.state)).toBe(true)
  })

  it('uses the five-step cadence, preserves a best solve, and resets due state for non-solves', () => {
    const dates = [
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
    let state = createTacticsState()
    dates.forEach((at, index) => {
      const transition = solved(state, `attempt-solve-${index + 1}`, at, 1_500 - index * 100)
      state = transition.state
      expect(transition.progress).toMatchObject({
        attemptCount: index + 1,
        solveCount: index + 1,
        correctStreak: index + 1,
        dueAt: due[index],
        status: index === dates.length - 1 ? 'mastered' : 'active',
      })
    })
    expect(state.progress[0]?.bestSolveMs).toBe(1_100)

    const failed = recordTacticsTerminalAttempt(state, whiteFork, {
      attemptId: 'attempt-failed',
      attemptedAt: '2026-10-01T00:00:00.000Z',
      outcome: 'failed',
      elapsedMs: 700,
      moveCount: 1,
      hintCount: 0,
    })
    expect(failed.progress).toMatchObject({
      attemptCount: 6,
      solveCount: 5,
      correctStreak: 0,
      status: 'active',
      dueAt: '2026-10-01T00:00:00.000Z',
      bestSolveMs: 1_100,
      lastOutcome: 'failed',
    })

    const hinted = recordTacticsTerminalAttempt(failed.state, whiteFork, {
      attemptId: 'attempt-hinted',
      attemptedAt: '2026-10-02T00:00:00.000Z',
      outcome: 'hinted',
      elapsedMs: 900,
      moveCount: 1,
      hintCount: 1,
    })
    expect(hinted.progress).toMatchObject({
      attemptCount: 7,
      solveCount: 5,
      correctStreak: 0,
      dueAt: '2026-10-02T00:00:00.000Z',
      lastOutcome: 'hinted',
      bestSolveMs: 1_100,
    })
  })

  it('fails closed for invalid assistance, time travel, and conflicting immutable IDs without mutating input', () => {
    const first = solved(createTacticsState(), 'attempt-immutable', '2026-07-22T00:00:00.000Z')
    const original = JSON.stringify(first.state)

    expect(() => recordTacticsTerminalAttempt(first.state, whiteFork, {
      attemptId: 'attempt-assisted-solve',
      attemptedAt: '2026-07-23T00:00:00.000Z',
      outcome: 'solved',
      elapsedMs: 400,
      moveCount: 2,
      hintCount: 1,
    })).toThrow('invalid')
    expect(() => recordTacticsTerminalAttempt(first.state, whiteFork, {
      attemptId: 'attempt-time-travel',
      attemptedAt: '2026-07-21T00:00:00.000Z',
      outcome: 'failed',
      elapsedMs: 400,
      moveCount: 1,
      hintCount: 0,
    })).toThrow('cannot predate')
    expect(() => recordTacticsTerminalAttempt(first.state, whiteFork, {
      attemptId: 'attempt-immutable',
      attemptedAt: '2026-07-22T00:00:00.000Z',
      outcome: 'solved',
      elapsedMs: 401,
      moveCount: 2,
      hintCount: 0,
    })).toThrow('conflicts')
    expect(JSON.stringify(first.state)).toBe(original)
  })

  it('is idempotent for an already-created identical terminal attempt', () => {
    const first = solved(createTacticsState(), 'attempt-idempotent', '2026-07-22T00:00:00.000Z')
    const replay = solved(first.state, 'attempt-idempotent', '2026-07-22T00:00:00.000Z')

    expect(replay.state).toBe(first.state)
    expect(replay.attempt).toEqual(first.attempt)
    expect(replay.progress).toEqual(first.progress)
  })

  it('merges independently written snapshots deterministically and never rewrites immutable history', () => {
    const first = solved(createTacticsState(), 'attempt-merge-001', '2026-07-22T00:00:00.000Z')
    const second = recordTacticsTerminalAttempt(first.state, whiteFork, {
      attemptId: 'attempt-merge-002',
      attemptedAt: '2026-07-23T00:00:00.000Z',
      outcome: 'failed',
      elapsedMs: 600,
      moveCount: 1,
      hintCount: 0,
    })
    const mergedOne = mergeTacticsState(first.state, second.state)
    const mergedTwo = mergeTacticsState(second.state, first.state)

    expect(mergedOne).toEqual(mergedTwo)
    expect(mergedOne.progress).toEqual([second.progress])
    expect(mergedOne.attempts.map((attempt) => attempt.attemptId)).toEqual([
      'attempt-merge-002',
      'attempt-merge-001',
    ])
    expect(() => mergeTacticsState(first.state, {
      progress: [],
      attempts: [{ ...first.attempt, elapsedMs: 42 }],
    })).toThrow('conflicts')
  })

  it('trims envelope collections to their native bounds in deterministic order', () => {
    const start = createTacticsState()
    let state = start
    for (let index = 0; index < MAX_TACTICS_ATTEMPTS + 2; index += 1) {
      const puzzle = index % 2 === 0 ? whiteFork : blackFork
      const current = recordTacticsTerminalAttempt(state, puzzle, {
        attemptId: `attempt-bound-${index.toString().padStart(3, '0')}`,
        attemptedAt: new Date(Date.UTC(2026, 6, 1, 0, index)).toISOString(),
        outcome: 'failed',
        elapsedMs: 1,
        moveCount: 1,
        hintCount: 0,
      })
      state = current.state
    }
    // The attempt ceiling is exercised through state creation; progress stays
    // one row per seed. The envelope remains independently valid and bounded.
    expect(state.attempts).toHaveLength(MAX_TACTICS_ATTEMPTS)
    expect(state.progress.length).toBeLessThanOrEqual(MAX_TACTICS_PROGRESS)
    expect(isTacticsState(state)).toBe(true)
  })

  it('uses one bounded browser mirror key and projects only matching seed revisions for the existing UI model', () => {
    const storage = new MemoryStorage()
    const first = solved(createTacticsState(), 'attempt-browser', '2026-07-22T00:00:00.000Z')
    saveBrowserTacticsState(first.state, storage)

    expect([...storage.values.keys()]).toEqual([TACTICS_STORAGE_KEY])
    expect(loadBrowserTacticsState(storage)).toEqual(first.state)

    const merged = mergeBrowserTacticsState(recordTacticsTerminalAttempt(createTacticsState(), blackFork, {
      attemptId: 'attempt-browser-black',
      attemptedAt: '2026-07-22T00:00:00.000Z',
      outcome: 'revealed',
      elapsedMs: 0,
      moveCount: 0,
      hintCount: 0,
    }).state, storage)
    expect(merged.progress).toHaveLength(2)

    const adapted = tacticsStateToTacticProgress(merged, SEED_TACTICS)
    expect(adapted.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ puzzleId: whiteFork.id, attemptCount: 1, correctStreak: 1 }),
      expect.objectContaining({ puzzleId: blackFork.id, attemptCount: 1, correctStreak: 0 }),
    ]))
    const revisedWhite = { ...whiteFork, seedRevision: 2 }
    expect(tacticsStateToTacticProgress(merged, [revisedWhite]).records).toEqual([])

    storage.setItem(TACTICS_STORAGE_KEY, 'not JSON')
    expect(loadBrowserTacticsState(storage)).toEqual(createTacticsState())
    storage.setItem(TACTICS_STORAGE_KEY, 'x'.repeat(MAX_TACTICS_STATE_BYTES + 1))
    expect(loadBrowserTacticsState(storage)).toEqual(createTacticsState())
  })
})
