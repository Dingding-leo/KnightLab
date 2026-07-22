import { Chess } from 'chess.js'
import type { AnalysisTimeline } from '../analysis/analysisModel'
import type { AnalysisResponse, AnalysisSettings } from '../analysis/stockfishAnalysisClient'
import { classifyReviewedMove, summarizeGameReview, type GameReviewSummary, type ReviewedMove } from './reviewModel'

export type AnalyzePosition = (fen: string, settings: AnalysisSettings) => Promise<AnalysisResponse>

export interface ReviewProgress {
  completedPly: number
  totalPly: number
  stage: 'before' | 'after'
}

export interface GameReview {
  createdAt: string
  engineName: string
  enginePath: string
  settings: AnalysisSettings
  totalElapsedMs: number
  moves: ReviewedMove[]
  summary: GameReviewSummary
}

function abortError(): Error {
  return new DOMException('Game review was cancelled.', 'AbortError')
}

function assertActive(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError()
}

export async function runGameReview(
  timeline: AnalysisTimeline,
  analyze: AnalyzePosition,
  settings: AnalysisSettings,
  onProgress?: (progress: ReviewProgress) => void,
  signal?: AbortSignal,
): Promise<GameReview> {
  if (!timeline.moves.length) throw new Error('Load a PGN with at least one move before starting a full review.')
  const beforeSettings = { ...settings, multiPv: Math.max(2, settings.multiPv) }
  const afterSettings = { ...settings, multiPv: 1 }
  const reviewed: ReviewedMove[] = []
  let engineName = ''
  let enginePath = ''
  let totalElapsedMs = 0

  onProgress?.({ completedPly: 0, totalPly: timeline.moves.length, stage: 'before' })
  for (const [index, move] of timeline.moves.entries()) {
    assertActive(signal)
    const preFen = timeline.positions[index].fen
    const postFen = timeline.positions[index + 1].fen
    const before = await analyze(preFen, beforeSettings)
    assertActive(signal)
    onProgress?.({ completedPly: index, totalPly: timeline.moves.length, stage: 'after' })
    const terminal = new Chess(postFen).isGameOver()
    const after = terminal ? null : await analyze(postFen, afterSettings)
    assertActive(signal)

    engineName ||= before.engineName
    enginePath ||= before.enginePath
    totalElapsedMs += before.elapsedMs + (after?.elapsedMs ?? 0)
    reviewed.push(classifyReviewedMove({
      ...move,
      preFen,
      postFen,
      beforeLines: before.lines,
      afterLine: after?.lines[0] ?? null,
    }))
    onProgress?.({ completedPly: index + 1, totalPly: timeline.moves.length, stage: 'before' })
  }

  return {
    createdAt: new Date().toISOString(),
    engineName,
    enginePath,
    settings: beforeSettings,
    totalElapsedMs,
    moves: reviewed,
    summary: summarizeGameReview(reviewed),
  }
}
