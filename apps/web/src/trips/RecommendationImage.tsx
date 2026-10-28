import { useState } from 'react'

export const PLACEHOLDER_SRC = '/rec/placeholder.svg'

/** True for a path on the app's own origin; an absolute or protocol-relative URL names an outside host. */
export function isAppImage(src: string | undefined | null): src is string {
  return !!src && src.startsWith('/') && !src.startsWith('//')
}

type Props = {
  src?: string | null
  name: string
  /** Local mode: only images served by the app may be requested. */
  appOnly?: boolean
}

/** A recommendation's photo. In local mode it never requests an outside host and falls back to a neutral tile. */
export function RecommendationImage({ src, name, appOnly = false }: Props) {
  const [failed, setFailed] = useState(false)
  const usable = appOnly ? isAppImage(src) : !!src
  const placeholder = failed || !usable
  return (
    <div className="rec-img">
      <img
        src={placeholder ? PLACEHOLDER_SRC : (src as string)}
        alt={placeholder ? `No photo available for ${name}` : `${name} photo`}
        loading="lazy"
        onError={() => setFailed(true)}
      />
      {placeholder ? (
        <>
          <span className="badge badge-neutral rec-img-badge">Placeholder</span>
          <span className="rec-img-label">Photo not available</span>
        </>
      ) : (
        appOnly && <span className="badge badge-success rec-img-badge">Saved in app</span>
      )}
    </div>
  )
}
