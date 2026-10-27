import { Link } from 'react-router'
import { DestinationSearch } from '../places/DestinationSearch'

export function ExplorePage() {
  return (
    <div className="stack">
      <h1>Explore</h1>
      <DestinationSearch />
      <div>
        <Link className="btn btn-secondary" to="/explore/travel">
          Search stays, flights and transport
        </Link>
      </div>
    </div>
  )
}
