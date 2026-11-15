import { readFileSync } from 'node:fs'

import { expect, test } from '@nuxt/test-utils/playwright'
import { getPgmlEditor, setPgmlEditorValue } from './helpers/pgml-editor'
import { authorizeStudioLaunchAccess } from './helpers/studio-launch'

test.setTimeout(120_000)

test.beforeEach(async ({ page }) => {
  await authorizeStudioLaunchAccess(page)
})

test('studio exports svg and png downloads', async ({ goto, page }) => {
  await goto('/diagram')

  const exportMenuButton = page.getByTitle('Export')

  await expect(exportMenuButton).toBeVisible()
  await expect(page.locator('[data-attachment-row="index:idx_products_search"]')).toBeVisible()
  await expect(page.locator('[data-attachment-row="function:public.register_entity"]').first()).toBeVisible()
  await expect(page.locator('[data-attachment-row="constraint:chk_orders_total"]')).toBeVisible()
  await page.locator('[data-object-collapse-button="custom-type:Domain:public.email_address"]').evaluate((element) => {
    ;(element as HTMLElement).click()
  })
  await expect(page.locator('[data-node-body="custom-type:Domain:public.email_address"]')).toBeVisible()

  const svgDownloadPromise = page.waitForEvent('download')
  await exportMenuButton.click()
  await page.getByRole('menuitem', { name: 'SVG' }).click()
  const svgDownload = await svgDownloadPromise
  const svgDownloadPath = await svgDownload.path()

  expect(svgDownload.suggestedFilename()).toBe('example-schema-diagram.svg')
  expect(readFileSync(svgDownloadPath!, 'utf8')).toContain('<svg')

  const pngDownloadPromise = page.waitForEvent('download')
  await exportMenuButton.click()
  await page.getByRole('menuitem', { name: 'PNG 8x' }).click()
  const pngDownload = await pngDownloadPromise

  expect(pngDownload.suggestedFilename()).toBe('example-schema-diagram.png')
})

