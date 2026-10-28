import { useState } from 'react'
import { AlertIcon, CheckIcon, PlusIcon, XIcon } from '../auth/icons'
import { FieldError } from './FieldError'

export type InsuranceDetails = { ownerAge: number; companionAges: number[]; activities: string[] }

type Props = {
  initialOwnerAge: number | null
  initialCompanionAges: number[]
  busy: boolean
  failed: boolean
  onCompare: (details: InsuranceDetails) => void
}

const ACTIVITIES = [
  { id: 'skiing', label: 'Skiing' },
  { id: 'scuba-diving', label: 'Scuba diving' },
  { id: 'motorcycling', label: 'Motorcycling' },
  { id: 'mountaineering', label: 'Mountaineering' },
]
const OWNER = { min: 18, max: 99 }
const COMPANION = { min: 0, max: 99 }

type Parsed = { value: number } | { error: string }

const parseAge = (text: string, { min, max }: { min: number; max: number }): Parsed => {
  if (!/^\d{1,3}$/.test(text)) return { error: 'Use whole numbers only, such as 34.' }
  const value = Number(text)
  return value < min || value > max ? { error: `Enter an age from ${min} to ${max}.` } : { value }
}

const years = (age: number) => `${age} ${age === 1 ? 'year' : 'years'}`

/** Owner age, companion ages and risky activities: everything the insurance comparison needs. */
export function InsuranceDetailsForm({
  initialOwnerAge,
  initialCompanionAges,
  busy,
  failed,
  onCompare,
}: Props) {
  const [ownerText, setOwnerText] = useState(initialOwnerAge === null ? '' : String(initialOwnerAge))
  const [ownerError, setOwnerError] = useState('')
  const [companionText, setCompanionText] = useState(initialCompanionAges.join(', '))
  const [companions, setCompanions] = useState(initialCompanionAges)
  const [companionError, setCompanionError] = useState('')
  // The API keeps only a yes/no, so a stored "yes" cannot say which activities; they start unticked.
  const [activities, setActivities] = useState<string[]>([])

  const owner = parseAge(ownerText.trim(), OWNER)
  const ownerAge = 'value' in owner ? owner.value : null
  const steps = [
    { id: 'owner', done: ownerAge !== null, label: 'Owner age' },
    { id: 'companions', done: companions.length > 0, label: 'Companion ages' },
    { id: 'activities', done: activities.length > 0, label: 'Risky activities' },
  ]
  const doneCount = steps.filter((s) => s.done).length
  const complete = doneCount === steps.length

  const checkOwner = () => setOwnerError(ownerText.trim() === '' || 'value' in owner ? '' : owner.error)

  const commitCompanions = () => {
    const parts = companionText.split(',').map((p) => p.trim()).filter(Boolean)
    if (parts.length === 0) return setCompanionError('Enter an age to add a companion.')
    const ages: number[] = []
    for (const part of parts) {
      const parsed = parseAge(part, COMPANION)
      if ('error' in parsed) return setCompanionError(`"${part}": ${parsed.error}`)
      ages.push(parsed.value)
    }
    setCompanions(ages)
    setCompanionError('')
    setCompanionText(ages.join(', '))
  }

  const removeCompanion = (index: number) => {
    const rest = companions.filter((_, i) => i !== index)
    setCompanions(rest)
    setCompanionText(rest.join(', '))
  }

  const toggleActivity = (label: string) =>
    setActivities((now) => (now.includes(label) ? now.filter((a) => a !== label) : [...now, label]))

  return (
    <div className="stack stack-lg">
      <div className="card stack stack-lg">
        <div className={`field${ownerError ? ' is-invalid' : ''}`}>
          <label className="field-label" htmlFor="owner-age">
            Owner age
          </label>
          <input
            className="input"
            id="owner-age"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Enter age"
            value={ownerText}
            aria-invalid={ownerError ? true : undefined}
            aria-describedby="owner-hint owner-error"
            onChange={(e) => setOwnerText(e.target.value)}
            onBlur={checkOwner}
          />
          <span className="field-hint" id="owner-hint">
            Age in years, 18 to 99.
          </span>
          <FieldError id="owner-error" message={ownerError} />
        </div>

        <div className="stack stack-sm">
          <div className="input-row">
            <div className={`field${companionError ? ' is-invalid' : ''}`}>
              <label className="field-label" htmlFor="companion-ages">
                Companion ages
              </label>
              <input
                className="input"
                id="companion-ages"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Enter age"
                value={companionText}
                aria-invalid={companionError ? true : undefined}
                aria-describedby="companion-hint companion-error"
                onChange={(e) => setCompanionText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  commitCompanions()
                }}
              />
              <span className="field-hint" id="companion-hint">
                One age, or several separated by commas, such as 8, 12.
              </span>
              <FieldError id="companion-error" message={companionError} />
            </div>
            <button className="btn btn-secondary btn-companion" type="button" onClick={commitCompanions}>
              <PlusIcon />
              Add companion
            </button>
          </div>
          <ul className="cluster list-plain" aria-label="Companions added">
            {companions.map((age, i) => (
              <li key={`${i}-${age}`}>
                <span className="chip is-selected chip-static">
                  Companion {i + 1}: {years(age)}
                  <button
                    type="button"
                    className="chip-remove"
                    aria-label={`Remove companion ${i + 1}, age ${age}`}
                    onClick={() => removeCompanion(i)}
                  >
                    <XIcon />
                  </button>
                </span>
              </li>
            ))}
          </ul>
          {companions.length === 0 && <p className="text-sm text-muted">No companions yet. Add at least one age.</p>}
        </div>

        <fieldset className="fieldset stack stack-sm">
          <legend className="field-label">Risky activities</legend>
          <span className="field-hint" id="activities-hint">
            Choose every activity you plan to do on this trip.
          </span>
          <div className="activity-grid">
            {ACTIVITIES.map(({ id, label }) => (
              <div className="activity" key={id}>
                <label className="check">
                  <input
                    className="checkbox"
                    type="checkbox"
                    checked={activities.includes(label)}
                    aria-describedby="activities-hint"
                    onChange={() => toggleActivity(label)}
                  />
                  <span>{label}</span>
                </label>
              </div>
            ))}
          </div>
        </fieldset>

        <hr className="divider" />
        <div aria-live="polite">
          <p className="text-sm text-bold">
            {complete ? 'All set. Your plans are ready.' : `${doneCount} of ${steps.length} details done`}
          </p>
          <ul className="checklist">
            {steps.map((s) => (
              <li key={s.id} className={s.done ? 'is-done' : undefined}>
                {s.done && <CheckIcon />}
                <span>
                  {s.label}
                  {s.done ? '' : ' (needed)'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {failed && (
        <div className="alert alert-danger cluster" role="alert">
          <AlertIcon />
          <div>
            <p className="alert-title">We couldn't save your details.</p>
            <p>Check your connection and select Compare plans again.</p>
          </div>
        </div>
      )}

      <div className="row-end">
        {!complete && <span className="text-sm text-muted">Add the missing details to compare plans.</span>}
        <button
          className="btn btn-primary"
          type="button"
          disabled={!complete || busy}
          onClick={() => ownerAge !== null && onCompare({ ownerAge, companionAges: companions, activities })}
        >
          {busy ? <span className="spinner" role="status" aria-label="Saving details" /> : 'Compare plans'}
        </button>
      </div>
    </div>
  )
}
