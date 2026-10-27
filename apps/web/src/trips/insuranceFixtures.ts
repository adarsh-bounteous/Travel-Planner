import type { InsuranceOptions, InsurancePick, InsurancePlan } from './api'

/** Test data for the insurance pages: three plans for a two-traveller Japan trip. */
export const plan = (id: string, name: string, rank: number, over: Partial<InsurancePlan> = {}): InsurancePlan => ({
  rank,
  plan_id: id,
  name,
  provider: name.split(' ')[0],
  source: 'partner',
  fit: 3,
  reason: `Reason for ${name}.`,
  offer: null,
  traveller_prices: [
    { label: 'You', age: 34, price: '384.00' },
    { label: 'Marco', age: 61, price: '712.00' },
  ],
  group_total: '1096.00',
  currency: 'EUR',
  url: `https://${id}.example/plan`,
  ...over,
})

export const PLANS = [
  plan('globetrek', 'Globetrek Adventure Plus', 1, { offer: '10% off online' }),
  plan('asia-pacific', 'Asia Pacific Cover', 2),
  plan('meridian', 'Meridian Worldwide', 3),
]

export const options = (plans: InsurancePlan[], over: Partial<InsuranceOptions> = {}): InsuranceOptions => ({
  place: 'Japan',
  days: 10,
  risky_activities: true,
  travellers: [
    { label: 'You', age: 34 },
    { label: 'Marco', age: 61 },
  ],
  missing: [],
  plans,
  ...over,
})

export const pick = (id = 'globetrek', name = 'Globetrek Adventure Plus'): InsurancePick => ({
  plan_id: id,
  name,
  provider: 'Globetrek',
  url: `https://${id}.example/plan`,
  total: '1096.00',
  currency: 'EUR',
})
