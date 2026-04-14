export const MetricCard = ({
  label,
  value,
  note,
}: {
  label: string
  value: string
  note?: string
}) => (
  <article className="metric-card">
    <p className="metric-label">{label}</p>
    <strong>{value}</strong>
    {note ? <span>{note}</span> : null}
  </article>
)
