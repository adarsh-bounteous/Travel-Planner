export type Catalogue = { name: string; places: string[] }[]
export type Choice = { country: string; place: string }
export type Evaluation =
  | { kind: 'empty' }
  | { kind: 'place'; choice: Choice }
  | { kind: 'country'; country: string }
  | { kind: 'near'; choice: Choice }
  | { kind: 'none' }

const MAX_EDITS = 2

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()

/** Levenshtein distance, case-insensitive and accent-folded. */
export function editDistance(a: string, b: string): number {
  const x = fold(a)
  const y = fold(b)
  let row = Array.from({ length: y.length + 1 }, (_, j) => j)
  for (let i = 1; i <= x.length; i++) {
    const next = [i]
    for (let j = 1; j <= y.length; j++) {
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1))
    }
    row = next
  }
  return row[y.length]
}

/** Exact place, then exact country, then the nearest place within 2 edits (ties go to catalogue order). */
export function evaluateDestination(query: string, catalogue: Catalogue): Evaluation {
  const text = fold(query)
  if (!text) return { kind: 'empty' }
  const choices = catalogue.flatMap((c) => c.places.map((place) => ({ country: c.name, place })))
  const exact = choices.find((c) => fold(c.place) === text)
  if (exact) return { kind: 'place', choice: exact }
  const country = catalogue.find((c) => fold(c.name) === text)
  if (country) return { kind: 'country', country: country.name }
  let best: Choice | null = null
  let bestDistance = MAX_EDITS + 1
  for (const choice of choices) {
    const distance = editDistance(text, choice.place)
    if (distance < bestDistance) {
      best = choice
      bestDistance = distance
    }
  }
  return best ? { kind: 'near', choice: best } : { kind: 'none' }
}

export const formatDestination = (c: Choice) => `${c.place}, ${c.country}`

/** Reads a stored "Place, Country"; anything else (legacy free text) is no choice. */
export function parseDestination(
  stored: string | null | undefined,
  catalogue: Catalogue,
): Choice | null {
  const match = catalogue
    .flatMap((c) => c.places.map((place) => ({ country: c.name, place })))
    .find((c) => formatDestination(c) === stored?.trim())
  return match ?? null
}
