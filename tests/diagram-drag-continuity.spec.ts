import { expect, test } from '@nuxt/test-utils/playwright'
import type { Page } from '@playwright/test'
import type { DiagramGpuConnectionPoint } from '../app/utils/diagram-gpu-scene'
import type { DiagramNodeDragPreview } from '../app/utils/diagram-connection-preview'
import { studioCompactBreakpoint } from '../app/utils/studio-layout'
import { getPgmlEditor, readPgmlEditorValue, setPgmlEditorValue } from './helpers/pgml-editor'
import { authorizeStudioLaunchAccess } from './helpers/studio-launch'

test.setTimeout(120_000)

type Card = { id: string, height: number, width: number, x: number, y: number }
type Line = { key: string, points: DiagramGpuConnectionPoint[] }
type SceneFrame = {
  dragPreview: DiagramNodeDragPreview | null
  panX: number
  panY: number
  renderedConnections: Line[]
  renderedGroupCards: Card[]
  renderedTableCards: Card[]
  scale: number
}

const source = `TableGroup Moving {
  users
  orders
}

TableGroup Stationary {
  accounts
}

Table public.users in Moving {
  id uuid [pk]
  account_id uuid [ref: > public.accounts.id]
}

Table public.orders in Moving {
  id uuid [pk]
  user_id uuid [ref: > public.users.id]
}

Table public.accounts in Stationary {
  id uuid [pk]
  owner_id uuid [ref: > public.users.id]
}

Table public.audit {
  id uuid [pk]
  order_id uuid [ref: > public.orders.id]
  account_id uuid [ref: > public.accounts.id]
}

Properties "group:Moving" {
  x: 100
  y: 100
}

Properties "group:Stationary" {
  x: 650
  y: 100
}

Properties "public.audit" {
  x: 100
  y: 650
}`

const readFrame = async (page: Page): Promise<SceneFrame> => {
  return page.evaluate(() => {
    const debug = (window as Window & { __pgmlSceneRendererDebug?: SceneFrame }).__pgmlSceneRendererDebug
    if (!debug) {
      throw new Error('Renderer geometry is unavailable.')
    }
    return debug
  })
}

const fixtureReferenceKeys = [
  'ref:public.accounts:owner_id:public.users:id',
  'ref:public.audit:account_id:public.accounts:id',
  'ref:public.audit:order_id:public.orders:id',
  'ref:public.orders:user_id:public.users:id',
  'ref:public.users:account_id:public.accounts:id'
]

const setFixtureSource = async (page: Page) => {
  const editor = getPgmlEditor(page)
  await expect(editor.locator('.cm-content')).toHaveCount(1)
  await setPgmlEditorValue(editor, source)
  await expect.poll(() => readPgmlEditorValue(editor)).toBe(source)
}

