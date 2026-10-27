import { AlertIcon, CheckIcon, InfoIcon } from '../auth/icons'
import type { VisaStatus } from './api'

const BADGES = {
  required: { tone: 'badge-danger', label: 'Visa required', Icon: AlertIcon },
  not_needed: { tone: 'badge-success', label: 'No visa needed', Icon: CheckIcon },
  no_data: { tone: 'badge-warning', label: 'No data for this route', Icon: InfoIcon },
} as const

/** A visa verdict as icon plus words, never colour alone. `label` renames it, as for "Unresolved". */
export function VisaStatusBadge({ status, label }: { status: VisaStatus; label?: string }) {
  const { tone, label: text, Icon } = BADGES[status]
  return (
    <span className={`badge ${tone}`}>
      <Icon />
      {label ?? text}
    </span>
  )
}
