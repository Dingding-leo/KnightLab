import type { HydratedPersistedReview } from './reviewPersistence'

export type ReviewHydrationRequestType = 'hydrate-browser-review' | 'hydrate-native-review'

export interface BrowserReviewHydrationRequest {
  type: 'hydrate-browser-review'
  id: number
  raw: string | null
  reviewKey: string
}

export interface NativeReviewHydrationRequest {
  type: 'hydrate-native-review'
  id: number
  record: unknown
  reviewKey: string
}

export type ReviewHydrationRequest = BrowserReviewHydrationRequest | NativeReviewHydrationRequest

export interface ReviewHydrationResult {
  type: 'review-hydration-result'
  id: number
  requestType: ReviewHydrationRequestType
  hydration: HydratedPersistedReview | null
}

export interface ReviewHydrationError {
  type: 'error'
  id: number
  message: string
}

export type ReviewHydrationResponse = ReviewHydrationResult | ReviewHydrationError
