export type PlayPreviewNavigation = 'previous' | 'next'

export interface PlayPreviewShortcutInput {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  editable?: boolean
  modalOpen?: boolean
  boardGridFocused?: boolean
}

/**
 * Preserve arrow-key board navigation and browser/input behavior while making
 * Play history as quick to inspect as the existing Review replay.
 */
export function playPreviewNavigationForKey(input: PlayPreviewShortcutInput): PlayPreviewNavigation | null {
  if (input.editable
    || input.modalOpen
    || input.boardGridFocused
    || input.metaKey
    || input.ctrlKey
    || input.altKey
    || input.shiftKey) return null
  if (input.key === 'ArrowLeft') return 'previous'
  if (input.key === 'ArrowRight') return 'next'
  return null
}

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

/** Returns the next preview state for an arrow shortcut; `null` follows live. */
export function previewPlyAfterShortcut(
  action: PlayPreviewNavigation,
  previewPly: number | null,
  maxPly: number,
): number | null {
  if (!Number.isInteger(maxPly) || maxPly < 1) return previewPly
  if (previewPly !== null && (!Number.isInteger(previewPly) || previewPly < 1 || previewPly > maxPly)) {
    return previewPly
  }
  if (action === 'previous') {
    if (previewPly === null) return maxPly > 1 ? maxPly - 1 : null
    return Math.max(1, previewPly - 1)
  }
  if (previewPly === null) return null
  return previewPlyAfter('next', previewPly, maxPly)
}
