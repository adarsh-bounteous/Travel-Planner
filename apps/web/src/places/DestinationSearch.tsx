import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { SearchIcon } from '../auth/icons'

export function DestinationSearch() {
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const invalid = submitted && value.trim() === ''

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    const destination = value.trim()
    if (destination) navigate(`/destinations?q=${encodeURIComponent(destination)}`)
  }

  return (
    <form role="search" className="stack" onSubmit={handleSubmit} noValidate>
      <div className="field">
        <label htmlFor="destination-search">Search a city or place</label>
        <input
          id="destination-search"
          className={invalid ? 'input is-invalid' : 'input'}
          type="search"
          placeholder="Search a city or place"
          value={value}
          aria-invalid={invalid}
          aria-describedby={invalid ? 'destination-search-error' : undefined}
          onChange={(event) => setValue(event.target.value)}
        />
        {invalid && (
          <p id="destination-search-error" className="field-error">
            Enter a city or place to search.
          </p>
        )}
      </div>
      <div>
        <button className="btn btn-primary" type="submit">
          <SearchIcon />
          Search
        </button>
      </div>
    </form>
  )
}
