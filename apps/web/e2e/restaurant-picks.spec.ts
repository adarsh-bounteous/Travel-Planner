import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// The API is stubbed at the network edge; its behaviour is covered by the API tests.
const entry = (rank: number, name: string, price: string) => ({
  rank,
  restaurant: {
    name,
    city: 'Lisbon',
    cuisine: 'Portuguese',
    dining_style: 'Casual',
    price_level: 2,
    typical_price: price,
    currency: 'EUR',
    suits: [],
    url: null,
  },
  fits_budget: true,
  preferences_met: [],
  preferences_total: 0,
})

const pick = (id: string, name: string, price: string, date: string | null, meal: string | null) => ({
  id,
  name,
  city: 'Lisbon',
  cuisine: 'Portuguese',
  typical_price: price,
  currency: 'EUR',
  url: null,
  date,
  meal,
})

async function stub(page: Page, budget: number) {
  const trip = {
    id: 't1',
    name: 'Lisbon',
    destination: 'Lisbon',
    currency: 'EUR',
    budget,
    traveller_count: 2,
    is_owner: true,
    can_edit: true,
    days: [
      { date: '2026-05-01', name: 'Day 1' },
      { date: '2026-05-02', name: 'Day 2' },
    ],
    restaurants: [] as ReturnType<typeof pick>[],
  }
  const withCost = () => {
    const total = trip.restaurants.reduce((sum, p) => sum + Number(p.typical_price) * trip.traveller_count, 0)
    return {
      ...trip,
      cost: {
        currency: 'EUR',
        total,
        budget,
        over_budget_by: Math.max(0, total - budget),
        missing_categories: [],
        unpriced_count: 0,
        unconvertible_count: 0,
        restaurant_total: total,
        restaurant_unpriced_count: 0,
        rates: [],
      },
    }
  }
  await page.route('**/auth/me', (route) => route.fulfill({ json: { email: 'maya@example.com', method: 'email' } }))
  await page.route('**/trips/t1', (route) => route.fulfill({ json: withCost() }))
  await page.route('**/trips/t1/restaurant-shortlist', (route) =>
    route.fulfill({
      json: {
        place: 'Lisbon',
        budget_per_person: '25',
        currency: 'EUR',
        entries: [entry(1, 'Casa Lima', '19'), entry(2, 'Mesa Real', '68')],
      },
    }),
  )
  await page.route('**/trips/t1/restaurants', async (route) => {
    const body = route.request().postDataJSON()
    const price = body.name === 'Casa Lima' ? '19' : '68'
    trip.restaurants.push(pick(`p${trip.restaurants.length}`, body.name, price, body.date, body.meal))
    await route.fulfill({ status: 201, json: withCost() })
  })
  await page.route('**/trips/t1/restaurants/*', async (route) => {
    const id = route.request().url().split('/').pop()
    const body = route.request().postDataJSON()
    trip.restaurants = trip.restaurants.map((p) => (p.id === id ? { ...p, ...body } : p))
    await route.fulfill({ json: withCost() })
  })
}

for (const [label, viewport] of [
  ['phone', { width: 375, height: 800 }],
  ['desktop', { width: 1280, height: 800 }],
] as const) {
  test(`add two restaurants, move one, and see the total change (${label})`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await stub(page, 1000)

    await page.goto('/trips/t1/restaurant-options/shortlist')
    await page.getByRole('button', { name: 'Add Casa Lima to trip' }).click()
    await page.getByRole('button', { name: 'Add to trip' }).click()
    await expect(page.getByRole('status').filter({ hasText: 'Casa Lima added to Unscheduled' })).toBeVisible()

    await page.getByRole('button', { name: 'Add Mesa Real to trip' }).click()
    await page.getByLabel('Day').selectOption('2026-05-01')
    await page.getByLabel('Lunch').check()
    await page.getByRole('button', { name: 'Add to trip' }).click()
    await expect(page.getByRole('button', { name: 'Added to trip' })).toHaveCount(2)

    await page.goto('/trips/t1')
    const unscheduled = page.getByRole('region', { name: 'Unscheduled' })
    await expect(unscheduled.getByText('Casa Lima')).toBeVisible()
    await expect(unscheduled.getByText('Estimate 38 EUR')).toBeVisible()
    await expect(page.getByRole('region', { name: /1 May/ }).getByText('Mesa Real')).toBeVisible()

    await page.getByRole('button', { name: 'Move Mesa Real' }).click()
    await page.getByLabel('Day').selectOption('2026-05-02')
    await page.getByRole('button', { name: 'Move', exact: true }).click()
    await expect(page.getByRole('region', { name: /2 May/ }).getByText('Mesa Real')).toBeVisible()
    await expect(page.getByRole('region', { name: /1 May/ }).getByText('Mesa Real')).toHaveCount(0)
    await expect(page.getByText('Restaurant estimates').locator('xpath=following-sibling::dd')).toContainText('174 EUR')
  })

  test(`a small budget shows the over-budget alert (${label})`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await stub(page, 100)
    await page.goto('/trips/t1/restaurant-options/shortlist')
    await page.getByRole('button', { name: 'Add Mesa Real to trip' }).click()
    await page.getByRole('button', { name: 'Add to trip' }).click()
    await page.goto('/trips/t1')
    await expect(page.getByRole('alert').filter({ hasText: 'Over budget by 36 EUR' })).toBeVisible()
  })
}
