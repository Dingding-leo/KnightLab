import {
  normalizeAnalysisSettings,
  type AnalysisResponse,
  type AnalysisSettings,
} from './stockfishAnalysisClient'

export type AmbientAnalysisBackend = 'browser' | 'desktop'

export interface AmbientAnalysisRequest {
  backend: AmbientAnalysisBackend
  enginePath: string | null
  fen: string
  settings: AnalysisSettings
}

export const DEFAULT_AMBIENT_ANALYSIS_CACHE_SIZE = 24

function copyResponse(response: AnalysisResponse): AnalysisResponse {
  return {
    ...response,
    lines: response.lines.map((line) => ({
      ...line,
      score: { ...line.score },
      wdl: line.wdl ? [line.wdl[0], line.wdl[1], line.wdl[2]] : null,
      pv: [...line.pv],
    })),
  }
}

/**
 * Canonical identity for the lightweight, interactive Review panel only.
 * Full-game review deliberately has its own reproducible job contract and
 * must never reuse this convenience cache.
 */
export function ambientAnalysisCacheKey(request: AmbientAnalysisRequest): string {
  const settings = normalizeAnalysisSettings(request.settings)
  return JSON.stringify({
    backend: request.backend,
    enginePath: request.enginePath?.trim() || null,
    fen: request.fen,
    settings: [
      settings.moveTimeMs,
      settings.depth,
      settings.nodes,
      settings.multiPv,
      settings.threads,
      settings.hashMb,
    ],
  })
}

/** A small session-local LRU for already validated ambient position results. */
export class AmbientAnalysisCache {
  private readonly entries = new Map<string, AnalysisResponse>()
  private readonly maxEntries: number

  constructor(maxEntries = DEFAULT_AMBIENT_ANALYSIS_CACHE_SIZE) {
    this.maxEntries = Number.isInteger(maxEntries) && maxEntries > 0
      ? maxEntries
      : DEFAULT_AMBIENT_ANALYSIS_CACHE_SIZE
  }

  get size(): number {
    return this.entries.size
  }

  get(request: AmbientAnalysisRequest): AnalysisResponse | null {
    const key = ambientAnalysisCacheKey(request)
    const response = this.entries.get(key)
    if (!response) return null

    // Moving a hit to the end keeps the cache bounded without making a recent
    // back-and-forth review scrub evict its own positions.
    this.entries.delete(key)
    this.entries.set(key, response)
    return copyResponse(response)
  }

  set(request: AmbientAnalysisRequest, response: AnalysisResponse): void {
    // The client already validates results, but keep a malformed caller from
    // poisoning a cache entry if this module is reused elsewhere.
    if (response.fen !== request.fen) return

    const key = ambientAnalysisCacheKey(request)
    this.entries.delete(key)
    this.entries.set(key, copyResponse(response))
    while (this.entries.size > this.maxEntries) {
      const oldestKey = this.entries.keys().next().value
      if (oldestKey === undefined) return
      this.entries.delete(oldestKey)
    }
  }
}
