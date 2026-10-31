import { ImageFrame } from './ImageFrame'

/** Neutral 16:9 art above an empty state's heading. Decorative, so hidden from screen readers. */
export function EmptyStateArt() {
  return <ImageFrame ratio="16/9" illustration={{}} />
}
