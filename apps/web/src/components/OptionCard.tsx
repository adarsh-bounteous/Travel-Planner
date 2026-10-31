import type { ReactNode } from 'react'
import { InfoIcon, ListIcon } from '../auth/icons'

type OptionCardProps = {
  /** Rendered as the card heading. */
  title: ReactNode
  badges?: ReactNode
  /** Muted facts under the heading. */
  meta?: ReactNode
  /** Leading icon from the icon set for the facts row. */
  metaIcon?: ReactNode
  /** Right-hand price block; stacks under the facts on phones. */
  price?: ReactNode
  /** Footer row of buttons or links. */
  actions?: ReactNode
  picked?: boolean
  /** Falls back to the title when that is a string. */
  ariaLabel?: string
  as?: 'article' | 'li'
  /** Extra body content, such as per-provider offers. */
  children?: ReactNode
}

/** The one look for every option in a list: title and badges, facts, price, then actions. */
export function OptionCard({
  title,
  badges,
  meta,
  metaIcon = <InfoIcon />,
  price,
  actions,
  picked = false,
  ariaLabel,
  as: Tag = 'article',
  children,
}: OptionCardProps) {
  const label = ariaLabel ?? (typeof title === 'string' ? title : undefined)
  return (
    <Tag className={`card option-card${picked ? ' is-picked' : ''}`} aria-label={Tag === 'article' ? label : undefined}>
      <div className="option-card-head">
        <h3 className="option-card-title">
          <ListIcon />
          {title}
        </h3>
        {badges && <div className="badges option-card-badges">{badges}</div>}
      </div>
      {meta && (
        <div className="option-card-meta">
          {metaIcon}
          <span>{meta}</span>
        </div>
      )}
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
