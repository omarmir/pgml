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

test('studio canvas stays viewport-bound and starts centered on the diagram', async ({ goto, page }) => {
  await goto('/diagram')

  await expect(page.locator('[data-node-anchor="group:Core"]')).toBeVisible()

  const diagnostics = await page.evaluate(() => {
    const documentElement = document.documentElement
    const nodeElements = Array.from(document.querySelectorAll('[data-node-anchor]')).filter((element): element is HTMLElement => {
      return element instanceof HTMLElement
    })

    if (!nodeElements.length) {
      return null
    }

    const nodeRects = nodeElements.map((element) => {
      return element.getBoundingClientRect()
    })
    const minX = Math.min(...nodeRects.map(rect => rect.left))
    const maxX = Math.max(...nodeRects.map(rect => rect.right))
    const minY = Math.min(...nodeRects.map(rect => rect.top))
    const maxY = Math.max(...nodeRects.map(rect => rect.bottom))

    return {
      hasHorizontalScroll: documentElement.scrollWidth > window.innerWidth + 1,
      hasVerticalScroll: documentElement.scrollHeight > window.innerHeight + 1,
      centerOffsetX: Math.round(((minX + maxX) / 2) - (window.innerWidth / 2)),
      centerOffsetY: Math.round(((minY + maxY) / 2) - (window.innerHeight / 2))
    }
  })

  expect(diagnostics).not.toBeNull()
  expect(diagnostics?.hasHorizontalScroll).toBe(false)
  expect(diagnostics?.hasVerticalScroll).toBe(false)
  expect(Math.abs(diagnostics?.centerOffsetX || 0)).toBeLessThan(180)
  expect(Math.abs(diagnostics?.centerOffsetY || 0)).toBeLessThan(120)
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

  // The canvas is scaled with a CSS transform, so use offsetWidth to assert the stored node width.
  await expect.poll(async () => {
    return commerceGroup.evaluate((element) => {
      return Math.round(element.offsetWidth)
    })
  }).toBeGreaterThanOrEqual(520)

  await page.waitForTimeout(250)

  const settledWidth = await commerceGroup.evaluate((element) => {
    return Math.round(element.offsetWidth)
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
      return Math.round(element.offsetWidth)
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
  name text
}

Table public.orders in Commerce {
  id uuid [pk]
  tenant_id uuid [ref: > public.tenants.id]
}`

  await editor.fill(source)
  await expect(page.locator('[data-node-anchor="group:Core"]')).toBeVisible()

  const coreGroup = page.locator('[data-node-anchor="group:Core"]')
  const initialGroupHeight = await coreGroup.evaluate((element) => {
    return Math.round(element.getBoundingClientRect().height)
  })

  await page.waitForTimeout(250)

  await expect.poll(async () => {
    return coreGroup.evaluate((element) => {
      return Math.round(element.getBoundingClientRect().height)
    })
  }).toBe(initialGroupHeight)

  const diagnostics = await page.evaluate(() => {
    const group = document.querySelector('[data-node-anchor="group:Core"]')
    const groupSurface = document.querySelector('[data-group-surface="group:Core"]')
    const content = document.querySelector('[data-group-content="group:Core"]')
    const tenantsTable = document.querySelector('[data-table-anchor="public.tenants"]')
    const tenantsIdLabel = document.querySelector('[data-column-label-anchor="public.tenants.id"]')
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
      || !(tenantsIdLabel instanceof HTMLElement)
      || connectionLayers.length === 0
      || !(path instanceof SVGPathElement)
    ) {
      return null
    }

    const plane = group.parentElement

    if (!(plane instanceof HTMLElement)) {
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
    const getOffsetWithinPlane = (element: HTMLElement) => {
      let current: HTMLElement | null = element
      let x = 0
      let y = 0

      while (current && current !== plane) {
        x += current.offsetLeft
        y += current.offsetTop
        current = current.offsetParent instanceof HTMLElement ? current.offsetParent : null
      }

      return { x, y }
    }
    const groupOffset = getOffsetWithinPlane(group)
    const contentOffset = getOffsetWithinPlane(content)
    const tenantsOffset = getOffsetWithinPlane(tenantsTable)
    const headerBand = {
      left: groupOffset.x,
      right: groupOffset.x + group.offsetWidth,
      top: groupOffset.y,
      bottom: contentOffset.y
    }
    const tenantsBounds = {
      left: tenantsOffset.x,
      right: tenantsOffset.x + tenantsTable.offsetWidth,
      top: tenantsOffset.y,
      bottom: tenantsOffset.y + tenantsTable.offsetHeight
    }
    const groupBounds = {
      left: groupOffset.x,
      right: groupOffset.x + group.offsetWidth,
      top: groupOffset.y,
      bottom: groupOffset.y + group.offsetHeight
    }
    const tenantsIdLabelOffset = getOffsetWithinPlane(tenantsIdLabel)
    const tenantsIdTargetY = tenantsIdLabelOffset.y + tenantsIdLabel.offsetHeight / 2
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
    const lineTouchesTenantsIdBorder = points.some((point) => {
      return (
        (Math.abs(point.x - tenantsBounds.left) < 1 || Math.abs(point.x - tenantsBounds.right) < 1)
        && Math.abs(point.y - tenantsIdTargetY) < 1.5
      )
    })
    const tableFitsWithinGroup = (
      tenantsBounds.left >= groupBounds.left - 1
      && tenantsBounds.right <= groupBounds.right + 1
      && tenantsBounds.top >= groupBounds.top - 1
      && tenantsBounds.bottom <= groupBounds.bottom + 1
    )

    return {
      groupOverflow: window.getComputedStyle(group).overflow,
      groupZIndex: Number.parseInt(window.getComputedStyle(groupSurface).zIndex || '0', 10),
      maxLineZIndex: Math.max(...connectionLayers.map((layer) => {
        return Number.parseInt(window.getComputedStyle(layer).zIndex || '0', 10)
      })),
      stroke: path.getAttribute('stroke') || '',
      pointCount: points.length,
      overlapsHeader,
      lineTouchesTenantsBorder,
      lineTouchesTenantsIdBorder,
      tableFitsWithinGroup
    }
  })

  expect(diagnostics).not.toBeNull()
  expect(diagnostics?.groupOverflow).toBe('hidden')
  expect(diagnostics?.maxLineZIndex || 0).toBeGreaterThan(diagnostics?.groupZIndex || 0)
  expect(diagnostics?.stroke).toBe('#8b5cf6')
  expect(diagnostics?.pointCount || 0).toBeLessThanOrEqual(4)
  expect(diagnostics?.overlapsHeader).toBe(false)
  expect(diagnostics?.lineTouchesTenantsBorder).toBe(true)
  expect(diagnostics?.lineTouchesTenantsIdBorder).toBe(true)
  expect(diagnostics?.tableFitsWithinGroup).toBe(true)
})

test('field rows expose multiple side anchors and prefer unused points on the same row', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = page.locator('[data-pgml-editor="true"]')
  const source = `TableGroup Core {
  tenants
}

TableGroup Commerce {
  orders
  invoices
}

Table public.tenants in Core {
  id uuid [pk]
  name text
}

Table public.orders in Commerce {
  id uuid [pk]
  tenant_id uuid [ref: > public.tenants.id]
}

Table public.invoices in Commerce {
  id uuid [pk]
  tenant_id uuid [ref: > public.tenants.id]
}`

  await editor.fill(source)
  await expect(page.locator('[data-table-anchor="public.tenants"]')).toBeVisible()

  const diagnostics = await page.evaluate(() => {
    const coreGroup = document.querySelector('[data-node-anchor="group:Core"]')
    const tenantsTable = document.querySelector('[data-table-anchor="public.tenants"]')
    const tenantsIdLabel = document.querySelector('[data-column-label-anchor="public.tenants.id"]')
    const connectionLayers = Array.from(document.querySelectorAll('[data-connection-layer="true"]'))
    const paths = connectionLayers.flatMap((layer) => {
      return Array.from(layer.querySelectorAll('path'))
    }).filter((entry) => {
      return (entry.getAttribute('stroke') || '').length > 0
    })

    if (
      !(coreGroup instanceof HTMLElement)
      || !(tenantsTable instanceof HTMLElement)
      || !(tenantsIdLabel instanceof HTMLElement)
      || paths.length < 2
    ) {
      return null
    }

    const plane = coreGroup.parentElement

    if (!(plane instanceof HTMLElement)) {
      return null
    }

    const getOffsetWithinPlane = (element: HTMLElement) => {
      let current: HTMLElement | null = element
      let x = 0
      let y = 0

      while (current && current !== plane) {
        x += current.offsetLeft
        y += current.offsetTop
        current = current.offsetParent instanceof HTMLElement ? current.offsetParent : null
      }

      return { x, y }
    }

    const tenantsBounds = {
      left: getOffsetWithinPlane(tenantsTable).x,
      right: getOffsetWithinPlane(tenantsTable).x + tenantsTable.offsetWidth,
      top: getOffsetWithinPlane(tenantsTable).y,
      bottom: getOffsetWithinPlane(tenantsTable).y + tenantsTable.offsetHeight
    }
    const idLabelOffset = getOffsetWithinPlane(tenantsIdLabel)
    const idRowTop = idLabelOffset.y
    const idRowBottom = idLabelOffset.y + tenantsIdLabel.offsetHeight
    const endpointYs = paths.flatMap((path) => {
      const pointMatches = Array.from((path.getAttribute('d') || '').matchAll(/[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g))

      return pointMatches.map((match) => {
        return {
          x: Number.parseFloat(match[1] || '0'),
          y: Number.parseFloat(match[2] || '0')
        }
      }).filter((point) => {
        return (
          (Math.abs(point.x - tenantsBounds.left) < 1 || Math.abs(point.x - tenantsBounds.right) < 1)
          && point.y >= idRowTop - 1
          && point.y <= idRowBottom + 1
        )
      }).map(point => Math.round(point.y * 10) / 10)
    })

    return {
      endpointYs: Array.from(new Set(endpointYs)).sort((left, right) => left - right)
    }
  })

  expect(diagnostics).not.toBeNull()
  expect(diagnostics?.endpointYs.length || 0).toBeGreaterThanOrEqual(2)
})
