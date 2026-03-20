import { expect, test } from '@nuxt/test-utils/playwright'
import { getPgmlEditor, readPgmlEditorValue, setPgmlEditorValue } from './helpers/pgml-editor'

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

test('studio editor panel can be hidden and shown again', async ({ goto, page }) => {
  await goto('/diagram')

  const editorPanel = page.locator('[data-editor-panel="true"]')
  const editorToggle = page.locator('[data-editor-visibility-toggle="true"]')

  await expect(editorPanel).toBeVisible()
  await expect(editorToggle).toContainText('Hide PGML')

  await editorToggle.click()

  await expect(page.locator('[data-editor-panel="true"]')).toHaveCount(0)
  await expect(page.locator('[data-editor-resize-handle="true"]')).toHaveCount(0)
  await expect(editorToggle).toContainText('Show PGML')

  await editorToggle.click()

  await expect(page.locator('[data-editor-panel="true"]')).toBeVisible()
  await expect(page.locator('[data-editor-resize-handle="true"]')).toBeVisible()
  await expect(getPgmlEditor(page)).toBeVisible()

  const toggleStyles = await editorToggle.evaluate((element) => {
    const styles = window.getComputedStyle(element)

    return {
      borderRadius: styles.borderRadius,
      fontFamily: styles.fontFamily,
      textTransform: styles.textTransform
    }
  })

  expect(toggleStyles.borderRadius).toBe('0px')
  expect(toggleStyles.fontFamily).toContain('IBM Plex Mono')
  expect(toggleStyles.textTransform).toBe('uppercase')
})

test('studio editor resize grip stays centered on a single divider line', async ({ goto, page }) => {
  await goto('/diagram')

  const resizeHandle = page.locator('[data-editor-resize-handle="true"]')
  const divider = page.locator('[data-editor-resize-divider="true"]')
  const grip = page.locator('[data-editor-resize-grip="true"]')

  await expect(resizeHandle).toBeVisible()
  await expect(divider).toBeVisible()
  await expect(grip).toBeVisible()

  const metrics = await Promise.all([
    resizeHandle.evaluate((element) => {
      const rect = element.getBoundingClientRect()

      return {
        width: rect.width
      }
    }),
    divider.evaluate((element) => {
      const rect = element.getBoundingClientRect()

      return {
        centerX: rect.left + (rect.width / 2),
        width: rect.width
      }
    }),
    grip.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      const styles = window.getComputedStyle(element)

      return {
        centerX: rect.left + (rect.width / 2),
        rightProbeX: rect.right - 2,
        probeY: rect.top + (rect.height / 2),
        borderRadius: styles.borderRadius
      }
    })
  ])

  const [handleMetrics, dividerMetrics, gripMetrics] = metrics

  expect(handleMetrics.width).toBeLessThanOrEqual(2)
  expect(dividerMetrics.width).toBeLessThanOrEqual(2)
  expect(Math.abs(dividerMetrics.centerX - gripMetrics.centerX)).toBeLessThanOrEqual(1)
  expect(gripMetrics.borderRadius).toBe('0px')

  const rightEdgeOwner = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y)

    if (!(element instanceof HTMLElement)) {
      return null
    }

    return element.closest('[data-editor-resize-handle="true"]')?.getAttribute('data-editor-resize-handle')
      || element.closest('[data-editor-resize-grip="true"]')?.getAttribute('data-editor-resize-grip')
      || null
  }, {
    x: gripMetrics.rightProbeX,
    y: gripMetrics.probeY
  })

  expect(rightEdgeOwner).not.toBeNull()
})

