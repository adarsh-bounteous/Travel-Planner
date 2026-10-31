import { useEffect, useState, type CSSProperties } from 'react'
import { illustrationLoaders, resolveIllustration, type IllustrationRef } from '../illustrations/registry'

export type Ratio = '16/9' | '4/3' | '1/1'

export type ImageFrameProps = {
  ratio: Ratio
  /** Absent or empty: the image is hidden from screen readers. */
  alt?: string
  /** When set, replaces the illustration in the same frame. */
  photo?: { src: string; alt?: string; placeholder?: string }
  illustration: IllustrationRef
  /** Draws the scene inline, filled from the page's --pal-* colours (an <img> SVG cannot read them). */
  palette?: boolean
}

function PaletteScene({ ratio }: { ratio: Ratio }) {
  return (
    <div className="imgc is-loaded" style={{ '--ratio': ratio } as CSSProperties}>
      <svg
        className="imgc-img"
        role="img"
        aria-label="Illustration in the trip's palette"
        viewBox="0 0 320 180"
        preserveAspectRatio="xMidYMid slice"
      >
        <rect className="art-sky" width="320" height="180" />
        <circle className="art-sun" cx="236" cy="56" r="26" />
        <path className="art-hill" d="M0 120 C50 80 90 90 130 110 C170 130 220 70 320 105 L320 180 L0 180Z" />
        <path className="art-deep" d="M0 150 C60 125 120 140 180 150 C240 160 280 135 320 140 L320 180 L0 180Z" />
        <path className="art-line" d="M30 70 h40 M44 82 h52" />
      </svg>
    </div>
  )
}

export function ImageFrame({ palette, ...props }: ImageFrameProps) {
  return palette ? <PaletteScene ratio={props.ratio} /> : <PhotoFrame {...props} />
}

function PhotoFrame({ ratio, alt, photo, illustration }: Omit<ImageFrameProps, 'palette'>) {
  const key = resolveIllustration(illustration)
  const [art, setArt] = useState<{ key: string; url: string }>()
  const [loadedSrc, setLoadedSrc] = useState<string>()

  useEffect(() => {
    if (photo) return
    let cancelled = false
    illustrationLoaders[key]?.().then((url) => {
      if (!cancelled) setArt({ key, url })
    })
    return () => {
      cancelled = true
    }
  }, [key, photo])

  const src = photo ? photo.src : art?.key === key ? art.url : undefined
  const text = photo?.alt ?? alt
  const isLoaded = src !== undefined && loadedSrc === src
  const blurStyle = photo?.placeholder ? { backgroundImage: `url(${photo.placeholder})` } : undefined

  return (
    <div className={isLoaded ? 'imgc is-loaded' : 'imgc'} style={{ '--ratio': ratio } as CSSProperties}>
      <div className="imgc-blur" data-testid="image-placeholder" style={blurStyle} />
      {src && (
        <img
          className="imgc-img"
          src={src}
          alt={text || ''}
          aria-hidden={text ? undefined : true}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoadedSrc(src)}
        />
      )}
    </div>
  )
}
