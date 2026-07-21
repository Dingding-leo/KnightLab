import type { BotLevel, MoveInput } from '../domain/chess'

export interface BotSearchRequest {
  type: 'search'
  id: number
  fen: string
  level: BotLevel
}

export interface BotSearchResult {
  type: 'result'
  id: number
  fen: string
  move: MoveInput | null
  elapsedMs: number
}

export interface BotSearchError {
  type: 'error'
  id: number
  fen: string
  message: string
}

export type BotWorkerResponse = BotSearchResult | BotSearchError
