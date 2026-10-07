import { STATUS_LABELS } from '../domain.ts'
import type { Status } from '../domain.ts'

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className="badge" data-status={status}>
      {STATUS_LABELS[status]}
    </span>
  )
}
