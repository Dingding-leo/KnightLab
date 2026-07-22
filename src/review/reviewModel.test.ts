import { describe, expect, it } from 'vitest'
import { classifyReviewedMove, summarizeGameReview, type ReviewedMove } from './reviewModel'
import type { AnalysisLine } from '../analysis/stockfishAnalysisClient'

const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function line(value: number, pv: string[], multiPv = 1): AnalysisLine {
  return {
    multiPv,
    depth: 18,
    seldepth: 24,
    score: { kind: 'cp', value, bound: null },
    wdl: null,
    nodes: 100_000,
    nps: 500_000,
    hashfull: 20,
    tbHits: 0,
    timeMs: 300,
    pv,
  }
}

describe('contextual review classification', () => {
  it('recognises a best move without inventing centipawn loss', () => {
    const reviewed = classifyReviewedMove({
      ply: 1,
      moveNumber: 1,
      color: 'w',
      san: 'e4',
      from: 'e2',
      to: 'e4',
      preFen: start,
      postFen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
      beforeLines: [line(35, ['e2e4']), line(20, ['d2d4'], 2)],
      afterLine: line(-20, ['e7e5']),
    })
    expect(reviewed.classification).toBe('best')
    expect(reviewed.centipawnLoss).toBe(0)
    expect(reviewed.accuracy).toBe(100)
    expect(reviewed.feedback).toContain('e4')
  })

  it('uses decisive expected-score loss and missed mate context', () => {
    const reviewed = classifyReviewedMove({
      ply: 1,
      moveNumber: 1,
      color: 'w',
      san: 'a3',
      from: 'a2',
      to: 'a3',
      preFen: start,
      postFen: 'rnbqkbnr/pppppppp/8/8/8/P7/1PPPPPPP/RNBQKBNR b KQkq - 0 1',
      beforeLines: [{ ...line(3, ['e2e4']), score: { kind: 'mate', value: 3, bound: null } }, line(5, ['a2a3'], 2)],
      afterLine: line(0, ['e7e5']),
    })
    expect(reviewed.classification).toBe('miss')
    expect(reviewed.feedback).toMatch(/forced mate/i)
  })

  it('uses legal-move uniqueness for a forced classification', () => {
    const preFen = '7k/6Q1/8/8/8/8/8/6K1 b - - 0 1'
    const reviewed = classifyReviewedMove({
      ply: 2,
      moveNumber: 1,
      color: 'b',
      san: 'Kxg7',
      from: 'h8',
      to: 'g7',
      preFen,
      postFen: '8/6k1/8/8/8/8/8/6K1 w - - 0 2',
      beforeLines: [line(0, ['h8g7'])],
      afterLine: line(0, ['g1f2']),
    })
    expect(reviewed.classification).toBe('forced')
    expect(reviewed.feedback).toMatch(/only legal move/i)
  })

  it('marks a large nonlinear swing as a blunder', () => {
    const reviewed = classifyReviewedMove({
      ply: 1,
      moveNumber: 1,
      color: 'w',
      san: 'f3',
      from: 'f2',
      to: 'f3',
      preFen: start,
      postFen: 'rnbqkbnr/pppppppp/8/8/8/5P2/PPPPP1PP/RNBQKBNR b KQkq - 0 1',
      beforeLines: [line(250, ['e2e4']), line(20, ['d2d4'], 2)],
      afterLine: line(250, ['e7e5']),
    })
    expect(reviewed.classification).toBe('blunder')
    expect(reviewed.accuracy).toBeLessThan(35)
    expect(reviewed.bestMoveSan).toBe('e4')
  })
})

describe('game review summary', () => {
  it('reports colour splits, ACPL, best-hit rate and ranked turning points', () => {
    const moves = [
      { ply: 1, color: 'w', accuracy: 100, centipawnLoss: 0, expectedLoss: 0, classification: 'best', phase: 'opening', isBestMove: true },
      { ply: 2, color: 'b', accuracy: 20, centipawnLoss: 250, expectedLoss: 0.5, classification: 'blunder', phase: 'opening', isBestMove: false },
      { ply: 3, color: 'w', accuracy: 70, centipawnLoss: 40, expectedLoss: 0.1, classification: 'inaccuracy', phase: 'opening', isBestMove: false },
    ] as ReviewedMove[]
    const summary = summarizeGameReview(moves)
    expect(summary.whiteAccuracy).toBe(85)
    expect(summary.blackAccuracy).toBe(20)
    expect(summary.averageCentipawnLoss).toBe(97)
    expect(summary.bestMoveRate).toBe(33)
    expect(summary.turningPoints[0].ply).toBe(2)
  })
})
