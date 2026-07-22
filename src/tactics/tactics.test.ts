import { describe, expect, it } from 'vitest'
import { SEED_TACTICS } from './seedPuzzles'
import {
  MAX_TACTIC_PROGRESS_RECORDS,
  TACTIC_SCHEDULE_DAYS,
  attemptTacticLineMove,
  createTacticLine,
  createTacticProgress,
  dueTactics,
  isTacticProgress,
  isTacticPuzzle,
  recordTacticAttempt,
  tacticLinePlayerMoveCount,
  tacticLinePosition,
  tacticProgressRecord,
  type TacticProgress,
  type TacticPuzzle,
} from './tactics'

const [foolsMate, whiteFork, blackFork, queenNet, protectedQueenMate] = SEED_TACTICS

function puzzleWith(overrides: Partial<TacticPuzzle>): TacticPuzzle {
  return { ...foolsMate, ...overrides } as TacticPuzzle
}

describe('authored tactic seeds', () => {
  it('keeps five original, locally replayable starter puzzles', () => {
    expect(SEED_TACTICS).toHaveLength(5)
    expect(new Set(SEED_TACTICS.map((puzzle) => puzzle.id)).size).toBe(5)
    expect(SEED_TACTICS.map((puzzle) => puzzle.source.kind)).toEqual([
      'knightclub-original',
      'knightclub-original',
      'knightclub-original',
      'knightclub-original',
      'knightclub-original',
    ])
    expect(SEED_TACTICS.slice(0, 3).map((puzzle) => puzzle.id)).toEqual([
      'seed-v1:fools-mate',
      'seed-v1:knight-fork',
      'seed-v1:black-knight-fork',
    ])
    expect(SEED_TACTICS.map((puzzle) => puzzle.seedRevision)).toEqual([1, 1, 1, 1, 1])
    SEED_TACTICS.forEach((puzzle) => expect(isTacticPuzzle(puzzle)).toBe(true))
  })

  it('rejects a side mismatch, tampered SAN/UCI, and a terminal starting position', () => {
    expect(isTacticPuzzle(puzzleWith({ sideToMove: 'w' }))).toBe(false)
    expect(isTacticPuzzle(puzzleWith({ solutionSan: ['Qh4+'] }))).toBe(false)
    expect(isTacticPuzzle(puzzleWith({ solutionUci: ['d8h9'] }))).toBe(false)
    expect(isTacticPuzzle(puzzleWith({
      fen: '7k/8/8/8/8/8/8/K7 w - - 0 1',
      sideToMove: 'w',
      solutionUci: ['a1a2'],
      solutionSan: ['Ka2'],
      engineProof: { ...foolsMate.engineProof, bestMove: 'a1a2' },
    }))).toBe(false)
  })

  it('reconstructs canonical colours, SAN, and move numbers before play', () => {
    const line = createTacticLine(whiteFork)
    if (!line) throw new Error('Expected a valid white fork line.')

    expect(line.playerColor).toBe('w')
    expect(line.moves.map((move) => ({ color: move.color, moveNumber: move.moveNumber, san: move.san, uci: move.uci }))).toEqual([
      { color: 'w', moveNumber: 1, san: 'Nd6+', uci: 'b5d6' },
      { color: 'b', moveNumber: 1, san: 'Kd7', uci: 'e8d7' },
      { color: 'w', moveNumber: 2, san: 'Nxc8', uci: 'd6c8' },
    ])
    expect(tacticLinePlayerMoveCount(line)).toBe(2)
    expect(tacticLinePosition(line, 4)).toBeNull()
  })
})

describe('tactic line session', () => {
  it('auto-plays the recorded reply and completes only after the full white fork line', () => {
    const line = createTacticLine(whiteFork)
    if (!line) throw new Error('Expected a valid tactic line.')

    const first = attemptTacticLineMove(line, 0, { from: 'b5', to: 'd6' })
    expect(first).toMatchObject({
      outcome: 'advanced',
      played: { san: 'Nd6+' },
      autoReply: { san: 'Kd7' },
      position: { completedPlies: 2, complete: false, next: { san: 'Nxc8' } },
    })
    if (first.outcome !== 'advanced') throw new Error('Expected a valid advance.')

    const last = attemptTacticLineMove(line, first.position.completedPlies, { from: 'd6', to: 'c8' })
    expect(last).toMatchObject({
      outcome: 'advanced',
      autoReply: null,
      position: { completedPlies: 3, complete: true, next: null, lastMove: { san: 'Nxc8' } },
    })
  })

  it('supports a black-to-move multi-ply line with its own automatic reply', () => {
    const line = createTacticLine(blackFork)
    if (!line) throw new Error('Expected a valid black tactic line.')

    const first = attemptTacticLineMove(line, 0, { from: 'f4', to: 'd3' })
    expect(first).toMatchObject({
      outcome: 'advanced',
      played: { san: 'Nd3+' },
      autoReply: { san: 'Ke2' },
      position: { completedPlies: 2, next: { san: 'Nxc1+' } },
    })
  })

  it('keeps legal alternatives narrow and does not advance the puzzle', () => {
    const line = createTacticLine(foolsMate)
    if (!line) throw new Error('Expected a mate line.')

    expect(attemptTacticLineMove(line, 0, { from: 'e5', to: 'e4' })).toMatchObject({
      outcome: 'not-recorded',
      expected: { san: 'Qh4#' },
      position: { completedPlies: 0, fen: foolsMate.fen },
    })
    expect(attemptTacticLineMove(line, 0, { from: 'a8', to: 'a1' })).toMatchObject({ outcome: 'illegal' })
  })

  it('requires the exact promotion piece when a valid line contains one', () => {
    const promotion = puzzleWith({
      id: 'seed-v1:promotion-check',
      title: 'Promotion Check',
      fen: '7k/P7/8/8/8/8/8/7K w - - 0 1',
      sideToMove: 'w',
      themes: ['promotion'],
      solutionUci: ['a7a8q'],
      solutionSan: ['a8=Q+'],
      engineProof: { ...foolsMate.engineProof, bestMove: 'a7a8q', mateIn: null, scoreGapCp: 1 },
    })
    const line = createTacticLine(promotion)
    if (!line) throw new Error('Expected a promotion tactic line.')

    expect(attemptTacticLineMove(line, 0, { from: 'a7', to: 'a8', promotion: 'n' })).toMatchObject({ outcome: 'not-recorded' })
    expect(attemptTacticLineMove(line, 0, { from: 'a7', to: 'a8', promotion: 'q' })).toMatchObject({
      outcome: 'advanced',
      position: { complete: true },
    })
  })

  it('allows a terminal final move but never a terminal starting position', () => {
    const mate = createTacticLine(queenNet)
    if (!mate) throw new Error('Expected mate-in-one line.')
    expect(attemptTacticLineMove(mate, 0, { from: 'g6', to: 'g7' })).toMatchObject({
      outcome: 'advanced',
      position: { complete: true, next: null },
    })
    expect(createTacticLine(protectedQueenMate)).not.toBeNull()
  })
})

