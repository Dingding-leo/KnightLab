export type GameShortcut = 'new-game' | 'undo' | 'flip' | 'cancel'
export type PromotionShortcut = 'q' | 'r' | 'b' | 'n'

export interface ShortcutInput {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  editable?: boolean
  modalOpen?: boolean
}

export function gameShortcutFor(input: ShortcutInput): GameShortcut | null {
  if (input.editable || input.altKey || input.modalOpen) return null
  const key = input.key.toLowerCase()
  const command = Boolean(input.metaKey || input.ctrlKey)

  if (command) return key === 'z' ? 'undo' : null
  if (key === 'escape') return 'cancel'
  if (key === 'n') return 'new-game'
  if (key === 'u') return 'undo'
  if (key === 'f') return 'flip'
  return null
}

/** Promotion is a short focused choice, not a reason to interrupt keyboard play. */
export function promotionShortcutFor(input: Pick<ShortcutInput, 'key' | 'metaKey' | 'ctrlKey' | 'altKey'>): PromotionShortcut | null {
  if (input.metaKey || input.ctrlKey || input.altKey) return null
  const key = input.key.toLowerCase()
  return key === 'q' || key === 'r' || key === 'b' || key === 'n' ? key : null
}
