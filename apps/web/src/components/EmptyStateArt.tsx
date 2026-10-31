import { ImageFrame } from './ImageFrame'

/** Decorative generic illustration shown first inside every empty state. */
export function EmptyStateArt() {
  return (
    <div className="empty-state-art">
      <ImageFrame ratio="16/9" illustration={{}} />
    </div>
  )
}
