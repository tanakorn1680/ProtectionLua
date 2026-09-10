import { STATUS_LABELS, STATUS_COLORS } from '@/lib/license'
import type { LicenseStatus } from '@/lib/types'

export function StatusBadge({ status }: { status: LicenseStatus }) {
  return (
    <span className={`badge ${STATUS_COLORS[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}
