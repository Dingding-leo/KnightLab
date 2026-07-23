/// <reference lib="webworker" />

import { hydrateTacticsState } from './tacticsHydration'
import type {
  TacticsHydrationRequest,
  TacticsHydrationResponse,
} from './tacticsHydrationProtocol'

const workerScope = self as DedicatedWorkerGlobalScope

workerScope.onmessage = (event: MessageEvent<TacticsHydrationRequest>) => {
  const request = event.data
  try {
    const response: TacticsHydrationResponse = {
      type: 'tactics-hydration-result',
      id: request.id,
      state: hydrateTacticsState(request.raw),
    }
    workerScope.postMessage(response)
  } catch (error) {
    const response: TacticsHydrationResponse = {
      type: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : 'Could not prepare local tactics history.',
    }
    workerScope.postMessage(response)
  }
}

export {}
