import { AlertIcon } from '../auth/icons'

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p className="field-error cluster" id={id} role="alert">
      <AlertIcon />
      <span>{message}</span>
    </p>
  )
}
