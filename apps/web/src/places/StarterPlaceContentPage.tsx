import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowLeftIcon, BedIcon, MapPinIcon, ShieldIcon, StarIcon, UtensilsIcon } from '../auth/icons'
import { fetchStarterPlace } from './starterApi'
import type { SampleItem, StarterPlaceContent } from './starterApi'
import { STARTER_PLAN_PATH } from './StarterPlannerPage'

type Load = { status: 'loading' } | { status: 'failed' } | { status: 'loaded'; content: StarterPlaceContent }

function Items({ items }: { items: (SampleItem & { aside?: string })[] }) {
  return (
    <ul className="items">
      {items.map((item) => (
        <li key={item.name}>
          <div>
            <div className="name">{item.name}</div>
            <div className="text-muted text-sm">{item.note}</div>
          </div>
          {item.aside && <span className="stay-price">{item.aside}</span>}
        </li>
      ))}
    </ul>
  )
}

export function StarterPlaceContentPage() {
  const { country = '', place = '' } = useParams()
  const [load, setLoad] = useState<Load>({ status: 'loading' })

  useEffect(() => {
    let active = true
    setLoad({ status: 'loading' })
    fetchStarterPlace(country, place).then(
      (content) => active && setLoad({ status: 'loaded', content }),
      () => active && setLoad({ status: 'failed' }),
    )
    return () => {
      active = false
    }
  }, [country, place])

  return (
    <div className="planner stack stack-lg">
      <div className="stack stack-sm">
        <Link className="back" to={STARTER_PLAN_PATH} state={{ country, place }}>
          <ArrowLeftIcon />
          Back to trip
        </Link>
        <h2>
          <MapPinIcon />
          {place}
        </h2>
        <nav aria-label="Breadcrumb">
          <ol className="crumbs">
            <li>Destinations</li>
            <li>{country}</li>
            <li aria-current="page">{place}</li>
          </ol>
        </nav>
      </div>
      {load.status === 'loading' && (
        <div className="stack" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div className="card stack stack-sm" key={i}>
              <span className="skeleton skeleton-title" />
              <span className="skeleton" />
              <span className="skeleton" />
            </div>
          ))}
        </div>
      )}
      {load.status === 'failed' && (
        <div className="alert alert-danger" role="alert">
          <p className="alert-title">We couldn't load this place's content.</p>
          <p>Check your connection and try again.</p>
        </div>
      )}
      {load.status === 'loaded' && (
        <div className="stack">
          <section className="card stack">
            <h3>
              <MapPinIcon />
              Sample places
            </h3>
            <Items items={load.content.places} />
          </section>
          <section className="card stack">
            <h3>
              <UtensilsIcon />
              Sample restaurants
            </h3>
            <Items items={load.content.restaurants} />
          </section>
          <section className="card stack">
            <h3>
              <BedIcon />
              Sample stays
            </h3>
            <Items
              items={load.content.stays.map((stay) => ({
                ...stay,
                aside: `${new Intl.NumberFormat(undefined, { style: 'currency', currency: stay.currency }).format(stay.price_per_night)} / night`,
              }))}
            />
          </section>
          <section className="card stack">
            <h3>
              <StarIcon />
              Sample activities
            </h3>
            <Items items={load.content.activities} />
          </section>
          <section className="card stack">
            <h3>
              <ShieldIcon />
              Medical guidance
            </h3>
            <p>{load.content.medical_guidance}</p>
          </section>
        </div>
      )}
    </div>
  )
}
