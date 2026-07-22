/** The minimal ownership contract shared by ephemeral analysis clients. */
export interface DisposableClient {
  dispose: () => void
}

/**
 * Releases a client and clears its ref in one synchronous operation.
 *
 * React Strict Mode replays effect cleanup during development. Clearing before
 * disposal ensures the next effect execution cannot accidentally reuse a
 * disposed browser worker client.
 */
export function disposeAndClearClient<T extends DisposableClient>(ref: { current: T | null }): void {
  const current = ref.current
  ref.current = null
  current?.dispose()
}

/**
 * Releases a known client only when it still owns the ref.
 *
 * A stopped async run can finish after a newer run has installed its own
 * client. Matching by identity lets the old cleanup release its own browser
 * Worker without ever tearing down the newer run's Worker.
 */
export function disposeClientIfCurrent<T extends DisposableClient>(
  ref: { current: T | null },
  expected: T,
): boolean {
  if (ref.current !== expected) return false
  disposeAndClearClient(ref)
  return true
}
