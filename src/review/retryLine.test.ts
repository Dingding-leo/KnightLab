import { describe, expect, it } from 'vitest'
import { createPgnTimeline } from '../analysis/analysisModel'
import { createRetryItem, type RetryItem } from './retry'
import {
  attemptRetryLineMove,
  createRetryLine,
  retryLinePlayerMoveCount,
  retryLinePosition,
} from './retryLine'
import type { ReviewedMove } from './reviewModel'

function reviewedMove(
  timeline: ReturnType<typeof createPgnTimeline>,
  ply: number,
  bestLineSan: string[],
  options: Partial<ReviewedMove> = {},
): ReviewedMove {
  const source = timeline.moves[ply - 1]
  if (!source) throw new Error('Expected source move.')
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
    bestLineSan,
    depth: 18,
    confidence: 'normal',
    feedback: 'Recorded review feedback.',
    ...options,
  }
}

function item(): RetryItem {
  const timeline = createPgnTimeline('1. e4 e5 2. Nf3 Nc6 *')
  const retry = createRetryItem({
    timeline,
    move: reviewedMove(timeline, 1, ['d4', 'e5', 'c4']),
    reviewKey: '0123456789abcdef',
    now: '2026-07-22T00:00:00.000Z',
  })
  if (!retry) throw new Error('Expected retry item.')
  return retry
}

