export type MainSection = 'trips' | 'explore'

// Bookings and Budget are added here when their screens exist.
export const MAIN_SECTIONS: { id: MainSection; label: string; to: string }[] = [
  { id: 'trips', label: 'Trips', to: '/' },
  { id: 'explore', label: 'Explore', to: '/explore' },
]

// The main section a screen sits under, or null for screens under none (Saved, Account, Profile).
export function mainSectionFor(pathname: string): MainSection | null {
  if (pathname === '/' || pathname === '/trips' || pathname.startsWith('/trips/')) return 'trips'
  if (pathname === '/explore' || pathname.startsWith('/explore/') || pathname === '/destinations')
    return 'explore'
  return null
}