const waitForFixtureScene = async (
  page: Page,
  target: { kind: 'group' | 'table', id: string },
  extraTableIds: string[] = []
) => {
  const snapshot = await page.waitForFunction(({ referenceKeys, tableIds, target, compactBreakpoint }) => {
    const frame = (window as Window & { __pgmlSceneRendererDebug?: SceneFrame }).__pgmlSceneRendererDebug
    const mobilePane = document.querySelector('[data-mobile-studio-pane="canvas"]')
    const isCompact = window.innerWidth < compactBreakpoint
    if ((isCompact && !mobilePane) || (!isCompact && mobilePane)) {
      return null
    }
    const scope = isCompact ? mobilePane : document
    const viewport = scope ? scope.querySelector('[data-diagram-viewport="true"]') : null
    if (!frame || !(viewport instanceof HTMLElement) || !viewport.querySelector('canvas')) {
      return null
    }
    if (frame.renderedConnections.map(line => line.key).sort().join('|') !== referenceKeys.join('|')
      || frame.renderedGroupCards.map(group => group.id).sort().join('|') !== 'group:Moving|group:Stationary'
      || frame.renderedTableCards.map(table => table.id).sort().join('|') !== tableIds.join('|')) {
      return null
    }
    const card = (target.kind === 'group' ? frame.renderedGroupCards : frame.renderedTableCards).find(entry => entry.id === target.id)
    const bounds = viewport.getBoundingClientRect()
    if (!card || bounds.width <= 0 || bounds.height <= 0 || !Number.isFinite(frame.scale) || frame.scale <= 0) {
      return null
    }
    const start = {
      x: bounds.left + frame.panX + (card.x + card.width / 2) * frame.scale,
      y: bounds.top + frame.panY + (card.y + 24) * frame.scale
    }
    if (start.x < bounds.left || start.x > bounds.right || start.y < bounds.top || start.y > bounds.bottom) {
      return null
    }
    return { baseline: frame, start }
  }, {
    referenceKeys: fixtureReferenceKeys,
    tableIds: ['public.accounts', 'public.audit', 'public.orders', 'public.users', ...extraTableIds].sort(),
    target,
    compactBreakpoint: studioCompactBreakpoint
  }).catch(async (error: unknown) => {
    const diagnostics = await page.evaluate(() => {
      const frame = (window as Window & { __pgmlSceneRendererDebug?: SceneFrame }).__pgmlSceneRendererDebug
      const editor = document.querySelector('[data-pgml-editor="true"] .cm-content')
      return {
        url: window.location.href,
        width: window.innerWidth,
        editor: editor?.textContent?.slice(0, 160),
        keys: frame?.renderedConnections.map(line => line.key),
        groups: frame?.renderedGroupCards.map(group => group.id),
        tables: frame?.renderedTableCards.map(table => table.id)
      }
    })
    throw new Error(`Fixture readiness failed: ${JSON.stringify(diagnostics)}. ${String(error)}`)
  })
  const value = await snapshot.jsonValue()
  await snapshot.dispose()
  if (!value) {
    throw new Error('The fixture scene did not produce a ready snapshot.')
  }
  return value
}

const captureRenderedFrames = async (page: Page) => {
  await page.evaluate(() => {
    const debugWindow = window as Window & {
      __pgmlSceneRendererDebug?: SceneFrame
      __pgmlTestDragFrames?: SceneFrame[] | null
    }
    let frame = debugWindow.__pgmlSceneRendererDebug
    debugWindow.__pgmlTestDragFrames = []
    Object.defineProperty(window, '__pgmlSceneRendererDebug', {
      configurable: true,
      get: () => frame,
      set: (value: SceneFrame) => {
        frame = value
        debugWindow.__pgmlTestDragFrames?.push(value)
      }
    })
  })
}

const stopCapturingRenderedFrames = async (page: Page) => {
  return page.evaluate(() => {
    const debugWindow = window as Window & {
      __pgmlSceneRendererDebug?: SceneFrame
      __pgmlTestDragFrames?: SceneFrame[] | null
    }
    const frames = debugWindow.__pgmlTestDragFrames
    debugWindow.__pgmlTestDragFrames = null
    Object.defineProperty(window, '__pgmlSceneRendererDebug', {
      configurable: true,
      writable: true,
      value: debugWindow.__pgmlSceneRendererDebug
    })
    return frames ? frames : []
  })
}

const readSvgLines = async (page: Page) => {
  return page.evaluate(() => {
    const debug = (window as Window & { __pgmlSceneRendererDebug?: SceneFrame }).__pgmlSceneRendererDebug
    const viewport = document.querySelector('[data-diagram-viewport="true"]')
    if (!debug || !viewport) {
      throw new Error('Renderer transform is unavailable.')
    }
    const bounds = viewport.getBoundingClientRect()
    return Array.from(document.querySelectorAll<SVGPathElement>('[data-connection-key]')).map((path) => {
      const matrix = path.getScreenCTM()
      const key = path.getAttribute('data-connection-key')
      if (!matrix || !key) {
        throw new Error('Relationship path is not measurable.')
      }
      const coordinates = Array.from((path.getAttribute('d') || '').matchAll(/-?(?:\d*\.?\d+)(?:e[+-]?\d+)?/gi), match => Number(match[0]))
      const points: DiagramGpuConnectionPoint[] = []
      for (let index = 0; index < coordinates.length; index += 2) {
        const point = new DOMPoint(coordinates[index], coordinates[index + 1]).matrixTransform(matrix)
        points.push({
          x: (point.x - bounds.left - debug.panX) / debug.scale,
          y: (point.y - bounds.top - debug.panY) / debug.scale
        })
      }
      const endpoint = path.getPointAtLength(path.getTotalLength()).matrixTransform(matrix)
      if (points.length > 0) {
        points[points.length - 1] = {
          x: (endpoint.x - bounds.left - debug.panX) / debug.scale,
          y: (endpoint.y - bounds.top - debug.panY) / debug.scale
        }
      }
      const firstPoint = path.getPointAtLength(0).matrixTransform(matrix)
      if (points.length > 0) {
        points[0] = {
          x: (firstPoint.x - bounds.left - debug.panX) / debug.scale,
          y: (firstPoint.y - bounds.top - debug.panY) / debug.scale
        }
      }
      return { key, points }
    })
  })
}

