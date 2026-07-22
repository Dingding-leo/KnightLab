import { describe, expect, it, vi } from 'vitest'
import { disposeAndClearClient } from './clientLifecycle'

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
})
