import { useEffect, useState } from 'react'
import { greetingFor } from '../trips/tripCountdown'

/** Time-of-day greeting from the device clock, re-read every minute so it stays right on a long-open screen. */
export function WelcomeHeader({ subtitle, now }: { subtitle: string; now?: Date }) {
  const [clock, setClock] = useState(() => now ?? new Date())

  useEffect(() => {
    if (now) {
      setClock(now)
      return
    }
    const timer = setInterval(() => setClock(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [now])

  return (
    <div className="welcome">
      <h1 data-greeting>Good {greetingFor(clock)}</h1>
      <p className="text-muted">{subtitle}</p>
    </div>
  )
}
