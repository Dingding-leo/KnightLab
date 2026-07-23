/**
 * Decides when Play's browser-only engine workers can be released without
 * interrupting a live reply or a manual engine probe. Keeping this policy
 * pure makes the async worker lifecycle explicit and regression-testable.
 */
export interface PlayBrowserRuntimeState {
  outsidePlay: boolean
  gameFinished: boolean
  premoveWindow: boolean
  thinking: boolean
  engineProbeActive: boolean
}

export function shouldReleaseIdlePlayBrowserRuntime({
  outsidePlay,
  gameFinished,
  premoveWindow,
  thinking,
  engineProbeActive,
}: PlayBrowserRuntimeState): boolean {
  return (outsidePlay || gameFinished)
    && !premoveWindow
    && !thinking
    && !engineProbeActive
}
