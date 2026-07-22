import type { EngineSearchResult } from './stockfishClient'

type PlaySearchIdentity = Pick<EngineSearchResult, 'provider' | 'engineName' | 'enginePath' | 'warning'>

/** A status update derived only from a completed Play search—never a new probe. */
export type PlayEngineStatusUpdate =
  | { kind: 'ready'; engineName: string; enginePath: string }
  | { kind: 'error'; message: string }
  | null

/**
 * Opening cues and rules-proven forced replies deliberately skip Stockfish,
 * so they leave the configured engine status alone. A real Stockfish response
 * proves the configured engine was usable; a fallback means the old ready
 * label must not remain visible.
 */
export function playEngineStatusUpdate(result: PlaySearchIdentity): PlayEngineStatusUpdate {
  if (result.provider === 'opening-cue' || result.provider === 'forced-move') return null
  if (result.provider === 'knightbot') {
    return {
      kind: 'error',
      message: result.warning ?? 'Stockfish was unavailable; KnightBot took over.',
    }
  }

  const engineName = result.engineName.trim()
  const enginePath = result.enginePath?.trim()
  if (!engineName || !enginePath) {
    return {
      kind: 'error',
      message: 'Stockfish completed a move without a valid engine identity.',
    }
  }
  return { kind: 'ready', engineName, enginePath }
}

/** Converts an unrecoverable Play search failure into an honest status label. */
export function playEngineFailureStatus(error: unknown): Extract<PlayEngineStatusUpdate, { kind: 'error' }> {
  const message = error instanceof Error && error.message.trim()
    ? error.message
    : 'Stockfish could not complete the move.'
  return { kind: 'error', message }
}
