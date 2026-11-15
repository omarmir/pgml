import { expect, test } from '@nuxt/test-utils/playwright'
import type { Locator, Page } from '@playwright/test'
import { getPgmlEditor, setPgmlEditorValue } from './helpers/pgml-editor'
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

const pointerAccessFixture = `Table public.products {
  id integer [pk]
  search tsvector
  tenant_id integer
  Index idx_products_search (search) [type: gin]
}`

const expectToolbarControlsToReceivePointers = async (page: Page) => {
  const toolbar = page.locator('[data-diagram-zoom-toolbar="true"]')

  await expect(toolbar).toBeVisible()
  await expect.poll(async () => {
    return toolbar.evaluate((element) => {
      const controls = element.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>('button, input, select')

      return [...controls].filter((control) => {
        const bounds = control.getBoundingClientRect()

        if (control.disabled || bounds.width === 0 || bounds.height === 0) {
          return false
        }

        const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)

        return hit !== control && !control.contains(hit)
      }).map(control => ({ label: control.getAttribute('aria-label'), text: control.textContent }))
    })
  }).toEqual([])
}

const expectWholeEntityRowToBeVisible = async (row: Locator) => {
  await row.scrollIntoViewIfNeeded()
  await expect.poll(async () => {
    return row.evaluate((element) => {
      const panel = element.closest('[data-diagram-panel="true"]')
      const scroller = element.closest('[data-diagram-panel-scroll="true"]')

      if (!(panel instanceof HTMLElement) || !(scroller instanceof HTMLElement)) {
        throw new Error('Entity row is missing its panel or scroll region.')
      }

      const bounds = element.getBoundingClientRect()
      const panelBounds = panel.getBoundingClientRect()
      const scrollBounds = scroller.getBoundingClientRect()

      return scroller.clientHeight >= bounds.height
        && bounds.top >= Math.max(panelBounds.top, scrollBounds.top) - 1
        && bounds.bottom <= Math.min(panelBounds.bottom, scrollBounds.bottom) + 1
    })
  }).toBe(true)
}

const expectTabToReachEntity = async (page: Page, target: Locator) => {
  await page.locator('[data-entity-search="true"]').click()

  for (let step = 0; step < 50; step += 1) {
    await page.keyboard.press('Tab')

    if (await target.evaluate(element => document.activeElement === element)) {
      break
    }
  }

  await expect(target).toBeFocused()
  await expect.poll(async () => {
    return target.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      const hit = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)

      return element === hit || element.contains(hit)
    })
  }).toBe(true)
}

