import { useState } from 'react'
import { CheckIcon, ListIcon, PlusIcon, UserIcon, XIcon } from '../auth/icons'
import { saveDiningNeeds } from './api'
import { FieldError } from './FieldError'
import { Overlay } from './Overlay'

const DINING_NEEDS = [
  { id: 'halal', label: 'Halal' },
  { id: 'kosher', label: 'Kosher' },
  { id: 'gluten-free', label: 'Gluten-free' },
  { id: 'dairy-free', label: 'Dairy-free' },
  { id: 'nut-free', label: 'Nut-free' },
]

type Props = {
  tripId: string
  needs: string[]
  profileFilters: string[]
  onClose: () => void
  onApplied: () => void
}

/** Edit the dining needs that apply to this trip only; the owner's profile filters are shown read-only. */
export function DiningNeedsDrawer({ tripId, needs, profileFilters, onClose, onApplied }: Props) {
  const [selected, setSelected] = useState(needs)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const toggle = (id: string) =>
    setSelected((now) => (now.includes(id) ? now.filter((n) => n !== id) : [...now, id]))

  const apply = async () => {
    setSaving(true)
    setFailed(false)
    try {
      await saveDiningNeeds(tripId, selected)
      onApplied()
    } catch {
      setFailed(true)
      setSaving(false)
    }
  }

  return (
    <Overlay kind="drawer" labelledBy="needs-title" describedBy="needs-note" onClose={onClose}>
      <div className="stack">
        <h2 id="needs-title">
          <ListIcon />
          Dining needs for this trip
        </h2>
        <h3>
          <UserIcon />
          From your profile
        </h3>
        <div className="cluster" role="group" aria-label="Profile filters">
          {profileFilters.map((label) => (
            <span key={label} className="chip chip-static is-selected">
              <UserIcon />
              {label}
            </span>
          ))}
        </div>
        <h3>
          <PlusIcon />
          Added for this trip
        </h3>
        <fieldset className="needs-list" aria-describedby="needs-note">
          <legend>Extra needs for this trip</legend>
          {DINING_NEEDS.map(({ id, label }) => (
            <label key={id} className="check">
              <input
                className="checkbox"
                type="checkbox"
                checked={selected.includes(id)}
                onChange={() => toggle(id)}
              />
              {label}
            </label>
          ))}
        </fieldset>
        <p className="field-hint" id="needs-note">
          These needs apply to this trip only.
        </p>
        <FieldError
          id="needs-error"
          message={failed ? "We couldn't apply your needs. Check your connection and try again." : undefined}
        />
        <div className="actions-end">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            <XIcon />
            Cancel
          </button>
          <button className="btn btn-primary" type="button" disabled={saving} onClick={apply}>
            <CheckIcon />
            {saving ? 'Applying' : 'Apply'}
          </button>
        </div>
      </div>
    </Overlay>
  )
}
