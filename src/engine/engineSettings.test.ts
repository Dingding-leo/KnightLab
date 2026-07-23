import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ENGINE_SETTINGS,
  normalizeEngineSettings,
  validateEngineSettingsPatch,
} from './engineSettings'

describe('engine settings', () => {
  it('starts new configurable engines with a balanced low-compute budget', () => {
    expect(DEFAULT_ENGINE_SETTINGS).toMatchObject({
      moveTimeMs: 60,
      nodes: 3_000,
      threads: 1,
      hashMb: 16,
    })
  })

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

  it('returns malformed persisted values to per-field safe defaults instead of promoting them to maxima', () => {
    expect(normalizeEngineSettings({
      enginePath: '/tmp/stockfish\nquit',
      profile: 'unknown',
      elo: 99_999,
      skillLevel: 20.5,
      moveTimeMs: 99_999,
      depth: 99,
      nodes: '100000000',
      multiPv: 80,
      threads: 33,
      hashMb: 999_999,
    })).toEqual({
      ...DEFAULT_ENGINE_SETTINGS,
    })
  })

  it('keeps intentional exact maxima and null optional search limits', () => {
    expect(normalizeEngineSettings({
      ...DEFAULT_ENGINE_SETTINGS,
      profile: 'custom',
      elo: 3190,
      skillLevel: 20,
      moveTimeMs: 30_000,
      depth: 40,
      nodes: 100_000_000,
      multiPv: 5,
      threads: 32,
      hashMb: 4096,
    })).toMatchObject({
      elo: 3190,
      skillLevel: 20,
      moveTimeMs: 30_000,
      depth: 40,
      nodes: 100_000_000,
      multiPv: 5,
      threads: 32,
      hashMb: 4096,
    })
    expect(normalizeEngineSettings({ ...DEFAULT_ENGINE_SETTINGS, depth: null, nodes: null }))
      .toMatchObject({ depth: null, nodes: null })
  })

  it('does not turn a missing, malformed or fractional node cap into an unlimited or maximum search', () => {
    for (const nodes of [undefined, '', '3000', [3_000], 100_000_001, 3_000.5]) {
      expect(normalizeEngineSettings({ ...DEFAULT_ENGINE_SETTINGS, nodes })).toMatchObject({
        nodes: DEFAULT_ENGINE_SETTINGS.nodes,
      })
    }
  })

  it('rejects invalid interactive drafts without changing the current safe settings', () => {
    const rejected = validateEngineSettingsPatch({
      ...DEFAULT_ENGINE_SETTINGS,
      profile: 'custom',
      hashMb: 128,
      nodes: 10_000,
    }, { hashMb: '4097' })

    expect(rejected).toMatchObject({
      valid: false,
      field: 'hashMb',
      message: 'Hash memory must be a whole number from 16 to 4,096 MB.',
    })

    const browserRejected = validateEngineSettingsPatch(DEFAULT_ENGINE_SETTINGS, { hashMb: '256' }, { maximumHashMb: 128 })
    expect(browserRejected).toMatchObject({
      valid: false,
      field: 'hashMb',
      message: 'Hash memory must be a whole number from 16 to 128 MB.',
    })

    const accepted = validateEngineSettingsPatch(DEFAULT_ENGINE_SETTINGS, {
      profile: 'custom',
      moveTimeMs: '900',
      nodes: '',
      threads: '4',
      hashMb: '256',
    })
    expect(accepted).toMatchObject({
      valid: true,
      settings: {
        profile: 'custom',
        moveTimeMs: 900,
        nodes: null,
        threads: 4,
        hashMb: 256,
      },
    })
  })
})