describe('tactic progress scheduling', () => {
  it('starts all seeds due, advances only solved full lines, and resets failed attempts', () => {
    let progress = createTacticProgress()
    expect(dueTactics(SEED_TACTICS, progress, '2026-07-22T00:00:00.000Z').map((puzzle) => puzzle.id)).toEqual(SEED_TACTICS.map((puzzle) => puzzle.id))

    progress = recordTacticAttempt(progress, whiteFork, 'solved', '2026-07-22T00:00:00.000Z')
    expect(tacticProgressRecord(progress, whiteFork.id)).toMatchObject({
      attemptCount: 1,
      correctStreak: 1,
      status: 'active',
      dueAt: '2026-07-23T00:00:00.000Z',
    })
    expect(dueTactics(SEED_TACTICS, progress, '2026-07-22T00:00:00.000Z').map((puzzle) => puzzle.id)).not.toContain(whiteFork.id)

    progress = recordTacticAttempt(progress, whiteFork, 'failed', '2026-07-23T00:00:00.000Z')
    expect(tacticProgressRecord(progress, whiteFork.id)).toMatchObject({
      attemptCount: 2,
      correctStreak: 0,
      status: 'active',
      dueAt: '2026-07-23T00:00:00.000Z',
    })
    expect(dueTactics(SEED_TACTICS, progress, '2026-07-23T00:00:00.000Z').map((puzzle) => puzzle.id)).toContain(whiteFork.id)
  })

  it('uses the fixed local schedule, marks five unassisted solves mastered, and can reactivate it', () => {
    expect(TACTIC_SCHEDULE_DAYS).toEqual([1, 3, 7, 14, 30])
    const dates = [
      '2026-07-22T00:00:00.000Z',
      '2026-07-23T00:00:00.000Z',
      '2026-07-26T00:00:00.000Z',
      '2026-08-02T00:00:00.000Z',
      '2026-08-16T00:00:00.000Z',
    ]
    let progress = createTacticProgress()
    dates.forEach((at, index) => {
      progress = recordTacticAttempt(progress, blackFork, 'solved', at)
      expect(tacticProgressRecord(progress, blackFork.id)).toMatchObject({
        attemptCount: index + 1,
        correctStreak: index + 1,
        status: index === dates.length - 1 ? 'mastered' : 'active',
      })
    })
    expect(dueTactics(SEED_TACTICS, progress, '2026-10-01T00:00:00.000Z').map((puzzle) => puzzle.id)).not.toContain(blackFork.id)

    progress = recordTacticAttempt(progress, blackFork, 'assisted', '2026-10-01T00:00:00.000Z')
    expect(tacticProgressRecord(progress, blackFork.id)).toMatchObject({
      attemptCount: 6,
      correctStreak: 0,
      status: 'active',
      dueAt: '2026-10-01T00:00:00.000Z',
    })
  })

  it('validates bounded, non-duplicated durable progress and rejects time travel', () => {
    let progress = recordTacticAttempt(createTacticProgress(), queenNet, 'solved', '2026-07-22T00:00:00.000Z')
    expect(() => recordTacticAttempt(progress, queenNet, 'solved', '2026-07-21T00:00:00.000Z')).toThrow('cannot predate')

    const duplicate: TacticProgress = {
      schemaVersion: 1,
      records: [progress.records[0]!, progress.records[0]!],
    }
    expect(isTacticProgress(duplicate)).toBe(false)

    const oversized: TacticProgress = {
      schemaVersion: 1,
      records: Array.from({ length: MAX_TACTIC_PROGRESS_RECORDS + 1 }, (_, index) => ({
        puzzleId: `seed-v1:bounded-${index}` as const,
        attemptCount: 1,
        correctStreak: 0,
        status: 'active' as const,
        dueAt: '2026-07-22T00:00:00.000Z',
        lastAttemptAt: '2026-07-22T00:00:00.000Z',
      })),
    }
    expect(isTacticProgress(oversized)).toBe(false)
  })
})
