import type { InsuranceOptions } from './api'

export type CompareState =
  | { kind: 'ready' }
  | { kind: 'too-few'; count: number }
  | { kind: 'missing-age'; names: string[] }

/** Compare works only with 2 or more plans and every traveller aged; a missing age is reported first. */
export const compareState = (options: InsuranceOptions): CompareState => {
  const names = options.travellers.filter((t) => t.age === null).map((t) => t.label)
  if (names.length > 0) return { kind: 'missing-age', names }
  if (options.plans.length < 2) return { kind: 'too-few', count: options.plans.length }
  return { kind: 'ready' }
}
