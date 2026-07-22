import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES, normalizePreferences } from './gameStore'

describe('local preferences', () => {
  it('keeps a valid sound preference and rejects malformed persisted input', () => {
    expect(normalizePreferences({ soundsEnabled: false })).toEqual({
      ...DEFAULT_PREFERENCES,
      soundsEnabled: false,
    })
    expect(normalizePreferences({ soundsEnabled: 'yes' })).toEqual(DEFAULT_PREFERENCES)
    expect(normalizePreferences(null)).toEqual(DEFAULT_PREFERENCES)
  })

  it('persists a known opponent preference and safely falls back for unknown IDs', () => {
    expect(normalizePreferences({ botProfileId: 'nia-cross' }).botProfileId).toBe('nia-cross')
    expect(normalizePreferences({ botProfileId: 'unknown' }).botProfileId)
      .toBe(DEFAULT_PREFERENCES.botProfileId)
  })

  it('migrates old preferences and normalizes nested engine settings', () => {
    expect(normalizePreferences({ soundsEnabled: false }).engine).toEqual(DEFAULT_PREFERENCES.engine)
    expect(normalizePreferences({
      soundsEnabled: true,
      engine: { ...DEFAULT_PREFERENCES.engine, profile: 'elo', elo: 2050, threads: 3 },
    }).engine).toMatchObject({ profile: 'elo', elo: 2050, threads: 3 })
  })
})
