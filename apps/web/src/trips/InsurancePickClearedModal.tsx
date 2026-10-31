import { CheckIcon } from '../auth/icons'
import { Overlay } from './Overlay'

/** Shown after a change to destination, dates or travellers removed the insurance pick. */
export function InsurancePickClearedModal({ onOk }: { onOk: () => void }) {
  return (
    <Overlay
      kind="modal"
      role="alertdialog"
      labelledBy="insurance-cleared-title"
      describedBy="insurance-cleared-text"
      onClose={onOk}
    >
      <div className="stack stack-lg">
        <h2 id="insurance-cleared-title">Insurance pick cleared</h2>
        <p id="insurance-cleared-text">
          Trip details changed. Your insurance pick was cleared. Choose an insurance plan again.
        </p>
        <div className="overlay-actions">
          <button className="btn btn-primary" type="button" onClick={onOk}>
            <CheckIcon />
            OK
          </button>
        </div>
      </div>
    </Overlay>
  )
}
