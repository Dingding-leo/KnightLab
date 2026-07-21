interface MoveListProps {
  moves: string[]
}

export function MoveList({ moves }: MoveListProps) {
  if (moves.length === 0) {
    return <div className="empty-state">Moves will appear here.</div>
  }

  const rows: Array<{ number: number; white?: string; black?: string }> = []
  for (let index = 0; index < moves.length; index += 2) {
    rows.push({ number: index / 2 + 1, white: moves[index], black: moves[index + 1] })
  }

  return (
    <div className="move-list" aria-label="Move history">
      {rows.map((row) => (
        <div className="move-row" key={row.number}>
          <span>{row.number}.</span>
          <strong>{row.white}</strong>
          <strong>{row.black ?? ''}</strong>
        </div>
      ))}
    </div>
  )
}