test('diagram panel reuses the PGML editor scrollbar styling', async ({ goto, page }) => {
  await goto('/diagram')

  await page.locator('[data-diagram-panel-tab="entities"]').click()

  const scrollbarStyles = await page.evaluate(() => {
    const editorScroller = document.querySelector('[data-pgml-editor-scroller="true"]')
    const panelScroller = document.querySelector('[data-diagram-panel-scroll="true"]')

    if (!(editorScroller instanceof HTMLElement) || !(panelScroller instanceof HTMLElement)) {
      return null
    }

    const readScrollbarWidth = (styles: CSSStyleDeclaration) => {
      const width = styles.getPropertyValue('scrollbar-width').trim()

      if (width.length > 0) {
        return width
      }

      return (styles as CSSStyleDeclaration & { scrollbarWidth?: string }).scrollbarWidth || ''
    }

    const readScrollbarColor = (styles: CSSStyleDeclaration) => {
      const color = styles.getPropertyValue('scrollbar-color').trim()

      if (color.length > 0) {
        return color
      }

      return (styles as CSSStyleDeclaration & { scrollbarColor?: string }).scrollbarColor || ''
    }

    const editorStyles = window.getComputedStyle(editorScroller)
    const panelStyles = window.getComputedStyle(panelScroller)

    return {
      editorScrollbarWidth: readScrollbarWidth(editorStyles),
      panelScrollbarWidth: readScrollbarWidth(panelStyles),
      editorScrollbarColor: readScrollbarColor(editorStyles),
      panelScrollbarColor: readScrollbarColor(panelStyles)
    }
  })

  expect(scrollbarStyles).not.toBeNull()
  expect(scrollbarStyles?.editorScrollbarWidth).toBe('thin')
  expect(scrollbarStyles?.panelScrollbarWidth).toBe('thin')
  expect(scrollbarStyles?.panelScrollbarColor).toBe(scrollbarStyles?.editorScrollbarColor)
})

test('studio canvas stays viewport-bound and starts centered on the diagram', async ({ goto, page }) => {
  await goto('/diagram')

  await expect(page.locator('[data-node-anchor="group:Core"]')).toBeVisible()
  await expect(page.locator('[data-grid-snap-toggle="true"]')).toHaveAttribute('aria-pressed', 'true')

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

test('studio header aligns the navigation with the page title copy', async ({ goto, page }) => {
  await goto('/diagram')

  const tagline = page.getByText('Postgres in markup').first()
  const headerNav = page.locator('header nav')
  const specLink = headerNav.getByRole('link', { name: 'Spec', exact: true })
  const studioLink = headerNav.getByRole('link', { name: 'Diagram Studio', exact: true })

  await expect(tagline).toBeVisible()
  await expect(specLink).toBeVisible()
  await expect(studioLink).toBeVisible()

  const headerMetrics = await Promise.all([
    tagline.evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const rect = range.getBoundingClientRect()

      return {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        fontSize: Number.parseFloat(window.getComputedStyle(element).fontSize)
      }
    }),
    specLink.evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const rect = range.getBoundingClientRect()

      return {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom)
      }
    }),
    studioLink.evaluate((element) => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const rect = range.getBoundingClientRect()

      return {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom)
      }
    })
  ])

  const [taglineRect, specRect, studioRect] = headerMetrics

  expect(taglineRect.fontSize).toBeGreaterThanOrEqual(16)
  expect(Math.abs(specRect.top - taglineRect.top)).toBeLessThanOrEqual(4)
  expect(Math.abs(specRect.bottom - taglineRect.bottom)).toBeLessThanOrEqual(4)
  expect(Math.abs(studioRect.top - taglineRect.top)).toBeLessThanOrEqual(4)
  expect(Math.abs(studioRect.bottom - taglineRect.bottom)).toBeLessThanOrEqual(4)
})

test('table groups keep their required width after changing the table column count', async ({ goto, page }) => {
  await goto('/diagram')

  const commerceGroup = page.locator('[data-node-anchor="group:Commerce"]')

  await commerceGroup.dispatchEvent('click')
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

  await coreGroup.dispatchEvent('click')
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

  const editor = getPgmlEditor(page)
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

  await setPgmlEditorValue(editor, source)
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

    const contentForeground = content?.parentElement

    if (
      !(group instanceof HTMLElement)
      || !(groupSurface instanceof HTMLElement)
      || !(content instanceof HTMLElement)
      || !(contentForeground instanceof HTMLElement)
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
      contentZIndex: Number.parseInt(window.getComputedStyle(contentForeground).zIndex || '0', 10),
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
  expect(diagnostics?.maxLineZIndex || 0).toBeLessThan(diagnostics?.contentZIndex || 0)
  expect(diagnostics?.stroke).toBe('#8b5cf6')
  expect(diagnostics?.pointCount || 0).toBeLessThanOrEqual(4)
  expect(diagnostics?.overlapsHeader).toBe(false)
  expect(diagnostics?.lineTouchesTenantsBorder).toBe(true)
  expect(diagnostics?.lineTouchesTenantsIdBorder).toBe(true)
  expect(diagnostics?.tableFitsWithinGroup).toBe(true)
})

test('field rows expose multiple side anchors and prefer unused points on the same row', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)
  const source = `TableGroup Core {
  tenants
}

TableGroup Commerce {
  orders
  invoices
  payments
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
}

Table public.payments in Commerce {
  id uuid [pk]
  tenant_id uuid [ref: > public.tenants.id]
}`

  await setPgmlEditorValue(editor, source)
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
      || paths.length < 3
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
  expect(diagnostics?.endpointYs.length || 0).toBeGreaterThanOrEqual(3)
})

