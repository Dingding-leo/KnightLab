import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatClock, createClock, createCustomTimeControl } from '../domain/clock'
import { ClockRuntime } from './ClockRuntime'
import { useClockSnapshot } from './clockRuntimeContext'
import { clockRuntimeFrame } from './clockRuntimeModel'

function ClockProbe() {
  const snapshot = useClockSnapshot()
  return <output>{formatClock(snapshot.whiteMs)}</output>
}

afterEach(() => vi.restoreAllMocks())

describe('ClockRuntime', () => {
  it('keeps display timing local while preserving visible-value and flag boundaries', () => {
    const control = createCustomTimeControl(1, 0, 0)
    const normal = createClock(control, 'w', 0)
    const low = createClock(control, 'w', 40_050)

    expect(clockRuntimeFrame(normal, 100).delayMs).toBe(901)
    expect(clockRuntimeFrame(low, 80_100).delayMs).toBe(51)
    expect(clockRuntimeFrame(normal, 60_000)).toMatchObject({
      snapshot: { whiteMs: 0, flaggedColor: 'w' },
      delayMs: null,
    })
  })

  it('shares the live snapshot with clock consumers without requiring App state', () => {
    vi.spyOn(Date, 'now').mockReturnValue(50_050)
    const state = createClock(createCustomTimeControl(1, 0, 0), 'w', 0)

    const markup = renderToStaticMarkup(
      <ClockRuntime state={state} gameFinished={false} onTick={vi.fn()} onFlag={vi.fn()}>
        <ClockProbe />
      </ClockRuntime>,
    )

    expect(markup).toContain('0:09.9')
  })
})
