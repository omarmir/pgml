import { expect, test } from '@nuxt/test-utils/playwright'
import { authorizeStudioLaunchAccess } from './helpers/studio-launch'

test.setTimeout(120_000)

test.beforeEach(async ({ page }) => {
  await authorizeStudioLaunchAccess(page)
})

test('mobile studio menu switches views and keeps modals inside the viewport', async ({ goto, page }) => {
  await page.setViewportSize({
    width: 390,
    height: 844
  })
  await goto('/diagram')

  const mobileStudioMenu = page.locator('[data-mobile-studio-menu="true"]')
  const currentView = page.locator('[data-mobile-studio-current-view="true"]')

  await expect(mobileStudioMenu).toBeVisible()
  await expect(currentView).toHaveText('Diagram')

  await mobileStudioMenu.click()
  await page.getByRole('menuitem', { name: 'PGML' }).click()

  await expect(currentView).toHaveText('PGML')
  await expect(page.locator('[data-mobile-studio-view="pgml"]')).toBeVisible()
  await expect(page.locator('[data-pgml-editor="true"]')).toBeVisible()

  const editorScrollMetrics = await page.evaluate(() => {
    const scroller = document.querySelector('[data-pgml-editor-scroller="true"]')

    if (!(scroller instanceof HTMLElement)) {
      return null
    }

    const before = scroller.scrollTop
    scroller.scrollTop = 180

    return {
      after: scroller.scrollTop,
      before,
      clientHeight: scroller.clientHeight,
      scrollHeight: scroller.scrollHeight
    }
  })

  expect(editorScrollMetrics).not.toBeNull()
  expect(editorScrollMetrics?.scrollHeight || 0).toBeGreaterThan(editorScrollMetrics?.clientHeight || 0)
  expect(editorScrollMetrics?.after || 0).toBeGreaterThan(editorScrollMetrics?.before || 0)

  await mobileStudioMenu.click()
  await page.getByRole('menuitem', { name: 'Diagram panel' }).click()
  await page.getByRole('menuitem', { name: 'Entities' }).click()

  await expect(currentView).toHaveText('Entities panel')
  await expect(page.locator('[data-diagram-panel="true"]')).toBeVisible()
  await expect(page.locator('[data-entity-search="true"]')).toBeVisible()

  await page.locator('[data-browser-entity-row="public.users"] button').first().dblclick()

  await expect(currentView).toHaveText('PGML')
  await expect(page.locator('[data-pgml-editor="true"]')).toBeVisible()

  await mobileStudioMenu.click()
  await page.getByRole('menuitem', { name: 'Diagram panel' }).click()
  await page.getByRole('menuitem', { name: 'Entities' }).click()
  await page.getByRole('button', { name: 'Add group' }).click()

  const modalBounds = await page.evaluate(() => {
    const surface = document.querySelector('[data-studio-modal-surface="group-editor"]')

    if (!(surface instanceof HTMLElement)) {
      return null
    }

    const rect = surface.getBoundingClientRect()

    return {
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth
    }
  })

  expect(modalBounds).not.toBeNull()
  expect(modalBounds?.left || 0).toBeGreaterThanOrEqual(0)
  expect(modalBounds?.top || 0).toBeGreaterThanOrEqual(0)
  expect(modalBounds?.right || 0).toBeLessThanOrEqual(modalBounds?.viewportWidth || 0)
  expect(modalBounds?.bottom || 0).toBeLessThanOrEqual(modalBounds?.viewportHeight || 0)
})