describe('recorded retry continuation', () => {
  it('advances through a saved PV, auto-playing only its recorded opponent reply', () => {
    const line = createRetryLine(item())
    if (!line) throw new Error('Expected retry line.')

    expect(line.mode).toBe('continuation')
    expect(line.moves.map((move) => move.san)).toEqual(['d4', 'e5', 'c4'])
    expect(retryLinePlayerMoveCount(line)).toBe(2)

    const first = attemptRetryLineMove(line, 0, { from: 'd2', to: 'd4' })
    expect(first).toMatchObject({
      outcome: 'advanced',
      played: { san: 'd4' },
      autoReply: { san: 'e5' },
      position: { completedPlies: 2, complete: false, next: { san: 'c4' } },
    })
    if (first.outcome !== 'advanced') throw new Error('Expected a valid advance.')

    const last = attemptRetryLineMove(line, first.position.completedPlies, { from: 'c2', to: 'c4' })
    expect(last).toMatchObject({
      outcome: 'advanced',
      played: { san: 'c4' },
      autoReply: null,
      position: { completedPlies: 3, complete: true, next: null, lastMove: { san: 'c4' } },
    })
  })

  it('finishes an even-length line after automatically applying its final reply', () => {
    const retry = { ...item(), solutionLineSan: ['d4', 'e5'] }
    const line = createRetryLine(retry)
    if (!line) throw new Error('Expected retry line.')

    const result = attemptRetryLineMove(line, 0, { from: 'd2', to: 'd4' })
    expect(result).toMatchObject({
      outcome: 'advanced',
      autoReply: { san: 'e5' },
      position: { completedPlies: 2, complete: true, next: null },
    })
  })

  it('keeps a legal alternative narrow and leaves the reconstructed line at its current position', () => {
    const line = createRetryLine(item())
    if (!line) throw new Error('Expected retry line.')

    expect(attemptRetryLineMove(line, 0, { from: 'e2', to: 'e4' })).toMatchObject({
      outcome: 'not-recorded',
      expected: { san: 'd4' },
      position: { completedPlies: 0, fen: item().preFen },
    })
    expect(attemptRetryLineMove(line, 0, { from: 'a1', to: 'a8' })).toMatchObject({ outcome: 'illegal' })
  })

  it('fails closed instead of shortening a non-empty continuation that cannot be replayed', () => {
    expect(createRetryLine({ ...item(), solutionLineSan: ['d4', 'not legal'] })).toBeNull()
  })

  it('uses the verified single first move when an older item explicitly has no PV', () => {
    const line = createRetryLine({ ...item(), solutionLineSan: [] })
    if (!line) throw new Error('Expected single-move line.')

    expect(line.mode).toBe('single-move')
    expect(line.moves.map((move) => move.san)).toEqual(['d4'])
    expect(retryLinePosition(line, 1)).toMatchObject({ complete: true, next: null, lastMove: { san: 'd4' } })
  })

  it('requires the exact promotion piece on every player turn', () => {
    const timeline = createPgnTimeline('[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n\n1. a8=Q+ *')
    const source = reviewedMove(timeline, 1, ['a8=N'])
    const retry = createRetryItem({
      timeline,
      move: { ...source, bestMoveUci: 'a7a8n', bestMoveSan: 'a8=N', bestLineSan: ['a8=N'] },
      reviewKey: '0123456789abcdef',
      now: '2026-07-22T00:00:00.000Z',
    })
    if (!retry) throw new Error('Expected promotion retry.')
    const line = createRetryLine(retry)
    if (!line) throw new Error('Expected promotion line.')

    expect(attemptRetryLineMove(line, 0, { from: 'a7', to: 'a8', promotion: 'q' })).toMatchObject({ outcome: 'not-recorded' })
    expect(attemptRetryLineMove(line, 0, { from: 'a7', to: 'a8', promotion: 'n' })).toMatchObject({
      outcome: 'advanced',
      position: { complete: true },
    })
  })

  it('keeps black custom-FEN move numbers and turn ownership from the reconstructed board', () => {
    const timeline = createPgnTimeline('[SetUp "1"]\n[FEN "7k/7p/8/8/8/8/8/K7 b - - 0 42"]\n\n42... h5 *')
    const retry = createRetryItem({
      timeline,
      move: reviewedMove(timeline, 1, ['h5', 'Ka2', 'h4'], {
        bestMoveUci: 'h7h5',
        bestMoveSan: 'h5',
      }),
      reviewKey: '0123456789abcdef',
      now: '2026-07-22T00:00:00.000Z',
    })
    if (!retry) throw new Error('Expected black retry.')
    const line = createRetryLine(retry)
    if (!line) throw new Error('Expected black line.')

    expect(line.playerColor).toBe('b')
    expect(line.moves[0]).toMatchObject({ color: 'b', moveNumber: 42, uci: 'h7h5' })
    const result = attemptRetryLineMove(line, 0, { from: 'h7', to: 'h5' })
    expect(result).toMatchObject({
      outcome: 'advanced',
      autoReply: { san: 'Ka2' },
      position: { next: { san: 'h4' }, completedPlies: 2 },
    })
  })

  it('replays special legal moves through their actual FEN state', () => {
    const castling = createRetryLine({
      ...item(),
      preFen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1',
      sideToMove: 'w',
      solutionUci: 'e1g1',
      solutionSan: 'O-O',
      solutionLineSan: ['O-O', 'O-O-O'],
    })
    if (!castling) throw new Error('Expected castling line.')
    expect(castling.moves.map((move) => move.uci)).toEqual(['e1g1', 'e8c8'])

    const enPassant = createRetryLine({
      ...item(),
      preFen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 2',
      sideToMove: 'w',
      solutionUci: 'e5d6',
      solutionSan: 'exd6',
      solutionLineSan: ['exd6', 'Kd7'],
    })
    if (!enPassant) throw new Error('Expected en-passant line.')
    expect(attemptRetryLineMove(enPassant, 0, { from: 'e5', to: 'd6' })).toMatchObject({
      outcome: 'advanced',
      autoReply: { uci: 'e8d7' },
      position: { complete: true },
    })
  })

  it('rejects a terminal starting position and accepts a terminal final move only as the end of a line', () => {
    expect(createRetryLine({
      ...item(),
      preFen: '7k/8/8/8/8/8/8/K7 w - - 0 1',
      sideToMove: 'w',
      solutionUci: 'a1a2',
      solutionSan: 'Ka2',
      solutionLineSan: [],
    })).toBeNull()

    const mate = createRetryLine({
      ...item(),
      preFen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2',
      sideToMove: 'b',
      solutionUci: 'd8h4',
      solutionSan: 'Qh4#',
      solutionLineSan: ['Qh4#'],
    })
    if (!mate) throw new Error('Expected mating line.')
    expect(attemptRetryLineMove(mate, 0, { from: 'd8', to: 'h4' })).toMatchObject({
      outcome: 'advanced',
      position: { complete: true, next: null },
    })
  })
})
