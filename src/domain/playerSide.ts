import type { Color } from 'chess.js'
import type { GameMode } from './chess'

/** The human-facing choice shown before a bot game starts. */
export type HumanColorChoice = 'white' | 'black' | 'random'

export type RandomSource = () => number

export function isHumanColorChoice(value: unknown): value is HumanColorChoice {
  return value === 'white' || value === 'black' || value === 'random'
}

export function oppositeColor(color: Color): Color {
  return color === 'w' ? 'b' : 'w'
}

/**
 * Resolves a setup choice once, so a random selection remains stable for the
 * lifetime of the game and can be persisted with its session.
 */
export function resolveHumanColor(choice: HumanColorChoice, random: RandomSource = Math.random): Color {
  if (choice === 'white') return 'w'
  if (choice === 'black') return 'b'
  return random() < 0.5 ? 'w' : 'b'
}

/** Local games allow either side to move; bot games restrict input to the human side. */
export function isHumanTurn(mode: GameMode, turn: Color, humanColor: Color): boolean {
  return mode !== 'bot' || turn === humanColor
}

/** In a bot game, the bot always owns the opposite color. */
export function isBotTurn(mode: GameMode, turn: Color, humanColor: Color): boolean {
  return mode === 'bot' && turn === oppositeColor(humanColor)
}

/**
 * After undoing one ply, undo a second ply only when that first undo exposed
 * the bot move immediately preceding the human move. This holds for either
 * human color and also avoids undoing past a bot move that is still pending.
 */
export function shouldUndoBotReply(mode: GameMode, turnAfterFirstUndo: Color, humanColor: Color): boolean {
  return isBotTurn(mode, turnAfterFirstUndo, humanColor)
}
