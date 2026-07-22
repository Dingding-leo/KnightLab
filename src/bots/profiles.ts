import { Chess, type Color } from 'chess.js'
import { STANDARD_START_FEN, type BotLevel, type MoveInput } from '../domain/chess'

export const BOT_PROFILE_IDS = ['mira-vale', 'rowan-pike', 'nia-cross'] as const

export type BotProfileId = typeof BOT_PROFILE_IDS[number]
export type BotProfileTone = 'mira' | 'rowan' | 'nia'

export interface OpeningCue {
  /** Exact SAN main-line history required before this local move is offered. */
  history: readonly string[]
  /** The move is still validated by chess.js against the current FEN before use. */
  move: MoveInput
}

export interface BotProfile {
  id: BotProfileId
  name: string
  initials: string
  tone: BotProfileTone
  /** Stockfish's strength target for the built-in preset, not a calibrated player rating. */
  targetElo: number
  engineLevel: BotLevel
  openingCueLabel: string
  intro: string
  openingCues: readonly OpeningCue[]
  openingReactions: readonly string[]
  postGame: {
    win: string
    loss: string
    draw: string
  }
}

const move = (from: MoveInput['from'], to: MoveInput['to']): MoveInput => ({ from, to })

/**
 * These are original KnightClub opponents. Their only claimed persona behavior
 * is the small, fully local opening route below; after that, the existing
 * bounded Stockfish preset supplies the documented strength.
 */
export const BOT_PROFILES: readonly BotProfile[] = [
  {
    id: 'mira-vale',
    name: 'Mira Vale',
    initials: 'MV',
    tone: 'mira',
    targetElo: 1320,
    engineLevel: 'easy',
    openingCueLabel: 'Opening cue · open centre',
    intro: 'Starts with an open centre when the position follows her local route.',
    openingCues: [
      { history: [], move: move('e2', 'e4') },
      { history: ['e4'], move: move('e7', 'e5') },
      { history: ['e4', 'e5'], move: move('g1', 'f3') },
      { history: ['e4', 'e5', 'Nf3'], move: move('b8', 'c6') },
    ],
    openingReactions: [
      'The centre is open — time to develop.',
      'A clear file makes the next decision simpler.',
    ],
    postGame: {
      win: 'A tidy finish. The saved game is ready for review.',
      loss: 'Well played. Your finished game is ready for a local review.',
      draw: 'A balanced game. The full line is saved if you want to review it.',
    },
  },
  {
    id: 'rowan-pike',
    name: 'Rowan Pike',
    initials: 'RP',
    tone: 'rowan',
    targetElo: 1700,
    engineLevel: 'balanced',
    openingCueLabel: 'Opening cue · claim the centre',
    intro: 'Claims central space when the position follows his local route.',
    openingCues: [
      { history: [], move: move('d2', 'd4') },
      { history: ['d4'], move: move('d7', 'd5') },
      { history: ['d4', 'd5'], move: move('c2', 'c4') },
      { history: ['d4', 'd5', 'c4'], move: move('e7', 'e6') },
    ],
    openingReactions: [
      'The centre is defined. Let’s see where the tension goes.',
      'Space first; the position can speak from here.',
    ],
    postGame: {
      win: 'That was a composed conversion. The game is saved for review.',
      loss: 'Nice work. The complete position trail is saved locally.',
      draw: 'Neither side broke through. Review is ready whenever you are.',
    },
  },
  {
    id: 'nia-cross',
    name: 'Nia Cross',
    initials: 'NC',
    tone: 'nia',
    targetElo: 2200,
    engineLevel: 'strong',
    openingCueLabel: 'Opening cue · flank pressure',
    intro: 'Builds pressure from the flank when the position follows her local route.',
    openingCues: [
      { history: [], move: move('c2', 'c4') },
      { history: ['c4'], move: move('e7', 'e5') },
      { history: ['c4', 'e5'], move: move('b1', 'c3') },
      { history: ['c4', 'e5', 'Nc3'], move: move('g8', 'f6') },
    ],
    openingReactions: [
      'The flank is active — the centre still needs an answer.',
      'A little pressure now keeps choices open later.',
    ],
    postGame: {
      win: 'A sharp finish. Your complete game is saved for review.',
      loss: 'Strong play. The game is stored locally for a closer look.',
      draw: 'A resilient defence. The line is saved if you want to revisit it.',
    },
  },
]

export const DEFAULT_BOT_PROFILE_ID: BotProfileId = 'rowan-pike'

const profileById = new Map(BOT_PROFILES.map((profile) => [profile.id, profile]))

function historiesMatch(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((move, index) => move === right[index])
}

function phraseIndex(seed: string, size: number): number {
  let hash = 2166136261
  for (const character of seed) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash >>> 0) % size
}

export function isBotProfileId(value: unknown): value is BotProfileId {
  return typeof value === 'string' && profileById.has(value as BotProfileId)
}

export function botProfileForId(id: BotProfileId): BotProfile {
  return profileById.get(id) ?? profileById.get(DEFAULT_BOT_PROFILE_ID)!
}

/** Makes existing saved games readable by mapping their legacy strength to a named local opponent. */
export function profileForLegacyLevel(level: BotLevel | undefined): BotProfile {
  return BOT_PROFILES.find((profile) => profile.engineLevel === level)
    ?? botProfileForId(DEFAULT_BOT_PROFILE_ID)
}

/**
 * Returns a legal authored opening move only for an exact standard-start route.
 * It never mutates the displayed game and it never guesses in a custom FEN.
 */
export function selectProfileOpeningMove(
  game: Chess,
  startFen: string,
  botColor: Color,
  profile: BotProfile,
): MoveInput | null {
  if (startFen !== STANDARD_START_FEN || game.turn() !== botColor) return null
  const cue = profile.openingCues.find((candidate) => historiesMatch(game.history(), candidate.history))
  if (!cue) return null

  try {
    const trial = new Chess(game.fen())
    const legal = trial.move(cue.move)
    return legal
      ? { from: legal.from, to: legal.to, promotion: legal.promotion }
      : null
  } catch {
    return null
  }
}

/** The phrase is deterministic so an unchanged local game never gains random UI state. */
export function botOpeningReaction(profile: BotProfile, game: Chess): string {
  return profile.openingReactions[phraseIndex(`${profile.id}:${game.fen()}`, profile.openingReactions.length)]!
}

export function botPostGameMessage(profile: BotProfile, result: string, botColor: Color): string {
  if (result === '1/2-1/2') return profile.postGame.draw
  const botWon = (botColor === 'w' && result === '1-0') || (botColor === 'b' && result === '0-1')
  return botWon ? profile.postGame.win : profile.postGame.loss
}
