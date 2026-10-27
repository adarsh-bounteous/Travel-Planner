import { AlertIcon, CheckIcon } from '../auth/icons'
import type { ShortlistEntry } from './api'
import { RestaurantLink } from './RestaurantLink'
import { shortlistReason } from './restaurantShortlist'

type Props = {
  entry: ShortlistEntry
  budget: string | null
  currency: string | null
  added: boolean
  onRemove: () => void
  onAdd: () => void
}

/** One ranked restaurant with the reason it is where it is; Add to trip is offered only here. */
export function RestaurantShortlistEntry({ entry, budget, currency, added, onRemove, onAdd }: Props) {
  const name = entry.restaurant.name
  return (
    <article className={added ? 'card entry is-chosen' : 'card entry'} aria-label={name}>
      <div className="row-between">
        <h3>{name}</h3>
        {entry.fits_budget ? (
          <span className="badge badge-success">
            <CheckIcon />
            Within budget
          </span>
        ) : (
          <span className="badge badge-warning">
            <AlertIcon />
            Over budget
          </span>
        )}
      </div>
      <p>{shortlistReason(entry, budget, currency)}</p>
      <RestaurantLink name={name} url={entry.restaurant.url} />
      <div className="row-end">
        <button className="btn btn-ghost" type="button" aria-label={`Remove ${name} from shortlist`} onClick={onRemove}>
          Remove
        </button>
        {added ? (
          <button className="btn btn-secondary" type="button" disabled aria-pressed="true">
            <CheckIcon />
            Added to trip
          </button>
        ) : (
          <button className="btn btn-primary" type="button" aria-label={`Add ${name} to trip`} onClick={onAdd}>
            Add to trip
          </button>
        )}
      </div>
    </article>
  )
}
