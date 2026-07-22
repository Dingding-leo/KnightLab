import { useEffect, useState } from 'react'
import { BrainCircuit, Target } from 'lucide-react'
import type { RetryItem } from '../review/retry'
import type { TacticProgress, TacticPuzzle } from '../tactics/tactics'
import { RetryQueue } from './RetryQueue'
import { TacticsSprint, type TacticsSprintResult } from './TacticsSprint'
import { VisionTrainer } from './VisionTrainer'

type TrainingSource = 'tactics' | 'personal' | 'vision'

interface TrainingWorkspaceProps {
  tacticProgress: TacticProgress
  onRecordTacticAttempt: (puzzle: TacticPuzzle, result: TacticsSprintResult) => Promise<void>
  retryItems: RetryItem[]
  requestedRetryKey: string | null
  onSaveRetryItem: (item: RetryItem) => Promise<void>
  onDeleteRetryItem: (retryKey: string) => Promise<boolean | void>
  onBackToReview: (item: RetryItem) => void
  onOpenReview: () => void
}

function defaultSource(items: RetryItem[], requestedRetryKey: string | null): TrainingSource {
  if (requestedRetryKey) return 'personal'
  const now = new Date().toISOString()
  return items.some((item) => item.status === 'active' && item.dueAt <= now) ? 'personal' : 'tactics'
}

export function TrainingWorkspace({
  tacticProgress,
  onRecordTacticAttempt,
  retryItems,
  requestedRetryKey,
  onSaveRetryItem,
  onDeleteRetryItem,
  onBackToReview,
  onOpenReview,
}: TrainingWorkspaceProps) {
  const [source, setSource] = useState<TrainingSource>(() => defaultSource(retryItems, requestedRetryKey))
  const dueCount = retryItems.filter((item) => item.status === 'active' && item.dueAt <= new Date().toISOString()).length

  useEffect(() => {
    if (requestedRetryKey) setSource('personal')
  }, [requestedRetryKey])

  return (
    <section className="train-workspace" aria-label="Training workspace">
      <div className="train-source-tabs" role="tablist" aria-label="Training source">
        <button
          id="train-tactics-tab"
          type="button"
          role="tab"
          aria-selected={source === 'tactics'}
          aria-controls="train-tactics-panel"
          onClick={() => setSource('tactics')}
        ><Target size={16} /><span>Tactics Sprint</span></button>
        <button
          id="train-personal-tab"
          type="button"
          role="tab"
          aria-selected={source === 'personal'}
          aria-controls="train-personal-panel"
          onClick={() => setSource('personal')}
        ><Target size={16} /><span>From your games</span><output aria-label={`${dueCount} personal positions due`}>{dueCount}</output></button>
        <button
          id="train-vision-tab"
          type="button"
          role="tab"
          aria-selected={source === 'vision'}
          aria-controls="train-vision-panel"
          onClick={() => setSource('vision')}
        ><BrainCircuit size={16} /><span>Board vision</span></button>
      </div>

      {source === 'tactics' && (
        <section id="train-tactics-panel" role="tabpanel" aria-labelledby="train-tactics-tab">
          <TacticsSprint progress={tacticProgress} onRecordAttempt={onRecordTacticAttempt} />
        </section>
      )}
      {source === 'personal' && (
        <section id="train-personal-panel" role="tabpanel" aria-labelledby="train-personal-tab">
          <RetryQueue
            items={retryItems}
            requestedRetryKey={requestedRetryKey}
            onSave={onSaveRetryItem}
            onDelete={onDeleteRetryItem}
            onBackToReview={onBackToReview}
            onOpenReview={onOpenReview}
          />
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
