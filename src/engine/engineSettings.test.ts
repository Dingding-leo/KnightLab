import { describe, expect, it } from 'vitest'
import { DEFAULT_ENGINE_SETTINGS, normalizeEngineSettings } from './engineSettings'

describe('engine settings', () => {
  it('keeps valid advanced settings', () => {
    expect(normalizeEngineSettings({
      enginePath: '  /opt/homebrew/bin/stockfish  ',
      profile: 'custom',
      elo: 2100,
      skillLevel: 11,
      limitStrength: false,
      moveTimeMs: 900,
      depth: 18,
      nodes: 250_000,
      multiPv: 3,
      threads: 4,
      hashMb: 256,
    })).toEqual({
      enginePath: '/opt/homebrew/bin/stockfish',
      profile: 'custom',
      elo: 2100,
      skillLevel: 11,
      limitStrength: false,
      moveTimeMs: 900,
      depth: 18,
      nodes: 250_000,
      multiPv: 3,
      threads: 4,
      hashMb: 256,
    })
  })

  it('bounds malformed persisted values and rejects unsafe paths', () => {
    expect(normalizeEngineSettings({
      enginePath: '/tmp/stockfish\nquit',
      profile: 'unknown',
      elo: 99_999,
      skillLevel: -4,
      moveTimeMs: 1,
      depth: 99,
      nodes: 1,
      multiPv: 80,
      threads: 0,
      hashMb: 999_999,
    })).toEqual({
      ...DEFAULT_ENGINE_SETTINGS,
      elo: 3190,
      skillLevel: 0,
      moveTimeMs: 50,
      depth: 40,
      nodes: 1_000,
      multiPv: 5,
      threads: 1,
      hashMb: 4096,
    })
  })

  it('preserves null optional search limits', () => {
    expect(normalizeEngineSettings({ ...DEFAULT_ENGINE_SETTINGS, depth: null, nodes: null }))
      .toMatchObject({ depth: null, nodes: null })
  })
})

