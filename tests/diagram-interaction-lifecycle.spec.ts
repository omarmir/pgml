import { expect, test } from '@nuxt/test-utils/playwright'
import type { Page } from '@playwright/test'
import { getPgmlEditor, readPgmlEditorState, readPgmlEditorValue, setPgmlEditorSelection, setPgmlEditorValue } from './helpers/pgml-editor'
import { authorizeStudioLaunchAccess } from './helpers/studio-launch'

test.setTimeout(120_000)
const source = `TableGroup Moving {
  public.users
}
Table public.users {
  id int [pk]
}
Properties "group:Moving" {
  x: 100
  y: 100
}`
type Frame = { panX: number, panY: number, scale: number, dragPreview: unknown, renderedGroupCards: Array<{ id: string, x: number, y: number, width: number }>, renderedObjectCards: Array<{ id: string, x: number, y: number, width: number, height: number }>, renderedTableCards: Array<{ id: string, x: number, y: number, width: number, height: number, visible: boolean }> }
const readFrame = (page: Page) => page.evaluate(() => {
  const debug = (window as Window & { __pgmlSceneRendererDebug?: Frame }).__pgmlSceneRendererDebug
  if (!debug) throw new Error('Renderer unavailable')
  return debug
})
const prepare = async (page: Page, goto: (url: string) => Promise<unknown>, gpu: boolean) => {
  await authorizeStudioLaunchAccess(page)
  if (gpu) await page.addInitScript(() => Object.assign(window, { __PGML_FORCE_GPU_SCENE__: true }))
  await goto('/diagram')
  await setPgmlEditorValue(getPgmlEditor(page), source)
  await expect.poll(async () => (await readFrame(page)).renderedGroupCards.map(group => group.id)).toEqual(['group:Moving'])
}
for (const gpu of [false, true]) {
  for (const interruption of ['pointercancel', 'lostpointercapture', 'blur']) {
    test(`${gpu ? 'GPU' : 'DOM'} drag ${interruption} clears preview without persisting`, async ({ page, goto }) => {
      await prepare(page, goto, gpu)
      const before = await readPgmlEditorValue(getPgmlEditor(page))
      const frame = await readFrame(page)
      const group = frame.renderedGroupCards[0]!
      const bounds = await page.locator('[data-diagram-viewport="true"]').boundingBox()
      if (!bounds) throw new Error('Viewport unavailable')
      const point = { x: bounds.x + frame.panX + (group.x + group.width / 2) * frame.scale,
        y: bounds.y + frame.panY + (group.y + 20) * frame.scale }
      await page.evaluate(() => {
        window.addEventListener('pointerdown', event => Object.assign(window, { __testPointerId: event.pointerId }), { once: true, capture: true })
      })
      await page.mouse.move(point.x, point.y)
      await page.mouse.down()
      await page.mouse.move(point.x + 60, point.y + 40, { steps: 5 })
      await expect.poll(async () => (await readFrame(page)).dragPreview).not.toBeNull()
      await page.evaluate(({ gpu, interruption }) => {
        if (interruption === 'blur') {
          window.dispatchEvent(new Event('blur'))
          return
        }
        const id = (window as Window & { __testPointerId?: number }).__testPointerId
        if (id === undefined) throw new Error('Pointer identity unavailable')
        const target = gpu ? document.querySelector('[data-diagram-gesture-surface="true"]') : document.querySelector('[data-node-header="group:Moving"]')
        if (!target) throw new Error('Gesture surface unavailable')
        target.dispatchEvent(new PointerEvent(interruption, { pointerId: id, pointerType: 'mouse', bubbles: true }))
      }, { gpu, interruption })
      await page.mouse.up()
      await expect.poll(async () => (await readFrame(page)).dragPreview).toBeNull()
      await expect.poll(() => readPgmlEditorValue(getPgmlEditor(page))).toBe(before)
      await expect.poll(async () => (await readFrame(page)).renderedGroupCards[0]?.x).toBe(group.x)
    })
  }
}

test('denied renderer preference storage still mounts the actual GPU scene', async ({ page, goto }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => {
      throw new DOMException('Storage disabled', 'SecurityError')
    } })
  })
  await prepare(page, goto, true)
  await expect(page.locator('[data-diagram-viewport="true"] canvas')).toBeVisible()
  await expect(page.locator('[data-diagram-renderer-status="desktop"]')).toContainText(/WebGL|WebGPU/)
  expect(errors).toEqual([])
})

