// The route between two stops, drawn in a 48x48 box. public/favicon.svg and public/brand/logo.svg
// carry the same path; a test keeps them in step.
export const MARK_PATH = 'M12 34 C 18 14, 26 40, 35 15'

type BrandLogoProps = {
  /** md: header and document. lg: sign-in and 404. */
  size?: 'md' | 'lg'
  /** For use on a --color-primary background. */
  inverse?: boolean
  label?: string
}

/** Mark plus wordmark. Wrap it in a Link where it must navigate. */
export function BrandLogo({ size = 'md', inverse = false, label = 'Travel Planner' }: BrandLogoProps) {
  const classes = ['brand-logo', size === 'lg' && 'brand-logo-lg', inverse && 'brand-logo-inv']
    .filter(Boolean)
    .join(' ')
  return (
    <span className={classes} role="img" aria-label={label}>
      <svg className="brand-mark" viewBox="0 0 48 48" aria-hidden="true">
        <rect className="m-bg" width="48" height="48" rx="12" />
        <path className="m-line" d={MARK_PATH} />
        <circle className="m-dot" cx="12" cy="34" r="3.5" />
        <circle className="m-dot" cx="35" cy="15" r="4.5" />
      </svg>
      <span className="brand-word">
        Travel <b>Planner</b>
      </span>
    </span>
  )
}
