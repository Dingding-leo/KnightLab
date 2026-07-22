import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PlayPreviewNavigationProps {
  ply: number
  maxPly: number
  onPrevious: () => void
  onNext: () => void
  onReturnToLive: () => void
}

/** Controls only the displayed historical position; the live game keeps running. */
export function PlayPreviewNavigation({
  ply,
  maxPly,
  onPrevious,
  onNext,
  onReturnToLive,
}: PlayPreviewNavigationProps) {
  return (
    <div className="play-preview-navigation" role="group" aria-label="Historical position navigation">
      <button className="play-preview-navigation__step" type="button" onClick={onPrevious} disabled={ply <= 1}>
        <ChevronLeft size={16} aria-hidden="true" /><span>Previous</span>
      </button>
      <output aria-live="polite">Move {ply} of {maxPly}</output>
      <button className="play-preview-navigation__step" type="button" onClick={onNext} disabled={ply >= maxPly}>
        <span>Next</span><ChevronRight size={16} aria-hidden="true" />
      </button>
      <button className="board-return-live" type="button" onClick={onReturnToLive}>Return to live</button>
    </div>
  )
}
