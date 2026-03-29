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

test('inspector exposes a clear action when an entity is selected', async ({ goto, page }) => {
  await goto('/diagram')
  await page.locator('[data-diagram-panel-tab="entities"]').click()
  await page.locator('[data-browser-entity-row="public.users"] button').first().click()
  await page.locator('[data-diagram-panel-tab="inspector"]').click()

  await expect(page.locator('[data-inspector-clear-selection="true"]')).toBeVisible()
  await expect(page.locator('[data-diagram-panel="true"] h3')).toHaveText('public.users')

  await page.locator('[data-inspector-clear-selection="true"]').click()

  await expect(page.locator('[data-inspector-clear-selection="true"]')).toHaveCount(0)
  await expect(page.locator('[data-inspector-overview="true"]')).toBeVisible()
  await expect(page.locator('[data-diagram-panel="true"] h3')).toHaveText('Inspector')
})

test('light mode keeps inspector action buttons readable', async ({ goto, page }) => {
  await goto('/diagram')

  await page.getByRole('button', { name: 'Switch to light mode' }).click()

  const overviewButtonStyles = await page.locator('[data-inspector-overview-action="entities"]').evaluate((element) => {
    const styles = window.getComputedStyle(element)

    return {
      backgroundColor: styles.backgroundColor,
      borderColor: styles.borderColor,
      color: styles.color
    }
  })

  expect(overviewButtonStyles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(overviewButtonStyles.borderColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(overviewButtonStyles.color).not.toBe(overviewButtonStyles.backgroundColor)

  await page.locator('[data-diagram-panel-tab="entities"]').click()
  await page.locator('[data-browser-entity-row="public.users"] button').first().click()
  await page.locator('[data-diagram-panel-tab="inspector"]').click()

  const editTableButtonStyles = await page.locator('[data-diagram-panel="true"]').getByRole('button', { name: 'Edit table' }).evaluate((element) => {
    const styles = window.getComputedStyle(element)

    return {
      backgroundColor: styles.backgroundColor,
      borderColor: styles.borderColor,
      color: styles.color
    }
  })

  expect(editTableButtonStyles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(editTableButtonStyles.borderColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(editTableButtonStyles.color).not.toBe(editTableButtonStyles.backgroundColor)
})
