import { CheckIcon, InfoIcon, SearchIcon } from '../auth/icons'
import { OptionCard } from '../components/OptionCard'
import { BookingLink } from '../travel/BookingLink'
import type { VisaProviderOption } from './api'
import { formatMoney } from './money'
import { safeHref } from './safeHref'

/** One visa provider on the shortlist: its source, fee, processing time and offers, and a link to its booking page. */
export function VisaProviderCard({ option, primary }: { option: VisaProviderOption; primary: boolean }) {
  const href = safeHref(option.url)
  return (
    <OptionCard
      title={option.name}
      badges={
        option.source === 'partner' ? (
          <span className="badge badge-success">
            <CheckIcon />
            Partner API
          </span>
        ) : (
          <span className="badge badge-neutral">
            <SearchIcon />
            Web search
          </span>
        )
      }
      actions={
        href ? (
          <BookingLink url={href} className={`btn ${primary ? 'btn-primary' : 'btn-secondary'}`}>
            Pick and book
          </BookingLink>
        ) : (
          <p className="text-sm">
            <InfoIcon /> No booking link is available for this option.
          </p>
        )
      }
    >
      <dl className="provider-facts">
        <div>
          <dt>Service fee</dt>
          <dd>{formatMoney(Number(option.fee), option.currency)}</dd>
        </div>
        <div>
          <dt>Processing</dt>
          <dd>{`${option.processing_days} working days`}</dd>
        </div>
        <div>
          <dt>Offers</dt>
          <dd>{option.offers ?? 'None'}</dd>
        </div>
      </dl>
    </OptionCard>
  )
}
