import { describe, expect, it } from 'vitest'
import { gameShortcutFor } from './shortcuts'

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
})
