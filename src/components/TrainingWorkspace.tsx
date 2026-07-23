import { useEffect, useRef, useState } from 'react'
import { BrainCircuit, RefreshCw, Target } from 'lucide-react'
import type { RetryItem } from '../review/retry'
import type { TacticProgress, TacticPuzzle } from '../tactics/tactics'
import {
  defaultTrainingSource,
  shouldDefaultToPersonalAfterRetryHydration,
  type TrainingSource,
} from '../training/trainingSource'
import { RetryQueue } from './RetryQueue'
import { TacticsSprint, type TacticsSprintResult } from './TacticsSprint'
import { VisionTrainer } from './VisionTrainer'

interface TrainingWorkspaceProps {
  tacticProgress: TacticProgress
  onRecordTacticAttempt: (puzzle: TacticPuzzle, result: TacticsSprintResult) => Promise<void>
  /** Tactics history is independently validated after the player opens Train. */
  tacticsHistoryLoading?: boolean
  tacticsHistoryError?: boolean
  onRetryTacticsHistory?: () => void
  retryItems: RetryItem[]
  /** Saved retry positions are independently validated in a local Worker. */
  retryHistoryLoading?: boolean
  retryHistoryError?: boolean
  onRetryRetryHistory?: () => void
  requestedRetryKey: string | null
  onSaveRetryItem: (item: RetryItem) => Promise<void>
  onDeleteRetryItem: (retryKey: string) => Promise<boolean | void>
  onBackToReview: (item: RetryItem) => void
  onOpenReview: () => void
}

export function TrainingWorkspace({
  tacticProgress,
  onRecordTacticAttempt,
  tacticsHistoryLoading = false,
  tacticsHistoryError = false,
  onRetryTacticsHistory,
  retryItems,
  retryHistoryLoading = false,
  retryHistoryError = false,
  onRetryRetryHistory,
  requestedRetryKey,
  onSaveRetryItem,
  onDeleteRetryItem,
  onBackToReview,
  onOpenReview,
}: TrainingWorkspaceProps) {
  const [source, setSource] = useState<TrainingSource>(() => defaultTrainingSource(retryItems, requestedRetryKey))
  const playerSelectedSource = useRef(false)
  const previousRetryHistoryLoading = useRef(retryHistoryLoading)
  const dueCount = retryItems.filter((item) => item.status === 'active' && item.dueAt <= new Date().toISOString()).length

  useEffect(() => {
    if (requestedRetryKey) setSource('personal')
  }, [requestedRetryKey])

  useEffect(() => {
    const wasLoading = previousRetryHistoryLoading.current
    previousRetryHistoryLoading.current = retryHistoryLoading
    if (shouldDefaultToPersonalAfterRetryHydration(
      wasLoading,
      retryHistoryLoading,
      playerSelectedSource.current,
      retryItems,
    )) {
      setSource('personal')
    }
  }, [retryHistoryLoading, retryItems])

  const chooseSource = (next: TrainingSource) => {
    playerSelectedSource.current = true
    setSource(next)
  }

  return (
    <section className="train-workspace" aria-label="Training workspace">
      <div className="train-source-tabs" role="tablist" aria-label="Training source">
        <button
          id="train-tactics-tab"
          type="button"
          role="tab"
          aria-selected={source === 'tactics'}
          aria-controls="train-tactics-panel"
          onClick={() => chooseSource('tactics')}
        ><Target size={16} /><span>Tactics Sprint</span></button>
        <button
          id="train-personal-tab"
          type="button"
          role="tab"
          aria-selected={source === 'personal'}
          aria-controls="train-personal-panel"
          onClick={() => chooseSource('personal')}
        ><Target size={16} /><span>From your games</span><output aria-label={retryHistoryError ? 'Personal positions unavailable' : retryHistoryLoading ? 'Personal positions preparing' : `${dueCount} personal positions due`}>{retryHistoryError ? '!' : retryHistoryLoading ? '…' : dueCount}</output></button>
        <button
          id="train-vision-tab"
          type="button"
          role="tab"
          aria-selected={source === 'vision'}
          aria-controls="train-vision-panel"
          onClick={() => chooseSource('vision')}
        ><BrainCircuit size={16} /><span>Board vision</span></button>
      </div>

      {source === 'tactics' && (
        <section id="train-tactics-panel" role="tabpanel" aria-labelledby="train-tactics-tab">
          {tacticsHistoryError ? (
            <div className="train-history-loading" role="alert">
              <RefreshCw size={20} aria-hidden="true" />
              <div>
                <strong>Couldn’t open your local tactics history</strong>
                <span>Your saved progress remains on this device. Try again before starting a new sprint.</span>
                {onRetryTacticsHistory && <button className="secondary-button" type="button" onClick={onRetryTacticsHistory}>Try again</button>}
              </div>
            </div>
          ) : tacticsHistoryLoading ? (
            <div className="train-history-loading" role="status" aria-live="polite" aria-busy="true">
              <RefreshCw className="spin" size={20} aria-hidden="true" />
              <div>
                <strong>Preparing your local tactics…</strong>
                <span>Checking saved progress locally without interrupting Play.</span>
              </div>
            </div>
          ) : (
            <TacticsSprint progress={tacticProgress} onRecordAttempt={onRecordTacticAttempt} />
          )}
        </section>
      )}
      {source === 'personal' && (
        <section id="train-personal-panel" role="tabpanel" aria-labelledby="train-personal-tab">
          {retryHistoryError ? (
            <div className="train-history-loading" role="alert">
              <RefreshCw size={20} aria-hidden="true" />
              <div>
                <strong>Couldn’t open your saved practice</strong>
                <span>Your private positions remain on this device. Try again before treating the queue as clear.</span>
                {onRetryRetryHistory && <button className="secondary-button" type="button" onClick={onRetryRetryHistory}>Try again</button>}
              </div>
            </div>
          ) : retryHistoryLoading ? (
            <div className="train-history-loading" role="status" aria-live="polite" aria-busy="true">
              <RefreshCw className="spin" size={20} aria-hidden="true" />
              <div>
                <strong>Preparing your saved practice locally…</strong>
                <span>Validating your private positions without interrupting Play.</span>
              </div>
            </div>
          ) : (
            <RetryQueue
              items={retryItems}
              requestedRetryKey={requestedRetryKey}
              onSave={onSaveRetryItem}
              onDelete={onDeleteRetryItem}
              onBackToReview={onBackToReview}
              onOpenReview={onOpenReview}
            />
          )}
        </section>
      )}
      {source === 'vision' && (
        <section id="train-vision-panel" role="tabpanel" aria-labelledby="train-vision-tab">
          <VisionTrainer />
        </section>
      )}
    </section>
  )
}
