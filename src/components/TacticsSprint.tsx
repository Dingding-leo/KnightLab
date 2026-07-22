import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess, type PieceSymbol, type Square } from 'chess.js'
import { ChevronRight, Eye, Lightbulb, RefreshCw, Target, Trophy } from 'lucide-react'
import { legalMovesFrom } from '../domain/chess'
import { SEED_TACTICS } from '../tactics/seedPuzzles'
import {
  attemptTacticLineMove,
  createTacticLine,
  dueTactics,
  tacticLinePlayerMoveCount,
  tacticLinePosition,
  type TacticLineMove,
  type TacticProgress,
  type TacticPuzzle,
} from '../tactics/tactics'
import { ChessBoard } from './ChessBoard'
import { ChessPiece } from './ChessPiece'

export interface TacticsSprintProps {
  progress: TacticProgress
  /** Persists exactly one terminal result; partial line progress remains local. */
  onRecordAttempt: (puzzle: TacticPuzzle, result: TacticsSprintResult) => Promise<void>
}

type SprintState = 'ready' | 'solved' | 'revealed'
type PromotionPiece = Extract<PieceSymbol, 'q' | 'r' | 'b' | 'n'>
type Promotion = { from: Square; to: Square; choices: PromotionPiece[] }

export type TacticsSprintOutcome = 'solved' | 'failed' | 'hinted' | 'revealed'

export interface TacticsSprintResult {
  outcome: TacticsSprintOutcome
  elapsedMs: number
  moveCount: number
  hintCount: number
}

const STARTER_SPRINT_SIZE = 3

const promotionNames: Partial<Record<PieceSymbol, string>> = {
  q: 'Queen',
  r: 'Rook',
  b: 'Bishop',
  n: 'Knight',
}

function startingSprint(progress: TacticProgress): TacticPuzzle[] {
  try {
    return dueTactics(SEED_TACTICS, progress).slice(0, STARTER_SPRINT_SIZE)
  } catch {
    // A damaged local progress record must not turn Train into a blank page.
    // The durable store rejects malformed data before it reaches normal use.
    return SEED_TACTICS.slice(0, STARTER_SPRINT_SIZE)
  }
}

function playerMovesCompleted(line: ReturnType<typeof createTacticLine>, completedPlies: number): number {
  if (!line) return 0
  return line.moves.slice(0, completedPlies).filter((move) => move.color === line.playerColor).length
}

function explanationFor(puzzle: TacticPuzzle): string {
  if (puzzle.themes.includes('mate-in-one')) {
    return 'The forcing check closes every legal escape. In a mating net, check the king’s flight squares before looking for material.'
  }
  if (puzzle.themes.includes('fork')) {
    return 'The forcing move gains a tempo, then the knight can collect the second target. Checks often make a double attack decisive.'
  }
  return 'The recorded line uses a forcing move first, then converts the tactical advantage without giving the opponent a free reply.'
}

function noSpoilerHint(level: number, expected: TacticLineMove | null): string | null {
  if (level === 1) return 'Start with forcing moves: checks, captures, and direct threats.'
  if (level >= 2 && expected) return `Begin with the piece on ${expected.from}.`
  return null
}

