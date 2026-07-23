import type { RetryItem } from '../review/retry'

export interface TrainingRetryHydrationRequest {
  type: 'hydrate-training-retries'
  id: number
  raw: string | null
}

export interface TrainingRetryHydrationResult {
  type: 'training-retry-hydration-result'
  id: number
  items: RetryItem[]
}

export interface TrainingRetryHydrationError {
  type: 'error'
  id: number
  message: string
}

export type TrainingRetryHydrationResponse = TrainingRetryHydrationResult | TrainingRetryHydrationError
