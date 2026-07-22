import type { Color } from 'chess.js'

export type TimeCategory = 'unlimited' | 'bullet' | 'blitz' | 'rapid' | 'classical' | 'custom'

export interface TimeControl {
  id: string
  label: string
  category: TimeCategory
  initialMs: number | null
  incrementMs: number
  delayMs: number
}

export interface ClockState {
  version: 1
  control: TimeControl
  whiteMs: number | null
  blackMs: number | null
  activeColor: Color | null
  pausedColor: Color | null
  turnStartedAtMs: number | null
  delayRemainingMs: number
}

export interface ClockSnapshot {
  whiteMs: number | null
  blackMs: number | null
  activeColor: Color | null
  pausedColor: Color | null
  delayRemainingMs: number
  flaggedColor: Color | null
}

export const TIME_CONTROLS: readonly TimeControl[] = [
  { id: 'unlimited', label: 'Unlimited', category: 'unlimited', initialMs: null, incrementMs: 0, delayMs: 0 },
  { id: 'bullet-1', label: 'Bullet · 1 min', category: 'bullet', initialMs: 60_000, incrementMs: 0, delayMs: 0 },
  { id: 'bullet-2-1', label: 'Bullet · 2 | 1', category: 'bullet', initialMs: 120_000, incrementMs: 1_000, delayMs: 0 },
  { id: 'blitz-3-2', label: 'Blitz · 3 | 2', category: 'blitz', initialMs: 180_000, incrementMs: 2_000, delayMs: 0 },
  { id: 'blitz-5', label: 'Blitz · 5 min', category: 'blitz', initialMs: 300_000, incrementMs: 0, delayMs: 0 },
  { id: 'rapid-10', label: 'Rapid · 10 min', category: 'rapid', initialMs: 600_000, incrementMs: 0, delayMs: 0 },
  { id: 'rapid-15-10', label: 'Rapid · 15 | 10', category: 'rapid', initialMs: 900_000, incrementMs: 10_000, delayMs: 0 },
  { id: 'classical-30', label: 'Classical · 30 min', category: 'classical', initialMs: 1_800_000, incrementMs: 0, delayMs: 0 },
]

export function getTimeControl(id: string): TimeControl {
  const control = TIME_CONTROLS.find((candidate) => candidate.id === id)
  if (!control) throw new Error(`Unknown time control: ${id}`)
  return { ...control }
}

export function createCustomTimeControl(baseMinutes: number, incrementSeconds: number, delaySeconds: number): TimeControl {
  if (!Number.isFinite(baseMinutes) || baseMinutes < 0.1 || baseMinutes > 1_440) {
    throw new Error('Base time must be between 0.1 and 1440 minutes.')
  }
  if (!Number.isFinite(incrementSeconds) || incrementSeconds < 0 || incrementSeconds > 600) {
    throw new Error('Increment must be between 0 and 600 seconds.')
  }
  if (!Number.isFinite(delaySeconds) || delaySeconds < 0 || delaySeconds > 600) {
    throw new Error('Delay must be between 0 and 600 seconds.')
  }
  const initialMs = Math.round(baseMinutes * 60_000)
  const incrementMs = Math.round(incrementSeconds * 1_000)
  const delayMs = Math.round(delaySeconds * 1_000)
  const suffix = [
    incrementMs ? `+${formatSeconds(incrementMs)}` : '',
    delayMs ? `${formatSeconds(delayMs)}s delay` : '',
  ].filter(Boolean).join(' · ')
  return {
    id: `custom-${initialMs}-${incrementMs}-${delayMs}`,
    label: `Custom · ${formatBase(initialMs)}${suffix ? ` · ${suffix}` : ''}`,
    category: 'custom',
    initialMs,
    incrementMs,
    delayMs,
  }
}

export function createClock(control: TimeControl, activeColor: Color, nowMs: number): ClockState {
  const timed = control.initialMs !== null
  return {
    version: 1,
    control: { ...control },
    whiteMs: control.initialMs,
    blackMs: control.initialMs,
    activeColor,
    pausedColor: null,
    turnStartedAtMs: timed ? nowMs : null,
    delayRemainingMs: timed ? control.delayMs : 0,
  }
}

/**
 * Creates a playable clock whose first side is visible but not yet charging.
 * A real chess clock starts when the first move is made, not while a player is
 * choosing a time control or reading the board.
 */
export function createReadyClock(control: TimeControl, activeColor: Color, nowMs: number): ClockState {
  return {
    ...createClock(control, activeColor, nowMs),
    turnStartedAtMs: null,
  }
}

export function snapshotClock(state: ClockState, nowMs: number): ClockSnapshot {
  let whiteMs = state.whiteMs
  let blackMs = state.blackMs
  let delayRemainingMs = state.delayRemainingMs
  const active = state.activeColor
  if (active && state.control.initialMs !== null && state.turnStartedAtMs !== null) {
    const elapsed = Math.max(0, nowMs - state.turnStartedAtMs)
    const delayUsed = Math.min(delayRemainingMs, elapsed)
    delayRemainingMs -= delayUsed
    const charged = elapsed - delayUsed
    if (active === 'w') whiteMs = Math.max(0, (whiteMs ?? 0) - charged)
    else blackMs = Math.max(0, (blackMs ?? 0) - charged)
  }
  const flaggedColor = whiteMs === 0 ? 'w' : blackMs === 0 ? 'b' : null
  return {
    whiteMs,
    blackMs,
    activeColor: state.activeColor,
    pausedColor: state.pausedColor,
    delayRemainingMs,
    flaggedColor,
  }
}

