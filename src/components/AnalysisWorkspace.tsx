import { memo, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Chess } from 'chess.js'
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
  Import,
  LoaderCircle,
  PlayCircle,
  RefreshCw,
  Sparkles,
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
import { disposeAndClearClient } from '../analysis/clientLifecycle'
import { readAnalysisFile } from '../analysis/fileImport'
import { createLatestRequestGate } from '../analysis/latestRequest'
import { inertAnalysisBoardInteraction } from '../analysis/analysisBoardInteraction'
import { STANDARD_START_FEN } from '../domain/chess'
import { copyText, downloadText } from '../domain/textTransfer'
import { runGameReview, type GameReview, type ReviewProgress } from '../review/gameReviewRunner'
import { saveCompletedReviewInBackground } from '../review/backgroundReviewSave'
import type { MoveClassification, ReviewedMove } from '../review/reviewModel'
import { buildCoachGuidanceFromTimeline, type CoachGuidance } from '../review/coach'
import { evidenceSquaresForGuidance, reviewNavigationForKey, reviewPlyAfter } from '../review/reviewWorkspaceUtils'
import {
  resolvePlayPreviewReviewPly,
  type PlayPreviewReviewTarget,
} from '../review/playPreviewReviewTarget'
import { createRetryItem, type RetryItem } from '../review/retry'
import { saveRetryItemsSerially } from '../review/retryQueuePersistence'
import {
  createPersistedReview,
  createReviewKey,
  type PersistedReview,
} from '../review/reviewPersistence'
import { ChessBoard } from './ChessBoard'

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
  requestedReviewTarget?: { reviewKey: string; sourcePly: number } | null
  onRequestedReviewTargetHandled?: () => void
  requestedPlayPreviewTarget?: PlayPreviewReviewTarget | null
  onRequestedPlayPreviewTargetHandled?: () => void
}

interface DisplayLine extends AnalysisLine {
  san: string[]
}

