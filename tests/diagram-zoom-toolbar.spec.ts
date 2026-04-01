import { expect, test } from '@nuxt/test-utils/playwright'
import { authorizeStudioLaunchAccess } from './helpers/studio-launch'

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
