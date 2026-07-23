import { describe, expect, it } from 'vitest'
import { shouldReleaseIdlePlayBrowserRuntime } from './playRuntimeLifecycle'

describe('Play browser runtime lifecycle', () => {
  it('releases a settled browser engine after the player leaves Play or completes a game', () => {
    expect(shouldReleaseIdlePlayBrowserRuntime({
      outsidePlay: true,
      gameFinished: false,
      premoveWindow: false,
      thinking: false,
      engineProbeActive: false,
    })).toBe(true)
    expect(shouldReleaseIdlePlayBrowserRuntime({
      outsidePlay: false,
      gameFinished: true,
      premoveWindow: false,
      thinking: false,
      engineProbeActive: false,
    })).toBe(true)
  })

  it.each([
    { label: 'an active Play game', outsidePlay: false, gameFinished: false, premoveWindow: false, thinking: false, engineProbeActive: false },
    { label: 'a live bot reply after navigation', outsidePlay: true, gameFinished: false, premoveWindow: true, thinking: true, engineProbeActive: false },
    { label: 'the short reply-settlement frame', outsidePlay: true, gameFinished: false, premoveWindow: false, thinking: true, engineProbeActive: false },
    { label: 'a Stockfish verification', outsidePlay: true, gameFinished: false, premoveWindow: false, thinking: false, engineProbeActive: true },
  ])('keeps the runtime while $label', ({ label: _label, ...state }) => {
    expect(shouldReleaseIdlePlayBrowserRuntime(state)).toBe(false)
  })
})
