import type { StoredGame } from './gameStore'

export interface LibraryHydrationRequest {
  type: 'hydrate-library'
  id: number
  raw: string | null
}

export interface LibraryHydrationResult {
  type: 'library-hydration-result'
  id: number
  games: StoredGame[]
}

export interface LibraryHydrationError {
  type: 'error'
  id: number
  message: string
}

export type LibraryHydrationResponse = LibraryHydrationResult | LibraryHydrationError
