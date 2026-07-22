import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { STANDARD_START_FEN } from '../domain/chess'
import {
  BOT_PROFILES,
  DEFAULT_BOT_PROFILE_ID,
  botPostGameMessage,
  botProfileForId,
  isBotProfileId,
  profileForLegacyLevel,
  selectProfileOpeningMove,
} from './profiles'

describe('local bot profiles', () => {
  it('keeps only the declared original profile identifiers and maps legacy strengths', () => {
    expect(isBotProfileId(DEFAULT_BOT_PROFILE_ID)).toBe(true)
    expect(isBotProfileId('not-a-bot')).toBe(false)
    expect(profileForLegacyLevel('easy').id).toBe('mira-vale')
    expect(profileForLegacyLevel('balanced').id).toBe('rowan-pike')
    expect(profileForLegacyLevel('strong').id).toBe('nia-cross')
  })

  it('returns each authored cue only when chess.js confirms the exact standard-start route', () => {
    for (const profile of BOT_PROFILES) {
      for (const cue of profile.openingCues) {
        const game = new Chess()
        for (const san of cue.history) game.move(san)

        expect(selectProfileOpeningMove(game, STANDARD_START_FEN, game.turn(), profile)).toEqual(cue.move)
      }
    }
  })

  it('never guesses a cue for the wrong route, wrong side or a custom position', () => {
    const mira = botProfileForId('mira-vale')
    const wrongRoute = new Chess()
    wrongRoute.move('d4')

    expect(selectProfileOpeningMove(wrongRoute, STANDARD_START_FEN, 'b', mira)).toBeNull()
    expect(selectProfileOpeningMove(new Chess(), STANDARD_START_FEN, 'b', mira)).toBeNull()

    const customFen = '8/8/8/8/8/8/4K3/7k w - - 0 1'
    expect(selectProfileOpeningMove(new Chess(customFen), customFen, 'w', mira)).toBeNull()
  })

  it('uses result-aware post-game copy from the bot perspective', () => {
    const profile = botProfileForId('rowan-pike')
    expect(botPostGameMessage(profile, '1-0', 'w')).toBe(profile.postGame.win)
    expect(botPostGameMessage(profile, '0-1', 'w')).toBe(profile.postGame.loss)
    expect(botPostGameMessage(profile, '1/2-1/2', 'b')).toBe(profile.postGame.draw)
  })
})
