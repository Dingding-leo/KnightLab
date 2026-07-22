import { describe, expect, it } from 'vitest'
import {
  createRetryItem,
  recordRetryAttempt,
  type RetryItem,
} from './retry'
import {
  deleteBrowserRetryItem,
  loadBrowserRetryItem,
  loadBrowserRetryItems,
  saveBrowserRetryItem,
} from './retryPersistence'
import { createPgnTimeline } from '../analysis/analysisModel'
import type { ReviewedMove } from './reviewModel'

class MemoryStorage {
  private values = new Map<string, string>()

  getItem(key: string): string | null { return this.values.get(key) ?? null }
  setItem(key: string, value: string): void { this.values.set(key, value) }
  removeItem(key: string): void { this.values.delete(key) }
}

function retry(reviewKey = '0123456789abcdef', now = '2026-07-22T00:00:00.000Z'): RetryItem {
  const timeline = createPgnTimeline('1. e4 e5 *')
  const source = timeline.moves[0]
  const move: ReviewedMove = {
    ply: source.ply,
    moveNumber: source.moveNumber,
    color: source.color,
    san: source.san,
    from: source.from,
    to: source.to,
    classification: 'mistake',
    accuracy: 50,
    centipawnLoss: 100,
    expectedLoss: 0.2,
    bestMoveUci: 'd2d4',
    bestMoveSan: 'd4',
    isBestMove: false,
    phase: 'opening',
    bestScore: { kind: 'cp', value: 40, bound: null },
    playedScore: { kind: 'cp', value: 0, bound: null },
    bestLineSan: ['d4', 'e5'],
    depth: 18,
    confidence: 'normal',
    feedback: 'Recorded review feedback.',
  }
  const item = createRetryItem({ timeline, move, reviewKey, now })
  if (!item) throw new Error('Expected a retry item for the test.')
  return item
}

describe('browser retry queue persistence', () => {
  it('round-trips a validated retry, keeps the next due active item first, and deletes by exact key', () => {
    const storage = new MemoryStorage()
    const first = recordRetryAttempt(retry(), 'recorded-solution', '2026-07-22T00:00:00.000Z')
    const second = retry('fedcba9876543210', '2026-07-22T00:00:00.000Z')

    saveBrowserRetryItem(first, storage)
    saveBrowserRetryItem(second, storage)

    expect(loadBrowserRetryItems(storage).map((item) => item.retryKey)).toEqual([
      second.retryKey,
      first.retryKey,
    ])
    expect(loadBrowserRetryItem(first.retryKey, storage)).toEqual(first)
    expect(deleteBrowserRetryItem(first.retryKey, storage)).toBe(true)
    expect(deleteBrowserRetryItem(first.retryKey, storage)).toBe(false)
    expect(loadBrowserRetryItem(first.retryKey, storage)).toBeNull()
  })

  it('fails closed for malformed stored records while retaining independently valid items', () => {
    const storage = new MemoryStorage()
    const valid = retry()
    const invalid = JSON.parse(JSON.stringify(valid)) as Record<string, unknown>
    invalid.solutionSan = 'e4'
    storage.setItem('knightclub.retry-items.v1', JSON.stringify([invalid, valid, { retryKey: valid.retryKey }]))

    expect(loadBrowserRetryItems(storage)).toEqual([valid])
    expect(loadBrowserRetryItem('not-a-retry-key', storage)).toBeNull()
  })

  it('does not write an invalid item or use unavailable browser storage', () => {
    const storage = new MemoryStorage()
    const invalid = { ...retry(), focus: '' }
    expect(() => saveBrowserRetryItem(invalid, storage)).toThrow('Retry item')
    expect(() => saveBrowserRetryItem(retry(), undefined)).toThrow('unavailable')
  })
})
