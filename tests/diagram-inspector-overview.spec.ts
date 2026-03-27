import { expect, test } from '@nuxt/test-utils/playwright'
import { authorizeStudioLaunchAccess } from './helpers/studio-launch'

test.setTimeout(120_000)

test.beforeEach(async ({ page }) => {
  await authorizeStudioLaunchAccess(page)
})

test('empty inspector shows a schema overview with quick actions', async ({ goto, page }) => {
  await goto('/diagram')

  const overview = page.locator('[data-inspector-overview="true"]')

  await expect(overview).toBeVisible()
  await expect(overview).toContainText('Schema overview')
  await expect(overview).toContainText('Groups')
  await expect(overview).toContainText('Tables')
  await expect(overview).toContainText('Objects')
  await expect(overview).toContainText('Lines')

  const statValues = await overview.locator('[data-inspector-overview-value]').allTextContents()

  expect(statValues.every(value => /^[0-9]+$/.test(value.trim()))).toBe(true)

  await page.locator('[data-inspector-overview-action="entities"]').click()

  await expect(page.locator('[data-entity-search="true"]')).toBeVisible()
})
