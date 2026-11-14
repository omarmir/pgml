import { expect, test } from '@nuxt/test-utils/playwright'
import type { Page } from '@playwright/test'
import { getPgmlEditor, setPgmlEditorValue } from './helpers/pgml-editor'
import { authorizeStudioLaunchAccess } from './helpers/studio-launch'

test.setTimeout(120_000)

const source = `Table public.accounts {
  id uuid [pk]
}

Table public.users {
  id uuid [pk]
  account_id uuid [ref: > public.accounts.id]
}

Table public.orders {
  id uuid [pk]
  account_id uuid [ref: > public.accounts.id]
  user_id uuid [ref: > public.users.id]
  description text
}`

const accountReference = 'ref:public.orders:account_id:public.accounts:id'
const userReference = 'ref:public.orders:user_id:public.users:id'
const userAccountReference = 'ref:public.users:account_id:public.accounts:id'

const highlightedReferenceKeys = async (page: Page) => {
  return page.locator('[data-connection-highlighted="true"]').evaluateAll((paths) => {
    return paths.map(path => path.getAttribute('data-connection-key')).sort()
  })
}

const clickGpuColumn = async (page: Page, tableId: string, columnName: string) => {
  const point = await page.evaluate(({ tableId: nextTableId, columnName: nextColumnName }) => {
    const debugWindow = window as Window & {
      __pgmlSceneDebug?: {
        tableCards: Array<{ id: string, x: number, y: number, width: number, headerHeight: number, rows: Array<{ columnName?: string }> }>
      }
      __pgmlSceneRendererDebug?: { panX: number, panY: number, scale: number }
    }
    const table = debugWindow.__pgmlSceneDebug?.tableCards.find(card => card.id === nextTableId)
    const transform = debugWindow.__pgmlSceneRendererDebug
    const viewport = document.querySelector('[data-diagram-viewport="true"]')
    const rowIndex = table ? table.rows.findIndex(row => row.columnName === nextColumnName) : -1

    if (!table || !transform || !(viewport instanceof HTMLElement) || rowIndex < 0) {
      throw new Error('GPU column is not ready for interaction.')
    }

    const bounds = viewport.getBoundingClientRect()

    return {
      x: bounds.left + transform.panX + (table.x + table.width / 2) * transform.scale,
      y: bounds.top + transform.panY + (table.y + table.headerHeight + (rowIndex + 0.5) * 31) * transform.scale
    }
  }, { tableId, columnName })

  await page.mouse.click(point.x, point.y)
}

test.beforeEach(async ({ page }) => {
  await authorizeStudioLaunchAccess(page)
})

test.describe('GPU column selection with relationship overlay', () => {
  test.use({ hasTouch: true })

  test('animates only relationships attached to that column, including incoming references', async ({ goto, page }) => {
    await goto('/diagram')
    await setPgmlEditorValue(getPgmlEditor(page), source)
    await expect(page.locator('[data-connection-key]')).toHaveCount(3)

    await clickGpuColumn(page, 'public.orders', 'account_id')
    await expect.poll(() => highlightedReferenceKeys(page)).toEqual([accountReference])

    await clickGpuColumn(page, 'public.orders', 'user_id')
    await expect.poll(() => highlightedReferenceKeys(page)).toEqual([userReference])

    await clickGpuColumn(page, 'public.accounts', 'id')
    await expect.poll(() => highlightedReferenceKeys(page)).toEqual([accountReference, userAccountReference].sort())

    await clickGpuColumn(page, 'public.orders', 'description')
    await expect.poll(() => highlightedReferenceKeys(page)).toEqual([])
  })
})

test('selecting tables updates highlights without rerouting unchanged relationship geometry', async ({ goto, page }) => {
  await page.addInitScript(() => {
    const originalPostMessage = Worker.prototype.postMessage
    const routingRequests: number[] = []
    Object.assign(window, { __pgmlTestRoutingRequests: routingRequests })

    Worker.prototype.postMessage = new Proxy(originalPostMessage, {
      apply: (postMessage, worker, args: [unknown, ...unknown[]]) => {
        const [message] = args

        if (typeof message === 'object' && message !== null && 'descriptors' in message && 'requestId' in message) {
          routingRequests.push(Number(message.requestId))
        }

        return Reflect.apply(postMessage, worker, args)
      }
    })
  })
  await goto('/diagram')
  await setPgmlEditorValue(getPgmlEditor(page), source)
  await expect(page.locator('[data-connection-key]')).toHaveCount(3)
  // Wait for the initial worker response and queued renders to settle.
  await page.waitForTimeout(250)
  const readRequests = () => page.evaluate(() => {
    return (window as Window & { __pgmlTestRoutingRequests: number[] }).__pgmlTestRoutingRequests
  })
  const beforeSelection = await readRequests()
  expect(beforeSelection.length).toBeGreaterThan(0)

  await page.locator('[data-node-header="public.orders"]').click()
  await expect.poll(() => highlightedReferenceKeys(page)).toEqual([accountReference, userReference].sort())
  await page.waitForTimeout(250)
  expect(await readRequests()).toEqual(beforeSelection)

  await page.locator('[data-node-header="public.users"]').click()
  await expect.poll(() => highlightedReferenceKeys(page)).toEqual([userAccountReference])
  await page.waitForTimeout(250)
  expect(await readRequests()).toEqual(beforeSelection)
})
