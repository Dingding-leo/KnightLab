import {
  nextClockTickDelay,
  snapshotClock,
  type ClockSnapshot,
  type ClockState,
} from '../domain/clock'

export interface ClockRuntimeFrame {
  snapshot: ClockSnapshot
  delayMs: number | null
}

/**
 * Keeps the display timer separate from the event-driven clock state. The
 * runtime and its deterministic test both use this exact timing boundary.
 */
export function clockRuntimeFrame(state: ClockState, nowMs: number): ClockRuntimeFrame {
  const snapshot = snapshotClock(state, nowMs)
  return {
    snapshot,
    delayMs: snapshot.flaggedColor ? null : nextClockTickDelay(state, nowMs),
  }
}
