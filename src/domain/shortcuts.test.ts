import { describe, expect, it } from 'vitest'
import { gameShortcutFor, promotionShortcutFor } from './shortcuts'

describe('gameShortcutFor', () => {
  it('maps the high-frequency play shortcuts', () => {
    expect(gameShortcutFor({ key: 'n' })).toBe('new-game')
    expect(gameShortcutFor({ key: 'F' })).toBe('flip')
    expect(gameShortcutFor({ key: 'u' })).toBe('undo')
    expect(gameShortcutFor({ key: 'Escape' })).toBe('cancel')
    expect(gameShortcutFor({ key: 'z', metaKey: true })).toBe('undo')
    expect(gameShortcutFor({ key: 'Z', ctrlKey: true })).toBe('undo')
  })

  it('does not hijack typing or browser shortcuts', () => {
    expect(gameShortcutFor({ key: 'n', editable: true })).toBeNull()
    expect(gameShortcutFor({ key: 'f', metaKey: true })).toBeNull()
    expect(gameShortcutFor({ key: 'z' })).toBeNull()
    expect(gameShortcutFor({ key: 'u', altKey: true })).toBeNull()
  })

  it('does not let play shortcuts pass through an open decision or promotion dialog', () => {
    expect(gameShortcutFor({ key: 'n', modalOpen: true })).toBeNull()
    expect(gameShortcutFor({ key: 'u', modalOpen: true })).toBeNull()
    expect(gameShortcutFor({ key: 'f', modalOpen: true })).toBeNull()
    expect(gameShortcutFor({ key: 'z', metaKey: true, modalOpen: true })).toBeNull()
    expect(gameShortcutFor({ key: 'z', ctrlKey: true, modalOpen: true })).toBeNull()
  })

  it('keeps direct promotion choices focused and leaves system shortcuts alone', () => {
    expect(promotionShortcutFor({ key: 'Q' })).toBe('q')
    expect(promotionShortcutFor({ key: 'r' })).toBe('r')
    expect(promotionShortcutFor({ key: 'b' })).toBe('b')
    expect(promotionShortcutFor({ key: 'n' })).toBe('n')
    expect(promotionShortcutFor({ key: 'q', metaKey: true })).toBeNull()
    expect(promotionShortcutFor({ key: 'q', ctrlKey: true })).toBeNull()
    expect(promotionShortcutFor({ key: 'q', altKey: true })).toBeNull()
    expect(promotionShortcutFor({ key: 'x' })).toBeNull()
  })
})
