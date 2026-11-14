import { expect, test } from '@nuxt/test-utils/playwright'
import { getPgmlEditor, setPgmlEditorValue } from './helpers/pgml-editor'
import { authorizeStudioLaunchAccess } from './helpers/studio-launch'

type SceneBounds = {
  maxX: number
  maxY: number
  minX: number
  minY: number
}

type SceneRendererTransform = {
  panX: number
  panY: number
  scale: number
}

test.setTimeout(120_000)

test.beforeEach(async ({ page }) => {
  await authorizeStudioLaunchAccess(page)
})

test('diagram zoom toolbar can refit the GPU viewport after manual zooming', async ({ goto, page }) => {
  await goto('/diagram')

  await expect(page.locator('[data-diagram-fit-view="true"]')).toBeVisible()
  await page.waitForFunction(() => {
    return typeof (window as Window & {
      __pgmlSceneRendererDebug?: {
        scale: number
      }
    }).__pgmlSceneRendererDebug?.scale === 'number'
  })

  const initialScale = await page.evaluate(() => {
    return (window as Window & {
      __pgmlSceneRendererDebug?: {
        scale: number
      }
    }).__pgmlSceneRendererDebug?.scale || 0
  })

  await page.getByRole('button', { name: 'Zoom in' }).click()

  await expect.poll(async () => {
    return await page.evaluate(() => {
      return (window as Window & {
        __pgmlSceneRendererDebug?: {
          scale: number
        }
      }).__pgmlSceneRendererDebug?.scale || 0
    })
  }).toBeGreaterThan(initialScale + 0.01)

  await page.locator('[data-diagram-fit-view="true"]').click()

  await expect.poll(async () => {
    return await page.evaluate(() => {
      return (window as Window & {
        __pgmlSceneRendererDebug?: {
          scale: number
        }
      }).__pgmlSceneRendererDebug?.scale || 0
    })
  }).toBeCloseTo(initialScale, 2)
})

test('Fit view contains a large model and zooming continues smoothly from its overview', async ({ goto, page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { __PGML_FORCE_GPU_SCENE__: true })
  })
  await goto('/diagram')

  const tableNames = Array.from({ length: 45 }, (_, index) => `entry_${index}`)
  const source = [
    ...tableNames.map(name => `Table ${name} {\n  id integer [pk]\n  label text\n}`),
    `TableGroup LargeModel {\n${tableNames.join('\n')}\n}`
  ].join('\n\n')
  const editor = getPgmlEditor(page)

  await expect(editor).toBeVisible()
  await setPgmlEditorValue(editor, source)
  await expect.poll(async () => {
    return page.evaluate(() => {
      const debug: { tableCards: unknown[] } | undefined = Reflect.get(window, '__pgmlSceneDebug')
      return debug?.tableCards?.length
    })
  }).toBe(45)
  await page.locator('[data-diagram-fit-view="true"]').click()

  const readViewport = () => page.evaluate(() => {
    const viewport = document.querySelector('[data-diagram-viewport="true"]')
    const debug: { worldBounds: SceneBounds } | undefined = Reflect.get(window, '__pgmlSceneDebug')
    const renderer: SceneRendererTransform | undefined = Reflect.get(window, '__pgmlSceneRendererDebug')

    if (!(viewport instanceof HTMLElement) || !debug?.worldBounds || !renderer) {
      return null
    }

    const bounds = debug.worldBounds
    return {
      bottom: bounds.maxY * renderer.scale + renderer.panY,
      height: viewport.clientHeight,
      left: bounds.minX * renderer.scale + renderer.panX,
      right: bounds.maxX * renderer.scale + renderer.panX,
      scale: renderer.scale,
      top: bounds.minY * renderer.scale + renderer.panY,
      width: viewport.clientWidth
    }
  })

  await expect.poll(async () => (await readViewport())?.scale).toBeLessThan(0.32)
  await expect.poll(async () => {
    const viewport = await readViewport()
    return viewport ? viewport.bottom - viewport.height : Number.POSITIVE_INFINITY
  }).toBeLessThanOrEqual(-39)
  const fitted = await readViewport()

  if (!fitted) {
    throw new Error('Diagram viewport is not available.')
  }

  expect(fitted.scale).toBeGreaterThan(0)
  expect(fitted.top).toBeGreaterThanOrEqual(39)
  expect(fitted.bottom).toBeLessThanOrEqual(fitted.height - 39)
  expect(fitted.left).toBeGreaterThanOrEqual(39)
  expect(fitted.right).toBeLessThanOrEqual(fitted.width - 39)

  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect.poll(async () => (await readViewport())?.scale).toBeCloseTo(fitted.scale * 1.08, 5)
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
  await expect.poll(async () => (await readViewport())?.scale).toBeCloseTo(fitted.scale, 5)
})

test('renderer status reflects Pixi fallback when WebGPU exposes no adapter', async ({ goto, page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: { requestAdapter: async () => null }
    })
  })
  await goto('/diagram')

  await expect(page.locator('[data-diagram-renderer-status="desktop"]')).toHaveText('WebGL active after WebGPU init failure')
  await expect(page.getByText('WebGPU active', { exact: true })).toHaveCount(0)
})

test('zoom controls remain clickable when a narrow canvas wraps the renderer fallback toolbar', async ({ goto, page }) => {
  await page.setViewportSize({ width: 1100, height: 800 })
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', {
      configurable: true,
      value: { requestAdapter: async () => null }
    })
  })
  await goto('/diagram')

  const separator = page.getByRole('separator', { name: 'Resize PGML editor' })

  await separator.focus()
  for (let index = 0; index < 15; index += 1) {
    await separator.press('ArrowRight')
  }

  await expect(page.locator('[data-diagram-renderer-status="desktop"]')).toHaveText('WebGL active after WebGPU init failure')
  const bounds = await page.locator('[data-diagram-zoom-toolbar="true"]').evaluate((element) => {
    const viewport = document.querySelector('[data-diagram-viewport="true"]')

    if (!(viewport instanceof HTMLElement)) {
      throw new Error('Diagram viewport is not available.')
    }

    const toolbarBounds = element.getBoundingClientRect()
    const viewportBounds = viewport.getBoundingClientRect()

    return {
      leftInset: toolbarBounds.left - viewportBounds.left,
      rightInset: viewportBounds.right - toolbarBounds.right
    }
  })

  expect(bounds.leftInset).toBeGreaterThanOrEqual(20)
  expect(bounds.rightInset).toBeGreaterThanOrEqual(12)

  const readScale = () => page.evaluate(() => {
    const renderer: SceneRendererTransform | undefined = Reflect.get(window, '__pgmlSceneRendererDebug')

    return renderer?.scale
  })
  const initialScale = await readScale()

  if (initialScale === undefined) {
    throw new Error('Renderer scale is not available.')
  }

  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect.poll(readScale).toBeGreaterThan(initialScale)
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
  await expect.poll(readScale).toBeCloseTo(initialScale, 5)
})
