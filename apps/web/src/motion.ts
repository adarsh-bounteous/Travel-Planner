/** Motion tokens from design-system/tokens.css, as var() references for inline styles. */
export const MOTION = {
  durationFast: 'var(--motion-duration-fast)',
  durationBase: 'var(--motion-duration-base)',
  durationSlow: 'var(--motion-duration-slow)',
  easeOut: 'var(--motion-ease-out)',
  easeInOut: 'var(--motion-ease-in-out)',
  distance: 'var(--motion-distance)',
} as const

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}
