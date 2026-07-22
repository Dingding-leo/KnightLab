import { memo, useEffect, useRef } from 'react'

interface MoveListProps {
  moves: string[]
}

export const MoveList = memo(function MoveList({ moves }: MoveListProps) {
  const latestRow = useRef<HTMLDivElement>(null)

  useEffect(() => {
    latestRow.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [moves.length])

  if (moves.length === 0) {
    return <div className="empty-state">Moves will appear here.</div>
  }

  const rows: Array<{ number: number; white?: string; black?: string }> = []
  for (let index = 0; index < moves.length; index += 2) {
    rows.push({ number: index / 2 + 1, white: moves[index], black: moves[index + 1] })
  }

  return (
    <div className="move-list" aria-label="Move history" aria-live="polite" aria-atomic="false">
      {rows.map((row, index) => (
        <div
          className={`move-row ${index === rows.length - 1 ? 'move-row--latest' : ''}`}
          key={row.number}
          ref={index === rows.length - 1 ? latestRow : undefined}
          aria-current={index === rows.length - 1 ? 'step' : undefined}
        >
          <span>{row.number}.</span>
          <strong>{row.white}</strong>
          <strong>{row.black ?? ''}</strong>
        </div>
      ))}
    </div>
  )
})
