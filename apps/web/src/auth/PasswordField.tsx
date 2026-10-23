import { useState } from 'react'
import type { ReactNode } from 'react'
import { EyeIcon } from './icons'

type Props = {
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
  placeholder: string
  invalid: boolean
  describedBy?: string
  hint?: ReactNode
}

export function PasswordField({
  value,
  onChange,
  autoComplete,
  placeholder,
  invalid,
  describedBy,
  hint,
}: Props) {
  const [shown, setShown] = useState(false)
  return (
    <div className={`field${invalid ? ' is-invalid' : ''}`}>
      <label className="field-label" htmlFor="password">
        Password
      </label>
      <div className="pwrow">
        <input
          id="password"
          className="input"
          type={shown ? 'text' : 'password'}
          name="password"
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? describedBy : undefined}
        />
        <button
          className="btn btn-ghost btn-icon"
          type="button"
          aria-label={shown ? 'Hide password' : 'Show password'}
          onClick={() => setShown(!shown)}
        >
          <EyeIcon />
        </button>
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  )
}