test('shared-group reference lanes keep their first bend close to the table edge', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)
  const source = `TableGroup Commerce {
  products
  orders
  order_items
}

Table public.products in Commerce {
  id uuid [pk]
}

Table public.orders in Commerce {
  id uuid [pk]
}

Table public.order_items in Commerce {
  id uuid [pk]
  order_id uuid [ref: > public.orders.id]
  product_id uuid [ref: > public.products.id]
}`

  await setPgmlEditorValue(editor, source)
  await expect(page.locator('[data-table-anchor="public.products"]')).toBeVisible()

  const diagnostics = await page.evaluate(() => {
    const connectionLayers = Array.from(document.querySelectorAll('[data-connection-layer="true"]'))
    const paths = connectionLayers.flatMap((layer) => {
      return Array.from(layer.querySelectorAll('path'))
    }).filter((entry) => {
      return entry.getAttribute('stroke') === '#f59e0b'
    })

    if (paths.length < 2) {
      return null
    }

    const bendDistances = paths.map((path) => {
      const points = Array.from((path.getAttribute('d') || '').matchAll(/[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)).map((match) => {
        return {
          x: Number.parseFloat(match[1] || '0'),
          y: Number.parseFloat(match[2] || '0')
        }
      })

      if (points.length < 4) {
        return null
      }

      const startBendDistance = Math.abs(points[1]!.x - points[0]!.x) + Math.abs(points[1]!.y - points[0]!.y)
      const endBendDistance = Math.abs(points.at(-2)!.x - points.at(-1)!.x) + Math.abs(points.at(-2)!.y - points.at(-1)!.y)

      return Math.min(startBendDistance, endBendDistance)
    }).filter((distance): distance is number => Number.isFinite(distance))

    return {
      bendDistances
    }
  })

  expect(diagnostics).not.toBeNull()
  expect(diagnostics?.bendDistances).toHaveLength(2)
  expect(Math.max(...(diagnostics?.bendDistances || [0]))).toBeLessThanOrEqual(24)
})

