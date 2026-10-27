import { AlertIcon, CheckIcon } from '../auth/icons'
import type { ShortlistEntry } from './api'
import { shortlistReason } from './restaurantShortlist'

type Props = {
  entry: ShortlistEntry
  budget: string | null
  currency: string | null
  chosen: boolean
  onRemove: () => void
  onChoose: () => void
}

/** One ranked restaurant with the reason it is where it is; Choose is offered only here. */
export function RestaurantShortlistEntry({ entry, budget, currency, chosen, onRemove, onChoose }: Props) {
  const name = entry.restaurant.name
  return (
    <article className={chosen ? 'card entry is-chosen' : 'card entry'} aria-label={name}>
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
      <div className="row-end">
        <button className="btn btn-ghost" type="button" aria-label={`Remove ${name} from shortlist`} onClick={onRemove}>
          Remove
        </button>
        <button
          className="btn btn-primary"
          type="button"
          aria-pressed={chosen}
          aria-label={`Choose ${name}`}
          onClick={onChoose}
        >
          {chosen ? (
            <>
              <CheckIcon />
              Chosen
            </>
          ) : (
            'Choose'
          )}
        </button>
      </div>
    </article>
  )
}
