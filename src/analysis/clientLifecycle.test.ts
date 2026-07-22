import { describe, expect, it, vi } from 'vitest'
import { disposeAndClearClient, disposeClientIfCurrent } from './clientLifecycle'

describe('analysis client lifecycle', () => {
  it('clears a disposed ref so a Strict Mode effect replay can create a fresh client', () => {
    const first = { dispose: vi.fn() }
    const ref: { current: typeof first | null } = { current: first }

    disposeAndClearClient(ref)

    expect(first.dispose).toHaveBeenCalledTimes(1)
    expect(ref.current).toBeNull()

    const replacement = { dispose: vi.fn() }
    ref.current = replacement
    disposeAndClearClient(ref)

    expect(replacement.dispose).toHaveBeenCalledTimes(1)
    expect(ref.current).toBeNull()
  })

  it('is safe when cleanup has already released the client', () => {
    const ref: { current: { dispose: () => void } | null } = { current: null }

    expect(() => disposeAndClearClient(ref)).not.toThrow()
  })

  it('leaves a newer client alone when an older async run finishes late', () => {
    const older = { dispose: vi.fn() }
    const newer = { dispose: vi.fn() }
    const ref: { current: typeof older | null } = { current: newer }

    expect(disposeClientIfCurrent(ref, older)).toBe(false)
    expect(older.dispose).not.toHaveBeenCalled()
    expect(newer.dispose).not.toHaveBeenCalled()
    expect(ref.current).toBe(newer)

    expect(disposeClientIfCurrent(ref, newer)).toBe(true)
    expect(newer.dispose).toHaveBeenCalledOnce()
    expect(ref.current).toBeNull()
  })
})
