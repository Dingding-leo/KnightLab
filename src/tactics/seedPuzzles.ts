import type { TacticPuzzle } from './tactics'

/**
 * A deliberately small, authored starter set. These positions were composed
 * for KnightClub, not copied from an external puzzle service or database.
 * Their engine proof is provenance for curation; play-time validation is
 * performed by the tactics domain with chess.js.
 */
export const SEED_TACTICS = [
  {
    schemaVersion: 1,
    id: 'seed-v1:fools-mate',
    seedRevision: 1,
    source: { kind: 'knightclub-original', version: '2026-07' },
    title: 'Open King',
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 2',
    sideToMove: 'b',
    themes: ['mate-in-one'],
    difficulty: 400,
    solutionMode: 'unique',
    solutionUci: ['d8h4'],
    solutionSan: ['Qh4#'],
    engineProof: {
      engine: 'Stockfish 18',
      depth: 16,
      multiPv: 4,
      bestMove: 'd8h4',
      scoreGapCp: null,
      mateIn: 1,
    },
  },
  {
    schemaVersion: 1,
    id: 'seed-v1:knight-fork',
    seedRevision: 1,
    source: { kind: 'knightclub-original', version: '2026-07' },
    title: 'Two Targets',
    fen: '2q1k3/8/8/1N6/8/8/4P3/4K3 w - - 0 1',
    sideToMove: 'w',
    themes: ['fork', 'hanging-queen'],
    difficulty: 700,
    solutionMode: 'unique',
    solutionUci: ['b5d6', 'e8d7', 'd6c8'],
    solutionSan: ['Nd6+', 'Kd7', 'Nxc8'],
    engineProof: {
      engine: 'Stockfish 18',
      depth: 14,
      multiPv: 3,
      bestMove: 'b5d6',
      scoreGapCp: 896,
      mateIn: null,
    },
  },
  {
    schemaVersion: 1,
    id: 'seed-v1:black-knight-fork',
    seedRevision: 1,
    source: { kind: 'knightclub-original', version: '2026-07' },
    title: 'Night Shift',
    fen: '4k3/4p3/8/8/5n2/8/8/2Q1K3 b - - 0 1',
    sideToMove: 'b',
    themes: ['fork', 'hanging-queen'],
    difficulty: 750,
    solutionMode: 'unique',
    solutionUci: ['f4d3', 'e1e2', 'd3c1'],
    solutionSan: ['Nd3+', 'Ke2', 'Nxc1+'],
    engineProof: {
      engine: 'Stockfish 18',
      depth: 14,
      multiPv: 3,
      bestMove: 'f4d3',
      scoreGapCp: 808,
      mateIn: null,
    },
  },
  {
    schemaVersion: 1,
    id: 'seed-v1:queen-net',
    seedRevision: 1,
    source: { kind: 'knightclub-original', version: '2026-07' },
    title: 'Queen Net',
    fen: '7k/8/5KQ1/8/8/8/8/8 w - - 0 1',
    sideToMove: 'w',
    themes: ['mate-in-one'],
    difficulty: 450,
    solutionMode: 'unique',
    solutionUci: ['g6g7'],
    solutionSan: ['Qg7#'],
    engineProof: {
      engine: 'Stockfish 18',
      depth: 14,
      multiPv: 4,
      bestMove: 'g6g7',
      scoreGapCp: null,
      mateIn: 1,
    },
  },
  {
    schemaVersion: 1,
    id: 'seed-v1:protected-queen-mate',
    seedRevision: 1,
    source: { kind: 'knightclub-original', version: '2026-07' },
    title: 'Protected Arrival',
    fen: 'k7/8/3b4/8/8/7q/5PP1/5BK1 b - - 0 1',
    sideToMove: 'b',
    themes: ['mate-in-one'],
    difficulty: 500,
    solutionMode: 'unique',
    solutionUci: ['h3h2'],
    solutionSan: ['Qh2#'],
    engineProof: {
      engine: 'Stockfish 18',
      depth: 14,
      multiPv: 4,
      bestMove: 'h3h2',
      scoreGapCp: null,
      mateIn: 1,
    },
  },
] as const satisfies readonly TacticPuzzle[]

export function seedTacticById(id: string): TacticPuzzle | null {
  return SEED_TACTICS.find((puzzle) => puzzle.id === id) ?? null
}
