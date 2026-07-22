import type { Square } from 'chess.js'

export interface InertAnalysisBoardInteraction {
  legalTargets: ReadonlySet<Square>
  onSquareClick: (square: Square) => void
  onMoveAttempt: (from: Square, to: Square) => void
}

const EMPTY_ANALYSIS_LEGAL_TARGETS: ReadonlySet<Square> = new Set()

function ignoreAnalysisSquare(_square: Square): void {
  // The review board is read-only; its active position is changed by the
  // notation and navigation controls instead of direct square interaction.
}

function ignoreAnalysisMove(_from: Square, _to: Square): void {
  // See ignoreAnalysisSquare above. Keeping this callback stable lets the
  // memoized board skip review-progress-only renders.
}

/**
 * Shared read-only board callbacks. These must remain referentially stable:
 * a full review reports progress twice per ply, none of which should redraw
 * an unchanged 64-square board just because its inert interaction props were
 * recreated.
 */
export const inertAnalysisBoardInteraction: Readonly<InertAnalysisBoardInteraction> = Object.freeze({
  legalTargets: EMPTY_ANALYSIS_LEGAL_TARGETS,
  onSquareClick: ignoreAnalysisSquare,
  onMoveAttempt: ignoreAnalysisMove,
})
