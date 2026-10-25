import type { Profile } from './api'

export type ProfileQuestionKey =
  'citizenship' | 'residence' | 'health_status' | 'religion' | 'diet' | 'tastes' | 'travel_style'

export type ProfileAnswers = Partial<Record<ProfileQuestionKey, string | string[]>>

export const REQUIRED_QUESTIONS = ['citizenship', 'residence'] as const
export const OPTIONAL_QUESTIONS = [
  'health_status',
  'religion',
  'diet',
  'tastes',
  'travel_style',
] as const

const ORDER: ProfileQuestionKey[] = [
  'citizenship',
  'residence',
  'health_status',
  'religion',
  'diet',
  'tastes',
  'travel_style',
]

export const COUNTRIES = [
  'Australia',
  'Canada',
  'France',
  'Germany',
  'India',
  'Ireland',
  'Japan',
  'Portugal',
  'United Kingdom',
  'United States',
]

export const TASTES = ['Food', 'Museums', 'Nature', 'Nightlife', 'Shopping']

export const SELECT_QUESTIONS: Record<
  Exclude<ProfileQuestionKey, 'tastes'>,
  { label: string; hint?: string; placeholder: string; options: string[] }
> = {
  citizenship: {
    label: 'Citizenship',
    hint: "The passport you'll travel on. It decides visa advice.",
    placeholder: 'Choose a country',
    options: COUNTRIES,
  },
  residence: {
    label: 'Residence',
    hint: 'Where you live now. It shapes entry rules and prices.',
    placeholder: 'Choose a country',
    options: COUNTRIES,
  },
  health_status: {
    label: 'Health status',
    placeholder: 'Choose one',
    options: ['No health needs to share', 'Mobility needs', 'Chronic condition', 'Allergies'],
  },
  religion: {
    label: 'Religion',
    placeholder: 'Choose one',
    options: ['No religion', 'Buddhist', 'Christian', 'Hindu', 'Jewish', 'Muslim', 'Sikh', 'Other'],
  },
  diet: {
    label: 'Diet',
    placeholder: 'Choose one',
    options: ['No restrictions', 'Vegetarian', 'Vegan', 'Halal', 'Kosher', 'Gluten-free'],
  },
  travel_style: {
    label: 'Travel style',
    placeholder: 'Choose one',
    options: ['Relaxed', 'Adventurous', 'Cultural', 'Luxury', 'Budget'],
  },
}

export const REQUIRED_MESSAGES = {
  citizenship: 'Choose your citizenship to continue',
  residence: 'Choose your country of residence to continue',
}

const isGiven = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value.length > 0 : !!value

/** The questions with no saved answer. A field missing from an older profile counts as unanswered. */
export const unansweredQuestions = (saved: Partial<Profile>): ProfileQuestionKey[] =>
  ORDER.filter((key) => !isGiven(saved[key]))

/** Citizenship and residence must be saved or answered before set-up continues. */
export const requiredErrors = (
  saved: Partial<Profile>,
  answers: ProfileAnswers,
): Partial<Record<'citizenship' | 'residence', string>> => {
  const errors: Partial<Record<'citizenship' | 'residence', string>> = {}
  for (const key of REQUIRED_QUESTIONS)
    if (!isGiven(saved[key]) && !isGiven(answers[key])) errors[key] = REQUIRED_MESSAGES[key]
  return errors
}

/** Only what the traveller actually answered: skipped questions are not saved. */
export const answeredOnly = (answers: ProfileAnswers): ProfileAnswers =>
  Object.fromEntries(Object.entries(answers).filter(([, value]) => isGiven(value)))