test('entities and the wrapping toolbar keep native pointer access after editor resize', async ({ goto, page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await goto('/diagram')
  await setPgmlEditorValue(getPgmlEditor(page).first(), pointerAccessFixture)
  await page.locator('[data-diagram-panel-tab="entities"]').click()
  await expect(page.locator('[data-browser-entity-row]')).toHaveCount(5)

  const row = page.locator('[data-browser-entity-row="index:idx_products_search"]')
  const target = row.locator('button').first()
  const popover = page.locator('[data-attachment-popover="index:idx_products_search"]')

  await row.scrollIntoViewIfNeeded()
  await target.click({ timeout: 3000 })
  await expect(popover).toBeVisible()
  await popover.getByLabel('Close detail popover').click()
  await expectWholeEntityRowToBeVisible(row)
  await expectToolbarControlsToReceivePointers(page)

  const toolbar = page.locator('[data-diagram-zoom-toolbar="true"]')
  const readScale = () => page.evaluate(() => {
    const renderer: { scale: number } | undefined = Reflect.get(window, '__pgmlSceneRendererDebug')

    return renderer?.scale
  })

  await toolbar.getByRole('button', { name: 'Fit view', exact: true }).click()
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await expect.poll(readScale).toBeGreaterThan(0)
  const fittedScale = await readScale()

  if (fittedScale === undefined) {
    throw new Error('Diagram renderer scale is unavailable.')
  }

  await toolbar.getByRole('button', { name: 'Zoom out', exact: true }).click()
  await expect.poll(readScale).toBeLessThan(fittedScale)
  const zoomedOutScale = await readScale()

  if (zoomedOutScale === undefined) {
    throw new Error('Diagram renderer scale is unavailable after zooming out.')
  }

  await toolbar.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect.poll(readScale).toBeGreaterThan(zoomedOutScale)
  const snap = toolbar.locator('[data-grid-snap-toggle="true"]')
  const snapBefore = await snap.getAttribute('aria-pressed')

  if (snapBefore === null) {
    throw new Error('Grid snap state is unavailable.')
  }

  await snap.click()
  await expect(snap).not.toHaveAttribute('aria-pressed', snapBefore)
  const rendererSelect = toolbar.locator('[data-diagram-renderer-select="desktop"]')

  await rendererSelect.click()
  await page.getByRole('option', { name: 'WebGL', exact: true }).click()
  await expect(rendererSelect).toContainText('WebGL')
  await toolbar.locator('[data-diagram-view-select="desktop"]').click()
  await page.getByRole('option', { name: 'Default', exact: true }).click()
  await toolbar.locator('[data-diagram-view-settings="desktop"]').click()
  await expect(page.locator('[data-diagram-view-settings-dialog="true"]')).toBeVisible()
  await page.locator('[data-diagram-view-settings-save="true"]').click()
  await expect(page.locator('[data-diagram-view-settings-dialog="true"]')).toHaveCount(0)

  const viewDialog = page.locator('[data-studio-modal-surface="diagram-view"]')

  await toolbar.locator('[data-diagram-view-create="desktop"]').click()
  await viewDialog.locator('[data-diagram-view-name-input="true"]').fill('Pointer review')
  await viewDialog.locator('[data-diagram-view-save="true"]').click()
  await expect(viewDialog).toHaveCount(0)
  await toolbar.locator('[data-diagram-view-rename="desktop"]').click()
  await viewDialog.locator('[data-diagram-view-name-input="true"]').fill('Pointer review renamed')
  await viewDialog.locator('[data-diagram-view-save="true"]').click()
  await expect(viewDialog).toHaveCount(0)
  await expectToolbarControlsToReceivePointers(page)
  await toolbar.locator('[data-diagram-view-delete="desktop"]').click()

  const initialToolbarHeight = await toolbar.evaluate(element => element.getBoundingClientRect().height)
  const separator = page.getByRole('separator', { name: 'Resize PGML editor' })
  const separatorBounds = await separator.boundingBox()

  if (!separatorBounds) {
    throw new Error('PGML editor resize handle is unavailable.')
  }

  await page.mouse.move(separatorBounds.x + separatorBounds.width / 2, separatorBounds.y + separatorBounds.height / 2)
  await page.mouse.down()
  await page.mouse.move(separatorBounds.x + separatorBounds.width / 2 + 480, separatorBounds.y + separatorBounds.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => toolbar.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(initialToolbarHeight + 10)
  await expect.poll(async () => {
    return toolbar.evaluate((element) => {
      const panel = document.querySelector('[data-diagram-panel="true"]')

      if (!(panel instanceof HTMLElement)) {
        throw new Error('Diagram panel is unavailable.')
      }

      return element.getBoundingClientRect().top - panel.getBoundingClientRect().bottom
    })
  }).toBeGreaterThanOrEqual(8)
  await expectToolbarControlsToReceivePointers(page)
  await expectWholeEntityRowToBeVisible(row)
  await expectTabToReachEntity(page, target)
  await expectWholeEntityRowToBeVisible(row)
  await target.click()
  await expect(popover).toBeVisible()
})

for (const width of [899, 900, 901]) {
  test(`mobile entity panel preserves pointer and keyboard access at ${width}px`, async ({ goto, page }) => {
    await page.setViewportSize({ width, height: 720 })
    await goto('/diagram')
    await setPgmlEditorValue(getPgmlEditor(page).first(), pointerAccessFixture)
    await page.locator('[data-mobile-quick-view="panel"]').click()
    await page.locator('[data-diagram-panel-tab="entities"]').click()
    await expect(page.locator('[data-browser-entity-row]')).toHaveCount(5)
    await expect(page.locator('[data-diagram-zoom-toolbar="true"]')).toHaveCount(0)
    await expect.poll(async () => {
      return page.locator('[data-diagram-panel="true"]').evaluate((panel) => {
        const viewport = document.querySelector('[data-diagram-viewport="true"]')

        if (!(viewport instanceof HTMLElement)) {
          throw new Error('Diagram viewport is unavailable.')
        }

        return viewport.getBoundingClientRect().bottom - panel.getBoundingClientRect().bottom
      })
    }).toBeLessThanOrEqual(2)

    const row = page.locator('[data-browser-entity-row="index:idx_products_search"]')
    const target = row.locator('button').first()

    await expectWholeEntityRowToBeVisible(row)
    await expectTabToReachEntity(page, target)
    await target.click()
    await page.locator('[data-mobile-quick-view="diagram"]').click()
    await expect(page.locator('[data-attachment-popover="index:idx_products_search"]')).toBeVisible()
    await expectToolbarControlsToReceivePointers(page)
  })
}
