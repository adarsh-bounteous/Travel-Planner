export type PlacesView = 'list' | 'map'

const VIEWS: { id: PlacesView; label: string }[] = [
  { id: 'list', label: 'List' },
  { id: 'map', label: 'Map' },
]

export function ViewToggle({
  view,
  onChange,
}: {
  view: PlacesView
  onChange: (view: PlacesView) => void
}) {
  return (
    <div className="tabs" role="tablist" aria-label="Results view">
      {VIEWS.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          className="tab"
          role="tab"
          aria-selected={view === id}
          onClick={() => onChange(id)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
