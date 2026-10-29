import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// The API is stubbed at the network edge; this spec checks layout at phone and desktop widths.
const restaurant = (name: string, price: string) => ({
  name,
  city: 'Lisbon',
  cuisine: 'Portuguese',
  dining_style: 'Casual',
  price_level: 2,
  typical_price: price,
  currency: 'EUR',
  suits: [],
  url: null,
})
const entry = (rank: number, name: string, price: string) => ({
  rank,
  restaurant: restaurant(name, price),
  fits_budget: true,
  preferences_met: [],
  preferences_total: 0,
})
const ENTRIES = [entry(1, 'Casa Lima', '19'), entry(2, 'Mesa Real', '24')]

const WIDTHS = [
  { name: 'desktop', width: 1280, tracks: 2 },
  { name: 'phone', width: 375, tracks: 1 },
]

async function stub(page: Page) {
  await page.route('**/auth/me', (route) => route.fulfill({ json: { email: 'maya@example.com', method: 'email' } }))
  await page.route('**/startup-status', (route) => route.fulfill({ json: { local_mode: true } }))
  await page.route('**/trips/t1', (route) =>
    route.fulfill({ json: { id: 't1', name: 'Lisbon trip', destination: 'Lisbon', is_owner: true } }),
  )
  await page.route('**/trips/t1/restaurant-options', (route) =>
    route.fulfill({
      json: {
        place: 'Lisbon',
        destination: { country: 'Portugal', place: 'Lisbon', label: 'Lisbon, Portugal' },
        status: 'ready',
        home_cuisine: '',
        options: ENTRIES.map((e) => e.restaurant),
        filters_applied: { profile: [], trip: [] },
      },
    }),
  )
  await page.route('**/trips/t1/restaurant-shortlist', (route) =>
    route.fulfill({ json: { place: 'Lisbon', budget_per_person: '25', currency: 'EUR', entries: ENTRIES } }),
  )
}

for (const { name, width, tracks } of WIDTHS) {
  test.describe(`at ${name} width`, () => {
    test.use({ viewport: { width, height: 800 } })

    test('an option list shows option cards that fit the screen', async ({ page }) => {
      await stub(page)
      await page.goto('/trips/t1/restaurant-options')
      const card = page.locator('.option-card').first()
      await expect(card).toBeVisible()
      expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true)
      const columns = await page
        .locator('.option-card-body')
        .first()
        .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)
      expect(columns).toBe(tracks)
    })

    test('a comparison is a table on desktop and stacked cards on phones', async ({ page }) => {
      await stub(page)
      await page.goto('/trips/t1/restaurant-options/compare')
      await expect(page.locator('table.compare-table')).toBeVisible()
      const display = await page
        .locator('.compare-table tr')
        .nth(1)
        .evaluate((el) => getComputedStyle(el).display)
      expect(display).toBe(name === 'phone' ? 'block' : 'table-row')
    })
  })
}
