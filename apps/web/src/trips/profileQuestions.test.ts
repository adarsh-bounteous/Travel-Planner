import { answeredOnly, requiredErrors, unansweredQuestions } from './profileQuestions'

describe('unansweredQuestions', () => {
  it('lists every question when nothing is saved', () => {
    expect(unansweredQuestions({})).toEqual([
      'citizenship',
      'residence',
      'health_status',
      'religion',
      'diet',
      'tastes',
      'travel_style',
    ])
  })

  it('leaves out a saved answer and keeps the rest', () => {
    expect(unansweredQuestions({ religion: 'Hindu' })).not.toContain('religion')
    expect(unansweredQuestions({ citizenship: 'Ireland' })).not.toContain('citizenship')
    expect(unansweredQuestions({ citizenship: 'Ireland' })).toContain('residence')
  })

  it('counts empty tastes and blank text as unanswered', () => {
    expect(unansweredQuestions({ tastes: [] })).toContain('tastes')
    expect(unansweredQuestions({ diet: '' })).toContain('diet')
    expect(unansweredQuestions({ tastes: ['Food'] })).not.toContain('tastes')
  })

  it('is empty when everything is saved', () => {
    expect(
      unansweredQuestions({
        citizenship: 'Ireland',
        residence: 'Portugal',
        health_status: 'Allergies',
        religion: 'Hindu',
        diet: 'Vegan',
        tastes: ['Food'],
        travel_style: 'Relaxed',
      }),
    ).toEqual([])
  })
})

describe('requiredErrors', () => {
  it('flags citizenship and residence that are neither saved nor answered', () => {
    expect(requiredErrors({}, {})).toEqual({
      citizenship: 'Choose your citizenship to continue',
      residence: 'Choose your country of residence to continue',
    })
  })

  it('accepts a saved or a freshly given answer', () => {
    expect(requiredErrors({ citizenship: 'Ireland' }, { residence: 'Portugal' })).toEqual({})
    expect(requiredErrors({ citizenship: 'Ireland' }, {})).toEqual({
      residence: 'Choose your country of residence to continue',
    })
  })
})

describe('answeredOnly', () => {
  it('drops blanks and empty tastes', () => {
    expect(answeredOnly({ diet: '', tastes: [] })).toEqual({})
    expect(answeredOnly({ diet: 'Vegan', religion: '', tastes: ['Food'] })).toEqual({
      diet: 'Vegan',
      tastes: ['Food'],
    })
  })
})
