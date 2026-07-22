import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { hasMatingMaterial, timeoutResult } from './chess'

describe('timeout results', () => {
  it('awards the game to the opponent when mating material exists', () => {
    expect(timeoutResult('w', true)).toBe('0-1')
    expect(timeoutResult('b', true)).toBe('1-0')
  })

  it('declares a draw when the opponent has no basic mating material', () => {
    expect(timeoutResult('w', false)).toBe('1/2-1/2')
  })

  it('detects common sufficient and insufficient material sets', () => {
    expect(hasMatingMaterial(new Chess(), 'w')).toBe(true)
    expect(hasMatingMaterial(new Chess('8/8/8/8/8/8/4K3/7k w - - 0 1'), 'w')).toBe(false)
    expect(hasMatingMaterial(new Chess('8/8/8/8/8/8/4KB2/7k w - - 0 1'), 'w')).toBe(false)
    expect(hasMatingMaterial(new Chess('8/8/8/8/8/8/4KR2/7k w - - 0 1'), 'w')).toBe(true)
  })
})
