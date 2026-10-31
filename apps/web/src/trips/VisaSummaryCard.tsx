import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { AlertIcon, ArrowRightIcon, MapPinIcon } from '../auth/icons'
import { fetchVisa } from './api'
import type { VisaResult } from './api'
import { VisaStatusBadge } from './VisaStatusBadge'

const incompleteNote = (names: string[]) =>
  names.length === 1
    ? `Plan incomplete: ${names[0]}'s visa is still unresolved`
    : `Plan incomplete: visas for ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} are still unresolved`

/** Each traveller's visa verdict at a glance, with the plan-incomplete note while a visa is unresolved. */
export function VisaSummaryCard({ tripId, unresolved }: { tripId: string; unresolved: string[] }) {
  const [rows, setRows] = useState<VisaResult[] | null>(null)

  useEffect(() => {
    let current = true
    fetchVisa(tripId).then(
      (view) => current && setRows(view.travellers),
      () => current && setRows([]),
    )
    return () => {
      current = false
    }
  }, [tripId])

  return (
    <section className="card stack stack-sm" aria-labelledby="visa-heading">
      <h3 id="visa-heading">
        <MapPinIcon />
        Visa
      </h3>
      {rows === null ? (
        <div role="status" aria-label="Loading visa">
          <span className="skeleton" />
          <span className="skeleton" />
        </div>
      ) : (
        rows.map(
          (row) =>
            row.status && (
              <div className="visa-row" key={row.traveller_id ?? 'owner'}>
                <span>{row.name}</span>
                <VisaStatusBadge
                  status={row.status}
                  label={row.unresolved ? 'Unresolved' : undefined}
                />
              </div>
            ),
        )
      )}
      {unresolved.length > 0 && (
        <span className="badge badge-warning" role="status">
          <AlertIcon />
          {incompleteNote(unresolved)}
        </span>
      )}
      <div>
        <Link className="btn btn-primary" to={`/trips/${encodeURIComponent(tripId)}/visa-requirements`}>
          <ArrowRightIcon />
          Visa requirements
        </Link>
      </div>
    </section>
  )
}
