import { describe, expect, it } from 'vitest'
import {
  LIBRARY_STORAGE_KEY,
  markLibraryGamesReviewed,
  mergeLibraryGames,
  normalizeActiveSession,
  normalizeLibrary,
  parseBrowserLibraryRaw,
  readBrowserLibraryRaw,
  readBrowserLibraryRawStrict,
} from './gameStore'

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

  it('reads the raw browser mirror separately from its pure normalized parser', () => {
    const raw = JSON.stringify([validGame, { id: 'missing-required-fields' }])
    const getItem = (key: string) => key === LIBRARY_STORAGE_KEY ? raw : null

    expect(readBrowserLibraryRaw({ getItem })).toBe(raw)
    expect(readBrowserLibraryRawStrict({ getItem })).toBe(raw)
    expect(parseBrowserLibraryRaw(raw)).toEqual([validGame])
    expect(parseBrowserLibraryRaw('{ definitely not JSON')).toEqual([])
  })

  it('keeps an unreadable mirror distinguishable for deferred Library recovery', () => {
    const unreadable = { getItem: () => { throw new Error('Storage is blocked.') } }

    expect(readBrowserLibraryRaw(unreadable)).toBeNull()
    expect(() => readBrowserLibraryRawStrict(unreadable)).toThrow('Storage is blocked.')
  })

  it('keeps newer in-memory saves and review flags when a delayed native list arrives', () => {
    const native = [
      { ...validGame, id: 'game-1', reviewed: false },
      { ...validGame, id: 'game-older', playedAt: '2026-07-20T00:00:00.000Z' },
    ]
    const current = [
      { ...validGame, id: 'game-1', reviewed: true, reviewKey: '0123456789abcdef' },
      { ...validGame, id: 'game-new', playedAt: '2026-07-23T00:00:00.000Z' },
    ]

    expect(mergeLibraryGames(native, current)).toEqual([
      current[1],
      current[0],
      native[1],
    ])
  })

  it('marks only matching precomputed review keys without touching a large library\'s PGNs', () => {
    const reviewKey = '0123456789abcdef'
    const games = Array.from({ length: 500 }, (_, index) => ({
      ...validGame,
      id: `game-${index}`,
      // Deliberately not valid notation: this metadata-only path must never
      // parse a stored game just to reflect a completed review.
      pgn: `not-a-pgn-${index}`,
      reviewKey: index === 24 || index === 499 ? reviewKey : 'fedcba9876543210',
      reviewed: index === 499,
    }))

    const result = markLibraryGamesReviewed(games, reviewKey)

    expect(result.games).toHaveLength(500)
    expect(result.changedGames).toEqual([{ ...games[24], reviewed: true }])
    expect(result.games[24]).toEqual({ ...games[24], reviewed: true })
    expect(result.games[499]).toBe(games[499])
    expect(result.games[0]).toBe(games[0])
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
