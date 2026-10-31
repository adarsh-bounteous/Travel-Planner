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
}

export function ImageFrame({ ratio, alt, photo, illustration }: ImageFrameProps) {
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
