import { AlertIcon, ArrowRightIcon, CheckIcon, InfoIcon, XIcon } from '../auth/icons'
import { OptionCard } from '../components/OptionCard'
import { BookingLink, isLocalBooking } from '../travel/BookingLink'
import type { SimOption } from './api'
import { safeHref } from './safeHref'

/** Money with cents and the currency always shown, in the local format. */
export const formatSimMoney = (amount: string | number, currency: string) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(Number(amount))

const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
export const formatSimDate = (iso: string) => dayFormat.format(new Date(`${iso}T00:00:00`))
export const formatSimRange = (from: string, to: string) => `${formatSimDate(from)}–${formatSimDate(to)}`

type Props = {
  /** A stored pick no longer in the shortlist has no source to show. */
  option: Omit<SimOption, 'source'> & { source?: SimOption['source'] }
  /** The country the trip goes to, to word the coverage line. */
  country: string
  tripDates: string
  picked: boolean
  /** The picked option's validity no longer covers the trip dates. */
  datesNotCovered?: boolean
  busy?: boolean
  /** Omitted when the card cannot be picked (a stale pick is replaced by picking another option). */
  onToggle?: () => void
}

/** One SIM option: where it comes from, what it covers, its data and each traveller's price. */
export function SimOptionCard({ option, country, tripDates, picked, datesNotCovered = false, busy = false, onToggle }: Props) {
  const validity = formatSimRange(option.valid_from, option.valid_to)
  const others = option.coverage_count - 1
  const covers = others > 0 ? `${country} and ${others} other ${others === 1 ? 'country' : 'countries'}` : `${country} only`
  const href = isLocalBooking(option.url) ? option.url : safeHref(option.url)
  return (
    <OptionCard
      title={option.name}
      picked={picked}
      badges={
        <>
          {option.source && (
            <span className="badge badge-neutral">{option.source === 'web_search' ? 'Web search' : 'Partner'}</span>
          )}
          <span className={`badge ${option.sim_type === 'esim' ? 'badge-success' : 'badge-neutral'}`}>
            {option.sim_type === 'esim' ? 'eSIM' : 'Physical SIM'}
          </span>
          {picked && (
            <span className="badge badge-success">
              <CheckIcon />
              Picked
            </span>
          )}
          {datesNotCovered && (
            <span className="badge badge-warning">
              <AlertIcon />
              Dates not covered
            </span>
          )}
        </>
      }
      price={
        <dl className="option-price">
          {option.traveller_prices.map((t, i) => (
            <div key={`${t.label}-${i}`}>
              <dt>{t.label}</dt>
              <dd>{formatSimMoney(t.price, option.currency)}</dd>
            </div>
          ))}
          <div className="total">
            <dt>Group total</dt>
            <dd>{formatSimMoney(option.group_total, option.currency)}</dd>
          </div>
        </dl>
      }
      actions={
        <>
          {onToggle && (
            <button
              className={`btn ${picked ? 'btn-secondary' : 'btn-primary'}`}
              type="button"
              aria-pressed={picked}
              disabled={busy}
              onClick={onToggle}
            >
              {picked ? <XIcon /> : <CheckIcon />}
              {picked ? 'Remove pick' : 'Pick'}
            </button>
          )}
          {href ? (
            <BookingLink className="btn btn-ghost" url={href}>
              Booking link
              <ArrowRightIcon />
            </BookingLink>
          ) : (
            <p className="text-sm">
              <InfoIcon /> No booking link is available for this option.
            </p>
          )}
        </>
      }
    >
      <div>{`Covers ${covers}`}</div>
      <div>{datesNotCovered ? `Valid ${validity} (${tripDates} for this trip)` : `Valid ${validity}`}</div>
      <div className="text-bold">{`Data: ${Number(option.data_gb)} GB`}</div>
    </OptionCard>
  )
}
