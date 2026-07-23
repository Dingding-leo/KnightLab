/// <reference lib="webworker" />

import {
  hydrateBrowserReviewRaw,
  hydratePersistedReview,
  isReviewKey,
} from './reviewPersistence'
import type {
  ReviewHydrationRequest,
  ReviewHydrationResponse,
} from './reviewHydrationProtocol'

const workerScope = self as DedicatedWorkerGlobalScope

function hydrateRequest(request: ReviewHydrationRequest) {
  if (!isReviewKey(request.reviewKey)) throw new Error('Review key is invalid.')
  if (request.type === 'hydrate-browser-review') {
    return hydrateBrowserReviewRaw(request.raw, request.reviewKey)
  }
  if (request.record === null) return null
  const hydration = hydratePersistedReview(request.record)
  if (hydration.record.reviewKey !== request.reviewKey) {
    throw new Error('KnightClub received a mismatched saved review.')
  }
  return hydration
}

workerScope.onmessage = (event: MessageEvent<ReviewHydrationRequest>) => {
  const request = event.data
  try {
    const response: ReviewHydrationResponse = {
      type: 'review-hydration-result',
      id: request.id,
      requestType: request.type,
      hydration: hydrateRequest(request),
    }
    workerScope.postMessage(response)
  } catch (error) {
    const response: ReviewHydrationResponse = {
      type: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : 'Saved review could not be restored.',
    }
    workerScope.postMessage(response)
  }
}

export {}
