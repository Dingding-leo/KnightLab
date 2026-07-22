import { Flag, Handshake, RefreshCw } from 'lucide-react'
import type { Color } from 'chess.js'

export type GameDecision =
  | { kind: 'resign'; actor: Color; resumeAfter: boolean }
  | { kind: 'draw-response'; offeredBy: Color; resumeAfter: boolean }
  | { kind: 'restart'; title: string; description: string; confirmLabel: string; resumeAfter: boolean }

interface GameDecisionDialogProps {
  decision: GameDecision
  onCancel: () => void
  onConfirm: () => void
}

function colorName(color: Color): string {
  return color === 'w' ? 'White' : 'Black'
}

export function GameDecisionDialog({ decision, onCancel, onConfirm }: GameDecisionDialogProps) {
  const resigning = decision.kind === 'resign'
  const restarting = decision.kind === 'restart'
  const Icon = resigning ? Flag : restarting ? RefreshCw : Handshake
  const title = resigning ? 'Resign this game?' : restarting ? decision.title : 'Draw offered'
  const description = resigning
    ? `${colorName(decision.actor)} will resign and the result will be saved immediately.`
    : restarting
      ? decision.description
    : `${colorName(decision.offeredBy)} offers a draw. ${colorName(decision.offeredBy === 'w' ? 'b' : 'w')} can accept or decline.`
  const confirmLabel = resigning ? 'Resign game' : restarting ? decision.confirmLabel : 'Accept draw'
  const cancelLabel = resigning || restarting ? 'Keep playing' : 'Decline'

  return (
    <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="decision-title" aria-describedby="decision-description">
      <div className="modal-card decision-card">
        <div className="decision-icon"><Icon size={24} /></div>
        <span className="eyebrow">Game decision</span>
        <h2 id="decision-title">{title}</h2>
        <p id="decision-description">{description}</p>
        <div className="decision-actions">
          <button className="secondary-button" type="button" onClick={onCancel} autoFocus>{cancelLabel}</button>
          <button className={resigning ? 'danger-button' : 'primary-button'} type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
