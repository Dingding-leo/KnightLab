import type { PersistedReview } from './reviewPersistence'

interface BackgroundReviewSave {
  save: (review: PersistedReview) => Promise<void>
  record: PersistedReview
  isCurrent: () => boolean
  /**
   * A durable application-level notification. Unlike UI callbacks, this must
   * run after a successful write even when the originating workspace has been
   * replaced, so linked library metadata can remain truthful.
   */
  onPersisted: (review: PersistedReview) => void
  onSaved: (review: PersistedReview) => void
  onFailed: (error: unknown) => void
}

/**
 * Keep storage latency off the critical path to the finished review. The
 * caller deliberately does not await this task. A successful durable write
 * always informs app-level metadata, while the current-run check prevents a
 * late completion from changing a newer workspace's UI.
 */
export async function saveCompletedReviewInBackground({
  save,
  record,
  isCurrent,
  onPersisted,
  onSaved,
  onFailed,
}: BackgroundReviewSave): Promise<void> {
  try {
    await save(record)
  } catch (error) {
    if (isCurrent()) {
      // This task is intentionally detached from the review flow. A consumer
      // callback must not turn a completed save into an unhandled promise.
      try {
        onFailed(error)
      } catch {
        // The completed review remains visible even if an optional UI callback fails.
      }
    }
    return
  }
  try {
    onPersisted(record)
  } catch {
    // The write already succeeded; keep an optional app-level notification
    // from turning this detached task into an unhandled promise.
  }
  if (isCurrent()) {
    try {
      onSaved(record)
    } catch {
      // The write already succeeded; keep this detached notification harmless.
    }
  }
}
