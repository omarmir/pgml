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

test('mobile versions panel wraps controls and diff cards without horizontal overflow', async ({ goto, page }) => {
  await page.setViewportSize({
    width: 390,
    height: 844
  })
  await goto('/diagram')

  await page.locator('[data-mobile-quick-view="tool-panel"]').click()

  const versionsPanel = page.locator('[data-diagram-versions-panel="true"]')

  await expect(versionsPanel).toBeVisible()
  await expect(page.locator('[data-version-open-migrations="true"]')).toBeVisible()
  await expect(page.locator('[data-version-open-migrations="true"]')).toContainText('Open migrations')

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
