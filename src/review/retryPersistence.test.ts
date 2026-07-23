import { Chess } from 'chess.js'
import { describe, expect, it, vi } from 'vitest'
import {
  createRetryItem,
  recordRetryAttempt,
  type RetryItem,
} from './retry'
import {
  deleteBrowserRetryItem,
  loadBrowserRetryItem,
  loadBrowserRetryItems,
  parseBrowserRetryItemsRaw,
  readBrowserRetryItemsRaw,
  readBrowserRetryItemsRawStrict,
  saveBrowserRetryItem,
} from './retryPersistence'
import { saveRetryItemsSerially } from './retryQueuePersistence'
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

function retryKey(index: number): string {
  return index.toString(16).padStart(16, '0')
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

  it('separates a safe raw browser read from the shared fail-closed parser', () => {
    const storage = new MemoryStorage()
    const valid = retry()
    const malformed = { ...valid, solutionSan: 'not-the-solution' }
    storage.setItem('knightclub.retry-items.v1', JSON.stringify([valid, malformed]))

    const raw = readBrowserRetryItemsRaw(storage)
    expect(raw).toBe(storage.getItem('knightclub.retry-items.v1'))
    expect(readBrowserRetryItemsRawStrict(storage)).toBe(raw)
    expect(parseBrowserRetryItemsRaw(raw)).toEqual([valid])

    const unreadable = {
      getItem: () => { throw new Error('Storage is blocked.') },
      setItem: () => {},
      removeItem: () => {},
    }
    expect(readBrowserRetryItemsRaw(unreadable)).toBeNull()
    expect(() => readBrowserRetryItemsRawStrict(unreadable)).toThrow('Storage is blocked.')
  })

  it('invalidates an old snapshot after a direct storage rewrite and never exposes its private records', () => {
    const storage = new MemoryStorage()
    const valid = retry()
    saveBrowserRetryItem(valid, storage)

    const exposed = loadBrowserRetryItems(storage)
    exposed[0]!.focus = 'A caller mutation must not modify the cached record.'
    exposed[0]!.solutionLineSan.push('e5')
    expect(loadBrowserRetryItems(storage)).toEqual([valid])

    const single = loadBrowserRetryItem(valid.retryKey, storage)!
    single.solutionLineSan.push('e5')
    expect(loadBrowserRetryItem(valid.retryKey, storage)).toEqual(valid)

    const malformed = { ...valid, solutionSan: 'e4' }
    storage.setItem('knightclub.retry-items.v1', JSON.stringify([malformed]))
    expect(loadBrowserRetryItems(storage)).toEqual([])
  })

  it('strips ignored nested legacy fields before a cached retry can be exposed or re-saved', () => {
    const storage = new MemoryStorage()
    const valid = retry()
    storage.setItem('knightclub.retry-items.v1', JSON.stringify([{
      ...valid,
      legacyMetadata: { note: 'must remain outside the retry schema' },
    }]))

    const exposed = loadBrowserRetryItems(storage)[0] as RetryItem & { legacyMetadata?: { note: string } }
    expect(exposed.legacyMetadata).toBeUndefined()

    saveBrowserRetryItem(retry('fedcba9876543210'), storage)
    const persisted = JSON.parse(storage.getItem('knightclub.retry-items.v1') ?? '[]') as Array<Record<string, unknown>>
    expect(persisted.every((item) => item.legacyMetadata === undefined)).toBe(true)
  })

  it('keeps a warmed 500-position browser mirror off the Chess replay path during a serial save batch', async () => {
    const storage = new MemoryStorage()
    const existing = Array.from({ length: 498 }, (_, index) => retry(retryKey(index)))
    const incoming = [retry(retryKey(498)), retry(retryKey(499))]
    storage.setItem('knightclub.retry-items.v1', JSON.stringify(existing))

    // The first full read validates the legacy blob and establishes the
    // private raw-text-versioned snapshot used by normal Train interactions.
    expect(loadBrowserRetryItems(storage)).toHaveLength(498)
    const move = vi.spyOn(Chess.prototype, 'move')
    try {
      const result = await saveRetryItemsSerially({
        items: incoming,
        retryStore: {
          load: async (key) => loadBrowserRetryItem(key, storage),
          save: async (item) => saveBrowserRetryItem(item, storage),
        },
      })

      expect(result).toEqual({ saved: incoming, error: null })
      expect(loadBrowserRetryItems(storage)).toHaveLength(500)
      // Only the two newly saved records are verified. Replaying 498 retained
      // records would require thousands of chess moves here.
      expect(move).toHaveBeenCalledTimes(10)
    } finally {
      move.mockRestore()
    }
  })

  it('does not write an invalid item or use unavailable browser storage', () => {
    const storage = new MemoryStorage()
    const invalid = { ...retry(), focus: '' }
    expect(() => saveBrowserRetryItem(invalid, storage)).toThrow('Retry item')
    expect(() => saveBrowserRetryItem(retry(), undefined)).toThrow('unavailable')
  })
})
