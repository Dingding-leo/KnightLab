import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type RefObject } from 'react'
import {
  MOVE_LIST_INITIAL_VISIBLE_ROWS,
  MOVE_LIST_REVEAL_STEP_ROWS,
  progressiveMoveRows,
  revealEarlierMoveRows,
} from './moveListPagination'

interface MoveListProps {
  moves: readonly string[]
  /** The currently displayed position, counted after a SAN move. */
  activePly: number
  /** Keep the newest notation in view only while the player follows live. */
  followingLatest: boolean
  onSelectPly: (ply: number) => void
}

interface MoveRowData {
  number: number
  white: string
  black?: string
  whitePly: number
  blackPly: number
}

interface MoveRowProps extends MoveRowData {
  whiteCurrent: boolean
  blackCurrent: boolean
  isLatest: boolean
  latestRowRef: RefObject<HTMLDivElement | null>
}

/**
 * Each notation row changes only when one of its own SAN values, current
 * state or latest-row state changes. This keeps a long game from rebuilding
 * all historical buttons as a new move arrives or a player previews a ply.
 */
const MoveRow = memo(function MoveRow({
  number,
  white,
  black,
  whitePly,
  blackPly,
  whiteCurrent,
  blackCurrent,
  isLatest,
  latestRowRef,
}: MoveRowProps) {
  return (
    <div
      className={`move-row ${number % 2 === 1 ? 'move-row--alternate' : ''} ${isLatest ? 'move-row--latest' : ''}`}
      ref={isLatest ? latestRowRef : undefined}
    >
      <span>{number}.</span>
      <button
        className={whiteCurrent ? 'move-button--current' : undefined}
        type="button"
        data-ply={whitePly}
        aria-current={whiteCurrent ? 'step' : undefined}
        aria-pressed={whiteCurrent}
        aria-label={`View position after ${number}. ${white}`}
      >
        {white}
      </button>
      {black ? (
        <button
          className={blackCurrent ? 'move-button--current' : undefined}
          type="button"
          data-ply={blackPly}
          aria-current={blackCurrent ? 'step' : undefined}
          aria-pressed={blackCurrent}
          aria-label={`View position after ${number}... ${black}`}
        >
          {black}
        </button>
      ) : <span aria-hidden="true" />}
    </div>
  )
})

export const MoveList = memo(function MoveList({ moves, activePly, followingLatest, onSelectPly }: MoveListProps) {
  const latestRow = useRef<HTMLDivElement>(null)
  const onSelectPlyRef = useRef(onSelectPly)
  const [visibleRowCount, setVisibleRowCount] = useState(MOVE_LIST_INITIAL_VISIBLE_ROWS)
  // Keep the delegated handler stable without pointing at a callback from an
  // abandoned concurrent render. Layout effects run before the committed
  // notation can receive a player click; SSR keeps the initial callback.
  useLayoutEffect(() => {
    onSelectPlyRef.current = onSelectPly
  }, [onSelectPly])

  const rows = useMemo(() => {
    const next: MoveRowData[] = []
    for (let index = 0; index < moves.length; index += 2) {
      next.push({
        number: index / 2 + 1,
        white: moves[index],
        black: moves[index + 1],
        whitePly: index + 1,
        blackPly: index + 2,
      })
    }
    return next
  }, [moves])

  const activeRowIndex = Number.isInteger(activePly) && activePly >= 1 && activePly <= moves.length
    ? Math.floor((activePly - 1) / 2)
    : null
  const page = useMemo(
    () => progressiveMoveRows(rows, visibleRowCount, activeRowIndex),
    [activeRowIndex, rows, visibleRowCount],
  )
  const nextRevealCount = Math.min(MOVE_LIST_REVEAL_STEP_ROWS, page.hiddenRowCount)

  const selectPlyFromNotation = useCallback((event: MouseEvent<HTMLDivElement>) => {
    if (!(event.target instanceof Element)) return
    const button = event.target.closest<HTMLButtonElement>('button[data-ply]')
    if (!button || !event.currentTarget.contains(button)) return
    const ply = Number(button.dataset.ply)
    if (!Number.isInteger(ply) || ply < 1) return
    onSelectPlyRef.current(ply)
  }, [])

  useEffect(() => {
    if (!followingLatest) return
    latestRow.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [followingLatest, moves.length])

  const showEarlierMoves = useCallback(() => {
    setVisibleRowCount((count) => revealEarlierMoveRows(count, rows.length))
  }, [rows.length])

  if (moves.length === 0) {
    return <div className="empty-state">Moves will appear here.</div>
  }

  const row = (item: MoveRowData) => (
    <MoveRow
      key={item.number}
      {...item}
      whiteCurrent={activePly === item.whitePly}
      blackCurrent={activePly === item.blackPly}
      isLatest={item.number === rows.length}
      latestRowRef={latestRow}
    />
  )
  const omittedLabel = (count: number) => `${count} earlier move${count === 1 ? '' : 's'} hidden`

  return (
    <div className="move-list" aria-label="Move history" aria-live="polite" aria-atomic="false" onClick={selectPlyFromNotation}>
      {page.hiddenRowCount > 0 && (
        <button
          className="move-list__show-earlier"
          type="button"
          onClick={showEarlierMoves}
          aria-label={`Show ${nextRevealCount} earlier moves; ${page.hiddenRowCount} earlier moves hidden`}
        >Show {nextRevealCount} earlier moves</button>
      )}
      {page.hiddenBeforePinnedCount > 0 && (
        <p className="move-list__omitted">{omittedLabel(page.hiddenBeforePinnedCount)}</p>
      )}
      {page.pinnedRow && row(page.pinnedRow)}
      {page.hiddenAfterPinnedCount > 0 && (
        <p className="move-list__omitted">{page.hiddenAfterPinnedCount} moves between this position and the newest notation hidden</p>
      )}
      {page.trailingRows.map(row)}
    </div>
  )
})