const endpointErrors = (baseline: SceneFrame, frame: SceneFrame, lines: Line[], tolerance = 0.1) => {
  const errors: string[] = []
  if (lines.map(line => line.key).sort().join('|') !== baseline.renderedConnections.map(line => line.key).sort().join('|')) {
    errors.push('The rendered relationship set changed during the gesture')
  }
  for (const line of lines) {
    const originalLine = baseline.renderedConnections.find(entry => entry.key === line.key)
    const [, fromId, , toId] = line.key.split(':')
    if (!originalLine || !fromId || !toId) {
      throw new Error(`Missing baseline relationship ${line.key}.`)
    }
    for (const [end, tableId] of [['from', fromId], ['to', toId]] as const) {
      const originalCard = baseline.renderedTableCards.find(card => card.id === tableId)
      const card = frame.renderedTableCards.find(entry => entry.id === tableId)
      const originalPoint = end === 'from' ? originalLine.points[0] : originalLine.points.at(-1)
      const point = end === 'from' ? line.points[0] : line.points.at(-1)
      if (!originalCard || !card || !originalPoint || !point) {
        throw new Error(`Missing ${end} endpoint of ${line.key}.`)
      }
      const edgeDistance = Math.min(Math.abs(point.x - card.x), Math.abs(point.x - card.x - card.width))
      const rowDistance = Math.abs(point.y - card.y - (originalPoint.y - originalCard.y))
      if (edgeDistance > tolerance || rowDistance > 15.5 + tolerance) {
        errors.push(`${line.key} ${end} detached from its current table/column row`)
      }
      const adjacentPoint = end === 'from' ? line.points[1] : line.points.at(-2)
      if (adjacentPoint) {
        const entersLeftEdge = Math.abs(point.x - card.x) < tolerance && adjacentPoint.x > point.x + tolerance
        const entersRightEdge = Math.abs(point.x - card.x - card.width) < tolerance && adjacentPoint.x < point.x - tolerance
        const entersTopEdge = Math.abs(point.y - card.y) < tolerance && adjacentPoint.y > point.y + tolerance
        const entersBottomEdge = Math.abs(point.y - card.y - card.height) < tolerance && adjacentPoint.y < point.y - tolerance
        if (entersLeftEdge || entersRightEdge || entersTopEdge || entersBottomEdge) {
          errors.push(`${line.key} ${end} leg disappears inside its own table`)
        }
      }
    }
    for (let index = 1; index < line.points.length; index += 1) {
      const previous = line.points[index - 1]
      const point = line.points[index]
      if (previous && point && Math.abs(previous.x - point.x) > 0.1 && Math.abs(previous.y - point.y) > 0.1) {
        errors.push(`${line.key} segment ${index} lost its orthogonal join`)
      }
      if (!previous || !point) {
        continue
      }
      for (const host of frame.renderedTableCards.filter(card => card.id === fromId || card.id === toId)) {
        const left = host.x + tolerance
        const right = host.x + host.width - tolerance
        const top = host.y + tolerance
        const bottom = host.y + host.height - tolerance
        const crossesHorizontally = Math.abs(previous.y - point.y) < 0.1
          && point.y > top && point.y < bottom
          && Math.min(previous.x, point.x) < right && Math.max(previous.x, point.x) > left
        const crossesVertically = Math.abs(previous.x - point.x) < 0.1
          && point.x > left && point.x < right
          && Math.min(previous.y, point.y) < bottom && Math.max(previous.y, point.y) > top
        if (crossesHorizontally || crossesVertically) {
          errors.push(`${line.key} segment ${index} disappears inside endpoint host ${host.id}`)
        }
      }
    }
  }
  return errors
}

