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

test('connection lines hit grouped table borders, render above the owning group, and avoid the group header band', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = page.locator('[data-pgml-editor="true"]')
  const source = `TableGroup Core {
  tenants
}

TableGroup Commerce {
  orders
}

Table public.tenants in Core {
  id uuid [pk]
}

Table public.orders in Commerce {
  id uuid [pk]
  tenant_id uuid [ref: > public.tenants.id]
}`

  await editor.fill(source)
  await expect(page.locator('[data-node-anchor="group:Core"]')).toBeVisible()

  const diagnostics = await page.evaluate(() => {
    const group = document.querySelector('[data-node-anchor="group:Core"]')
    const groupSurface = document.querySelector('[data-group-surface="group:Core"]')
    const content = document.querySelector('[data-group-content="group:Core"]')
    const tenantsTable = document.querySelector('[data-table-anchor="public.tenants"]')
    const connectionLayers = Array.from(document.querySelectorAll('[data-connection-layer="true"]'))
    const path = connectionLayers.flatMap((layer) => {
      return Array.from(layer.querySelectorAll('path'))
    }).find((entry) => {
      return (entry.getAttribute('stroke') || '').length > 0
    })

    if (
      !(group instanceof HTMLElement)
      || !(groupSurface instanceof HTMLElement)
      || !(content instanceof HTMLElement)
      || !(tenantsTable instanceof HTMLElement)
      || connectionLayers.length === 0
      || !(path instanceof SVGPathElement)
    ) {
      return null
    }

    const segmentHitsRect = (
      from: { x: number, y: number },
      to: { x: number, y: number },
      rect: { left: number, right: number, top: number, bottom: number }
    ) => {
      if (Math.abs(from.x - to.x) < 0.5) {
        const x = from.x

        if (x < rect.left || x > rect.right) {
          return false
        }

        const minY = Math.min(from.y, to.y)
        const maxY = Math.max(from.y, to.y)

        return maxY > rect.top && minY < rect.bottom
      }

      const y = from.y

      if (y < rect.top || y > rect.bottom) {
        return false
      }

      const minX = Math.min(from.x, to.x)
      const maxX = Math.max(from.x, to.x)

      return maxX > rect.left && minX < rect.right
    }

    const pointMatches = Array.from((path.getAttribute('d') || '').matchAll(/[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g))
    const points = pointMatches.map((match) => {
      return {
        x: Number.parseFloat(match[1] || '0'),
        y: Number.parseFloat(match[2] || '0')
      }
    })
    const headerBand = {
      left: group.offsetLeft,
      right: group.offsetLeft + group.offsetWidth,
      top: group.offsetTop,
      bottom: group.offsetTop + content.offsetTop
    }
    const tenantsBounds = {
      left: tenantsTable.offsetLeft,
      right: tenantsTable.offsetLeft + tenantsTable.offsetWidth,
      top: tenantsTable.offsetTop,
      bottom: tenantsTable.offsetTop + tenantsTable.offsetHeight
    }
    const overlapsHeader = points.slice(1).some((point, index) => {
      return segmentHitsRect(points[index]!, point, headerBand)
    })
    const lineTouchesTenantsBorder = points.some((point) => {
      const onVerticalBorder = (
        (Math.abs(point.x - tenantsBounds.left) < 1 || Math.abs(point.x - tenantsBounds.right) < 1)
        && point.y >= tenantsBounds.top
        && point.y <= tenantsBounds.bottom
      )
      const onHorizontalBorder = (
        (Math.abs(point.y - tenantsBounds.top) < 1 || Math.abs(point.y - tenantsBounds.bottom) < 1)
        && point.x >= tenantsBounds.left
        && point.x <= tenantsBounds.right
      )

      return onVerticalBorder || onHorizontalBorder
    })

    return {
      groupZIndex: Number.parseInt(window.getComputedStyle(groupSurface).zIndex || '0', 10),
      maxLineZIndex: Math.max(...connectionLayers.map((layer) => {
        return Number.parseInt(window.getComputedStyle(layer).zIndex || '0', 10)
      })),
      stroke: path.getAttribute('stroke') || '',
      pointCount: points.length,
      overlapsHeader,
      lineTouchesTenantsBorder
    }
  })

  expect(diagnostics).not.toBeNull()
  expect(diagnostics?.maxLineZIndex || 0).toBeGreaterThan(diagnostics?.groupZIndex || 0)
  expect(diagnostics?.stroke).toBe('#8b5cf6')
  expect(diagnostics?.pointCount || 0).toBeLessThanOrEqual(4)
  expect(diagnostics?.overlapsHeader).toBe(false)
  expect(diagnostics?.lineTouchesTenantsBorder).toBe(true)
})
