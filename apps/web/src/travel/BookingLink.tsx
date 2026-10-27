import type { ReactNode } from 'react'
import { Link } from 'react-router'

export const LOCAL_BOOKING_PREFIX = 'local://booking/'

export const isLocalBooking = (url: string) => url.startsWith(LOCAL_BOOKING_PREFIX)

type Props = { url: string; className?: string; children: ReactNode }

/** The one place that decides where a booking link goes: a local link opens the pretend page in the app, anything else the provider's site. */
export function BookingLink({ url, className, children }: Props) {
  if (isLocalBooking(url))
    return (
      <Link className={className} to={`/explore/travel/booking?ref=${encodeURIComponent(url)}`}>
        {children}
      </Link>
    )
  return (
    <a className={className} href={url} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}