test.beforeEach(async ({ page }) => {
  await authorizeStudioLaunchAccess(page)
  await page.addInitScript(() => {
    Object.assign(window, { __PGML_FORCE_GPU_SCENE__: true })
  })
})

for (const device of [
  { label: 'Android GPU', userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Mobile Safari/537.36' },
  { label: 'coarse-pointer SVG overlay', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' }
]) {
  test.describe(device.label, () => {
    test.use({ hasTouch: true, userAgent: device.userAgent })

    for (const dragKind of ['group', 'table'] as const) {
      for (const input of ['touch', 'pointer'] as const) {
        test(`${dragKind} ${input} drag keeps every incoming and outgoing endpoint attached before release`, async ({ goto, page }) => {
          await page.setViewportSize({ width: 390, height: 844 })
          await goto('/diagram')
          await setFixtureSource(page)
          const id = dragKind === 'group' ? 'group:Moving' : 'public.audit'
          const { baseline, start } = await waitForFixtureScene(page, { kind: dragKind, id })
          const svgBaseline = { ...baseline, renderedConnections: await readSvgLines(page) }
          await captureRenderedFrames(page)
          const cdp = await page.context().newCDPSession(page)
          if (input === 'touch') {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] })
          } else {
            await page.mouse.move(start.x, start.y)
            await page.mouse.down()
          }
          const failures: string[] = []
          for (const offset of [{ x: 35, y: -20 }, { x: 90, y: -65 }, { x: 55, y: 35 }, { x: -20, y: 10 }]) {
            if (input === 'touch') {
              await cdp.send('Input.dispatchTouchEvent', {
                type: 'touchMove',
                touchPoints: [{ x: start.x + offset.x, y: start.y + offset.y, id: 1 }]
              })
            } else {
              await page.mouse.move(start.x + offset.x, start.y + offset.y)
            }
            await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
            const frame = await readFrame(page)
            expect(frame.dragPreview?.id).toBe(id)
            failures.push(...endpointErrors(baseline, frame, frame.renderedConnections))
            failures.push(...endpointErrors(svgBaseline, frame, await readSvgLines(page), 2 / frame.scale))
            const movedCard = (dragKind === 'group' ? frame.renderedGroupCards : frame.renderedTableCards).find(entry => entry.id === id)
            expect(movedCard?.x).toBe(frame.dragPreview?.x)
            expect(movedCard?.y).toBe(frame.dragPreview?.y)
            const movedTables = dragKind === 'group' ? ['public.users', 'public.orders'] : ['public.audit']
            for (const originalLine of baseline.renderedConnections) {
              const [, fromId, , toId] = originalLine.key.split(':')
              if (fromId && toId && !movedTables.includes(fromId) && !movedTables.includes(toId)) {
                expect(frame.renderedConnections.find(line => line.key === originalLine.key)?.points).toEqual(originalLine.points)
              }
            }
            if (dragKind === 'group' && frame.dragPreview) {
              for (const tableId of ['public.users', 'public.orders']) {
                const original = baseline.renderedTableCards.find(table => table.id === tableId)
                const moved = frame.renderedTableCards.find(table => table.id === tableId)
                expect(moved?.x).toBe((original ? original.x : 0) + frame.dragPreview.deltaX)
                expect(moved?.y).toBe((original ? original.y : 0) + frame.dragPreview.deltaY)
              }
            }
          }
          await page.setViewportSize({ width: 390, height: 860 })
          await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
          const resizedFrame = await readFrame(page)
          failures.push(...endpointErrors(baseline, resizedFrame, resizedFrame.renderedConnections))
          failures.push(...endpointErrors(svgBaseline, resizedFrame, await readSvgLines(page), 2 / resizedFrame.scale))
          const resizedCard = (dragKind === 'group' ? resizedFrame.renderedGroupCards : resizedFrame.renderedTableCards).find(entry => entry.id === id)
          expect(resizedCard?.x).toBe(resizedFrame.dragPreview?.x)
          expect(resizedCard?.y).toBe(resizedFrame.dragPreview?.y)
          const frames = await stopCapturingRenderedFrames(page)
          expect(frames.length).toBeGreaterThan(4)
          for (const frame of frames) {
            failures.push(...endpointErrors(baseline, frame, frame.renderedConnections))
            if (frame.dragPreview) {
              const moved = (dragKind === 'group' ? frame.renderedGroupCards : frame.renderedTableCards).find(entry => entry.id === id)
              expect(moved?.x).toBe(frame.dragPreview.x)
              expect(moved?.y).toBe(frame.dragPreview.y)
            }
          }
          if (input === 'touch') {
            await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
          } else {
            await page.mouse.up()
          }
          await expect.poll(async () => (await readFrame(page)).dragPreview).toBeNull()
          await expect.poll(async () => {
            const frame = await readFrame(page)
            return endpointErrors(baseline, frame, frame.renderedConnections)
          }).toEqual([])
          const settledFrame = await readFrame(page)
          expect(endpointErrors(svgBaseline, settledFrame, await readSvgLines(page), 2 / settledFrame.scale)).toEqual([])
          expect(failures).toEqual([])
        })
      }
    }

    for (const dragKind of ['group', 'table'] as const) {
      test(`a second touch cancels the held ${dragKind} preview before pinching`, async ({ goto, page }) => {
        await page.setViewportSize({ width: 390, height: 844 })
        await goto('/diagram')
        await setFixtureSource(page)
        const id = dragKind === 'group' ? 'group:Moving' : 'public.audit'
        const { baseline, start } = await waitForFixtureScene(page, { kind: dragKind, id })
        const cdp = await page.context().newCDPSession(page)
        const firstTouch = { x: start.x + 35, y: start.y + 45, id: 1 }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...start, id: 1 }] })
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [firstTouch] })
        await expect.poll(async () => (await readFrame(page)).dragPreview?.id).toBe(id)
        await captureRenderedFrames(page)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [firstTouch, { x: firstTouch.x + 80, y: firstTouch.y, id: 2 }]
        })
        await expect.poll(async () => (await readFrame(page)).dragPreview).toBeNull()
        await expect.poll(async () => {
          return (await readFrame(page)).renderedGroupCards.find(group => group.id === 'group:Moving')
        }).toEqual(baseline.renderedGroupCards.find(group => group.id === 'group:Moving'))
        const cancelledFrame = await readFrame(page)
        expect(cancelledFrame.renderedTableCards).toEqual(baseline.renderedTableCards)
        expect(endpointErrors(baseline, cancelledFrame, cancelledFrame.renderedConnections)).toEqual([])
        const frames = await stopCapturingRenderedFrames(page)
        expect(frames.length).toBeGreaterThan(0)
        expect(frames.flatMap(frame => endpointErrors(baseline, frame, frame.renderedConnections))).toEqual([])
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      })
    }

    if (device.label === 'Android GPU') {
      test('a queued full redraw cannot present a moved card over stale endpoint bridges', async ({ goto, page }) => {
        await page.setViewportSize({ width: 923, height: 1660 })
        await goto('/diagram')
        await setFixtureSource(page)
        const { baseline, start } = await waitForFixtureScene(page, { kind: 'group', id: 'group:Moving' })
        const table = baseline.renderedTableCards.find(card => card.id === 'public.users')
        const line = baseline.renderedConnections.find(entry => entry.key === 'ref:public.users:account_id:public.accounts:id')
        const point = line?.points[0]
        const adjacent = line?.points[1]
        if (!table || !point || !adjacent) {
          throw new Error('The cached endpoint lane is unavailable.')
        }
        const direction = Math.abs(point.x - table.x) < 0.1 ? -1 : 1
        const deltaX = adjacent.x - point.x + direction * 50
        await page.mouse.move(start.x, start.y)
        await page.mouse.down()
        await captureRenderedFrames(page)
        await page.evaluate(() => {
          window.addEventListener('pointermove', () => window.dispatchEvent(new Event('resize')), { capture: true, once: true })
        })
        await page.mouse.move(start.x + deltaX * baseline.scale * 2, start.y + 40 * baseline.scale)
        await expect.poll(async () => (await readFrame(page)).dragPreview?.id).toBe('group:Moving')
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
        const frames = await stopCapturingRenderedFrames(page)
        const heldFrames = frames.filter(frame => frame.dragPreview)
        const lastHeld = heldFrames.at(-1)
        if (!lastHeld?.dragPreview) {
          throw new Error('No held drag was rendered.')
        }
        expect(lastHeld.dragPreview.deltaX * direction).toBeGreaterThan(Math.abs(adjacent.x - point.x) + 5)
        await page.mouse.up()
        expect(heldFrames.flatMap(frame => endpointErrors(baseline, frame, frame.renderedConnections))).toEqual([])
      })
    }
  })
}

