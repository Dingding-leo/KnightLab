/**
 * The live notation keeps the newest rows mounted, then grows backwards in
 * deliberate batches. A historical preview outside that trailing window gets
 * one pinned row rather than forcing the full game history back into the DOM.
 */
export const MOVE_LIST_INITIAL_VISIBLE_ROWS = 40
export const MOVE_LIST_REVEAL_STEP_ROWS = 40

export interface ProgressiveMoveRows<T> {
  /** The newest contiguous window, in chronological order. */
  trailingRows: readonly T[]
  /** The selected row when it sits before the newest window. */
  pinnedRow: T | null
  /** Rows omitted before a pinned historical position. */
  hiddenBeforePinnedCount: number
  /** Rows omitted between a pinned historical position and the newest window. */
  hiddenAfterPinnedCount: number
  /** All rows currently omitted from the DOM. */
  hiddenRowCount: number
}

function boundedVisibleRows(requested: number, total: number): number {
  const value = Number.isFinite(requested) ? Math.trunc(requested) : 0
  return Math.max(0, Math.min(total, value))
}

/**
 * Keeps the list work bounded during cursor navigation. `pinnedRowIndex` is
 * already known from a ply, so this never searches the full row collection.
 */
export function progressiveMoveRows<T>(
  rows: readonly T[],
  visibleRowCount: number,
  pinnedRowIndex: number | null,
): ProgressiveMoveRows<T> {
  const total = rows.length
  const visible = boundedVisibleRows(visibleRowCount, total)
  const trailingStart = total - visible
  const hasPinnedRow = pinnedRowIndex !== null
    && Number.isInteger(pinnedRowIndex)
    && pinnedRowIndex >= 0
    && pinnedRowIndex < trailingStart
  const pinnedIndex = hasPinnedRow ? pinnedRowIndex : null
  const pinnedRow = pinnedIndex === null ? null : rows[pinnedIndex] ?? null
  const hiddenBeforePinnedCount = pinnedIndex ?? trailingStart
  const hiddenAfterPinnedCount = pinnedIndex === null ? 0 : trailingStart - pinnedIndex - 1
  const hiddenRowCount = hiddenBeforePinnedCount + hiddenAfterPinnedCount

  return {
    trailingRows: rows.slice(trailingStart),
    pinnedRow,
    hiddenBeforePinnedCount,
    hiddenAfterPinnedCount,
    hiddenRowCount,
  }
}

export function revealEarlierMoveRows(visibleRowCount: number, totalRowCount: number): number {
  const current = boundedVisibleRows(visibleRowCount, totalRowCount)
  return Math.min(totalRowCount, current + MOVE_LIST_REVEAL_STEP_ROWS)
}
