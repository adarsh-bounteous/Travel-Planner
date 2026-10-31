import { AlertIcon, CalendarIcon, CheckIcon } from '../auth/icons'
import { Overlay } from './Overlay'
import { formatRange } from './stays'
import type { StayWarning } from './stays'
import type { Stay } from './api'

type StayWarningModalProps = {
  stay: Stay
  warning: StayWarning
  pending: boolean
  onChange: () => void
  onSaveAnyway: () => void
}

/** Tells the traveller about an overlap or gap; it never blocks, so Save anyway sits next to Change dates. */
export function StayWarningModal({ stay, warning, pending, onChange, onSaveAnyway }: StayWarningModalProps) {
  const overlap = warning.kind === 'overlap'
  return (
    <Overlay kind="modal" role="alertdialog" labelledBy="stay-warning-title" onClose={onChange}>
      <div className="stack stack-lg">
        <h2 id="stay-warning-title">
          <AlertIcon />
          {overlap ? 'These dates overlap another stay' : 'There is a gap between stays'}
        </h2>
        <p>
          {warning.kind === 'overlap'
            ? `${formatRange(warning.other.start_date, warning.other.end_date)} in ${warning.other.place} overlaps ${formatRange(stay.start_date, stay.end_date)} in ${stay.place}.`
            : `No stay covers ${formatRange(warning.from, warning.to)} between ${warning.before.place} and ${warning.after.place}.`}
        </p>
        <div className="overlay-actions end">
          <button className="btn btn-secondary" type="button" onClick={onChange}>
            <CalendarIcon />
            Change dates
          </button>
          <button className="btn btn-primary" type="button" disabled={pending} onClick={onSaveAnyway}>
            <CheckIcon />
            {pending ? 'Saving…' : 'Save anyway'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}
