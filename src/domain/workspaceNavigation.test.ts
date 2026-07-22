import { describe, expect, it, vi } from 'vitest'
import { handoffWorkspace } from './workspaceNavigation'

describe('workspace navigation handoff', () => {
  it('returns a player to the top and focused heading when entering another workspace', () => {
    const scrollToTop = vi.fn()
    const focusWorkspace = vi.fn()

    expect(handoffWorkspace('play', 'review', { scrollToTop, focusWorkspace })).toBe(true)
    expect(scrollToTop).toHaveBeenCalledTimes(1)
    expect(focusWorkspace).toHaveBeenCalledTimes(1)
  })

  it('leaves a repeated current-tab activation alone', () => {
    const scrollToTop = vi.fn()
    const focusWorkspace = vi.fn()

    expect(handoffWorkspace('review', 'review', { scrollToTop, focusWorkspace })).toBe(false)
    expect(scrollToTop).not.toHaveBeenCalled()
    expect(focusWorkspace).not.toHaveBeenCalled()
  })
})
