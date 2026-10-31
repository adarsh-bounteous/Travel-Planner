import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { PlusIcon } from '../auth/icons'
import { fetchProfile, saveProfile } from '../trips/api'
import type { Profile } from '../trips/api'
import { Toast } from '../trips/Toast'
import { unansweredQuestions } from '../trips/profileQuestions'
import type { ProfileQuestionKey } from '../trips/profileQuestions'
import { ProfileAnswerDrawer } from './ProfileAnswerDrawer'
import { PROFILE_ORDER, answerText, labelOf, withAnswer } from './profileAnswers'

type Editing = { key: ProfileQuestionKey; mode: 'edit' | 'add' }

const toastFor = (key: ProfileQuestionKey, mode: 'edit' | 'add', text: string) => {
  const label = labelOf(key)
  if (text === '') return `${label} answer cleared. You can add it again any time.`
  return mode === 'add' ? `${label} added: ${text}.` : `${label} changed to ${text}.`
}

export function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [failed, setFailed] = useState(false)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null)

  useEffect(() => {
    fetchProfile().then(setProfile, () => setFailed(true))
  }, [])

  const save = async (value: string | string[]) => {
    if (!profile || !editing) return
    const sent = withAnswer(profile, editing.key, value)
    const saved = await saveProfile(sent)
    setProfile(saved ?? sent)
    setToast({
      id: Date.now(),
      message: toastFor(editing.key, editing.mode, answerText(sent, editing.key)),
    })
    setEditing(null)
  }

  const skipped = profile ? unansweredQuestions(profile) : []

  return (
    <div className="col stack">
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link to="/account">Account</Link>
          </li>
          <li aria-current="page">Traveller profile</li>
        </ol>
      </nav>
      <div className="stack stack-sm">
        <h1>Traveller profile</h1>
        <p className="text-muted">
          The answers you gave in trip set-up. Keep them current so recommendations fit you.
        </p>
      </div>
      {failed && (
        <p className="alert alert-danger" role="alert">
          We couldn't load your profile. Reload to try again.
        </p>
      )}
      {!failed && profile === null && (
        <div className="stack" role="status" aria-label="Loading">
          {PROFILE_ORDER.map((key) => (
            <span key={key} className="skeleton card" />
          ))}
        </div>
      )}
      {profile && (
        <div className="stack" aria-live="polite">
            {PROFILE_ORDER.map((key) => {
              const label = labelOf(key)
              const lower = label.toLowerCase()
              return (
                <article className="card" key={key}>
                  <div className="answer-row">
                    <span className="answer-label">{label}</span>
                    {skipped.includes(key) ? (
                      <>
                        <select className="select" disabled aria-label={`${label}, not answered`}>
                          <option>Not answered</option>
                        </select>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          aria-label={`Add answer for ${lower}`}
                          onClick={() => setEditing({ key, mode: 'add' })}
                        >
                          <PlusIcon />
                          Add answer
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="answer-value">{answerText(profile, key)}</span>
                        <button
                          className="answer-link"
                          type="button"
                          aria-label={`Change ${lower}`}
                          onClick={() => setEditing({ key, mode: 'edit' })}
                        >
                          Change
                        </button>
                      </>
                    )}
                  </div>
                </article>
              )
            })}
        </div>
      )}
      <p className="text-muted text-sm">
        Changes save to your profile only. People travelling with you aren't part of it, so no
        companion details are shown here.
      </p>
      {profile && editing && (
        <ProfileAnswerDrawer
          mode={editing.mode}
          question={editing.key}
          value={editing.mode === 'add' ? (editing.key === 'tastes' ? [] : '') : profile[editing.key]}
          onClose={() => setEditing(null)}
          onSave={save}
        />
      )}
      <div className="toast-slot">
        {toast && <Toast key={toast.id} message={toast.message} />}
      </div>
    </div>
  )
}
