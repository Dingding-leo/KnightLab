import { parseBrowserLibraryRaw, type StoredGame } from './gameStore'

/**
 * Pure, fail-closed library hydration used by both the dedicated Worker and
 * its deliberately yielded fallback. Storage reads stay outside this boundary
 * so the Library tab can paint before it opts into parsing saved PGNs.
 */
export function hydrateLibrary(raw: string | null): StoredGame[] {
  return parseBrowserLibraryRaw(raw)
}
