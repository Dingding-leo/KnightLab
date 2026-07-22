import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from 'react'
import { Chess, type PieceSymbol, type Square } from 'chess.js'
import {
  BarChart3,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  CircleStop,
  Copy,
  Download,
  FlipHorizontal2,
  Gauge,
  GitBranch,
  Import,
  LoaderCircle,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Undo2,
} from 'lucide-react'
import {
  createFenTimeline,
  createPgnTimeline,
  evaluationForPerspective,
  formatAnalysisScore,
  uciPvToSan,
  wdlForPerspective,
  type AnalysisTimeline,
  type EvaluationPerspective,
} from '../analysis/analysisModel'
import {
  StockfishAnalysisClient,
  type AnalysisLine,
  type AnalysisResponse,
  type AnalysisSettings,
} from '../analysis/stockfishAnalysisClient'
import { AmbientAnalysisCache } from '../analysis/ambientAnalysisCache'
import { disposeAndClearClient, disposeClientIfCurrent } from '../analysis/clientLifecycle'
import { readAnalysisFile } from '../analysis/fileImport'
import { createLatestRequestGate } from '../analysis/latestRequest'
import { inertAnalysisBoardInteraction } from '../analysis/analysisBoardInteraction'
import {
  MAX_VARIATION_PLIES,
  appendVariationMove,
  createVariationState,
  resetVariation,
  undoVariationMove,
  variationPgn,
  type VariationPromotion,
  type VariationState,
} from '../analysis/variationLine'
import { copyText, downloadText } from '../domain/textTransfer'
import { legalMovesFrom } from '../domain/chess'
import { runGameReview, type GameReview, type ReviewProgress } from '../review/gameReviewRunner'
import { saveCompletedReviewInBackground } from '../review/backgroundReviewSave'
import type { MoveClassification, ReviewedMove } from '../review/reviewModel'
import { buildCoachGuidanceFromTimeline, type CoachGuidance } from '../review/coach'
import {
  evidenceSquaresForGuidance,
  fullReviewActionFor,
  reviewNavigationForKey,
  reviewPlyAfter,
} from '../review/reviewWorkspaceUtils'
import { selectedReviewMoveAtPly } from '../review/reviewSelection'
import {
  resolvePlayPreviewReviewPly,
  type PlayPreviewReviewTarget,
} from '../review/playPreviewReviewTarget'
import {
  createInitialWorkspaceState,
  liveTimelineFor,
  type RequestedReviewTarget,
} from '../review/reviewWorkspaceState'
import {
  liveGameContinuation,
  type LiveGameContinuation,
} from '../review/liveGameContinuation'
import {
  createRetryItemFromVerifiedTimeline,
  createVerifiedRetryTimeline,
  type RetryItem,
} from '../review/retry'
import {
  MOVE_LIST_INITIAL_VISIBLE_ROWS,
  progressiveMoveRows,
  revealEarlierMoveRows,
} from './moveListPagination'
import { saveRetryItemsSerially } from '../review/retryQueuePersistence'
import {
  createPersistedReview,
  createReviewKey,
  type PersistedReview,
} from '../review/reviewPersistence'
import { ChessBoard } from './ChessBoard'
import { ChessPiece } from './ChessPiece'

interface AnalysisWorkspaceProps {
  desktop: boolean
  /** A live bot move has priority over optional review analysis. */
  engineBusy?: boolean
  currentPgn: string
  enginePath: string | null
  threads: number
  hashMb: number
  reviewStore?: {
    load: (reviewKey: string) => Promise<PersistedReview | null>
    save: (review: PersistedReview) => Promise<void>
  }
  onReviewSaved?: (review: PersistedReview) => void
  retryStore?: {
    load: (retryKey: string) => Promise<RetryItem | null>
    save: (item: RetryItem) => Promise<void>
  }
  onRetriesSaved?: (items: RetryItem[]) => void
  onOpenRetryQueue?: (retryKey: string) => void
  requestedReviewTarget?: RequestedReviewTarget | null
  onRequestedReviewTargetHandled?: () => void
  requestedPlayPreviewTarget?: PlayPreviewReviewTarget | null
  onRequestedPlayPreviewTargetHandled?: () => void
}

interface DisplayLine extends AnalysisLine {
  san: string[]
}

interface DisplayAnalysis extends AnalysisResponse {
  lines: DisplayLine[]
  cached: boolean
}

interface AnalysisMoveRow {
  number: number
  white?: AnalysisTimeline['moves'][number]
  black?: AnalysisTimeline['moves'][number]
}

interface AnalysisMoveListProps {
  moveRows: readonly AnalysisMoveRow[]
  ply: number
  review: GameReview | null
  onSelectPly: (ply: number) => void
}

interface AnalysisMovePickerProps {
  moves: readonly AnalysisTimeline['moves'][number][]
  ply: number
  onSelectPly: (ply: number) => void
}

export function ReviewSaveNotice({ saving }: { saving: boolean }) {
  if (!saving) return null
  return <p className="review-retained" role="status">Saving review privately on this device…</p>
}

type RetrySaveAction = 'batch' | 'single'

interface RetryPracticeButtonProps {
  action: RetrySaveAction
  savingAction: RetrySaveAction | null
  className?: string
  onClick: () => void
}

export function RetrySaveNotice({ action }: { action: RetrySaveAction | null }) {
  if (!action) return null
  const target = action === 'batch' ? 'key moments' : 'this position'
  return <p className="review-retained" role="status" aria-live="polite">Preparing {target} for your training queue on this device…</p>
}

export function RetryPracticeButton({
  action,
  savingAction,
  className,
  onClick,
}: RetryPracticeButtonProps) {
  const saving = savingAction !== null
  const active = savingAction === action
  const label = active
    ? action === 'batch' ? 'Preparing key moments…' : 'Preparing this position…'
    : action === 'batch' ? 'Practice key moments' : 'Practice this position'

  return (
    <button
      className={className}
      type="button"
      disabled={saving}
      aria-busy={active}
      onClick={onClick}
    >
      {active ? <LoaderCircle className="spin" size={15} aria-hidden="true" /> : <PlayCircle size={15} aria-hidden="true" />}
      {label}
    </button>
  )
}

interface LiveGameContinuationNoticeProps {
  continuation: LiveGameContinuation | null
  onUpdate: () => void
}

/** Keeps an older Review position stable until the player explicitly updates it. */
export function LiveGameContinuationNotice({ continuation, onUpdate }: LiveGameContinuationNoticeProps) {
  if (!continuation) return null
  const latestMove = continuation.latestMove
  const latestMoveLabel = `${latestMove.moveNumber}${latestMove.color === 'b' ? '…' : '.'} ${latestMove.san}`
  const addedMoveLabel = continuation.addedPly === 1 ? 'move' : 'moves'

  return (
    <aside className="analysis-live-update" role="status" aria-live="polite">
      <span>
        <strong>Live game advanced by {continuation.addedPly} {addedMoveLabel}.</strong>
        <small>Latest: {latestMoveLabel}. Update Review when you&apos;re ready.</small>
      </span>
      <button className="secondary-button" type="button" onClick={onUpdate} aria-label={`Update review to include ${latestMoveLabel}`}>
        <RefreshCw size={14} aria-hidden="true" />Update review
      </button>
    </aside>
  )
}

const effortOptions = {
  quick: { label: 'Quick · 0.25s', moveTimeMs: 250, depth: 12 },
  balanced: { label: 'Balanced · 0.8s', moveTimeMs: 800, depth: 18 },
  deep: { label: 'Deep · 2s', moveTimeMs: 2000, depth: 22 },
} as const

type Effort = keyof typeof effortOptions
type PromotionPiece = Extract<PieceSymbol, 'q' | 'r' | 'b' | 'n'>
type VariationPromotionChoice = { from: Square; to: Square; choices: PromotionPiece[] }