export function settleClock(state: ClockState, nowMs: number): ClockState {
  const snapshot = snapshotClock(state, nowMs)
  return {
    ...state,
    whiteMs: snapshot.whiteMs,
    blackMs: snapshot.blackMs,
    turnStartedAtMs: state.turnStartedAtMs !== null && state.activeColor && state.control.initialMs !== null ? nowMs : null,
    delayRemainingMs: snapshot.delayRemainingMs,
  }
}

export function completeClockMove(state: ClockState, mover: Color, nowMs: number): ClockState {
  if (state.activeColor !== mover) throw new Error('Clock move does not match the active color.')
  const snapshot = snapshotClock(state, nowMs)
  if (snapshot.flaggedColor) throw new Error('A move cannot complete after flag fall.')
  const timed = state.control.initialMs !== null
  const nextColor: Color = mover === 'w' ? 'b' : 'w'
  const whiteMs = mover === 'w' && snapshot.whiteMs !== null
    ? snapshot.whiteMs + state.control.incrementMs
    : snapshot.whiteMs
  const blackMs = mover === 'b' && snapshot.blackMs !== null
    ? snapshot.blackMs + state.control.incrementMs
    : snapshot.blackMs
  return {
    ...state,
    whiteMs,
    blackMs,
    activeColor: nextColor,
    pausedColor: null,
    turnStartedAtMs: timed ? nowMs : null,
    delayRemainingMs: timed ? state.control.delayMs : 0,
  }
}

export function pauseClock(state: ClockState, nowMs: number): ClockState {
  if (!state.activeColor) return state
  const settled = settleClock(state, nowMs)
  return {
    ...settled,
    activeColor: null,
    pausedColor: state.activeColor,
    turnStartedAtMs: null,
  }
}

export function resumeClock(state: ClockState, nowMs: number): ClockState {
  if (!state.pausedColor) return state
  return {
    ...state,
    activeColor: state.pausedColor,
    pausedColor: null,
    turnStartedAtMs: state.control.initialMs === null ? null : nowMs,
  }
}

export function normalizeClockState(
  value: unknown,
  control: TimeControl,
  fallbackColor: Color,
  nowMs: number,
): ClockState {
  if (!isClockState(value) || value.control.id !== control.id) return createReadyClock(control, fallbackColor, nowMs)
  return value
}

export function isClockState(value: unknown): value is ClockState {
  if (!value || typeof value !== 'object') return false
  const state = value as Partial<ClockState>
  const validRemaining = (remaining: unknown) => remaining === null || (typeof remaining === 'number' && Number.isFinite(remaining) && remaining >= 0)
  const validColor = (color: unknown) => color === null || color === 'w' || color === 'b'
  return state.version === 1
    && isTimeControl(state.control)
    && validRemaining(state.whiteMs)
    && validRemaining(state.blackMs)
    && validColor(state.activeColor)
    && validColor(state.pausedColor)
    && (state.turnStartedAtMs === null || (typeof state.turnStartedAtMs === 'number' && Number.isFinite(state.turnStartedAtMs)))
    && typeof state.delayRemainingMs === 'number'
    && Number.isFinite(state.delayRemainingMs)
    && state.delayRemainingMs >= 0
    && state.delayRemainingMs <= (state.control?.delayMs ?? 0)
    && !(state.activeColor && state.pausedColor)
}

export function isTimeControl(value: unknown): value is TimeControl {
  if (!value || typeof value !== 'object') return false
  const control = value as Partial<TimeControl>
  return typeof control.id === 'string'
    && typeof control.label === 'string'
    && ['unlimited', 'bullet', 'blitz', 'rapid', 'classical', 'custom'].includes(control.category ?? '')
    && (control.initialMs === null || (typeof control.initialMs === 'number' && Number.isFinite(control.initialMs) && control.initialMs >= 6_000 && control.initialMs <= 86_400_000))
    && typeof control.incrementMs === 'number' && Number.isFinite(control.incrementMs) && control.incrementMs >= 0 && control.incrementMs <= 600_000
    && typeof control.delayMs === 'number' && Number.isFinite(control.delayMs) && control.delayMs >= 0 && control.delayMs <= 600_000
}

export function formatClock(remainingMs: number | null): string {
  if (remainingMs === null) return '∞'
  const clamped = Math.max(0, remainingMs)
  if (clamped < 20_000) {
    const tenths = Math.floor(clamped / 100)
    return `${Math.floor(tenths / 600)}:${String(Math.floor((tenths % 600) / 10)).padStart(2, '0')}.${tenths % 10}`
  }
  const seconds = Math.floor(clamped / 1_000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * Returns the earliest useful repaint for a running clock. Above twenty
 * seconds the UI only renders whole seconds; below it, it renders tenths.
 * Keeping this decision in the clock layer lets the UI avoid rebuilding the
 * board ten times a second while preserving both an accurate clock and the
 * low-time display players rely on.
 */
export function nextClockTickDelay(state: ClockState, nowMs: number): number | null {
  if (state.control.initialMs === null || !state.activeColor || state.turnStartedAtMs === null) return null
  const snapshot = snapshotClock(state, nowMs)
  const remaining = snapshot.activeColor === 'w' ? snapshot.whiteMs : snapshot.blackMs
  if (remaining === null || remaining <= 0) return null

  const resolution = remaining < 20_000 ? 100 : 1_000
  const untilDisplayChanges = remaining % resolution + 1
  // Cross the 20-second boundary promptly so 0:20 becomes 0:19.9 without a
  // full extra second of stale display.
  const untilLowTime = remaining >= 20_000 ? remaining - 20_000 + 1 : Infinity
  return Math.max(1, Math.min(untilDisplayChanges, untilLowTime, remaining))
}

function formatSeconds(milliseconds: number): string {
  return String(milliseconds / 1_000)
}

function formatBase(milliseconds: number): string {
  const minutes = milliseconds / 60_000
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`
}
