import { describe, expect, it } from 'vitest'
import { terminalSessionFingerprint } from './libraryIdentity'

describe('terminal session fingerprint', () => {
  it('does not mark a live restored board as already persisted', () => {
    expect(terminalSessionFingerprint('start-fen', '*', false)).toBeNull()
  })

  it('gives every restored terminal board the same persistence guard used after saving', () => {
    const restored = terminalSessionFingerprint('final-fen', '1-0', true)
    const afterRender = terminalSessionFingerprint('final-fen', '1-0', true)

    expect(restored).toBe('final-fen-1-0')
    expect(afterRender).toBe(restored)
  })
})