test('external table references flip endpoint sides instead of backtracking through the table when groups are packed closely', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)
  const source = `TableGroup Core {
  tenants
  roles
  users
}

TableGroup Programs {
  common_entity
  funding_opportunity_profile
}

Table public.tenants in Core {
  id uuid [pk]
}

Table public.roles in Core {
  id uuid [pk]
}

Table public.users in Core {
  id uuid [pk]
  tenant_id uuid [ref: > public.tenants.id]
}

Table public.common_entity in Programs {
  id bigint [pk]
}

Table public.funding_opportunity_profile in Programs {
  id bigint [pk]
  tenant_id uuid [ref: > public.tenants.id]
  owner_id uuid [ref: > public.users.id]
}

Properties "group:Core" {
  x: 360
  y: 40
}

Properties "group:Programs" {
  x: 220
  y: 200
}`

  await setPgmlEditorValue(editor, source)
  await expect(page.locator('[data-table-anchor="public.funding_opportunity_profile"]')).toBeVisible()

  const diagnostics = await page.evaluate(() => {
    const coreGroup = document.querySelector('[data-node-anchor="group:Core"]')
    const fundingTable = document.querySelector('[data-table-anchor="public.funding_opportunity_profile"]')
    const tenantsTable = document.querySelector('[data-table-anchor="public.tenants"]')
    const usersTable = document.querySelector('[data-table-anchor="public.users"]')

    if (
      !(coreGroup instanceof HTMLElement)
      || !(fundingTable instanceof HTMLElement)
      || !(tenantsTable instanceof HTMLElement)
      || !(usersTable instanceof HTMLElement)
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

    const getBounds = (element: HTMLElement) => {
      const offset = getOffsetWithinPlane(element)

      return {
        left: offset.x,
        right: offset.x + element.offsetWidth,
        top: offset.y,
        bottom: offset.y + element.offsetHeight,
        centerX: offset.x + element.offsetWidth / 2
      }
    }

    const fundingBounds = getBounds(fundingTable)
    const tenantsBounds = getBounds(tenantsTable)
    const usersBounds = getBounds(usersTable)
    const paths = Array.from(document.querySelectorAll('[data-connection-layer="true"] path')).map((path) => {
      const points = Array.from((path.getAttribute('d') || '').matchAll(/[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)).map((match) => {
        return {
          x: Number.parseFloat(match[1] || '0'),
          y: Number.parseFloat(match[2] || '0')
        }
      })

      return {
        stroke: path.getAttribute('stroke') || '',
        points
      }
    }).filter(entry => entry.stroke === '#8b5cf6')

    const mismatches = paths.flatMap((path) => {
      const start = path.points[0]
      const end = path.points.at(-1)

      if (!start || !end) {
        return []
      }

      const startsFromFunding = Math.abs(start.x - fundingBounds.left) < 1 || Math.abs(start.x - fundingBounds.right) < 1

      if (!startsFromFunding) {
        return []
      }

      const firstVerticalIndex = path.points.slice(1).findIndex((point, index) => {
        const previous = path.points[index]

        return Boolean(
          previous
          && Math.abs(previous.x - point.x) < 0.5
          && Math.abs(previous.y - point.y) > 0.5
        )
      })
      const lastVerticalIndex = [...path.points.keys()].slice(1).reverse().find((index) => {
        const previous = path.points[index - 1]
        const point = path.points[index]

        return Boolean(
          previous
          && point
          && Math.abs(previous.x - point.x) < 0.5
          && Math.abs(previous.y - point.y) > 0.5
        )
      })

      const startSide = Math.abs(start.x - fundingBounds.left) < 1 ? 'left' : 'right'
      const startLaneX = firstVerticalIndex >= 0 ? path.points[firstVerticalIndex + 1]?.x : null
      const endBounds = (
        Math.abs(end.x - tenantsBounds.left) < 1 || Math.abs(end.x - tenantsBounds.right) < 1
      )
        ? tenantsBounds
        : (
            Math.abs(end.x - usersBounds.left) < 1 || Math.abs(end.x - usersBounds.right) < 1
          )
            ? usersBounds
            : null
      const endSide = !endBounds
        ? null
        : Math.abs(end.x - endBounds.left) < 1
          ? 'left'
          : 'right'
      const endLaneX = typeof lastVerticalIndex === 'number' ? path.points[lastVerticalIndex]?.x : null
      const startMismatch = typeof startLaneX === 'number' && (
        startLaneX < fundingBounds.centerX ? startSide !== 'left' : startSide !== 'right'
      )
      const endMismatch = Boolean(
        endBounds
        && endSide
        && typeof endLaneX === 'number'
        && (endLaneX < endBounds.centerX ? endSide !== 'left' : endSide !== 'right')
      )

      return startMismatch || endMismatch
        ? [{
            startSide,
            startLaneX,
            fundingCenterX: fundingBounds.centerX,
            endSide,
            endLaneX,
            endCenterX: endBounds?.centerX || null,
            points: path.points
          }]
        : []
    })

    return {
      mismatchCount: mismatches.length,
      mismatches
    }
  })

  expect(diagnostics).not.toBeNull()
  expect(diagnostics?.mismatchCount).toBe(0)
})

