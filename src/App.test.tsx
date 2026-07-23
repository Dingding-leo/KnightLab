import { renderToStaticMarkup } from 'react-dom/server'
import { Chess } from 'chess.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App, { LibraryResults, PromotionDialog } from './App'
import { cloneGameAtPly } from './domain/chess'
import { positionTransferFor } from './domain/positionTransfer'
import { hydrateActiveSessionRaw } from './storage/activeSessionHydration'
import type {
  ActiveSessionHydrationRequest,
  ActiveSessionHydrationResponse,
} from './storage/activeSessionHydrationProtocol'
import type { ActiveSession, StoredGame } from './storage/gameStore'

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

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function libraryGame(index: number): StoredGame {
  return {
    id: `game-${index}`,
    playedAt: `2026-07-23T00:${String(index % 60).padStart(2, '0')}:00.000Z`,
    mode: 'local',
    result: index % 2 ? '1-0' : '0-1',
    pgn: '1. e4 e5',
    finalFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    moveCount: 2,
    reviewed: index % 3 === 0,
  }
}

function repeatedKnightPgn(plies: number): string {
  const game = new Chess()
  const cycle = [
    { from: 'g1', to: 'f3' },
    { from: 'g8', to: 'f6' },
    { from: 'f3', to: 'g1' },
    { from: 'f6', to: 'g8' },
  ] as const
  for (let index = 0; index < plies; index += 1) game.move(cycle[index % cycle.length])
  return game.pgn()
}

function longSessionWithOpening(): ActiveSession {
  const game = new Chess()
  game.move('e4')
  game.move('e5')
  const cycle = [
    { from: 'g1', to: 'f3' },
    { from: 'b8', to: 'c6' },
    { from: 'f3', to: 'g1' },
    { from: 'c6', to: 'b8' },
  ] as const
  for (let index = 0; index < 1_024; index += 1) game.move(cycle[index % cycle.length])
  return {
    pgn: game.pgn(),
    startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    mode: 'bot',
    botLevel: 'balanced',
    orientation: 'white',
  }
}

class DeferredActiveSessionWorker {
  static instances: DeferredActiveSessionWorker[] = []

