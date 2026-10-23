import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { CheckIcon } from '../auth/icons'
import { fetchProfile, saveProfile } from '../trips/api'
import type { Profile } from '../trips/api'

const FIELDS: { id: keyof Profile; label: string; max: number }[] = [
  { id: 'display_name', label: 'Display name', max: 80 },
  { id: 'home_city', label: 'Home city', max: 80 },
  { id: 'dietary_notes', label: 'Dietary notes', max: 500 },
]

export function ProfilePage() {
  const [values, setValues] = useState<Profile | null>(null)
  const [failed, setFailed] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    fetchProfile().then(setValues, () => setFailed(true))
  }, [])

  if (failed) return <p role="alert">We couldn't load your profile. Reload to try again.</p>
  if (values === null) return <span className="spinner" role="status" aria-label="Loading" />

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaved(false)
    setPending(true)
    try {
      await saveProfile(values)
      setSaved(true)
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <form className="col stack" onSubmit={submit}>
      <h1>Traveller profile</h1>
      {FIELDS.map(({ id, label, max }) => (
        <div className="field" key={id}>
          <label className="field-label" htmlFor={`profile-${id}`}>
            {label}
          </label>
          <input
            className="input"
            id={`profile-${id}`}
            maxLength={max}
            value={values[id]}
            onChange={(event) => setValues({ ...values, [id]: event.target.value })}
          />
        </div>
      ))}
      <div>
        <button className="btn btn-primary" type="submit" disabled={pending}>
          Save profile
        </button>
      </div>
      {saved && (
        <div className="toast-slot">
          <div className="toast is-open" role="status" aria-live="polite">
            <CheckIcon />
            <span>Profile saved.</span>
          </div>
        </div>
      )}
    </form>
  )
}
