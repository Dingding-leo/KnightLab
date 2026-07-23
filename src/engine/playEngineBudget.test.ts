import { describe, expect, it } from 'vitest'
import { DEFAULT_ENGINE_SETTINGS } from './engineSettings'
import {
  PLAY_ENGINE_BUDGETS,
  resolvePlayEngineBudget,
} from './playEngineBudget'

describe('Play engine budget', () => {
  it('keeps the per-level bot budgets finite and low-cost', () => {
    expect(PLAY_ENGINE_BUDGETS).toEqual({
      easy: { moveTimeMs: 50, nodes: 1_000 },
      balanced: { moveTimeMs: 60, nodes: 3_000 },
      strong: { moveTimeMs: 90, nodes: 7_000 },
    })
  })

  it('caps a high-cost custom engine without changing its safe strength identity', () => {
    const result = resolvePlayEngineBudget('strong', {
      enginePath: '/opt/homebrew/bin/stockfish',
      profile: 'custom',
      elo: 2460,
      skillLevel: 17,
      limitStrength: false,
      moveTimeMs: 30_000,
      depth: 40,
      nodes: 100_000_000,
      multiPv: 5,
      threads: 32,
      hashMb: 4096,
    })

    expect(result).toEqual({
      enginePath: '/opt/homebrew/bin/stockfish',
      profile: 'custom',
      elo: 2460,
      skillLevel: 17,
      limitStrength: false,
      moveTimeMs: 90,
      depth: null,
      nodes: 7_000,
      multiPv: 1,
      threads: 1,
      hashMb: 16,
    })
  })

  it('keeps smaller valid time and node choices while making missing nodes finite', () => {
    const smaller = resolvePlayEngineBudget('balanced', {
      ...DEFAULT_ENGINE_SETTINGS,
      profile: 'elo',
      elo: 1500,
      moveTimeMs: 50,
      nodes: 1_000,
      threads: 4,
      hashMb: 128,
    })
    expect(smaller).toMatchObject({
      profile: 'elo',
      elo: 1500,
      moveTimeMs: 50,
      nodes: 1_000,
      depth: null,
      multiPv: 1,
      threads: 1,
      hashMb: 16,
    })

    expect(resolvePlayEngineBudget('easy', {
      ...DEFAULT_ENGINE_SETTINGS,
      nodes: null,
    })).toMatchObject({
      moveTimeMs: 50,
      nodes: 1_000,
    })
  })

  it('normalizes malformed persisted settings before applying a Play cap', () => {
    expect(resolvePlayEngineBudget('balanced', {
      ...DEFAULT_ENGINE_SETTINGS,
      profile: 'custom',
      enginePath: '/tmp/stockfish\nquit',
      elo: 99_999,
      skillLevel: 21,
      moveTimeMs: 99_999,
      depth: 41,
      nodes: 100_000_001,
      multiPv: 6,
      threads: 33,
      hashMb: 4097,
    })).toEqual({
      ...DEFAULT_ENGINE_SETTINGS,
      profile: 'custom',
      moveTimeMs: 60,
      nodes: 3_000,
      depth: null,
      multiPv: 1,
      threads: 1,
      hashMb: 16,
    })
  })
})
