import { describe, expect, it } from 'vitest'
import { playEngineFailureStatus, playEngineStatusUpdate } from './playEngineStatus'

describe('Play engine status feedback', () => {
  it('marks a completed real Stockfish result ready from its returned identity', () => {
    expect(playEngineStatusUpdate({
      provider: 'stockfish',
      engineName: ' Stockfish 18 ',
      enginePath: ' /opt/homebrew/bin/stockfish ',
    })).toEqual({
      kind: 'ready',
      engineName: 'Stockfish 18',
      enginePath: '/opt/homebrew/bin/stockfish',
    })
  })

  it('does not claim a local no-engine move verified Stockfish', () => {
    expect(playEngineStatusUpdate({
      provider: 'opening-cue',
      engineName: 'Local opening cue',
    })).toBeNull()
    expect(playEngineStatusUpdate({
      provider: 'forced-move',
      engineName: 'Local rules',
    })).toBeNull()
  })

  it('replaces an old ready label when Play falls back or cannot identify Stockfish', () => {
    expect(playEngineStatusUpdate({
      provider: 'knightbot',
      engineName: 'KnightBot fallback',
      warning: 'Stockfish executable was not found.',
    })).toEqual({ kind: 'error', message: 'Stockfish executable was not found.' })
    expect(playEngineStatusUpdate({
      provider: 'stockfish',
      engineName: 'Stockfish 18',
    })).toEqual({
      kind: 'error',
      message: 'Stockfish completed a move without a valid engine identity.',
    })
    expect(playEngineFailureStatus(new Error('engine process exited'))).toEqual({
      kind: 'error',
      message: 'engine process exited',
    })
  })
})
