import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeftIcon, InfoIcon, ListIcon } from '../auth/icons'
import {
  fetchLocalMode,
  fetchProviderStatuses,
  LocalModeNotAllowedError,
  ProvidersNotAllowedError,
  ProvidersUnavailableError,
  setLocalMode,
  type ProviderStatus,
} from '../travel/api'

export function healthBadge(health: string): string {
  switch (health) {
    case 'healthy':
      return 'badge-success'
    case 'degraded':
      return 'badge-warning'
    case 'open circuit':
    case 'not configured':
      return 'badge-danger'
    default:
      return 'badge-neutral'
  }
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

type Providers = ProviderStatus[] | 'loading' | 'refused' | 'local mode off' | 'failed'

function ProviderList({ providers }: { providers: Providers }) {
  if (providers === 'loading')
    return (
      <div className="stack stack-sm" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div className="card" key={i}>
            <span className="skeleton" />
          </div>
        ))}
      </div>
    )
  if (providers === 'failed')
    return (
      <div className="alert alert-danger" role="alert">
        The provider list could not be loaded. Reload the page to try again.
      </div>
    )
  if (providers === 'refused') return null
  if (providers === 'local mode off')
    return <p className="field-hint">Turn local mode on to see the registered providers.</p>
  if (providers.length === 0)
    return (
      <div className="empty-state">
        <InfoIcon />
        <h2>No providers are registered.</h2>
        <p>Register a provider in your local configuration, then reload this page.</p>
      </div>
    )
  return (
    <div className="stack stack-sm" role="list" aria-label="Registered providers">
      {providers.map((provider) => (
        <div className="card provider-row" role="listitem" key={provider.name}>
          <div className="provider-name">
            <strong>{provider.name}</strong>
            <span className="provider-kind">{provider.kind}</span>
          </div>
          <span className={`badge provider-health ${healthBadge(provider.health)}`}>
            <span className="dot" aria-hidden="true" />
            {capitalise(provider.health)}
          </span>
        </div>
      ))}
    </div>
  )
}

/** The shared local mode switch. A live deployment refuses On, so the switch stays Off. */
export function LocalModePage() {
  const [on, setOn] = useState<boolean | null>(null)
  const [refused, setRefused] = useState(false)
  const [providers, setProviders] = useState<Providers>('loading')

  useEffect(() => {
    fetchLocalMode().then(
      (mode) => setOn(mode.local_mode),
      () => setOn(false),
    )
    fetchProviderStatuses().then(setProviders, (error) =>
      setProviders(
        error instanceof ProvidersNotAllowedError
          ? 'refused'
          : error instanceof ProvidersUnavailableError
            ? 'local mode off'
            : 'failed',
      ),
    )
  }, [])

  const choose = async (wanted: boolean) => {
    setRefused(false)
    try {
      setOn((await setLocalMode(wanted)).local_mode)
    } catch (error) {
      if (error instanceof LocalModeNotAllowedError) {
        setOn(false)
        setRefused(true)
      }
    }
  }

  if (providers === 'refused')
    return (
      <div className="inbox-col stack">
        <h1>Access refused</h1>
        <div className="alert alert-danger" role="alert">
          This page is for developers only.
        </div>
      </div>
    )

  if (on === null) return <span className="spinner" role="status" aria-label="Loading" />

  return (
    <div className="inbox-col stack">
      <h1>Local mode</h1>
      <fieldset className="stack stack-sm" aria-describedby="local-mode-hint">
        <legend className="field-label">Use local stand-ins for travel search</legend>
        <label className="check">
          <input
            className="radio"
            type="radio"
            name="local-mode"
            checked={on}
            onChange={() => void choose(true)}
          />
          On
        </label>
        <label className="check">
          <input
            className="radio"
            type="radio"
            name="local-mode"
            checked={!on}
            onChange={() => void choose(false)}
          />
          Off
        </label>
        <span className="field-hint" id="local-mode-hint">
          On: stays, flights and transport are generated locally. Off: results come from the real provider.
        </span>
      </fieldset>
      {refused && (
        <div className="alert alert-danger" role="alert">
          <span className="alert-title">Local mode is not allowed in live deployments.</span> The switch stays
          Off.
        </div>
      )}
      <section className="stack stack-sm" aria-labelledby="providers-title">
        <h2 id="providers-title">
          <ListIcon />
          Registered providers
        </h2>
        <ProviderList providers={providers} />
      </section>
      <div className="cluster">
        <Link className="btn btn-secondary" to="/explore/travel">
          <ArrowLeftIcon />
          Back to search
        </Link>
      </div>
    </div>
  )
}
