import { expect, test } from '@nuxt/test-utils/playwright'
import { authorizeStudioLaunchAccess } from './helpers/studio-launch'

test.setTimeout(120_000)

test.beforeEach(async ({ page }) => {
  await authorizeStudioLaunchAccess(page)
})

test('entities search header reports matches and clears the current filter', async ({ goto, page }) => {
  await goto('/diagram')
  await page.locator('[data-diagram-panel-tab="entities"]').click()

  await expect(page.locator('[data-entity-search="true"]')).toBeFocused()
  await expect(page.locator('[data-diagram-panel="true"]')).toContainText('visible rows')
  await page.locator('[data-entity-search="true"]').fill('email')

  await expect(page.locator('[data-entity-search-clear="true"]')).toBeVisible()
  await expect(page.locator('[data-diagram-panel="true"]')).toContainText('matches')

  await page.locator('[data-entity-search="true"]').press('Escape')

  await expect(page.locator('[data-entity-search="true"]')).toHaveValue('')
  await expect(page.locator('[data-entity-search-clear="true"]')).toHaveCount(0)
  await expect(page.locator('[data-diagram-panel="true"]')).toContainText('visible rows')
})

test('entities tree labels grouped and standalone sections with counts', async ({ goto, page }) => {
  await goto('/diagram')
  await page.locator('[data-diagram-panel-tab="entities"]').click()

  await expect(page.locator('[data-entity-section-label="grouped"]')).toContainText(/Grouped Tables · \d+ groups/)
  await expect(page.locator('[data-entity-section-label="standalone"]')).toContainText(/Standalone Objects · \d+/)
})

test('entities header can restore all hidden rows', async ({ goto, page }) => {
  await goto('/diagram')
  await page.locator('[data-diagram-panel-tab="entities"]').click()

  const usersVisibilityButton = page.locator('[data-browser-visibility-toggle="public.users"]')

  await expect(usersVisibilityButton).toContainText('Hide')
  await usersVisibilityButton.click()
  await expect(page.locator('[data-diagram-panel="true"]')).toContainText('1 hidden')
  await expect(page.locator('[data-entity-restore-visibility="true"]')).toBeVisible()

  await page.locator('[data-entity-restore-visibility="true"]').click()

  await expect(page.locator('[data-diagram-panel="true"]')).toContainText('0 hidden')
  await expect(page.locator('[data-entity-restore-visibility="true"]')).toHaveCount(0)
  await expect(page.locator('[data-browser-visibility-toggle="public.users"]')).toContainText('Hide')
})

test('entities rows keep a fixed action rail so button sizing stays consistent', async ({ goto, page }) => {
  await goto('/diagram')
  await page.locator('[data-diagram-panel-tab="entities"]').click()

  const row = page.locator('[data-browser-entity-row="public.users"]')
  const labelButton = row.locator('button').first()
  const focusButton = row.locator('[data-browser-focus-source="public.users"]')
  const visibilityButton = row.locator('[data-browser-visibility-toggle="public.users"]')

  const [labelBox, focusBox, visibilityBox] = await Promise.all([
    labelButton.boundingBox(),
    focusButton.boundingBox(),
    visibilityButton.boundingBox()
  ])

  expect(labelBox).not.toBeNull()
  expect(focusBox).not.toBeNull()
  expect(visibilityBox).not.toBeNull()

  if (!labelBox || !focusBox || !visibilityBox) {
    throw new Error('Expected entities row action layout to be measurable.')
  }

  expect(Math.abs(focusBox.height - visibilityBox.height)).toBeLessThanOrEqual(1)
  expect(Math.abs(focusBox.width - visibilityBox.width)).toBeLessThanOrEqual(1)
  expect(Math.abs(focusBox.x - visibilityBox.x)).toBeLessThanOrEqual(1)
  expect(labelBox.x + labelBox.width).toBeLessThanOrEqual(focusBox.x + 1)
})

test('entities empty state can clear a search with no matches', async ({ goto, page }) => {
  await goto('/diagram')
  await page.locator('[data-diagram-panel-tab="entities"]').click()
  await page.locator('[data-entity-search="true"]').fill('zzzzzzzz')

  await expect(page.locator('[data-diagram-panel="true"]')).toContainText('No entities match the current search.')
  await expect(page.locator('[data-entity-search-empty-clear="true"]')).toBeVisible()

  await page.locator('[data-entity-search-empty-clear="true"]').click()

  await expect(page.locator('[data-entity-search="true"]')).toHaveValue('')
  await expect(page.locator('[data-entity-search-empty-clear="true"]')).toHaveCount(0)
  await expect(page.locator('[data-browser-entity-row="public.users"]')).toBeVisible()
})
