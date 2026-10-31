import type { ReactNode } from 'react'
import type { IllustrationRef } from '../illustrations/registry'
import { ImageFrame } from './ImageFrame'

type HeroImageProps = {
  illustration: IllustrationRef
  /** Describes the art for screen readers; never empty. */
  alt: string
  /** Title and dates, laid over the image on a scrim. */
  children: ReactNode
}

/** A 16:9 illustration with its text on a scrim above the image. */
export function HeroImage({ illustration, alt, children }: HeroImageProps) {
  return (
    <div className="hero">
      <ImageFrame ratio="16/9" alt={alt} illustration={illustration} />
      <div className="scrim" aria-hidden="true" />
      <div className="hero-text">{children}</div>
    </div>
  )
}
