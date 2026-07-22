import { describe, expect, it } from 'vitest'
import { soundPattern } from './gameSounds'

describe('original synthesized game sounds', () => {
  it('uses distinct, short and safe patterns for each event', () => {
    const events = ['move', 'capture', 'check', 'game-end'] as const
    const patterns = events.map(soundPattern)
    expect(new Set(patterns.map((pattern) => JSON.stringify(pattern))).size).toBe(events.length)
    for (const pattern of patterns) {
      expect(pattern.length).toBeGreaterThan(0)
      expect(pattern.every((tone) => tone.frequency >= 100 && tone.frequency <= 1_500)).toBe(true)
      expect(pattern.reduce((sum, tone) => sum + tone.durationMs, 0)).toBeLessThanOrEqual(500)
    }
  })
})
