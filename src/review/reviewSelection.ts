import type { GameReview } from './gameReviewRunner'
import type { ReviewedMove } from './reviewModel'

/**
 * Review moves are persisted in contiguous ply order. Preserve the defensive
 * ply check for malformed legacy data, without linearly scanning every move
 * whenever the player navigates the board.
 */
export function selectedReviewMoveAtPly(
  review: Pick<GameReview, 'moves'> | null,
  ply: number,
): ReviewedMove | null {
  if (!Number.isInteger(ply) || ply < 1) return null
  const candidate = review?.moves[ply - 1] ?? null
  return candidate?.ply === ply ? candidate : null
}
