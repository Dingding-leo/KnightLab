/// <reference lib="webworker" />

import { hydrateTrainingRetryItems } from './trainingRetryHydration'
import type {
  TrainingRetryHydrationRequest,
  TrainingRetryHydrationResponse,
} from './trainingRetryHydrationProtocol'

const workerScope = self as DedicatedWorkerGlobalScope

workerScope.onmessage = (event: MessageEvent<TrainingRetryHydrationRequest>) => {
  const request = event.data
  try {
    const response: TrainingRetryHydrationResponse = {
      type: 'training-retry-hydration-result',
      id: request.id,
      items: hydrateTrainingRetryItems(request.raw),
    }
    workerScope.postMessage(response)
  } catch (error) {
    const response: TrainingRetryHydrationResponse = {
      type: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : 'Could not prepare local training history.',
    }
    workerScope.postMessage(response)
  }
}

export {}