for (const format of ['svg', 'png'] as const) {
  test(`${format} exports respect relationship line visibility`, async ({ goto, page }) => {
    await goto('/diagram')
    await expect(page.locator('[data-attachment-row="index:idx_products_search"]')).toBeVisible()
    await expect.poll(() => page.evaluate(() => {
      const debug = (window as Window & { __pgmlSceneDebug?: { connectionCount: number } }).__pgmlSceneDebug

      return debug ? debug.connectionCount : 0
    })).toBeGreaterThan(0)

    // PNG exports rasterize an SVG blob. Capture that input so the assertion
    // checks the actual relationship paths rather than only the file extension.
    await page.evaluate(() => {
      const createObjectURL = URL.createObjectURL.bind(URL)
      const captured: Promise<string>[] = []

      Object.assign(window, { __pgmlExportSvgBlobs: captured })
      URL.createObjectURL = (blob: Blob | MediaSource) => {
        if (blob instanceof Blob && blob.type.startsWith('image/svg+xml')) {
          captured.push(blob.text())
        }

        return createObjectURL(blob)
      }
    })

    for (const visible of [true, false, true]) {
      await page.locator('[data-diagram-view-settings="desktop"]').click()
      const setting = page.getByRole('switch', { name: /^Relationship lines(\s|$)/ })

      await expect(setting).toBeVisible()
      if ((await setting.getAttribute('aria-checked') === 'true') !== visible) {
        await setting.click()
      }
      await page.locator('[data-diagram-view-settings-save="true"]').click()
      await expect(page.locator('[data-diagram-view-settings-dialog="true"]')).toHaveCount(0)

      await page.getByTitle('Export').click()
      const downloadPromise = page.waitForEvent('download')

      await page.getByRole('menuitem', { name: format === 'svg' ? 'SVG' : 'PNG 1x', exact: true }).click()
      const download = await downloadPromise
      const downloadPath = await download.path()

      expect(download.suggestedFilename()).toBe(`example-schema-diagram.${format}`)
      const svg = format === 'svg'
        ? readFileSync(downloadPath!, 'utf8')
        : await page.evaluate(async () => {
            const captured = (window as Window & { __pgmlExportSvgBlobs: Promise<string>[] }).__pgmlExportSvgBlobs

            return captured[captured.length - 1]!
          })

      expect(svg).toContain('<svg')
      expect(svg).toContain('>users</text>')
      expect(svg.includes('<path ')).toBe(visible)
      const livePaths = page.locator('[data-connection-layer="true"] path')

      if (visible) {
        await expect(livePaths.first()).toBeVisible()
      } else {
        await expect(livePaths).toHaveCount(0)
      }
      if (format === 'png') {
        expect([...readFileSync(downloadPath!).subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
      }
    }
  })
}

test('diagram export panel exposes every supported png scale and downloads from the 8x action', async ({ goto, page }) => {
  await goto('/diagram')
  await page.locator('[data-diagram-panel-tab="export"]').click()

  await expect(page.locator('[data-diagram-export-button="png-1x"]')).toBeVisible()
  await expect(page.locator('[data-diagram-export-button="png-2x"]')).toBeVisible()
  await expect(page.locator('[data-diagram-export-button="png-3x"]')).toBeVisible()
  await expect(page.locator('[data-diagram-export-button="png-4x"]')).toBeVisible()
  await expect(page.locator('[data-diagram-export-button="png-8x"]')).toBeVisible()
  await expect(page.locator('[data-diagram-export-button="svg"]')).toBeVisible()

  const pngDownloadPromise = page.waitForEvent('download')

  await page.locator('[data-diagram-export-button="png-8x"]').click()

  const pngDownload = await pngDownloadPromise

  expect(pngDownload.suggestedFilename()).toBe('example-schema-diagram.png')
})

test('image export panel downloads the current edited diagram as SVG and PNG', async ({ goto, page }) => {
  await goto('/diagram')
  await setPgmlEditorValue(getPgmlEditor(page), 'Table public.current_image {\n  id integer [pk]\n}')
  await page.locator('[data-diagram-panel-tab="export"]').click()
  const svgPending = page.waitForEvent('download')
  await page.locator('[data-diagram-export-button="svg"]').click()
  const svg = await svgPending
  const svgPath = await svg.path()
  expect(svg.suggestedFilename()).toMatch(/-diagram\.svg$/)
  expect(readFileSync(svgPath!, 'utf8')).toContain('>current_image</text>')
  const pngPending = page.waitForEvent('download')
  await page.locator('[data-diagram-export-button="png-1x"]').click()
  const png = await pngPending
  expect(png.suggestedFilename()).toMatch(/-diagram\.png$/)
  expect([...readFileSync((await png.path())!).subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
})

test('light mode keeps actual PNG and SVG export controls readable', async ({ goto, page }) => {
  await goto('/diagram')
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await page.locator('[data-diagram-panel-tab="export"]').click()
  for (const format of ['png-1x', 'png-8x', 'svg']) {
    const styles = await page.locator(`[data-diagram-export-button="${format}"]`).evaluate((element) => {
      const computed = getComputedStyle(element)
      return { background: computed.backgroundColor, border: computed.borderColor, color: computed.color }
    })
    expect(styles.background).not.toBe('rgba(0, 0, 0, 0)')
    expect(styles.border).not.toBe('rgba(0, 0, 0, 0)')
    expect(styles.color).not.toBe(styles.background)
  }
})

test('light mode updates the GPU scene and svg export without a resize', async ({ goto, page }) => {
  await goto('/diagram')

  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await page.locator('[data-diagram-panel-tab="export"]').click()

  await expect.poll(async () => {
    return page.evaluate(() => {
      return (window as Window & {
        __pgmlSceneRendererDebug?: {
          background?: string
        }
      }).__pgmlSceneRendererDebug?.background || null
    })
  }).toBe('#f8fafc')

  const viewportStyles = await page.locator('[data-diagram-viewport="true"]').evaluate((element) => {
    const styles = window.getComputedStyle(element)

    return {
      backgroundColor: styles.backgroundColor,
      borderColor: styles.borderColor
    }
  })

  expect(viewportStyles.backgroundColor).toBe('rgb(248, 250, 252)')
  expect(viewportStyles.borderColor).toBe('rgba(15, 23, 42, 0.08)')

  const panelStyles = await page.locator('[data-diagram-panel="true"]').evaluate((element) => {
    const styles = window.getComputedStyle(element)

    return {
      backgroundColor: styles.backgroundColor,
      borderColor: styles.borderColor
    }
  })

  expect(panelStyles.backgroundColor).toBe('rgba(255, 255, 255, 0.92)')
  expect(panelStyles.borderColor).toBe('rgba(15, 23, 42, 0.08)')

  const exportButtonStyles = await page.locator('[data-diagram-export-button="png-1x"]').evaluate((element) => {
    const styles = window.getComputedStyle(element)

    return {
      backgroundColor: styles.backgroundColor,
      borderColor: styles.borderColor,
      color: styles.color
    }
  })

  expect(exportButtonStyles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(exportButtonStyles.borderColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(exportButtonStyles.color).not.toBe(exportButtonStyles.backgroundColor)

  const exportMenuButton = page.getByTitle('Export')

  await exportMenuButton.click()

  const svgDownloadPromise = page.waitForEvent('download')

  await page.getByRole('menuitem', { name: 'SVG' }).click()

  const svgDownload = await svgDownloadPromise
  const svgPath = await svgDownload.path()
  const svgText = readFileSync(svgPath!, 'utf8')

  expect(svgText).toContain('fill="#f8fafc"')
  expect(svgText).not.toContain('#12232d')
})
