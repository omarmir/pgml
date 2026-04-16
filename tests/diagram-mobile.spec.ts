import { expect, test } from '@nuxt/test-utils/playwright'
import { authorizeStudioLaunchAccess } from './helpers/studio-launch'

test.setTimeout(120_000)

test.beforeEach(async ({ page }) => {
  await authorizeStudioLaunchAccess(page)
})

test('mobile studio exposes one-tap quick switches for diagram, panel, PGML, and history tools', async ({ goto, page }) => {
  await page.setViewportSize({
    width: 390,
    height: 844
  })
  await goto('/diagram')

  const currentView = page.locator('[data-mobile-studio-current-view="true"]')
  const diagramQuickView = page.locator('[data-mobile-quick-view="diagram"]')
  const panelQuickView = page.locator('[data-mobile-quick-view="panel"]')
  const pgmlQuickView = page.locator('[data-mobile-quick-view="pgml"]')
  const toolPanelQuickView = page.locator('[data-mobile-quick-view="tool-panel"]')

  await expect(diagramQuickView).toBeVisible()
  await expect(panelQuickView).toBeVisible()
  await expect(panelQuickView).toContainText('Entities panel')
  await expect(pgmlQuickView).toBeVisible()
  await expect(toolPanelQuickView).toBeVisible()
  await expect(toolPanelQuickView).toContainText('History tools')

  await pgmlQuickView.click()
  await expect(currentView).toHaveText('PGML')
  await expect(page.locator('[data-pgml-editor="true"]')).toBeVisible()

  await diagramQuickView.click()
  await expect(currentView).toHaveText('Diagram')
  await expect(page.locator('[data-diagram-viewport="true"]')).toBeVisible()

  await panelQuickView.click()
  await expect(currentView).toHaveText('Entities panel')
  await expect(page.locator('[data-diagram-panel="true"]')).toBeVisible()
  await expect(page.locator('[data-entity-search="true"]')).toBeVisible()

  await toolPanelQuickView.click()
  await expect(currentView).toHaveText('Versions')
  await expect(page.locator('[data-diagram-tool-panel="true"]')).toBeVisible()
  await expect(page.locator('[data-diagram-tool-panel="true"]')).toHaveAttribute('data-diagram-tool-panel-mode', 'versions')
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
  await page.getByRole('menuitem', { name: 'History tools' }).click()
  await page.getByRole('menuitem', { name: 'Compare' }).click()

  await expect(currentView).toHaveText('Compare')
  await expect(page.locator('[data-diagram-tool-panel="true"]')).toBeVisible()
  await expect(page.locator('[data-diagram-tool-panel="true"]')).toHaveAttribute('data-diagram-tool-panel-mode', 'compare')

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

test('mobile versions panel stays lightweight and avoids horizontal overflow', async ({ goto, page }) => {
  await page.setViewportSize({
    width: 390,
    height: 844
  })
  await goto('/diagram')

  await page.locator('[data-mobile-quick-view="tool-panel"]').click()

  const versionsPanel = page.locator('[data-diagram-versions-panel="true"]')

  await expect(versionsPanel).toBeVisible()
  await expect(versionsPanel).toContainText('Version Switcher')
  await expect(page.locator('[data-version-card="workspace"]')).toBeVisible()
  await expect(page.locator('[data-version-create-checkpoint="true"]')).toBeVisible()

  const overflowMetrics = await versionsPanel.evaluate((element) => {
    const panel = element as HTMLElement

    return {
      clientWidth: panel.clientWidth,
      scrollWidth: panel.scrollWidth
    }
  })

  expect(overflowMetrics.scrollWidth).toBeLessThanOrEqual(overflowMetrics.clientWidth + 1)
})

test('mobile studio diagram supports pinch zoom on the GPU viewport', async ({ browserName, goto, page }) => {
  test.skip(browserName !== 'chromium', 'CDP multi-touch dispatch is Chromium-only.')

  await page.setViewportSize({
    width: 390,
    height: 844
  })
  await goto('/diagram')

  const viewport = page.locator('[data-diagram-viewport="true"]')

  await expect(viewport).toBeVisible()
  await page.waitForFunction(() => {
    return typeof (window as Window & {
      __pgmlSceneRendererDebug?: {
        scale: number
      }
    }).__pgmlSceneRendererDebug?.scale === 'number'
  })

  const viewportBox = await viewport.boundingBox()

  if (!viewportBox) {
    throw new Error('Diagram viewport is not measurable.')
  }

  const pinchCenterX = viewportBox.x + viewportBox.width * 0.5
  const pinchCenterY = viewportBox.y + viewportBox.height * 0.46
  const initialOffset = Math.round(Math.min(viewportBox.width, viewportBox.height) * 0.08)
  const expandedOffset = Math.round(initialOffset * 2.1)
  const client = await page.context().newCDPSession(page)
  const initialScale = await page.evaluate(() => {
    return (window as Window & {
      __pgmlSceneRendererDebug?: {
        scale: number
      }
    }).__pgmlSceneRendererDebug?.scale || 0
  })

  const buildTouchPoint = (id: number, x: number, y: number) => {
    return {
      force: 1,
      id,
      radiusX: 14,
      radiusY: 14,
      x: Math.round(x),
      y: Math.round(y)
    }
  }

  await client.send('Input.dispatchTouchEvent', {
    touchPoints: [
      buildTouchPoint(1, pinchCenterX - initialOffset, pinchCenterY),
      buildTouchPoint(2, pinchCenterX + initialOffset, pinchCenterY)
    ],
    type: 'touchStart'
  })
  await client.send('Input.dispatchTouchEvent', {
    touchPoints: [
      buildTouchPoint(1, pinchCenterX - expandedOffset, pinchCenterY),
      buildTouchPoint(2, pinchCenterX + expandedOffset, pinchCenterY)
    ],
    type: 'touchMove'
  })
  await client.send('Input.dispatchTouchEvent', {
    touchPoints: [],
    type: 'touchEnd'
  })

  await expect.poll(async () => {
    return await page.evaluate(() => {
      return (window as Window & {
        __pgmlSceneRendererDebug?: {
          scale: number
        }
      }).__pgmlSceneRendererDebug?.scale || 0
    })
  }).toBeGreaterThan(initialScale + 0.05)
})

test('mobile diagram keeps a DOM connection overlay available while the GPU scene is active', async ({ goto, page }) => {
  await page.setViewportSize({
    width: 390,
    height: 844
  })
  await goto('/diagram')

  await page.waitForFunction(() => {
    const debugWindow = window as Window & {
      __pgmlSceneDebug?: {
        connectionCount: number
      }
      __pgmlSceneRendererDebug?: {
        resolvedRendererBackend: string
      }
    }

    return (debugWindow.__pgmlSceneDebug?.connectionCount || 0) > 0
      && typeof debugWindow.__pgmlSceneRendererDebug?.resolvedRendererBackend === 'string'
  })

  await expect(page.locator('[data-connection-layer="true"]')).toBeVisible()
  await expect.poll(async () => {
    return await page.locator('[data-connection-key]').count()
  }).toBeGreaterThan(0)
})

test('mobile GPU group drags keep both node and line state stable after drop', async ({ browserName, goto, page }) => {
  test.skip(browserName !== 'chromium', 'CDP touch drag dispatch is Chromium-only.')

  await page.setViewportSize({
    width: 390,
    height: 844
  })
  await goto('/diagram')

  const viewport = page.locator('[data-diagram-viewport="true"]')

  await expect(viewport).toBeVisible()
  await page.waitForFunction(() => {
    const debugWindow = window as Window & {
      __pgmlSceneDebug?: {
        connectionSignature?: string
        groupCards?: Array<{ height: number, id: string, width: number, x: number, y: number }>
      }
      __pgmlSceneRendererDebug?: {
        panX: number
        panY: number
        renderedGroupCards?: Array<{ id: string, x: number, y: number }>
        scale: number
      }
    }

    return typeof debugWindow.__pgmlSceneRendererDebug?.scale === 'number'
      && Array.isArray(debugWindow.__pgmlSceneDebug?.groupCards)
      && (debugWindow.__pgmlSceneDebug?.groupCards.length || 0) > 0
      && Array.isArray(debugWindow.__pgmlSceneRendererDebug?.renderedGroupCards)
      && (debugWindow.__pgmlSceneRendererDebug?.renderedGroupCards.length || 0) > 0
  })

  const viewportBox = await viewport.boundingBox()

  if (!viewportBox) {
    throw new Error('Diagram viewport is not measurable.')
  }

  const readSceneState = async () => {
    return await page.evaluate(() => {
      const debugWindow = window as Window & {
        __pgmlSceneDebug?: {
          connectionSignature?: string
          groupCards?: Array<{ height: number, id: string, width: number, x: number, y: number }>
        }
        __pgmlSceneRendererDebug?: {
          panX: number
          panY: number
          renderedGroupCards?: Array<{ id: string, x: number, y: number }>
          scale: number
        }
      }
      const group = debugWindow.__pgmlSceneDebug?.groupCards?.[0] || null
      const renderedGroup = group
        ? debugWindow.__pgmlSceneRendererDebug?.renderedGroupCards?.find(card => card.id === group.id) || null
        : null
      const renderer = debugWindow.__pgmlSceneRendererDebug || null

      if (!group || !renderedGroup || !renderer) {
        return null
      }

      return {
        connectionSignature: debugWindow.__pgmlSceneDebug?.connectionSignature || '',
        group,
        renderedGroup,
        renderer
      }
    })
  }

  const initialState = await readSceneState()

  if (!initialState) {
    throw new Error('Diagram debug state is not available for the mobile group drag test.')
  }

  const startX = viewportBox.x
    + initialState.renderer.panX
    + initialState.renderedGroup.x * initialState.renderer.scale
    + initialState.group.width * initialState.renderer.scale * 0.5
  const startY = viewportBox.y
    + initialState.renderer.panY
    + initialState.renderedGroup.y * initialState.renderer.scale
    + Math.min(24, initialState.group.height * 0.18) * initialState.renderer.scale
  const endX = startX + 132
  const endY = startY + 68
  const touchMovePoints = [
    {
      x: startX + 24,
      y: startY + 12
    },
    {
      x: startX + 72,
      y: startY + 36
    },
    {
      x: endX,
      y: endY
    }
  ]

  await page.evaluate(async ({ endX, endY, startX, startY, touchMovePoints }) => {
    const overlay = document.querySelector('.touch-none')

    if (!(overlay instanceof HTMLElement)) {
      throw new Error('Diagram overlay is not available.')
    }

    const dispatchPointerEvent = (type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number) => {
      overlay.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        clientX: Math.round(x),
        clientY: Math.round(y),
        isPrimary: true,
        pointerId: 1,
        pointerType: 'touch'
      }))
    }
    const waitForFrame = () => new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve())
    })

    dispatchPointerEvent('pointerdown', startX, startY)
    await waitForFrame()

    for (const point of touchMovePoints) {
      dispatchPointerEvent('pointermove', point.x, point.y)
      await waitForFrame()
    }

    dispatchPointerEvent('pointerup', endX, endY)
  }, {
    endX,
    endY,
    startX,
    startY,
    touchMovePoints
  })

  await expect.poll(async () => {
    const nextState = await readSceneState()

    return nextState
      ? {
          connectionSignature: nextState.connectionSignature,
          renderedX: nextState.renderedGroup.x,
          renderedY: nextState.renderedGroup.y,
          x: nextState.group.x,
          y: nextState.group.y
        }
      : null
  }).not.toEqual({
    connectionSignature: initialState.connectionSignature,
    renderedX: initialState.renderedGroup.x,
    renderedY: initialState.renderedGroup.y,
    x: initialState.group.x,
    y: initialState.group.y
  })

  const droppedState = await readSceneState()

  if (!droppedState) {
    throw new Error('Dropped scene state is not available for the mobile group drag test.')
  }

  const postDropStates = await page.evaluate(async () => {
    const samples: Array<{
      connectionSignature: string
      renderedX: number | null
      renderedY: number | null
      x: number | null
      y: number | null
    }> = []

    for (let index = 0; index < 12; index += 1) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })

      const debugWindow = window as Window & {
        __pgmlSceneDebug?: {
          connectionSignature?: string
          groupCards?: Array<{ id: string, x: number, y: number }>
        }
        __pgmlSceneRendererDebug?: {
          renderedGroupCards?: Array<{ id: string, x: number, y: number }>
        }
      }
      const group = debugWindow.__pgmlSceneDebug?.groupCards?.[0] || null
      const renderedGroup = group
        ? debugWindow.__pgmlSceneRendererDebug?.renderedGroupCards?.find(card => card.id === group.id) || null
        : null

      samples.push({
        connectionSignature: debugWindow.__pgmlSceneDebug?.connectionSignature || '',
        renderedX: renderedGroup?.x ?? null,
        renderedY: renderedGroup?.y ?? null,
        x: group?.x ?? null,
        y: group?.y ?? null
      })
    }

    return samples
  })

  expect(postDropStates.every((state) => {
    return state.connectionSignature === droppedState.connectionSignature
      && state.x === droppedState.group.x
      && state.y === droppedState.group.y
      && state.renderedX === droppedState.renderedGroup.x
      && state.renderedY === droppedState.renderedGroup.y
  })).toBe(true)
})
