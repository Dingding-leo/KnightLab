import type { Chess, Color, PieceSymbol, Square } from 'chess.js'

interface ChessBoardProps {
  game: Chess
  orientation: 'white' | 'black'
  selected: Square | null
  legalTargets: Set<Square>
  lastMove: { from: Square; to: Square } | null
  disabled?: boolean
  onSquareClick: (square: Square) => void
}

const glyphs: Record<Color, Record<PieceSymbol, string>> = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
}

const whiteFiles = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const blackFiles = [...whiteFiles].reverse()
const whiteRanks = [8, 7, 6, 5, 4, 3, 2, 1] as const
const blackRanks = [...whiteRanks].reverse()

export function ChessBoard({
  game,
  orientation,
  selected,
  legalTargets,
  lastMove,
  disabled,
  onSquareClick,
}: ChessBoardProps) {
  const files = orientation === 'white' ? whiteFiles : blackFiles
  const ranks = orientation === 'white' ? whiteRanks : blackRanks

  return (
    <div className="board" role="grid" aria-label="Chess board">
      {ranks.flatMap((rank, rankIndex) =>
        files.map((file, fileIndex) => {
          const square = `${file}${rank}` as Square
          const piece = game.get(square)
          const originalFileIndex = whiteFiles.indexOf(file)
          const isLight = (originalFileIndex + rank) % 2 === 1
          const isSelected = selected === square
          const isTarget = legalTargets.has(square)
          const isLastMove = lastMove?.from === square || lastMove?.to === square

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
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSquareClick(square)}
              disabled={disabled}
              role="gridcell"
              aria-label={`${square}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}`}
            >
              {piece ? <span className={`piece piece--${piece.color}`}>{glyphs[piece.color][piece.type]}</span> : null}
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
