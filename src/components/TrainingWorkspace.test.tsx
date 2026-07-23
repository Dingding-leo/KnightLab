import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createTacticProgress } from '../tactics/tactics'
import { TrainingWorkspace } from './TrainingWorkspace'
import {
  defaultTrainingSource,
  shouldDefaultToPersonalAfterRetryHydration,
} from '../training/trainingSource'

describe('training workspace', () => {
  const dueItem = { status: 'active' as const, dueAt: '2026-07-22T00:00:00.000Z' }

  it('returns to the due personal queue when its deferred history finishes loading', () => {
    expect(defaultTrainingSource([dueItem], null, '2026-07-23T00:00:00.000Z')).toBe('personal')
    expect(shouldDefaultToPersonalAfterRetryHydration(
      true,
      false,
      false,
      [dueItem],
      '2026-07-23T00:00:00.000Z',
    )).toBe(true)
  })

  it('does not steal focus after the player chose another trainer or while history still loads', () => {
    expect(shouldDefaultToPersonalAfterRetryHydration(
      true,
      false,
      true,
      [dueItem],
      '2026-07-23T00:00:00.000Z',
    )).toBe(false)
    expect(shouldDefaultToPersonalAfterRetryHydration(
      true,
      true,
      false,
      [dueItem],
      '2026-07-23T00:00:00.000Z',
    )).toBe(false)
  })

  it('opens a real Tactics Sprint first and keeps other trainers out of the active panel', () => {
    const markup = renderToStaticMarkup(
      <TrainingWorkspace
        tacticProgress={createTacticProgress()}
        onRecordTacticAttempt={vi.fn().mockResolvedValue(undefined)}
        retryItems={[]}
        requestedRetryKey={null}
        onSaveRetryItem={vi.fn().mockResolvedValue(undefined)}
        onDeleteRetryItem={vi.fn().mockResolvedValue(undefined)}
        onBackToReview={vi.fn()}
        onOpenReview={vi.fn()}
      />,
    )

    expect(markup).toContain('role="tablist"')
    expect(markup).toContain('Tactics Sprint')
    expect(markup).toContain('From your games')
    expect(markup).toContain('Board vision')
    expect(markup).toContain('aria-selected="true"')
    expect(markup).toContain('Puzzle 1 of 3')
    expect(markup).not.toContain('Your review queue is clear')
    expect(markup).not.toContain('Click ')
  })

  it('keeps the personal queue honest while its saved positions are preparing locally', () => {
    const markup = renderToStaticMarkup(
      <TrainingWorkspace
        tacticProgress={createTacticProgress()}
        onRecordTacticAttempt={vi.fn().mockResolvedValue(undefined)}
        retryItems={[]}
        retryHistoryLoading
        requestedRetryKey="retry-1234567890123456-1"
        onSaveRetryItem={vi.fn().mockResolvedValue(undefined)}
        onDeleteRetryItem={vi.fn().mockResolvedValue(undefined)}
        onBackToReview={vi.fn()}
        onOpenReview={vi.fn()}
      />,
    )

    expect(markup).toContain('Preparing your saved practice locally…')
    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain('Personal positions preparing')
    expect(markup).not.toContain('Your review queue is clear')
  })

  it('keeps the starter tactics out of view until local progress is ready', () => {
    const markup = renderToStaticMarkup(
      <TrainingWorkspace
        tacticProgress={createTacticProgress()}
        onRecordTacticAttempt={vi.fn().mockResolvedValue(undefined)}
        tacticsHistoryLoading
        retryItems={[]}
        requestedRetryKey={null}
        onSaveRetryItem={vi.fn().mockResolvedValue(undefined)}
        onDeleteRetryItem={vi.fn().mockResolvedValue(undefined)}
        onBackToReview={vi.fn()}
        onOpenReview={vi.fn()}
      />,
    )

    expect(markup).toContain('Preparing your local tactics…')
    expect(markup).toContain('aria-busy="true"')
    expect(markup).not.toContain('Puzzle 1 of 3')
  })

  it('does not describe unreadable local practice history as empty', () => {
    const personalMarkup = renderToStaticMarkup(
      <TrainingWorkspace
        tacticProgress={createTacticProgress()}
        onRecordTacticAttempt={vi.fn().mockResolvedValue(undefined)}
        retryItems={[]}
        retryHistoryError
        requestedRetryKey="retry-1234567890123456-1"
        onSaveRetryItem={vi.fn().mockResolvedValue(undefined)}
        onDeleteRetryItem={vi.fn().mockResolvedValue(undefined)}
        onBackToReview={vi.fn()}
        onOpenReview={vi.fn()}
        onRetryRetryHistory={vi.fn()}
      />,
    )

    expect(personalMarkup).toContain('Couldn’t open your saved practice')
    expect(personalMarkup).toContain('role="alert"')
    expect(personalMarkup).toContain('Try again')
    expect(personalMarkup).not.toContain('Your review queue is clear')
  })
})
