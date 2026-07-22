import { useEffect, useMemo, useState } from 'react'
import { Chess, type PieceSymbol, type Square } from 'chess.js'
import { ChevronLeft, ChevronRight, Eye, Lightbulb, RefreshCw, Target, Trash2 } from 'lucide-react'
import { legalMovesFrom } from '../domain/chess'
import { recordRetryAttempt, type RetryItem } from '../review/retry'
import {
  attemptRetryLineMove,
  createRetryLine,
  retryLinePlayerMoveCount,
  retryLinePosition,
  type RetryLineMove,
} from '../review/retryLine'
import { ChessBoard } from './ChessBoard'
import { ChessPiece } from './ChessPiece'

interface RetryQueueProps {
  items: RetryItem[]
  requestedRetryKey: string | null
  onSave: (item: RetryItem) => Promise<void>
  onDelete: (retryKey: string) => Promise<boolean | void>
  onBackToReview?: (item: RetryItem) => void
  onOpenReview?: () => void
}

type RetryState = 'ready' | 'not-recorded' | 'solved' | 'revealed'
type PromotionPiece = Extract<PieceSymbol, 'q' | 'r' | 'b' | 'n'>
type Promotion = { from: Square; to: Square; choices: PromotionPiece[] }

const promotionNames: Partial<Record<PieceSymbol, string>> = {
  q: 'Queen',
  r: 'Rook',
  b: 'Bishop',
  n: 'Knight',
}

function activeQueue(items: RetryItem[], requestedRetryKey: string | null): RetryItem[] {
  const active = items
    .filter((item) => item.status === 'active')
    .sort((left, right) => left.dueAt.localeCompare(right.dueAt)
      || left.sourcePly - right.sourcePly
      || left.retryKey.localeCompare(right.retryKey))
  // A Review action should always open the moment the player chose, even
  // after it has graduated from the regular due queue. This is an optional
  // replay, not a silent reset of its spaced-repetition progress.
  const requested = requestedRetryKey
    ? items.find((item) => item.retryKey === requestedRetryKey)
    : null
  if (requested && !active.some((item) => item.retryKey === requested.retryKey)) active.push(requested)
  return active
}

function initialKey(items: RetryItem[], requestedRetryKey: string | null): string | null {
  if (requestedRetryKey && items.some((item) => item.retryKey === requestedRetryKey)) return requestedRetryKey
  return items[0]?.retryKey ?? null
}

function moveNumberLabel(move: Pick<RetryLineMove, 'moveNumber' | 'color'>): string {
  return `${move.moveNumber}${move.color === 'b' ? '…' : '.'}`
}

function fallbackMoveNumberLabel(item: RetryItem): string {
  const number = Math.ceil(item.sourcePly / 2)
  return `${number}${item.sideToMove === 'b' ? '…' : '.'}`
}

