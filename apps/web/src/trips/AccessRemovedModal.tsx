import { Overlay } from './Overlay'

type AccessRemovedModalProps = {
  onOk: () => void
  text?: string
  action?: string
}

/** Shown over an open trip when access to it was removed: an editor's by default, or a viewer's via `text`. */
export function AccessRemovedModal({
  onOk,
  text = 'Your access to this trip was removed. Changes were not saved.',
  action = 'OK',
}: AccessRemovedModalProps) {
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
        <p id="access-removed-text">{text}</p>
        <div className="overlay-actions">
          <button className="btn btn-primary" type="button" onClick={onOk}>
            {action}
          </button>
        </div>
      </div>
    </Overlay>
  )
}
