import type { TacticsState } from '../tactics/tacticsPersistence'

export interface TacticsHydrationRequest {
  type: 'hydrate-tactics-state'
  id: number
  raw: string | null
}

export interface TacticsHydrationResult {
  type: 'tactics-hydration-result'
  id: number
  state: TacticsState
}

export interface TacticsHydrationError {
  type: 'error'
  id: number
  message: string
}

export type TacticsHydrationResponse = TacticsHydrationResult | TacticsHydrationError
