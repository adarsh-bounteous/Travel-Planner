import { expect, test } from '@playwright/test'

// The API is stubbed at the network edge; filtering and the local catalogue are covered by the API tests.
const place = (id: string, name: string) => ({
  id,
  name,
  image_url: `https://img.example/${id}.jpg`,
  place_type: 'park',
  price: 'free',
  lat: 1,
  lng: 2,
})
const rec = (id: string, name: string, interest: string) => ({
  id,
  name,
  detail: 'About 2 hours',
  interest,
  place: place(id, name),
})
const TRIPS = {
  t1: { destination: 'Lisbon', recs: [rec('tile', 'Tile Museum', 'Culture')] },
  t2: { destination: 'Kyoto', recs: [rec('fushimi', 'Fushimi Inari gates', 'Culture')] },
}

test('two trips list different local recommendations and say they are generated locally', async ({
  page,
}) => {
  await page.route('**/auth/me', (route) =>
    route.fulfill({ json: { email: 'maya@example.com', method: 'email' } }),
  )
  await page.route('**/startup-status', (route) => route.fulfill({ json: { local_mode: true } }))
  await page.route('**/saved-places', (route) => route.fulfill({ json: [] }))
  for (const [id, { destination, recs }] of Object.entries(TRIPS)) {
    await page.route(`**/trips/${id}`, (route) =>
      route.fulfill({
        json: { id, name: destination, destination, interests: ['Culture'], is_owner: true, days: [], options: [], activities: [] },
      }),
    )
    await page.route(`**/trips/${id}/recommendations`, (route) => route.fulfill({ json: recs }))
  }

  const names: string[][] = []
  for (const id of Object.keys(TRIPS)) {
    await page.goto(`/trips/${id}`)
    await page.getByRole('tab', { name: 'Recommendations' }).click()
    await expect(page.getByText('Generated locally.')).toBeVisible()
    names.push(await page.getByRole('heading', { level: 3 }).allTextContents())
  }
  expect(names[0]).not.toEqual(names[1])
})