const promotionNames: Partial<Record<PieceSymbol, string>> = {
  q: 'Queen',
  r: 'Rook',
  b: 'Bishop',
  n: 'Knight',
}

function compactNumber(value: number | null): string {
  if (value === null) return '—'
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function lineLabel(index: number): string {
  return index === 0 ? 'Best' : `Line ${index + 1}`
}

function displayAnalysis(response: AnalysisResponse, cached: boolean): DisplayAnalysis {
  return {
    ...response,
    cached,
    lines: response.lines.map((line) => ({
      ...line,
      san: uciPvToSan(response.fen, line.pv),
    })),
  }
}

const classificationLabels: Record<MoveClassification, string> = {
  brilliant: 'Brilliant',
  great: 'Great',
  best: 'Best',
  excellent: 'Excellent',
  good: 'Good',
  book: 'Book',
  inaccuracy: 'Inaccuracy',
  mistake: 'Mistake',
  miss: 'Miss',
  blunder: 'Blunder',
  forced: 'Forced',
}

const ReviewBadge = memo(function ReviewBadge({ move }: { move?: ReviewedMove }) {
  if (!move) return null
  return <em className={`review-badge review-badge--${move.classification}`}>{classificationLabels[move.classification]}</em>
})

interface AnalysisMoveRowProps {
  row: AnalysisMoveRow
  whiteCurrent: boolean
  blackCurrent: boolean
  whiteReview?: ReviewedMove
  blackReview?: ReviewedMove
}

/** A notation row changes only when one of its own buttons or badges changes. */
const AnalysisMoveRow = memo(function AnalysisMoveRow({
  row,
  whiteCurrent,
  blackCurrent,
  whiteReview,
  blackReview,
}: AnalysisMoveRowProps) {
  return (
    <div className="analysis-move-row">
      <span>{row.number}.</span>
      {row.white && (
        <button
          type="button"
          data-ply={row.white.ply}
          className={whiteCurrent ? 'is-current' : ''}
          aria-current={whiteCurrent ? 'step' : undefined}
        >
          {row.white.san}<ReviewBadge move={whiteReview} />
        </button>
      )}
      {row.black && (
        <button
          type="button"
          data-ply={row.black.ply}
          className={blackCurrent ? 'is-current' : ''}
          aria-current={blackCurrent ? 'step' : undefined}
        >
          {row.black.san}<ReviewBadge move={blackReview} />
        </button>
      )}
    </div>
  )
})

/**
 * The mobile picker changes value while navigating, but its option text is
 * immutable for a loaded timeline. Isolate those options so a long game does
 * not rebuild them for every Review progress update or arrow-key step.
 */
const AnalysisMovePickerOptions = memo(function AnalysisMovePickerOptions({
  moves,
}: Pick<AnalysisMovePickerProps, 'moves'>) {
  return (
    <>
      <option value={0}>Start position</option>
      {moves.map((move) => (
        <option key={move.ply} value={move.ply}>
          {move.moveNumber}{move.color === 'b' ? '…' : '.'} {move.san}
        </option>
      ))}
    </>
  )
})

export const AnalysisMovePicker = memo(function AnalysisMovePicker({ moves, ply, onSelectPly }: AnalysisMovePickerProps) {
  const onSelectPlyRef = useRef(onSelectPly)
  useLayoutEffect(() => {
    onSelectPlyRef.current = onSelectPly
  }, [onSelectPly])

  const selectPly = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const nextPly = Number(event.target.value)
    if (!Number.isInteger(nextPly) || nextPly < 0 || nextPly > moves.length) return
    onSelectPlyRef.current(nextPly)
  }, [moves.length])

  return (
    <label className="analysis-mobile-move-picker">
      <span>Jump to move</span>
      <select aria-label="Jump to a game position" value={ply} onChange={selectPly}>
        <AnalysisMovePickerOptions moves={moves} />
      </select>
    </label>
  )
})

/**
 * A full review reports progress before and after every ply. Keep the long
 * notation list out of those progress-only renders. During navigation, rows
 * retain their stable move and review references so only the old and new
 * current rows need to render again.
 */
export const AnalysisMoveList = memo(function AnalysisMoveList({ moveRows, ply, review, onSelectPly }: AnalysisMoveListProps) {
  const onSelectPlyRef = useRef(onSelectPly)
  const [visibleRowCount, setVisibleRowCount] = useState(MOVE_LIST_INITIAL_VISIBLE_ROWS)
  const finalRow = moveRows.at(-1)
  const maxPly = finalRow?.black?.ply ?? finalRow?.white?.ply ?? 0
  useLayoutEffect(() => {
    onSelectPlyRef.current = onSelectPly
  }, [onSelectPly])

  const selectPlyFromNotation = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return
    const button = event.target.closest<HTMLButtonElement>('button[data-ply]')
    if (!button || !event.currentTarget.contains(button)) return
    const nextPly = Number(button.dataset.ply)
    if (!Number.isInteger(nextPly) || nextPly < 0 || nextPly > maxPly) return
    onSelectPlyRef.current(nextPly)
  }, [maxPly])

  // A custom setup FEN may begin with Black, so map real plies to rows instead
  // of assuming every pair starts with a White move or scanning on each arrow.
  const rowIndexByPly = useMemo(() => {
    const indexes = new Map<number, number>()
    moveRows.forEach((row, index) => {
      if (row.white) indexes.set(row.white.ply, index)
      if (row.black) indexes.set(row.black.ply, index)
    })
    return indexes
  }, [moveRows])
  const activeRowIndex = Number.isInteger(ply) && ply >= 1
    ? rowIndexByPly.get(ply) ?? null
    : null
  const page = useMemo(
    () => progressiveMoveRows(moveRows, visibleRowCount, activeRowIndex),
    [activeRowIndex, moveRows, visibleRowCount],
  )
  const nextVisibleRowCount = revealEarlierMoveRows(visibleRowCount, moveRows.length)
  const nextRevealCount = useMemo(() => {
    const nextPage = progressiveMoveRows(moveRows, nextVisibleRowCount, activeRowIndex)
    const mountedRows = page.trailingRows.length + (page.pinnedRow ? 1 : 0)
    const nextMountedRows = nextPage.trailingRows.length + (nextPage.pinnedRow ? 1 : 0)
    return Math.max(0, nextMountedRows - mountedRows)
  }, [activeRowIndex, moveRows, nextVisibleRowCount, page.pinnedRow, page.trailingRows.length])
  const showEarlierMoves = useCallback(() => {
    setVisibleRowCount((count) => revealEarlierMoveRows(count, moveRows.length))
  }, [moveRows.length])

  const row = (item: AnalysisMoveRow) => (
    <AnalysisMoveRow
      key={item.number}
      row={item}
      whiteCurrent={ply === item.white?.ply}
      blackCurrent={ply === item.black?.ply}
      whiteReview={item.white ? review?.moves[item.white.ply - 1] : undefined}
      blackReview={item.black ? review?.moves[item.black.ply - 1] : undefined}
    />
  )

  return (
    <div className="analysis-moves" aria-label="Game moves" onClick={selectPlyFromNotation}>
      <button type="button" data-ply={0} className={ply === 0 ? 'is-current' : ''} aria-current={ply === 0 ? 'step' : undefined}>Start position</button>
      {page.hiddenRowCount > 0 && (
        <button
          className="analysis-moves__show-earlier"
          type="button"
          onClick={showEarlierMoves}
          aria-label={`Show ${nextRevealCount} earlier moves; ${page.hiddenRowCount} earlier moves hidden`}
        >Show {nextRevealCount} earlier moves</button>
      )}
      {page.hiddenBeforePinnedCount > 0 && (
        <p className="analysis-moves__omitted">{page.hiddenBeforePinnedCount} earlier move{page.hiddenBeforePinnedCount === 1 ? '' : 's'} hidden</p>
      )}
      {page.pinnedRow && row(page.pinnedRow)}
      {page.hiddenAfterPinnedCount > 0 && (
        <p className="analysis-moves__omitted">{page.hiddenAfterPinnedCount} moves between this position and the newest notation hidden</p>
      )}
      {page.trailingRows.map(row)}
    </div>
  )
})

