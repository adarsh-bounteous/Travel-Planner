import { expect, test } from '@playwright/test'

// The API is stubbed at the network edge; the rules behind the helpers are covered by the API tests.
test('the currency helper shows the rate and converts, and the weather helper shows a forecast', async ({
  page,
}) => {
  await page.route('**/auth/me', (route) =>
    route.fulfill({ json: { email: 'maya@example.com', method: 'email' } }),
  )
  await page.route('**/startup-status', (route) => route.fulfill({ json: { local_mode: true } }))
  await page.route('**/trips/t1', (route) =>
    route.fulfill({
      json: {
        id: 't1', name: 'Tokyo', destination: 'Tokyo, Japan', start_date: '2026-11-03',
        end_date: '2026-11-09', currency: 'EUR', is_owner: true, days: [], options: [], activities: [],
      },
    }),
  )
  await page.route('**/trips/t1/currency-helper', (route) =>
    route.fulfill({
      json: {
        destination_currency: 'JPY', home_currency: 'EUR',
        live: { rate: '0.0061', inverse: '163.93', as_of: '2026-10-27' }, last_known: null,
        start_date: '2026-11-03', end_date: '2026-11-09',
      },
    }),
  )
  await page.route('**/trips/t1/weather-helper', (route) =>
    route.fulfill({
      json: {
        typical: { month: 11, summary: 'Crisp, mostly dry days.', high_c: 18, low_c: 9, rain_mm: 90, rain_days: 6, as_of: '2026-10-01' },
        forecast: { status: 'available', days: [{ date: '2026-11-03', high_c: 17, low_c: 9, rain_percent: 10 }] },
        start_date: '2026-11-03', end_date: '2026-11-09',
      },
    }),
  )

  await page.goto('/trips/t1/currency')
  await expect(page.getByText('Live rate: JPY 1 = EUR 0.0061')).toBeVisible()
  await page.getByLabel('Amount in JPY').fill('2,000')
  await expect(page.getByText('JPY 2,000 = EUR 12.20')).toBeVisible()

  await page.goto('/trips/t1/weather')
  await expect(page.getByRole('heading', { name: 'Typical weather for November' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Forecast for trip dates' })).toBeVisible()
})
