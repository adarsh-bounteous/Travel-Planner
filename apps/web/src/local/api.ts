export type LocalModeErrorCode = 'local_mode_not_allowed' | 'unknown'

export class LocalModeError extends Error {
  readonly code: LocalModeErrorCode
  constructor(code: LocalModeErrorCode) {
    super(code)
    this.code = code
  }
}

/** Asks the API to turn local mode on or off; resolves to the mode now in effect. */
export async function requestLocalMode(on: boolean): Promise<boolean> {
  const response = await fetch('/local/mode', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ local_mode: on }),
  })
  if (response.ok) return (await response.json()).local_mode === true
  const data = await response.json().catch(() => ({}))
  throw new LocalModeError(data.code === 'local_mode_not_allowed' ? data.code : 'unknown')
}