const retryPriority: Record<ReviewedMove['classification'], number> = {
  blunder: 0,
  miss: 1,
  mistake: 2,
  inaccuracy: 3,
  brilliant: 4,
  great: 4,
  best: 4,
  excellent: 4,
  good: 4,
  book: 4,
  forced: 4,
}

function compareRetryCandidates(left: ReviewedMove, right: ReviewedMove): number {
  const priority = retryPriority[left.classification] - retryPriority[right.classification]
  if (priority) return priority
  const loss = right.expectedLoss - left.expectedLoss
  if (loss) return loss
  return left.ply - right.ply
}

export function CoachEvidenceCard({ guidance }: { guidance: CoachGuidance | null }) {
  if (!guidance) return null
  const hasEvidence = guidance.evidence.length > 0
  return (
    <section className="coach-evidence" aria-label={hasEvidence ? "Coach's evidence" : "Coach's comparison"}>
      <div><Sparkles size={15} /><strong>Coach&apos;s {hasEvidence ? 'evidence' : 'comparison'}</strong></div>
      <p>{guidance.summary}</p>
      {guidance.evidence.length > 0 && (
        <ul>
          {guidance.evidence.map((item, index) => <li key={`${item.kind}-${index}`}>{item.statement}</li>)}
        </ul>
      )}
      {hasEvidence && <small>Evidence squares are marked on the board.</small>}
      {guidance.continuation.length > 0 && <small>Saved Stockfish line: {guidance.continuation.join(' ')}</small>}
      <aside><strong>Focus next time</strong><span>{guidance.focus}</span></aside>
    </section>
  )
}

