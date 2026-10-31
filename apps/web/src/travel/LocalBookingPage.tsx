import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { EmptyStateArt } from '../components/EmptyStateArt'
import { AlertIcon, ArrowLeftIcon } from '../auth/icons'
import { formatMoney } from '../trips/stayOptions'
import { fetchBookingPreview } from './api'
import type { BookingPreview } from './api'
import { formatRange } from './TravelSearchPage'

type Load = { state: 'loading' } | { state: 'unavailable' } | { state: 'ready'; preview: BookingPreview }

/** The pretend booking page a local booking link opens inside the app. Nothing is booked or sent. */
export function LocalBookingPage() {
  const ref = useSearchParams()[0].get('ref') ?? ''
  const navigate = useNavigate()
  const [load, setLoad] = useState<Load>({ state: 'loading' })

  useEffect(() => {
    fetchBookingPreview(ref).then(
      (preview) => setLoad({ state: 'ready', preview }),
      () => setLoad({ state: 'unavailable' }),
    )
  }, [ref])

  if (load.state === 'loading') return <span className="spinner" role="status" aria-label="Loading" />

  if (load.state === 'unavailable')
    return (
      <div className="inbox-col stack">
        <div className="empty-state">
          <EmptyStateArt />
          <AlertIcon />
          <h2>This page is not available</h2>
          <p>The pretend booking page only exists when local mode is on and the link is one we generated.</p>
          <Link className="btn btn-primary" to="/explore/travel">
            Search travel
          </Link>
        </div>
      </div>
    )

  const { option, kind, place, number, start, end } = load.preview
  return (
    <div className="inbox-col stack">
      <div>
        <button className="btn btn-ghost btn-sm back" type="button" onClick={() => navigate(-1)}>
          <ArrowLeftIcon />
          Back to results
        </button>
      </div>
      <h1>{`Option ${number} · ${place} ${kind}`}</h1>
      <div className="alert alert-info" role="status">
        <span className="alert-title">Pretend booking.</span> Nothing is booked or sent.
      </div>
      <div className="mail-sheet">
        <dl className="mail-meta">
          <dt>Option</dt>
          <dd>{option.name}</dd>
          <dt>Dates</dt>
          <dd>{formatRange(start, end)}</dd>
          <dt>Price</dt>
          <dd>{`${formatMoney(option.price, option.currency)} ${option.unit}`}</dd>
        </dl>
        <div className="mail-body">
          <p className="text-sm text-muted">Booking link, opened inside the app:</p>
          <p className="mail-link">{option.url}</p>
          <p className="text-muted text-sm">
            The provider's own page, example.com, is never opened in local mode.
          </p>
        </div>
      </div>
      <div className="stack stack-sm">
        <div>
          <button className="btn btn-primary" type="button" disabled aria-describedby="confirm-hint">
            Confirm booking
          </button>
        </div>
        <span className="field-hint" id="confirm-hint">
          Confirming is switched off on this page. It only pretends.
        </span>
      </div>
    </div>
  )
}
