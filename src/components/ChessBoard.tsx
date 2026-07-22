import {
  memo,
  useCallback,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import type { Chess, Color, PieceSymbol, Square } from 'chess.js'
import { ChessPiece } from './ChessPiece'

interface ChessBoardProps {
  game: Chess
  orientation: 'white' | 'black'
  selected: Square | null
  legalTargets: Set<Square>
  lastMove: { from: Square; to: Square } | null
  evidenceSquares?: ReadonlySet<Square>
  /** Lets a human queue a premove while the other colour is currently to move. */
  interactionColor?: Color | null
  premove?: { from: Square; to: Square } | null
  premoveMode?: boolean
  disabled?: boolean
  onSquareClick: (square: Square) => void
  onMoveAttempt: (from: Square, to: Square) => void
}

const whiteFiles = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const blackFiles = [...whiteFiles].reverse()
const whiteRanks = [8, 7, 6, 5, 4, 3, 2, 1] as const
const blackRanks = [...whiteRanks].reverse()
const pieceNames: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
}

interface ActivePointer {
  id: number
  source: Square
  selectedForDrag: boolean
}

function squareFromElement(element: Element | null): Square | null {
  const value = element?.closest<HTMLElement>('[data-square]')?.dataset.square
  return value && /^[a-h][1-8]$/.test(value) ? value as Square : null
}

interface BoardSquareProps {
  square: Square
  file: string
  rank: number
  pieceColor: Color | null
  pieceType: PieceSymbol | null
  light: boolean
  selected: boolean
  target: boolean
  lastMove: boolean
  evidence: boolean
  premoveState: 'from' | 'to' | null
  canDrag: boolean
  disabled: boolean
  focused: boolean
  showFileCoordinate: boolean
  showRankCoordinate: boolean
  onSquareClick: (square: Square, event: ReactMouseEvent<HTMLButtonElement>) => void
  onPointerStart: (square: Square, canDrag: boolean, event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerEnd: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onFocusSquare: (square: Square) => void
  onGridKeyDown: (square: Square, event: ReactKeyboardEvent<HTMLButtonElement>) => void
  registerButton: (square: Square, element: HTMLButtonElement | null) => void
}

/**
 * Most board interactions change only a few squares. Keeping a square's
 * wrapper memoized avoids replacing all 64 buttons, handlers and refs on each
 * selection, premove or keyboard-focus change.
 */
const BoardSquare = memo(function BoardSquare({
  square,
  file,
  rank,
  pieceColor,
  pieceType,
  light,
  selected,
  target,
  lastMove,
  evidence,
  premoveState,
  canDrag,
  disabled,
  focused,
  showFileCoordinate,
  showRankCoordinate,
  onSquareClick,
  onPointerStart,
  onPointerMove,
  onPointerEnd,
  onPointerCancel,
  onFocusSquare,
  onGridKeyDown,
  registerButton,
}: BoardSquareProps) {
  const premoveLabel = premoveState === 'from' ? 'source' : premoveState === 'to' ? 'destination' : null
  const setButton = useCallback((element: HTMLButtonElement | null) => {
    registerButton(square, element)
  }, [registerButton, square])
  const handleClick = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    onSquareClick(square, event)
  }, [onSquareClick, square])
  const handlePointerStart = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    onPointerStart(square, canDrag, event)
  }, [canDrag, onPointerStart, square])
  const handleFocus = useCallback(() => {
    onFocusSquare(square)
  }, [onFocusSquare, square])
  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    onGridKeyDown(square, event)
  }, [onGridKeyDown, square])

  return (
    <button
      type="button"
      className={[
        'square',
        light ? 'square--light' : 'square--dark',
        selected ? 'square--selected' : '',
        target ? 'square--target' : '',
        lastMove ? 'square--last' : '',
        evidence ? 'square--evidence' : '',
        premoveState ? `square--premove-${premoveState}` : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={handleClick}
      draggable={false}
      data-draggable={canDrag ? 'true' : undefined}
      onPointerDown={handlePointerStart}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onPointerCancel}
      disabled={disabled}
      role="gridcell"
      tabIndex={focused ? 0 : -1}
      ref={setButton}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      data-square={square}
      data-evidence={evidence || undefined}
      data-premove={premoveState ?? undefined}
      aria-pressed={selected}
      aria-label={`${square}${pieceType && pieceColor ? ` ${pieceColor === 'w' ? 'white' : 'black'} ${pieceNames[pieceType]}` : ''}${evidence ? ', coach evidence' : ''}${premoveLabel ? `, queued premove ${premoveLabel}` : ''}`}
    >
      {pieceType && pieceColor ? <ChessPiece color={pieceColor} type={pieceType} /> : null}
      {target ? <span className={pieceType ? 'capture-ring' : 'move-dot'} aria-hidden="true" /> : null}
      {showFileCoordinate ? <span className="coord coord--file">{file}</span> : null}
      {showRankCoordinate ? <span className="coord coord--rank">{rank}</span> : null}
    </button>
  )
})
BoardSquare.displayName = 'BoardSquare'

