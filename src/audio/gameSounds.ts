export type GameSoundEvent = 'move' | 'capture' | 'check' | 'game-end'

export interface Tone {
  frequency: number
  durationMs: number
  gain: number
  wave: OscillatorType
}

const patterns: Record<GameSoundEvent, readonly Tone[]> = {
  move: [{ frequency: 285, durationMs: 55, gain: 0.035, wave: 'sine' }],
  capture: [
    { frequency: 210, durationMs: 55, gain: 0.04, wave: 'triangle' },
    { frequency: 145, durationMs: 75, gain: 0.035, wave: 'triangle' },
  ],
  check: [
    { frequency: 430, durationMs: 55, gain: 0.03, wave: 'sine' },
    { frequency: 645, durationMs: 85, gain: 0.035, wave: 'sine' },
  ],
  'game-end': [
    { frequency: 330, durationMs: 90, gain: 0.03, wave: 'sine' },
    { frequency: 440, durationMs: 90, gain: 0.03, wave: 'sine' },
    { frequency: 550, durationMs: 120, gain: 0.035, wave: 'sine' },
  ],
}

export function soundPattern(event: GameSoundEvent): readonly Tone[] {
  return patterns[event]
}

export class GameSoundPlayer {
  private context: AudioContext | null = null

  play(event: GameSoundEvent): void {
    try {
      this.context ??= new AudioContext()
      const context = this.context
      if (context.state === 'suspended') void context.resume()
      let at = context.currentTime
      for (const tone of soundPattern(event)) {
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        const duration = tone.durationMs / 1_000
        oscillator.type = tone.wave
        oscillator.frequency.setValueAtTime(tone.frequency, at)
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.exponentialRampToValueAtTime(tone.gain, at + 0.008)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
        oscillator.connect(gain).connect(context.destination)
        oscillator.start(at)
        oscillator.stop(at + duration + 0.01)
        at += duration
      }
    } catch {
      // Audio is optional; restricted browser policies must never affect play.
    }
  }

  dispose(): void {
    const context = this.context
    this.context = null
    if (context) void context.close().catch(() => undefined)
  }
}
