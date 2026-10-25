import { expect, test } from '@playwright/test'

// The API is stubbed at the network edge; its behaviour is covered by the API e2e tests.
test('open the profile from Account, change an answer, add a skipped one, and be stopped clearing citizenship', async ({
  page,
}) => {
  let profile = {
    display_name: '',
    home_city: '',
    dietary_notes: '',
    citizenship: 'Ireland',
    residence: 'France',
    health_status: 'Allergies',
    religion: '',
    diet: 'Vegetarian',
    tastes: ['Food'],
    travel_style: 'Cultural',
  }
  let puts = 0
  await page.route('**/auth/me', (route) =>
    route.fulfill({ json: { email: 'maya@example.com', method: 'email' } }),
  )
  await page.route('**/profile', (route) => {
    if (route.request().method() === 'PUT') {
      puts += 1
      profile = route.request().postDataJSON()
    }
    return route.fulfill({ json: profile })
  })

  await page.goto('/account')
  await page.getByRole('link', { name: 'Traveller profile' }).click()
  await expect(page.getByRole('heading', { name: 'Traveller profile' })).toBeVisible()

  await page.getByRole('button', { name: 'Change diet' }).click()
  await page.getByLabel('Diet').selectOption('Vegan')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Vegan', { exact: true })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Diet changed to Vegan.' })).toBeVisible()

  await page.getByRole('button', { name: 'Add answer for religion' }).click()
  await page.getByLabel('Religion').selectOption('Buddhist')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Buddhist', { exact: true })).toBeVisible()

  const before = puts
  await page.getByRole('button', { name: 'Change citizenship' }).click()
  await page.getByLabel('Citizenship').selectOption('')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Citizenship is required. Choose one to save.')).toBeVisible()
  expect(puts).toBe(before)
})
