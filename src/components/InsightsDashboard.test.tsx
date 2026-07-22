import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { InsightsDashboard } from './InsightsDashboard'
import type { StoredGame } from '../storage/gameStore'

const finishedGame: StoredGame = {
  id: 'finished-game',
  playedAt: '2026-07-22T10:00:00.000Z',
  mode: 'bot',
  botLevel: 'balanced',
  result: '1-0',
  pgn: '1. e4 e5 1-0',
  finalFen: 'final-fen',
  moveCount: 2,
  humanColor: 'w',
  timeControl: { id: 'rapid-10', label: 'Rapid · 10 min', category: 'rapid', initialMs: 600_000, incrementMs: 0, delayMs: 0 },
}

describe('InsightsDashboard', () => {
  it('gives a new user a real local starting action instead of a future-feature placeholder', () => {
    const markup = renderToStaticMarkup(
      <InsightsDashboard games={[]} onPlay={vi.fn()} onReviewGame={vi.fn()} />,
    )

    expect(markup).toContain('Your first game starts the picture')
    expect(markup).toContain('Play a game')
    expect(markup).not.toContain('Future releases')
  })

  it('shows user-perspective record, transparent coverage, and a review handoff for saved games', () => {
    const markup = renderToStaticMarkup(
      <InsightsDashboard games={[finishedGame]} onPlay={vi.fn()} onReviewGame={vi.fn()} />,
    )

    expect(markup).toContain('Personal record')
    expect(markup).toContain('1W · 0D · 0L')
    expect(markup).toContain('Review latest game')
    expect(markup).toContain('Rapid · 10 min')
    expect(markup).toContain('Balanced')
    expect(markup).toContain('Only completed bot games with a saved player colour')
  })
})