function ChessBoardView({
  game,
  orientation,
  selected,
  legalTargets,
  lastMove,
  evidenceSquares,
  interactionColor,
  premove,
  premoveMode,
  disabled,
  onSquareClick,
  onMoveAttempt,
}: ChessBoardProps) {
  const files = orientation === 'white' ? whiteFiles : blackFiles
  const ranks = orientation === 'white' ? whiteRanks : blackRanks
  const activePointer = useRef<ActivePointer | null>(null)
  const suppressedSquares = useRef<Set<Square>>(new Set())
  const squareButtons = useRef(new Map<Square, HTMLButtonElement>())
  const latestCallbacks = useRef({ onSquareClick, onMoveAttempt })
  latestCallbacks.current = { onSquareClick, onMoveAttempt }
  // A grid should be one Tab stop, not 64. Keep the current visual square
  // roving so keyboard users can traverse it with the arrow keys instead.
  const [focusSquare, setFocusSquare] = useState<Square>(
    () => (orientation === 'white' ? 'a8' : 'h1') as Square,
  )
  const boardLabel = premoveMode
    ? `Chess board. Premove mode: choose one ${interactionColor === 'w' ? 'white' : 'black'} move while the bot thinks.`
    : evidenceSquares?.size
      ? `Chess board. Coach evidence highlighted on ${[...evidenceSquares].join(', ')}.`
      : 'Chess board'

  const dispatchSquareClick = useCallback((square: Square) => {
    latestCallbacks.current.onSquareClick(square)
  }, [])

  const dispatchMoveAttempt = useCallback((from: Square, to: Square) => {
    latestCallbacks.current.onMoveAttempt(from, to)
  }, [])

  const squareAtPointer = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const underPointer = typeof document === 'undefined'
      ? null
      : document.elementFromPoint(event.clientX, event.clientY)
    const underPointerSquare = squareFromElement(underPointer)
    if (underPointerSquare) return underPointerSquare

    return typeof Element !== 'undefined' && event.target instanceof Element
      ? squareFromElement(event.target)
      : null
  }, [])

  const releasePointer = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      // A cancelled or already-released pointer can no longer be captured.
    }
  }, [])

  const clearPointer = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const pointer = activePointer.current
    if (!pointer || pointer.id !== event.pointerId) return null
    activePointer.current = null
    releasePointer(event)
    return pointer
  }, [releasePointer])

  const suppressPointerClick = useCallback((...squares: Square[]) => {
    squares.forEach((square) => suppressedSquares.current.add(square))
    // A drag normally produces its click immediately after pointerup. Clear the
    // guard on the next task so a browser that suppresses that click cannot make
    // the user's next tap disappear.
    setTimeout(() => suppressedSquares.current.clear(), 0)
  }, [])

  const startPointerMove = useCallback((
    square: Square,
    canDrag: boolean,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (!canDrag || !event.isPrimary || event.button !== 0 || activePointer.current) return
    activePointer.current = { id: event.pointerId, source: square, selectedForDrag: false }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      activePointer.current = null
    }
  }, [])

  const updatePointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const pointer = activePointer.current
    if (!pointer || pointer.id !== event.pointerId || pointer.selectedForDrag) return

    const target = squareAtPointer(event)
    if (!target || target === pointer.source) return
    pointer.selectedForDrag = true
    dispatchSquareClick(pointer.source)
  }, [dispatchSquareClick, squareAtPointer])

  const finishPointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const pointer = clearPointer(event)
    if (!pointer) return

    const target = squareAtPointer(event)
    if (!target || target === pointer.source) return

    suppressPointerClick(pointer.source, target)
    dispatchMoveAttempt(pointer.source, target)
  }, [clearPointer, dispatchMoveAttempt, squareAtPointer, suppressPointerClick])

  const cancelPointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    clearPointer(event)
  }, [clearPointer])

  const moveGridFocus = useCallback((square: Square, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const direction = event.key === 'ArrowRight'
      ? { file: 1, rank: 0 }
      : event.key === 'ArrowLeft'
        ? { file: -1, rank: 0 }
        : event.key === 'ArrowDown'
          ? { file: 0, rank: 1 }
          : event.key === 'ArrowUp'
            ? { file: 0, rank: -1 }
            : null
    if (!direction) return

    const fileIndex = files.indexOf(square[0] as (typeof files)[number])
    const rankIndex = ranks.indexOf(Number(square[1]) as (typeof ranks)[number])
    const nextFile = fileIndex + direction.file
    const nextRank = rankIndex + direction.rank
    if (nextFile < 0 || nextFile >= files.length || nextRank < 0 || nextRank >= ranks.length) return

    event.preventDefault()
    const next = `${files[nextFile]}${ranks[nextRank]}` as Square
    setFocusSquare(next)
    // Focus after React has applied the new roving tabindex. Directly focusing
    // the known button keeps the visual and accessibility cursor in sync.
    squareButtons.current.get(next)?.focus()
  }, [files, ranks])

  const handleSquareClick = useCallback((square: Square, event: ReactMouseEvent<HTMLButtonElement>) => {
    if (event.detail !== 0 && suppressedSquares.current.has(square)) {
      suppressedSquares.current.delete(square)
      return
    }
    dispatchSquareClick(square)
  }, [dispatchSquareClick])

  const registerButton = useCallback((square: Square, element: HTMLButtonElement | null) => {
    if (element) squareButtons.current.set(square, element)
    else squareButtons.current.delete(square)
  }, [])

  return (
    <div
      className="board"
      role="grid"
      aria-label={boardLabel}
      style={{ touchAction: 'none' }}
    >
      {ranks.flatMap((rank, rankIndex) =>
        files.map((file, fileIndex) => {
          const square = `${file}${rank}` as Square
          const piece = game.get(square)
          const originalFileIndex = whiteFiles.indexOf(file)
          const isLight = (originalFileIndex + rank) % 2 === 0
          const isSelected = selected === square
          const isTarget = legalTargets.has(square)
          const isLastMove = lastMove?.from === square || lastMove?.to === square
          const isEvidence = evidenceSquares?.has(square) ?? false
          const premoveState = premove?.from === square ? 'from' : premove?.to === square ? 'to' : null

          return (
            <BoardSquare
              key={square}
              square={square}
              file={file}
              rank={rank}
              pieceColor={piece?.color ?? null}
              pieceType={piece?.type ?? null}
              light={isLight}
              selected={isSelected}
              target={isTarget}
              lastMove={isLastMove}
              evidence={isEvidence}
              premoveState={premoveState}
              canDrag={Boolean(!disabled && piece?.color === (interactionColor ?? game.turn()))}
              disabled={Boolean(disabled)}
              focused={focusSquare === square}
              showFileCoordinate={rankIndex === 7}
              showRankCoordinate={fileIndex === 0}
              onSquareClick={handleSquareClick}
              onPointerStart={startPointerMove}
              onPointerMove={updatePointerMove}
              onPointerEnd={finishPointerMove}
              onPointerCancel={cancelPointerMove}
              onFocusSquare={setFocusSquare}
              onGridKeyDown={moveGridFocus}
              registerButton={registerButton}
            />
          )
        }),
      )}
    </div>
  )
}

// Clock-only updates should not rebuild the 64-square interactive grid.
export const ChessBoard = memo(ChessBoardView)
ChessBoard.displayName = 'ChessBoard'
