import { renderToStaticMarkup } from 'react-dom/server'
import { Chess } from 'chess.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App, { PromotionDialog } from './App'
import { cloneGameAtPly } from './domain/chess'
import { positionTransferFor } from './domain/positionTransfer'

const SESSION_KEY = 'knightclub.active-session.v1'

function renderApp(session?: Record<string, unknown>): string {
  const records = new Map<string, string>()
  if (session) records.set(SESSION_KEY, JSON.stringify(session))
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => records.get(key) ?? null,
    setItem: (key: string, value: string) => { records.set(key, value) },
    removeItem: (key: string) => { records.delete(key) },
  })
  return renderToStaticMarkup(<App />)
}

afterEach(() => vi.unstubAllGlobals())

describe('bot player-side setup', () => {
  it('presents accessible White, Black and Random choices for a fresh game', () => {
    const markup = renderApp()

    expect(markup).toContain('<details class="game-setup" open="">')
    expect(markup).toContain('Game setup')
    expect(markup).toContain('Rowan Pike · You: White')
    expect(markup).toContain('aria-label="Play as"')
    expect(markup).toContain('>White<')
    expect(markup).toContain('>Black<')
    expect(markup).toContain('>Random<')
    expect(markup).toContain('You are White')
    expect(markup).toContain('Clock starts with the opening move.')
    expect(markup).toContain('Choose a local opponent')
    expect(markup).toContain('Mira Vale')
    expect(markup).toContain('Rowan Pike')
    expect(markup).toContain('Nia Cross')
  })

  it('makes the first playable bot move explicit without changing side-neutral states', () => {
    const freshMarkup = renderApp()

    expect(freshMarkup).toContain('>Your move</span>')
    expect(freshMarkup).toContain('aria-label="Your move — choose a piece to begin."')
    expect(freshMarkup).toContain('title="Your move — choose a piece to begin."')

    const continuingMarkup = renderApp({
      pgn: '1. e4 e5',
      startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      mode: 'bot',
      botLevel: 'balanced',
      orientation: 'white',
      humanColor: 'w',
      colorChoice: 'white',
    })
    expect(continuingMarkup).toContain('>Your move · Rowan Pike played e5</span>')
    expect(continuingMarkup).toContain('role="status"')
    expect(continuingMarkup).toContain('aria-live="polite"')
    expect(continuingMarkup).toContain('aria-atomic="true"')
    expect(continuingMarkup).toContain('aria-label="Your move — Rowan Pike played e5. Choose a piece to continue."')

    const blackMarkup = renderApp({
      pgn: '',
      startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      mode: 'bot',
      botLevel: 'balanced',
      orientation: 'black',
      humanColor: 'b',
      colorChoice: 'black',
    })
    expect(blackMarkup).toContain('>Rowan Pike is thinking — queue one premove.</span>')
    expect(blackMarkup).not.toContain('>Your move</span>')

    const blackTurnMarkup = renderApp({
      pgn: '1. e4',
      startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      mode: 'bot',
      botLevel: 'balanced',
      orientation: 'black',
      humanColor: 'b',
      colorChoice: 'black',
    })
    expect(blackTurnMarkup).toContain('>Your move · Rowan Pike played e4</span>')
    expect(blackTurnMarkup).toContain('aria-label="Your move — Rowan Pike played e4. Choose a piece to continue."')

    const hotSeatMarkup = renderApp({
      pgn: '',
      startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      mode: 'local',
      botLevel: 'balanced',
      orientation: 'white',
      humanColor: 'w',
      colorChoice: 'white',
    })
    expect(hotSeatMarkup).toContain('>White to move</span>')
    expect(hotSeatMarkup).not.toContain('>Your move</span>')

    const checkedMarkup = renderApp({
      pgn: '',
      startFen: '4r1k1/8/8/8/8/8/8/4K3 w - - 0 1',
      mode: 'bot',
      botLevel: 'balanced',
      orientation: 'white',
      humanColor: 'w',
      colorChoice: 'white',
    })
    expect(checkedMarkup).toContain('>White to move — check</span>')
    expect(checkedMarkup).not.toContain('>Your move</span>')
  })

  it('collapses setup for an in-progress game while keeping completion actions visible', () => {
    const markup = renderApp({
      pgn: '1. e4 e5',
      startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      mode: 'bot',
      botLevel: 'balanced',
      orientation: 'white',
      humanColor: 'w',
      colorChoice: 'white',
    })

    expect(markup).toContain('<details class="game-setup">')
    expect(markup).not.toContain('<details class="game-setup" open="">')
    expect(markup).toContain('Rowan Pike · You: White')
    expect(markup).not.toContain('Choose a local opponent')
    expect(markup).toContain('aria-label="Game completion actions"')
    expect(markup).toContain('Offer draw')
    expect(markup).toContain('Resign')
  })

  it('restores a persisted Black-side bot session without redrawing its random choice', () => {
    const markup = renderApp({
      pgn: '',
      startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      mode: 'bot',
      botLevel: 'balanced',
      orientation: 'black',
      humanColor: 'b',
      colorChoice: 'random',
    })

    expect(markup).toContain('Random draw · Black')
    expect(markup).toContain('The draw resolved to Black. Start a new game to draw again.')
    expect(markup).toContain('You: Black')
    expect(markup).toContain('Playing Black')
    expect(markup).toContain('Premove mode: choose one black move while the bot thinks.')
    expect(markup).toContain('Rowan Pike')
  })

  it('keeps a restored custom control editable at its saved values', () => {
    const markup = renderApp({
      pgn: '',
      startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      mode: 'bot',
      botLevel: 'balanced',
      orientation: 'white',
      humanColor: 'w',
      colorChoice: 'white',
      timeControl: {
        id: 'custom-420000-3000-2000',
        label: 'Custom · 7 min · +3 · 2s delay',
        category: 'custom',
        initialMs: 420_000,
        incrementMs: 3_000,
        delayMs: 2_000,
      },
    })

    expect(markup).toContain('aria-label="Custom time control"')
    expect(markup).toContain('min="0.1" max="1440" step="0.1" value="7"')
    expect(markup).toContain('min="0" max="600" value="3"')
    expect(markup).toContain('min="0" max="600" value="2"')
  })
})

