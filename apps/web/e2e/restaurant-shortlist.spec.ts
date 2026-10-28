import { expect, test } from '@playwright/test'

// The API is stubbed at the network edge; matching and ranking are covered by the API tests.
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
const entry = (rank: number, name: string, price: string, fits: boolean) => ({
  rank,
  restaurant: restaurant(name, price),
  fits_budget: fits,
  preferences_met: [],
  preferences_total: 0,
})
const ENTRIES = [entry(1, 'Casa Lima', '19', true), entry(2, 'Mesa Real', '68', false)]

test('compares Lisbon restaurants, then removes one from the shortlist', async ({ page }) => {
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
    route.fulfill({
      json: { place: 'Lisbon', budget_per_person: '25', currency: 'EUR', entries: ENTRIES },
    }),
  )

  await page.goto('/trips/t1/restaurant-options')
  await page.getByRole('link', { name: 'Compare matches' }).click()
  await expect(page.getByRole('article')).toHaveCount(2)
  await expect(page.getByText('Typical price per person:').first()).toBeVisible()

  await page.getByRole('tab', { name: 'Shortlist' }).click()
  await expect(page.getByRole('article', { name: 'Mesa Real' })).toContainText('Over budget')
  await page.getByRole('button', { name: 'Remove Mesa Real from shortlist' }).click()
  await expect(page.getByRole('article', { name: 'Mesa Real' })).toHaveCount(0)
  await expect(page.getByRole('article', { name: 'Casa Lima' })).toBeVisible()
})
