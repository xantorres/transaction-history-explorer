import type { Status } from '../domain.ts'

const LABELS: Record<Status, string> = {
  PENDING: 'Pending',
  BOOKED: 'Booked',
  REVERSED: 'Reversed',
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className="badge" data-status={status}>
      {LABELS[status]}
    </span>
  )
}
