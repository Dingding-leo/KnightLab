import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { RetryQueue } from './RetryQueue'
import type { RetryItem } from '../review/retry'

const item: RetryItem = {
  schemaVersion: 1,
  retryKey: '0123456789abcdef:4',
  reviewKey: '0123456789abcdef',
  sourcePly: 4,
  preFen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2',
  sideToMove: 'b',
  playedMoveUci: 'a7a6',
  playedMoveSan: 'a6',
  solutionUci: 'd8h4',
  solutionSan: 'Qh4#',
  solutionLineSan: ['Qh4#'],
  classification: 'blunder',
  focus: 'Check forcing moves before committing to a quiet move.',
  status: 'active',
  attemptCount: 0,
  correctStreak: 0,
  dueAt: '2026-07-22T00:00:00.000Z',
  lastAttemptAt: null,
  createdAt: '2026-07-22T00:00:00.000Z',
  updatedAt: '2026-07-22T00:00:00.000Z',
}

const continuationItem: RetryItem = {
  ...item,
  retryKey: '0123456789abcdef:1',
  sourcePly: 1,
  preFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  sideToMove: 'w',
  playedMoveUci: 'e2e4',
  playedMoveSan: 'e4',
  solutionUci: 'd2d4',
  solutionSan: 'd4',
  solutionLineSan: ['d4', 'e5', 'c4'],
  classification: 'mistake',
}

describe('personal retry queue', () => {
  it('starts a colour-oriented, non-spoiling saved-move exercise', () => {
    const markup = renderToStaticMarkup(
      <RetryQueue
        items={[item]}
        requestedRetryKey={item.retryKey}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        onBackToReview={vi.fn()}
        onOpenReview={vi.fn()}
      />,
    )

    expect(markup).toContain('From your games')
    expect(markup).toContain('Black to move')
    expect(markup).toContain('Find the saved review move')
    expect(markup).toContain('Find the saved Stockfish move from this completed local review')
    expect(markup).toContain('Hint')
    expect(markup).toContain('Reveal move')
    expect(markup).toContain('Back to review')
    expect(markup).not.toContain('Skip for now')
    expect(markup).not.toContain('aria-live')
    expect(markup).not.toContain('Qh4#')
    expect(markup).not.toContain('Coach&#x27;s evidence')
  })

  it('shows multi-move progress without exposing the future saved line', () => {
    const markup = renderToStaticMarkup(
      <RetryQueue
        items={[continuationItem]}
        requestedRetryKey={continuationItem.retryKey}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(markup).toContain('Replay the saved review line')
    expect(markup).toContain('Your move 1 of 2')
    expect(markup).toContain('Reveal line')
    expect(markup).toContain('After each correct move, its recorded reply appears')
    expect(markup).toContain('aria-label="Saved line progress: move 1 of 2"')
    expect(markup).toContain('aria-current="step"')
    expect(markup).not.toContain('Saved Stockfish line: d4 e5 c4')
    expect(markup).not.toContain('Recorded reply: e5')
  })

  it('labels an early replay by calendar day instead of a rolling 24-hour window', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 22, 23, 30))
    try {
      const markup = renderToStaticMarkup(
        <RetryQueue
          items={[{ ...continuationItem, dueAt: new Date(2026, 6, 23, 22, 0).toISOString() }]}
          requestedRetryKey={continuationItem.retryKey}
          onSave={vi.fn().mockResolvedValue(undefined)}
          onDelete={vi.fn().mockResolvedValue(undefined)}
        />,
      )

      expect(markup).toContain('early replay · due tomorrow')
      expect(markup).toContain('Next due tomorrow')
    } finally {
      vi.useRealTimers()
    }
  })

  it('makes an empty queue a clear, quiet state', () => {
    const markup = renderToStaticMarkup(
      <RetryQueue
        items={[]}
        requestedRetryKey={null}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
        onOpenReview={vi.fn()}
      />,
    )

    expect(markup).toContain('Your review queue is clear')
    expect(markup).toContain('Finish a review and add a key moment when you want to practise it.')
    expect(markup).toContain('Open Review')
  })

  it('opens a specifically requested mastered moment as an optional replay', () => {
    const markup = renderToStaticMarkup(
      <RetryQueue
        items={[{ ...item, status: 'mastered' }]}
        requestedRetryKey={item.retryKey}
        onSave={vi.fn().mockResolvedValue(undefined)}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    expect(markup).toContain('Find the saved review move')
    expect(markup).toContain('optional replay')
    expect(markup).toContain('Mastered')
    expect(markup).not.toContain('Your review queue is clear')
  })
})
