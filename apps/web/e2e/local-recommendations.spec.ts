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

test('local recommendation images load offline from the app and stay the same on reload', async ({
  page,
}) => {
  const local = { ...rec('tile-museum-local', 'Tile Museum', 'Culture') }
  local.place.image_url = '/rec/tile-museum-local.svg'
  const bare = { ...rec('nope', 'Mystery stop', 'Culture'), place: null }
  await page.route('**/auth/me', (route) =>
    route.fulfill({ json: { email: 'maya@example.com', method: 'email' } }),
  )
  await page.route('**/startup-status', (route) => route.fulfill({ json: { local_mode: true } }))
  await page.route('**/saved-places', (route) => route.fulfill({ json: [] }))
  await page.route('**/trips/t1', (route) =>
    route.fulfill({
      json: { id: 't1', name: 'Lisbon', destination: 'Lisbon', interests: ['Culture'], is_owner: true, days: [], options: [], activities: [] },
    }),
  )
  await page.route('**/trips/t1/recommendations', (route) => route.fulfill({ json: [local, bare] }))

  const outside: string[] = []
  page.on('request', (req) => {
    if (req.resourceType() === 'image' && new URL(req.url()).origin !== new URL(page.url()).origin)
      outside.push(req.url())
  })
  await page.goto('/trips/t1')
  await page.getByRole('tab', { name: 'Recommendations' }).click()
  const first = page.getByRole('img', { name: 'Tile Museum photo' })
  await expect(first).toBeVisible()
  await expect(page.getByText('Photo not available')).toBeVisible()
  const src = await first.getAttribute('src')

  await page.context().setOffline(true)
  for (const img of await page.getByRole('img').all())
    expect(await img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
  expect(outside).toEqual([])
  await page.context().setOffline(false)

  await page.reload()
  await page.getByRole('tab', { name: 'Recommendations' }).click()
  await expect(page.getByRole('img', { name: 'Tile Museum photo' })).toHaveAttribute('src', src!)
})
