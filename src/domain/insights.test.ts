import { describe, expect, it } from 'vitest'
import { calculateLocalInsights, formatRecord, type InsightGame } from './insights'

function game(overrides: Partial<InsightGame> = {}): InsightGame {
  return {
    id: crypto.randomUUID(),
    playedAt: '2026-07-22T10:00:00.000Z',
    mode: 'bot',
    result: '1-0',
    moveCount: 42,
    humanColor: 'w',
    botLevel: 'balanced',
    timeControl: { label: 'Rapid · 10 min' },
    ...overrides,
  }
}

describe('local insights', () => {
  it('calculates only attributable bot results from the player perspective', () => {
    const summary = calculateLocalInsights([
      game({ id: 'white-win', result: '1-0', humanColor: 'w', reviewed: true }),
      game({ id: 'black-win', result: '0-1', humanColor: 'b', botLevel: 'strong' }),
      game({ id: 'black-loss', result: '1-0', humanColor: 'b', timeControl: { label: 'Blitz · 5 min' } }),
      game({ id: 'draw', result: '1/2-1/2', humanColor: 'w', moveCount: 18 }),
      game({ id: 'local', mode: 'local', result: '0-1', humanColor: undefined }),
      game({ id: 'legacy', humanColor: undefined }),
      game({ id: 'unfinished', result: '*', moveCount: 9 }),
      game({ id: 'aborted', result: '1-0', moveCount: 0 }),
    ])

    expect(summary.savedGames).toBe(8)
    expect(summary.completedGames).toBe(6)
    expect(summary.unfinishedGames).toBe(2)
    expect(summary.personal).toEqual({ played: 4, wins: 2, draws: 1, losses: 1, scorePercent: 63 })
    expect(summary.byColor.white).toEqual({ played: 2, wins: 1, draws: 1, losses: 0, scorePercent: 75 })
    expect(summary.byColor.black).toEqual({ played: 2, wins: 1, draws: 0, losses: 1, scorePercent: 50 })
    expect(summary.reviewedGames).toBe(1)
    expect(summary.pendingReviews).toBe(5)
    expect(summary.reviewCoverage).toBe(17)
    expect(summary.averagePly).toBe(38)
    expect(formatRecord(summary.personal)).toBe('2W · 1D · 1L')
  })

  it('groups real games by time control and bot strength without inventing a personal result', () => {
    const summary = calculateLocalInsights([
      game({ id: 'one', timeControl: { label: 'Rapid · 10 min' }, botLevel: 'easy' }),
      game({ id: 'two', timeControl: { label: 'Rapid · 10 min' }, botLevel: 'easy', result: '0-1' }),
      game({ id: 'three', timeControl: undefined, mode: 'local', humanColor: undefined }),
    ])

    expect(summary.timeControls).toEqual([
      {
        key: 'Rapid · 10 min', label: 'Rapid · 10 min', games: 2,
        record: { played: 2, wins: 1, draws: 0, losses: 1, scorePercent: 50 },
      },
      {
        key: 'Unlimited / legacy', label: 'Unlimited / legacy', games: 1,
        record: { played: 0, wins: 0, draws: 0, losses: 0, scorePercent: null },
      },
    ])
    expect(summary.botLevels).toEqual([
      {
        key: 'easy', label: 'Easy', games: 2,
        record: { played: 2, wins: 1, draws: 0, losses: 1, scorePercent: 50 },
      },
    ])
  })

  it('uses local calendar days for an active play streak and selects the latest review target', () => {
    const summary = calculateLocalInsights([
      game({ id: 'today', playedAt: '2026-07-22T07:00:00.000Z' }),
      game({ id: 'yesterday', playedAt: '2026-07-21T07:00:00.000Z', reviewed: true }),
      game({ id: 'two-days', playedAt: '2026-07-20T07:00:00.000Z' }),
      game({ id: 'older', playedAt: '2026-07-18T07:00:00.000Z' }),
    ], new Date(2026, 6, 22, 19, 0))

    expect(summary.currentPlayStreak).toBe(3)
    expect(summary.latestUnreviewedId).toBe('today')
  })

  it('does not create a streak or review action from malformed dates', () => {
    const summary = calculateLocalInsights([
      game({ id: 'bad-date', playedAt: 'not-a-date' }),
    ], new Date(2026, 6, 22, 19, 0))

    expect(summary.currentPlayStreak).toBe(0)
    expect(summary.latestUnreviewedId).toBeNull()
  })
})
