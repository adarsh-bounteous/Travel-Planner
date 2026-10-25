import type { CompanionDetailsInput } from './api'
import { COUNTRIES, SELECT_QUESTIONS } from './profileQuestions'

export type CompanionKey = keyof CompanionDetailsInput

export const COMPANION_FIELDS: {
  key: CompanionKey
  label: string
  hint: string
  placeholder: string
  options: string[]
  error: string
}[] = [
  {
    key: 'citizenship',
    label: 'Citizenship',
    hint: "The passport they'll travel on.",
    placeholder: 'Choose a country',
    options: COUNTRIES,
    error: 'Enter citizenship',
  },
  {
    key: 'residence',
    label: 'Residence',
    hint: 'Where they live now.',
    placeholder: 'Choose a country',
    options: COUNTRIES,
    error: 'Enter residence',
  },
  {
    key: 'health_status',
    label: 'Health status',
    hint: 'Choose "No health needs to share" if there is nothing to share.',
    placeholder: 'Choose one',
    options: SELECT_QUESTIONS.health_status.options,
    error: 'Enter health status',
  },
]

/** One message per blank field; all three are required before the details are saved. */
export const companionErrors = (
  values: CompanionDetailsInput,
): Partial<Record<CompanionKey, string>> => {
  const errors: Partial<Record<CompanionKey, string>> = {}
  for (const field of COMPANION_FIELDS) if (!values[field.key].trim()) errors[field.key] = field.error
  return errors
}