test('a native second touch cancels DOM drag ownership before pinch movement', async ({ page, goto }) => {
  await prepare(page, goto, false)
  const before = await readPgmlEditorValue(getPgmlEditor(page))
  const frame = await readFrame(page)
  const group = frame.renderedGroupCards[0]!
  const bounds = await page.locator('[data-diagram-viewport="true"]').boundingBox()
  if (!bounds) throw new Error('Viewport unavailable')
  const point = { x: bounds.x + frame.panX + (group.x + group.width / 2) * frame.scale,
    y: bounds.y + frame.panY + (group.y + 20) * frame.scale }
  const client = await page.context().newCDPSession(page)
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...point, id: 1 }] })
  const moved = { x: point.x + 40, y: point.y + 30 }
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...moved, id: 1 }] })
  await expect.poll(async () => (await readFrame(page)).dragPreview).not.toBeNull()
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...moved, id: 1 }, { x: moved.x + 80, y: moved.y, id: 2 }] })
  await expect.poll(async () => (await readFrame(page)).dragPreview).toBeNull()
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: moved.x - 20, y: moved.y, id: 1 }, { x: moved.x + 100, y: moved.y, id: 2 }] })
  await expect.poll(async () => (await readFrame(page)).scale).not.toBe(frame.scale)
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await expect.poll(() => readPgmlEditorValue(getPgmlEditor(page))).toBe(before)
  await expect.poll(async () => (await readFrame(page)).dragPreview).toBeNull()
  await client.detach()
})

test('a culled group child becomes an actually visible Pixi sprite during held drag and reculls on cancel', async ({ page, goto }) => {
  await prepare(page, goto, true)
  const names = Array.from({ length: 24 }, (_, index) => `public.t${index}`)
  const tallSource = `TableGroup Moving {\n${names.map(name => `  ${name}`).join('\n')}\n}\n${names.map(name => `Table ${name} {\n id int [pk]\n}`).join('\n')}`
  await setPgmlEditorValue(getPgmlEditor(page), tallSource)
  await expect.poll(async () => (await readFrame(page)).renderedTableCards.length).toBe(24)
  const bounds = await page.locator('[data-diagram-viewport="true"]').boundingBox()
  if (!bounds) throw new Error('Viewport unavailable')
  const blank = await page.evaluate((bounds) => {
    for (let y = bounds.y + 40; y < bounds.y + bounds.height * 0.35; y += 30) {
      for (let x = bounds.x + 20; x < bounds.x + bounds.width - 20; x += 30) {
        if (document.elementFromPoint(x, y)?.matches('[data-diagram-gesture-surface="true"]')) return { x, y }
      }
    }
    throw new Error('Unoccluded canvas background unavailable')
  }, bounds)
  const beforePan = await readFrame(page)
  await page.mouse.move(blank.x, blank.y)
  await page.mouse.down()
  await page.mouse.move(blank.x, blank.y + 300, { steps: 10 })
  await page.mouse.up()
  await expect.poll(async () => (await readFrame(page)).panY).toBeGreaterThan(beforePan.panY + 250)
  const pan = await readFrame(page)
  const panGroup = pan.renderedGroupCards[0]!
  await page.mouse.move(bounds.x + pan.panX + (panGroup.x + panGroup.width / 2) * pan.scale, bounds.y + pan.panY + (panGroup.y + 20) * pan.scale)
  await page.mouse.wheel(0, -Math.log(0.45 / pan.scale) * 100 / 0.12)
  await expect.poll(async () => (await readFrame(page)).scale).toBeCloseTo(0.45)
  await expect.poll(async () => {
    const frame = await readFrame(page)
    const headerY = bounds.y + frame.panY + (panGroup.y + 20) * frame.scale
    const distance = Math.min(340, headerY - 5)
    return frame.renderedTableCards.some(card => !card.visible
      && bounds.y + frame.panY + card.y * frame.scale - distance > bounds.y + 5
      && bounds.y + frame.panY + (card.y + card.height) * frame.scale - distance < bounds.y + bounds.height - 5)
  }).toBe(true)
  const baseline = await readFrame(page)
  const group = baseline.renderedGroupCards[0]!
  const point = { x: bounds.x + baseline.panX + (group.x + group.width / 2) * baseline.scale,
    y: bounds.y + baseline.panY + (group.y + 20) * baseline.scale }
  const distance = Math.min(340, point.y - 5)
  const child = baseline.renderedTableCards.find(card => !card.visible
    && bounds.y + baseline.panY + card.y * baseline.scale - distance > bounds.y + 5
    && bounds.y + baseline.panY + (card.y + card.height) * baseline.scale - distance < bounds.y + bounds.height - 5)
  if (!child) throw new Error(JSON.stringify({ bounds, point, distance, scale: baseline.scale, panY: baseline.panY, cards: baseline.renderedTableCards.map(card => ({ id: card.id, visible: card.visible, top: bounds.y + baseline.panY + card.y * baseline.scale, bottom: bounds.y + baseline.panY + (card.y + card.height) * baseline.scale })) }))
  await page.evaluate(() => window.addEventListener('pointerdown', event => Object.assign(window, { __testPointerId: event.pointerId }), { once: true, capture: true }))
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x, point.y - distance, { steps: 10 })
  const visible = async () => (await readFrame(page)).renderedTableCards.find(card => card.id === child.id)?.visible
  await expect.poll(visible).toBe(true)
  await page.evaluate(() => window.dispatchEvent(new Event('resize')))
  await expect.poll(visible).toBe(true)
  await page.locator('[data-diagram-gesture-surface="true"]').evaluate((element) => {
    const pointerId = (window as Window & { __testPointerId?: number }).__testPointerId
    if (pointerId === undefined) throw new Error('Pointer identity unavailable')
    element.dispatchEvent(new PointerEvent('pointercancel', { pointerId, pointerType: 'mouse', bubbles: true }))
  })
  await page.mouse.up()
  await expect.poll(visible).toBe(false)
  await expect.poll(() => readPgmlEditorValue(getPgmlEditor(page))).toBe(tallSource)
})

