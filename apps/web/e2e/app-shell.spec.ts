import { expect, test } from '@playwright/test'

// The API is stubbed at the network edge; its behaviour is covered by the API e2e tests.
test('header shows all links with no menu button at phone and desktop widths', async ({
  page,
}) => {
  await page.route('**/auth/me', (route) =>
    route.fulfill({ json: { email: 'maya@example.com', method: 'email' } }),
  )
  await page.route('**/trips', (route) => route.fulfill({ json: [] }))

  await page.goto('/')
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 800 })
    const header = page.getByRole('banner')
    for (const name of ['Trips', 'Explore', 'Saved', 'Account']) {
      await expect(header.getByRole('link', { name })).toBeVisible()
    }
    await expect(header.getByRole('button', { name: 'Menu' })).toHaveCount(0)
  }
})

test('logo and Explore link navigate', async ({ page }) => {
  await page.route('**/auth/me', (route) =>
    route.fulfill({ json: { email: 'maya@example.com', method: 'email' } }),
  )
  await page.route('**/trips', (route) => route.fulfill({ json: [] }))

  await page.goto('/saved')
  const header = page.getByRole('banner')
  await header.getByRole('link', { name: 'Explore' }).click()
  await expect(page.getByRole('heading', { name: 'Explore' })).toBeVisible()
  await header.getByRole('link', { name: 'Travel Planner' }).click()
  await expect(page.getByRole('heading', { name: 'My trips' })).toBeVisible()
})
