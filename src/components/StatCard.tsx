interface StatCardProps {
  label: string
  value: string | number
  detail?: string
}

export function StatCard({ label, value, detail }: StatCardProps) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </article>
  )
}