test('full-sample program references keep their endpoint segments moving outward when Programs is packed near Core', async ({ goto, page }) => {
  await goto('/diagram')

  const editor = getPgmlEditor(page)
  const baseSource = await readPgmlEditorValue(editor)
  const source = `${baseSource}

Properties "group:Programs" {
  x: 220
  y: 200
}`

  await setPgmlEditorValue(editor, source)
  await expect(page.locator('[data-table-anchor="public.funding_opportunity_profile"]')).toBeVisible()

  const diagnostics = await page.evaluate(() => {
    const plane = document.querySelector('[data-connection-layer="true"]')?.parentElement

    if (!(plane instanceof HTMLElement)) {
      return null
    }

    const planeRect = plane.getBoundingClientRect()
    const scaleMatch = (plane.getAttribute('style') || '').match(/scale\(([^)]+)\)/)
    const scale = scaleMatch ? Number.parseFloat(scaleMatch[1] || '1') : 1

    const getBounds = (element: HTMLElement) => {
      const rect = element.getBoundingClientRect()

      return {
        left: (rect.left - planeRect.left) / scale,
        right: (rect.right - planeRect.left) / scale,
        top: (rect.top - planeRect.top) / scale,
        bottom: (rect.bottom - planeRect.top) / scale,
        label: element.getAttribute('data-table-anchor') || element.getAttribute('data-node-anchor') || ''
      }
    }

    const hosts = Array.from(document.querySelectorAll('[data-table-anchor], [data-node-anchor]')).filter((element): element is HTMLElement => {
      return element instanceof HTMLElement
    }).map(getBounds)

    const resolveHost = (point: { x: number, y: number }) => {
      return hosts.find((bounds) => {
        return point.x >= bounds.left - 1
          && point.x <= bounds.right + 1
          && point.y >= bounds.top - 1
          && point.y <= bounds.bottom + 1
          && (
            Math.abs(point.x - bounds.left) < 1
            || Math.abs(point.x - bounds.right) < 1
            || Math.abs(point.y - bounds.top) < 1
            || Math.abs(point.y - bounds.bottom) < 1
          )
      }) || null
    }

    const issues = Array.from(document.querySelectorAll('[data-connection-layer="true"] path')).flatMap((path, index) => {
      const points = Array.from((path.getAttribute('d') || '').matchAll(/[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)).map((match) => {
        return {
          x: Number.parseFloat(match[1] || '0'),
          y: Number.parseFloat(match[2] || '0')
        }
      })
      const stroke = path.getAttribute('stroke') || ''
      const start = points[0]
      const next = points[1]
      const end = points.at(-1)
      const previous = points.at(-2)
      const fromHost = start ? resolveHost(start) : null
      const toHost = end ? resolveHost(end) : null
      const touchesFundingProfile = fromHost?.label === 'public.funding_opportunity_profile' || toHost?.label === 'public.funding_opportunity_profile'

      if (stroke !== '#8b5cf6' || !touchesFundingProfile || !start || !end) {
        return []
      }

      const pathIssues: Array<{ at: 'from' | 'to', host: string, side: 'left' | 'right', adjacentX: number, anchorX: number }> = []

      if (fromHost && next && Math.abs(start.y - next.y) < 0.5) {
        const fromSide = Math.abs(start.x - fromHost.left) < 1 ? 'left' : Math.abs(start.x - fromHost.right) < 1 ? 'right' : null

        if (fromSide === 'left' && next.x > start.x + 0.5) {
          pathIssues.push({
            at: 'from',
            host: fromHost.label,
            side: fromSide,
            adjacentX: next.x,
            anchorX: start.x
          })
        }

        if (fromSide === 'right' && next.x < start.x - 0.5) {
          pathIssues.push({
            at: 'from',
            host: fromHost.label,
            side: fromSide,
            adjacentX: next.x,
            anchorX: start.x
          })
        }
      }

      if (toHost && previous && Math.abs(previous.y - end.y) < 0.5) {
        const toSide = Math.abs(end.x - toHost.left) < 1 ? 'left' : Math.abs(end.x - toHost.right) < 1 ? 'right' : null

        if (toSide === 'left' && previous.x > end.x + 0.5) {
          pathIssues.push({
            at: 'to',
            host: toHost.label,
            side: toSide,
            adjacentX: previous.x,
            anchorX: end.x
          })
        }

        if (toSide === 'right' && previous.x < end.x - 0.5) {
          pathIssues.push({
            at: 'to',
            host: toHost.label,
            side: toSide,
            adjacentX: previous.x,
            anchorX: end.x
          })
        }
      }

      return pathIssues.length
        ? [{
            index,
            from: fromHost?.label || null,
            to: toHost?.label || null,
            issues: pathIssues,
            points
          }]
        : []
    })

    return {
      issueCount: issues.length,
      issues
    }
  })

  expect(diagnostics).not.toBeNull()
  expect(diagnostics?.issueCount).toBe(0)
})

