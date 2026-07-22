import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

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
})

describe('local transfer convenience contracts', () => {
  it('labels PGN and current-position actions explicitly instead of leaving ambiguous copy/export controls', () => {
    const markup = renderApp()

    expect(markup).toContain('Copy PGN')
    expect(markup).toContain('Download PGN')
    expect(markup).toContain('Share current position')
    expect(markup).toContain('Copy current FEN')
    expect(markup).toContain('Download FEN')
  })
})

describe('workspace handoff accessibility', () => {
  it('gives each primary workspace a labelled, focusable title target', () => {
    const markup = renderApp()

    expect(markup).toContain('<main class="app-main" aria-labelledby="workspace-title">')
    expect(markup).toContain('<h1 id="workspace-title" tabindex="-1">Play</h1>')
  })
})
