import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import {
  AnalysisWorkspace,
  CoachEvidenceCard,
  ReviewSaveNotice,
} from './AnalysisWorkspace'
import type { CoachGuidance } from '../review/coach'
import { saveCompletedReviewInBackground } from '../review/backgroundReviewSave'
import type { PersistedReview } from '../review/reviewPersistence'
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

describe('analysis workspace convenience contracts', () => {
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
    expect(markup).toContain('aria-label="Previous position"')
    expect(markup).toContain('aria-label="Next position"')
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
