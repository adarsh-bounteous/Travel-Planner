import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { EmptyStateArt } from '../components/EmptyStateArt'
import {
  AlertIcon,
  ArrowRightIcon,
  CheckIcon,
  InfoIcon,
  RefreshIcon,
  SearchIcon,
  UserIcon,
} from '../auth/icons'
import { fetchMedicalGuidance, fetchTrip } from './api'
import type { MedicalGuidanceView, Trip, TravellerGuidance, VaccinationGuidance } from './api'
import { DestinationGate } from './DestinationGate'

type Load =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'loaded'; trip: Trip; view: MedicalGuidanceView }

const STATUS: Record<VaccinationGuidance['status'], { badge: string; label: string; icon: ReactNode }> = {
  required: { badge: 'badge-warning', label: 'Required', icon: <AlertIcon /> },
  already_had: { badge: 'badge-success', label: 'Already had', icon: <CheckIcon /> },
  recommended: { badge: 'badge-neutral', label: 'Recommended', icon: <InfoIcon /> },
  unsuitable_in_pregnancy: { badge: 'badge-danger', label: 'Unsuitable in pregnancy', icon: <AlertIcon /> },
}

const Confirm = ({ note }: { note: string }) => (
  <p className="confirm">
    <InfoIcon />
    <span>{note}</span>
  </p>
)

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="stack stack-sm">
    <h3 className="section-title">
      <InfoIcon />
      {title}
    </h3>
    {children}
  </div>
)

const List = ({ items, empty }: { items: string[]; empty: string }) => (
  <ul className="plain-list">
    {(items.length ? items : [empty]).map((item) => (
      <li key={item}>{item}</li>
    ))}
  </ul>
)

function TravellerCard({ row }: { row: TravellerGuidance }) {
  const id = `guidance-${row.traveller_id ?? 'owner'}`
  return (
    <section className="card stack" aria-labelledby={id}>
      <div className="stack stack-sm">
        <h2 id={id}>
          <UserIcon />
          {row.name}
        </h2>
        <p className="text-sm text-muted">
          Lives in {row.residence || 'an unknown country'}, {row.citizenship || 'unknown'} citizen
        </p>
      </div>
      {row.result === 'no_data' && (
        <div className="empty-state" role="status">
          <EmptyStateArt />
          <SearchIcon />
          <h2>No data for this route</h2>
          <p>No data for this route. Check the official government site for your citizenship and destination.</p>
          {row.official_site_url && (
            <a
              className="btn btn-secondary"
              href={row.official_site_url}
              target="_blank"
              rel="noopener"
            >
              <ArrowRightIcon />
              Official government travel site
            </a>
          )}
        </div>
      )}
      {row.result === 'none_required' && (
        <div className="alert alert-success stack stack-sm" role="status">
          <p className="alert-title">No medical requirements apply to this trip</p>
        </div>
      )}
      {row.result === 'guidance' && (
        <>
          <Section title="Medical tests">
            <List items={row.tests} empty="No tests required for your route" />
          </Section>
          <Section title="Vaccinations">
            {row.vaccinations.length === 0 ? (
              <p className="text-muted">No vaccinations for your route.</p>
            ) : (
              <table className="vax">
                <thead>
                  <tr>
                    <th scope="col">Vaccination</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {row.vaccinations.map((v) => {
                    const s = STATUS[v.status]
                    return (
                      <tr key={v.name}>
                        <td>{v.name}</td>
                        <td>
                          <span className={`badge ${s.badge}`}>
                            {s.icon}
                            {s.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Section>
          <Section title="Health advisories">
            <List items={row.advisories} empty="No advisories for your route" />
            {!row.health_details_given && (
              <p className="text-sm text-muted">
                {row.traveller_id
                  ? `${row.name} hasn't`
                  : "You haven't"}{' '}
                added health details, so you see the general advisories only.
              </p>
            )}
          </Section>
        </>
      )}
      <Confirm note={row.confirm_note} />
    </section>
  )
}

/** Owner only: tests, vaccinations and advisories for each traveller on the trip. */
export function MedicalGuidancePage() {
  const { tripId = '' } = useParams()
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let current = true
    Promise.all([fetchTrip(tripId), fetchMedicalGuidance(tripId)]).then(
      ([trip, view]) => current && setLoad({ status: 'loaded', trip, view }),
      () => current && setLoad({ status: 'failed' }),
    )
    return () => {
      current = false
    }
  }, [tripId, attempt])

  const reload = () => {
    setLoad({ status: 'loading' })
    setAttempt((n) => n + 1)
  }

  if (load.status === 'loading')
    return (
      <div className="stack stack-lg" role="status" aria-label="Loading" aria-busy="true">
        <div className="card stack">
          <span className="skeleton" />
          <span className="skeleton" />
          <span className="skeleton" />
        </div>
        <div className="card stack">
          <span className="skeleton" />
          <span className="skeleton" />
        </div>
      </div>
    )
  if (load.status === 'failed')
    return (
      <div className="alert alert-danger" role="alert">
        <p>We couldn't load the medical guidance. Try again.</p>
        <button className="btn btn-secondary" type="button" onClick={reload}>
          <RefreshIcon />
          Retry
        </button>
      </div>
    )

  const { trip, view } = load
  return (
    <div className="stack stack-lg">
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link to="/trips">Trips</Link>
          </li>
          <li>
            <Link to={`/trips/${encodeURIComponent(trip.id)}`}>{trip.name}</Link>
          </li>
          <li aria-current="page">Medical guidance</li>
        </ol>
      </nav>
      <div className="stack stack-sm">
        <h1>
          {view.destination ? `Medical guidance for ${view.destination.country}` : 'Medical guidance'}
        </h1>
        <p className="text-muted">
          Based on each traveller's residence, citizenship and health details.
        </p>
      </div>
      <DestinationGate tripId={trip.id} destination={view.destination} status={view.status}>
        <div className="stack stack-lg" aria-live="polite">
          {view.travellers.map((row) => (
            <TravellerCard key={row.traveller_id ?? 'owner'} row={row} />
          ))}
        </div>
      </DestinationGate>
      <p>
        <Link to="/account">Update health details in your profile</Link>
      </p>
    </div>
  )
}
