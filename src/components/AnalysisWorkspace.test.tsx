import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  AnalysisWorkspace,
  CoachEvidenceCard,
} from './AnalysisWorkspace'
import type { CoachGuidance } from '../review/coach'
import { evidenceSquaresForGuidance, reviewNavigationForKey, reviewPlyAfter } from '../review/reviewWorkspaceUtils'

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
