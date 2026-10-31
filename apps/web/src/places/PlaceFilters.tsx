import { PLACE_CATEGORY_LABELS, PLACE_TYPE_LABELS, PRICE_LABELS } from './api'
import type { Category, PlaceFilters as Filters, PlaceType, Price } from './api'

type ChipGroupProps<T extends string> = {
  label: string
  labels: Record<T, string>
  selected: T | undefined
  onChange: (value: T | undefined) => void
}

function ChipGroup<T extends string>({ label, labels, selected, onChange }: ChipGroupProps<T>) {
  return (
    <div className="cluster" role="group" aria-label={label}>
      <button
        type="button"
        className="chip"
        aria-pressed={selected === undefined}
        onClick={() => onChange(undefined)}
      >
        All
      </button>
      {(Object.keys(labels) as T[]).map((value) => (
        <button
          key={value}
          type="button"
          className="chip"
          aria-pressed={selected === value}
          onClick={() => onChange(selected === value ? undefined : value)}
        >
          {labels[value]}
        </button>
      ))}
    </div>
  )
}

export function PlaceFilters({
  filters,
  onChange,
}: {
  filters: Filters
  onChange: (filters: Filters) => void
}) {
  return (
    <div className="stack" role="group" aria-label="Filters">
      <ChipGroup<PlaceType>
        label="Place type"
        labels={PLACE_TYPE_LABELS}
        selected={filters.placeType}
        onChange={(placeType) => onChange({ ...filters, placeType })}
      />
      <ChipGroup<Category>
        label="Category"
        labels={PLACE_CATEGORY_LABELS}
        selected={filters.category}
        onChange={(category) => onChange({ ...filters, category })}
      />
      <ChipGroup<Price>
        label="Price"
        labels={PRICE_LABELS}
        selected={filters.price}
        onChange={(price) => onChange({ ...filters, price })}
      />
    </div>
  )
}