export function TacticsSprint({ progress, onRecordAttempt }: TacticsSprintProps) {
  const [sessionQueue] = useState(() => startingSprint(progress))
  const [currentIndex, setCurrentIndex] = useState(0)
  const [boardFen, setBoardFen] = useState(() => sessionQueue[0]?.fen ?? '')
  const [completedPlies, setCompletedPlies] = useState(0)
  const [lastMove, setLastMove] = useState<TacticLineMove | null>(null)
  const [selected, setSelected] = useState<Square | null>(null)
  const [promotion, setPromotion] = useState<Promotion | null>(null)
  const [state, setState] = useState<SprintState>('ready')
  const [hintLevel, setHintLevel] = useState(0)
  const [hintCount, setHintCount] = useState(0)
  const [moveCount, setMoveCount] = useState(0)
  const [attemptStartedAt, setAttemptStartedAt] = useState(() => Date.now())
  const [assisted, setAssisted] = useState(false)
  const [notice, setNotice] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [sprintComplete, setSprintComplete] = useState(false)
  const resultHeading = useRef<HTMLHeadingElement | null>(null)

  const current = sessionQueue[currentIndex] ?? null
  const line = useMemo(() => current ? createTacticLine(current) : null, [current])
  const activePosition = useMemo(
    () => line ? tacticLinePosition(line, completedPlies) : null,
    [completedPlies, line],
  )
  const board = useMemo(() => {
    if (!current) return null
    try {
      return new Chess(boardFen || current.fen)
    } catch {
      return null
    }
  }, [boardFen, current])
  const answerVisible = state === 'solved' || state === 'revealed'
  const targets = useMemo(() => {
    if (!line || !board || !selected || answerVisible) return new Set<Square>()
    return new Set<Square>(legalMovesFrom(board, selected).map((move) => move.to))
  }, [answerVisible, board, line, selected])

  const resetExercise = (puzzle = current) => {
    if (!puzzle) return
    setBoardFen(puzzle.fen)
    setCompletedPlies(0)
    setLastMove(null)
    setSelected(null)
    setPromotion(null)
    setState('ready')
    setHintLevel(0)
    setHintCount(0)
    setMoveCount(0)
    setAttemptStartedAt(Date.now())
    setAssisted(false)
    setNotice('')
    setSaveError('')
  }

  useEffect(() => {
    resetExercise(current)
  // A new selected puzzle should never inherit a previous board or answer.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id])

  useEffect(() => {
    if (!answerVisible) return
    resultHeading.current?.focus({ preventScroll: true })
  }, [answerVisible])

  const persistAttempt = async (outcome: TacticsSprintOutcome, terminalMoveCount = moveCount): Promise<boolean> => {
    if (!current) return false
    setSaving(true)
    setSaveError('')
    try {
      await onRecordAttempt(current, {
        outcome,
        elapsedMs: Math.min(3_600_000, Math.max(0, Date.now() - attemptStartedAt)),
        moveCount: terminalMoveCount,
        hintCount,
      })
      return true
    } catch (error) {
      setSaveError(error instanceof Error
        ? `This tactic result could not be saved: ${error.message}`
        : 'This tactic result could not be saved locally. Try the position again.')
      return false
    } finally {
      setSaving(false)
    }
  }

  const submitMove = async (from: Square, to: Square, promotionPiece?: PromotionPiece) => {
    if (!line || !current || saving || answerVisible) return
    const outcome = attemptTacticLineMove(line, completedPlies, { from, to, promotion: promotionPiece })
    const nextMoveCount = moveCount + 1
    setMoveCount(nextMoveCount)
    setSelected(null)
    setPromotion(null)
    if (outcome.outcome === 'illegal') {
      setNotice('Choose a legal destination.')
      return
    }
    if (outcome.outcome === 'not-recorded') {
      setNotice('That legal move is not this verified line. Try another move.')
      if (await persistAttempt('failed', nextMoveCount)) {
        setHintLevel(0)
        setHintCount(0)
        setAssisted(false)
        setMoveCount(0)
        setAttemptStartedAt(Date.now())
      }
      return
    }

    setBoardFen(outcome.position.fen)
    setCompletedPlies(outcome.position.completedPlies)
    setLastMove(outcome.position.lastMove)
    setHintLevel(0)
    if (outcome.position.complete) {
      setState('solved')
      setNotice(assisted
        ? 'Line completed with a hint. It stays ready for an unassisted try.'
        : 'Verified line completed. Nice calculation.')
      await persistAttempt(assisted ? 'hinted' : 'solved', nextMoveCount)
      return
    }

    const completed = playerMovesCompleted(line, outcome.position.completedPlies)
    setNotice(outcome.autoReply
      ? `Recorded reply played. Your move ${completed + 1} of ${tacticLinePlayerMoveCount(line)}.`
      : `Good. Your move ${completed + 1} of ${tacticLinePlayerMoveCount(line)}.`)
  }

  const attemptMove = (from: Square, to: Square) => {
    if (!board || promotion || answerVisible || saving) return
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
    if (!board || promotion || answerVisible || saving) return
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

  const reveal = async () => {
    if (!line || !current || saving) return
    const finalPosition = tacticLinePosition(line, line.moves.length)
    if (!finalPosition) {
      setSaveError('This local tactic line could not be reconstructed safely.')
      return
    }
    setAssisted(true)
    setBoardFen(finalPosition.fen)
    setCompletedPlies(finalPosition.completedPlies)
    setLastMove(finalPosition.lastMove)
    setSelected(null)
    setPromotion(null)
    setState('revealed')
    setNotice('The verified line was revealed. It remains ready for an unassisted try.')
    await persistAttempt('revealed')
  }

  const nextPuzzle = () => {
    if (currentIndex >= sessionQueue.length - 1) {
      setSprintComplete(true)
      return
    }
    setCurrentIndex((index) => index + 1)
    setAssisted(false)
  }

  const restartSprint = () => {
    setSprintComplete(false)
    setCurrentIndex(0)
    setAssisted(false)
    resetExercise(sessionQueue[0] ?? null)
  }

  const requestHint = () => {
    if (answerVisible || saving) return
    setAssisted(true)
    setHintLevel((level) => Math.min(2, level + 1))
    setHintCount((count) => Math.min(3, count + 1))
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
    const target = event.target instanceof HTMLElement ? event.target : null
    if (target?.isContentEditable || (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
    if (event.key === 'Escape' && (selected || promotion)) {
      event.preventDefault()
      setSelected(null)
      setPromotion(null)
      return
    }
    if (event.key.toLowerCase() === 'r' && !saving) {
      event.preventDefault()
      resetExercise()
      return
    }
    if (event.key.toLowerCase() === 'h' && !answerVisible && !saving) {
      event.preventDefault()
      requestHint()
    }
  }

  if (!sessionQueue.length || !current || !line || !activePosition || !board) {
    return (
      <article className="tactics-sprint tactics-sprint--empty">
        <div className="feature-icon"><Trophy size={24} /></div>
        <span className="eyebrow">Tactics Sprint</span>
        <h2>Your starter tactics are up to date</h2>
        <p>There are no local starter positions due right now. Review one of your games to add personal practice, or return when a tactic is due.</p>
      </article>
    )
  }

  if (sprintComplete) {
    return (
      <article className="tactics-sprint tactics-sprint--complete" aria-label="Tactics Sprint complete">
        <div className="feature-icon"><Trophy size={24} /></div>
        <span className="eyebrow">Tactics Sprint</span>
        <h2>Three positions, one clearer habit</h2>
        <p>Your results were saved locally. Unassisted lines move forward in your review schedule; hinted and revealed lines stay ready for another try.</p>
        <button className="secondary-button" type="button" onClick={restartSprint}><RefreshCw size={15} />Start this sprint again</button>
      </article>
    )
  }

  const totalPlayerMoves = tacticLinePlayerMoveCount(line)
  const completedPlayerMoves = playerMovesCompleted(line, completedPlies)
  const currentPlayerMove = Math.min(completedPlayerMoves + 1, totalPlayerMoves)
  const hint = noSpoilerHint(hintLevel, activePosition.next)
  const lastPuzzle = currentIndex === sessionQueue.length - 1

  return (
    <section className="tactics-sprint" aria-label="Tactics Sprint" onKeyDown={onKeyDown}>
      <div className="tactics-sprint__heading">
        <div>
          <span className="eyebrow">Original local tactics</span>
          <h2>Tactics Sprint</h2>
          <p>{current.sideToMove === 'w' ? 'White' : 'Black'} to move · Puzzle {currentIndex + 1} of {sessionQueue.length}{!answerVisible ? ` · Your move ${currentPlayerMove} of ${totalPlayerMoves}` : ''}</p>
          {!answerVisible && totalPlayerMoves > 1 && (
            <ol className="tactics-sprint__progress" aria-label={`Puzzle progress: move ${currentPlayerMove} of ${totalPlayerMoves}`}>
              {Array.from({ length: totalPlayerMoves }, (_, index) => (
                <li key={index} className={index < completedPlayerMoves ? 'is-complete' : index === completedPlayerMoves ? 'is-current' : ''} aria-current={index === completedPlayerMoves ? 'step' : undefined}>
                  <span className="sr-only">Move {index + 1}{index < completedPlayerMoves ? ' complete' : index === completedPlayerMoves ? ' current' : ''}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <output aria-label={`Puzzle ${currentIndex + 1} of ${sessionQueue.length}`}><Target size={14} />{currentIndex + 1}/{sessionQueue.length}</output>
      </div>

      <div className="tactics-sprint__board">
        <ChessBoard
          game={board}
          orientation={line.playerColor === 'w' ? 'white' : 'black'}
          selected={selected}
          legalTargets={targets}
          lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
          interactionColor={line.playerColor}
          disabled={answerVisible || saving || Boolean(promotion)}
          onSquareClick={chooseSquare}
          onMoveAttempt={attemptMove}
        />
      </div>

      <section className={`tactics-sprint__panel ${answerVisible ? 'tactics-sprint__panel--answer' : ''}`}>
        {!answerVisible && <>
          <p>Find the saved local solution. After a correct move, only the recorded reply appears; alternative legal moves are not re-analysed during practice.</p>
          {hint && <div className="tactics-sprint__hint"><Lightbulb size={15} /><span>{hint}</span></div>}
          <div className="tactics-sprint__actions">
            <button className="secondary-button" type="button" onClick={requestHint} disabled={saving}><Lightbulb size={15} />{hintLevel ? 'Stronger hint' : 'Hint'}</button>
            <button className="secondary-button" type="button" onClick={() => void reveal()} disabled={saving}><Eye size={15} />Reveal line</button>
            <button className="secondary-button" type="button" onClick={() => resetExercise()} disabled={saving}><RefreshCw size={15} />Reset</button>
          </div>
        </>}
        {answerVisible && <>
          <h3 ref={resultHeading} tabIndex={-1}>{state === 'solved' ? 'Verified line completed' : 'Verified line revealed'}</h3>
          <p className="tactics-sprint__solution">Solution: {line.moves.map((move) => move.san).join(' ')}</p>
          <p>{current.title} · {explanationFor(current)}</p>
          <div className="tactics-sprint__actions">
            <button className="secondary-button" type="button" onClick={() => resetExercise()} disabled={saving}><RefreshCw size={15} />Try again</button>
            <button className="primary-button" type="button" onClick={nextPuzzle} disabled={saving || Boolean(saveError)}><ChevronRight size={15} />{lastPuzzle ? 'Finish sprint' : 'Next puzzle'}</button>
          </div>
        </>}
        {notice && <p className="tactics-sprint__notice" role="status">{notice}</p>}
        {saveError && <p className="analysis-error" role="alert">{saveError}</p>}
      </section>

      {promotion && (
        <section className="tactics-sprint__promotion" aria-label="Choose promotion piece">
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
