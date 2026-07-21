/// <reference lib="webworker" />

import { chooseBotMove } from './knightBot'
import type { BotSearchRequest, BotWorkerResponse } from './botProtocol'

const workerScope = self as DedicatedWorkerGlobalScope

workerScope.onmessage = (event: MessageEvent<BotSearchRequest>) => {
  const request = event.data
  if (request.type !== 'search') return

  const startedAt = performance.now()
  try {
    const response: BotWorkerResponse = {
      type: 'result',
      id: request.id,
      fen: request.fen,
      move: chooseBotMove(request.fen, request.level),
      elapsedMs: performance.now() - startedAt,
    }
    workerScope.postMessage(response)
  } catch (error) {
    const response: BotWorkerResponse = {
      type: 'error',
      id: request.id,
      fen: request.fen,
      message: error instanceof Error ? error.message : 'Unknown bot worker error',
    }
    workerScope.postMessage(response)
  }
}

export {}
