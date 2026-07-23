import type { AnalysisFileImportInput, AnalysisFileImportResult } from './fileImport'
import type { AnalysisTimeline } from './analysisModel'
import type { RetryTimelineInput, RetryTimelineVerification } from '../review/retry'

export interface TimelineWorkerPgnRequest {
  type: 'parse-pgn'
  id: number
  pgn: string
}

export interface TimelineWorkerFileRequest {
  type: 'parse-file'
  id: number
  input: AnalysisFileImportInput
}

export interface TimelineWorkerRetryTimelineRequest {
  type: 'verify-retry-timeline'
  id: number
  timeline: RetryTimelineInput
}

export type TimelineWorkerRequest = TimelineWorkerPgnRequest | TimelineWorkerFileRequest | TimelineWorkerRetryTimelineRequest

export interface TimelineWorkerTimelineResult {
  type: 'timeline-result'
  id: number
  timeline: AnalysisTimeline
}

export interface TimelineWorkerFileResult {
  type: 'file-result'
  id: number
  result: AnalysisFileImportResult
}

export interface TimelineWorkerRetryTimelineResult {
  type: 'retry-timeline-result'
  id: number
  verification: RetryTimelineVerification | null
}

export interface TimelineWorkerError {
  type: 'error'
  id: number
  message: string
}

export type TimelineWorkerResponse = TimelineWorkerTimelineResult | TimelineWorkerFileResult | TimelineWorkerRetryTimelineResult | TimelineWorkerError
