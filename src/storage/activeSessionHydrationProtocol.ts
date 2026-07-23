import type { ActiveSession } from './gameStore'

export interface ActiveSessionRawHydrationRequest {
  type: 'hydrate-active-session-raw'
  id: number
  raw: string | null
}

export interface ActiveSessionHydrationRequestFromSession {
  type: 'hydrate-active-session'
  id: number
  session: ActiveSession | null
}

export type ActiveSessionHydrationRequest = ActiveSessionRawHydrationRequest | ActiveSessionHydrationRequestFromSession

/**
 * `gameState` is an intentionally prototype-free structured-clone snapshot
 * of chess.js's own state. The UI reattaches and verifies its prototype before
 * it can be used; it is never persisted as application data.
 */
export interface HydratedActiveSessionWire {
  snapshotVersion: 1
  session: ActiveSession
  finalFen: string
  historyLength: number
  gameState: unknown
  verboseHistory: unknown
}

export interface ActiveSessionHydrationResult {
  type: 'active-session-result'
  id: number
  hydrated: HydratedActiveSessionWire | null
}

export interface ActiveSessionHydrationError {
  type: 'error'
  id: number
  message: string
}

export type ActiveSessionHydrationResponse = ActiveSessionHydrationResult | ActiveSessionHydrationError
