import { describe, expect, it } from 'vitest'
import { previewPlyAfter } from './playPreview'

describe('Play history preview navigation', () => {
  it('keeps the first historical move bounded and returns live only at the newest move', () => {
    expect(previewPlyAfter('previous', 1, 6)).toBe(1)
    expect(previewPlyAfter('previous', 4, 6)).toBe(3)
    expect(previewPlyAfter('next', 4, 6)).toBe(5)
    expect(previewPlyAfter('next', 5, 6)).toBeNull()
  })

  it('continues through a move appended by the bot instead of unexpectedly returning live', () => {
    // Before the reply, the next move would be the live position. Once the
    // bot appends a reply, the same selected historical ply remains inspectable
    // and Next advances one step instead.
    expect(previewPlyAfter('next', 2, 3)).toBeNull()
    expect(previewPlyAfter('next', 2, 4)).toBe(3)
  })

  it('fails closed for impossible preview inputs', () => {
    expect(previewPlyAfter('previous', 0, 4)).toBeNull()
    expect(previewPlyAfter('next', 5, 4)).toBeNull()
    expect(previewPlyAfter('next', 1, 0)).toBeNull()
  })
})
