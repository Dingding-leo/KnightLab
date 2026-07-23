/// <reference lib="webworker" />

import { hydrateLibrary } from './libraryHydration'
import type {
  LibraryHydrationRequest,
  LibraryHydrationResponse,
} from './libraryHydrationProtocol'

const workerScope = self as DedicatedWorkerGlobalScope

workerScope.onmessage = (event: MessageEvent<LibraryHydrationRequest>) => {
  const request = event.data
  try {
    const response: LibraryHydrationResponse = {
      type: 'library-hydration-result',
      id: request.id,
      games: hydrateLibrary(request.raw),
    }
    workerScope.postMessage(response)
  } catch (error) {
    const response: LibraryHydrationResponse = {
      type: 'error',
      id: request.id,
      message: error instanceof Error ? error.message : 'Could not prepare your saved games.',
    }
    workerScope.postMessage(response)
  }
}

export {}
