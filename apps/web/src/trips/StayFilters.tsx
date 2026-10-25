import type { FormEvent } from 'react'
import type { Amenity, StayCriteria } from './api'
import { AMENITIES, PROPERTY_TYPES, ROOM_COUNTS, STAR_RATINGS, starsLabel } from './stayOptions'

type StayFiltersProps = {
  criteria: StayCriteria
  currency: string
  loading: boolean
  onChange: (criteria: StayCriteria) => void
  onApply: () => void
}

const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item])

/** Property type, rooms and budget always apply; the block below them is optional and narrows nothing when off. */
export function StayFilters({ criteria, currency, loading, onChange, onApply }: StayFiltersProps) {
  const set = (patch: Partial<StayCriteria>) => onChange({ ...criteria, ...patch })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onApply()
  }
  return (
    <form className="filters" aria-label="Filters" noValidate onSubmit={submit}>
      <div className="field">
        <label className="field-label" htmlFor="f-type">
          Property type
        </label>
        <select
          className="input select"
          id="f-type"
          value={criteria.property_type}
          onChange={(e) => set({ property_type: e.target.value as StayCriteria['property_type'] })}
        >
          {PROPERTY_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="f-rooms">
          Rooms
        </label>
        <select
          className="input select"
          id="f-rooms"
          value={criteria.rooms}
          onChange={(e) => set({ rooms: Number(e.target.value) })}
        >
          {ROOM_COUNTS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label className="field-label" htmlFor="f-budget">
          {`Budget per night (${currency})`}
        </label>
        <input
          className="input"
          id="f-budget"
          type="number"
          min="0"
          inputMode="numeric"
          placeholder="Max price"
          aria-describedby="h-budget"
          value={criteria.max_price ?? ''}
          onChange={(e) => set({ max_price: e.target.value === '' ? null : Number(e.target.value) })}
        />
        <span className="field-hint" id="h-budget">
          Leave empty to see every price.
        </span>
      </div>
      <div className="filter-optional">
        <p className="text-sm text-muted">Optional filters. Leave them off and nothing is narrowed.</p>
        <div className="field">
          <label className="field-label" htmlFor="f-loc">
            Location
          </label>
          <input
            className="input"
            id="f-loc"
            placeholder="Area or landmark"
            autoComplete="off"
            value={criteria.location}
            onChange={(e) => set({ location: e.target.value })}
          />
        </div>
        <fieldset>
          <legend>Amenities</legend>
          {AMENITIES.map((a) => (
            <label className="check" key={a.id}>
              <input
                className="checkbox"
                type="checkbox"
                checked={criteria.amenities.includes(a.id)}
                onChange={() => set({ amenities: toggle<Amenity>(criteria.amenities, a.id) })}
              />
              {a.label}
            </label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Star rating</legend>
          <div className="cluster">
            {STAR_RATINGS.map((n) => (
              <button
                key={n}
                className="chip"
                type="button"
                aria-pressed={criteria.stars.includes(n)}
                onClick={() => set({ stars: toggle(criteria.stars, n) })}
              >
                {starsLabel(n)}
              </button>
            ))}
          </div>
        </fieldset>
      </div>
      <button className="btn btn-primary" type="submit" disabled={loading}>
        {loading ? 'Applying…' : 'Apply filters'}
      </button>
    </form>
  )
}
