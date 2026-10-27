import { AlertIcon, InfoIcon } from '../auth/icons'

/** Always shown with plans: the app compares cover, it never sells or advises on it. */
export function InsuranceDisclaimer() {
  return (
    <div className="alert alert-info cluster" role="note">
      <InfoIcon />
      This app only compares plans. It does not sell or advise on cover.
    </div>
  )
}

/** Shown when a provider's site could not be opened; a picked plan stays picked. */
export function ProviderUnavailable({ picked }: { picked: boolean }) {
  return (
    <div className="alert alert-danger cluster" role="alert">
      <AlertIcon />
      <div>
        <div className="alert-title">Provider site unavailable</div>
        {picked
          ? "The provider's site could not be opened. Your plan is still picked."
          : "The provider's site could not be opened. Try again."}
      </div>
    </div>
  )
}
