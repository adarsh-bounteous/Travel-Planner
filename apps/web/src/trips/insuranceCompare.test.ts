import { compareState } from './insuranceCompare'
import { PLANS, options } from './insuranceFixtures'

describe('compareState', () => {
  it('is ready with two or three plans and every traveller aged', () => {
    expect(compareState(options(PLANS))).toEqual({ kind: 'ready' })
    expect(compareState(options(PLANS.slice(0, 2)))).toEqual({ kind: 'ready' })
  })

  it('is too-few with zero or one plan', () => {
    expect(compareState(options(PLANS.slice(0, 1)))).toEqual({ kind: 'too-few', count: 1 })
    expect(compareState(options([]))).toEqual({ kind: 'too-few', count: 0 })
  })

  it('is missing-age first, even with plans', () => {
    const travellers = [{ label: 'Maya Chen', age: null }]
    expect(compareState(options(PLANS, { travellers }))).toEqual({ kind: 'missing-age', names: ['Maya Chen'] })
    expect(compareState(options([], { travellers }))).toEqual({ kind: 'missing-age', names: ['Maya Chen'] })
  })
})