  onmessage: ((event: MessageEvent<ActiveSessionHydrationResponse>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  readonly messages: ActiveSessionHydrationRequest[] = []
  terminated = false

  constructor(_url?: string | URL, _options?: WorkerOptions) {
    DeferredActiveSessionWorker.instances.push(this)
  }

  postMessage(message: ActiveSessionHydrationRequest): void {
    this.messages.push(message)
  }

  terminate(): void {
    this.terminated = true
  }

  reply(response: ActiveSessionHydrationResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<ActiveSessionHydrationResponse>)
  }
}

async function flushMicrotasks(count = 8): Promise<void> {
  for (let index = 0; index < count; index += 1) await Promise.resolve()
}

describe('progressive library rendering', () => {
  it('mounts only the current page of a large filtered result set', () => {
    const markup = renderToStaticMarkup(
      <LibraryResults
        games={Array.from({ length: 500 }, (_, index) => libraryGame(index + 1))}
        revealCount={24}
        openingGameId={null}
        onRevealMore={() => {}}
        onReview={() => {}}
        onOpen={() => {}}
      />,
    )

    expect(markup.match(/class="library-game"/g)).toHaveLength(24)
    expect(markup).toContain('Showing 24 of 500 saved games')
    expect(markup).toContain('Show 24 more games')
  })
})

describe('bot player-side setup', () => {
  it('does not parse personal history while rendering the first Play board', () => {
    const getItem = vi.fn(() => null)
    vi.stubGlobal('localStorage', {
      getItem,
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })

    const markup = renderToStaticMarkup(<App />)

    expect(markup).toContain('aria-label="Chess board"')
    expect(getItem).not.toHaveBeenCalledWith('knightclub.retry-items.v1')
    expect(getItem).not.toHaveBeenCalledWith('knightclub.game-library.v1')
    expect(getItem).not.toHaveBeenCalledWith('knightclub.tactics-state.v1')
  })

  it('paints a recovery shell before replaying a long saved game', () => {
    const loadPgn = vi.spyOn(Chess.prototype, 'loadPgn')
    const pgn = repeatedKnightPgn(1_024)

    const markup = renderApp({
      pgn,
      startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      mode: 'bot',
      botLevel: 'balanced',
      orientation: 'white',
    })

    expect(pgn.length).toBeGreaterThan(2 * 1024)
    expect(markup).toContain('aria-label="Chess board"')
    expect(markup).toContain('Restoring your saved game')
    expect(markup).toContain('aria-busy="true"')
    expect(loadPgn).not.toHaveBeenCalled()
  })

  it('retries the newest bounded mirror after the original long-session Worker fails', async () => {
    const initial: ActiveSession = {
      pgn: repeatedKnightPgn(1_024),
      startFen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      mode: 'bot',
      botLevel: 'balanced',
      orientation: 'white',
    }
    const replacement = longSessionWithOpening()
    const initialRaw = JSON.stringify(initial)
    const replacementRaw = JSON.stringify(replacement)
    const records = new Map([[SESSION_KEY, initialRaw]])
    const setItem = vi.fn((key: string, value: string) => { records.set(key, value) })
    const removeItem = vi.fn((key: string) => { records.delete(key) })
    const capturedEffects: Array<() => void | (() => void)> = []
    const stateUpdates: unknown[] = []
    let cleanup: (() => void) | undefined

    expect(initialRaw.length).toBeGreaterThan(2 * 1024)
    expect(replacementRaw.length).toBeGreaterThan(2 * 1024)
    DeferredActiveSessionWorker.instances = []
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => records.get(key) ?? null,
      setItem,
      removeItem,
    })
    vi.stubGlobal('Worker', DeferredActiveSessionWorker)
    vi.resetModules()
    vi.doMock('react', async (importOriginal) => {
      const actual = await importOriginal<typeof import('react')>()
      return {
        ...actual,
        // The suite intentionally runs in Node without a DOM renderer. Capture
        // App's mount effects and run only the recovery effect below, while
        // retaining React's real state hooks for its closure behavior.
        useEffect(effect: () => void | (() => void), _dependencies?: unknown) {
          capturedEffects.push(effect)
        },
        useState<T>(initialState: T | (() => T)) {
          const [value, setValue] = actual.useState(initialState)
          return [value, (next: T | ((previous: T) => T)) => {
            stateUpdates.push(next)
            setValue(next)
          }]
        },
      }
    })

    try {
      const { default: HydrationApp } = await import('./App')
      const { renderToStaticMarkup: render } = await import('react-dom/server')
      render(<HydrationApp />)

      const restoreEffect = capturedEffects.find(
        (effect) => effect.toString().includes('hydrateStableBrowserActiveSession'),
      )
      if (!restoreEffect) throw new Error('Expected App to register its active-session recovery effect.')
      const effectCleanup = restoreEffect()
      cleanup = typeof effectCleanup === 'function' ? effectCleanup : undefined

      const firstWorker = DeferredActiveSessionWorker.instances[0]
      const firstRequest = firstWorker?.messages[0]
      expect(firstRequest).toMatchObject({ type: 'hydrate-active-session-raw', raw: initialRaw })
      if (!firstWorker || !firstRequest) throw new Error('Expected the initial long-session Worker request.')

      // A second tab has saved a newer legal game just as the old Worker fails.
      records.set(SESSION_KEY, replacementRaw)
      firstWorker.reply({
        type: 'error',
        id: firstRequest.id,
        message: 'The initial Worker response was interrupted.',
      })
      await flushMicrotasks()

      const replacementWorker = DeferredActiveSessionWorker.instances[1]
      const replacementRequest = replacementWorker?.messages[0]
      expect(firstWorker.terminated).toBe(true)
      expect(replacementRequest).toMatchObject({ type: 'hydrate-active-session-raw', raw: replacementRaw })
      if (!replacementWorker || !replacementRequest) throw new Error('Expected a recovery request for the newer mirror.')

      const replacementWire = hydrateActiveSessionRaw(replacementRaw)
      if (!replacementWire) throw new Error('Expected the replacement session to hydrate.')
      replacementWorker.reply({
        type: 'active-session-result',
        id: replacementRequest.id,
        hydrated: structuredClone(replacementWire),
      })
      await flushMicrotasks()

      const restoredGame = stateUpdates.find((value) => value instanceof Chess)
      expect(restoredGame).toBeInstanceOf(Chess)
      expect((restoredGame as Chess).history().slice(0, 2)).toEqual(['e4', 'e5'])
      expect(stateUpdates).toContain('ready')
      expect(removeItem).not.toHaveBeenCalled()
      expect(setItem).not.toHaveBeenCalled()
    } finally {
      cleanup?.()
      vi.doUnmock('react')
      vi.resetModules()
    }
  })

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
