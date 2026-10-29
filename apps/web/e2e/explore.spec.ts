import { expect, test, type Page } from '@playwright/test'

// The API is stubbed at the network edge; its behaviour is covered by the API e2e tests.
const place = (id: string, name: string) => ({
  id,
  name,
  image_url: `https://img.example/${id}.jpg`,
  place_type: 'landmark',
  price: 'free',
  lat: 38.7,
  lng: -9.1,
})

async function stub(page: Page) {
  await page.route('**/auth/me', (route) =>
    route.fulfill({ json: { email: 'maya@example.com', method: 'email' } }),
  )
  await page.route('**/trips', (route) => route.fulfill({ json: [] }))
  await page.route('**/startup-status', (route) => route.fulfill({ json: { local_mode: true } }))
  await page.route('**/places?*', (route) =>
    route.fulfill({ json: [place('p1', 'Alfama'), place('p2', 'Belém Tower'), place('p3', 'Sé')] }),
  )
  await page.route('**/saved-places', (route) =>
    route.fulfill({ json: [place('p1', 'Alfama')] }),
  )
}

for (const width of [390, 1280]) {
  test.describe(`width ${width}`, () => {
    test.use({ viewport: { width, height: 800 } })

    test('shows search, chips, toggle and cards without sideways scrolling', async ({ page }) => {
      await stub(page)
      await page.goto('/explore')
      await expect(page.getByRole('search')).toBeVisible()
      await expect(page.getByRole('group', { name: 'Filters' })).toBeVisible()
      await expect(page.getByRole('tablist', { name: 'Results view' })).toBeVisible()
      await expect(page.getByTestId('place-cover').first()).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    })
  })
}

test('no request leaves the app while Explore and Saved render', async ({ page }) => {
  await stub(page)
  const external: string[] = []
  page.on('request', (req) => {
    const url = new URL(req.url())
    if (url.protocol.startsWith('http') && url.origin !== new URL(page.url()).origin)
      external.push(req.url())
  })
  await page.goto('/explore')
  await expect(page.getByTestId('place-cover').first()).toBeVisible()
  await page.goto('/saved')
  await expect(page.getByTestId('place-cover').first()).toBeVisible()
  expect(external).toEqual([])
})
