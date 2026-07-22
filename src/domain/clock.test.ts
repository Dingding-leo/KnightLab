import { describe, expect, it } from 'vitest'
import {
  completeClockMove,
  createClock,
  createReadyClock,
  createCustomTimeControl,
  formatClock,
  getTimeControl,
  nextClockTickDelay,
  normalizeClockState,
  pauseClock,
  resumeClock,
  snapshotClock,
  TIME_CONTROLS,
} from './clock'

describe('time controls', () => {
  it('provides real category presets and safe custom controls', () => {
    expect(TIME_CONTROLS.map((control) => control.category)).toEqual(
      expect.arrayContaining(['unlimited', 'bullet', 'blitz', 'rapid', 'classical']),
    )
    expect(getTimeControl('rapid-15-10')).toMatchObject({ initialMs: 900_000, incrementMs: 10_000 })
    expect(createCustomTimeControl(7, 3, 2)).toMatchObject({ initialMs: 420_000, incrementMs: 3_000, delayMs: 2_000 })
    expect(() => createCustomTimeControl(0, 0, 0)).toThrow()
    expect(() => createCustomTimeControl(5, -1, 0)).toThrow()
  })

  it('formats clocks for normal, low-time and unlimited play', () => {
    expect(formatClock(null)).toBe('∞')
    expect(formatClock(65_000)).toBe('1:05')
    expect(formatClock(9_450)).toBe('0:09.4')
    expect(formatClock(0)).toBe('0:00.0')
  })

  it('refreshes only when the visible clock value can change', () => {
    const control = createCustomTimeControl(1, 0, 0)
    const normal = createClock(control, 'w', 0)
    expect(nextClockTickDelay(normal, 100)).toBe(901)

    const low = createClock(control, 'w', 40_050)
    expect(nextClockTickDelay(low, 80_100)).toBe(51)

    const boundary = createClock(control, 'w', 40_000)
    expect(nextClockTickDelay(boundary, 80_000)).toBe(1)
    expect(nextClockTickDelay(createClock(getTimeControl('unlimited'), 'w', 0), 1)).toBeNull()
  })
})

describe('clock state machine', () => {
  it('does not charge a freshly configured timed game until the first move', () => {
    const control = createCustomTimeControl(1, 0, 0)
    const ready = createReadyClock(control, 'w', 1_000)

    expect(snapshotClock(ready, 50_000)).toMatchObject({ whiteMs: 60_000, blackMs: 60_000, flaggedColor: null })

    const afterWhite = completeClockMove(ready, 'w', 50_000)
    expect(snapshotClock(afterWhite, 53_000)).toMatchObject({ whiteMs: 60_000, blackMs: 57_000, activeColor: 'b' })
  })

  it('deducts only the active side and applies increment after a legal move', () => {
    const control = createCustomTimeControl(1, 2, 0)
    const initial = createClock(control, 'w', 1_000)
    expect(snapshotClock(initial, 5_000)).toMatchObject({ whiteMs: 56_000, blackMs: 60_000, flaggedColor: null })

    const afterWhite = completeClockMove(initial, 'w', 5_000)
    expect(snapshotClock(afterWhite, 5_000)).toMatchObject({ whiteMs: 58_000, blackMs: 60_000, activeColor: 'b' })
    expect(snapshotClock(afterWhite, 8_000)).toMatchObject({ whiteMs: 58_000, blackMs: 57_000 })
  })

  it('consumes delay before base time and resets it for the opponent', () => {
    const control = createCustomTimeControl(1, 0, 3)
    const initial = createClock(control, 'w', 10_000)
    expect(snapshotClock(initial, 12_000)).toMatchObject({ whiteMs: 60_000, delayRemainingMs: 1_000 })
    expect(snapshotClock(initial, 15_000)).toMatchObject({ whiteMs: 58_000, delayRemainingMs: 0 })

    const afterWhite = completeClockMove(initial, 'w', 15_000)
    expect(snapshotClock(afterWhite, 17_000)).toMatchObject({ blackMs: 60_000, delayRemainingMs: 1_000 })
  })

  it('pauses and resumes without restoring spent delay or charging paused time', () => {
    const control = createCustomTimeControl(1, 0, 3)
    const initial = createClock(control, 'w', 1_000)
    const paused = pauseClock(initial, 6_000)
    expect(snapshotClock(paused, 50_000)).toMatchObject({ whiteMs: 58_000, activeColor: null, pausedColor: 'w' })

    const resumed = resumeClock(paused, 50_000)
    expect(snapshotClock(resumed, 52_000)).toMatchObject({ whiteMs: 56_000, activeColor: 'w', delayRemainingMs: 0 })
  })

  it('flags exactly at zero and rejects an out-of-turn completion', () => {
    const control = createCustomTimeControl(0.1, 0, 0)
    const initial = createClock(control, 'w', 1_000)
    expect(snapshotClock(initial, 6_999).flaggedColor).toBeNull()
    expect(snapshotClock(initial, 7_000)).toMatchObject({ whiteMs: 0, flaggedColor: 'w' })
    expect(() => completeClockMove(initial, 'b', 2_000)).toThrow()
  })

  it('keeps unlimited clocks switchable without ever flagging', () => {
    const initial = createClock(getTimeControl('unlimited'), 'w', 0)
    const afterWhite = completeClockMove(initial, 'w', 999_999_999)
    expect(snapshotClock(afterWhite, Number.MAX_SAFE_INTEGER)).toMatchObject({
      whiteMs: null,
      blackMs: null,
      activeColor: 'b',
      flaggedColor: null,
    })
  })

  it('normalizes persisted input and falls back safely when corrupt', () => {
    const control = getTimeControl('blitz-3-2')
    const valid = createClock(control, 'b', 12_345)
    expect(normalizeClockState(valid, control, 'w', 99_000)).toEqual(valid)
    expect(normalizeClockState({ whiteMs: -4 }, control, 'w', 99_000)).toEqual(createReadyClock(control, 'w', 99_000))
    expect(normalizeClockState({ ...valid, control: { ...control, incrementMs: 999_999 } }, control, 'w', 99_000)).toEqual(createReadyClock(control, 'w', 99_000))
  })
})