interface DisplayAnalysis extends AnalysisResponse {
  lines: DisplayLine[]
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

const effortOptions = {
  quick: { label: 'Quick · 0.25s', moveTimeMs: 250, depth: 12 },
  balanced: { label: 'Balanced · 0.8s', moveTimeMs: 800, depth: 18 },
  deep: { label: 'Deep · 2s', moveTimeMs: 2000, depth: 22 },
} as const

type Effort = keyof typeof effortOptions

function safeTimeline(pgn: string): AnalysisTimeline {
  try {
    return createPgnTimeline(pgn)
  } catch {
    return createFenTimeline(STANDARD_START_FEN)
  }
}

function compactNumber(value: number | null): string {
  if (value === null) return '—'
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

function lineLabel(index: number): string {
  return index === 0 ? 'Best' : `Line ${index + 1}`
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

function ReviewBadge({ move }: { move?: ReviewedMove }) {
  if (!move) return null
  return <em className={`review-badge review-badge--${move.classification}`}>{classificationLabels[move.classification]}</em>
}

/**
 * A full review reports progress before and after every ply. Keep the long
 * notation list out of those progress-only renders; it only needs to update
 * when navigation or final review data actually changes.
 */
const AnalysisMoveList = memo(function AnalysisMoveList({ moveRows, ply, review, onSelectPly }: AnalysisMoveListProps) {
  return (
    <div className="analysis-moves" aria-label="Game moves">
      <button type="button" className={ply === 0 ? 'is-current' : ''} aria-current={ply === 0 ? 'step' : undefined} onClick={() => onSelectPly(0)}>Start position</button>
      {moveRows.map((row) => (
        <div className="analysis-move-row" key={row.number}>
          <span>{row.number}.</span>
          {row.white && <button type="button" className={ply === row.white.ply ? 'is-current' : ''} aria-current={ply === row.white.ply ? 'step' : undefined} onClick={() => onSelectPly(row.white!.ply)}>{row.white.san}<ReviewBadge move={review?.moves[row.white.ply - 1]} /></button>}
          {row.black && <button type="button" className={ply === row.black.ply ? 'is-current' : ''} aria-current={ply === row.black.ply ? 'step' : undefined} onClick={() => onSelectPly(row.black!.ply)}>{row.black.san}<ReviewBadge move={review?.moves[row.black.ply - 1]} /></button>}
        </div>
      ))}
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
  const [timeline, setTimeline] = useState(() => safeTimeline(currentPgn))
  const [ply, setPly] = useState(() => {
    const initialTimeline = safeTimeline(currentPgn)
    if (!requestedReviewTarget) {
      const previewPly = resolvePlayPreviewReviewPly(initialTimeline, requestedPlayPreviewTarget)
      if (previewPly !== null) return previewPly
    }
    return initialTimeline.positions.length - 1
  })
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
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
  const [reviewHydrating, setReviewHydrating] = useState(false)
  const [reviewOrigin, setReviewOrigin] = useState<'saved' | 'restored' | null>(null)
  const [retrySavingAction, setRetrySavingAction] = useState<RetrySaveAction | null>(null)
  const [retryError, setRetryError] = useState('')
  const client = useRef<StockfishAnalysisClient | null>(null)
  const reviewClient = useRef<StockfishAnalysisClient | null>(null)
  const reviewAbort = useRef<AbortController | null>(null)
  const reviewLoadVersion = useRef(0)
  const reviewRunVersion = useRef(0)
  const handledPlayPreviewTarget = useRef<PlayPreviewReviewTarget | null>(null)
  const mounted = useRef(true)
  const fileInput = useRef<HTMLInputElement | null>(null)
  const fileImportGate = useRef(createLatestRequestGate())

  const position = timeline.positions[ply] ?? timeline.positions[0]
  const boardGame = useMemo(() => new Chess(position.fen), [position.fen])
  const positionTerminal = boardGame.isGameOver()
  const engineThreads = desktop ? threads : 1
  const engineHashMb = desktop ? hashMb : Math.min(hashMb, 128)
  const maxPly = timeline.positions.length - 1
  const selectedNavigationMove = timeline.moves[ply - 1] ?? null
  const selectedNavigationMoveLabel = selectedNavigationMove
    ? `${selectedNavigationMove.moveNumber}${selectedNavigationMove.color === 'b' ? '…' : '.'} ${selectedNavigationMove.san}`
    : null
  const navigationStatus = selectedNavigationMoveLabel
    ? `${selectedNavigationMoveLabel} · ${ply}/${maxPly}`
    : `Start position · 0/${maxPly}`
  const navigationAriaLabel = selectedNavigationMoveLabel
    ? `After ${selectedNavigationMoveLabel}, position ${ply} of ${maxPly}`
    : `Start position, position 0 of ${maxPly}`
  const reviewKey = useMemo(
    () => timeline.source === 'pgn' && timeline.moves.length ? createReviewKey(timeline) : null,
    [timeline],
  )
  const selectedReview = review?.moves.find((move) => move.ply === ply) ?? null
  const coachGuidance = useMemo(() => {
    return buildCoachGuidanceFromTimeline(timeline, selectedReview)
  }, [selectedReview, timeline])
  const coachEvidenceSquares = useMemo(() => evidenceSquaresForGuidance(coachGuidance), [coachGuidance])
  const selectedRetryItem = useMemo(() => {
    if (!selectedReview || !reviewKey) return null
    return createRetryItem({
      timeline,
      move: selectedReview,
      reviewKey,
      guidance: coachGuidance,
    })
  }, [coachGuidance, reviewKey, selectedReview, timeline])
  const batchRetryItems = useMemo(() => {
    if (!review || !reviewKey) return []
    const candidates = review.moves
      .filter((move) => move.isBestMove === false && move.confidence === 'normal'
        && ['inaccuracy', 'mistake', 'miss', 'blunder'].includes(move.classification))
      .sort(compareRetryCandidates)
      .slice(0, 12)
    const items: RetryItem[] = []
    for (const move of candidates) {
      const item = createRetryItem({
        timeline,
        move,
        reviewKey,
        guidance: buildCoachGuidanceFromTimeline(timeline, move),
      })
      if (item) items.push(item)
      if (items.length === 3) break
    }
    return items
  }, [review, reviewKey, timeline])
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

  useEffect(() => {
    if (!enabled || reviewRunning || positionTerminal || engineBusy) {
      client.current?.cancel()
      setLoading(false)
      setAnalysis(null)
      setAnalysisError('')
      return
    }

    client.current ??= new StockfishAnalysisClient()
    const analysisClient = client.current
    const selectedEffort = effortOptions[effort]
    const settings: AnalysisSettings = {
      moveTimeMs: selectedEffort.moveTimeMs,
      depth: selectedEffort.depth,
      nodes: null,
      multiPv,
      threads: engineThreads,
      hashMb: engineHashMb,
    }

    setLoading(true)
    setAnalysis(null)
    setAnalysisError('')
    const timer = window.setTimeout(() => {
      void analysisClient.analyze(position.fen, enginePath, settings)
        .then((response) => {
          const lines = response.lines.map((line) => ({
            ...line,
            san: uciPvToSan(position.fen, line.pv),
          }))
          setAnalysis({ ...response, lines })
          setLoading(false)
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === 'AbortError') return
          setAnalysisError(error instanceof Error ? error.message : 'Stockfish analysis failed.')
          setLoading(false)
        })
    }, 140)

    return () => {
      window.clearTimeout(timer)
      analysisClient.cancel()
    }
  }, [effort, enabled, engineBusy, engineHashMb, enginePath, engineThreads, multiPv, position.fen, positionTerminal, reviewRunning])

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
      setPly((value) => reviewPlyAfter(action, value, maxPly))
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [maxPly])

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
      if (targetPly !== null) setPly(targetPly)
    }
    onRequestedPlayPreviewTargetHandled?.()
  }, [onRequestedPlayPreviewTargetHandled, requestedPlayPreviewTarget, requestedReviewTarget, timeline])

