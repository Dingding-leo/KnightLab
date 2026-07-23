import type { RetryItem } from '../review/retry'

export type TrainingSource = 'tactics' | 'personal' | 'vision'

export function defaultTrainingSource(
  items: readonly Pick<RetryItem, 'status' | 'dueAt'>[],
  requestedRetryKey: string | null,
  now = new Date().toISOString(),
): TrainingSource {
  if (requestedRetryKey) return 'personal'
  return items.some((item) => item.status === 'active' && item.dueAt <= now) ? 'personal' : 'tactics'
}

/**
 * A deferred personal queue initially arrives empty. Once its local Worker
 * has finished, restore the old due-first default only when the player has
 * not already picked a different trainer during the honest loading state.
 */
export function shouldDefaultToPersonalAfterRetryHydration(
  wasLoading: boolean,
  isLoading: boolean,
  playerSelectedSource: boolean,
  items: readonly Pick<RetryItem, 'status' | 'dueAt'>[],
  now = new Date().toISOString(),
): boolean {
  return wasLoading
    && !isLoading
    && !playerSelectedSource
    && items.some((item) => item.status === 'active' && item.dueAt <= now)
}
