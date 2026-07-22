import { describe, expect, it } from 'vitest'
import { createLatestRequestGate } from './latestRequest'

describe('latest request gate', () => {
  it('allows only the latest file-selection result to update the workspace', () => {
    const gate = createLatestRequestGate()
    const firstFile = gate.begin()
    const secondFile = gate.begin()

    expect(gate.isCurrent(firstFile)).toBe(false)
    expect(gate.isCurrent(secondFile)).toBe(true)
  })

  it('invalidates an in-flight file read when the player uses another import route', () => {
    const gate = createLatestRequestGate()
    const pendingFile = gate.begin()

    gate.invalidate()

    expect(gate.isCurrent(pendingFile)).toBe(false)
  })
})
