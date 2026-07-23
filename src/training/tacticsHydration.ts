import {
  parseBrowserTacticsStateRaw,
  type TacticsState,
} from '../tactics/tacticsPersistence'

/**
 * Pure, fail-closed tactics-state hydration shared by the dedicated Worker
 * and its deliberately yielded fallback. Storage reads belong to the caller
 * so a fresh Play surface never starts this work by accident.
 */
export function hydrateTacticsState(raw: string | null): TacticsState {
  return parseBrowserTacticsStateRaw(raw)
}
