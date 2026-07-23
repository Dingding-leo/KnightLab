import type { RetryItem } from '../review/retry'
import { parseBrowserRetryItemsRaw } from '../review/retryPersistence'

/**
 * Pure, fail-closed retry hydration used by both the dedicated Worker and its
 * deliberately yielded fallback. Keeping this boundary free of storage reads
 * makes Train opt in only after its shell is visible.
 */
export function hydrateTrainingRetryItems(raw: string | null): RetryItem[] {
  return parseBrowserRetryItemsRaw(raw)
}
