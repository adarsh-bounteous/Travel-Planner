import { InfoIcon } from '../auth/icons'
import { OptionCard } from '../components/OptionCard'
import { BookingLink } from '../travel/BookingLink'
import type { StayProperty } from './api'
import { amenityLabel, formatFetched, formatMoney, plural, starsLabel, typeLabel } from './stayOptions'

type PropertyCardProps = { property: StayProperty; nights: number }

/** One property, listed once, with each provider's offer side by side. */
export function PropertyCard({ property: p, nights }: PropertyCardProps) {
  const count = p.offers.length
  const rating = p.stars > 0 ? `, ${starsLabel(p.stars)}` : ''
  return (
    <OptionCard
      title={p.name}
      badges={
        <span className={`badge ${count > 1 ? 'badge-success' : 'badge-neutral'}`}>
          {`Offered by ${plural(count, 'provider', 'providers')}`}
        </span>
      }
      meta={
        <>
          {`${typeLabel(p.property_type)} in ${p.area}${rating}, ${plural(p.rooms, 'room', 'rooms')}`}
          <br />
          {p.amenities.map(amenityLabel).join(', ')}
        </>
      }
    >
      <div className="offers">
        {p.offers.map((o) => (
          <div className="card offer" key={o.provider}>
            <div className="provider-name">{o.provider}</div>
            <div className="offer-price">
              {formatMoney(o.price_per_night, o.currency)}{' '}
              <span className="text-sm text-muted text-bold">per night</span>
            </div>
            <div className="text-sm text-muted">
              {`${formatMoney(o.total, o.currency)} for ${plural(nights, 'night', 'nights')}`}
            </div>
            <div className="text-sm text-muted">{`Fetched ${formatFetched(o.fetched_at)}`}</div>
            <BookingLink url={o.url}>
              {`View on ${o.provider}`}
              <span className="sr-only">{` for ${p.name}`}</span>
            </BookingLink>
          </div>
        ))}
      </div>
      <p className="note">
        <InfoIcon />
        Final price confirmed on provider's site
      </p>
    </OptionCard>
  )
}
