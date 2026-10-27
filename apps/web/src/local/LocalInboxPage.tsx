import { useEffect, useState } from 'react'

type Message = { to: string; trip_name: string; link: string; kind?: 'confirmation' | 'email_change' | 'invite' }
type Load = { state: 'loading' } | { state: 'unavailable' } | { state: 'ready'; messages: Message[] }

/** Local mode's stand-in for email delivery: shows what would have been sent. Public, like the API route. */
export function LocalInboxPage() {
  const [load, setLoad] = useState<Load>({ state: 'loading' })

  useEffect(() => {
    fetch('/local/inbox', { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('unavailable'))))
      .then(
        (messages: Message[]) => setLoad({ state: 'ready', messages }),
        () => setLoad({ state: 'unavailable' }),
      )
  }, [])

  if (load.state === 'loading') return <span className="spinner" role="status" aria-label="Loading" />

  return (
    <div className="stack stack-lg narrow">
      <h1>Local inbox</h1>
      {load.state === 'unavailable' && <p>The local inbox is only available in local mode.</p>}
      {load.state === 'ready' && load.messages.length === 0 && <p>No emails yet.</p>}
      {load.state === 'ready' &&
        load.messages.map((message) => (
          <article key={message.link} className="card stack stack-sm">
            <h2>
              {message.kind === 'email_change' && 'Confirm your new email address'}
              {message.kind === 'confirmation' && 'Confirm your email'}
              {message.kind !== 'email_change' &&
                message.kind !== 'confirmation' &&
                `You're invited to plan ${message.trip_name}`}
            </h2>
            <p>
              To <strong>{message.to}</strong>
            </p>
            <a href={message.link}>{message.link}</a>
          </article>
        ))}
    </div>
  )
}
