export const COVER_VARIANTS = 4

/** A stable variant number from a place id, so a place keeps the same colours everywhere. */
export function coverVariant(seed: string): number {
  let hash = 0
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash % COVER_VARIANTS
}

/** A decorative colour-gradient cover: local, so no photo is ever requested. It carries no text. */
export function PlaceCover({ seed }: { seed: string }) {
  return <div className={`cover cover-${coverVariant(seed)}`} aria-hidden="true" data-testid="place-cover" />
}
