import { expect, test } from '@nuxt/test-utils/playwright'

test.setTimeout(120_000)

test('studio editor panel can expand beyond its default width', async ({ goto, page }) => {
  await goto('/diagram')

  const editorPanel = page.locator('[data-editor-panel="true"]')
  const resizeHandle = page.locator('[data-editor-resize-handle="true"]')

  await expect(editorPanel).toBeVisible()
  await expect(resizeHandle).toBeVisible()
  await expect(resizeHandle).toHaveCSS('cursor', 'ew-resize')

  const initialWidth = await editorPanel.evaluate((element) => {
    return Math.round(element.getBoundingClientRect().width)
  })

  expect(initialWidth).toBeGreaterThanOrEqual(320)

  const handleBox = await resizeHandle.boundingBox()

  if (!handleBox) {
    throw new Error('Resize handle is not measurable.')
  }

  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 180, handleBox.y + handleBox.height / 2)
  await page.mouse.up()

  await expect.poll(async () => {
    return editorPanel.evaluate((element) => {
      return Math.round(element.getBoundingClientRect().width)
    })
  }).toBeGreaterThan(initialWidth + 120)
})

test('table groups keep their required width after changing the table column count', async ({ goto, page }) => {
  await goto('/diagram')

  const commerceGroup = page.locator('[data-node-anchor="group:Commerce"]')

  await commerceGroup.click()
  await expect(page.locator('[data-group-column-count-slider="true"]')).toBeVisible()

  const slider = page.locator('[data-group-column-count-slider="true"]')

  await slider.evaluate((element: HTMLInputElement) => {
    element.value = '2'
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })

  await expect.poll(async () => {
    return commerceGroup.evaluate((element) => {
      return Math.round(element.getBoundingClientRect().width)
    })
  }).toBeGreaterThanOrEqual(520)

  await page.waitForTimeout(250)

  const settledWidth = await commerceGroup.evaluate((element) => {
    return Math.round(element.getBoundingClientRect().width)
  })

  expect(settledWidth).toBeGreaterThanOrEqual(520)

  const headerBox = await page.locator('[data-node-header="group:Commerce"]').boundingBox()

  if (!headerBox) {
    throw new Error('Group header is not measurable.')
  }

  await page.mouse.move(headerBox.x + headerBox.width / 2, headerBox.y + 18)
  await page.mouse.down()
  await page.mouse.move(headerBox.x + headerBox.width / 2 + 140, headerBox.y + 42)
  await page.mouse.up()

  await expect.poll(async () => {
    return commerceGroup.evaluate((element) => {
      return Math.round(element.getBoundingClientRect().width)
    })
  }).toBe(settledWidth)
})

test('table groups keep independent table heights and balanced horizontal padding', async ({ goto, page }) => {
  await goto('/diagram')

  const coreGroup = page.locator('[data-node-anchor="group:Core"]')

  await coreGroup.click()
  await expect(page.locator('[data-group-column-count-slider="true"]')).toBeVisible()

  const slider = page.locator('[data-group-column-count-slider="true"]')

  await slider.evaluate((element: HTMLInputElement) => {
    element.value = '2'
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })

  await expect.poll(async () => {
    return coreGroup.evaluate((element) => {
      const tenantsTable = element.querySelector('[data-table-anchor="public.tenants"]')
      const usersTable = element.querySelector('[data-table-anchor="public.users"]')

      if (!(tenantsTable instanceof HTMLElement) || !(usersTable instanceof HTMLElement)) {
        return null
      }

      return {
        tenantsHeight: Math.round(tenantsTable.getBoundingClientRect().height),
        usersHeight: Math.round(usersTable.getBoundingClientRect().height)
      }
    })
  }).toEqual({
    tenantsHeight: expect.any(Number),
    usersHeight: expect.any(Number)
  })

  const layout = await coreGroup.evaluate((element) => {
    const content = element.querySelector('[data-group-content="group:Core"]')
    const tenantsTable = element.querySelector('[data-table-anchor="public.tenants"]')
    const usersTable = element.querySelector('[data-table-anchor="public.users"]')

    if (
      !(content instanceof HTMLElement)
      || !(tenantsTable instanceof HTMLElement)
      || !(usersTable instanceof HTMLElement)
    ) {
      return null
    }

    const groupBounds = element.getBoundingClientRect()
    const contentBounds = content.getBoundingClientRect()

    return {
      leftGap: Math.round(contentBounds.left - groupBounds.left),
      rightGap: Math.round(groupBounds.right - contentBounds.right),
      tenantsHeight: Math.round(tenantsTable.getBoundingClientRect().height),
      usersHeight: Math.round(usersTable.getBoundingClientRect().height)
    }
  })

  expect(layout).not.toBeNull()
  expect(Math.abs((layout?.leftGap || 0) - (layout?.rightGap || 0))).toBeLessThanOrEqual(2)
  expect(layout?.usersHeight || 0).toBeGreaterThan(layout?.tenantsHeight || 0)
})
