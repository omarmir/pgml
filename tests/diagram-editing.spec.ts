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

test('table edit modal autocompletes default values from the column type', async ({ goto, page }) => {
  await goto('/diagram')

  await page.locator('[data-table-edit-button="public.users"]').click()

  const displayNameColumn = page.locator('[data-table-editor-column]').filter({ hasText: 'display_name' })
  const columnTypeInput = displayNameColumn.getByLabel('Column type', { exact: true })
  const columnDefaultInput = displayNameColumn.getByLabel('Column default', { exact: true })

  await expect(columnDefaultInput).toHaveAttribute('placeholder', '\'\'')
  await columnDefaultInput.click()
  await expect(page.getByText(/^''$/)).toBeVisible()
  await expect(page.getByText(/^'pending'$/)).toBeVisible()

  await columnTypeInput.fill('boolean')
  await columnDefaultInput.click()

  await expect(columnDefaultInput).toHaveAttribute('placeholder', 'false')
  await expect(page.getByText(/^false$/)).toBeVisible()
  await expect(page.getByText(/^true$/)).toBeVisible()
})

test('canvas snaps dragged nodes to the grid and zooms around the mouse position', async ({ goto, page }) => {
  await goto('/diagram')

  await expect(page.locator('[data-grid-snap-toggle="true"]')).toHaveAttribute('aria-pressed', 'true')

  const coreHeader = page.locator('[data-node-header="group:Core"]')
  const coreNode = page.locator('[data-node-anchor="group:Core"]')
  const initialPosition = await coreNode.evaluate((element) => {
    return {
      left: Number.parseInt(element.style.left || '0', 10),
      top: Number.parseInt(element.style.top || '0', 10)
    }
  })
  const headerBox = await coreHeader.boundingBox()

  if (!headerBox) {
    throw new Error('Core group header is not measurable.')
  }

  await page.mouse.move(headerBox.x + headerBox.width / 2, headerBox.y + 20)
  await page.mouse.down()
  await page.mouse.move(headerBox.x + headerBox.width / 2 + 120, headerBox.y + 96, { steps: 8 })
  await page.mouse.up()

  await expect.poll(async () => {
    return coreNode.evaluate((element) => {
      return {
        left: Number.parseInt(element.style.left || '0', 10),
        top: Number.parseInt(element.style.top || '0', 10)
      }
    })
  }).not.toEqual(initialPosition)

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

test('connection routing stays stable when zoom changes', async ({ goto, page }) => {
  await goto('/diagram')

  const getConnectionPaths = () => {
    return page.evaluate(() => {
      return Array.from(document.querySelectorAll('[data-connection-layer="true"] path'))
        .map(path => path.getAttribute('d') || '')
        .filter(path => path.length > 0)
    })
  }

  await expect(page.locator('[data-connection-layer="true"] path').first()).toBeVisible()

  const viewport = page.locator('[data-diagram-viewport="true"]')
  const viewportBox = await viewport.boundingBox()

  if (!viewportBox) {
    throw new Error('Diagram viewport is not measurable.')
  }

  const zoomPoint = {
    x: viewportBox.x + viewportBox.width * 0.65,
    y: viewportBox.y + viewportBox.height * 0.35
  }

  const beforeZoomPaths = await getConnectionPaths()

  await page.mouse.move(zoomPoint.x, zoomPoint.y)
  await page.mouse.wheel(0, -180)

  await expect.poll(getConnectionPaths).toEqual(beforeZoomPaths)

  await page.mouse.wheel(0, 180)

  await expect.poll(getConnectionPaths).toEqual(beforeZoomPaths)
})

test('canvas interactions keep the PGML editor source in sync', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = page.getByPlaceholder('Paste PGML here...')
  const coreGroup = page.locator('[data-node-anchor="group:Core"]')

  await coreGroup.click()
  await page.locator('input[type="color"]').fill('#14b8a6')

  await expect(editor).toHaveValue(/Properties "group:Core" \{[\s\S]*color: #14b8a6/)

  const columnSlider = page.locator('[data-group-column-count-slider="true"]')

  await columnSlider.evaluate((element: HTMLInputElement) => {
    element.value = '2'
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })

  await expect(editor).toHaveValue(/Properties "group:Core" \{[\s\S]*table_columns: 2/)

  const coreHeader = page.locator('[data-node-header="group:Core"]')
  const headerBox = await coreHeader.boundingBox()

  if (!headerBox) {
    throw new Error('Core group header is not measurable.')
  }

  await page.mouse.move(headerBox.x + headerBox.width / 2, headerBox.y + 20)
  await page.mouse.down()
  await page.mouse.move(headerBox.x + headerBox.width / 2 + 55, headerBox.y + 53)
  await page.mouse.up()

  const groupPosition = await coreGroup.evaluate((element) => {
    return {
      x: Number.parseInt(element.style.left || '0', 10),
      y: Number.parseInt(element.style.top || '0', 10)
    }
  })

  await expect.poll(async () => {
    return editor.inputValue()
  }).toContain(`Properties "group:Core" {\n  x: ${groupPosition.x}\n  y: ${groupPosition.y}`)

  const customTypeNode = page.locator('[data-node-anchor="custom-type:Domain:email_address"]')
  const customTypeHeader = page.locator('[data-node-header="custom-type:Domain:email_address"]')

  await page.getByRole('button', { name: 'Expand email_address' }).click()

  const customTypeHeaderBox = await customTypeHeader.boundingBox()

  if (!customTypeHeaderBox) {
    throw new Error('Custom type header is not measurable.')
  }

  await page.mouse.move(customTypeHeaderBox.x + customTypeHeaderBox.width / 2, customTypeHeaderBox.y + 16)
  await page.mouse.down()
  await page.mouse.move(customTypeHeaderBox.x + customTypeHeaderBox.width / 2 + 52, customTypeHeaderBox.y + 64)
  await page.mouse.up()

  const customTypePosition = await customTypeNode.evaluate((element) => {
    return {
      x: Number.parseInt(element.style.left || '0', 10),
      y: Number.parseInt(element.style.top || '0', 10)
    }
  })

  await expect(editor).toHaveValue(new RegExp(`Properties "custom-type:Domain:email_address" \\{[\\s\\S]*x: ${customTypePosition.x}[\\s\\S]*y: ${customTypePosition.y}[\\s\\S]*collapsed: false`))
})

test('dragging a group or custom type preserves the current zoom and pan', async ({ goto, page }) => {
  await goto('/diagram')

  await page.getByRole('button', { name: 'Expand email_address' }).click()

  const plane = page.locator('[data-diagram-plane="true"]')
  const viewport = page.locator('[data-diagram-viewport="true"]')
  const viewportBox = await viewport.boundingBox()

  if (!viewportBox) {
    throw new Error('Diagram viewport is not measurable.')
  }

  const zoomPoint = {
    x: viewportBox.x + viewportBox.width * 0.5,
    y: viewportBox.y + viewportBox.height * 0.35
  }

  await page.mouse.move(zoomPoint.x, zoomPoint.y)
  await page.mouse.wheel(0, -180)

  const zoomedTransform = await plane.evaluate((element) => {
    return (element as HTMLElement).style.transform
  })

  const dragNodeBy = async (nodeId: string, deltaX: number, deltaY: number) => {
    const header = page.locator(`[data-node-header="${nodeId}"]`)
    const headerBox = await header.boundingBox()

    if (!headerBox) {
      throw new Error(`Node header is not measurable for ${nodeId}.`)
    }

    await page.mouse.move(headerBox.x + headerBox.width / 2, headerBox.y + 16)
    await page.mouse.down()
    await page.mouse.move(headerBox.x + headerBox.width / 2 + deltaX, headerBox.y + 16 + deltaY, { steps: 8 })
    await page.mouse.up()
  }

  await dragNodeBy('group:Core', 54, 36)

  await expect.poll(async () => {
    return plane.evaluate((element) => {
      return (element as HTMLElement).style.transform
    })
  }).toBe(zoomedTransform)

  await dragNodeBy('custom-type:Domain:email_address', 48, 42)

  await expect.poll(async () => {
    return plane.evaluate((element) => {
      return (element as HTMLElement).style.transform
    })
  }).toBe(zoomedTransform)
})
