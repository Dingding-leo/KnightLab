import { describe, expect, it } from 'vitest'
import {
  LIBRARY_PAGE_SIZE,
  progressiveLibraryResults,
  revealMoreLibraryResults,
} from './libraryPagination'

describe('progressive library results', () => {
  it('shows only the first local page and reports what remains', () => {
    const items = Array.from({ length: 500 }, (_, index) => `game-${index + 1}`)

    const page = progressiveLibraryResults(items, LIBRARY_PAGE_SIZE)

    expect(page.items).toHaveLength(24)
    expect(page.items.at(-1)).toBe('game-24')
    expect(page.shownCount).toBe(24)
    expect(page.remainingCount).toBe(476)
  })

  it('reveals one bounded page at a time and clamps at the final result', () => {
    expect(revealMoreLibraryResults(24, 50)).toBe(48)
    expect(revealMoreLibraryResults(48, 50)).toBe(50)
    expect(revealMoreLibraryResults(500, 50)).toBe(50)
    expect(revealMoreLibraryResults(-1, 50)).toBe(24)
  })

  it('keeps a matching older game in the first page after filtering', () => {
    const items = Array.from({ length: 500 }, (_, index) => ({ id: index + 1, reviewed: index === 399 }))
    const filtered = items.filter((item) => item.reviewed)

    const page = progressiveLibraryResults(filtered, LIBRARY_PAGE_SIZE)

    expect(page.items).toEqual([{ id: 400, reviewed: true }])
    expect(page.remainingCount).toBe(0)
  })
})
