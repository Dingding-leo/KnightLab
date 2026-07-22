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

function browserStorage(storage?: RetryStorage): RetryStorage | null {
  if (storage) return storage
  return typeof localStorage === 'undefined' ? null : localStorage
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

/** Loads only independently valid, bounded retry items from browser storage. */
export function loadBrowserRetryItems(storage?: RetryStorage): RetryItem[] {
  const target = browserStorage(storage)
  if (!target) return []
  try {
    const raw = target.getItem(RETRY_STORAGE_KEY)
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

export function saveBrowserRetryItem(item: RetryItem, storage?: RetryStorage): void {
  assertRetryItem(item)
  const target = browserStorage(storage)
  if (!target) throw new Error('Local retry storage is unavailable.')
  const next = [item, ...loadBrowserRetryItems(target).filter((saved) => saved.retryKey !== item.retryKey)]
    .sort(compareRetryItems)
    .slice(0, MAX_RETRY_ITEMS)
  const serialized = JSON.stringify(next)
  if (byteLength(serialized) > MAX_BROWSER_RETRY_STORAGE_BYTES) {
    throw new Error('Local retry storage exceeds its safe size limit.')
  }
  target.setItem(RETRY_STORAGE_KEY, serialized)
}

export function loadBrowserRetryItem(retryKey: string, storage?: RetryStorage): RetryItem | null {
  if (!isRetryKey(retryKey)) return null
  return loadBrowserRetryItems(storage).find((item) => item.retryKey === retryKey) ?? null
}

export function deleteBrowserRetryItem(retryKey: string, storage?: RetryStorage): boolean {
  if (!isRetryKey(retryKey)) return false
  const target = browserStorage(storage)
  if (!target) return false
  const items = loadBrowserRetryItems(target)
  const next = items.filter((item) => item.retryKey !== retryKey)
  if (next.length === items.length) return false
  try {
    if (next.length) target.setItem(RETRY_STORAGE_KEY, JSON.stringify(next))
    else target.removeItem(RETRY_STORAGE_KEY)
    return true
  } catch {
    return false
  }
}
