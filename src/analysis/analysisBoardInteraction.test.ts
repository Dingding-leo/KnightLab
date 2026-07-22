import { describe, expect, it } from 'vitest'
import { inertAnalysisBoardInteraction } from './analysisBoardInteraction'

describe('inert analysis board interaction', () => {
  it('shares stable read-only callbacks and no legal targets across review updates', () => {
    const first = inertAnalysisBoardInteraction
    const second = inertAnalysisBoardInteraction

    expect(second).toBe(first)
    expect(second.legalTargets).toBe(first.legalTargets)
    expect(second.onSquareClick).toBe(first.onSquareClick)
    expect(second.onMoveAttempt).toBe(first.onMoveAttempt)
    expect([...first.legalTargets]).toEqual([])
    expect(first.onSquareClick('e4')).toBeUndefined()
    expect(first.onMoveAttempt('e2', 'e4')).toBeUndefined()
  })
})