export function AnalysisWorkspace({
  desktop,
  engineBusy = false,
  currentPgn,
  enginePath,
  threads,
  hashMb,
  reviewStore,
  onReviewSaved,
  retryStore,
  onRetriesSaved,
  onOpenRetryQueue,
  requestedReviewTarget,
  onRequestedReviewTargetHandled,
  requestedPlayPreviewTarget,
  onRequestedPlayPreviewTargetHandled,
}: AnalysisWorkspaceProps) {
  const [initialWorkspace] = useState(() => createInitialWorkspaceState(
    currentPgn,
    requestedReviewTarget,
    requestedPlayPreviewTarget,
  ))
  const [timeline, setTimeline] = useState(initialWorkspace.timeline)
  const [ply, setPly] = useState(initialWorkspace.ply)
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
  const [variation, setVariation] = useState<VariationState | null>(null)
  const [selectedVariationSquare, setSelectedVariationSquare] = useState<Square | null>(null)
  const [variationPromotion, setVariationPromotion] = useState<VariationPromotionChoice | null>(null)
  const [pgnInput, setPgnInput] = useState(currentPgn)
  const [fenInput, setFenInput] = useState('')
  const [importError, setImportError] = useState('')
  const [importNotice, setImportNotice] = useState('')
  const [enabled, setEnabled] = useState(true)
  // Candidate lines are an ambient aid while reviewing; start light and let
  // players opt into deeper or multi-line work when they need it.
  const [effort, setEffort] = useState<Effort>('quick')
  const [multiPv, setMultiPv] = useState(1)
  const [perspective, setPerspective] = useState<EvaluationPerspective>('white')
  const [analysis, setAnalysis] = useState<DisplayAnalysis | null>(null)
  const [analysisError, setAnalysisError] = useState('')
  const [loading, setLoading] = useState(false)
  const [review, setReview] = useState<GameReview | null>(null)
  const [reviewProgress, setReviewProgress] = useState<ReviewProgress | null>(null)
  const [reviewRunning, setReviewRunning] = useState(false)
  const [reviewSaving, setReviewSaving] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [reviewHydrating, setReviewHydrating] = useState(() => {
    return Boolean(reviewStore && timeline.source === 'pgn' && timeline.moves.length)
  })
  const [reviewOrigin, setReviewOrigin] = useState<'saved' | 'restored' | null>(null)
  const [retrySavingAction, setRetrySavingAction] = useState<RetrySaveAction | null>(null)
  const [retryError, setRetryError] = useState('')
  const client = useRef<StockfishAnalysisClient | null>(null)
  const ambientAnalysisCache = useRef(new AmbientAnalysisCache())
  const reviewClient = useRef<StockfishAnalysisClient | null>(null)
  const reviewAbort = useRef<AbortController | null>(null)
  const reviewLoadVersion = useRef(0)
  const reviewRunVersion = useRef(0)
  const handledPlayPreviewTarget = useRef<PlayPreviewReviewTarget | null>(null)
  const mounted = useRef(true)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const fileImportGate = useRef(createLatestRequestGate())
  const promotionChoiceRef = useRef<HTMLButtonElement | null>(null)

  const position = timeline.positions[ply] ?? timeline.positions[0]
  const displayedPosition = variation?.position ?? position
  const boardGame = useMemo(() => new Chess(displayedPosition.fen), [displayedPosition.fen])
  const liveTimeline = useMemo(
    () => liveTimelineFor(currentPgn, timeline),
    [currentPgn, timeline],
  )
  const liveContinuation = useMemo(
    () => liveGameContinuation(timeline, liveTimeline),
    [liveTimeline, timeline],
  )
  const positionTerminal = boardGame.isGameOver()
  const variationActive = variation !== null
  const variationAtLimit = Boolean(variation && variation.line.moves.length >= MAX_VARIATION_PLIES)
  const variationHasPgn = Boolean(variation?.line.moves.length)
  const engineThreads = desktop ? threads : 1
  const engineHashMb = desktop ? hashMb : Math.min(hashMb, 128)
  const maxPly = timeline.positions.length - 1
  const selectedNavigationMove = timeline.moves[ply - 1] ?? null
  const selectedNavigationMoveLabel = selectedNavigationMove
    ? `${selectedNavigationMove.moveNumber}${selectedNavigationMove.color === 'b' ? '…' : '.'} ${selectedNavigationMove.san}`
    : null
  const navigationStatus = variation
    ? `Temporary variation · ${variation.line.moves.length} ${variation.line.moves.length === 1 ? 'move' : 'moves'}`
    : selectedNavigationMoveLabel
      ? `${selectedNavigationMoveLabel} · ${ply}/${maxPly}`
      : `Start position · 0/${maxPly}`
  const navigationAriaLabel = variation
    ? `Temporary variation with ${variation.line.moves.length} ${variation.line.moves.length === 1 ? 'move' : 'moves'} from main-game position ${variation.line.anchorPly}`
    : selectedNavigationMoveLabel
      ? `After ${selectedNavigationMoveLabel}, position ${ply} of ${maxPly}`
      : `Start position, position 0 of ${maxPly}`
  const reviewKey = useMemo(
    () => timeline.source === 'pgn' && timeline.moves.length ? createReviewKey(timeline) : null,
    [timeline],
  )
  // A completed report can surface several training calls-to-action while the
  // player browses it. Validate the immutable game replay once, then retain a
  // private snapshot so cursor movement only checks the selected ply.
  const verifiedRetryTimeline = useMemo(() => {
    if (!review || !reviewKey) return null
    return createVerifiedRetryTimeline(timeline)
  }, [review, reviewKey, timeline])
  const fullReviewAction = fullReviewActionFor({
    engineBusy,
    reviewHydrating,
    hasReview: review !== null,
  })
  const selectedReview = variationActive ? null : selectedReviewMoveAtPly(review, ply)
  const coachGuidance = useMemo(() => {
    return buildCoachGuidanceFromTimeline(timeline, selectedReview)
  }, [selectedReview, timeline])
  const coachEvidenceSquares = useMemo(() => evidenceSquaresForGuidance(coachGuidance), [coachGuidance])
  const variationTargets = useMemo(() => {
    if (!variation || !selectedVariationSquare || variationPromotion || variationAtLimit) return new Set<Square>()
    return new Set<Square>(legalMovesFrom(boardGame, selectedVariationSquare).map((move) => move.to))
  }, [boardGame, selectedVariationSquare, variation, variationAtLimit, variationPromotion])
  const selectedRetryItem = useMemo(() => {
    if (!selectedReview || !reviewKey || !verifiedRetryTimeline) return null
    return createRetryItemFromVerifiedTimeline({
      verifiedTimeline: verifiedRetryTimeline,
      move: selectedReview,
      reviewKey,
      guidance: coachGuidance,
    })
  }, [coachGuidance, reviewKey, selectedReview, verifiedRetryTimeline])
  const batchRetryItems = useMemo(() => {
    if (!review || !reviewKey || !verifiedRetryTimeline) return []
    const candidates = review.moves
      .filter((move) => move.isBestMove === false && move.confidence === 'normal'
        && ['inaccuracy', 'mistake', 'miss', 'blunder'].includes(move.classification))
      .sort(compareRetryCandidates)
      .slice(0, 12)
    const items: RetryItem[] = []
    for (const move of candidates) {
      const item = createRetryItemFromVerifiedTimeline({
        verifiedTimeline: verifiedRetryTimeline,
        move,
        reviewKey,
        guidance: buildCoachGuidanceFromTimeline(timeline, move),
      })
      if (item) items.push(item)
      if (items.length === 3) break
    }
    return items
  }, [review, reviewKey, timeline, verifiedRetryTimeline])
  const retrySaving = retrySavingAction !== null
  const moveRows = useMemo(
    () => {
      const rows = new Map<number, AnalysisMoveRow>()
      for (const move of timeline.moves) {
        const row = rows.get(move.moveNumber) ?? { number: move.moveNumber }
        if (move.color === 'w') row.white = move
        else row.black = move
        rows.set(move.moveNumber, row)
      }
      return [...rows.values()]
    },
    [timeline.moves],
  )

  const isReviewRunCurrent = (version: number) => {
    return mounted.current && version === reviewRunVersion.current
  }

  const clearVariationInteraction = useCallback(() => {
    setVariation(null)
    setSelectedVariationSquare(null)
    setVariationPromotion(null)
  }, [])

  /** Any main-line navigation intentionally leaves a temporary branch behind. */
  const selectMainlinePly = useCallback((nextPly: number) => {
    const discardingMoves = Boolean(variation?.line.moves.length)
    clearVariationInteraction()
    setPly(Math.max(0, Math.min(maxPly, nextPly)))
    if (discardingMoves) {
      setImportError('')
      setImportNotice('Returned to the main game. The temporary variation was not saved.')
    }
  }, [clearVariationInteraction, maxPly, variation])

  const beginVariation = useCallback(() => {
    if (new Chess(position.fen).isGameOver()) return
    const next = createVariationState(position.fen, ply)
    if (!next) {
      setImportNotice('')
      setImportError('This position could not be opened for a temporary variation.')
      return
    }
    setVariation(next)
    setSelectedVariationSquare(null)
    setVariationPromotion(null)
    setImportError('')
    setImportNotice('Temporary variation started. Try any legal continuation; the main game stays unchanged.')
  }, [ply, position.fen])

  const commitVariationMove = useCallback((from: Square, to: Square, promotion?: VariationPromotion) => {
    if (!variation) return
    const next = appendVariationMove(variation, { from, to, promotion })
    setSelectedVariationSquare(null)
    setVariationPromotion(null)
    if (!next) {
      setImportNotice('')
      setImportError('That move is not legal in this temporary variation.')
      return
    }
    setVariation(next)
    setImportError('')
    setImportNotice(`Temporary variation: ${next.line.moves.at(-1)?.san ?? 'move added'}. Stockfish will evaluate this position locally.`)
  }, [variation])

  const attemptVariationMove = useCallback((from: Square, to: Square) => {
    if (!variation || variationPromotion) return
    const piece = boardGame.get(from)
    if (!piece || piece.color !== boardGame.turn()) return
    const candidates = legalMovesFrom(boardGame, from).filter((move) => move.to === to)
    if (!candidates.length) {
      setSelectedVariationSquare(null)
      return
    }
    const choices = [...new Set(candidates.map((move) => move.promotion).filter(Boolean))] as PromotionPiece[]
    if (choices.length) {
      setVariationPromotion({ from, to, choices })
      return
    }
    commitVariationMove(from, to)
  }, [boardGame, commitVariationMove, variation, variationPromotion])

  const selectVariationSquare = useCallback((square: Square) => {
    if (!variation || variationPromotion) return
    const piece = boardGame.get(square)
    if (!selectedVariationSquare || piece?.color === boardGame.turn()) {
      setSelectedVariationSquare(piece?.color === boardGame.turn() ? square : null)
      return
    }
    attemptVariationMove(selectedVariationSquare, square)
  }, [attemptVariationMove, boardGame, selectedVariationSquare, variation, variationPromotion])

  const undoTemporaryVariation = useCallback(() => {
    if (!variation) return
    const next = undoVariationMove(variation)
    setSelectedVariationSquare(null)
    setVariationPromotion(null)
    if (!next) {
      setImportNotice('')
      setImportError('This temporary variation could not be replayed.')
      return
    }
    setVariation(next)
    setImportError('')
    setImportNotice(next.line.moves.length ? 'Last temporary move removed.' : 'Temporary variation reset to its source position.')
  }, [variation])

  const resetTemporaryVariation = useCallback(() => {
    if (!variation) return
    const next = resetVariation(variation)
    setSelectedVariationSquare(null)
    setVariationPromotion(null)
    if (!next) {
      setImportNotice('')
      setImportError('This temporary variation could not be reset.')
      return
    }
    setVariation(next)
    setImportError('')
    setImportNotice('Temporary variation reset to its source position.')
  }, [variation])

  const returnToMainLine = useCallback(() => {
    if (!variation) return
    const anchorPly = variation.line.anchorPly
    clearVariationInteraction()
    setPly(anchorPly)
    setImportError('')
    setImportNotice('Returned to the main game. The temporary variation was not saved.')
  }, [clearVariationInteraction, variation])

  useEffect(() => {
    if (!enabled || reviewRunning || positionTerminal || engineBusy) {
      client.current?.cancel()
      setLoading(false)
      setAnalysis(null)
      setAnalysisError('')
      return
    }

    const selectedEffort = effortOptions[effort]
    const settings: AnalysisSettings = {
      moveTimeMs: selectedEffort.moveTimeMs,
      depth: selectedEffort.depth,
      nodes: null,
      multiPv,
      threads: engineThreads,
      hashMb: engineHashMb,
    }
    const request = {
      backend: desktop ? 'desktop' as const : 'browser' as const,
      enginePath,
      fen: displayedPosition.fen,
      settings,
    }
    const cached = ambientAnalysisCache.current.get(request)
    if (cached) {
      try {
        setAnalysis(displayAnalysis(cached, true))
        setAnalysisError('')
      } catch (error) {
        setAnalysis(null)
        setAnalysisError(error instanceof Error ? error.message : 'Cached Stockfish analysis could not be displayed.')
      }
      setLoading(false)
      return
    }

    client.current ??= new StockfishAnalysisClient()
    const analysisClient = client.current
    let active = true

    setLoading(true)
    setAnalysis(null)
    setAnalysisError('')
    const timer = window.setTimeout(() => {
      void analysisClient.analyze(displayedPosition.fen, enginePath, settings)
        .then((response) => {
          if (!active) return
          const next = displayAnalysis(response, false)
          ambientAnalysisCache.current.set(request, response)
          if (!active) return
          setAnalysis(next)
          setLoading(false)
        })
        .catch((error: unknown) => {
          if (!active) return
          if (error instanceof Error && error.name === 'AbortError') return
          setAnalysisError(error instanceof Error ? error.message : 'Stockfish analysis failed.')
          setLoading(false)
        })
    }, 140)

    return () => {
      active = false
      window.clearTimeout(timer)
      analysisClient.cancel()
    }
  }, [desktop, displayedPosition.fen, effort, enabled, engineBusy, engineHashMb, enginePath, engineThreads, multiPv, positionTerminal, reviewRunning])

  useEffect(() => {
    const importGate = fileImportGate.current
    mounted.current = true
    return () => {
      mounted.current = false
      reviewRunVersion.current += 1
      importGate.invalidate()
      reviewAbort.current?.abort()
      disposeAndClearClient(client)
      disposeAndClearClient(reviewClient)
      reviewAbort.current = null
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return
      const target = event.target instanceof HTMLElement ? event.target : null
      const editable = Boolean(target?.isContentEditable
        || (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)))
      if (event.key === 'Escape' && !editable && variationPromotion) {
        event.preventDefault()
        setVariationPromotion(null)
        return
      }
      if (event.key === 'Escape' && !editable && selectedVariationSquare) {
        event.preventDefault()
        setSelectedVariationSquare(null)
        return
      }
      const action = reviewNavigationForKey({
        key: event.key,
        editable,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
      })
      if (!action) return
      event.preventDefault()
      // A promotion choice is a temporary, focused decision. Review arrow keys
      // must not silently throw away the whole branch while it is open.
      if (variationPromotion) return
      clearVariationInteraction()
      setPly((value) => reviewPlyAfter(action, value, maxPly))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [clearVariationInteraction, maxPly, selectedVariationSquare, variationPromotion])

  useEffect(() => {
    if (!variationPromotion) return
    const frame = window.requestAnimationFrame(() => promotionChoiceRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [variationPromotion])

  useEffect(() => {
    const version = ++reviewLoadVersion.current
    setReview(null)
    setReviewOrigin(null)
    setReviewError('')
    if (!reviewStore || !reviewKey) {
      setReviewHydrating(false)
      return
    }

    setReviewHydrating(true)
    void reviewStore.load(reviewKey)
      .then((record) => {
        if (version !== reviewLoadVersion.current || !record) return
        if (record.startFen !== timeline.startFen || record.moveCount !== timeline.moves.length) return
        setReview(record.report)
        setReviewOrigin('restored')
      })
      .catch((error: unknown) => {
        if (version !== reviewLoadVersion.current) return
        setReviewError(error instanceof Error ? `Saved review could not be restored: ${error.message}` : 'Saved review could not be restored.')
      })
      .finally(() => {
        if (version === reviewLoadVersion.current) setReviewHydrating(false)
      })

    return () => {
      if (version === reviewLoadVersion.current) reviewLoadVersion.current += 1
    }
  }, [reviewKey, reviewStore, timeline.moves.length, timeline.startFen])

  useEffect(() => {
    if (!requestedPlayPreviewTarget
      || handledPlayPreviewTarget.current === requestedPlayPreviewTarget) return

    handledPlayPreviewTarget.current = requestedPlayPreviewTarget
    // A Train retry has its own source-loading contract and always wins over
    // the transient Play handoff if the two ever overlap.
    if (!requestedReviewTarget) {
      const targetPly = resolvePlayPreviewReviewPly(timeline, requestedPlayPreviewTarget)
      if (targetPly !== null) selectMainlinePly(targetPly)
    }
    onRequestedPlayPreviewTargetHandled?.()
  }, [onRequestedPlayPreviewTargetHandled, requestedPlayPreviewTarget, requestedReviewTarget, selectMainlinePly, timeline])

  useEffect(() => {
    if (!requestedReviewTarget) return
    let cancelled = false
    const target = requestedReviewTarget
    const targetVersion = ++reviewRunVersion.current
    reviewAbort.current?.abort()
    disposeAndClearClient(reviewClient)
    reviewAbort.current = null
    fileImportGate.current.invalidate()
    // This queued navigation is a new user intent. Invalidate both a running
    // review and any earlier saved-review lookup before awaiting its source.
    reviewLoadVersion.current += 1
    clearVariationInteraction()
    setReviewRunning(false)
    setReviewSaving(false)
    setReviewProgress(null)
    setReviewError('')

    void (async () => {
      try {
        if (!reviewStore) throw new Error('The source review is not available in this session.')
        const record = await reviewStore.load(target.reviewKey)
        if (cancelled || !isReviewRunCurrent(targetVersion)) return
        if (!record) throw new Error('The saved source review is no longer available on this device.')
        const restored = createPgnTimeline(record.sourcePgn)
        if (createReviewKey(restored) !== target.reviewKey
          || target.sourcePly < 1
          || target.sourcePly > restored.moves.length) {
          throw new Error('The saved source review does not match this practice position.')
        }
        if (cancelled || !isReviewRunCurrent(targetVersion)) return

        // Restore through the same immutable PGN path as a normal review, then
        // let the ordinary hydration effect restore the saved report.
        setTimeline(restored)
        setPgnInput(record.sourcePgn)
        setPly(target.sourcePly)
        setReview(null)
        setReviewOrigin(null)
        setReviewProgress(null)
        setReviewRunning(false)
        setReviewSaving(false)
      } catch (error) {
        if (!cancelled && isReviewRunCurrent(targetVersion)) {
          setReviewError(error instanceof Error ? error.message : 'The source review could not be opened.')
        }
      } finally {
        if (!cancelled) onRequestedReviewTargetHandled?.()
      }
    })()

    return () => { cancelled = true }
  }, [clearVariationInteraction, onRequestedReviewTargetHandled, requestedReviewTarget, reviewStore])

  const stopFullReview = () => {
    reviewRunVersion.current += 1
    reviewAbort.current?.abort()
    disposeAndClearClient(reviewClient)
    reviewAbort.current = null
    setReviewRunning(false)
    setReviewSaving(false)
    setReviewProgress(null)
  }

  const startFullReview = async () => {
    if (!timeline.moves.length || reviewRunning || engineBusy || reviewHydrating) return
    clearVariationInteraction()
    fileImportGate.current.invalidate()
    // Browser ambient and full-review clients each own a Worker. Full review
    // intentionally pauses candidate lines, so release that idle WebAssembly
    // runtime before the heavier sequential job creates its own client.
    disposeAndClearClient(client)
    const runVersion = ++reviewRunVersion.current
    // A saved-review lookup that started before the player asked for a fresh
    // review must not replace its eventual result.
    reviewLoadVersion.current += 1
    const controller = new AbortController()
    reviewAbort.current = controller
    const reviewAnalysisClient = reviewClient.current ?? new StockfishAnalysisClient()
    reviewClient.current = reviewAnalysisClient
    const selectedEffort = effortOptions[effort]
    const settings: AnalysisSettings = {
      moveTimeMs: selectedEffort.moveTimeMs,
      depth: selectedEffort.depth,
      nodes: null,
      multiPv: Math.max(2, multiPv),
      threads: engineThreads,
      hashMb: engineHashMb,
    }
    setReviewRunning(true)
    setReviewSaving(false)
    setReviewHydrating(false)
    setReview(null)
    setReviewOrigin(null)
    setReviewError('')
    setReviewProgress({ completedPly: 0, totalPly: timeline.moves.length, stage: 'before' })
    try {
      const result = await runGameReview(
        timeline,
        (fen, requestSettings) => reviewAnalysisClient.analyze(fen, enginePath, requestSettings),
        settings,
        setReviewProgress,
        controller.signal,
      )
      if (controller.signal.aborted || !isReviewRunCurrent(runVersion)) return
      // Results belong to the player as soon as Stockfish completes. Saving is
      // intentionally detached below so a busy native write never holds this
      // screen or its controls hostage.
      setReview(result)
      setReviewOrigin(null)
      setReviewProgress(null)
      if (!reviewStore) return
      try {
        const record = createPersistedReview(timeline, result)
        setReviewSaving(true)
        void saveCompletedReviewInBackground({
          save: (savedRecord) => reviewStore.save(savedRecord),
          record,
          isCurrent: () => isReviewRunCurrent(runVersion),
          // This updates durable Library/Insights metadata. It intentionally
          // survives leaving Review after the database write has succeeded.
          onPersisted: (savedRecord) => onReviewSaved?.(savedRecord),
          onSaved: () => {
            setReviewSaving(false)
            setReviewOrigin('saved')
          },
          onFailed: (error) => {
            setReviewSaving(false)
            setReviewError(error instanceof Error
              ? `Review is ready, but it could not be saved locally: ${error.message}`
              : 'Review is ready, but it could not be saved locally.')
          },
        })
      } catch (error) {
        if (!isReviewRunCurrent(runVersion)) return
        setReviewError(error instanceof Error
          ? `Review is ready, but it could not be saved locally: ${error.message}`
          : 'Review is ready, but it could not be saved locally.')
      }
    } catch (error) {
      if (isReviewRunCurrent(runVersion) && !(error instanceof Error && error.name === 'AbortError')) {
        setReviewError(error instanceof Error ? error.message : 'Full-game review failed.')
      }
    } finally {
      // Stop, navigation and a newer run can all replace this ref before the
      // old promise settles. Identity-guarded disposal frees this run's browser
      // Worker without terminating a newer full-review client.
      disposeClientIfCurrent(reviewClient, reviewAnalysisClient)
      if (isReviewRunCurrent(runVersion)) {
        if (reviewAbort.current === controller) reviewAbort.current = null
        setReviewRunning(false)
      }
    }
  }

  const applyTimeline = (next: AnalysisTimeline) => {
    // Invalidate an older saved-review lookup before the new timeline renders.
    // The effect below will start its own lookup for `next`; this synchronous
    // fence prevents a just-resolved old report from flashing in between.
    reviewLoadVersion.current += 1
    clearVariationInteraction()
    stopFullReview()
    setTimeline(next)
    setPly(next.positions.length - 1)
    setImportError('')
    setImportNotice('')
    setReview(null)
    setReviewProgress(null)
    setReviewError('')
  }

  const loadCurrentGame = () => {
    fileImportGate.current.invalidate()
    try {
      applyTimeline(createPgnTimeline(currentPgn))
      setPgnInput(currentPgn)
      setImportNotice('Current game loaded.')
    } catch (error) {
      setImportNotice('')
      setImportError(error instanceof Error ? error.message : 'The current game could not be loaded.')
    }
  }

  const loadPgn = () => {
    fileImportGate.current.invalidate()
    try {
      applyTimeline(createPgnTimeline(pgnInput))
      setImportNotice('PGN loaded.')
    } catch (error) {
      setImportNotice('')
      setImportError(error instanceof Error ? error.message : 'Invalid PGN.')
    }
  }

  const loadFen = () => {
    fileImportGate.current.invalidate()
    try {
      applyTimeline(createFenTimeline(fenInput))
      setImportNotice('FEN loaded.')
    } catch (error) {
      setImportNotice('')
      setImportError(error instanceof Error ? error.message : 'Invalid FEN.')
    }
  }

  const loadAnalysisFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    const requestId = fileImportGate.current.begin()
    setImportError('')
    setImportNotice('')
    const imported = await readAnalysisFile(file)
    if (!fileImportGate.current.isCurrent(requestId)) return
    if (!imported.ok) {
      setImportError(imported.error)
      return
    }
    // The importer freezes its validated snapshot. The workspace treats a
    // timeline as read-only, so the state boundary can safely retain it.
    applyTimeline(imported.timeline as AnalysisTimeline)
    if (imported.format === 'pgn') {
      setPgnInput(imported.text)
      setFenInput('')
    } else {
      setFenInput(imported.text)
      setPgnInput('')
    }
    setImportNotice(`${imported.filename} loaded.`)
  }

  const chooseAnalysisFile = () => fileInput.current?.click()

  const copyCurrentFen = async () => {
    const result = await copyText(displayedPosition.fen)
    if (result.ok) {
      setImportError('')
      setImportNotice(variation ? 'Temporary variation FEN copied.' : 'Current FEN copied.')
    } else {
      setImportNotice('')
      setImportError('Couldn’t copy FEN. Download it instead.')
    }
  }

  const downloadCurrentFen = () => {
    const result = downloadText(`knightclub-${variation ? 'variation' : 'position'}-${new Date().toISOString().slice(0, 10)}.fen`, displayedPosition.fen)
    if (result.ok) {
      setImportError('')
      setImportNotice(variation ? 'Temporary variation FEN download started.' : 'FEN download started.')
    } else {
      setImportNotice('')
      setImportError('Couldn’t start the FEN download.')
    }
  }

  const copyCurrentPgn = async () => {
    const pgn = variation ? variationPgn(variation) : timeline.sourcePgn
    if (!pgn) {
      setImportNotice('')
      setImportError(variation
        ? 'This temporary variation could not be prepared for PGN export.'
        : 'This position has no PGN to copy.')
      return
    }
    const result = await copyText(pgn)
    if (result.ok) {
      setImportError('')
      setImportNotice(variation ? 'Temporary variation PGN copied.' : 'PGN copied.')
    } else {
      setImportNotice('')
      setImportError('Couldn’t copy PGN. Download it instead.')
    }
  }

  const downloadCurrentPgn = () => {
    const pgn = variation ? variationPgn(variation) : timeline.sourcePgn
    if (!pgn) {
      setImportNotice('')
      setImportError(variation
        ? 'This temporary variation could not be prepared for PGN export.'
        : 'This position has no PGN to download.')
      return
    }
    const result = downloadText(`knightclub-${variation ? 'variation' : 'analysis'}-${new Date().toISOString().slice(0, 10)}.pgn`, pgn)
    if (result.ok) {
      setImportError('')
      setImportNotice(variation ? 'Temporary variation PGN download started.' : 'PGN download started.')
    } else {
      setImportNotice('')
      setImportError('Couldn’t start the PGN download.')
    }
  }

  const queueRetryItems = async (items: RetryItem[], action: RetrySaveAction) => {
    if (!retryStore || retrySaving || !items.length) return
    setRetrySavingAction(action)
    setRetryError('')
    try {
      const result = await saveRetryItemsSerially({
        items,
        retryStore,
        onRetriesSaved,
        onOpenRetryQueue,
      })
      if (result.error) {
        const savedPrefix = result.saved.length
          ? `${result.saved.length} practice ${result.saved.length === 1 ? 'moment is' : 'moments are'} ready, but `
        : ''
        setRetryError(result.error instanceof Error
          ? `${savedPrefix}the remaining practice moment could not be saved: ${result.error.message}`
          : `${savedPrefix}the remaining practice moment could not be saved locally.`)
      }
    } finally {
      setRetrySavingAction(null)
    }
  }

  return (
    <section className="analysis-workspace" aria-label="Analysis board">
      <div className="analysis-board-column">
        <div className="analysis-board-heading">
          <div>
            <span className="eyebrow">Analysis board</span>
            <strong>{timeline.source === 'pgn' ? `${timeline.moves.length} ply loaded` : 'Custom position'}</strong>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="Flip analysis board"
            onClick={() => setOrientation((value) => value === 'white' ? 'black' : 'white')}
          ><FlipHorizontal2 size={17} /></button>
        </div>

        <ChessBoard
          game={boardGame}
          orientation={orientation}
          selected={variation ? selectedVariationSquare : null}
          legalTargets={variation ? variationTargets : inertAnalysisBoardInteraction.legalTargets}
          lastMove={displayedPosition.lastMove}
          evidenceSquares={variation ? undefined : coachEvidenceSquares}
          disabled={!variation || Boolean(variationPromotion) || variationAtLimit}
          onSquareClick={variation ? selectVariationSquare : inertAnalysisBoardInteraction.onSquareClick}
          onMoveAttempt={variation ? attemptVariationMove : inertAnalysisBoardInteraction.onMoveAttempt}
        />

        {variation ? (
          <section className="analysis-variation" aria-label="Temporary variation">
            <div className="analysis-variation__heading">
              <div>
                <span className="eyebrow"><GitBranch size={13} />Temporary variation</span>
                <strong>Explore without changing the game</strong>
                <small>Try any legal continuation from this position. It stays only in this Review session.</small>
              </div>
              <button className="secondary-button" type="button" onClick={returnToMainLine}><ChevronLeft size={15} />Return to game</button>
            </div>
            <output className="analysis-variation__moves" aria-live="polite" aria-label="Temporary variation moves">
              {variation.line.moves.length
                ? variation.line.moves.map((move) => `${move.moveNumber}${move.color === 'b' ? '…' : '.'} ${move.san}`).join('  ')
                : 'Your temporary line is ready — choose a piece on the board.'}
            </output>
            {variationAtLimit && <small className="analysis-variation__limit" role="status">This line has reached its 256-move limit. Undo or reset to keep exploring.</small>}
            <div className="analysis-variation__actions">
              <button className="secondary-button" type="button" onClick={undoTemporaryVariation} disabled={!variation.line.moves.length}><Undo2 size={15} />Undo</button>
              <button className="secondary-button" type="button" onClick={resetTemporaryVariation} disabled={!variation.line.moves.length}><RotateCcw size={15} />Reset line</button>
            </div>
          </section>
        ) : (
          <button
            className="analysis-explore-button secondary-button"
            type="button"
            disabled={positionTerminal}
            onClick={beginVariation}
          ><GitBranch size={15} />Explore this position</button>
        )}

        {variationPromotion && (
          <section className="analysis-variation__promotion" aria-label="Choose variation promotion piece" role="group">
            <span>Choose promotion</span>
            <div>
              {variationPromotion.choices.map((piece, index) => (
                <button ref={index === 0 ? promotionChoiceRef : undefined} key={piece} type="button" onClick={() => commitVariationMove(variationPromotion.from, variationPromotion.to, piece)}>
                  <ChessPiece color={boardGame.turn()} type={piece} />
                  <small>{promotionNames[piece] ?? piece.toUpperCase()}</small>
                </button>
              ))}
            </div>
            <button className="secondary-button" type="button" onClick={() => setVariationPromotion(null)}>Cancel</button>
          </section>
        )}

        <div className="analysis-navigation" aria-label="Position navigation. Use Left and Right arrow keys to move through the game." aria-keyshortcuts="ArrowLeft ArrowRight Home End">
          <button type="button" aria-label="First position" disabled={ply === 0} onClick={() => selectMainlinePly(0)}><ChevronFirst size={20} /></button>
          <button type="button" aria-label="Previous position" disabled={ply === 0} onClick={() => selectMainlinePly(ply - 1)}><ChevronLeft size={20} /></button>
          <output aria-live="polite" aria-label={navigationAriaLabel} title={navigationAriaLabel}>{navigationStatus}</output>
          <button type="button" aria-label="Next position" disabled={ply === maxPly} onClick={() => selectMainlinePly(ply + 1)}><ChevronRight size={20} /></button>
          <button type="button" aria-label="Last position" disabled={ply === maxPly} onClick={() => selectMainlinePly(maxPly)}><ChevronLast size={20} /></button>
        </div>

        {!variation && <LiveGameContinuationNotice continuation={liveContinuation} onUpdate={loadCurrentGame} />}

        {timeline.moves.length > 0 && <AnalysisMovePicker moves={timeline.moves} ply={ply} onSelectPly={selectMainlinePly} />}

        <section className="analysis-transfer" aria-label="Copy or download current analysis">
          <div>
            <strong>Share</strong>
            <span>{variation ? 'This temporary line stays on this device until you leave Review.' : 'Current position stays on this device.'}</span>
          </div>
          <div className="analysis-transfer__actions">
            <button className="secondary-button" type="button" onClick={() => void copyCurrentFen()}><Copy size={14} />Copy {variation ? 'variation' : 'current'} FEN</button>
            <button className="secondary-button" type="button" onClick={downloadCurrentFen}><Download size={14} />{variation ? 'Download variation FEN' : 'Download FEN'}</button>
            {(variation ? variationHasPgn : timeline.sourcePgn) && <>
              <button className="secondary-button" type="button" onClick={() => void copyCurrentPgn()}><Copy size={14} />{variation ? 'Copy variation PGN' : 'Copy PGN'}</button>
              <button className="secondary-button" type="button" onClick={downloadCurrentPgn}><Download size={14} />{variation ? 'Download variation PGN' : 'Download PGN'}</button>
            </>}
          </div>
        </section>
        {importNotice && <p className="analysis-notice" role="status">{importNotice}</p>}
        {importError && <p className="analysis-error" role="alert">{importError}</p>}

        <details className="analysis-import">
          <summary><Import size={16} />Import another game or position</summary>
          <div className="analysis-import__body">
            <button className="secondary-button" type="button" onClick={loadCurrentGame}><RefreshCw size={15} />Load current game</button>
            <button className="analysis-file-picker secondary-button" type="button" onClick={chooseAnalysisFile}><Import size={15} />Choose a local .pgn or .fen file</button>
            <input ref={fileInput} id="analysis-file" className="sr-only" tabIndex={-1} aria-hidden="true" type="file" accept=".pgn,.fen,.txt,text/plain" onChange={(event) => void loadAnalysisFile(event)} />
            <small className="analysis-import__hint">PGN up to 512 KiB · FEN up to 1 KiB. Invalid files leave this analysis unchanged.</small>
            <label htmlFor="analysis-pgn">PGN</label>
            <textarea id="analysis-pgn" rows={6} value={pgnInput} onChange={(event) => setPgnInput(event.target.value)} placeholder="Paste a PGN game…" />
            <button className="primary-button" type="button" onClick={loadPgn} disabled={!pgnInput.trim()}>Load PGN</button>
            <label htmlFor="analysis-fen">FEN</label>
            <input id="analysis-fen" value={fenInput} onChange={(event) => setFenInput(event.target.value)} placeholder="Paste a FEN position…" />
            <button className="secondary-button" type="button" onClick={loadFen} disabled={!fenInput.trim()}>Load FEN</button>
          </div>
        </details>
      </div>

      <aside className="analysis-panel">
        <div className="analysis-panel__header">
          <div>
            <span className="eyebrow">{desktop ? 'Full-strength Stockfish' : 'Stockfish 18 Lite · WebAssembly'}</span>
            <h2>Candidate lines</h2>
          </div>
          <label className="analysis-switch">
            <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
            <span>{enabled ? 'On' : 'Off'}</span>
          </label>
        </div>

        <div className="analysis-controls">
          <label>Effort
            <select value={effort} onChange={(event) => setEffort(event.target.value as Effort)}>
              {Object.entries(effortOptions).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}
            </select>
          </label>
          <label>Lines
            <select value={multiPv} onChange={(event) => setMultiPv(Number(event.target.value))}>
              {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
        </div>

        <div className="analysis-perspective" aria-label="Evaluation perspective">
          <button type="button" className={perspective === 'white' ? 'is-active' : ''} aria-pressed={perspective === 'white'} onClick={() => setPerspective('white')}>White</button>
          <button type="button" className={perspective === 'sideToMove' ? 'is-active' : ''} aria-pressed={perspective === 'sideToMove'} onClick={() => setPerspective('sideToMove')}>Side to move</button>
        </div>

        {timeline.moves.length > 0 && (
          <section className="full-review" aria-label="Full game review">
            <div className="full-review__heading">
              <div><span className="eyebrow">Game review</span><strong>{timeline.moves.length} plies · up to {timeline.moves.length + 1} position searches</strong></div>
              {reviewRunning ? (
                <button className="danger-button" type="button" onClick={stopFullReview}><CircleStop size={15} />Stop</button>
              ) : (
                <button className="primary-button" type="button" disabled={fullReviewAction.disabled} onClick={() => void startFullReview()}><PlayCircle size={15} />{fullReviewAction.label}</button>
              )}
            </div>
            <p>{desktop ? 'Native Stockfish runs locally without sending the game anywhere.' : 'Stockfish WebAssembly runs locally in this browser; the game never leaves this device.'}</p>
            {engineBusy && <p className="review-retained" role="status">The live bot move has priority. Review starts as soon as it finishes.</p>}
            {reviewHydrating && <p className="review-retained" role="status">Checking this game for a saved review…</p>}
            <ReviewSaveNotice saving={reviewSaving} />
            <RetrySaveNotice action={retrySavingAction} />
            {reviewRunning && reviewProgress && (
              <div className="review-progress" role="status" aria-live="polite">
                <div><span>Analysing move {Math.min(reviewProgress.completedPly + 1, reviewProgress.totalPly)} of {reviewProgress.totalPly}</span><strong>{Math.round(100 * reviewProgress.completedPly / reviewProgress.totalPly)}%</strong></div>
                <progress max={reviewProgress.totalPly} value={reviewProgress.completedPly} />
                <small>{reviewProgress.stage === 'before' ? 'Finding the best alternatives…' : 'Measuring the played move…'}</small>
              </div>
            )}
            {reviewError && <p className="analysis-error" role="alert">{reviewError}</p>}
            {review && (
              <div className="review-results">
                {reviewOrigin && <p className="review-retained" role="status">
                  {reviewOrigin === 'restored' ? 'Saved review restored from this device.' : 'Review saved privately on this device.'}
                </p>}
                <div className="review-scorecards">
                  <div><span>Overall</span><strong>{review.summary.accuracy}</strong><small>accuracy</small></div>
                  <div><span>White / Black</span><strong>{review.summary.whiteAccuracy ?? '—'} / {review.summary.blackAccuracy ?? '—'}</strong><small>accuracy</small></div>
                  <div><span>Avg loss</span><strong>{review.summary.averageCentipawnLoss}</strong><small>centipawns</small></div>
                  <div><span>Best found</span><strong>{review.summary.bestMoveRate}%</strong><small>of moves</small></div>
                </div>
                {batchRetryItems.length > 0 && (
                  <div className="review-practice-callout" aria-busy={retrySaving}>
                    <div>
                      <span>From your games</span>
                      <strong>{batchRetryItems.length} key moment{batchRetryItems.length === 1 ? '' : 's'} ready to practise</strong>
                      <small>Replay the saved Stockfish line without revealing it first.</small>
                    </div>
                    <RetryPracticeButton className="primary-button" action="batch" savingAction={retrySavingAction} onClick={() => void queueRetryItems(batchRetryItems, 'batch')} />
                  </div>
                )}
                {review.summary.turningPoints.length > 0 && (
                  <div className="turning-points">
                    <span>Key turning points</span>
                    <div>{review.summary.turningPoints.map((move) => (
                      <button type="button" key={move.ply} onClick={() => selectMainlinePly(move.ply)}>
                        {move.moveNumber}{move.color === 'b' ? '…' : '.'}{move.san}
                        <em className={`review-badge review-badge--${move.classification}`}>{classificationLabels[move.classification]}</em>
                      </button>
                    ))}</div>
                  </div>
                )}
                {selectedReview && (
                  <article className="review-detail" aria-live="polite">
                    <div><Sparkles size={16} /><strong>{classificationLabels[selectedReview.classification]} · {selectedReview.accuracy}%</strong><span>−{selectedReview.centipawnLoss} cp</span></div>
                    <p>{selectedReview.feedback}</p>
                    <small>Depth {selectedReview.depth} · {selectedReview.phase} · {selectedReview.confidence === 'limited' ? 'limited confidence' : 'normal confidence'}</small>
                    <CoachEvidenceCard guidance={coachGuidance} />
                    {selectedRetryItem && (
                      <RetryPracticeButton className="review-detail__practice secondary-button" action="single" savingAction={retrySavingAction} onClick={() => void queueRetryItems([selectedRetryItem], 'single')} />
                    )}
                  </article>
                )}
                {retryError && <p className="analysis-error" role="alert">{retryError}</p>}
                <footer>{review.engineName} · {(review.totalElapsedMs / 1000).toFixed(1)} s engine time · completed locally</footer>
              </div>
            )}
          </section>
        )}

        {reviewRunning ? null : !enabled ? (
          <div className="analysis-empty" role="status"><Gauge size={28} /><strong>Analysis paused</strong><span>Turn Stockfish on when you want fresh candidate lines.</span></div>
        ) : engineBusy ? (
          <div className="analysis-empty" role="status" aria-live="polite"><Gauge size={28} /><strong>Analysis is waiting for the bot</strong><span>The current game move has priority, so this device runs one engine task at a time.</span></div>
        ) : loading ? (
          <div className="analysis-empty" role="status" aria-live="polite"><LoaderCircle className="spin" size={28} /><strong>Analysing position…</strong><span>Old work is cancelled automatically when you change moves.</span></div>
        ) : analysisError ? (
          <div className="analysis-empty analysis-empty--error" role="alert"><Gauge size={28} /><strong>Engine unavailable</strong><span>{analysisError}</span></div>
        ) : analysis?.lines.length ? (
          <div className="analysis-lines" aria-live="polite">
            {analysis.lines.map((line, index) => {
              const score = evaluationForPerspective(line.score, displayedPosition.fen, perspective)
              const wdl = wdlForPerspective(line.wdl, displayedPosition.fen, perspective)
              return (
                <article className={`analysis-line ${index === 0 ? 'analysis-line--best' : ''}`} key={line.multiPv}>
                  <div className="analysis-line__score">
                    <span>{lineLabel(index)}</span>
                    <strong>{formatAnalysisScore(score)}</strong>
                  </div>
                  <div className="analysis-line__body">
                    <p>{line.san.join(' ')}</p>
                    {wdl && <div className="wdl-bar" title={`Win ${(wdl[0] / 10).toFixed(1)}%, draw ${(wdl[1] / 10).toFixed(1)}%, loss ${(wdl[2] / 10).toFixed(1)}%`}><i style={{ width: `${wdl[0] / 10}%` }} /><b style={{ width: `${wdl[1] / 10}%` }} /><em style={{ width: `${wdl[2] / 10}%` }} /></div>}
                    <small>d{line.depth}{line.seldepth === null ? '' : `/${line.seldepth}`} · {compactNumber(line.nodes)} nodes · {compactNumber(line.nps)} nps{line.timeMs === null ? '' : ` · ${line.timeMs} ms`}</small>
                  </div>
                </article>
              )
            })}
            <footer><BarChart3 size={14} />{analysis.engineName} · {analysis.cached ? `cached local result · ${analysis.elapsedMs} ms original` : `${analysis.elapsedMs} ms`} · {engineThreads} thread{engineThreads === 1 ? '' : 's'} · {engineHashMb} MB hash</footer>
          </div>
        ) : (
          <div className="analysis-empty" role="status"><Gauge size={28} /><strong>No legal continuation</strong><span>This may be a checkmate, stalemate or other terminal position.</span></div>
        )}

        <AnalysisMoveList key={reviewKey ?? timeline.startFen} moveRows={moveRows} ply={ply} review={variation ? null : review} onSelectPly={selectMainlinePly} />
      </aside>
    </section>
  )
}
