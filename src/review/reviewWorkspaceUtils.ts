import type { Square } from 'chess.js'
import type { CoachGuidance } from './coach'

export function evidenceSquaresForGuidance(guidance: CoachGuidance | null): Set<Square> {
  return new Set(guidance?.evidence.flatMap((item) => item.squares) ?? [])
}

export type ReviewNavigationAction = 'first' | 'previous' | 'next' | 'last'

export function reviewNavigationForKey(input: {
  key: string
  editable?: boolean
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}): ReviewNavigationAction | null {
  if (input.editable || input.metaKey || input.ctrlKey || input.altKey || input.shiftKey) return null
  if (input.key === 'ArrowLeft') return 'previous'
  if (input.key === 'ArrowRight') return 'next'
  if (input.key === 'Home') return 'first'
  if (input.key === 'End') return 'last'
  return null
}

export function reviewPlyAfter(action: ReviewNavigationAction, currentPly: number, maxPly: number): number {
  if (action === 'first') return 0
  if (action === 'last') return maxPly
  if (action === 'previous') return Math.max(0, currentPly - 1)
  return Math.min(maxPly, currentPly + 1)
}
