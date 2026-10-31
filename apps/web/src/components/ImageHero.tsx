import type { ReactNode } from 'react'
import { illustrationAlt, type IllustrationRef } from '../illustrations/registry'
import { ImageFrame } from './ImageFrame'

type Props = {
  illustration: IllustrationRef
  /** The page's h1; give it className="hero-title" so it sits on the scrim. */
  title: ReactNode
  dates?: string
  /** `palette`: a solid text panel beside art drawn in the page's --pal-* colours, no scrim. */
  variant?: 'hero' | 'cover' | 'palette'
}

/** Art with the title and dates over a token-built scrim. The art has alt text; the scrim is decoration. */
export function ImageHero({ illustration, title, dates, variant = 'hero' }: Props) {
  if (variant === 'palette')
    return (
      <div className="hero hero-palette">
        <div className="hero-text">
          {title}
          {dates && <p className="hero-dates">{dates}</p>}
        </div>
        <ImageFrame ratio="16/9" illustration={illustration} palette />
      </div>
    )
  return (
    <div className={variant === 'cover' ? 'hero hero-cover' : 'hero'}>
      <ImageFrame ratio="16/9" alt={illustrationAlt(illustration)} illustration={illustration} />
      <div className="scrim" aria-hidden="true" />
      {title}
      {dates && <p className="hero-dates">{dates}</p>}
    </div>
  )
}