  useEffect(() => {
    if (!requestedReviewTarget) return
    let cancelled = false
    const target = requestedReviewTarget
    const targetVersion = ++reviewRunVersion.current
    reviewAbort.current?.abort()
    reviewClient.current?.cancel()
    reviewAbort.current = null
    fileImportGate.current.invalidate()
    // This queued navigation is a new user intent. Invalidate both a running
    // review and any earlier saved-review lookup before awaiting its source.
    reviewLoadVersion.current += 1
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
  }, [onRequestedReviewTargetHandled, requestedReviewTarget, reviewStore])

  const stopFullReview = () => {
    reviewRunVersion.current += 1
    reviewAbort.current?.abort()
    reviewClient.current?.cancel()
    reviewAbort.current = null
    setReviewRunning(false)
    setReviewSaving(false)
    setReviewProgress(null)
  }

  const startFullReview = async () => {
    if (!timeline.moves.length || reviewRunning || engineBusy) return
    fileImportGate.current.invalidate()
    client.current?.cancel()
    const runVersion = ++reviewRunVersion.current
    // A saved-review lookup that started before the player asked for a fresh
    // review must not replace its eventual result.
    reviewLoadVersion.current += 1
    const controller = new AbortController()
    reviewAbort.current = controller
    reviewClient.current ??= new StockfishAnalysisClient(undefined, Date.now() + 1_000_000)
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
        (fen, requestSettings) => reviewClient.current!.analyze(fen, enginePath, requestSettings),
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
      setReviewRunning(false)
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
      if (isReviewRunCurrent(runVersion)) {
        if (reviewAbort.current === controller) reviewAbort.current = null
        setReviewRunning(false)
      }
    }
  }

  const applyTimeline = (next: AnalysisTimeline) => {
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
    const result = await copyText(position.fen)
    if (result.ok) {
      setImportError('')
      setImportNotice('Current FEN copied.')
    } else {
      setImportNotice('')
      setImportError('Couldn’t copy FEN. Download it instead.')
    }
  }

  const downloadCurrentFen = () => {
    const result = downloadText(`knightclub-position-${new Date().toISOString().slice(0, 10)}.fen`, position.fen)
    if (result.ok) {
      setImportError('')
      setImportNotice('FEN download started.')
    } else {
      setImportNotice('')
      setImportError('Couldn’t start the FEN download.')
    }
  }

  const copyCurrentPgn = async () => {
    if (!timeline.sourcePgn) return
    const result = await copyText(timeline.sourcePgn)
    if (result.ok) {
      setImportError('')
      setImportNotice('PGN copied.')
    } else {
      setImportNotice('')
      setImportError('Couldn’t copy PGN. Download it instead.')
    }
  }

  const downloadCurrentPgn = () => {
    if (!timeline.sourcePgn) return
    const result = downloadText(`knightclub-analysis-${new Date().toISOString().slice(0, 10)}.pgn`, timeline.sourcePgn)
    if (result.ok) {
      setImportError('')
      setImportNotice('PGN download started.')
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
          selected={null}
          legalTargets={inertAnalysisBoardInteraction.legalTargets}
          lastMove={position.lastMove}
          evidenceSquares={coachEvidenceSquares}
          disabled
          onSquareClick={inertAnalysisBoardInteraction.onSquareClick}
          onMoveAttempt={inertAnalysisBoardInteraction.onMoveAttempt}
        />

        <div className="analysis-navigation" aria-label="Position navigation. Use Left and Right arrow keys to move through the game." aria-keyshortcuts="ArrowLeft ArrowRight Home End">
          <button type="button" aria-label="First position" disabled={ply === 0} onClick={() => setPly(0)}><ChevronFirst size={20} /></button>
          <button type="button" aria-label="Previous position" disabled={ply === 0} onClick={() => setPly((value) => Math.max(0, value - 1))}><ChevronLeft size={20} /></button>
          <output aria-live="polite" aria-label={navigationAriaLabel} title={navigationAriaLabel}>{navigationStatus}</output>
          <button type="button" aria-label="Next position" disabled={ply === maxPly} onClick={() => setPly((value) => Math.min(maxPly, value + 1))}><ChevronRight size={20} /></button>
          <button type="button" aria-label="Last position" disabled={ply === maxPly} onClick={() => setPly(maxPly)}><ChevronLast size={20} /></button>
        </div>

        {timeline.moves.length > 0 && (
          <label className="analysis-mobile-move-picker">
            <span>Jump to move</span>
            <select aria-label="Jump to a game position" value={ply} onChange={(event) => setPly(Number(event.target.value))}>
              <option value={0}>Start position</option>
              {timeline.moves.map((move) => (
                <option key={move.ply} value={move.ply}>
                  {move.moveNumber}{move.color === 'b' ? '…' : '.'} {move.san}
                </option>
              ))}
            </select>
          </label>
        )}

        <section className="analysis-transfer" aria-label="Copy or download current analysis">
          <div>
            <strong>Share</strong>
            <span>Current position stays on this device.</span>
          </div>
          <div className="analysis-transfer__actions">
            <button className="secondary-button" type="button" onClick={() => void copyCurrentFen()}><Copy size={14} />Copy current FEN</button>
            <button className="secondary-button" type="button" onClick={downloadCurrentFen}><Download size={14} />Download FEN</button>
            {timeline.sourcePgn && <>
              <button className="secondary-button" type="button" onClick={() => void copyCurrentPgn()}><Copy size={14} />Copy PGN</button>
              <button className="secondary-button" type="button" onClick={downloadCurrentPgn}><Download size={14} />Download PGN</button>
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
              <div><span className="eyebrow">Game review</span><strong>{timeline.moves.length} plies · up to two searches per ply</strong></div>
              {reviewRunning ? (
                <button className="danger-button" type="button" onClick={stopFullReview}><CircleStop size={15} />Stop</button>
              ) : (
                <button className="primary-button" type="button" disabled={engineBusy} onClick={() => void startFullReview()}><PlayCircle size={15} />Review full game</button>
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
                      <button type="button" key={move.ply} onClick={() => setPly(move.ply)}>
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
              const score = evaluationForPerspective(line.score, position.fen, perspective)
              const wdl = wdlForPerspective(line.wdl, position.fen, perspective)
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
            <footer><BarChart3 size={14} />{analysis.engineName} · {analysis.elapsedMs} ms · {engineThreads} thread{engineThreads === 1 ? '' : 's'} · {engineHashMb} MB hash</footer>
          </div>
        ) : (
          <div className="analysis-empty" role="status"><Gauge size={28} /><strong>No legal continuation</strong><span>This may be a checkmate, stalemate or other terminal position.</span></div>
        )}

        <AnalysisMoveList moveRows={moveRows} ply={ply} review={review} onSelectPly={setPly} />
      </aside>
    </section>
  )
}
