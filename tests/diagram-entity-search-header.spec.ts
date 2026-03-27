import { expect, test } from '@nuxt/test-utils/playwright'
import { authorizeStudioLaunchAccess } from './helpers/studio-launch'

test.setTimeout(120_000)

test.beforeEach(async ({ page }) => {
  await authorizeStudioLaunchAccess(page)
})

test('entities search header reports matches and clears the current filter', async ({ goto, page }) => {
  await goto('/diagram')
  await page.locator('[data-diagram-panel-tab="entities"]').click()
  await page.locator('[data-entity-search="true"]').fill('email')

  await expect(page.locator('[data-entity-search-clear="true"]')).toBeVisible()
  await expect(page.locator('[data-diagram-panel="true"]')).toContainText('matches')

  await page.locator('[data-entity-search-clear="true"]').click()

  await expect(page.locator('[data-entity-search="true"]')).toHaveValue('')
  await expect(page.locator('[data-entity-search-clear="true"]')).toHaveCount(0)
  await expect(page.locator('[data-diagram-panel="true"]')).toContainText('visible rows')
})
