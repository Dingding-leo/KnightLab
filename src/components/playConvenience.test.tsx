import { renderToStaticMarkup } from 'react-dom/server'
import { Chess } from 'chess.js'
import { describe, expect, it, vi } from 'vitest'
import { ChessBoard } from './ChessBoard'
import { MoveList } from './MoveList'
import { GameDecisionDialog } from './GameDecisionDialog'
import { EngineSettingsPanel } from './EngineSettingsPanel'
import { PlayPreviewNavigation } from './PlayPreviewNavigation'
import { DEFAULT_ENGINE_SETTINGS } from '../engine/engineSettings'

describe('board convenience contracts', () => {
  it('keeps the chess grid to one Tab stop so arrows can do the square-to-square navigation', () => {
    const markup = renderToStaticMarkup(
      <ChessBoard
        game={new Chess()}
        orientation="white"
        selected={null}
        legalTargets={new Set()}
        lastMove={null}
        onSquareClick={vi.fn()}
        onMoveAttempt={vi.fn()}
      />,
    )

    expect(markup.match(/tabindex="0"/g)).toHaveLength(1)
    expect(markup.match(/tabindex="-1"/g)).toHaveLength(63)
  })

  it('makes only the side-to-move pieces draggable', () => {
    const markup = renderToStaticMarkup(
      <ChessBoard
        game={new Chess()}
        orientation="white"
        selected={null}
        legalTargets={new Set()}
        lastMove={null}
        evidenceSquares={new Set(['e2'])}
        onSquareClick={vi.fn()}
        onMoveAttempt={vi.fn()}
      />,
    )

    expect(markup.match(/data-draggable="true"/g)).toHaveLength(16)
    expect(markup).toContain('data-square="e2"')
    expect(markup).toContain('square--evidence')
    expect(markup).toContain('data-evidence="true"')
    expect(markup).toContain('aria-label="e2 white pawn, coach evidence"')
    expect(markup).toContain('aria-label="Chess board. Coach evidence highlighted on e2."')
  })

  it('keeps the human pieces interactive and announces a queued premove during a bot turn', () => {
    const game = new Chess()
    game.move('e4')
    const markup = renderToStaticMarkup(
      <ChessBoard
        game={game}
        orientation="white"
        selected={null}
        legalTargets={new Set(['f3'])}
        lastMove={null}
        interactionColor="w"
        premove={{ from: 'g1', to: 'f3' }}
        premoveMode
        onSquareClick={vi.fn()}
        onMoveAttempt={vi.fn()}
      />,
    )

    expect(markup).toMatch(/data-square="e4"[^>]*data-draggable="true"|data-draggable="true"[^>]*data-square="e4"/)
    expect(markup).toContain('data-premove="from"')
    expect(markup).toContain('data-premove="to"')
    expect(markup).toContain('data-premove-preview="true"')
    expect(markup).toContain('queued premove source')
    expect(markup).toContain('f3, premove preview')
    expect(markup).toContain('Destination markers are premove previews; final legality is checked after the bot move.')
  })
})

describe('move history convenience contracts', () => {
  it('renders clickable SAN controls and identifies the currently displayed position', () => {
    const markup = renderToStaticMarkup(
      <MoveList
        moves={['e4', 'e5', 'Nf3']}
        activePly={1}
        followingLatest={false}
        onSelectPly={vi.fn()}
      />,
    )

    expect(markup).toContain('aria-live="polite"')
    expect(markup).toContain('aria-current="step"')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('aria-label="View position after 1. e4"')
    expect(markup).toContain('aria-label="View position after 1... e5"')
    expect(markup).toContain('aria-label="View position after 2. Nf3"')
    expect(markup).toContain('data-ply="1"')
    expect(markup).toContain('data-ply="2"')
    expect(markup).toContain('data-ply="3"')
    expect(markup).toContain('Nf3')
    expect(markup).not.toContain('move-list__show-earlier')
  })

  it('pins an early preview move while keeping a long notation list bounded', () => {
    const moves = Array.from({ length: 200 }, (_, index) => `m${index + 1}`)
    const markup = renderToStaticMarkup(
      <MoveList
        moves={moves}
        activePly={1}
        followingLatest={false}
        onSelectPly={vi.fn()}
      />,
    )

    expect(markup).toContain('Show 40 earlier moves')
    expect(markup).toContain('class="move-list__show-earlier"')
    expect(markup).toContain('aria-label="Show 40 earlier moves; 59 earlier moves hidden"')
    expect(markup).toContain('data-ply="1"')
    expect(markup).toContain('aria-current="step"')
    expect(markup).toContain('data-ply="200"')
    expect(markup).not.toContain('data-ply="3"')
    expect(markup.match(/data-ply="/g)).toHaveLength(82)
  })
})

describe('historical Play preview convenience contracts', () => {
  it('keeps step controls labelled and exposes a clear return to the live board', () => {
    const markup = renderToStaticMarkup(
      <PlayPreviewNavigation
        ply={2}
        maxPly={5}
        onPrevious={vi.fn()}
        onNext={vi.fn()}
        onReviewPosition={vi.fn()}
        onReturnToLive={vi.fn()}
      />,
    )

    expect(markup).toContain('role="group"')
    expect(markup).toContain('aria-label="Historical position navigation"')
    expect(markup).toContain('title="Use Left and Right Arrow keys to step through history."')
    expect(markup).toContain('>Previous<')
    expect(markup).toContain('Move 2 of 5')
    expect(markup).toContain('>Next<')
    expect(markup).toContain('Review this position')
    expect(markup).toContain('Return to live')
  })
})

describe('game decision convenience contracts', () => {
  it('renders an explicit, keyboard-safe resignation confirmation', () => {
    const markup = renderToStaticMarkup(
      <GameDecisionDialog
        decision={{ kind: 'resign', actor: 'w', resumeAfter: true }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(markup).toContain('role="alertdialog"')
    expect(markup).toContain('aria-describedby="decision-description"')
    expect(markup).toContain('autofocus=""')
    expect(markup).toContain('White will resign')
    expect(markup).toContain('Keep playing')
  })

  it('guards an unfinished game before replacing it with new settings', () => {
    const markup = renderToStaticMarkup(
      <GameDecisionDialog
        decision={{
          kind: 'restart',
          title: 'Start a new game?',
          description: 'Your unfinished game will remain on this board unless you confirm.',
          confirmLabel: 'Use Blitz · 5 min',
          resumeAfter: true,
        }}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(markup).toContain('Start a new game?')
    expect(markup).toContain('Use Blitz · 5 min')
    expect(markup).toContain('Keep playing')
  })
})

describe('engine settings convenience contracts', () => {
  it('labels every custom resource control and reports verification state', () => {
    const markup = renderToStaticMarkup(
      <EngineSettingsPanel
        settings={{ ...DEFAULT_ENGINE_SETTINGS, profile: 'custom' }}
        desktop
        status={{ kind: 'ready', engineName: 'Stockfish 18', enginePath: '/opt/homebrew/bin/stockfish' }}
        onChange={vi.fn()}
        onChooseExecutable={vi.fn()}
        onUseAutomatic={vi.fn()}
        onVerify={vi.fn()}
      />,
    )

    expect(markup).toContain('Engine settings')
    expect(markup).toContain('aria-label="Engine profile"')
    expect(markup).toContain('Choose executable')
    expect(markup).toContain('Threads')
    expect(markup).toContain('Hash memory')
    expect(markup).toContain('Search depth')
    expect(markup).toContain('Node limit')
    expect(markup).toContain('role="status"')
    expect(markup).toContain('Stockfish 18')
  })
})
