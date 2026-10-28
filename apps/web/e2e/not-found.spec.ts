import { expect, test } from '@playwright/test'

// The API is stubbed at the network edge; its behaviour is covered by the API e2e tests.
test.beforeEach(async ({ page }) => {
  await page.route('**/auth/me', (route) =>
    route.fulfill({ json: { email: 'maya@example.com' } }),
  )
  await page.route('**/trips', (route) =>
    route.request().resourceType() === 'fetch' ? route.fulfill({ json: [] }) : route.continue(),
  )
})

test('unknown page answers 404 and shows a not-found page with a way back to Trips', async ({
  page,
}) => {
  const response = await page.goto('/trips/summer-2027/hotels')
  expect(response?.status()).toBe(404)
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await expect(page.getByText('The page you requested could not be found.')).toBeVisible()

  await page.getByRole('link', { name: 'Go to Trips' }).click()
  await expect(page.getByRole('heading', { name: 'My trips' })).toBeVisible()
})

test('a known page is still 200', async ({ page }) => {
  expect((await page.goto('/saved'))?.status()).toBe(200)
})

test('a long unknown path does not overflow a phone screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto(`/${'very-long-segment-'.repeat(8)}/page?x=1`)
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflows).toBe(false)
})
