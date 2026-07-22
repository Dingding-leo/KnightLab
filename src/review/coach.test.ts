import { Chess, type Square } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { createPgnTimeline } from '../analysis/analysisModel'
import { buildCoachGuidance, buildCoachGuidanceFromTimeline, type CoachInput } from './coach'
import type { ReviewedMove } from './reviewModel'

type MoveInput = { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' }

function reviewedMove(
  preFen: string,
  actual: MoveInput,
  options: Partial<ReviewedMove> = {},
): ReviewedMove {
  const game = new Chess(preFen)
  const applied = game.move(actual)
  return {
    ply: 1,
    moveNumber: 1,
    color: applied.color,
    san: applied.san,
    from: applied.from,
    to: applied.to,
    classification: 'blunder',
    accuracy: 25,
    centipawnLoss: 240,
    expectedLoss: 0.4,
    bestMoveUci: null,
    bestMoveSan: null,
    isBestMove: false,
    phase: 'middlegame',
    bestScore: { kind: 'cp', value: 180, bound: null },
    playedScore: { kind: 'cp', value: -60, bound: null },
    bestLineSan: [],
    depth: 18,
    confidence: 'normal',
    feedback: 'Recorded review feedback.',
    ...options,
  }
}

function input(
  preFen: string,
  actual: MoveInput,
  options: Partial<ReviewedMove> = {},
): CoachInput {
  const postGame = new Chess(preFen)
  postGame.move(actual)
  return { preFen, postFen: postGame.fen(), move: reviewedMove(preFen, actual, options) }
}

function kinds(guidance: ReturnType<typeof buildCoachGuidance>): string[] {
  return guidance?.evidence.map((item) => item.kind) ?? []
}

describe('review coach evidence', () => {
  it('grounds a missed mate in the legal recommended move and continuation', () => {
    const preFen = '6k1/8/5K1Q/8/8/8/8/8 w - - 0 1'
    const guidance = buildCoachGuidance(input(preFen, { from: 'h6', to: 'h5' }, {
      classification: 'miss',
      bestMoveUci: 'h6g7',
      bestMoveSan: 'Qg7#',
      bestLineSan: ['Qg7#'],
      bestScore: { kind: 'mate', value: 1, bound: null },
    }))

    expect(kinds(guidance)).toContain('missed-mate')
    expect(guidance?.summary).toContain('Qg7#')
    expect(guidance?.evidence[0]?.statement).toContain('g7')
  })

  it('identifies an unsupported moved piece only from the actual legal post-move board', () => {
    const preFen = 'r3k3/8/8/8/8/8/R7/4K3 w - - 0 1'
    const guidance = buildCoachGuidance(input(preFen, { from: 'a2', to: 'a1' }, {
      bestMoveUci: 'a2a8',
      bestMoveSan: 'Rxa8+',
      bestLineSan: ['Rxa8+', 'Kd7'],
    }))

    expect(kinds(guidance)).toContain('unsupported-piece')
    expect(guidance?.evidence.find((item) => item.kind === 'unsupported-piece')?.statement).toMatch(/rook on a1/i)
    expect(guidance?.focus).toMatch(/support/i)
  })

  it('reports a recommended checking move as a forced king-safety response', () => {
    const preFen = '4k3/8/8/7Q/8/8/8/6K1 w - - 0 1'
    const guidance = buildCoachGuidance(input(preFen, { from: 'h5', to: 'h4' }, {
      classification: 'mistake',
      bestMoveUci: 'h5e5',
      bestMoveSan: 'Qe5+',
      bestLineSan: ['Qe5+', 'Kd7'],
    }))

    expect(kinds(guidance)).toContain('forcing-check')
    expect(guidance?.evidence.find((item) => item.kind === 'forcing-check')?.statement).toContain('Qe5+')
  })

  it('proves a direct double attack and an absolute king pin from the best-move board', () => {
    const forkFen = 'r3k3/8/8/1N6/8/8/8/6K1 w - - 0 1'
    const fork = buildCoachGuidance(input(forkFen, { from: 'b5', to: 'a7' }, {
      bestMoveUci: 'b5c7',
      bestMoveSan: 'Nc7+',
      bestLineSan: ['Nc7+', 'Kd7'],
    }))
    expect(kinds(fork)).toContain('double-attack')
    expect(fork?.evidence.find((item) => item.kind === 'double-attack')?.statement).toMatch(/a8.*e8|e8.*a8/i)

    const pinFen = '4k3/4n3/8/8/8/8/8/R5K1 w - - 0 1'
    const pin = buildCoachGuidance(input(pinFen, { from: 'a1', to: 'a2' }, {
      bestMoveUci: 'a1e1',
      bestMoveSan: 'Re1',
      bestLineSan: ['Re1', 'Kd7'],
    }))
    expect(kinds(pin)).toContain('absolute-pin')
    expect(pin?.evidence.find((item) => item.kind === 'absolute-pin')?.statement).toMatch(/knight on e7/i)
  })

  it('fails closed for limited, invalid, and non-error review inputs', () => {
    const preFen = '4k3/8/8/7Q/8/8/8/6K1 w - - 0 1'
    const limited = buildCoachGuidance(input(preFen, { from: 'h5', to: 'h4' }, {
      confidence: 'limited',
      bestMoveUci: 'h5e5',
      bestMoveSan: 'Qe5+',
      bestLineSan: ['Qe5+'],
    }))
    expect(limited?.evidence).toHaveLength(0)
    expect(limited?.summary).toMatch(/limited/i)

    const invalid: CoachInput = {
      preFen: 'not a FEN',
      postFen: 'not a FEN',
      move: reviewedMove(preFen, { from: 'h5', to: 'h4' }, {
        bestMoveUci: 'h5e5', bestMoveSan: 'Qe5+', bestLineSan: ['Qe5+'],
      }),
    }
    expect(buildCoachGuidance(invalid)?.evidence).toHaveLength(0)

    const best = buildCoachGuidance(input(preFen, { from: 'h5', to: 'h4' }, { classification: 'best' }))
    expect(best).toBeNull()
  })

  it('drops malformed or mismatched stored continuations without breaking coach guidance', () => {
    const preFen = '4k3/8/8/7Q/8/8/8/6K1 w - - 0 1'
    const malformed = buildCoachGuidance({
      ...input(preFen, { from: 'h5', to: 'h4' }, {
        bestMoveUci: 'h5e5', bestMoveSan: 'Qe5+', bestLineSan: ['Qe5+', 'Kd7'],
      }),
      move: {
        ...reviewedMove(preFen, { from: 'h5', to: 'h4' }, {
          bestMoveUci: 'h5e5', bestMoveSan: 'Qe5+', bestLineSan: ['Qe5+', 'Kd7'],
        }),
        bestLineSan: 'not an array',
      } as unknown as ReviewedMove,
    })
    expect(malformed?.continuation).toEqual([])
    expect(malformed?.evidence).toContainEqual(expect.objectContaining({ kind: 'forcing-check' }))

    const mismatched = buildCoachGuidance(input(preFen, { from: 'h5', to: 'h4' }, {
      bestMoveUci: 'h5e5', bestMoveSan: 'Qe5+', bestLineSan: ['Qh4'],
    }))
    expect(mismatched?.continuation).toEqual([])

    const malformedScore = buildCoachGuidance({
      ...input(preFen, { from: 'h5', to: 'h4' }, { bestMoveUci: 'h5e5', bestMoveSan: 'Qe5+' }),
      move: { ...reviewedMove(preFen, { from: 'h5', to: 'h4' }), bestMoveUci: 'h5e5', bestScore: undefined } as unknown as ReviewedMove,
    })
    expect(malformedScore?.evidence).toEqual([])
    expect(malformedScore?.summary).toMatch(/score/i)
  })

  it('does not turn geometric attacks by pinned pieces into actionable evidence', () => {
    const pinnedFork = buildCoachGuidance(input(
      'k3r3/8/2q3r1/8/2N5/8/8/4K3 w - - 0 1',
      { from: 'c4', to: 'e3' },
      { classification: 'mistake', bestMoveUci: 'c4e5', bestMoveSan: 'Ne5', bestLineSan: ['Ne5'] },
    ))
    expect(kinds(pinnedFork)).not.toContain('double-attack')

    const pinnedAttacker = buildCoachGuidance(input(
      '4k3/4r3/8/1N6/8/8/8/4R1K1 w - - 0 1',
      { from: 'b5', to: 'a7' },
      { classification: 'mistake', bestMoveUci: 'b5d6', bestMoveSan: 'Nd6', bestLineSan: ['Nd6'] },
    ))
    expect(kinds(pinnedAttacker)).not.toContain('unsupported-piece')
  })

  it('does not call an unverified positive mate score a proved mating line', () => {
    const preFen = '4k3/8/8/7Q/8/8/8/6K1 w - - 0 1'
    const guidance = buildCoachGuidance(input(preFen, { from: 'h5', to: 'h4' }, {
      classification: 'miss', bestMoveUci: 'h5e5', bestMoveSan: 'Qe5+', bestLineSan: ['Qe5+', 'Kd7'],
      bestScore: { kind: 'mate', value: 3, bound: null },
    }))
    expect(kinds(guidance)).not.toContain('missed-mate')
  })

  it('derives identical guidance from a replay timeline after a reviewed move is restored', () => {
    const preFen = 'r3k3/8/8/8/8/8/R7/4K3 w - - 0 1'
    const timeline = createPgnTimeline('[SetUp "1"]\n[FEN "r3k3/8/8/8/8/8/R7/4K3 w - - 0 1"]\n\n1. Ra1 *')
    const move = reviewedMove(preFen, { from: 'a2', to: 'a1' }, {
      bestMoveUci: 'a2a8', bestMoveSan: 'Rxa8+', bestLineSan: ['Rxa8+', 'Kd7'],
    })
    const restoredMove = JSON.parse(JSON.stringify(move)) as ReviewedMove

    expect(buildCoachGuidanceFromTimeline(timeline, move)).toEqual(buildCoachGuidanceFromTimeline(timeline, restoredMove))
  })
})
