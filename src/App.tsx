import { Component, lazy, Suspense, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react'
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import {
  BarChart3,
  Bot,
  BrainCircuit,
  ChevronDown,
  CircleUserRound,
  Copy,
  Download,
  Flag,
  FlipHorizontal2,
  Gamepad2,
  Handshake,
  Library,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Swords,
  Target,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  type LucideIcon,
} from 'lucide-react'
import './App.css'
import { BotProfilePicker } from './components/BotProfilePicker'
import { ChessBoard } from './components/ChessBoard'
import { ClockRuntime } from './components/ClockRuntime'
import { useClockSnapshot } from './components/clockRuntimeContext'
import { EngineSettingsPanel, type EngineStatus } from './components/EngineSettingsPanel'
import { GameDecisionDialog, type GameDecision } from './components/GameDecisionDialog'
import { ChessPiece } from './components/ChessPiece'
import { MoveList } from './components/MoveList'
import { PlayPreviewNavigation } from './components/PlayPreviewNavigation'
import type { TacticsSprintResult } from './components/TacticsSprint'
import {
  cloneGame,
  completedPgn,
  evaluateMaterial,
  formatEvaluation,
  gameResult,
  gameStatus,
  hasMatingMaterial,
  legalMovesFrom,
  previewGameAtPly,
  STANDARD_START_FEN,
  type BotLevel,
  type GameMode,
  type MoveInput,
} from './domain/chess'
import {
  completeClockMove,
  createReadyClock,
  createCustomTimeControl,
  formatClock,
  getTimeControl,
  isTimeControl,
  isClockState,
  normalizeClockState,
  pauseClock,
  resumeClock,
  settleClock,
  snapshotClock,
  TIME_CONTROLS,
  type ClockState,
  type TimeControl,
} from './domain/clock'
import {
  agreedDraw,
  botAcceptsDraw,
  isGameTermination,
  resignation,
  timedOut,
  type GameTermination,
} from './domain/completion'
import {
  isBotTurn,
  isHumanColorChoice,
  isHumanTurn,
  oppositeColor,
  resolveHumanColor,
  shouldUndoBotReply,
  type HumanColorChoice,
} from './domain/playerSide'
import {
  applyPremoveToOwnedGame,
  canQueuePremove,
  premoveNeedsPromotion,
  queueablePremoveTargets,
  queuePremove,
  type QueuedPremove,
} from './domain/premove'
import { GameSoundPlayer, type GameSoundEvent } from './audio/gameSounds'
import { gameShortcutFor, promotionShortcutFor } from './domain/shortcuts'
import { copyText, downloadText } from './domain/textTransfer'
import { positionTransferFor } from './domain/positionTransfer'
import {
  playPreviewNavigationForKey,
  previewPlyAfter,
  previewPlyAfterShortcut,
  type PlayPreviewNavigation as PlayPreviewNavigationAction,
} from './domain/playPreview'
import { handoffWorkspace } from './domain/workspaceNavigation'
import { terminalSessionFingerprint } from './domain/libraryIdentity'
import {
  LIBRARY_PAGE_SIZE,
  progressiveLibraryResults,
  revealMoreLibraryResults,
} from './domain/libraryPagination'
import { HybridEngineClient, isTauriRuntime, type EngineSearchResult } from './engine/stockfishClient'
import { engineSettingsLabel, normalizeEngineSettings } from './engine/engineSettings'
import { playEngineFailureStatus, playEngineStatusUpdate } from './engine/playEngineStatus'
import { requestPlayMove } from './engine/playMoveRequest'
import {
  DEFAULT_BOT_PROFILE_ID,
  botOpeningReaction,
  botPostGameMessage,
  botStyleReaction,
  botProfileForId,
  isBotProfileId,
  profileForLegacyLevel,
  selectProfileCandidateMove,
  selectProfileOpeningMove,
  type BotProfileId,
  type BotProfileTone,
} from './bots/profiles'
import {
  clearActiveSession,
  clearLibrary,
  loadActiveSession,
  loadLibrary,
  markLibraryGamesReviewed,
  loadPreferences,
  mergeLibraryGames,
  normalizePreferences,
  saveActiveSession,
  saveGame,
  savePreferences,
  updateGame,
  type StoredGame,
} from './storage/gameStore'
import { DatabaseClient } from './storage/databaseClient'
import {
  createReviewKeyFromMoves,
  loadBrowserReview,
  saveBrowserReview,
  type PersistedReview,
} from './review/reviewPersistence'
import {
  deleteBrowserRetryItem,
  loadBrowserRetryItem,
  loadBrowserRetryItems,
  saveBrowserRetryItem,
} from './review/retryPersistence'
import { compareRetryItems, type RetryItem } from './review/retry'
import { SEED_TACTICS } from './tactics/seedPuzzles'
import type { TacticPuzzle } from './tactics/tactics'
import {
  loadBrowserTacticsState,
  mergeTacticsState,
  recordTacticsTerminalAttempt,
  saveBrowserTacticsState,
  tacticsStateToTacticProgress,
  type TacticsState,
} from './tactics/tacticsPersistence'

type Tab = 'play' | 'review' | 'train' | 'library' | 'insights'
type Promotion = { from: Square; to: Square; choices: PieceSymbol[]; kind: 'move' | 'premove' }
type DatabaseStatus = { kind: 'browser' | 'migrating' | 'ready' | 'recovered' | 'error'; message: string }
type LibraryLoadState = 'idle' | 'loading' | 'ready' | 'error'

const navItems: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: 'play', label: 'Play', icon: Gamepad2 },
  { id: 'review', label: 'Review', icon: Search },
  { id: 'train', label: 'Train', icon: Target },
  { id: 'library', label: 'Library', icon: Library },
  { id: 'insights', label: 'Insights', icon: BarChart3 },
]

const pageMeta: Record<Tab, { eyebrow: string; title: string; description: string }> = {
  play: { eyebrow: 'Local match', title: 'Play', description: 'A focused board for deliberate chess.' },
  review: { eyebrow: 'Post-game lab', title: 'Review', description: 'Turn a finished game into a useful lesson.' },
  train: { eyebrow: 'Daily practice', title: 'Train', description: 'Local tactics, personal review moments, and board vision drills.' },
  library: { eyebrow: 'On this device', title: 'Library', description: 'Your completed games, private and searchable.' },
  insights: { eyebrow: 'Performance', title: 'Insights', description: 'A clear view of your local playing history.' },
}

// Keep Play's first paint focused on the board. These workspaces pull in
// analysis, review and training code that a player does not need until they
// explicitly leave the board; module-level loaders let navigation prefetch
// them on hover or keyboard focus before the click happens.
const loadAnalysisWorkspace = () => import('./components/AnalysisWorkspace')
const loadTrainingWorkspace = () => import('./components/TrainingWorkspace')
const loadInsightsDashboard = () => import('./components/InsightsDashboard')

const AnalysisWorkspace = lazy(async () => ({ default: (await loadAnalysisWorkspace()).AnalysisWorkspace }))
const TrainingWorkspace = lazy(async () => ({ default: (await loadTrainingWorkspace()).TrainingWorkspace }))
const InsightsDashboard = lazy(async () => ({ default: (await loadInsightsDashboard()).InsightsDashboard }))

function preloadWorkspace(tab: Tab): void {
  if (tab === 'review') void loadAnalysisWorkspace()
  if (tab === 'train') void loadTrainingWorkspace()
  if (tab === 'insights') void loadInsightsDashboard()
}

function WorkspaceLoading({ label }: { label: string }) {
  return (
    <section className="workspace-loading content-card content-card--wide" aria-busy="true" role="status" aria-live="polite">
      <RefreshCw className="spin" size={20} aria-hidden="true" />
      <div>
        <strong>Opening {label}</strong>
        <span>The board stays ready while this local workspace loads.</span>
      </div>
    </section>
  )
}

class WorkspaceLoadBoundary extends Component<{ label: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <section className="workspace-loading workspace-loading--error content-card content-card--wide" role="alert">
        <RefreshCw size={20} aria-hidden="true" />
        <div>
          <strong>Couldn’t open {this.props.label}</strong>
          <span>A local workspace file is unavailable. Reload KnightClub to restore it.</span>
          <button className="secondary-button" type="button" onClick={() => window.location.reload()}>Reload KnightClub</button>
        </div>
      </section>
    )
  }
}

const QUICK_TIME_CONTROLS = [
  { control: getTimeControl('bullet-1'), shortLabel: '1 min' },
  { control: getTimeControl('blitz-3-2'), shortLabel: '3 | 2' },
  { control: getTimeControl('blitz-5'), shortLabel: '5 min' },
  { control: getTimeControl('rapid-10'), shortLabel: '10 min' },
] as const

// Search budgets stay deliberately modest. This floor is presentation-only:
// it keeps a light search from looking like an accidental instant move without
// keeping Stockfish on the CPU after it has already found an answer.
const BOT_MOVE_DISPLAY_FLOOR_MS: Readonly<Record<BotLevel, number>> = {
  easy: 260,
  balanced: 360,
  strong: 480,
}

function mergeRetryItems(...collections: ReadonlyArray<readonly RetryItem[]>): RetryItem[] {
  const byKey = new Map<string, RetryItem>()
  for (const collection of collections) {
    for (const item of collection) {
      const existing = byKey.get(item.retryKey)
      if (!existing || item.updatedAt >= existing.updatedAt) byKey.set(item.retryKey, item)
    }
  }
  return [...byKey.values()].sort(compareRetryItems)
}

