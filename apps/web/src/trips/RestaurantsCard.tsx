import { Link } from 'react-router'
import { CalendarIcon, HeartIcon, MapPinIcon, PlusIcon } from '../auth/icons'
import type { RestaurantPick, Trip } from './api'
import { dayMealLabel, estimateLabel } from './restaurantPicks'

/** The restaurants picked for a trip, for the Overview: where each sits and what it adds to the estimate. */
export function RestaurantsCard({ trip, canEdit }: { trip: Trip; canEdit: boolean }) {
  const picks = trip.restaurants ?? []
  const days = trip.days ?? []
  const travellers = trip.traveller_count ?? 1
  const shortlist = `/trips/${encodeURIComponent(trip.id)}/restaurant-options/shortlist`
  return (
    <section className="card stack" aria-labelledby="overview-restaurants">
      <h2 id="overview-restaurants">
        <MapPinIcon />
        Restaurants
      </h2>
      {picks.length === 0 ? (
        <div className="empty-state">
          <CalendarIcon />
          <h3>No restaurants picked yet</h3>
          <p className="text-muted">Found somewhere you'd love to eat? Add it and we'll slot it into your days.</p>
          {canEdit && (
            <Link className="btn btn-primary" to={shortlist}>
              <PlusIcon />
              Add a restaurant
            </Link>
          )}
        </div>
      ) : (
        <>
          <ul className="restaurant-picks">
            {picks.map((pick: RestaurantPick) => (
              <li className="restaurant-pick" key={pick.id}>
                <span className="text-bold">{pick.name}</span>
                <span className="restaurant-pick-meta">
                  <CalendarIcon />
                  {pick.date === null ? (
                    <span className="badge badge-neutral">{dayMealLabel(pick, days)}</span>
                  ) : (
                    <span className="badge badge-success">
                      <CalendarIcon />
                      &nbsp;{dayMealLabel(pick, days)}
                    </span>
                  )}
                  <span className="text-muted">{estimateLabel(pick, travellers)}</span>
                </span>
              </li>
            ))}
          </ul>
          <div>
            <Link className="btn btn-secondary" to={shortlist}>
              <HeartIcon />
              View shortlist
            </Link>
          </div>
        </>
      )}
    </section>
  )
}
