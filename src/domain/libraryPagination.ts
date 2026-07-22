/** Keep a large local history responsive without changing which games match a filter. */
export const LIBRARY_PAGE_SIZE = 24

export interface ProgressiveLibraryResults<T> {
  items: readonly T[]
  shownCount: number
  totalCount: number
  remainingCount: number
}

function boundedRevealCount(revealCount: number, totalCount: number): number {
  const requested = Number.isFinite(revealCount) ? Math.trunc(revealCount) : 0
  return Math.max(0, Math.min(totalCount, requested))
}

/**
 * Paginate after a caller has completed its full search/filter operation, so
 * an older matching game never disappears merely because it is outside an
 * arbitrary first page of the unfiltered library.
 */
export function progressiveLibraryResults<T>(
  filteredItems: readonly T[],
  revealCount: number,
): ProgressiveLibraryResults<T> {
  const totalCount = filteredItems.length
  const shownCount = boundedRevealCount(revealCount, totalCount)
  return {
    items: filteredItems.slice(0, shownCount),
    shownCount,
    totalCount,
    remainingCount: totalCount - shownCount,
  }
}

export function revealMoreLibraryResults(
  revealCount: number,
  totalCount: number,
): number {
  const boundedTotal = Math.max(0, Math.trunc(totalCount))
  return Math.min(
    boundedTotal,
    boundedRevealCount(revealCount, boundedTotal) + LIBRARY_PAGE_SIZE,
  )
}