/** Native tactics attempt IDs intentionally avoid answer data and unsafe characters. */
function createTacticsAttemptId(): string {
  const uuid = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().replaceAll('-', '')
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`
  return `attempt-${Date.now().toString(36)}-${uuid}`
}

const promotionNames: Partial<Record<PieceSymbol, string>> = {
  q: 'Queen',
  r: 'Rook',
  b: 'Bishop',
  n: 'Knight',
}

const premovePromotionChoices: PieceSymbol[] = ['q', 'r', 'b', 'n']

export interface PromotionDialogProps {
  kind: Promotion['kind']
  choices: readonly PieceSymbol[]
  color: Color
  onChoose: (piece: PieceSymbol) => void
  onCancel: () => void
}

/** Keeps a pawn promotion in the same keyboard flow as the move that reached it. */
export function PromotionDialog({ kind, choices, color, onChoose, onCancel }: PromotionDialogProps) {
  const defaultPiece = choices.includes('q') ? 'q' : choices[0]
  const title = kind === 'premove' ? 'Queue a promotion' : 'Choose a piece'

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-labelledby="promotion-title" aria-describedby="promotion-shortcuts">
      <div className="modal-card">
        <span className="eyebrow">{kind === 'premove' ? 'Premove promotion' : 'Pawn promotion'}</span>
        <h2 id="promotion-title">{title}</h2>
        <p id="promotion-shortcuts" className="sr-only">Press Q, R, B or N to choose Queen, Rook, Bishop or Knight. Press Escape to cancel.</p>
        <div className="promotion-grid">
          {choices.map((piece) => {
            const name = promotionNames[piece] ?? piece.toUpperCase()
            return (
              <button
                key={piece}
                type="button"
                autoFocus={piece === defaultPiece}
                aria-keyshortcuts={piece.toUpperCase()}
                aria-label={`${name}; press ${piece.toUpperCase()}`}
                onClick={() => onChoose(piece)}
              >
                <ChessPiece color={color} type={piece} />
                <span>{name}</span>
              </button>
            )
          })}
        </div>
        <button className="secondary-button" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

function restoreSession(
  session = loadActiveSession(),
  preferredProfileId: BotProfileId = DEFAULT_BOT_PROFILE_ID,
) {
  const fallbackControl = getTimeControl('unlimited')
  const fallback = () => {
    const now = Date.now()
    const profile = botProfileForId(preferredProfileId)
    return {
      game: new Chess(), startFen: STANDARD_START_FEN, mode: 'bot' as GameMode,
      botLevel: profile.engineLevel, botProfileId: profile.id, orientation: 'white' as const,
      humanColor: 'w' as Color, colorChoice: 'white' as HumanColorChoice,
      timeControl: fallbackControl, clock: createReadyClock(fallbackControl, 'w', now),
      clockHistory: [] as ClockState[], termination: null as GameTermination | null,
    }
  }
  if (!session) return fallback()
  try {
    if (typeof session.startFen !== 'string' || typeof session.pgn !== 'string') throw new Error('Invalid session')
    const game = new Chess(session.startFen)
    if (session.pgn.trim()) game.loadPgn(session.pgn)
    const timeControl = isTimeControl(session.timeControl) ? session.timeControl : fallbackControl
    const clock = normalizeClockState(session.clock, timeControl, game.turn(), Date.now())
    const clockHistory = Array.isArray(session.clockHistory)
      ? session.clockHistory.filter(isClockState)
      : []
    const humanColor: Color = session.humanColor === 'b' ? 'b' : 'w'
    const colorChoice = isHumanColorChoice(session.colorChoice)
      ? session.colorChoice
      : humanColor === 'b' ? 'black' : 'white'
    const profile = isBotProfileId(session.botProfileId)
      ? botProfileForId(session.botProfileId)
      : profileForLegacyLevel(session.botLevel)
    return {
      game, startFen: session.startFen,
      mode: (session.mode === 'local' ? 'local' : 'bot') as GameMode,
      botLevel: profile.engineLevel, botProfileId: profile.id,
      orientation: session.orientation === 'black' ? 'black' as const : 'white' as const,
      humanColor, colorChoice,
      timeControl, clock, clockHistory,
      termination: isGameTermination(session.termination) ? session.termination : null,
    }
  } catch {
    clearActiveSession()
    return fallback()
  }
}

function customTimeDraftFor(control: TimeControl) {
  if (control.category !== 'custom' || control.initialMs === null) {
    return { base: '10', increment: '0', delay: '0' }
  }
  return {
    base: String(control.initialMs / 60_000),
    increment: String(control.incrementMs / 1_000),
    delay: String(control.delayMs / 1_000),
  }
}

interface PlayerBarProps {
  color: 'white' | 'black'
  name: string
  detail: string
  active: boolean
  isBot: boolean
  botAvatar?: { initials: string; tone: BotProfileTone }
  thinking?: boolean
  paused: boolean
}

function PlayerBar({ color, name, detail, active, isBot, botAvatar, thinking, paused }: PlayerBarProps) {
  const snapshot = useClockSnapshot()
  const chessColor: Color = color === 'white' ? 'w' : 'b'
  const remaining = chessColor === 'w' ? snapshot.whiteMs : snapshot.blackMs
  const clock = formatClock(remaining)
  const lowTime = remaining !== null && remaining < 20_000
  const flagged = snapshot.flaggedColor === chessColor
  const Avatar = isBot ? Bot : CircleUserRound
  return (
    <div className={`player-bar ${active ? 'player-bar--active' : ''}`}>
      <div className={`player-avatar player-avatar--${color}${botAvatar ? ` player-avatar--${botAvatar.tone}` : ''}`}>
        {botAvatar ? <span aria-hidden="true">{botAvatar.initials}</span> : <Avatar size={20} strokeWidth={2.1} />}
      </div>
      <div className="player-copy">
        <strong>{name}</strong>
        <span>{detail}</span>
      </div>
      <output
        className={`chess-clock ${active ? 'chess-clock--active' : ''} ${lowTime ? 'chess-clock--low' : ''}`}
        aria-label={`${color} time ${clock}${paused && active ? ', paused' : ''}`}
      >{clock}</output>
      <div className="turn-indicator">
        <i />
        {flagged ? 'Flagged' : thinking ? 'Calculating…' : paused && active ? 'Paused' : active ? 'To move' : color}
      </div>
    </div>
  )
}

function profileForStoredGame(item: StoredGame) {
  return isBotProfileId(item.botProfileId)
    ? botProfileForId(item.botProfileId)
    : profileForLegacyLevel(item.botLevel)
}

function searchableLibraryText(item: StoredGame): string {
  const storedProfile = item.mode === 'bot' ? profileForStoredGame(item) : null
  return [
    item.result,
    item.mode === 'bot'
      ? `computer stockfish knightbot ${storedProfile?.name ?? ''} ${storedProfile?.openingCueLabel ?? ''} ${item.botLevel ?? ''} ${item.humanColor === 'b' ? 'black' : 'white'}`
      : 'hot-seat',
    item.timeControl?.label ?? '',
    new Date(item.playedAt).toLocaleString(),
  ].join(' ').toLowerCase()
}

interface LibraryResultsProps {
  games: readonly StoredGame[]
  revealCount: number
  onRevealMore: () => void
  onReview: (item: StoredGame) => void
  onOpen: (item: StoredGame) => void
}

/** Renders only a progressive page after the complete library has been filtered. */
export function LibraryResults({ games, revealCount, onRevealMore, onReview, onOpen }: LibraryResultsProps) {
  const page = progressiveLibraryResults(games, revealCount)
  const nextBatch = Math.min(LIBRARY_PAGE_SIZE, page.remainingCount)

  return (
    <>
      <div className="library-list">
        {page.items.map((item) => (
          <article key={item.id} className="library-game">
            <strong>{item.result}</strong>
            <div className="library-game__details">
              <span>{item.mode === 'bot' ? `Computer · ${profileForStoredGame(item).name} · You: ${item.humanColor === 'b' ? 'Black' : 'White'}` : 'Hot-seat'}</span>
              <small>{item.timeControl?.label ?? 'Unlimited'} · {new Date(item.playedAt).toLocaleString()} · {item.moveCount} ply</small>
            </div>
            <div className="library-game__state">{item.reviewed ? <em>Reviewed</em> : <span>Ready to review</span>}</div>
            <div className="library-game__actions">
              <button className="primary-button" type="button" onClick={() => onReview(item)}><Search size={15} />{item.reviewed ? 'Resume review' : 'Review'}</button>
              <button className="secondary-button" type="button" onClick={() => onOpen(item)}><Play size={15} />Open board</button>
            </div>
          </article>
        ))}
      </div>
      <div className="library-pagination">
        <p aria-live="polite">Showing {page.shownCount} of {page.totalCount} saved games</p>
        {nextBatch > 0 && <button className="secondary-button" type="button" onClick={onRevealMore}>Show {nextBatch} more game{nextBatch === 1 ? '' : 's'}</button>}
      </div>
    </>
  )
}

export default function App() {
  const initialPreferences = useMemo(loadPreferences, [])
  const initial = useMemo(
    () => restoreSession(loadActiveSession(), initialPreferences.botProfileId),
    [initialPreferences],
  )
  const desktop = useMemo(() => isTauriRuntime(), [])
  const database = useMemo(() => desktop ? new DatabaseClient() : null, [desktop])
  const [tab, setTab] = useState<Tab>('play')
  const [game, setGameState] = useState(initial.game)
  const [startFen, setStartFen] = useState(initial.startFen)
  const [mode, setMode] = useState<GameMode>(initial.mode)
  const [botLevel, setBotLevel] = useState<BotLevel>(initial.botLevel)
  const [botProfileId, setBotProfileId] = useState<BotProfileId>(initial.botProfileId)
  const [orientation, setOrientation] = useState<'white' | 'black'>(initial.orientation)
  const [humanColor, setHumanColor] = useState<Color>(initial.humanColor)
  const [colorChoice, setColorChoice] = useState<HumanColorChoice>(initial.colorChoice)
  const [timeControl, setTimeControl] = useState<TimeControl>(initial.timeControl)
  const [clock, setClock] = useState<ClockState>(initial.clock)
  const [clockHistory, setClockHistory] = useState<ClockState[]>(initial.clockHistory)
  const [termination, setTermination] = useState<GameTermination | null>(initial.termination)
  const [decision, setDecision] = useState<GameDecision | null>(null)
  const [soundsEnabled, setSoundsEnabled] = useState(initialPreferences.soundsEnabled)
  const [engineSettings, setEngineSettings] = useState(initialPreferences.engine)
  const [engineStatus, setEngineStatus] = useState<EngineStatus>(desktop
    ? { kind: 'idle', message: 'Loads on your first bot move or when you verify it.' }
    : { kind: 'idle', message: 'Loads locally on your first bot move or when you verify it.' })
  // These are draft-only values. A ref keeps typing local to the mounted
  // inputs instead of re-rendering the full Play shell for every keypress.
  const customTimeDraft = useRef(customTimeDraftFor(initial.timeControl))
  const [customTimeOpen, setCustomTimeOpen] = useState(initial.timeControl.category === 'custom')
  const [setupOpen, setSetupOpen] = useState(() => initial.game.history().length === 0)
  const [selected, setSelected] = useState<Square | null>(null)
  const [promotion, setPromotion] = useState<Promotion | null>(null)
  const [premove, setPremove] = useState<QueuedPremove | null>(null)
  // A preview is strictly display state. The live game, clock and any queued
  // premove keep running underneath it until the player returns to live.
  const [previewPly, setPreviewPly] = useState<number | null>(null)
  const [thinking, setThinking] = useState(false)
  const [notice, setNotice] = useState('')
  const [transferNotice, setTransferNotice] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [fen, setFen] = useState('')
  // SQLite is authoritative on desktop, but a complete library can contain
  // hundreds of PGNs. Do not synchronously parse its browser mirror on Play's
  // first render; it is imported only when a truly empty database needs it.
  const [library, setLibrary] = useState<StoredGame[]>(() => desktop ? [] : loadLibrary())
  const [libraryLoadState, setLibraryLoadState] = useState<LibraryLoadState>(() => desktop ? 'idle' : 'ready')
  const [libraryQuery, setLibraryQuery] = useState('')
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'reviewed' | 'unreviewed'>('all')
  const [showAbortedGames, setShowAbortedGames] = useState(false)
  const [libraryRevealCount, setLibraryRevealCount] = useState(LIBRARY_PAGE_SIZE)
  const [retryItems, setRetryItems] = useState<RetryItem[]>(() => loadBrowserRetryItems())
  const [tacticsState, setTacticsState] = useState<TacticsState>(() => loadBrowserTacticsState())
  const [requestedRetryKey, setRequestedRetryKey] = useState<string | null>(null)
  const [requestedReviewTarget, setRequestedReviewTarget] = useState<{ reviewKey: string; sourcePly: number } | null>(null)
  const [requestedPlayPreviewTarget, setRequestedPlayPreviewTarget] = useState<{ sourcePly: number; expectedFen: string } | null>(null)
  const [databaseReady, setDatabaseReady] = useState(!desktop)
  const [databaseStatus, setDatabaseStatus] = useState<DatabaseStatus>(desktop
    ? { kind: 'migrating' as const, message: 'Preparing your private game database…' }
    : { kind: 'browser' as const, message: 'Stored privately in this browser.' })
  const [engineName, setEngineName] = useState(desktop ? 'Stockfish' : 'Stockfish 18 Lite')
  const [engineDetail, setEngineDetail] = useState(desktop ? 'Native UCI engine · on demand' : 'WebAssembly · on demand')
  const botClient = useRef<HybridEngineClient | null>(null)
  const verboseHistoryCache = useRef(new WeakMap<Chess, readonly Move[]>())
  const soundPlayer = useRef<GameSoundPlayer | null>(null)
  const clockNowRef = useRef(Date.now())
  const workspaceTitle = useRef<HTMLHeadingElement | null>(null)
  const previousWorkspace = useRef<Tab>('play')
  const setupAutoCollapsed = useRef(initial.game.history().length > 0)
  const premoveRef = useRef<QueuedPremove | null>(premove)
  const retryItemsRef = useRef(retryItems)
  const tacticsStateRef = useRef(tacticsState)
  const tacticsWriteQueue = useRef<Promise<void>>(Promise.resolve())
  const libraryRequestVersion = useRef(0)
  const pendingNativeGameSaves = useRef<StoredGame[]>([])
  const librarySearchTextCache = useRef(new WeakMap<StoredGame, string>())
  const soundsEnabledRef = useRef(soundsEnabled)
  const captureClockNow = useCallback((nowMs: number) => {
    clockNowRef.current = nowMs
  }, [])
  const playBoardHandlers = useRef<{
    onSquareClick: (square: Square) => void
    onMoveAttempt: (from: Square, to: Square) => void
  }>({
    onSquareClick: () => {},
    onMoveAttempt: () => {},
  })
  retryItemsRef.current = retryItems
  tacticsStateRef.current = tacticsState
  soundsEnabledRef.current = soundsEnabled
  premoveRef.current = premove

  const navigateTo = useCallback((next: Tab) => {
    setTab((current) => current === next ? current : next)
  }, [])

  const openFreshGameSetup = () => {
    setupAutoCollapsed.current = false
    setSetupOpen(true)
  }

  const botRequestVersion = useRef(0)
  const engineProbeVersion = useRef(0)
  const pendingRestart = useRef<(() => void) | null>(null)
  const savedPosition = useRef<string | null>(terminalSessionFingerprint(
    initial.game.fen(),
    initial.termination?.result ?? gameResult(initial.game),
    initial.game.isGameOver() || Boolean(initial.termination),
  ))

  const setGame = useCallback((next: Chess, knownVerbose?: readonly Move[]) => {
    verboseHistoryCache.current.set(next, knownVerbose ?? next.history({ verbose: true }))
    setGameState(next)
  }, [])
  const verbose = useMemo(() => {
    const cached = verboseHistoryCache.current.get(game)
    if (cached) return cached
    const next = game.history({ verbose: true })
    verboseHistoryCache.current.set(game, next)
    return next
  }, [game])
  const history = useMemo(() => verbose.map((move) => move.san), [verbose])
  const previewing = previewPly !== null
  const previewGame = useMemo(
    () => previewPly === null ? game : previewGameAtPly(startFen, verbose, previewPly),
    [game, previewPly, startFen, verbose],
  )
  const positionTransfer = useMemo(
    () => positionTransferFor(previewGame, previewing),
    [previewGame, previewing],
  )
  const previewMove = previewPly === null ? null : verbose[previewPly - 1] ?? null
  const previewStatus = previewing
    ? `Viewing after ${previewMove?.san ?? 'the selected move'} — read-only; live clock continues.`
    : null
  const tacticProgress = useMemo(
    () => tacticsStateToTacticProgress(tacticsState, SEED_TACTICS),
    [tacticsState],
  )
  const last = verbose.at(-1)
  const lastMove = useMemo(
    () => last ? { from: last.from, to: last.to } : null,
    [last],
  )
  const previewLastMove = useMemo(
    () => previewMove ? { from: previewMove.from, to: previewMove.to } : null,
    [previewMove],
  )
  const meta = pageMeta[tab]
  const topColor = orientation === 'white' ? 'black' : 'white'
  const bottomColor = orientation === 'white' ? 'white' : 'black'
  const botColor = oppositeColor(humanColor)
  const humanSideLabel = humanColor === 'w' ? 'White' : 'Black'
  const botProfile = botProfileForId(botProfileId)
  const isFallbackOpponent = engineName.startsWith('KnightBot')
  const opponentName = isFallbackOpponent ? engineName : botProfile.name
  const opponentStrength = isFallbackOpponent
    ? 'Local fallback'
    : engineSettings.profile === 'preset'
      ? `Target ${botProfile.targetElo}`
      : engineSettingsLabel(engineSettings)
  const opponentDetail = isFallbackOpponent
    ? engineDetail
    : `Stockfish ${opponentStrength} · ${botProfile.openingCueLabel}`
  const opponentAvatar = isFallbackOpponent ? undefined : { initials: botProfile.initials, tone: botProfile.tone }
  const gameFinished = game.isGameOver() || termination !== null
  const premoveWindow = mode === 'bot'
    && isBotTurn(mode, game.turn(), humanColor)
    && !gameFinished
    && !decision
    && Boolean(clock.activeColor)
  const targets = useMemo(() => {
    if (!selected) return new Set<Square>()
    if (isHumanTurn(mode, game.turn(), humanColor)) {
      return new Set<Square>(legalMovesFrom(game, selected).map((move) => move.to))
    }
    // These are shape-only premove previews, not a promise that the move will
    // remain legal after the bot's pending reply. The owned bot-reply copy
    // still asks chess.js to validate the actual resulting position.
    if (premoveWindow) return new Set<Square>(queueablePremoveTargets(game, humanColor, selected))
    return new Set<Square>()
  }, [game, humanColor, mode, premoveWindow, selected])
  const previewTargets = useMemo(() => new Set<Square>(), [])
  const boardDisabled = previewing
    || gameFinished
    || !clock.activeColor
    || Boolean(decision)
    || Boolean(promotion)
    || (!isHumanTurn(mode, game.turn(), humanColor) && !premoveWindow)
    || (thinking && !premoveWindow)
  const canUndo = !previewing
    && !gameFinished
    && (mode !== 'bot' || verbose.some((move) => move.color === humanColor))
  const currentStatus = termination?.status ?? gameStatus(game)
  // A playable bot turn needs a role-aware action cue instead of making the
  // player translate a side-neutral color label. Keep every tactical/blocked
  // state above it (check, decisions, promotion, pauses and engine activity).
  const clearHumanTurn = mode === 'bot'
    && !gameFinished
    && !decision
    && !promotion
    && !thinking
    && !game.inCheck()
    && Boolean(clock.activeColor)
    && isHumanTurn(mode, game.turn(), humanColor)
  const latestBotMove = clearHumanTurn && last?.color === botColor ? last : null
  const boardStatus = previewStatus
    ?? (premoveWindow
      ? `${opponentName} is thinking — queue one premove.`
      : latestBotMove ? `Your move · ${opponentName} played ${latestBotMove.san}`
      : clearHumanTurn ? 'Your move' : currentStatus)
  const boardStatusLabel = latestBotMove
    ? `Your move — ${opponentName} played ${latestBotMove.san}. Choose a piece to continue.`
    : clearHumanTurn
      ? history.length === 0
        ? 'Your move — choose a piece to begin.'
        : 'Your move — choose a piece to continue.'
      : previewStatus ?? undefined
  const currentResult = termination?.result ?? gameResult(game)
  const livePgn = useMemo(() => game.pgn(), [game])
  const sharePgn = useMemo(() => gameFinished
    ? completedPgn(game, startFen, currentResult, currentStatus)
    : livePgn || `[SetUp "1"]\n[FEN "${game.fen()}"]\n\n*`,
  [game, gameFinished, startFen, currentResult, currentStatus, livePgn])

  useEffect(() => {
    if (history.length === 0 || setupAutoCollapsed.current) return
    setupAutoCollapsed.current = true
    setSetupOpen(false)
  }, [history.length])

  const selectPreviewPly = useCallback((ply: number) => {
    if (!Number.isInteger(ply) || ply < 1 || ply > verbose.length) return
    // The final move already is the live position, so it is the natural
    // keyboard and pointer shortcut back to the game.
    setSelected(null)
    setPromotion(null)
    setPreviewPly(ply === verbose.length ? null : ply)
  }, [verbose.length])

  const returnToLive = useCallback(() => {
    setPreviewPly(null)
  }, [])

  const stepPreview = useCallback((action: PlayPreviewNavigationAction) => {
    if (previewPly === null) return
    setSelected(null)
    setPromotion(null)
    setPreviewPly(previewPlyAfter(action, previewPly, verbose.length))
  }, [previewPly, verbose.length])

  const reviewPreviewPosition = useCallback(() => {
    if (previewPly === null) return
    setRequestedPlayPreviewTarget({ sourcePly: previewPly, expectedFen: previewGame.fen() })
    setNotice('')
    navigateTo('review')
  }, [navigateTo, previewGame, previewPly])

  useEffect(() => {
    if (tab !== 'review' && requestedPlayPreviewTarget) setRequestedPlayPreviewTarget(null)
  }, [requestedPlayPreviewTarget, tab])

  const reportTransfer = (ok: boolean, success: string, failure: string) => {
    setTransferNotice({ kind: ok ? 'success' : 'error', message: ok ? success : failure })
  }

  const copyGamePgn = async () => {
    const result = await copyText(sharePgn)
    reportTransfer(result.ok, 'PGN copied.', 'Couldn’t copy PGN. Download it instead.')
  }

  const downloadGamePgn = () => {
    const result = downloadText(`knightclub-${new Date().toISOString().slice(0, 10)}.pgn`, sharePgn)
    reportTransfer(result.ok, 'PGN download started.', 'Couldn’t start the PGN download.')
  }

  const copyCurrentFen = async () => {
    const result = await copyText(positionTransfer.fen)
    reportTransfer(
      result.ok,
      positionTransfer.copySuccess,
      'Couldn’t copy FEN. Download it instead.',
    )
  }

  const downloadCurrentFen = () => {
    const result = downloadText(`knightclub-position-${new Date().toISOString().slice(0, 10)}.fen`, positionTransfer.fen)
    reportTransfer(
      result.ok,
      positionTransfer.downloadSuccess,
      'Couldn’t start the FEN download.',
    )
  }

  const newClock = (control = timeControl, color: Color = 'w') => createReadyClock(control, color, Date.now())

  const reportDatabaseError = useCallback((error: unknown) => {
    setDatabaseStatus({
      kind: 'error' as const,
      message: error instanceof Error ? error.message : 'The private database could not be updated.',
    })
  }, [])

  const loadDesktopLibrary = useCallback(() => {
    if (!database || !databaseReady || libraryLoadState !== 'idle') return
    const requestVersion = ++libraryRequestVersion.current
    setLibraryLoadState('loading')
    void database.listGames().then((nativeGames) => {
      if (requestVersion !== libraryRequestVersion.current) return
      // The request can begin before a finished game or review update reaches
      // SQLite. Current React state wins for the same ID so old list data
      // never erases that newer local interaction.
      setLibrary((current) => mergeLibraryGames(nativeGames, current))
      setLibraryLoadState('ready')
      setDatabaseStatus((current) => current.kind === 'error'
        ? { kind: 'ready', message: 'Saved privately in KnightClub on this device.' }
        : current)
    }).catch((error: unknown) => {
      if (requestVersion !== libraryRequestVersion.current) return
      setLibraryLoadState('error')
      reportDatabaseError(error)
    })
  }, [database, databaseReady, libraryLoadState, reportDatabaseError])

  const retryDesktopLibraryLoad = useCallback(() => {
    if (libraryLoadState === 'error') setLibraryLoadState('idle')
  }, [libraryLoadState])

  const reviewStore = useMemo(() => ({
    load: async (reviewKey: string) => {
      if (desktop && database && databaseReady) return database.loadReview(reviewKey)
      return loadBrowserReview(reviewKey)
    },
    save: async (review: PersistedReview) => {
      if (desktop && database && databaseReady) {
        await database.saveReview(review)
        return
      }
      saveBrowserReview(review)
    },
  }), [database, databaseReady, desktop])

  const retryStore = useMemo(() => ({
    load: async (retryKey: string) => {
      if (desktop && database && databaseReady) return database.loadRetryItem(retryKey)
      return loadBrowserRetryItem(retryKey)
    },
    save: async (item: RetryItem) => {
      if (desktop && database && databaseReady) {
        await database.saveRetryItem(item)
        return
      }
      saveBrowserRetryItem(item)
    },
    delete: async (retryKey: string) => {
      if (desktop && database && databaseReady) return database.deleteRetryItem(retryKey)
      return deleteBrowserRetryItem(retryKey)
    },
  }), [database, databaseReady, desktop])

  const retainRetryItems = useCallback((items: RetryItem[]) => {
    setRetryItems((current) => mergeRetryItems(current, items))
  }, [])

  const saveRetryItem = useCallback(async (item: RetryItem) => {
    try {
      await retryStore.save(item)
      retainRetryItems([item])
    } catch (error) {
      reportDatabaseError(error)
      throw error
    }
  }, [reportDatabaseError, retainRetryItems, retryStore])

  const deleteRetryItem = useCallback(async (retryKey: string) => {
    try {
      const deleted = await retryStore.delete(retryKey)
      if (deleted) setRetryItems((items) => items.filter((item) => item.retryKey !== retryKey))
      return deleted
    } catch (error) {
      reportDatabaseError(error)
      throw error
    }
  }, [reportDatabaseError, retryStore])

  const recordTacticAttempt = useCallback((puzzle: TacticPuzzle, result: TacticsSprintResult): Promise<void> => {
    const write = async () => {
      const transition = recordTacticsTerminalAttempt(tacticsStateRef.current, puzzle, {
        attemptId: createTacticsAttemptId(),
        outcome: result.outcome,
        elapsedMs: result.elapsedMs,
        moveCount: result.moveCount,
        hintCount: result.hintCount,
      })
      let canonical = transition.state
      if (desktop && database && databaseReady) {
        canonical = await database.recordTacticsAttempt(transition.progress, transition.attempt)
        // Keep the browser mirror warm for a future browser session or a
        // desktop recovery before native hydration finishes.
        saveBrowserTacticsState(canonical)
      } else {
        saveBrowserTacticsState(canonical)
      }
      tacticsStateRef.current = canonical
      setTacticsState(canonical)
    }

    const resultPromise = tacticsWriteQueue.current.then(write)
    tacticsWriteQueue.current = resultPromise.then(() => undefined, () => undefined)
    return resultPromise.catch((error) => {
      reportDatabaseError(error)
      throw error
    })
  }, [database, databaseReady, desktop, reportDatabaseError])

  const openRetryQueue = useCallback((retryKey: string) => {
    setRequestedRetryKey(retryKey)
    navigateTo('train')
  }, [navigateTo])

  const returnToReview = useCallback((item: RetryItem) => {
    setRequestedRetryKey(null)
    setRequestedReviewTarget({ reviewKey: item.reviewKey, sourcePly: item.sourcePly })
    navigateTo('review')
  }, [navigateTo])

  const clearRequestedReviewTarget = useCallback(() => {
    setRequestedReviewTarget(null)
  }, [])

  const clearRequestedPlayPreviewTarget = useCallback(() => {
    setRequestedPlayPreviewTarget(null)
  }, [])

  const persistLibraryGameUpdate = useCallback((item: StoredGame) => {
    if (database) {
      if (databaseReady) void database.saveGame(item).catch(reportDatabaseError)
      else pendingNativeGameSaves.current = mergeLibraryGames(pendingNativeGameSaves.current, [item])
    } else {
      updateGame(item)
    }
  }, [database, databaseReady, reportDatabaseError])

  const markLinkedGameReviewed = useCallback((review: PersistedReview) => {
    const { games, changedGames } = markLibraryGamesReviewed(library, review.reviewKey)
    if (!changedGames.length) return
    setLibrary(games)
    for (const item of changedGames) {
      persistLibraryGameUpdate(item)
    }
  }, [library, persistLibraryGameUpdate])

  const clearPersistedSession = () => {
    clearActiveSession()
    if (database && databaseReady) void database.clearActiveSession().catch(reportDatabaseError)
  }

  const clearPersistedLibrary = () => {
    // A response that began before Clear must never restore deleted rows.
    libraryRequestVersion.current += 1
    clearLibrary()
    setLibrary([])
    setLibraryRevealCount(LIBRARY_PAGE_SIZE)
    setLibraryLoadState('ready')
    if (database && databaseReady) void database.clearGames().catch(reportDatabaseError)
  }

  const clearPremove = () => {
    premoveRef.current = null
    setPremove(null)
  }

  const playSound = useCallback((event: GameSoundEvent) => {
    if (!soundsEnabledRef.current) return
    soundPlayer.current ??= new GameSoundPlayer()
    soundPlayer.current.play(event)
  }, [])

  const playMoveSound = useCallback((next: Chess) => {
    const move = next.history({ verbose: true }).at(-1)
    playSound(next.isGameOver() ? 'game-end' : next.inCheck() ? 'check' : move?.captured ? 'capture' : 'move')
  }, [playSound])

  const verifyEngine = useCallback(async (enginePath: string | null) => {
    const client = botClient.current
    if (!client) return
    const version = ++engineProbeVersion.current
    setEngineStatus({ kind: 'checking' })
    try {
      const result = await client.probe(enginePath)
      if (version !== engineProbeVersion.current) return
      setEngineName(result.engineName)
      setEngineDetail(desktop ? 'Native UCI · verified' : 'WebAssembly · verified')
      setEngineStatus({ kind: 'ready', ...result })
    } catch (error) {
      if (version !== engineProbeVersion.current) return
      setEngineStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Stockfish could not be verified.',
      })
    }
  }, [desktop])

  const chooseEngineExecutable = async () => {
    if (!desktop) return
    try {
      const selected = await openDialog({
        title: 'Choose Stockfish executable',
        multiple: false,
        directory: false,
        canCreateDirectories: false,
      })
      if (typeof selected !== 'string') return
      setEngineSettings((current) => normalizeEngineSettings({ ...current, enginePath: selected }))
    } catch (error) {
      setEngineStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'The executable picker could not open.',
      })
    }
  }

  const useAutomaticEngine = () => {
    setEngineSettings((current) => ({ ...current, enginePath: null }))
  }

  const requestRestart = (
    title: string,
    description: string,
    confirmLabel: string,
    action: () => void,
  ) => {
    if (decision) return
    if (gameFinished || history.length === 0) {
      action()
      return
    }
    const now = Date.now()
    if (mode === 'bot') {
      botRequestVersion.current += 1
      botClient.current?.cancel()
      setThinking(false)
    }
    pendingRestart.current = action
    const resumeAfter = Boolean(clock.activeColor)
    clearPremove()
    setClock(pauseClock(clock, now)); captureClockNow(now); setSelected(null); setPromotion(null)
    setDecision({ kind: 'restart', title, description, confirmLabel, resumeAfter })
  }

  const finishGame = (nextTermination: GameTermination) => {
    if (termination || game.isGameOver()) return
    const now = Date.now()
    if (mode === 'bot') {
      botRequestVersion.current += 1
      botClient.current?.cancel()
    }
    setClock((current) => pauseClock(current, now))
    captureClockNow(now); setTermination(nextTermination); setDecision(null)
    clearPremove(); setSelected(null); setPromotion(null); setThinking(false); setNotice('')
    playSound('game-end')
  }

  const handleClockFlag = (loser: Color) => {
    if (termination || game.isGameOver()) return
    const snapshot = snapshotClock(clock, clockNowRef.current)
    if (snapshot.flaggedColor !== loser) return
    const opponent: Color = loser === 'w' ? 'b' : 'w'
    finishGame(timedOut(loser, hasMatingMaterial(game, opponent)))
  }

  const openDecision = (kind: 'resign' | 'draw-response') => {
    if (gameFinished || decision) return
    const now = Date.now()
    if (mode === 'bot') {
      botRequestVersion.current += 1
      botClient.current?.cancel()
      setThinking(false)
    }
    const resumeAfter = Boolean(clock.activeColor)
    clearPremove()
    setClock(pauseClock(clock, now)); captureClockNow(now); setSelected(null); setPromotion(null)
    if (kind === 'resign') {
      setDecision({ kind, actor: mode === 'bot' ? humanColor : game.turn(), resumeAfter })
    } else {
      setDecision({ kind, offeredBy: game.turn(), resumeAfter })
    }
  }

  const cancelDecision = () => {
    if (!decision) return
    const now = Date.now()
    if (decision.resumeAfter) setClock((current) => resumeClock(current, now))
    captureClockNow(now)
    if (decision.kind === 'draw-response') setNotice('Draw offer declined. The game continues.')
    if (decision.kind === 'restart') pendingRestart.current = null
    setDecision(null)
  }

  const confirmDecision = () => {
    if (!decision) return
    if (decision.kind === 'restart') {
      const action = pendingRestart.current
      pendingRestart.current = null
      setDecision(null)
      action?.()
      return
    }
    if (decision.kind === 'resign') finishGame(resignation(decision.actor))
    else finishGame(agreedDraw(decision.offeredBy))
  }

  const offerDraw = () => {
    if (gameFinished || decision) return
    if (mode === 'bot') {
      if (thinking || !isHumanTurn(mode, game.turn(), humanColor)) return
      if (botAcceptsDraw(game, botColor, botLevel)) finishGame(agreedDraw(humanColor))
      else setNotice(`${opponentName} declined the draw offer.`)
      return
    }
    openDecision('draw-response')
  }

  const restartPosition = (
    next: Chess,
    nextStartFen: string,
    message: string,
    control: TimeControl = timeControl,
  ) => {
    botRequestVersion.current += 1
    botClient.current?.cancel()
    clearPremove()
    openFreshGameSetup()
    setGame(next); setStartFen(nextStartFen); setPreviewPly(null); setSelected(null); setPromotion(null)
    setClock(newClock(control, next.turn())); setClockHistory([]); setTermination(null); setDecision(null)
    savedPosition.current = null; clearPersistedSession(); setThinking(false); setNotice(message)
  }

  const startFreshBotGame = (
    choice: HumanColorChoice = colorChoice,
    control: TimeControl = timeControl,
    profile = botProfile,
  ) => {
    const nextHumanColor = resolveHumanColor(choice)
    const sideLabel = nextHumanColor === 'w' ? 'White' : 'Black'
    setColorChoice(choice)
    setHumanColor(nextHumanColor)
    setOrientation(nextHumanColor === 'w' ? 'white' : 'black')
    setEngineName(desktop ? 'Stockfish' : 'Stockfish 18 Lite')
    setEngineDetail(desktop ? 'Native UCI engine · on demand' : 'WebAssembly · on demand')
    restartPosition(
      new Chess(),
      STANDARD_START_FEN,
      choice === 'random'
        ? `Random color selected — you play ${sideLabel}. ${profile.name}: ${profile.intro}`
        : `You play ${sideLabel}. ${profile.name}: ${profile.intro}`,
      control,
    )
  }

  const chooseBotProfile = (nextProfileId: BotProfileId) => {
    if (nextProfileId === botProfileId) return
    const nextProfile = botProfileForId(nextProfileId)
    requestRestart(
      `Play ${nextProfile.name}?`,
      `Changing opponents starts a fresh game and replaces this ${history.length}-ply position.`,
      `Play ${nextProfile.name}`,
      () => {
        setBotProfileId(nextProfile.id)
        setBotLevel(nextProfile.engineLevel)
        startFreshBotGame(colorChoice, timeControl, nextProfile)
      },
    )
  }

  const chooseHumanColor = (choice: HumanColorChoice) => {
    const nextHumanColor = resolveHumanColor(choice)
    if (choice !== 'random' && nextHumanColor === humanColor) {
      if (colorChoice !== choice) {
        setColorChoice(choice)
        setNotice(`Color preference set to ${nextHumanColor === 'w' ? 'White' : 'Black'} — this game stays unchanged.`)
      }
      return
    }

    const sideLabel = nextHumanColor === 'w' ? 'White' : 'Black'
    requestRestart(
      'Start a new bot game?',
      choice === 'random'
        ? `Drawing a random color starts a fresh game and replaces this ${history.length}-ply position.`
        : `Playing ${sideLabel} starts a fresh game and replaces this ${history.length}-ply position.`,
      choice === 'random' ? 'Draw a color' : `Play ${sideLabel}`,
      () => startFreshBotGame(choice),
    )
  }

  const playerFor = (color: 'white' | 'black') => {
    if (mode === 'bot') {
      const chessColor: Color = color === 'white' ? 'w' : 'b'
      return chessColor === botColor
        ? { name: opponentName, detail: opponentDetail, isBot: true, botAvatar: opponentAvatar }
        : { name: 'You', detail: `Playing ${color === 'white' ? 'White' : 'Black'}`, isBot: false, botAvatar: undefined }
    }
    return {
      name: color === 'white' ? 'White player' : 'Black player',
      detail: 'Hot-seat',
      isBot: false,
      botAvatar: undefined,
    }
  }

  const commit = (move: MoveInput) => {
    if (gameFinished || !clock.activeColor || !isHumanTurn(mode, game.turn(), humanColor)) return
    const next = cloneGame(game, startFen, verbose)
    let applied: Move
    try { applied = next.move(move) } catch { setNotice('Illegal move.'); return }
    const now = Date.now()
    try {
      setClockHistory((items) => [...items, settleClock(clock, now)])
      setClock(completeClockMove(clock, game.turn(), now))
      captureClockNow(now)
      clearPremove(); setGame(next, [...verbose, applied]); setSelected(null); setPromotion(null); setNotice('')
      playMoveSound(next)
    } catch { setNotice('Time expired before that move completed.') }
  }

  const queuePremoveMove = (move: MoveInput) => {
    const queued = queuePremove(game, humanColor, move)
    if (!queued) { setSelected(null); setNotice('That move cannot be queued.'); return }
    premoveRef.current = queued
    setPremove(queued); setSelected(null); setPromotion(null)
    setNotice(`Premove queued: ${move.from} → ${move.to}.`)
  }

  const attemptPremove = (from: Square, to: Square) => {
    if (!premoveWindow) return
    const piece = game.get(from)
    if (piece?.color !== humanColor) return
    if (premoveNeedsPromotion(game, humanColor, from, to)) {
      if (!canQueuePremove(game, humanColor, { from, to, promotion: 'q' })) {
        setSelected(null); setNotice('That move cannot be queued.'); return
      }
      setPromotion({ from, to, choices: premovePromotionChoices, kind: 'premove' })
      return
    }
    queuePremoveMove({ from, to })
  }

  const choosePremoveSquare = (square: Square) => {
    if (!premoveWindow) return
    const piece = game.get(square)
    if (!selected || piece?.color === humanColor) {
      // Selecting a new source is an intent to replace the queued move. Clear
      // it before the destination is chosen so an abandoned replacement cannot
      // accidentally fire the earlier premove.
      if (piece?.color === humanColor && premove) clearPremove()
      setSelected(piece?.color === humanColor ? square : null)
      return
    }
    if (selected === square) { setSelected(null); return }
    attemptPremove(selected, square)
  }

  const choosePromotion = (piece: PieceSymbol) => {
    if (!promotion) return
    if (promotion.kind === 'premove') {
      if (!premoveWindow) {
        setPromotion(null); setSelected(null); setNotice('Premove promotion cleared — position changed.')
        return
      }
      queuePremoveMove({ from: promotion.from, to: promotion.to, promotion: piece })
      return
    }
    commit({ from: promotion.from, to: promotion.to, promotion: piece })
  }

  const attemptMove = (from: Square, to: Square) => {
    if (premoveWindow) { attemptPremove(from, to); return }
    if (gameFinished || !clock.activeColor || thinking || !isHumanTurn(mode, game.turn(), humanColor)) return
    const piece = game.get(from)
    if (piece?.color !== game.turn()) return
    const matches = legalMovesFrom(game, from).filter((move) => move.to === to)
    if (!matches.length) { setSelected(null); return }
    const choices = [...new Set(matches.map((move) => move.promotion).filter(Boolean))] as PieceSymbol[]
    if (choices.length) setPromotion({ from, to, choices, kind: 'move' })
    else commit({ from, to })
  }

  const chooseSquare = (square: Square) => {
    if (premoveWindow) { choosePremoveSquare(square); return }
    if (gameFinished || !clock.activeColor || thinking || !isHumanTurn(mode, game.turn(), humanColor)) return
    const piece = game.get(square)
    if (!selected || piece?.color === game.turn()) { setSelected(piece?.color === game.turn() ? square : null); return }
    if (selected === square) { setSelected(null); return }
    attemptMove(selected, square)
  }

  // The board itself is memoized. Stable wrappers let it ignore a clock-only
  // repaint while still dispatching to the current game-state closures.
  playBoardHandlers.current = { onSquareClick: chooseSquare, onMoveAttempt: attemptMove }
  const onPlayBoardSquareClick = useCallback((square: Square) => {
    playBoardHandlers.current.onSquareClick(square)
  }, [])
  const onPlayBoardMoveAttempt = useCallback((from: Square, to: Square) => {
    playBoardHandlers.current.onMoveAttempt(from, to)
  }, [])

  const reset = () => {
    requestRestart(
      'Start a new game?',
      `Your ${history.length}-ply unfinished game will remain unless you confirm.`,
      'Start new game',
      () => mode === 'bot'
        ? startFreshBotGame()
        : restartPosition(new Chess(), STANDARD_START_FEN, 'New game ready — the clock starts with the opening move.'),
    )
  }

  const undo = () => {
    if (!canUndo) return
    botRequestVersion.current += 1
    botClient.current?.cancel()
    clearPremove(); setThinking(false)
    const next = cloneGame(game, startFen, verbose)
    if (!next.undo()) return
    let targetPly = Math.max(0, verbose.length - 1)
    if (targetPly && shouldUndoBotReply(mode, next.turn(), humanColor) && next.undo()) targetPly -= 1
    const restored = clockHistory[targetPly]
    if (restored) {
      setClock({
        ...restored,
        turnStartedAtMs: restored.turnStartedAtMs !== null && restored.activeColor && restored.control.initialMs !== null
          ? Date.now()
          : null,
      })
    } else {
      setClock(newClock(timeControl, next.turn()))
    }
    setClockHistory((items) => items.slice(0, targetPly))
    setTermination(null); setDecision(null); setGame(next, verbose.slice(0, targetPly)); setSelected(null); setPromotion(null)
    savedPosition.current = null; setNotice('Move and clock restored.')
  }

  const changeTimeControl = (control: TimeControl) => {
    if (control.id === timeControl.id) return
    requestRestart(
      'Start a new game?',
      `Changing to ${control.label} starts a fresh game and discards the ${history.length}-ply unfinished game.`,
      `Use ${control.label}`,
      () => {
        setTimeControl(control)
        setCustomTimeOpen(false)
        if (mode === 'bot') startFreshBotGame(colorChoice, control)
        else restartPosition(new Chess(), STANDARD_START_FEN, `${control.label} ready — the clock starts with the opening move.`, control)
      },
    )
  }

  const applyCustomTimeControl = () => {
    try {
      const { base, increment, delay } = customTimeDraft.current
      changeTimeControl(createCustomTimeControl(Number(base), Number(increment), Number(delay)))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Invalid time control.')
    }
  }

  const toggleClock = () => {
    const now = Date.now()
    if (clock.pausedColor) {
      setClock(resumeClock(clock, now)); setNotice('Clock resumed.')
    } else {
      if (mode === 'bot') {
        botRequestVersion.current += 1
        botClient.current?.cancel()
        setThinking(false)
      }
      clearPremove()
      setClock(pauseClock(clock, now)); setSelected(null); setPromotion(null); setNotice('Clock paused.')
    }
    captureClockNow(now)
  }

  const switchMode = (nextMode: GameMode) => {
    if (nextMode === mode) return
    const label = nextMode === 'bot' ? `play against ${opponentName}` : 'start a hot-seat game'
    requestRestart(
      'Start a new game?',
      `Switching mode will replace the ${history.length}-ply unfinished game.`,
      nextMode === 'bot' ? `Play ${opponentName}` : 'Start hot-seat',
      () => {
        setMode(nextMode)
        if (nextMode === 'bot') startFreshBotGame()
        else restartPosition(new Chess(), STANDARD_START_FEN, `Ready to ${label}.`)
      },
    )
  }

  const reviewCurrentGame = () => {
    setNotice('')
    navigateTo('review')
  }

  const loadFen = () => {
    try {
      const next = new Chess(fen.trim())
      requestRestart(
        'Load this position?',
        `Loading a FEN replaces the ${history.length}-ply unfinished game.`,
        'Load position',
        () => { restartPosition(next, next.fen(), 'FEN loaded.'); setFen('') },
      )
    } catch { setNotice('Invalid FEN.') }
  }

  const openStored = (item: StoredGame, destination: 'play' | 'review' = 'play') => {
    try {
      const next = new Chess(); next.loadPgn(item.pgn)
      const restoredTermination = isGameTermination(item.termination) ? item.termination : null
      const restoredStartFen = next.getHeaders().FEN ?? STANDARD_START_FEN
      const restoredVerbose = next.history({ verbose: true })
      // A legacy library row obtains its canonical link while its PGN is
      // already open. Later review completion can then update by metadata
      // rather than replaying every stored game on the UI thread.
      const canonicalReviewKey = createReviewKeyFromMoves(restoredStartFen, restoredVerbose)
      const storedWithReviewKey = item.reviewKey === canonicalReviewKey
        ? item
        : { ...item, reviewKey: canonicalReviewKey }
      const control = isTimeControl(item.timeControl) ? item.timeControl : getTimeControl('unlimited')
      const restoredHumanColor: Color = item.humanColor === 'b' ? 'b' : 'w'
      const restoredColorChoice = isHumanColorChoice(item.colorChoice)
        ? item.colorChoice
        : restoredHumanColor === 'b' ? 'black' : 'white'
      const restoredProfile = isBotProfileId(item.botProfileId)
        ? botProfileForId(item.botProfileId)
        : profileForLegacyLevel(item.botLevel)
      requestRestart(
        destination === 'review' ? 'Review saved game?' : 'Open saved game?',
        `${destination === 'review' ? 'Reviewing' : 'Opening'} this game replaces the ${history.length}-ply unfinished game.`,
        destination === 'review' ? 'Open review' : 'Open saved game',
        () => {
          if (storedWithReviewKey !== item) {
            setLibrary((current) => current.map((stored) => stored.id === item.id
              ? { ...stored, reviewKey: canonicalReviewKey }
              : stored))
            persistLibraryGameUpdate(storedWithReviewKey)
          }
          const now = Date.now()
          const restoredClock = newClock(control, next.turn())
          botRequestVersion.current += 1
          botClient.current?.cancel()
          clearPremove()
          setGame(next, restoredVerbose); setStartFen(restoredStartFen); setPreviewPly(null)
          customTimeDraft.current = customTimeDraftFor(control)
          setCustomTimeOpen(control.category === 'custom')
          setTimeControl(control); setClock(next.isGameOver() || restoredTermination ? pauseClock(restoredClock, now) : restoredClock)
          setClockHistory([]); setTermination(restoredTermination); setDecision(null)
          setupAutoCollapsed.current = next.history().length > 0
          setSetupOpen(!setupAutoCollapsed.current)
          setMode(item.mode); setHumanColor(restoredHumanColor); setColorChoice(restoredColorChoice)
          if (item.mode === 'bot') setOrientation(restoredHumanColor === 'w' ? 'white' : 'black')
          if (item.mode === 'bot') {
            setBotProfileId(restoredProfile.id)
            setBotLevel(restoredProfile.engineLevel)
          }
          setThinking(false)
          savedPosition.current = terminalSessionFingerprint(
            next.fen(),
            restoredTermination?.result ?? gameResult(next),
            next.isGameOver() || Boolean(restoredTermination),
          )
          navigateTo(destination); setNotice(destination === 'review' ? 'Saved game opened in Review.' : 'Saved game loaded for viewing.')
        },
      )
    } catch { setNotice('Saved PGN is invalid.') }
  }

  const onWindowKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key === 'Escape' && decision) {
      event.preventDefault()
      cancelDecision()
      return
    }
    if (event.key === 'Escape' && promotion) {
      event.preventDefault()
      setSelected(null)
      setPromotion(null)
      return
    }
    if (promotion && !event.isComposing) {
      const piece = promotionShortcutFor({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
      })
      if (piece && promotion.choices.includes(piece)) {
        event.preventDefault()
        choosePromotion(piece)
        return
      }
    }
    if (event.defaultPrevented || event.isComposing) return
    if (tab !== 'play') return
    const element = event.target instanceof HTMLElement ? event.target : null
    const editable = Boolean(
      element?.isContentEditable
      || (element && ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)),
    )
    const previewNavigation = playPreviewNavigationForKey({
      key: event.key,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      editable,
      modalOpen: Boolean(decision || promotion),
      boardGridFocused: Boolean(element?.closest('[role="grid"]')),
    })
    if (previewNavigation) {
      const nextPreviewPly = previewPlyAfterShortcut(previewNavigation, previewPly, verbose.length)
      if (nextPreviewPly !== previewPly) {
        event.preventDefault()
        setSelected(null)
        setPromotion(null)
        setPreviewPly(nextPreviewPly)
      }
      return
    }
    const shortcut = gameShortcutFor({
      key: event.key,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      editable,
      modalOpen: Boolean(decision || promotion),
    })
    if (!shortcut) return
    event.preventDefault()
    if (previewing && shortcut === 'undo') return
    if (previewing && shortcut === 'cancel') {
      returnToLive()
      return
    }
    if (shortcut === 'new-game') reset()
    if (shortcut === 'undo' && canUndo) undo()
    if (shortcut === 'flip') setOrientation((current) => current === 'white' ? 'black' : 'white')
    if (shortcut === 'cancel') {
      if (selected || promotion) {
        setSelected(null); setPromotion(null)
      } else if (premove) {
        clearPremove()
        setNotice('Premove cleared.')
      }
    }
  })

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => onWindowKeyDown(event)
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!database) return
    let cancelled = false
    void (async () => {
      try {
        setDatabaseStatus({ kind: 'migrating', message: 'Preparing your private game database…' })
        let bootstrap = await database.bootstrap()
        let nativeRetries = await database.listRetryItems()
        let nativeTactics = await database.listTacticsState()
        if (bootstrap.isEmpty) {
          await database.importLegacy({
            activeSession: loadActiveSession(),
            preferences: loadPreferences(),
            games: loadLibrary(),
          })
          bootstrap = await database.bootstrap()
          nativeRetries = await database.listRetryItems()
          nativeTactics = await database.listTacticsState()
        }
        const browserRetries = loadBrowserRetryItems()
        const retriesByKey = new Map(nativeRetries.map((item) => [item.retryKey, item]))
        for (const item of mergeRetryItems(browserRetries, retryItemsRef.current)) {
          const native = retriesByKey.get(item.retryKey)
          if (native && native.updatedAt >= item.updatedAt) continue
          await database.saveRetryItem(item)
          retriesByKey.set(item.retryKey, item)
        }
        const browserTactics = loadBrowserTacticsState()
        const mergedTactics = mergeTacticsState(nativeTactics, browserTactics, tacticsStateRef.current)
        nativeTactics = await database.mergeTacticsState(mergedTactics)
        saveBrowserTacticsState(nativeTactics)
        if (cancelled) return
        const preferences = normalizePreferences(bootstrap.preferences)
        const restored = restoreSession(bootstrap.activeSession, preferences.botProfileId)
        botRequestVersion.current += 1
        botClient.current?.cancel()
        clearPremove()
        setGame(restored.game); setStartFen(restored.startFen); setPreviewPly(null); setMode(restored.mode)
        setBotLevel(restored.botLevel); setBotProfileId(restored.botProfileId); setOrientation(restored.orientation)
        setHumanColor(restored.humanColor); setColorChoice(restored.colorChoice)
        customTimeDraft.current = customTimeDraftFor(restored.timeControl)
        setCustomTimeOpen(restored.timeControl.category === 'custom')
        setTimeControl(restored.timeControl); setClock(restored.clock)
        setClockHistory(restored.clockHistory); setTermination(restored.termination)
        setupAutoCollapsed.current = restored.game.history().length > 0
        setSetupOpen(!setupAutoCollapsed.current)
        setSoundsEnabled(preferences.soundsEnabled); setEngineSettings(preferences.engine)
        setLibraryLoadState(bootstrap.gameCount === 0 ? 'ready' : 'idle')
        // Retry work can be saved in browser storage while desktop hydration
        // is still running. Merge current React state as well as that mirror
        // so a newly queued exercise never blinks away.
        setRetryItems((current) => mergeRetryItems([...retriesByKey.values()], current))
        tacticsStateRef.current = nativeTactics
        setTacticsState(nativeTactics)
        savedPosition.current = terminalSessionFingerprint(
          restored.game.fen(),
          restored.termination?.result ?? gameResult(restored.game),
          restored.game.isGameOver() || Boolean(restored.termination),
        )
        const queuedGameSaves = pendingNativeGameSaves.current
        pendingNativeGameSaves.current = []
        setDatabaseReady(true)
        for (const item of queuedGameSaves) void database.saveGame(item).catch(reportDatabaseError)
        setDatabaseStatus(bootstrap.recoveryBackupPath
          ? { kind: 'recovered', message: `A damaged database was preserved at ${bootstrap.recoveryBackupPath}. A clean library is ready.` }
          : { kind: 'ready', message: 'Saved privately in KnightClub on this device.' })
      } catch (error) {
        if (!cancelled) {
          setLibraryLoadState('error')
          reportDatabaseError(error)
        }
      }
    })()
    return () => { cancelled = true }
  }, [database, reportDatabaseError, setGame])

  useEffect(() => {
    if (tab !== 'library' && tab !== 'insights') return
    loadDesktopLibrary()
  }, [tab, loadDesktopLibrary])

  useEffect(() => {
    const session = {
      pgn: sharePgn, startFen, mode, botLevel, botProfileId, orientation, humanColor, colorChoice, timeControl, clock, clockHistory, termination,
    }
    saveActiveSession(session)
    if (database && databaseReady) void database.saveActiveSession(session).catch(reportDatabaseError)
  }, [game, startFen, mode, botLevel, botProfileId, orientation, humanColor, colorChoice, timeControl, clock, clockHistory, termination, sharePgn, database, databaseReady, reportDatabaseError])

  useEffect(() => {
    const preferences = { soundsEnabled, engine: engineSettings, botProfileId }
    savePreferences(preferences)
    if (database && databaseReady) void database.savePreferences(preferences).catch(reportDatabaseError)
  }, [soundsEnabled, engineSettings, botProfileId, database, databaseReady, reportDatabaseError])

  useEffect(() => {
    const previous = previousWorkspace.current
    previousWorkspace.current = tab
    if (previous === tab) return

    const frame = window.requestAnimationFrame(() => {
      handoffWorkspace(previous, tab, {
        scrollToTop: () => window.scrollTo(0, 0),
        focusWorkspace: () => workspaceTitle.current?.focus({ preventScroll: true }),
      })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [tab])

  useEffect(() => {
    if (!transferNotice) return
    const timeout = window.setTimeout(() => setTransferNotice(null), 4_000)
    return () => window.clearTimeout(timeout)
  }, [transferNotice])

  useEffect(() => () => {
    soundPlayer.current?.dispose()
    soundPlayer.current = null
  }, [])

  useEffect(() => {
    if (!game.isGameOver() || !clock.activeColor) return
    setClock((current) => pauseClock(current, Date.now()))
  }, [game, clock.activeColor])

  useEffect(() => {
    const terminalFingerprint = terminalSessionFingerprint(game.fen(), currentResult, gameFinished)
    if (!terminalFingerprint || savedPosition.current === terminalFingerprint) return
    const terminalClock = snapshotClock(clock, clockNowRef.current)
    const item: StoredGame = {
      id: `${Date.now()}-${game.fen()}`, playedAt: new Date().toISOString(), mode,
      botLevel: mode === 'bot' ? botLevel : undefined,
      botProfileId: mode === 'bot' ? botProfileId : undefined,
      result: currentResult, pgn: sharePgn,
      finalFen: game.fen(), moveCount: history.length,
      reviewKey: createReviewKeyFromMoves(startFen, verbose),
      timeControl, whiteTimeMs: terminalClock.whiteMs, blackTimeMs: terminalClock.blackMs,
      termination: termination ?? undefined,
      ...(mode === 'bot' ? { humanColor, colorChoice } : {}),
    }
    if (database) {
      setLibrary((current) => mergeLibraryGames(current, [item]))
      if (databaseReady) void database.saveGame(item).catch(reportDatabaseError)
      else pendingNativeGameSaves.current = mergeLibraryGames(pendingNativeGameSaves.current, [item])
    } else {
      setLibrary(saveGame(item))
    }
    savedPosition.current = terminalFingerprint
  }, [game, startFen, verbose, mode, botLevel, botProfileId, humanColor, colorChoice, gameFinished, currentResult, sharePgn, history.length, timeControl, clock, termination, database, databaseReady, reportDatabaseError])

  useEffect(() => {
    const client = new HybridEngineClient()
    botClient.current = client
    return () => {
      botRequestVersion.current += 1
      client.dispose()
      botClient.current = null
    }
  }, [])

  useEffect(() => {
    // Changing a configured executable invalidates the prior check, but does
    // not spin up an engine just to update this label.
    engineProbeVersion.current += 1
    setEngineStatus(desktop
      ? { kind: 'idle', message: 'Loads on your first bot move or when you verify it.' }
      : { kind: 'idle', message: 'Loads locally on your first bot move or when you verify it.' })
  }, [desktop, engineSettings.enginePath])

  useEffect(() => {
    const client = botClient.current
    if (!client || !isBotTurn(mode, game.turn(), humanColor) || gameFinished || decision || !clock.activeColor) return

    const requestFen = game.fen()
    const version = ++botRequestVersion.current
    const requestedAt = Date.now()
    // A matching local cue is a real legal move, not a text overlay. Preserve
    // that authored opening path before checking whether the rules leave only
    // one reply; either local path avoids starting Stockfish.
    const openingMove = selectProfileOpeningMove(game, startFen, botColor, botProfile)
    let pacingTimer: ReturnType<typeof window.setTimeout> | null = null
    let releasePacing: (() => void) | null = null
    const waitForPacing = (delay: number) => new Promise<void>((resolve) => {
      if (delay <= 0) {
        resolve()
        return
      }
      releasePacing = resolve
      pacingTimer = window.setTimeout(() => {
        pacingTimer = null
        releasePacing = null
        resolve()
      }, delay)
    })
    setThinking(true)

    const moveRequest: Promise<EngineSearchResult> = requestPlayMove({
      game,
      openingMove,
      search: () => client.search(requestFen, botLevel, engineSettings, botProfile.candidateCount),
    })

    void moveRequest.then(async (result) => {
      if (version !== botRequestVersion.current) return
      const statusUpdate = playEngineStatusUpdate(result)
      if (statusUpdate) setEngineStatus(statusUpdate)
      if (result.provider === 'stockfish') {
        setEngineName(result.engineName)
        setEngineDetail(`${desktop ? 'Native UCI' : 'WebAssembly'}${result.depth ? ` · depth ${result.depth}` : ''}`)
      } else if (result.provider === 'opening-cue') {
        setEngineName(desktop ? 'Stockfish' : 'Stockfish 18 Lite')
        setEngineDetail('Local opening cue · engine stays idle')
      } else if (result.provider === 'forced-move') {
        setEngineName(desktop ? 'Stockfish' : 'Stockfish 18 Lite')
        setEngineDetail('Local rules · only legal move · engine stays idle')
      } else {
        setEngineName('KnightBot')
        setEngineDetail('Local fallback')
      }
      if (result.warning) setNotice(`Stockfish unavailable; KnightBot took over. ${result.warning}`)
      if (!result.move) return
      // A profile can only use a legal, close second PV from this exact one
      // bounded search. Fallbacks and opening cues retain their own move.
      const chosen = result.provider === 'stockfish'
        ? selectProfileCandidateMove(game, botProfile, result.move, result.candidates)
        : { move: result.move, usedStyle: false }
      await waitForPacing(Math.max(0, BOT_MOVE_DISPLAY_FLOOR_MS[botLevel] - (Date.now() - requestedAt)))
      if (version !== botRequestVersion.current) return
      if (game.fen() !== requestFen) return
      let next = cloneGame(game, startFen, verbose)
      try {
        const now = Date.now()
        const nextVerbose = [...verbose, next.move(chosen.move)]
        const beforeBotClock = settleClock(clock, now)
        const afterBotClock = completeClockMove(clock, botColor, now)
        const queuedPremove = premoveRef.current
        premoveRef.current = null
        setPremove(null)
        let nextClock = afterBotClock
        const historySnapshots = [beforeBotClock]
        if (queuedPremove?.baseFen === requestFen && !next.isGameOver() && next.turn() === humanColor) {
          const afterPremove = applyPremoveToOwnedGame(next, humanColor, queuedPremove)
          if (afterPremove) {
            nextVerbose.push(afterPremove)
            historySnapshots.push(settleClock(afterBotClock, now))
            nextClock = completeClockMove(afterBotClock, humanColor, now)
          } else {
            setNotice('Premove canceled — position changed.')
          }
        }
        setClockHistory((items) => [...items, ...historySnapshots])
        setClock(nextClock)
        captureClockNow(now)
        setGame(next, nextVerbose); setSelected(null); setPromotion(null)
        if (result.provider === 'opening-cue') {
          setNotice(`${botProfile.name}: ${botOpeningReaction(botProfile, next)}`)
        } else if (chosen.usedStyle) {
          setNotice(botStyleReaction(botProfile))
        }
        playMoveSound(next)
      } catch {
        setNotice('Bot result was rejected safely.')
      }
    }).catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      if (version === botRequestVersion.current) {
        const statusUpdate = playEngineFailureStatus(error)
        setEngineStatus(statusUpdate)
        setNotice(`Engine stopped safely${error instanceof Error ? `: ${error.message}` : '.'}`)
      }
    }).finally(() => {
      if (version === botRequestVersion.current) setThinking(false)
    })

    return () => {
      if (version !== botRequestVersion.current) return
      botRequestVersion.current += 1
      client.cancel()
      if (pacingTimer !== null) {
        window.clearTimeout(pacingTimer)
        pacingTimer = null
        const release = releasePacing
        releasePacing = null
        release?.()
      }
    }
  }, [game, mode, humanColor, botColor, botLevel, botProfile, engineSettings, startFen, gameFinished, decision, clock, desktop, playMoveSound, captureClockNow, setGame, verbose])

  const abortedGameCount = useMemo(() => library.filter((item) => item.moveCount === 0).length, [library])
  const visibleLibrary = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase()
    return library.filter((item) => {
      if (!showAbortedGames && item.moveCount === 0) return false
      if (libraryFilter === 'reviewed' && !item.reviewed) return false
      if (libraryFilter === 'unreviewed' && item.reviewed) return false
      if (!query) return true
      let searchable = librarySearchTextCache.current.get(item)
      if (!searchable) {
        searchable = searchableLibraryText(item)
        librarySearchTextCache.current.set(item, searchable)
      }
      return searchable.includes(query)
    })
  }, [library, libraryFilter, libraryQuery, showAbortedGames])
  const revealMoreLibrary = useCallback(() => {
    setLibraryRevealCount((current) => revealMoreLibraryResults(current, visibleLibrary.length))
  }, [visibleLibrary.length])
  const updateLibraryQuery = useCallback((query: string) => {
    setLibraryQuery(query)
    setLibraryRevealCount(LIBRARY_PAGE_SIZE)
  }, [])
  const updateLibraryFilter = useCallback((filter: 'all' | 'reviewed' | 'unreviewed') => {
    if (filter === libraryFilter) return
    setLibraryFilter(filter)
    setLibraryRevealCount(LIBRARY_PAGE_SIZE)
  }, [libraryFilter])
  const toggleAbortedGames = useCallback(() => {
    setShowAbortedGames((value) => !value)
    setLibraryRevealCount(LIBRARY_PAGE_SIZE)
  }, [])

  const topPlayer = playerFor(topColor)
  const bottomPlayer = playerFor(bottomColor)
  const setupSummary = mode === 'bot'
    ? `${opponentName} · You: ${humanSideLabel} · ${timeControl.label}`
    : `Hot-seat · ${timeControl.label}`

  return (
    <ClockRuntime state={clock} gameFinished={gameFinished} onTick={captureClockNow} onFlag={handleClockFlag}>
      <div className="app-shell">
      <aside className="app-nav">
        <button className="brand" type="button" onClick={() => navigateTo('play')} aria-label="KnightClub home">
          <span className="brand-mark"><Swords size={23} strokeWidth={2.4} /></span>
          <span className="brand-copy"><strong>KnightClub</strong><small>Chess studio</small></span>
        </button>
        <nav aria-label="Primary navigation">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={tab === id ? 'is-active' : ''}
              onPointerEnter={() => preloadWorkspace(id)}
              onFocus={() => preloadWorkspace(id)}
              onClick={() => { preloadWorkspace(id); navigateTo(id) }}
            >
              <Icon size={21} strokeWidth={2} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="privacy-badge">
          <ShieldCheck size={17} />
          <span><strong>Private by design</strong><small>Offline · No account</small></span>
        </div>
      </aside>

      <main className="app-main" aria-labelledby="workspace-title">
        <header className={`page-header ${tab === 'play' ? 'page-header--play' : ''}`}>
          <div>
            <span className="eyebrow">{meta.eyebrow}</span>
            <h1 ref={workspaceTitle} id="workspace-title" tabIndex={-1}>{meta.title}</h1>
            <p>{meta.description}</p>
          </div>
          <span className="session-pill"><i />{mode === 'bot' ? `${opponentName} · ${opponentStrength} · You: ${humanSideLabel}` : 'Hot-seat game'} · {timeControl.label}</span>
        </header>

        {tab === 'play' && (
          <section className="play-workspace">
            <div className="board-stage">
              <div className="board-status">
                <div className="board-status__summary">
                  <span
                    role={latestBotMove ? 'status' : undefined}
                    aria-live={latestBotMove ? 'polite' : undefined}
                    aria-atomic={latestBotMove ? true : undefined}
                    aria-label={boardStatusLabel}
                    title={boardStatusLabel}
                  >{boardStatus}</span>
                  <strong>Material {formatEvaluation(evaluateMaterial(previewGame, 'w'))}</strong>
                </div>
                <div className="board-status__actions">
                  <button className="icon-button" type="button" onClick={() => setOrientation(orientation === 'white' ? 'black' : 'white')} title="Flip board">
                    <FlipHorizontal2 size={18} /><span>Flip</span>
                  </button>
                </div>
              </div>
              {previewing && previewPly !== null && (
                <PlayPreviewNavigation
                  ply={previewPly}
                  maxPly={history.length}
                  onPrevious={() => stepPreview('previous')}
                  onNext={() => stepPreview('next')}
                  onReviewPosition={reviewPreviewPosition}
                  onReturnToLive={returnToLive}
                />
              )}
              {premove && !previewing && (
                <div className="premove-status" role="status">
                  <span><RefreshCw size={14} aria-hidden="true" />Premove queued <strong>{premove.from} → {premove.to}</strong></span>
                  <button type="button" onClick={() => { clearPremove(); setNotice('Premove cleared.') }}>Cancel premove <kbd>Esc</kbd></button>
                </div>
              )}
              <PlayerBar
                color={topColor}
                name={topPlayer.name}
                detail={topPlayer.detail}
                isBot={topPlayer.isBot}
                botAvatar={topPlayer.botAvatar}
                active={(clock.activeColor ?? clock.pausedColor) === (topColor === 'white' ? 'w' : 'b')}
                thinking={thinking && topPlayer.isBot}
                paused={Boolean(clock.pausedColor)}
              />
              <ChessBoard
                game={previewGame}
                orientation={orientation}
                selected={previewing ? null : selected}
                legalTargets={previewing ? previewTargets : targets}
                lastMove={previewing ? previewLastMove : lastMove}
                interactionColor={previewing || !premoveWindow ? null : humanColor}
                premove={previewing ? null : premove}
                premoveMode={!previewing && premoveWindow}
                disabled={boardDisabled}
                onSquareClick={onPlayBoardSquareClick}
                onMoveAttempt={onPlayBoardMoveAttempt}
              />
              <PlayerBar
                color={bottomColor}
                name={bottomPlayer.name}
                detail={bottomPlayer.detail}
                isBot={bottomPlayer.isBot}
                botAvatar={bottomPlayer.botAvatar}
                active={(clock.activeColor ?? clock.pausedColor) === (bottomColor === 'white' ? 'w' : 'b')}
                thinking={thinking && bottomPlayer.isBot}
                paused={Boolean(clock.pausedColor)}
              />
              <div className="board-toolbar" role="toolbar" aria-label="Game actions">
                <button className="board-toolbar__game-action" type="button" onClick={undo} disabled={!canUndo} title="Undo turn (⌘/Ctrl+Z)"><RotateCcw size={18} /><span>Undo</span></button>
                <button className="board-toolbar__game-action" type="button" onClick={reset} title="New game (N)"><RefreshCw size={18} /><span>New game</span></button>
                <button className="board-toolbar__game-action" type="button" onClick={toggleClock} disabled={gameFinished || timeControl.initialMs === null} title={clock.pausedColor ? 'Resume clock' : 'Pause clock'}>
                  {clock.pausedColor ? <Play size={18} /> : <Pause size={18} />}<span>{clock.pausedColor ? 'Resume' : 'Pause'}</span>
                </button>
                <button className="board-toolbar__transfer-action" type="button" onClick={() => void copyGamePgn()} title="Copy PGN"><Copy size={18} /><span>Copy PGN</span></button>
                <button className="board-toolbar__transfer-action" type="button" onClick={downloadGamePgn} title="Download PGN"><Download size={18} /><span>Download PGN</span></button>
              </div>
              {transferNotice && <div className={`play-transfer-notice play-transfer-notice--${transferNotice.kind}`} role="status">{transferNotice.message}</div>}
            </div>

            <aside className="game-panel">
              <div className="game-panel__header">
                <div className="panel-icon"><BrainCircuit size={22} /></div>
                <div><span className="eyebrow">Current game</span><h2>{mode === 'bot' ? `Play ${opponentName} · ${humanSideLabel}` : 'Local match'}</h2></div>
                <span className="live-dot" title="Session saved locally" />
              </div>

              <details
                className="game-setup"
                open={setupOpen}
                onToggle={(event) => {
                  if (event.target !== event.currentTarget) return
                  setSetupOpen(event.currentTarget.open)
                }}
              >
                <summary>
                  <span>
                    <strong>Game setup</strong>
                    <small>{setupSummary}</small>
                  </span>
                  <ChevronDown size={16} />
                </summary>
                {setupOpen && (
                  <div className="game-setup__body">
                    <div className="segmented-control">
                      <button type="button" className={mode === 'bot' ? 'is-active' : ''} aria-pressed={mode === 'bot'} onClick={() => switchMode('bot')}><Bot size={17} />Vs bot</button>
                      <button type="button" className={mode === 'local' ? 'is-active' : ''} aria-pressed={mode === 'local'} onClick={() => switchMode('local')}><Users size={17} />Hot-seat</button>
                    </div>
                    {mode === 'bot' && (
                      <>
                        <div className="color-choice" aria-describedby="color-choice-hint">
                          <div className="color-choice__heading">
                            <span>Play as</span>
                            <small>{colorChoice === 'random' ? `Random draw · ${humanSideLabel}` : `You are ${humanSideLabel}`}</small>
                          </div>
                          <div className="color-choice__options" role="group" aria-label="Play as">
                            <button
                              type="button"
                              className={colorChoice === 'white' ? 'is-active' : ''}
                              aria-pressed={colorChoice === 'white'}
                              onClick={() => chooseHumanColor('white')}
                            >
                              <span className="color-choice__piece"><ChessPiece color="w" type="k" /></span>
                              <span>White</span>
                            </button>
                            <button
                              type="button"
                              className={colorChoice === 'black' ? 'is-active' : ''}
                              aria-pressed={colorChoice === 'black'}
                              onClick={() => chooseHumanColor('black')}
                            >
                              <span className="color-choice__piece"><ChessPiece color="b" type="k" /></span>
                              <span>Black</span>
                            </button>
                            <button
                              type="button"
                              className={colorChoice === 'random' ? 'is-active' : ''}
                              aria-pressed={colorChoice === 'random'}
                              onClick={() => chooseHumanColor('random')}
                            >
                              <RefreshCw size={16} aria-hidden="true" />
                              <span>Random</span>
                            </button>
                          </div>
                          <small id="color-choice-hint" className="color-choice__hint">
                            {colorChoice === 'random'
                              ? `The draw resolved to ${humanSideLabel}. Start a new game to draw again.`
                              : 'The board starts from your side; Flip remains available anytime.'}
                          </small>
                        </div>
                        <BotProfilePicker
                          selectedId={botProfileId}
                          customEngine={engineSettings.profile !== 'preset'}
                          onSelect={chooseBotProfile}
                        />
                        <EngineSettingsPanel
                          settings={engineSettings}
                          desktop={desktop}
                          status={engineStatus}
                          onChange={(settings) => setEngineSettings(normalizeEngineSettings(settings))}
                          onChooseExecutable={() => { void chooseEngineExecutable() }}
                          onUseAutomatic={useAutomaticEngine}
                          onVerify={() => { void verifyEngine(engineSettings.enginePath) }}
                        />
                      </>
                    )}
                    <div className="quick-time-controls">
                      <span>Quick start</span>
                      <div role="group" aria-label="Quick time controls">
                        {QUICK_TIME_CONTROLS.map(({ control, shortLabel }) => (
                          <button
                            key={control.id}
                            type="button"
                            className={timeControl.id === control.id && !customTimeOpen ? 'is-active' : ''}
                            aria-pressed={timeControl.id === control.id && !customTimeOpen}
                            title={`Start a new ${control.label} game`}
                            onClick={() => {
                              changeTimeControl(control)
                            }}
                          >
                            {shortLabel}
                          </button>
                        ))}
                      </div>
                      <small>Clock starts with the opening move.</small>
                    </div>
                    <label className="select-field">
                      <span>Time control</span>
                      <select value={customTimeOpen || timeControl.category === 'custom' ? 'custom' : timeControl.id} onChange={(event) => {
                        if (event.target.value === 'custom') setCustomTimeOpen(true)
                        else changeTimeControl(getTimeControl(event.target.value))
                      }} aria-label="Time control">
                        {TIME_CONTROLS.map((control) => <option key={control.id} value={control.id}>{control.label}</option>)}
                        <option value="custom">Custom…</option>
                      </select>
                    </label>
                    {customTimeOpen && (
                      <div className="custom-time" aria-label="Custom time control">
                        <label><span>Minutes</span><input type="number" min="0.1" max="1440" step="0.1" defaultValue={customTimeDraft.current.base} onChange={(event) => { customTimeDraft.current.base = event.target.value }} /></label>
                        <label><span>Increment</span><input type="number" min="0" max="600" defaultValue={customTimeDraft.current.increment} onChange={(event) => { customTimeDraft.current.increment = event.target.value }} /></label>
                        <label><span>Delay</span><input type="number" min="0" max="600" defaultValue={customTimeDraft.current.delay} onChange={(event) => { customTimeDraft.current.delay = event.target.value }} /></label>
                        <button className="secondary-button" type="button" onClick={applyCustomTimeControl}>Use custom time</button>
                      </div>
                    )}
                    <div className="game-preferences">
                      <button type="button" className="preference-toggle" aria-pressed={soundsEnabled} onClick={() => setSoundsEnabled((enabled) => !enabled)}>
                        {soundsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                        <span><strong>Move sounds</strong><small>{soundsEnabled ? 'On · original synthesized audio' : 'Off'}</small></span>
                      </button>
                    </div>
                  </div>
                )}
              </details>
              <div className="completion-actions" aria-label="Game completion actions">
                <button type="button" onClick={offerDraw} disabled={previewing || gameFinished || (mode === 'bot' && (thinking || !isHumanTurn(mode, game.turn(), humanColor)))}>
                  <Handshake size={16} /><span>Offer draw</span>
                </button>
                <button type="button" onClick={() => openDecision('resign')} disabled={previewing || gameFinished}>
                  <Flag size={16} /><span>Resign</span>
                </button>
              </div>

              <section className="game-panel__moves">
                <div className="section-heading"><div><span className="eyebrow">Notation</span><h3>Moves</h3></div><span>{previewing ? `Viewing ply ${previewPly} of ${history.length}` : history.length ? `${history.length} ply` : 'Ready'}</span></div>
                <MoveList
                  moves={history}
                  activePly={previewPly ?? history.length}
                  followingLatest={!previewing}
                  onSelectPly={selectPreviewPly}
                />
              </section>

              {gameFinished && (
                <section className="game-over-card" aria-label="Game complete">
                  <Trophy size={22} />
                  <div>
                    <span>Game complete · {currentResult}</span>
                    <strong>{currentStatus}</strong>
                    {mode === 'bot' && !isFallbackOpponent && <small className="game-over-card__message">{botProfile.name}: {botPostGameMessage(botProfile, currentResult, botColor)}</small>}
                  </div>
                  <div className="game-over-actions">
                    <button className="primary-button" type="button" onClick={reviewCurrentGame}><Search size={16} />Review game</button>
                    <button className="secondary-button" type="button" onClick={reset}><RefreshCw size={16} />Play again</button>
                  </div>
                </section>
              )}

              <details className="position-tools">
                <summary><span>Position tools</span><ChevronDown size={18} /></summary>
                <div>
                  <span className="field-label">{positionTransfer.contextLabel}</span>
                  <div className="transfer-actions" aria-label={positionTransfer.actionsLabel}>
                    <button className="secondary-button" type="button" onClick={() => void copyCurrentFen()}><Copy size={15} />{positionTransfer.copyLabel}</button>
                    <button className="secondary-button" type="button" onClick={downloadCurrentFen}><Download size={15} />Download FEN</button>
                  </div>
                  <label htmlFor="fen-input">Load a FEN position</label>
                  <textarea id="fen-input" value={fen} onChange={(event) => setFen(event.target.value)} placeholder="Paste FEN here…" rows={3} />
                  <button className="primary-button" type="button" onClick={loadFen} disabled={!fen.trim()}>Load position</button>
                </div>
              </details>
              {notice && <div className="notice" role="status">{notice}</div>}
            </aside>
          </section>
        )}

        {tab === 'review' && (
          <WorkspaceLoadBoundary label="Review">
            <Suspense fallback={<WorkspaceLoading label="Review" />}>
              <AnalysisWorkspace
                desktop={desktop}
                // This is derived from the position rather than the visual
                // `thinking` flag so Review cannot win the short race between a
                // human move and the bot effect starting its search.
                engineBusy={premoveWindow}
                currentPgn={sharePgn}
                enginePath={engineSettings.enginePath}
                threads={engineSettings.threads}
                hashMb={engineSettings.hashMb}
                reviewStore={reviewStore}
                onReviewSaved={markLinkedGameReviewed}
                retryStore={retryStore}
                onRetriesSaved={retainRetryItems}
                onOpenRetryQueue={openRetryQueue}
                requestedReviewTarget={requestedReviewTarget}
                onRequestedReviewTargetHandled={clearRequestedReviewTarget}
                requestedPlayPreviewTarget={requestedPlayPreviewTarget}
                onRequestedPlayPreviewTargetHandled={clearRequestedPlayPreviewTarget}
              />
            </Suspense>
          </WorkspaceLoadBoundary>
        )}

        {tab === 'train' && (
          <WorkspaceLoadBoundary label="Train">
            <Suspense fallback={<WorkspaceLoading label="Train" />}>
              <TrainingWorkspace
                tacticProgress={tacticProgress}
                onRecordTacticAttempt={recordTacticAttempt}
                retryItems={retryItems}
                requestedRetryKey={requestedRetryKey}
                onSaveRetryItem={saveRetryItem}
                onDeleteRetryItem={deleteRetryItem}
                onBackToReview={returnToReview}
                onOpenReview={() => navigateTo('review')}
              />
            </Suspense>
          </WorkspaceLoadBoundary>
        )}

        {tab === 'library' && (
          <section className="content-card content-card--wide">
            <div className="card-heading">
              <div><span className="eyebrow">On-device library</span><h2>Saved games</h2><p className={`database-status database-status--${databaseStatus.kind}`} role="status">{databaseStatus.message}</p></div>
              <button className="danger-button" type="button" disabled={libraryLoadState !== 'ready' || !library.length} onClick={clearPersistedLibrary}>Clear library</button>
            </div>
            {desktop && libraryLoadState !== 'ready' ? (
              <div className="empty-panel" aria-busy={libraryLoadState !== 'error'} role={libraryLoadState === 'error' ? 'alert' : 'status'}>
                {libraryLoadState === 'error' ? <Library size={30} /> : <RefreshCw className="spin" size={30} aria-hidden="true" />}
                <strong>{libraryLoadState === 'error' ? 'Couldn’t load saved games' : 'Loading saved games'}</strong>
                <span>{libraryLoadState === 'error' ? databaseStatus.message : 'Your board stays available while KnightClub opens this private library.'}</span>
                {libraryLoadState === 'error' && <button className="secondary-button" type="button" onClick={databaseReady ? retryDesktopLibraryLoad : () => window.location.reload()}>{databaseReady ? 'Try again' : 'Reload KnightClub'}</button>}
              </div>
            ) : library.length ? <>
              <div className="library-tools" role="search">
                <label className="library-search" htmlFor="library-search"><Search size={16} /><span className="sr-only">Search saved games</span><input id="library-search" value={libraryQuery} onChange={(event) => updateLibraryQuery(event.target.value)} placeholder="Search opponent, result or time…" /></label>
                <div className="library-filters" aria-label="Review filter">
                  <button type="button" className={libraryFilter === 'all' ? 'is-active' : ''} aria-pressed={libraryFilter === 'all'} onClick={() => updateLibraryFilter('all')}>All</button>
                  <button type="button" className={libraryFilter === 'unreviewed' ? 'is-active' : ''} aria-pressed={libraryFilter === 'unreviewed'} onClick={() => updateLibraryFilter('unreviewed')}>Needs review</button>
                  <button type="button" className={libraryFilter === 'reviewed' ? 'is-active' : ''} aria-pressed={libraryFilter === 'reviewed'} onClick={() => updateLibraryFilter('reviewed')}>Reviewed</button>
                </div>
              </div>
              {abortedGameCount > 0 && <button className="library-aborted-toggle" type="button" onClick={toggleAbortedGames}>
                {showAbortedGames ? `Hide ${abortedGameCount} aborted game${abortedGameCount === 1 ? '' : 's'}` : `Show ${abortedGameCount} aborted game${abortedGameCount === 1 ? '' : 's'}`}
              </button>}
              {visibleLibrary.length ? <LibraryResults games={visibleLibrary} revealCount={libraryRevealCount} onRevealMore={revealMoreLibrary} onReview={(item) => openStored(item, 'review')} onOpen={openStored} /> : <div className="empty-panel"><Library size={30} /><strong>No games match those filters</strong><span>Try clearing search or showing a different review status.</span></div>}
            </> : <div className="empty-panel"><Library size={30} /><strong>Your library is ready</strong><span>Finish a game and it will appear here automatically.</span></div>}
          </section>
        )}

        {tab === 'insights' && (
          desktop && libraryLoadState !== 'ready' ? (
            <section className="content-card content-card--wide">
              <div className="empty-panel" aria-busy={libraryLoadState !== 'error'} role={libraryLoadState === 'error' ? 'alert' : 'status'}>
                {libraryLoadState === 'error' ? <BarChart3 size={30} /> : <RefreshCw className="spin" size={30} aria-hidden="true" />}
                <strong>{libraryLoadState === 'error' ? 'Couldn’t load insights' : 'Loading your local insights'}</strong>
                <span>{libraryLoadState === 'error' ? databaseStatus.message : 'KnightClub is opening your private game history on demand.'}</span>
                {libraryLoadState === 'error' && <button className="secondary-button" type="button" onClick={databaseReady ? retryDesktopLibraryLoad : () => window.location.reload()}>{databaseReady ? 'Try again' : 'Reload KnightClub'}</button>}
              </div>
            </section>
          ) : (
            <WorkspaceLoadBoundary label="Insights">
              <Suspense fallback={<WorkspaceLoading label="Insights" />}>
                <InsightsDashboard
                  games={library}
                  onPlay={() => navigateTo('play')}
                  onReviewGame={(item) => openStored(item, 'review')}
                />
              </Suspense>
            </WorkspaceLoadBoundary>
          )
        )}
      </main>

      {promotion && (
        <PromotionDialog
          kind={promotion.kind}
          choices={promotion.choices}
          color={promotion.kind === 'premove' ? humanColor : game.turn()}
          onChoose={choosePromotion}
          onCancel={() => { setSelected(null); setPromotion(null) }}
        />
      )}
      {decision && <GameDecisionDialog decision={decision} onCancel={cancelDecision} onConfirm={confirmDecision} />}
      </div>
    </ClockRuntime>
  )
}
