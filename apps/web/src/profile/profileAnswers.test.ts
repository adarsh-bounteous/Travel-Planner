import { NO_TRANSPORT_PREFERENCES } from '../trips/api'
import type { Profile } from '../trips/api'
import { PROFILE_ORDER, answerError, answerText, withAnswer } from './profileAnswers'

const FULL: Profile = {
  display_name: 'Maya',
  home_city: 'Leeds',
  dietary_notes: 'No nuts',
  citizenship: 'Ireland',
  residence: 'France',
  health_status: 'Allergies',
  religion: 'Hindu',
  diet: 'Vegetarian',
  tastes: ['Food', 'Museums'],
  travel_style: 'Cultural',
  transport_preferences: { ...NO_TRANSPORT_PREFERENCES, modes: ['train'] },
}

describe('profileAnswers', () => {
  it('lists the seven answers in set-up order', () => {
    expect(PROFILE_ORDER).toEqual([
      'citizenship',
      'residence',
      'health_status',
      'religion',
      'diet',
      'tastes',
      'travel_style',
    ])
  })

  it('shows a saved value as text, tastes joined, and empty when not given', () => {
    expect(answerText(FULL, 'citizenship')).toBe('Ireland')
    expect(answerText(FULL, 'tastes')).toBe('Food, Museums')
    expect(answerText({ ...FULL, religion: '' }, 'religion')).toBe('')
    expect(answerText({ ...FULL, tastes: [] }, 'tastes')).toBe('')
  })

  it('blocks an empty citizenship or residence (AC6)', () => {
    expect(answerError('citizenship', '')).toBe('Citizenship is required. Choose one to save.')
    expect(answerError('residence', '')).toBe('Residence is required. Choose one to save.')
    expect(answerError('citizenship', 'Ireland')).toBeUndefined()
  })

  it('asks for a choice when adding an optional answer (AC4)', () => {
    expect(answerError('diet', '', 'add')).toBe('Choose one to save.')
    expect(answerError('tastes', [], 'add')).toBe('Choose at least one taste to save.')
    expect(answerError('diet', 'Vegan', 'add')).toBeUndefined()
    expect(answerError('diet', '')).toBeUndefined()
  })

  it('changes one answer and keeps the rest, without mutating (AC3)', () => {
    const before = structuredClone(FULL)
    expect(withAnswer(FULL, 'diet', 'Vegan')).toEqual({ ...FULL, diet: 'Vegan' })
    expect(FULL).toEqual(before)
  })

  it('keeps the saved transport preferences when another answer changes', () => {
    expect(withAnswer(FULL, 'diet', 'Vegan').transport_preferences).toEqual(FULL.transport_preferences)
  })
})
