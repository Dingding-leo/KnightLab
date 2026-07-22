export type PlayPreviewNavigation = 'previous' | 'next'

/**
 * Advances a read-only Play-history preview without ever mutating the live
 * game. Reaching the newest ply returns `null`, the existing representation
 * for following the live board.
 */
export function previewPlyAfter(
  action: PlayPreviewNavigation,
  currentPly: number,
  maxPly: number,
): number | null {
  if (!Number.isInteger(currentPly) || !Number.isInteger(maxPly)
    || currentPly < 1 || maxPly < 1 || currentPly > maxPly) return null
  if (action === 'previous') return Math.max(1, currentPly - 1)
  return currentPly + 1 >= maxPly ? null : currentPly + 1
}
