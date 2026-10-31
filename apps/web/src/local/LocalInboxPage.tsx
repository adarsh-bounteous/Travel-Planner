import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { EmptyStateArt } from '../components/EmptyStateArt'
import {
  AlertIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BellIcon,
  ClockIcon,
  EyeIcon,
  SuitcaseIcon,
  UserIcon,
} from '../auth/icons'

type Message = {
  to: string
  trip_name: string
  link: string
  kind: 'confirmation' | 'email_change' | 'invite' | 'itinerary'
  subject: string
  sent_at: string
  /** The whole message, for an emailed itinerary. The other kinds are a link. */
  html?: string
}
type Load = { state: 'loading' } | { state: 'unavailable' } | { state: 'ready'; messages: Message[] }

const FROM = 'Travel Planner <no-reply@local.travel-planner>'

const KINDS = {
  confirmation: {
    badge: 'badge-neutral',
    badgeText: 'Sign-in',
    intro: 'Follow this link to confirm your sign-in.',
    action: 'Complete sign-in',
  },
  email_change: {
    badge: 'badge-neutral',
    badgeText: 'Email change',
    intro: 'Follow this link to confirm your new email address.',
    action: 'Confirm new email',
  },
  invite: {
    badge: 'badge-success',
    badgeText: 'Invite',
    intro: 'You have been invited to plan a trip. Follow this link to accept.',
    action: 'Accept invite',
  },
  itinerary: {
    badge: 'badge-neutral',
    badgeText: 'Itinerary',
    intro: '',
    action: '',
  },
}

function EmailView({ message, onBack }: { message: Message; onBack: () => void }) {
  const kind = KINDS[message.kind]
  const sent = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(message.sent_at),
  )
  return (
    <div className="inbox-col stack">
      <div>
        <button className="btn btn-ghost btn-sm" type="button" onClick={onBack}>
          <ArrowLeftIcon />
          Back to inbox
        </button>
      </div>
      <h2>
        <BellIcon />
        {message.subject}
      </h2>
      <div className="alert alert-info" role="status">
        Pretend email. Nothing was sent to {message.to}.
      </div>
      <div className="mail-sheet">
        <dl className="mail-meta">
          <dt>
            <UserIcon />
            From
          </dt>
          <dd>{FROM}</dd>
          <dt>
            <BellIcon />
            To
          </dt>
          <dd>{message.to}</dd>
          <dt>
            <ClockIcon />
            Sent
          </dt>
          <dd>{sent}</dd>
        </dl>
        {message.html === undefined ? (
          <div className="mail-body">
            <p>{kind.intro}</p>
            <p>
              <a className="mail-link" href={message.link}>
                {message.link}
              </a>
            </p>
            <p className="text-muted text-sm">Each link works once and can expire.</p>
          </div>
        ) : (
          <iframe className="mail-frame" sandbox="" title={message.subject} srcDoc={message.html} />
        )}
      </div>
      {message.html === undefined && (
        <div className="cluster">
          <a className="btn btn-primary" href={message.link}>
            <ArrowRightIcon />
            {kind.action}
          </a>
        </div>
      )}
    </div>
  )
}

/** Local mode's stand-in for email delivery: shows what would have been sent. Public, like the API route. */
export function LocalInboxPage() {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    fetch('/local/inbox', { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('unavailable'))))
      .then(
        (messages: Message[]) => setLoad({ state: 'ready', messages }),
        () => setLoad({ state: 'unavailable' }),
      )
  }, [])

  if (load.state === 'loading') return <span className="spinner" role="status" aria-label="Loading" />

  if (load.state === 'unavailable')
    return (
      <div className="inbox-col stack">
        <div className="empty-state">
          <EmptyStateArt />
          <AlertIcon />
          <h2>This page is not available</h2>
          <p>The local inbox only exists when local mode is on. Head back to your trips.</p>
          <Link className="btn btn-primary" to="/">
            <SuitcaseIcon />
            Go to Trips
          </Link>
        </div>
      </div>
    )

  const open = load.messages.find((message) => message.link === selected)
  if (open) return <EmailView message={open} onBack={() => setSelected(null)} />

  return (
    <div className="inbox-col stack">
      <div className="alert alert-info" role="status">
        <span className="alert-title">Local mode is on.</span> These emails were not sent anywhere. Open one
        to follow its link.
      </div>
      <h1>Emails</h1>
      {load.messages.length === 0 ? (
        <div className="empty-state">
          <EmptyStateArt />
          <BellIcon />
          <h2>No emails have been generated yet</h2>
          <p>Sign in or invite someone to a trip and the email will show up here.</p>
        </div>
      ) : (
        <div className="stack">
          {load.messages.map((message) => (
            <div key={message.link} className="card mail-row">
              <div className="row-between">
                <h3>
                  <BellIcon />
                  {message.subject}
                </h3>
                <span className={`badge ${KINDS[message.kind].badge}`}>{KINDS[message.kind].badgeText}</span>
              </div>
              <p className="text-muted text-sm">To {message.to}</p>
              <div>
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  onClick={() => setSelected(message.link)}
                >
                  <EyeIcon />
                  Open email
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
