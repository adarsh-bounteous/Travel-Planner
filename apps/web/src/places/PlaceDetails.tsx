import { XIcon } from '../auth/icons'
import { Overlay } from '../trips/Overlay'
import type { Place } from './api'

/** What a real place's provider says about it. Never a rating, price or photo: OpenStreetMap has none. */
export function PlaceDetails({ place, onClose }: { place: Place; onClose: () => void }) {
  const url = place.url?.startsWith('https://') ? place.url : null
  return (
    <Overlay kind="drawer" labelledBy="place-details-title" onClose={onClose}>
      <div className="stack">
        <h2 id="place-details-title">{place.name}</h2>
        <dl className="stack">
          {place.address && (
            <div>
              <dt className="text-sm text-muted">Address</dt>
              <dd>{place.address}</dd>
            </div>
          )}
          <div>
            <dt className="text-sm text-muted">Coordinates</dt>
            <dd>{`${place.lat}, ${place.lng}`}</dd>
          </div>
          {place.provider_id && (
            <div>
              <dt className="text-sm text-muted">Provider id</dt>
              <dd>{place.provider_id}</dd>
            </div>
          )}
          {url && (
            <div>
              <dt className="text-sm text-muted">OpenStreetMap</dt>
              <dd>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {url.replace('https://', '')}
                </a>
              </dd>
            </div>
          )}
          {place.opening_hours && (
            <div>
              <dt className="text-sm text-muted">Opening hours</dt>
              <dd>{place.opening_hours}</dd>
            </div>
          )}
        </dl>
        <div>
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            <XIcon />
            Close
          </button>
        </div>
      </div>
    </Overlay>
  )
}
