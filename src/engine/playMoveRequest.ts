import type { Chess } from 'chess.js'
import { onlyLegalMove, type MoveInput } from '../domain/chess'
import type { EngineSearchResult } from './stockfishClient'

interface PlayMoveRequestInput {
  game: Chess
  /** An authored cue has priority over the generic local rules route. */
  openingMove: MoveInput | null
  /** Invoked only when the bot has a real choice for an engine to evaluate. */
  search: () => Promise<EngineSearchResult>
}

/**
 * Avoid creating an engine request when local, validated data already fixes
 * the bot's move. Keeping this decision outside the Play effect makes the
 * no-search contract directly testable.
 */
export function requestPlayMove({ game, openingMove, search }: PlayMoveRequestInput): Promise<EngineSearchResult> {
  if (openingMove) {
    return Promise.resolve({
      move: openingMove,
      ponder: null,
      candidates: [],
      provider: 'opening-cue',
      engineName: 'Local opening cue',
    })
  }

  const forcedMove = onlyLegalMove(game)
  if (forcedMove) {
    return Promise.resolve({
      move: forcedMove,
      ponder: null,
      candidates: [],
      provider: 'forced-move',
      engineName: 'Local rules',
    })
  }

  return search()
}
