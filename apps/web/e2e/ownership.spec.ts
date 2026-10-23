import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

// The API is stubbed at the network edge with one shared state keyed by traveller; the real
// ownership rules are covered by the API unit and e2e tests.
type Trip = { id: string; name: string }
const tripsByOwner: Record<string, Trip[]> = {}

async function stubAs(page: Page, owner: string) {
  await page.route('**/auth/me', (route) =>
    route.fulfill({ json: { email: `${owner}@example.com`, method: 'email' } }),
  )
  await page.route('**/trips/*', (route) => {
    const id = route.request().url().split('/').pop()
    const trip = (tripsByOwner[owner] ?? []).find((t) => t.id === id)
    return trip
      ? route.fulfill({ json: trip })
      : route.fulfill({ status: 404, json: { code: 'not_found' } })
  })
  await page.route('**/trips', (route) => route.fulfill({ json: tripsByOwner[owner] ?? [] }))
}

test('another traveller cannot open a trip by its address', async ({ browser }) => {
  tripsByOwner.a = [{ id: 'abc', name: 'Lisbon' }]
  const a = await (await browser.newContext()).newPage()
  const b = await (await browser.newContext()).newPage()
  await stubAs(a, 'a')
  await stubAs(b, 'b')

  await a.goto('/trips/abc')
  await expect(a.getByLabel('Trip name')).toHaveValue('Lisbon')
  await b.goto('/trips/abc')
  await expect(b.getByText('Trip not found')).toBeVisible()
})

test('a change on one device shows on another after reload', async ({ browser }) => {
  tripsByOwner.maya = [{ id: 'abc', name: 'Lisbon' }]
  const one = await (await browser.newContext()).newPage()
  const two = await (await browser.newContext()).newPage()
  await stubAs(one, 'maya')
  await stubAs(two, 'maya')

  await two.goto('/')
  await expect(two.getByRole('link', { name: /Lisbon/ })).toBeVisible()
  tripsByOwner.maya = [{ id: 'abc', name: 'Lisbon 2' }] // changed from device one
  await two.reload()
  await expect(two.getByRole('link', { name: /Lisbon 2/ })).toBeVisible()
})
