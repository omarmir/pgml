import { expect, test } from '@nuxt/test-utils/playwright'

test.setTimeout(120_000)

test('table edit modal can rename a table and add a new grouped table', async ({ goto, page }) => {
  await goto('/diagram')

  await page.locator('[data-table-edit-button="public.users"]').click()
  await page.locator('[data-table-editor-name="true"]').fill('accounts')
  await page.locator('[data-table-editor-save="true"]').click()

  await expect(page.getByPlaceholder('Paste PGML here...')).toHaveValue(/TableGroup Core \{\n {2}tenants\n {2}accounts\n {2}roles/)
  await expect(page.getByPlaceholder('Paste PGML here...')).toHaveValue(/Table public\.accounts in Core \{/)

  await page.locator('[data-group-add-table="Core"]').click()
  await page.locator('[data-table-editor-name="true"]').fill('audit_log')
  await page.locator('[data-table-editor-save="true"]').click()

  await expect(page.getByPlaceholder('Paste PGML here...')).toHaveValue(/Table public\.audit_log in Core \{/)
  await expect(page.getByPlaceholder('Paste PGML here...')).toHaveValue(/TableGroup Core \{\n {2}tenants\n {2}accounts\n {2}roles\n {2}audit_log/)
})

test('canvas snaps dragged nodes to the grid and zooms around the mouse position', async ({ goto, page }) => {
  await goto('/diagram')

  await page.locator('[data-grid-snap-toggle="true"]').click()

  const coreHeader = page.locator('[data-node-header="group:Core"]')
  const coreNode = page.locator('[data-node-anchor="group:Core"]')
  const headerBox = await coreHeader.boundingBox()

  if (!headerBox) {
    throw new Error('Core group header is not measurable.')
  }

  await page.mouse.move(headerBox.x + headerBox.width / 2, headerBox.y + 20)
  await page.mouse.down()
  await page.mouse.move(headerBox.x + headerBox.width / 2 + 55, headerBox.y + 53)
  await page.mouse.up()

  const snappedPosition = await coreNode.evaluate((element) => {
    return {
      left: Number.parseInt(element.style.left || '0', 10),
      top: Number.parseInt(element.style.top || '0', 10)
    }
  })

  expect(snappedPosition.left % 18).toBe(0)
  expect(snappedPosition.top % 18).toBe(0)

  const beforeBox = await coreNode.boundingBox()

  if (!beforeBox) {
    throw new Error('Core group is not measurable before zoom.')
  }

  const zoomPoint = {
    x: beforeBox.x + beforeBox.width * 0.2,
    y: beforeBox.y + beforeBox.height * 0.2
  }
  const localPoint = {
    x: zoomPoint.x - beforeBox.x,
    y: zoomPoint.y - beforeBox.y
  }

  await page.mouse.move(zoomPoint.x, zoomPoint.y)
  await page.mouse.wheel(0, -180)

  const afterBox = await coreNode.boundingBox()

  if (!afterBox) {
    throw new Error('Core group is not measurable after zoom.')
  }

  const scaleRatio = afterBox.width / beforeBox.width
  const projectedPoint = {
    x: afterBox.x + localPoint.x * scaleRatio,
    y: afterBox.y + localPoint.y * scaleRatio
  }

  expect(Math.abs(projectedPoint.x - zoomPoint.x)).toBeLessThan(8)
  expect(Math.abs(projectedPoint.y - zoomPoint.y)).toBeLessThan(8)
})
