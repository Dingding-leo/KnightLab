import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  AnalysisWorkspace,
  CoachEvidenceCard,
  RetryPracticeButton,
  RetrySaveNotice,
  ReviewSaveNotice,
} from './AnalysisWorkspace'
import { createPgnTimeline } from '../analysis/analysisModel'
import { resolvePlayPreviewReviewPly } from '../review/playPreviewReviewTarget'
import type { CoachGuidance } from '../review/coach'
import { saveCompletedReviewInBackground } from '../review/backgroundReviewSave'
import type { PersistedReview } from '../review/reviewPersistence'
import type { RetryItem } from '../review/retry'
import { saveRetryItemsSerially } from '../review/retryQueuePersistence'
import { evidenceSquaresForGuidance, reviewNavigationForKey, reviewPlyAfter } from '../review/reviewWorkspaceUtils'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const persistedReview = { reviewKey: '0123456789abcdef' } as PersistedReview

function retryItem(retryKey: string): RetryItem {
  return {
    schemaVersion: 1,
    retryKey,
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
}

describe('analysis workspace convenience contracts', () => {
  it('opens an exact Play preview position only when the Review timeline still matches it', () => {
    const beforeReply = createPgnTimeline('1. e4 e5 2. Nf3')
    const timeline = createPgnTimeline('1. e4 e5 2. Nf3 Nc6')
    const target = { sourcePly: 2, expectedFen: beforeReply.positions[2].fen }

    // A later bot reply extends the timeline but does not invalidate its
    // already identical historical prefix.
    expect(timeline.moves).toHaveLength(beforeReply.moves.length + 1)
    expect(resolvePlayPreviewReviewPly(timeline, target)).toBe(2)
    expect(resolvePlayPreviewReviewPly(timeline, { ...target, expectedFen: timeline.positions[3].fen })).toBeNull()
    expect(resolvePlayPreviewReviewPly(timeline, { ...target, sourcePly: 0 })).toBeNull()
    expect(resolvePlayPreviewReviewPly(timeline, { ...target, sourcePly: 9 })).toBeNull()

    const markup = renderToStaticMarkup(
      <AnalysisWorkspace
        desktop={false}
        currentPgn="1. e4 e5 2. Nf3 Nc6"
        enginePath={null}
        threads={1}
        hashMb={64}
        requestedPlayPreviewTarget={target}
      />,
    )
    expect(markup).toContain('Position 2 of 4')
  })

  it('makes browser Stockfish analysis and replay available without the desktop runtime', () => {
    const markup = renderToStaticMarkup(
      <AnalysisWorkspace
        desktop={false}
        currentPgn={'1. e4 e5 2. Nf3 Nc6'}
        enginePath={null}
        threads={1}
        hashMb={64}
      />,
    )

    expect(markup).toContain('Analysis board')
    expect(markup).toContain('Load current game')
    expect(markup).toContain('Choose a local .pgn or .fen file')
    expect(markup).toContain('id="analysis-file"')
    expect(markup).toContain('tabindex="-1"')
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain('Copy current FEN')
    expect(markup).toContain('Download FEN')
    expect(markup).toContain('Copy PGN')
    expect(markup).toContain('Download PGN')
    expect(markup).toContain('aria-label="First position"')
    expect(markup).toContain('aria-label="Previous position"')
    expect(markup).toContain('aria-label="Next position"')
    expect(markup).toContain('aria-label="Last position"')
    expect(markup).toContain('class="analysis-mobile-move-picker"')
    expect(markup).toContain('aria-label="Jump to a game position"')
    expect(markup).toContain('<option value="0">Start position</option>')
    expect(markup).toContain('<option value="1">1. e4</option>')
    expect(markup).toContain('<option value="2">1… e5</option>')
    expect(markup).toContain('class="analysis-moves" aria-label="Game moves"')
    expect(markup.indexOf('analysis-navigation')).toBeLessThan(markup.indexOf('analysis-mobile-move-picker'))
    expect(markup.indexOf('analysis-mobile-move-picker')).toBeLessThan(markup.indexOf('analysis-transfer'))
    expect(markup).toContain('Review full game')
    expect(markup).toContain('Stockfish WebAssembly runs locally in this browser')
    expect(markup).toContain('analysis-switch')
    expect(markup).not.toContain('Desktop Stockfish required')
    expect(markup).toContain('e4')
    expect(markup).toContain('Nc6')
  })

  it('recognises a terminal position without reporting an engine failure', () => {
    const markup = renderToStaticMarkup(
      <AnalysisWorkspace
        desktop
        currentPgn="1. f3 e5 2. g4 Qh4# 0-1"
        enginePath={null}
        threads={1}
        hashMb={64}
      />,
    )
    expect(markup).toContain('No legal continuation')
    expect(markup).not.toContain('Engine unavailable')
  })

  it('defers optional review work while a live bot move is using the engine', () => {
    const markup = renderToStaticMarkup(
      <AnalysisWorkspace
        desktop={false}
        engineBusy
        currentPgn="1. e4 e5"
        enginePath={null}
        threads={1}
        hashMb={16}
      />,
    )
    expect(markup).toContain('Analysis is waiting for the bot')
    expect(markup).toContain('The live bot move has priority')
    expect(markup).toContain('disabled=""')
  })
})

describe('full-review background persistence', () => {
  it('shows a brief saving status without replacing the completed review', () => {
    expect(renderToStaticMarkup(<ReviewSaveNotice saving />)).toContain('Saving review privately on this device')
    expect(renderToStaticMarkup(<ReviewSaveNotice saving={false} />)).toBe('')
  })

  it('waits for storage in the background before reporting success', async () => {
    const pending = deferred<void>()
    const save = vi.fn(() => pending.promise)
    const onPersisted = vi.fn()
    const onSaved = vi.fn()
    const onFailed = vi.fn()

    const task = saveCompletedReviewInBackground({
      save,
      record: persistedReview,
      isCurrent: () => true,
      onPersisted,
      onSaved,
      onFailed,
    })

    expect(save).toHaveBeenCalledWith(persistedReview)
    expect(onSaved).not.toHaveBeenCalled()
    expect(onFailed).not.toHaveBeenCalled()

    pending.resolve(undefined)
    await task

    expect(onPersisted).toHaveBeenCalledOnce()
    expect(onPersisted).toHaveBeenCalledWith(persistedReview)
    expect(onSaved).toHaveBeenCalledOnce()
    expect(onSaved).toHaveBeenCalledWith(persistedReview)
    expect(onFailed).not.toHaveBeenCalled()
  })

  it('reports a current save failure without a false saved notification', async () => {
    const failure = new Error('storage is full')
    const onPersisted = vi.fn()
    const onSaved = vi.fn()
    const onFailed = vi.fn()

    await saveCompletedReviewInBackground({
      save: async () => { throw failure },
      record: persistedReview,
      isCurrent: () => true,
      onPersisted,
      onSaved,
      onFailed,
    })

    expect(onPersisted).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(onFailed).toHaveBeenCalledOnce()
    expect(onFailed).toHaveBeenCalledWith(failure)
  })

  it('notifies durable metadata but keeps late UI completions silent after a newer run or unmount', async () => {
    const staleSave = deferred<void>()
    const unmountedSave = deferred<void>()
    let runCurrent = true
    let mounted = true
    const onPersisted = vi.fn()
    const onSaved = vi.fn()
    const onFailed = vi.fn()

    const staleTask = saveCompletedReviewInBackground({
      save: () => staleSave.promise,
      record: persistedReview,
      isCurrent: () => runCurrent,
      onPersisted,
      onSaved,
      onFailed,
    })
    runCurrent = false
    staleSave.resolve(undefined)

    const unmountedTask = saveCompletedReviewInBackground({
      save: () => unmountedSave.promise,
      record: persistedReview,
      isCurrent: () => mounted,
      onPersisted,
      onSaved,
      onFailed,
    })
    mounted = false
    unmountedSave.reject(new Error('late write'))

    await Promise.all([staleTask, unmountedTask])
    expect(onPersisted).toHaveBeenCalledOnce()
    expect(onPersisted).toHaveBeenCalledWith(persistedReview)
    expect(onSaved).not.toHaveBeenCalled()
    expect(onFailed).not.toHaveBeenCalled()
  })

  it('keeps a callback exception from becoming an unhandled background task', async () => {
    await expect(saveCompletedReviewInBackground({
      save: async () => undefined,
      record: persistedReview,
      isCurrent: () => true,
      onPersisted: () => { throw new Error('library callback failed') },
      onSaved: () => { throw new Error('library callback failed') },
      onFailed: () => { throw new Error('failure callback failed') },
    })).resolves.toBeUndefined()
  })
})

describe('review-to-train handoff feedback', () => {
  it('changes the active practice label, announces progress, and disables both actions while saving', () => {
    const markup = renderToStaticMarkup(
      <>
        <RetryPracticeButton action="batch" savingAction="batch" onClick={() => undefined} />
        <RetryPracticeButton action="single" savingAction="batch" onClick={() => undefined} />
        <RetrySaveNotice action="batch" />
      </>,
    )

    expect(markup).toContain('Preparing key moments…')
    expect(markup).toContain('Practice this position')
    expect(markup).toContain('Preparing key moments for your training queue on this device…')
    expect(markup).toContain('role="status"')
    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('aria-busy="true"')
    expect(markup.match(/disabled=""/g)).toHaveLength(2)
  })

  it('keeps an earlier saved moment visible when a later serial write fails', async () => {
    const first = retryItem('0123456789abcdef:4')
    const second = retryItem('0123456789abcdef:6')
    const failure = new Error('storage is full')
    const events: string[] = []
    const onRetriesSaved = vi.fn((items: RetryItem[]) => {
      events.push(`published:${items[0].retryKey}`)
    })
    const onOpenRetryQueue = vi.fn((retryKey: string) => {
      events.push(`open:${retryKey}`)
    })

    const result = await saveRetryItemsSerially({
      items: [first, second],
      retryStore: {
        load: async (retryKey) => {
          events.push(`load:${retryKey}`)
          return null
        },
        save: async (item) => {
          events.push(`save:${item.retryKey}`)
          if (item.retryKey === second.retryKey) throw failure
        },
      },
      onRetriesSaved,
      onOpenRetryQueue,
    })

    expect(result.saved).toEqual([first])
    expect(result.error).toBe(failure)
    expect(events).toEqual([
      `load:${first.retryKey}`,
      `save:${first.retryKey}`,
      `published:${first.retryKey}`,
      `load:${second.retryKey}`,
      `save:${second.retryKey}`,
    ])
    expect(onOpenRetryQueue).not.toHaveBeenCalled()
  })
})

describe('coach evidence convenience contracts', () => {
  const guidance: CoachGuidance = {
    summary: 'Qh4 missed the forcing check Qe5+.',
    focus: 'Check forcing moves before committing to a quiet queen move.',
    continuation: ['Qe5+', 'Kd7'],
    evidence: [{
      kind: 'forcing-check',
      statement: 'Qe5+ checks the black king on e8 and forces a response.',
      squares: ['e5', 'e8'],
    }],
  }

  it('renders concrete coach evidence with a next-focus instruction', () => {
    const markup = renderToStaticMarkup(<CoachEvidenceCard guidance={guidance} />)

    expect(markup).toContain('aria-label="Coach&#x27;s evidence"')
    expect(markup).toContain('Qe5+')
    expect(markup).toContain('Focus next time')
    expect(markup).toContain('e8')
  })

  it('stays quiet when a selected move has no eligible error guidance', () => {
    expect(renderToStaticMarkup(<CoachEvidenceCard guidance={null} />)).toBe('')
  })

  it('labels an honest move comparison when no board evidence can be proved', () => {
    const markup = renderToStaticMarkup(<CoachEvidenceCard guidance={{ ...guidance, evidence: [] }} />)
    expect(markup).toContain('aria-label="Coach&#x27;s comparison"')
    expect(markup).toContain('Coach&#x27;s comparison')
  })

  it('maps only concrete coach evidence squares to the board', () => {
    expect([...evidenceSquaresForGuidance(guidance)]).toEqual(['e5', 'e8'])
    expect([...evidenceSquaresForGuidance({ ...guidance, evidence: [] })]).toEqual([])
    expect([...evidenceSquaresForGuidance({
      ...guidance,
      evidence: [...guidance.evidence, { ...guidance.evidence[0], squares: ['e5'] }],
    })]).toEqual(['e5', 'e8'])
  })

  it('maps unmodified replay keys while leaving editable and browser shortcuts alone', () => {
    expect(reviewNavigationForKey({ key: 'ArrowLeft' })).toBe('previous')
    expect(reviewNavigationForKey({ key: 'ArrowRight' })).toBe('next')
    expect(reviewNavigationForKey({ key: 'Home' })).toBe('first')
    expect(reviewNavigationForKey({ key: 'End' })).toBe('last')
    expect(reviewNavigationForKey({ key: 'ArrowRight', editable: true })).toBeNull()
    expect(reviewNavigationForKey({ key: 'ArrowRight', metaKey: true })).toBeNull()
    expect(reviewNavigationForKey({ key: 'ArrowRight', ctrlKey: true })).toBeNull()
    expect(reviewNavigationForKey({ key: 'ArrowRight', altKey: true })).toBeNull()
    expect(reviewNavigationForKey({ key: 'ArrowRight', shiftKey: true })).toBeNull()
    expect(reviewPlyAfter('previous', 0, 12)).toBe(0)
    expect(reviewPlyAfter('next', 12, 12)).toBe(12)
    expect(reviewPlyAfter('first', 8, 12)).toBe(0)
    expect(reviewPlyAfter('last', 8, 12)).toBe(12)
  })
})