describe('local transfer convenience contracts', () => {
  it('labels PGN and current-position actions explicitly instead of leaving ambiguous copy/export controls', () => {
    const markup = renderApp()

    expect(markup).toContain('aria-label="Game actions"')
    expect(markup).toContain('>Undo</span>')
    expect(markup).toContain('>New game</span>')
    expect(markup).toContain('>Pause</span>')
    expect(markup).toContain('Copy PGN')
    expect(markup).toContain('Download PGN')
    expect(markup).toContain('board-toolbar__game-action')
    expect(markup).toContain('board-toolbar__transfer-action')
    expect(markup).toContain('Share current position')
    expect(markup).toContain('Copy current FEN')
    expect(markup).toContain('Download FEN')
  })

  it('exports the position currently displayed by a historical preview', () => {
    const game = new Chess()
    game.move('e4')
    game.move('e5')
    const preview = cloneGameAtPly(new Chess().fen(), game.history({ verbose: true }), 1)

    const displayed = positionTransferFor(preview, true)
    const live = positionTransferFor(game, false)

    expect(displayed.fen).toBe(preview.fen())
    expect(displayed.fen).not.toBe(live.fen)
    expect(displayed.contextLabel).toBe('Share displayed position')
    expect(displayed.copyLabel).toBe('Copy displayed FEN')
    expect(displayed.downloadSuccess).toBe('Displayed FEN download started.')
    expect(live.contextLabel).toBe('Share current position')
    expect(live.copyLabel).toBe('Copy current FEN')
  })
})

describe('workspace handoff accessibility', () => {
  it('gives each primary workspace a labelled, focusable title target', () => {
    const markup = renderApp()

    expect(markup).toContain('<main class="app-main" aria-labelledby="workspace-title">')
    expect(markup).toContain('<h1 id="workspace-title" tabindex="-1">Play</h1>')
  })
})

describe('promotion keyboard convenience', () => {
  it('focuses the natural promotion choice and exposes direct key choices', () => {
    const markup = renderToStaticMarkup(
      <PromotionDialog
        kind="move"
        choices={['q', 'r', 'b', 'n']}
        color="w"
        onChoose={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(markup).toContain('aria-describedby="promotion-shortcuts"')
    expect(markup).toContain('Press Q, R, B or N to choose Queen, Rook, Bishop or Knight. Press Escape to cancel.')
    expect(markup).toContain('aria-keyshortcuts="Q"')
    expect(markup).toContain('aria-keyshortcuts="R"')
    expect(markup).toContain('aria-label="Queen; press Q"')
    expect(markup.match(/autofocus=""/g)).toHaveLength(1)
  })
})
