import type { ReactNode } from 'react'
import { illustrationAlt, type IllustrationRef } from '../illustrations/registry'
import { ImageFrame } from './ImageFrame'

type Props = {
  illustration: IllustrationRef
  /** The page's h1; give it className="hero-title" so it sits on the scrim. */
  title: ReactNode
  dates?: string
  variant?: 'hero' | 'cover'
}

/** Art with the title and dates over a token-built scrim. The art has alt text; the scrim is decoration. */
export function ImageHero({ illustration, title, dates, variant = 'hero' }: Props) {
  return (
    <div className={variant === 'cover' ? 'hero hero-cover' : 'hero'}>
      <ImageFrame ratio="16/9" alt={illustrationAlt(illustration)} illustration={illustration} />
      <div className="scrim" aria-hidden="true" />
      {title}
      {dates && <p className="hero-dates">{dates}</p>}
    </div>
  )
}
