import { useState } from 'react'
import { AlertIcon } from '../auth/icons'
import type { TripInput } from './api'

const EMPTY = { name: '', destination: '', start_date: '', end_date: '' }

export const NAME_ERROR = 'Enter a trip name to save this trip.'

/** The New trip inputs and their validation, shared by the New trip page and the set-up drawer. */
export function useTripFields() {
  const [values, setValues] = useState(EMPTY)
  const [nameError, setNameError] = useState<string | null>(null)

  /** The trip to create, or null (with the name error shown) when the name is blank. */
  const validate = (): TripInput | null => {
    if (values.name.trim() === '') {
      setNameError(NAME_ERROR)
      return null
    }
    setNameError(null)
    return {
      name: values.name.trim(),
      destination: values.destination.trim() || null,
      start_date: values.start_date || null,
      end_date: values.end_date || null,
      budget: null,
    }
  }

  return { values, setValues, nameError, validate }
}

type TripFieldsProps = Pick<ReturnType<typeof useTripFields>, 'values' | 'setValues' | 'nameError'>

export function TripFields({ values, setValues, nameError }: TripFieldsProps) {
  const set = (field: keyof typeof EMPTY) => (event: { target: { value: string } }) =>
    setValues({ ...values, [field]: event.target.value })

  return (
    <>
      <div className="field">
        <label className="field-label" htmlFor="trip-name">
          Trip name
        </label>
        <input
          className={`input${nameError ? ' is-invalid' : ''}`}
          id="trip-name"
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? 'trip-name-error' : undefined}
          maxLength={120}
          value={values.name}
          onChange={set('name')}
        />
        {nameError && (
          <p className="field-error cluster" id="trip-name-error" role="alert">
            <AlertIcon />
            <span>{nameError}</span>
          </p>
        )}
      </div>
      <div className="field">
        <label className="field-label" htmlFor="trip-destination">
          Destination
        </label>
        <input
          className="input"
          id="trip-destination"
          maxLength={120}
          value={values.destination}
          onChange={set('destination')}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="trip-start">
          Start date
        </label>
        <input
          className="input"
          id="trip-start"
          type="date"
          value={values.start_date}
          onChange={set('start_date')}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="trip-end">
          End date
        </label>
        <input
          className="input"
          id="trip-end"
          type="date"
          value={values.end_date}
          onChange={set('end_date')}
        />
      </div>
    </>
  )
}
