/// <reference lib="webworker" />

import { hydrateActiveSession, hydrateActiveSessionRaw } from './activeSessionHydration'
import type {
  ActiveSessionHydrationRequest,
  ActiveSessionHydrationResponse,
} from './activeSessionHydrationProtocol'

const workerScope = self as DedicatedWorkerGlobalScope

workerScope.onmessage = (event: MessageEvent<ActiveSessionHydrationRequest>) => {
  const request = event.data
  try {
    const hydrated = request.type === 'hydrate-active-session-raw'
      ? hydrateActiveSessionRaw(request.raw)
      : hydrateActiveSession(request.session)
    const response: ActiveSessionHydrationResponse = {
      type: 'active-session-result',
      id: request.id,
      hydrated,
    }
    workerScope.postMessage(response)
  } catch (error) {
    const response: ActiveSessionHydrationResponse = {
      type: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : 'Could not restore your saved game.',
    }
    workerScope.postMessage(response)
  }
}

export {}
