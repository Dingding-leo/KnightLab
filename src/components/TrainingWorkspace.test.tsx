import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createTacticProgress } from '../tactics/tactics'
import { TrainingWorkspace } from './TrainingWorkspace'

describe('training workspace', () => {
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
})
