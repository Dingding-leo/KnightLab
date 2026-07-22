import {
  MAX_RETRY_BYTES,
  MAX_RETRY_ITEMS,
  assertRetryItem,
  compareRetryItems,
  isRetryItem,
  isRetryKey,
  type RetryItem,
} from './retry'

const RETRY_STORAGE_KEY = 'knightclub.retry-items.v1'
const MAX_BROWSER_RETRY_STORAGE_BYTES = MAX_RETRY_ITEMS * (MAX_RETRY_BYTES + 2) + 2

export interface RetryStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

interface CachedRetryItems {
  /** Exact storage text used to validate this private snapshot. */
  raw: string | null
  /** Never expose these mutable records outside this module. */
  items: readonly RetryItem[]
  /** Preserves the first sorted match, including malformed duplicate legacy keys. */
  byKey: ReadonlyMap<string, RetryItem>
}

/**
 * A browser training turn normally follows the startup load of this mirror.
 * Replaying every valid stored position on each new result is needlessly
 * expensive, so retain only a private, raw-text-versioned verified snapshot.
 * A different storage value (including one written by another tab) always
 * invalidates it and goes back through the fail-closed parser below.
 */
const browserRetryCache = new WeakMap<RetryStorage, CachedRetryItems>()

function browserStorage(storage?: RetryStorage): RetryStorage | null {
  if (storage) return storage
  return typeof localStorage === 'undefined' ? null : localStorage
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function cloneRetryItem(item: RetryItem): RetryItem {
  // Persisted JSON may contain ignored legacy fields. Retain only the
  // validated RetryItem schema so an unrecognised nested value cannot leak
  // through a shallow copy and later corrupt this private cache.
  return {
    schemaVersion: item.schemaVersion,
    retryKey: item.retryKey,
    reviewKey: item.reviewKey,
    sourcePly: item.sourcePly,
    preFen: item.preFen,
    sideToMove: item.sideToMove,
    playedMoveUci: item.playedMoveUci,
    playedMoveSan: item.playedMoveSan,
    solutionUci: item.solutionUci,
    solutionSan: item.solutionSan,
    solutionLineSan: [...item.solutionLineSan],
    classification: item.classification,
    focus: item.focus,
    status: item.status,
    attemptCount: item.attemptCount,
    correctStreak: item.correctStreak,
    dueAt: item.dueAt,
    lastAttemptAt: item.lastAttemptAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

function parseBrowserRetryItems(raw: string | null): RetryItem[] {
  try {
    if (raw === null || byteLength(raw) > MAX_BROWSER_RETRY_STORAGE_BYTES) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(isRetryItem)
      .sort(compareRetryItems)
      .slice(0, MAX_RETRY_ITEMS)
  } catch {
    return []
  }
}

function cacheRetryItems(
  storage: RetryStorage,
  raw: string | null,
  items: readonly RetryItem[],
): CachedRetryItems {
  // Cloning keeps a caller that mutates a returned retry from corrupting the
  // only snapshot allowed to skip full chess validation on a later save.
  const privateItems = items.map(cloneRetryItem)
  const byKey = new Map<string, RetryItem>()
  for (const item of privateItems) {
    if (!byKey.has(item.retryKey)) byKey.set(item.retryKey, item)
  }
  const cached: CachedRetryItems = { raw, items: privateItems, byKey }
  browserRetryCache.set(storage, cached)
  return cached
}

function readBrowserRetrySnapshot(storage: RetryStorage): CachedRetryItems {
  let raw: string | null = null
  try {
    raw = storage.getItem(RETRY_STORAGE_KEY)
  } catch {
    // Keep the existing fail-closed behavior: an unreadable browser mirror is
    // treated as empty, while a later successful write can repair it.
  }

  const cached = browserRetryCache.get(storage)
  if (cached && cached.raw === raw) return cached
  return cacheRetryItems(storage, raw, parseBrowserRetryItems(raw))
}

function insertRetryItem(items: readonly RetryItem[], item: RetryItem): RetryItem[] {
  // Remove every duplicate legacy identity so save retains the old canonical
  // replacement semantics without an O(n log n) resort of an already sorted
  // verified snapshot.
  const withoutExisting = items.filter((saved) => saved.retryKey !== item.retryKey)
  let start = 0
  let end = withoutExisting.length
  while (start < end) {
    const middle = Math.floor((start + end) / 2)
    if (compareRetryItems(item, withoutExisting[middle]!) <= 0) end = middle
    else start = middle + 1
  }
  const next = [
    ...withoutExisting.slice(0, start),
    cloneRetryItem(item),
    ...withoutExisting.slice(start),
  ]
  return next.slice(0, MAX_RETRY_ITEMS)
}

/** Loads only independently valid, bounded retry items from browser storage. */
export function loadBrowserRetryItems(storage?: RetryStorage): RetryItem[] {
  const target = browserStorage(storage)
  if (!target) return []
  return readBrowserRetrySnapshot(target).items.map(cloneRetryItem)
}

export function saveBrowserRetryItem(item: RetryItem, storage?: RetryStorage): void {
  assertRetryItem(item)
  const target = browserStorage(storage)
  if (!target) throw new Error('Local retry storage is unavailable.')
  const next = insertRetryItem(readBrowserRetrySnapshot(target).items, item)
  const serialized = JSON.stringify(next)
  if (byteLength(serialized) > MAX_BROWSER_RETRY_STORAGE_BYTES) {
    throw new Error('Local retry storage exceeds its safe size limit.')
  }
  target.setItem(RETRY_STORAGE_KEY, serialized)
  cacheRetryItems(target, serialized, next)
}

export function loadBrowserRetryItem(retryKey: string, storage?: RetryStorage): RetryItem | null {
  if (!isRetryKey(retryKey)) return null
  const target = browserStorage(storage)
  if (!target) return null
  const item = readBrowserRetrySnapshot(target).byKey.get(retryKey)
  return item ? cloneRetryItem(item) : null
}

export function deleteBrowserRetryItem(retryKey: string, storage?: RetryStorage): boolean {
  if (!isRetryKey(retryKey)) return false
  const target = browserStorage(storage)
  if (!target) return false
  const snapshot = readBrowserRetrySnapshot(target)
  const items = snapshot.items
  const next = items.filter((item) => item.retryKey !== retryKey)
  if (next.length === items.length) return false
  try {
    if (next.length) {
      const serialized = JSON.stringify(next)
      target.setItem(RETRY_STORAGE_KEY, serialized)
      cacheRetryItems(target, serialized, next)
    } else {
      target.removeItem(RETRY_STORAGE_KEY)
      cacheRetryItems(target, null, [])
    }
    return true
  } catch {
    return false
  }
}
