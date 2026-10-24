import { Overlay } from './Overlay'

/** Shown over an open trip when the owner has removed this editor's access. */
export function AccessRemovedModal({ onOk }: { onOk: () => void }) {
  return (
    <Overlay
      kind="modal"
      role="alertdialog"
      labelledBy="access-removed-title"
      describedBy="access-removed-text"
      onClose={onOk}
    >
      <div className="stack stack-lg">
        <h2 id="access-removed-title">Access removed</h2>
        <p id="access-removed-text">
          Your access to this trip was removed. Changes were not saved.
        </p>
        <div className="overlay-actions">
          <button className="btn btn-primary" type="button" onClick={onOk}>
            OK
          </button>
        </div>
      </div>
    </Overlay>
  )
}