test('a cancelled GPU toggle press leaves the object collapsed and a completed press still toggles', async ({ page, goto }) => {
  await prepare(page, goto, true)
  const objectSource = `Domain public.email_address {\n  base: text\n}\nTable public.users {\n  id int [pk]\n  email public.email_address\n}`
  await setPgmlEditorValue(getPgmlEditor(page), objectSource)
  const id = 'custom-type:Domain:public.email_address'
  await expect.poll(async () => (await readFrame(page)).renderedObjectCards.some(card => card.id === id)).toBe(true)
  const before = await readFrame(page)
  const object = before.renderedObjectCards.find(card => card.id === id)!
  const bounds = await page.locator('[data-diagram-viewport="true"]').boundingBox()
  if (!bounds) throw new Error('Viewport unavailable')
  const point = { x: bounds.x + before.panX + (object.x + object.width - 14) * before.scale,
    y: bounds.y + before.panY + (object.y + 17) * before.scale }
  await page.evaluate(() => window.addEventListener('pointerdown', event => Object.assign(window, { __testPointerId: event.pointerId }), { once: true, capture: true }))
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.locator('[data-diagram-gesture-surface="true"]').evaluate((element) => {
    const pointerId = (window as Window & { __testPointerId?: number }).__testPointerId
    if (pointerId === undefined) throw new Error('Pointer identity unavailable')
    element.dispatchEvent(new PointerEvent('pointercancel', { pointerId, pointerType: 'mouse', bubbles: true }))
  })
  await page.mouse.up()
  await expect.poll(() => readPgmlEditorValue(getPgmlEditor(page))).toBe(objectSource)
  expect((await readFrame(page)).renderedObjectCards.find(card => card.id === id)?.height).toBe(object.height)
  await page.mouse.click(point.x, point.y)
  await expect.poll(async () => (await readFrame(page)).renderedObjectCards.find(card => card.id === id)?.height).toBeGreaterThan(object.height)
  await expect.poll(() => readPgmlEditorValue(getPgmlEditor(page))).toContain('collapsed: false')
})

test('a cancelled second GPU press does not focus source and a completed double click still focuses', async ({ page, goto }) => {
  await prepare(page, goto, true)
  const frame = await readFrame(page)
  const table = frame.renderedTableCards.find(card => card.id === 'public.users')!
  const bounds = await page.locator('[data-diagram-viewport="true"]').boundingBox()
  if (!bounds) throw new Error('Viewport unavailable')
  const point = { x: bounds.x + frame.panX + (table.x + table.width / 2) * frame.scale,
    y: bounds.y + frame.panY + (table.y + 20) * frame.scale }
  await page.evaluate(() => window.addEventListener('pointerup', () => Object.assign(window, { __testClickAt: Date.now() }), { once: true, capture: true }))
  await page.mouse.click(point.x, point.y)
  const editor = getPgmlEditor(page)
  await setPgmlEditorSelection(editor, 0, 0)
  await page.evaluate(() => window.addEventListener('pointerdown', event => Object.assign(window, { __testPointerId: event.pointerId }), { once: true, capture: true }))
  await page.mouse.down()
  await page.locator('[data-diagram-gesture-surface="true"]').evaluate((element) => {
    const state = window as Window & { __testPointerId?: number, __testClickAt?: number }
    if (state.__testPointerId === undefined || state.__testClickAt === undefined) throw new Error('Click identity unavailable')
    if (Date.now() - state.__testClickAt >= 300) throw new Error('Second press must exercise the double-click interval')
    element.dispatchEvent(new PointerEvent('pointercancel', { pointerId: state.__testPointerId, pointerType: 'mouse', bubbles: true }))
  })
  await page.mouse.up()
  const cancelled = await readPgmlEditorState(editor)
  expect(cancelled.anchor).toBe(0)
  expect(cancelled.head).toBe(0)
  await page.mouse.dblclick(point.x, point.y)
  await expect.poll(async () => {
    const current = await readPgmlEditorState(editor)
    return current.value.slice(Math.min(current.anchor, current.head), Math.max(current.anchor, current.head))
  }).toContain('Table public.users {')
})
