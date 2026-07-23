import { describe, expect, it, vi } from 'vitest'
import {
  LIBRARY_STORAGE_KEY,
  MAX_ACTIVE_SESSION_PGN_BYTES,
  MAX_ACTIVE_SESSION_RAW_CHARS,
  hasOversizedActiveSessionRaw,
  isStoredGameSummary,
  linkLibraryGameSummariesToReview,
  linkLibraryGamesToReview,
  markLibraryGamesReviewed,
  mergeLibraryGameSummaries,
  mergeLibraryGames,
  normalizeActiveSession,
  normalizeLibrary,
  parseBrowserLibraryRaw,
  parseActiveSessionRaw,
  readBrowserLibraryRaw,
  readBrowserLibraryRawStrict,
  readActiveSessionRaw,
  toStoredGameSummary,
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

  it('keeps only render metadata in a stored-game summary', () => {
    const summary = toStoredGameSummary({ ...validGame, reviewKey: '0123456789abcdef' })

    expect(summary).not.toHaveProperty('pgn')
    expect(isStoredGameSummary(summary)).toBe(true)
    expect(isStoredGameSummary({ ...summary, pgn: 'must-not-enter-summary-state' })).toBe(false)
  })

  it('merges summary rows newest first without retaining PGN text', () => {
    const oldSummary = toStoredGameSummary({ ...validGame, id: 'old', playedAt: '2026-07-20T00:00:00.000Z' })
    const currentSummary = toStoredGameSummary({ ...validGame, id: 'current', playedAt: '2026-07-24T00:00:00.000Z', reviewed: true })

    expect(mergeLibraryGameSummaries([oldSummary], [currentSummary])).toEqual([currentSummary, oldSummary])
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

  it('links an explicitly reviewed legacy game without parsing its PGN', () => {
    const reviewKey = '0123456789abcdef'
    const games = [
      { ...validGame, id: 'legacy-source', pgn: 'not-a-pgn', reviewed: false },
      { ...validGame, id: 'matching-game', pgn: 'also-not-a-pgn', reviewKey, reviewed: false },
      { ...validGame, id: 'untouched', pgn: 'still-not-a-pgn', reviewKey: 'fedcba9876543210', reviewed: false },
    ]

    const result = linkLibraryGamesToReview(games, reviewKey, 'legacy-source')

    expect(result.changedGames).toEqual([
      { ...games[0], reviewKey, reviewed: true },
      { ...games[1], reviewed: true },
    ])
    expect(result.games[0]).toEqual({ ...games[0], reviewKey, reviewed: true })
    expect(result.games[1]).toEqual({ ...games[1], reviewed: true })
    expect(result.games[2]).toBe(games[2])
  })

  it('links review metadata for summaries without reintroducing PGN strings', () => {
    const reviewKey = '0123456789abcdef'
    const summaries = [
      toStoredGameSummary({ ...validGame, id: 'source', pgn: 'large-pgn-should-not-survive' }),
      toStoredGameSummary({ ...validGame, id: 'other', reviewKey }),
    ]

    const result = linkLibraryGameSummariesToReview(summaries, reviewKey, 'source')

    expect(result.games).toEqual([
      { ...summaries[0], reviewKey, reviewed: true },
      { ...summaries[1], reviewed: true },
    ])
    expect(JSON.stringify(result.games)).not.toContain('large-pgn-should-not-survive')
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

  it('fails closed before parsing an oversized active-session mirror', () => {
    expect(normalizeActiveSession({
      ...legacySession,
      pgn: 'x'.repeat(MAX_ACTIVE_SESSION_PGN_BYTES + 1),
    })).toBeNull()
    expect(parseActiveSessionRaw('x'.repeat(MAX_ACTIVE_SESSION_RAW_CHARS + 1))).toBeNull()
  })

  it('does not confuse an oversized active-session mirror with a missing one', () => {
    const records = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => records.get(key) ?? null,
      setItem: (key: string, value: string) => { records.set(key, value) },
      removeItem: (key: string) => { records.delete(key) },
    })
    try {
      localStorage.setItem('knightclub.active-session.v1', 'x'.repeat(MAX_ACTIVE_SESSION_RAW_CHARS + 1))

      expect(hasOversizedActiveSessionRaw()).toBe(true)
      expect(readActiveSessionRaw()).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
