import { memo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
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

  const squareAtPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const underPointer = typeof document === 'undefined'
      ? null
      : document.elementFromPoint(event.clientX, event.clientY)
    const underPointerSquare = squareFromElement(underPointer)
    if (underPointerSquare) return underPointerSquare

    return typeof Element !== 'undefined' && event.target instanceof Element
      ? squareFromElement(event.target)
      : null
  }

  const releasePointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId)
      }
    } catch {
      // A cancelled or already-released pointer can no longer be captured.
    }
  }

  const clearPointer = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const pointer = activePointer.current
    if (!pointer || pointer.id !== event.pointerId) return null
    activePointer.current = null
    releasePointer(event)
    return pointer
  }

  const suppressPointerClick = (...squares: Square[]) => {
    squares.forEach((square) => suppressedSquares.current.add(square))
    // A drag normally produces its click immediately after pointerup. Clear the
    // guard on the next task so a browser that suppresses that click cannot make
    // the user's next tap disappear.
    setTimeout(() => suppressedSquares.current.clear(), 0)
  }

  const startPointerMove = (
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
  }

  const updatePointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const pointer = activePointer.current
    if (!pointer || pointer.id !== event.pointerId || pointer.selectedForDrag) return

    const target = squareAtPointer(event)
    if (!target || target === pointer.source) return
    pointer.selectedForDrag = true
    onSquareClick(pointer.source)
  }

  const finishPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const pointer = clearPointer(event)
    if (!pointer) return

    const target = squareAtPointer(event)
    if (!target || target === pointer.source) return

    suppressPointerClick(pointer.source, target)
    onMoveAttempt(pointer.source, target)
  }

  const cancelPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    clearPointer(event)
  }

  const moveGridFocus = (square: Square, event: ReactKeyboardEvent<HTMLButtonElement>) => {
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
  }

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
          const premoveLabel = premoveState === 'from' ? 'source' : premoveState === 'to' ? 'destination' : null
          const canDrag = !disabled && piece?.color === (interactionColor ?? game.turn())

          return (
            <button
              key={square}
              type="button"
              className={[
                'square',
                isLight ? 'square--light' : 'square--dark',
                isSelected ? 'square--selected' : '',
                isTarget ? 'square--target' : '',
                isLastMove ? 'square--last' : '',
                isEvidence ? 'square--evidence' : '',
                premoveState ? `square--premove-${premoveState}` : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={(event) => {
                if (event.detail !== 0 && suppressedSquares.current.has(square)) {
                  suppressedSquares.current.delete(square)
                  return
                }
                onSquareClick(square)
              }}
              draggable={false}
              data-draggable={canDrag ? 'true' : undefined}
              onPointerDown={(event) => startPointerMove(square, canDrag, event)}
              onPointerMove={updatePointerMove}
              onPointerUp={finishPointerMove}
              onPointerCancel={cancelPointerMove}
              onLostPointerCapture={cancelPointerMove}
              disabled={disabled}
              role="gridcell"
              tabIndex={focusSquare === square ? 0 : -1}
              ref={(element) => {
                if (element) squareButtons.current.set(square, element)
                else squareButtons.current.delete(square)
              }}
              onFocus={() => setFocusSquare(square)}
              onKeyDown={(event) => moveGridFocus(square, event)}
              data-square={square}
              data-evidence={isEvidence || undefined}
              data-premove={premoveState ?? undefined}
              aria-pressed={isSelected}
              aria-label={`${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${pieceNames[piece.type]}` : ''}${isEvidence ? ', coach evidence' : ''}${premoveLabel ? `, queued premove ${premoveLabel}` : ''}`}
            >
              {piece ? <ChessPiece color={piece.color} type={piece.type} /> : null}
              {isTarget ? <span className={piece ? 'capture-ring' : 'move-dot'} aria-hidden="true" /> : null}
              {rankIndex === 7 ? <span className="coord coord--file">{file}</span> : null}
              {fileIndex === 0 ? <span className="coord coord--rank">{rank}</span> : null}
            </button>
          )
        }),
      )}
    </div>
  )
}

// Clock-only updates should not rebuild the 64-square interactive grid.
export const ChessBoard = memo(ChessBoardView)
ChessBoard.displayName = 'ChessBoard'