function retryTimingLabel(dueAt: string, nowAt: string): string {
  const due = new Date(dueAt)
  const now = new Date(nowAt)
  if (!Number.isFinite(due.getTime()) || !Number.isFinite(now.getTime()) || due <= now) return 'due now'
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const daysAway = Math.round((dueDay - today) / (24 * 60 * 60 * 1000))
  if (daysAway === 0) return 'due later today'
  if (daysAway === 1) return 'due tomorrow'
  return `due ${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

function playerMovesCompleted(line: ReturnType<typeof createRetryLine>, completedPlies: number): number {
  if (!line) return 0
  return line.moves.slice(0, completedPlies).filter((move) => move.color === line.playerColor).length
}

export function RetryQueue({ items, requestedRetryKey, onSave, onDelete, onBackToReview, onOpenReview }: RetryQueueProps) {
  const queue = useMemo(() => activeQueue(items, requestedRetryKey), [items, requestedRetryKey])
  const retryLines = useMemo(() => new Map(queue.map((item) => [item.retryKey, createRetryLine(item)])), [queue])
  const [currentKey, setCurrentKey] = useState(() => initialKey(queue, requestedRetryKey))
  const [boardFen, setBoardFen] = useState(() => {
    const item = queue.find((candidate) => candidate.retryKey === initialKey(queue, requestedRetryKey)) ?? queue[0]
    return item?.preFen ?? ''
  })
  const [completedPlies, setCompletedPlies] = useState(0)
  const [lastRecordedMove, setLastRecordedMove] = useState<RetryLineMove | null>(null)
  const [selected, setSelected] = useState<Square | null>(null)
  const [promotion, setPromotion] = useState<Promotion | null>(null)
  const [state, setState] = useState<RetryState>('ready')
  const [hintLevel, setHintLevel] = useState(0)
  const [assisted, setAssisted] = useState(false)
  const [notice, setNotice] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const current = queue.find((item) => item.retryKey === currentKey) ?? queue[0] ?? null
  const line = current ? retryLines.get(current.retryKey) ?? null : null
  const board = useMemo(() => {
    if (!current) return null
    try {
      return new Chess(boardFen || current.preFen)
    } catch {
      return null
    }
  }, [boardFen, current])
  const answerVisible = state === 'solved' || state === 'revealed'
  const activePosition = useMemo(
    () => line ? retryLinePosition(line, completedPlies) : null,
    [completedPlies, line],
  )
  const targets = useMemo(() => {
    if (!line || !board || !selected || answerVisible) return new Set<Square>()
    return new Set<Square>(legalMovesFrom(board, selected).map((move) => move.to))
  }, [answerVisible, board, line, selected])
  const nowAt = new Date().toISOString()
  const dueCount = queue.filter((item) => item.dueAt <= nowAt).length

  const resetExercise = (item = current) => {
    if (!item) return
    const itemLine = createRetryLine(item)
    const start = itemLine ? retryLinePosition(itemLine, 0) : null
    setCurrentKey(item.retryKey)
    setBoardFen(start?.fen ?? item.preFen)
    setCompletedPlies(0)
    setLastRecordedMove(null)
    setSelected(null)
    setPromotion(null)
    setState('ready')
    setHintLevel(0)
    setAssisted(false)
    setNotice('')
    setSaveError('')
  }

  useEffect(() => {
    if (!current) return
    if (requestedRetryKey && requestedRetryKey === current.retryKey) return
    if (!currentKey || !queue.some((item) => item.retryKey === currentKey)) resetExercise(current)
  // Only queue identity should reset a local exercise; a saved scheduling update
  // for the same item must leave its solved/revealed board visible.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.retryKey, currentKey, queue, requestedRetryKey])

  useEffect(() => {
    if (!requestedRetryKey) return
    const requested = queue.find((item) => item.retryKey === requestedRetryKey)
    if (requested) resetExercise(requested)
  // A review action intentionally opens the requested item even if another
  // current exercise is already mounted.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedRetryKey])

  useEffect(() => {
    if (!current) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      const target = event.target instanceof HTMLElement ? event.target : null
      if (target?.isContentEditable || (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      if (event.key === 'Escape' && (selected || promotion)) {
        event.preventDefault()
        setSelected(null)
        setPromotion(null)
        return
      }
      if (event.key.toLowerCase() === 'r') {
        if (saving || deleting) return
        event.preventDefault()
        resetExercise(current)
        return
      }
      if (answerVisible) return
      if (event.key.toLowerCase() === 'h') {
        event.preventDefault()
        setAssisted(true)
        setHintLevel((level) => Math.min(2, level + 1))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  // The retry owns R/H/Escape only while its board is interactive; global
  // Review arrow navigation is unmounted on the Train page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answerVisible, current?.retryKey, deleting, promotion, saving, selected])

  if (!current || !board) {
    return (
      <article className="retry-queue retry-queue--empty">
        <div className="feature-icon"><Target size={24} /></div>
        <span className="eyebrow">From your games</span>
        <h2>Your review queue is clear</h2>
        <p>Finish a review and add a key moment when you want to practise it.</p>
        {onOpenReview && <button className="secondary-button" type="button" onClick={onOpenReview}>Open Review</button>}
      </article>
    )
  }

  if (!line || !activePosition) {
    return (
      <article className="retry-queue retry-queue--empty">
        <div className="feature-icon"><Target size={24} /></div>
        <span className="eyebrow">From your games</span>
        <h2>Saved review line unavailable</h2>
        <p>This saved line could not be reconstructed safely. Return to Review and create a new practice moment.</p>
        {onBackToReview && <button className="secondary-button" type="button" onClick={() => onBackToReview(current)}><ChevronLeft size={15} />Back to review</button>}
      </article>
    )
  }

  const persistAttempt = async (outcome: 'recorded-solution' | 'hinted' | 'revealed' | 'not-recorded' | 'skipped'): Promise<boolean> => {
    const next = recordRetryAttempt(current, outcome, new Date().toISOString())
    setSaving(true)
    setSaveError('')
    try {
      await onSave(next)
      return true
    } catch (error) {
      setSaveError(error instanceof Error ? `This practice result could not be saved: ${error.message}` : 'This practice result could not be saved locally.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const showRecordedLine = async () => {
    const finalPosition = retryLinePosition(line, line.moves.length)
    if (!finalPosition) {
      setSaveError('This saved review line could not be reconstructed safely.')
      return
    }
    setBoardFen(finalPosition.fen)
    setCompletedPlies(finalPosition.completedPlies)
    setLastRecordedMove(finalPosition.lastMove)
    setSelected(null)
    setPromotion(null)
    setState('revealed')
    setNotice(line.mode === 'continuation' ? 'The saved review line was revealed.' : `The saved review move was ${current.solutionSan}.`)
    await persistAttempt('revealed')
  }

  const submitMove = async (from: Square, to: Square, promotionPiece?: PromotionPiece) => {
    const outcome = attemptRetryLineMove(line, completedPlies, { from, to, promotion: promotionPiece })
    setSelected(null)
    setPromotion(null)
    if (outcome.outcome === 'illegal') {
      setNotice('Choose a legal destination.')
      return
    }
    if (outcome.outcome === 'not-recorded') {
      const start = retryLinePosition(line, 0)
      setBoardFen(start?.fen ?? current.preFen)
      setCompletedPlies(0)
      setLastRecordedMove(null)
      setState('not-recorded')
      setHintLevel(0)
      setAssisted(false)
      setNotice('That is not the saved review line. No new engine comparison was run, so try the line again.')
      await persistAttempt('not-recorded')
      return
    }

    setBoardFen(outcome.position.fen)
    setCompletedPlies(outcome.position.completedPlies)
    setLastRecordedMove(outcome.position.lastMove)
    setHintLevel(0)
    if (outcome.position.complete) {
      setState('solved')
      setNotice(assisted
        ? 'You replayed the saved review line with a hint. It will stay due for an unassisted try.'
        : 'You replayed the saved review line.')
      await persistAttempt(assisted ? 'hinted' : 'recorded-solution')
      return
    }

    const nextNumber = playerMovesCompleted(line, outcome.position.completedPlies) + 1
    setState('ready')
    setNotice(outcome.autoReply
      ? `Recorded reply: ${outcome.autoReply.san}. Your move ${nextNumber} of ${retryLinePlayerMoveCount(line)}.`
      : `Saved move accepted. Your move ${nextNumber} of ${retryLinePlayerMoveCount(line)}.`)
  }

  const attemptMove = (from: Square, to: Square) => {
    if (promotion || answerVisible || saving || deleting) return
    const piece = board.get(from)
    if (!piece || piece.color !== board.turn()) return
    const matches = legalMovesFrom(board, from).filter((move) => move.to === to)
    if (!matches.length) {
      setSelected(null)
      return
    }
    const choices = [...new Set(matches.map((move) => move.promotion).filter(Boolean))] as PromotionPiece[]
    if (choices.length) setPromotion({ from, to, choices })
    else void submitMove(from, to)
  }

  const chooseSquare = (square: Square) => {
    if (promotion || answerVisible || saving || deleting) return
    const piece = board.get(square)
    if (!selected || piece?.color === board.turn()) {
      setSelected(piece?.color === board.turn() ? square : null)
      return
    }
    if (selected === square) {
      setSelected(null)
      return
    }
    attemptMove(selected, square)
  }

  const next = () => {
    const index = queue.findIndex((item) => item.retryKey === current.retryKey)
    const item = queue[(index + 1) % queue.length]
    if (item) resetExercise(item)
  }

  const skipForNow = async () => {
    if (await persistAttempt('skipped')) next()
  }

  const removeCurrent = async () => {
    setDeleting(true)
    setSaveError('')
    try {
      const deleted = await onDelete(current.retryKey)
      if (deleted === false) setSaveError('This practice position could not be removed locally.')
    } catch (error) {
      setSaveError(error instanceof Error ? `This practice position could not be removed: ${error.message}` : 'This practice position could not be removed locally.')
    } finally {
      setDeleting(false)
    }
  }

  const expectedMove = activePosition.next
  const totalPlayerMoves = retryLinePlayerMoveCount(line)
  const completedPlayerMoves = playerMovesCompleted(line, completedPlies)
  const currentPlayerMove = Math.min(completedPlayerMoves + 1, totalPlayerMoves)
  const headerMove = line.moves[0]
  const currentDue = current.dueAt <= nowAt
  const timingLabel = retryTimingLabel(current.dueAt, nowAt)
  const queueSummary = current.status === 'mastered'
    ? { label: 'Mastered practice moment', text: 'Mastered' }
    : dueCount
      ? { label: `${dueCount} practice positions due`, text: `${dueCount} due` }
      : { label: `Next review ${timingLabel}`, text: `Next ${timingLabel}` }
  const hint = hintLevel === 1
    ? current.focus
    : hintLevel >= 2 && expectedMove
      ? `Start by considering the piece on ${expectedMove.from}.`
      : null

  return (
    <section className="retry-queue" aria-label="Personal review practice">
      <div className="retry-queue__heading">
        <div>
          <span className="eyebrow">From your games</span>
          <h2>{line.mode === 'continuation' ? 'Replay the saved review line' : 'Find the saved review move'}</h2>
          <p>{current.sideToMove === 'w' ? 'White' : 'Black'} to move · Review move {headerMove ? moveNumberLabel(headerMove) : fallbackMoveNumberLabel(current)} · {current.classification}{current.status === 'mastered' ? ' · optional replay' : !currentDue ? ` · early replay · ${timingLabel}` : ''}{!answerVisible ? ` · Your move ${currentPlayerMove} of ${totalPlayerMoves}` : ''}</p>
          {!answerVisible && line.mode === 'continuation' && (
            <ol className="retry-line-progress" aria-label={`Saved line progress: move ${currentPlayerMove} of ${totalPlayerMoves}`}>
              {Array.from({ length: totalPlayerMoves }, (_, index) => (
                <li key={index} className={index < completedPlayerMoves ? 'is-complete' : index === completedPlayerMoves ? 'is-current' : ''} aria-current={index === completedPlayerMoves ? 'step' : undefined}>
                  <span className="sr-only">Move {index + 1}{index < completedPlayerMoves ? ' complete' : index === completedPlayerMoves ? ' current' : ''}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="retry-queue__heading-actions">
          {onBackToReview && <button className="secondary-button" type="button" onClick={() => onBackToReview(current)}><ChevronLeft size={15} />Back to review</button>}
          <output aria-label={queueSummary.label}>{queueSummary.text}</output>
        </div>
      </div>

      {queue.length > 1 && (
        <div className="retry-queue__items" aria-label="Practice positions">
          {queue.map((item) => {
            const itemLine = retryLines.get(item.retryKey)
            const itemMove = itemLine?.moves[0]
            return (
              <button
                type="button"
                key={item.retryKey}
                className={item.retryKey === current.retryKey ? 'is-current' : ''}
                aria-current={item.retryKey === current.retryKey ? 'step' : undefined}
                onClick={() => resetExercise(item)}
                disabled={saving || deleting}
              >Move {itemMove ? moveNumberLabel(itemMove) : fallbackMoveNumberLabel(item)}<span>{item.classification}</span></button>
            )
          })}
        </div>
      )}

      <div className="retry-queue__board">
        <ChessBoard
          game={board}
          orientation={current.sideToMove === 'w' ? 'white' : 'black'}
          selected={selected}
          legalTargets={targets}
          lastMove={lastRecordedMove ? { from: lastRecordedMove.from, to: lastRecordedMove.to } : null}
          disabled={answerVisible || saving || deleting || Boolean(promotion)}
          onSquareClick={chooseSquare}
          onMoveAttempt={attemptMove}
        />
      </div>

      <section className={`retry-queue__panel ${answerVisible ? 'retry-queue__panel--answer' : ''}`}>
        {!answerVisible && <>
          <p>{line.mode === 'continuation'
            ? 'Replay the saved Stockfish line from this completed local review. After each correct move, its recorded reply appears; alternatives are not re-analysed.'
            : 'Find the saved Stockfish move from this completed local review. Other legal moves are not re-analysed here.'}</p>
          {hint && <div className="retry-hint"><Lightbulb size={15} /><span>{hint}</span></div>}
          <div className="retry-queue__actions">
            <button className="secondary-button" type="button" onClick={() => { setAssisted(true); setHintLevel((level) => Math.min(2, level + 1)) }} disabled={saving || deleting} title="Hint (H)"><Lightbulb size={15} />{hintLevel ? 'Stronger hint' : 'Hint'}</button>
            <button className="secondary-button" type="button" onClick={() => void showRecordedLine()} disabled={saving || deleting}><Eye size={15} />{line.mode === 'continuation' ? 'Reveal line' : 'Reveal move'}</button>
            {queue.length > 1 && <button className="secondary-button" type="button" onClick={() => void skipForNow()} disabled={saving || deleting}><ChevronRight size={15} />Try another moment</button>}
          </div>
        </>}
        {answerVisible && <>
          <strong>{state === 'solved' ? 'Saved review line replayed' : 'Saved review line revealed'}</strong>
          <p>{line.mode === 'continuation' ? `Saved Stockfish line: ${line.moves.map((move) => move.san).join(' ')}` : `Saved Stockfish move: ${current.solutionSan}`}</p>
          <p>{current.focus}</p>
          <div className="retry-queue__actions">
            <button className="secondary-button" type="button" onClick={() => resetExercise(current)} disabled={saving || deleting} title="Reset this position (R)"><RefreshCw size={15} />Try again</button>
            {queue.length > 1 && <button className="primary-button" type="button" onClick={next} disabled={saving || deleting}><ChevronRight size={15} />Next moment</button>}
            <button className="danger-button" type="button" onClick={() => void removeCurrent()} disabled={saving || deleting}><Trash2 size={15} />{deleting ? 'Removing…' : 'Remove'}</button>
          </div>
        </>}
        {notice && <p className="retry-queue__notice" role="status">{notice}</p>}
        {saveError && <p className="analysis-error" role="alert">{saveError}</p>}
      </section>

      {promotion && (
        <section className="retry-promotion" aria-label="Choose promotion piece">
          <span>Choose promotion</span>
          <div>
            {promotion.choices.map((piece) => (
              <button key={piece} type="button" onClick={() => void submitMove(promotion.from, promotion.to, piece)}>
                <ChessPiece color={board.turn()} type={piece} />
                <small>{promotionNames[piece] ?? piece.toUpperCase()}</small>
              </button>
            ))}
          </div>
          <button className="secondary-button" type="button" onClick={() => setPromotion(null)}>Cancel</button>
        </section>
      )}
    </section>
  )
}
