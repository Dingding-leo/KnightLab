import type { Square } from 'chess.js'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { inertAnalysisBoardInteraction } from '../analysis/analysisBoardInteraction'

const capturedBoardProps = vi.hoisted(() => ({ value: null as unknown }))

vi.mock('./ChessBoard', () => ({
  ChessBoard: (props: unknown) => {
    capturedBoardProps.value = props
    return null
  },
}))

import { AnalysisWorkspace } from './AnalysisWorkspace'

interface CapturedBoardProps {
  legalTargets: ReadonlySet<Square>
  onSquareClick: (square: Square) => void
  onMoveAttempt: (from: Square, to: Square) => void
}

describe('AnalysisWorkspace rendering isolation', () => {
  it('passes the stable inert interaction object to its memoized read-only board', () => {
    renderToStaticMarkup(
      <AnalysisWorkspace
        desktop={false}
        currentPgn="1. e4 e5 2. Nf3 Nc6"
        enginePath={null}
        threads={1}
        hashMb={16}
      />,
    )

    const boardProps = capturedBoardProps.value as CapturedBoardProps
    expect(boardProps.legalTargets).toBe(inertAnalysisBoardInteraction.legalTargets)
    expect(boardProps.onSquareClick).toBe(inertAnalysisBoardInteraction.onSquareClick)
    expect(boardProps.onMoveAttempt).toBe(inertAnalysisBoardInteraction.onMoveAttempt)
  })
})
