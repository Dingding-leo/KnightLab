import { describe, expect, it } from 'vitest'
import {
  isBotTurn,
  isHumanColorChoice,
  isHumanTurn,
  oppositeColor,
  resolveHumanColor,
  shouldUndoBotReply,
} from './playerSide'

describe('human color selection', () => {
  it('recognizes the persisted setup choices', () => {
    expect(isHumanColorChoice('white')).toBe(true)
    expect(isHumanColorChoice('black')).toBe(true)
    expect(isHumanColorChoice('random')).toBe(true)
    expect(isHumanColorChoice('w')).toBe(false)
    expect(isHumanColorChoice('either')).toBe(false)
    expect(isHumanColorChoice(null)).toBe(false)
  })

  it('resolves fixed choices without consulting randomness', () => {
    const unexpectedRandom = () => {
      throw new Error('Fixed color must not draw random input.')
    }

    expect(resolveHumanColor('white', unexpectedRandom)).toBe('w')
    expect(resolveHumanColor('black', unexpectedRandom)).toBe('b')
  })

  it('resolves random choices deterministically when supplied a random source', () => {
    expect(resolveHumanColor('random', () => 0)).toBe('w')
    expect(resolveHumanColor('random', () => 0.499_999)).toBe('w')
    expect(resolveHumanColor('random', () => 0.5)).toBe('b')
    expect(resolveHumanColor('random', () => 0.999_999)).toBe('b')
  })
})

describe('bot side helpers', () => {
  it('always finds the opposite chess color', () => {
    expect(oppositeColor('w')).toBe('b')
    expect(oppositeColor('b')).toBe('w')
  })

  it('identifies the human and bot turns for either selected color', () => {
    expect(isHumanTurn('bot', 'w', 'w')).toBe(true)
    expect(isBotTurn('bot', 'w', 'w')).toBe(false)
    expect(isHumanTurn('bot', 'b', 'w')).toBe(false)
    expect(isBotTurn('bot', 'b', 'w')).toBe(true)

    expect(isHumanTurn('bot', 'b', 'b')).toBe(true)
    expect(isBotTurn('bot', 'b', 'b')).toBe(false)
    expect(isHumanTurn('bot', 'w', 'b')).toBe(false)
    expect(isBotTurn('bot', 'w', 'b')).toBe(true)
    expect(isHumanTurn('local', 'w', 'b')).toBe(true)
    expect(isBotTurn('local', 'w', 'b')).toBe(false)
  })

  it('undoes a paired bot reply only when the exposed turn belongs to the bot', () => {
    expect(shouldUndoBotReply('bot', 'b', 'w')).toBe(true)
    expect(shouldUndoBotReply('bot', 'w', 'w')).toBe(false)
    expect(shouldUndoBotReply('bot', 'w', 'b')).toBe(true)
    expect(shouldUndoBotReply('bot', 'b', 'b')).toBe(false)
    expect(shouldUndoBotReply('local', 'b', 'w')).toBe(false)
  })
})