test('a settled worker response cannot replace the routes of a held pointer drag', async ({ goto, page }) => {
  await page.addInitScript(() => {
    const pending: Array<{ worker: Worker, data: unknown }> = []
    const debugWindow = window as Window & {
      __pgmlTestHoldRoutingResponses?: boolean
      __pgmlTestPendingRoutingResponses?: number
      __pgmlTestReleaseRoutingResponses?: () => void
    }
    const NativeWorker = window.Worker
    class DelayedRoutingWorker extends NativeWorker {
      constructor(scriptURL: string | URL, options?: WorkerOptions) {
        super(scriptURL, options)
        this.addEventListener('message', (event: MessageEvent<unknown>) => {
          const data = event.data
          if (debugWindow.__pgmlTestHoldRoutingResponses && typeof data === 'object' && data !== null && 'lines' in data) {
            event.stopImmediatePropagation()
            pending.push({ worker: this, data })
            debugWindow.__pgmlTestPendingRoutingResponses = pending.length
          }
        })
      }
    }
    window.Worker = DelayedRoutingWorker
    debugWindow.__pgmlTestReleaseRoutingResponses = () => {
      debugWindow.__pgmlTestHoldRoutingResponses = false
      for (const response of pending.splice(0)) {
        response.worker.dispatchEvent(new MessageEvent('message', { data: response.data }))
      }
      debugWindow.__pgmlTestPendingRoutingResponses = 0
    }
  })
  await goto('/diagram')
  await setFixtureSource(page)
  await waitForFixtureScene(page, { kind: 'group', id: 'group:Moving' })
  await page.evaluate(() => Object.assign(window, { __pgmlTestHoldRoutingResponses: true }))
  await setPgmlEditorValue(getPgmlEditor(page), `${source}

Table public.idle {
  id uuid [pk]
}

Properties "public.idle" {
  x: 400
  y: 650
}`)
  await page.waitForFunction(() => {
    return (window as Window & { __pgmlTestPendingRoutingResponses?: number }).__pgmlTestPendingRoutingResponses
  })
  const { baseline, start } = await waitForFixtureScene(page, { kind: 'group', id: 'group:Moving' }, ['public.idle'])
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x + 55, start.y + 35)
  await expect.poll(async () => (await readFrame(page)).dragPreview?.id).toBe('group:Moving')
  await page.evaluate(() => {
    const release = (window as Window & { __pgmlTestReleaseRoutingResponses?: () => void }).__pgmlTestReleaseRoutingResponses
    if (!release) {
      throw new Error('The delayed worker response is unavailable.')
    }
    release()
  })
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const frame = await readFrame(page)
  expect(frame.dragPreview?.id).toBe('group:Moving')
  expect(endpointErrors(baseline, frame, frame.renderedConnections)).toEqual([])
  await page.mouse.up()
  await expect.poll(async () => (await readFrame(page)).dragPreview).toBeNull()
  await expect.poll(async () => {
    const settled = await readFrame(page)
    return endpointErrors(baseline, settled, settled.renderedConnections)
  }).toEqual([])
})
