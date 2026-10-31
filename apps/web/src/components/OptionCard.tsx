import type { ReactNode } from 'react'
import type { IllustrationRef } from '../illustrations/registry'
import { ImageFrame } from './ImageFrame'

type OptionCardProps = {
  /** Rendered as the card heading. */
  title: ReactNode
  badges?: ReactNode
  /** Muted facts under the heading. */
  meta?: ReactNode
  /** Right-hand price block; stacks under the facts on phones. */
  price?: ReactNode
  /** Footer row of buttons or links. */
  actions?: ReactNode
  picked?: boolean
  /** Falls back to the title when that is a string. */
  ariaLabel?: string
  as?: 'article' | 'li'
  /** Decorative 16:9 art at the top of the card; omit for options with no place type. */
  illustration?: IllustrationRef
  /** Extra body content, such as per-provider offers. */
  children?: ReactNode
}

/** The one look for every option in a list: title and badges, facts, price, then actions. */
export function OptionCard({
  title,
  badges,
  meta,
  price,
  actions,
  picked = false,
  ariaLabel,
  as: Tag = 'article',
  illustration,
  children,
}: OptionCardProps) {
  const label = ariaLabel ?? (typeof title === 'string' ? title : undefined)
  return (
    <Tag className={`card option-card${picked ? ' is-picked' : ''}`} aria-label={Tag === 'article' ? label : undefined}>
      {illustration && <ImageFrame ratio="16/9" illustration={illustration} />}
      <div className="option-card-head">
        <h3 className="option-card-title">{title}</h3>
        {badges && <div className="badges option-card-badges">{badges}</div>}
      </div>
      {meta && <div className="option-card-meta">{meta}</div>}
      {(children || price) && (
        <div className="option-card-body">
          {children && <div className="option-card-facts">{children}</div>}
          {price && <div className="option-card-price">{price}</div>}
        </div>
      )}
      {actions && <div className="option-card-actions">{actions}</div>}
    </Tag>
  )
}
