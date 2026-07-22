import { describe, expect, it } from 'vitest'
import {
  MOVE_LIST_INITIAL_VISIBLE_ROWS,
  progressiveMoveRows,
  revealEarlierMoveRows,
} from './moveListPagination'

describe('progressive move list rows', () => {
  const rows = Array.from({ length: 100 }, (_, index) => ({ number: index + 1 }))

  it('keeps a normal short game complete', () => {
    const page = progressiveMoveRows(rows.slice(0, 3), MOVE_LIST_INITIAL_VISIBLE_ROWS, null)

    expect(page.trailingRows).toEqual(rows.slice(0, 3))
    expect(page.pinnedRow).toBeNull()
    expect(page.hiddenRowCount).toBe(0)
  })

  it('renders only the latest forty rows by default', () => {
    const page = progressiveMoveRows(rows, MOVE_LIST_INITIAL_VISIBLE_ROWS, null)

    expect(page.trailingRows).toEqual(rows.slice(60))
    expect(page.pinnedRow).toBeNull()
    expect(page.hiddenRowCount).toBe(60)
    expect(revealEarlierMoveRows(MOVE_LIST_INITIAL_VISIBLE_ROWS, rows.length)).toBe(80)
  })

  it('pins an early preview row without mounting the omitted history', () => {
    const page = progressiveMoveRows(rows, MOVE_LIST_INITIAL_VISIBLE_ROWS, 1)

    expect(page.pinnedRow).toBe(rows[1])
    expect(page.trailingRows).toEqual(rows.slice(60))
    expect(page.hiddenBeforePinnedCount).toBe(1)
    expect(page.hiddenAfterPinnedCount).toBe(58)
    expect(page.hiddenRowCount).toBe(59)
    expect(page.trailingRows).not.toContain(rows[2])
  })

  it('does not pin a selected row that is already in the newest window', () => {
    const page = progressiveMoveRows(rows, MOVE_LIST_INITIAL_VISIBLE_ROWS, 60)

    expect(page.pinnedRow).toBeNull()
    expect(page.hiddenRowCount).toBe(60)
  })
})
