import { describe, expect, it } from 'vitest'
import { normalizeActiveSession, normalizeLibrary } from './gameStore'

const validGame = {
  id: 'game-1',
  playedAt: '2026-07-22T00:00:00.000Z',
  mode: 'bot' as const,
  result: '1-0',
  pgn: '1. e4 e5 1-0',
  finalFen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
  moveCount: 2,
}

describe('game library normalization', () => {
  it('keeps bounded games and drops malformed legacy entries', () => {
    expect(normalizeLibrary([
      validGame,
      { ...validGame, id: '', moveCount: -1 },
      { unexpected: true },
    ])).toEqual([validGame])
  })

  it('caps legacy libraries to the supported 500 records', () => {
    const games = Array.from({ length: 510 }, (_, index) => ({ ...validGame, id: `game-${index}` }))
    expect(normalizeLibrary(games)).toHaveLength(500)
  })

  it('preserves valid resolved player sides while accepting color-less legacy games', () => {
    const resolvedSide = {
      ...validGame,
      id: 'game-with-side',
      humanColor: 'b' as const,
      colorChoice: 'random' as const,
    }

    expect(normalizeLibrary([validGame, resolvedSide])).toEqual([validGame, resolvedSide])
  })

  it('preserves a known named opponent while retaining games saved before profiles existed', () => {
    const namedOpponent = { ...validGame, id: 'game-with-profile', botProfileId: 'rowan-pike' as const }

    expect(normalizeLibrary([validGame, namedOpponent])).toEqual([validGame, namedOpponent])
  })

  it('drops games with malformed resolved player sides', () => {
    expect(normalizeLibrary([
      validGame,
      { ...validGame, id: 'bad-human-color', humanColor: 'white' },
      { ...validGame, id: 'bad-color-choice', colorChoice: 'coin-flip' },
    ])).toEqual([validGame])
  })

  it('drops games with unknown opponent profiles instead of displaying an unverified identity', () => {
    expect(normalizeLibrary([
      validGame,
      { ...validGame, id: 'unknown-profile', botProfileId: 'champion' },
    ])).toEqual([validGame])
  })
})

describe('active session normalization', () => {
  const legacySession = {
    pgn: '',
    startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    mode: 'bot' as const,
    botLevel: 'balanced' as const,
    orientation: 'white' as const,
  }

  it('keeps legacy sessions without a player-side selection', () => {
    expect(normalizeActiveSession(legacySession)).toEqual(legacySession)
  })

  it('keeps valid player-side data and rejects malformed values', () => {
    const resolvedSide = {
      ...legacySession,
      humanColor: 'b' as const,
      colorChoice: 'random' as const,
    }

    expect(normalizeActiveSession(resolvedSide)).toEqual(resolvedSide)
    expect(normalizeActiveSession({ ...legacySession, humanColor: 'black' })).toBeNull()
    expect(normalizeActiveSession({ ...legacySession, colorChoice: 'coin-flip' })).toBeNull()
  })

  it('keeps known named opponents and rejects unknown profile IDs', () => {
    expect(normalizeActiveSession({ ...legacySession, botProfileId: 'mira-vale' })).toEqual({
      ...legacySession,
      botProfileId: 'mira-vale',
    })
    expect(normalizeActiveSession({ ...legacySession, botProfileId: 'champion' })).toBeNull()
  })
})
