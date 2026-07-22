export type GameShortcut = 'new-game' | 'undo' | 'flip' | 'cancel'

export interface ShortcutInput {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  editable?: boolean
}

export function gameShortcutFor(input: ShortcutInput): GameShortcut | null {
  if (input.editable || input.altKey) return null
  const key = input.key.toLowerCase()
  const command = Boolean(input.metaKey || input.ctrlKey)

  if (command) return key === 'z' ? 'undo' : null
  if (key === 'escape') return 'cancel'
  if (key === 'n') return 'new-game'
  if (key === 'u') return 'undo'
  if (key === 'f') return 'flip'
  return null
}
