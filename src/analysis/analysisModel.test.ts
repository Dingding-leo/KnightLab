import { describe, expect, it } from 'vitest'
import {
  createFenTimeline,
  createPgnTimeline,
  evaluationForPerspective,
  formatAnalysisScore,
  uciPvToSan,
} from './analysisModel'

const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('analysis timeline', () => {
  it('creates one immutable position per main-line ply', () => {
    const timeline = createPgnTimeline('[Event "Test"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 *')
    expect(timeline.positions).toHaveLength(6)
    expect(timeline.moves.map((move) => move.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'])
    expect(timeline.positions[0].fen).toBe(startFen)
    expect(timeline.positions[5].lastMove).toEqual({ from: 'f1', to: 'b5' })
  })

  it('loads a legal arbitrary FEN as ply zero', () => {
    const timeline = createFenTimeline('8/8/8/8/8/8/4k3/6K1 w - - 0 1')
    expect(timeline.positions).toHaveLength(1)
    expect(timeline.positions[0].turn).toBe('w')
    expect(() => createFenTimeline('not fen')).toThrow('Invalid FEN')
    expect(() => createFenTimeline('not fen')).not.toThrow('Invalid FEN: Invalid FEN')
  })

  it('preserves the real colour and move number for PGNs that begin with Black', () => {
    const timeline = createPgnTimeline('[SetUp "1"]\n[FEN "7k/6Q1/8/8/8/8/8/6K1 b - - 0 1"]\n\n1... Kxg7 *')
    expect(timeline.moves[0]).toMatchObject({ ply: 1, moveNumber: 1, color: 'b', san: 'Kxg7' })
  })
})

describe('analysis notation and perspective', () => {
  it('replays legal UCI principal variations as SAN', () => {
    expect(uciPvToSan(startFen, ['e2e4', 'e7e5', 'g1f3'])).toEqual(['e4', 'e5', 'Nf3'])
    expect(() => uciPvToSan(startFen, ['e2e5'])).toThrow('illegal principal variation')
  })

  it('normalizes side-to-move scores to White without losing mate semantics', () => {
    const blackToMove = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
    expect(evaluationForPerspective({ kind: 'cp', value: 42, bound: null }, blackToMove, 'white'))
      .toEqual({ kind: 'cp', value: -42, bound: null })
    expect(formatAnalysisScore({ kind: 'mate', value: -3, bound: null })).toBe('M−3')
    expect(formatAnalysisScore({ kind: 'cp', value: 34, bound: 'lower' })).toBe('≥ +0.34')
  })
})