test('connection lines stay out of every table group header and do not run along group borders', async ({ goto, page }) => {
  await goto('/diagram')
  await expect(page.locator('[data-node-anchor="group:Core"]')).toBeVisible()

  let diagnostics: { headerHits: Array<{ groupId: string, pathIndex: number }>, borderHits: Array<{ groupId: string, pathIndex: number }> } | null = null

  await expect.poll(async () => {
    diagnostics = await page.evaluate(() => {
      const groups = Array.from(document.querySelectorAll('[data-node-anchor^="group:"]')).filter((element): element is HTMLElement => {
        return element instanceof HTMLElement
      })
      const connectionLayers = Array.from(document.querySelectorAll('[data-connection-layer="true"]'))
      const paths = connectionLayers.flatMap((layer) => {
        return Array.from(layer.querySelectorAll('path'))
      })

      if (!groups.length || !paths.length) {
        return null
      }

      const plane = groups[0]?.parentElement

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

        if (Math.abs(from.y - to.y) < 0.5) {
          const y = from.y

          if (y < rect.top || y > rect.bottom) {
            return false
          }

          const minX = Math.min(from.x, to.x)
          const maxX = Math.max(from.x, to.x)

          return maxX > rect.left && minX < rect.right
        }

        return false
      }

      const groupDiagnostics = groups.flatMap((group) => {
        const groupId = group.getAttribute('data-node-anchor') || ''
        const content = document.querySelector(`[data-group-content="${groupId}"]`)

        if (!(content instanceof HTMLElement)) {
          return []
        }

        const groupOffset = getOffsetWithinPlane(group)
        const contentOffset = getOffsetWithinPlane(content)
        const groupBounds = {
          left: groupOffset.x,
          right: groupOffset.x + group.offsetWidth,
          top: groupOffset.y,
          bottom: groupOffset.y + group.offsetHeight
        }
        const headerBand = {
          left: groupBounds.left,
          right: groupBounds.right,
          top: groupBounds.top,
          bottom: contentOffset.y
        }
        const borderTolerance = 1.5

        return paths.map((path, pathIndex) => {
          const points = Array.from((path.getAttribute('d') || '').matchAll(/[ML]\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)).map((match) => {
            return {
              x: Number.parseFloat(match[1] || '0'),
              y: Number.parseFloat(match[2] || '0')
            }
          })
          const hitsHeader = points.slice(1).some((point, index) => {
            return segmentHitsRect(points[index]!, point, headerBand)
          })
          const runsAlongBorder = points.slice(1).some((point, index) => {
            const previous = points[index]!

            if (Math.abs(previous.x - point.x) < 0.5) {
              const overlapsVertically = Math.max(Math.min(previous.y, point.y), groupBounds.top) < Math.min(Math.max(previous.y, point.y), groupBounds.bottom)

              return overlapsVertically && (
                Math.abs(point.x - groupBounds.left) < borderTolerance
                || Math.abs(point.x - groupBounds.right) < borderTolerance
              )
            }

            if (Math.abs(previous.y - point.y) < 0.5) {
              const overlapsHorizontally = Math.max(Math.min(previous.x, point.x), groupBounds.left) < Math.min(Math.max(previous.x, point.x), groupBounds.right)

              return overlapsHorizontally && (
                Math.abs(point.y - groupBounds.top) < borderTolerance
                || Math.abs(point.y - groupBounds.bottom) < borderTolerance
              )
            }

            return false
          })

          return {
            groupId,
            pathIndex,
            hitsHeader,
            runsAlongBorder
          }
        })
      })

      return {
        headerHits: groupDiagnostics.filter(entry => entry.hitsHeader).map(({ groupId, pathIndex }) => ({ groupId, pathIndex })),
        borderHits: groupDiagnostics.filter(entry => entry.runsAlongBorder).map(({ groupId, pathIndex }) => ({ groupId, pathIndex }))
      }
    })
    return diagnostics
  }).not.toBeNull()

  expect(diagnostics?.headerHits).toEqual([])
  expect(diagnostics?.borderHits).toEqual([])
})
