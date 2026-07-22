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
