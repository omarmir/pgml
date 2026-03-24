import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { chromium, type Page } from 'playwright'

import { convertPgDumpToPgml } from '../app/utils/pg-dump-import'

type FrameProbeResult = {
  avgFps: number
  durationMs: number
  frameCount: number
  longestFrameMs: number
  medianFrameMs: number
  p95FrameMs: number
}

type DiagramSceneSummary = {
  fullyRenderedNodeCount: number
  nodeCount: number
  viewportHeight: number
  viewportWidth: number
  visibleNodeCount: number
}

type BenchmarkDragTargetPoint = {
  nodeId: string
  x: number
  y: number
}

type BenchmarkPoint = {
  x: number
  y: number
}

type BenchmarkSummary = {
  drag: FrameProbeResult
  fixture: {
    pgmlCharacters: number
    schemaName: string
    sqlBytes: number
    sqlPath: string
  }
  loadMs: number
  pan: FrameProbeResult
  scene: DiagramSceneSummary
  zoom: FrameProbeResult
}

type StyleProbeTarget = {
  kind: 'rect' | 'viewport-transform-writes'
  selector: string
}

type ProbeWindow = Window & typeof globalThis & {
  __PGML_STYLE_PROBE__?: {
    active: boolean
    intervalHandle: number | null
    mutationTimes: number[]
    lastSignature: string | null
    readSignature: (element: Element, kind: StyleProbeTarget['kind']) => string
    restoreStyleWriteProbe: (() => void) | null
    start: (target: StyleProbeTarget) => void
    stop: () => FrameProbeResult
  }
}

const studioLaunchAccessStorageKey = 'pgml-studio-launch-access-v1'
const savedSchemaStorageKey = 'pgml-studio-schemas-v1'
const benchmarkSchemaId = 'benchmark-sql-dump'
const benchmarkSchemaName = 'Benchmark SQL Dump'
const benchmarkStepDelayMs = 16
const benchmarkPanDistance = 420
const benchmarkDragDistance = 260
const benchmarkStepCount = 72

const sqlPath = resolve(process.cwd(), 'migrations-2026-03-24.sql')
const baseUrl = process.env.PGML_BENCHMARK_BASE_URL || 'http://127.0.0.1:3001'

const roundMetric = (value: number) => {
  return Math.round(value * 100) / 100
}

const installStyleProbe = async (page: Page) => {
  await page.evaluate(() => {
    const typedWindow = window as ProbeWindow

    if (typedWindow.__PGML_STYLE_PROBE__) {
      return
    }

    typedWindow.__PGML_STYLE_PROBE__ = {
      active: false,
      intervalHandle: null,
      lastSignature: null,
      mutationTimes: [],
      restoreStyleWriteProbe: null,
      readSignature: (element, kind) => {
        if (kind === 'viewport-transform-writes' && element instanceof HTMLElement) {
          return element.getAttribute('style') || ''
        }

        if (kind === 'rect' && element instanceof HTMLElement) {
          const bounds = element.getBoundingClientRect()

          return [
            bounds.x,
            bounds.y,
            bounds.width,
            bounds.height
          ].map(value => value.toFixed(2)).join(':')
        }

        if (element instanceof HTMLElement) {
          const computedStyle = getComputedStyle(element)

          return [
            computedStyle.transform,
            computedStyle.translate,
            computedStyle.scale,
            element.getAttribute('style') || ''
          ].join('|')
        }

        return element.getAttribute('style') || ''
      },
      start: (target) => {
        const probe = typedWindow.__PGML_STYLE_PROBE__

        if (!probe) {
          return
        }

        if (probe.intervalHandle !== null) {
          clearInterval(probe.intervalHandle)
        }

        probe.mutationTimes = []
        probe.lastSignature = null
        probe.active = true

        const element = document.querySelector(target.selector)

        if (!(element instanceof Element)) {
          throw new Error(`Unable to find benchmark target: ${target.selector}`)
        }

        if (target.kind === 'viewport-transform-writes' && element instanceof HTMLElement) {
          const styleObject = element.style
          const originalSetProperty = CSSStyleDeclaration.prototype.setProperty

          CSSStyleDeclaration.prototype.setProperty = function (
            property: string,
            value: string | null,
            priority?: string
          ) {
            if (probe.active && this === styleObject && property === '--pgml-plane-scale') {
              probe.mutationTimes.push(performance.now())
            }

            return originalSetProperty.call(this, property, value, priority)
          }
          probe.restoreStyleWriteProbe = () => {
            CSSStyleDeclaration.prototype.setProperty = originalSetProperty
          }
          return
        }

        const tick = () => {
          if (!probe.active) {
            return
          }

          const nextSignature = probe.readSignature(element, target.kind)

          if (probe.lastSignature === null) {
            probe.lastSignature = nextSignature
          } else if (probe.lastSignature !== nextSignature) {
            probe.lastSignature = nextSignature
            probe.mutationTimes.push(performance.now())
          }

        }

        probe.intervalHandle = window.setInterval(tick, 8)
      },
      stop: () => {
        const probe = typedWindow.__PGML_STYLE_PROBE__

        if (!probe) {
          return {
            avgFps: 0,
            durationMs: 0,
            frameCount: 0,
            longestFrameMs: 0,
            medianFrameMs: 0,
            p95FrameMs: 0
          }
        }

        probe.active = false
        if (probe.intervalHandle !== null) {
          clearInterval(probe.intervalHandle)
        }

        probe.intervalHandle = null
        probe.lastSignature = null
        probe.restoreStyleWriteProbe?.()
        probe.restoreStyleWriteProbe = null

        const mutationTimes = [...probe.mutationTimes]

        if (mutationTimes.length < 2) {
          return {
            avgFps: 0,
            durationMs: 0,
            frameCount: mutationTimes.length,
            longestFrameMs: 0,
            medianFrameMs: 0,
            p95FrameMs: 0
          }
        }

        const intervals = mutationTimes.slice(1).map((time, index) => {
          return time - mutationTimes[index]!
        })
        const sortedIntervals = [...intervals].sort((left, right) => left - right)
        const durationMs = mutationTimes.at(-1)! - mutationTimes[0]!
        const medianFrameMs = sortedIntervals[Math.floor(sortedIntervals.length / 2)] || 0
        const p95Index = Math.min(sortedIntervals.length - 1, Math.floor(sortedIntervals.length * 0.95))
        const p95FrameMs = sortedIntervals[p95Index] || 0
        const longestFrameMs = sortedIntervals[sortedIntervals.length - 1] || 0

        return {
          avgFps: durationMs > 0 ? ((mutationTimes.length - 1) / durationMs) * 1000 : 0,
          durationMs,
          frameCount: mutationTimes.length,
          longestFrameMs,
          medianFrameMs,
          p95FrameMs
        } satisfies FrameProbeResult
      }
    }
  })
}

const startStyleProbe = async (page: Page, target: StyleProbeTarget) => {
  await page.evaluate((nextTarget) => {
    const typedWindow = window as ProbeWindow

    typedWindow.__PGML_STYLE_PROBE__?.start(nextTarget)
  }, target)
}

const stopStyleProbe = async (page: Page) => {
  const result = await page.evaluate(() => {
    const typedWindow = window as ProbeWindow

    return typedWindow.__PGML_STYLE_PROBE__?.stop() || {
      avgFps: 0,
      durationMs: 0,
      frameCount: 0,
      longestFrameMs: 0,
      medianFrameMs: 0,
      p95FrameMs: 0
    }
  })

  return {
    avgFps: roundMetric(result.avgFps),
    durationMs: roundMetric(result.durationMs),
    frameCount: result.frameCount,
    longestFrameMs: roundMetric(result.longestFrameMs),
    medianFrameMs: roundMetric(result.medianFrameMs),
    p95FrameMs: roundMetric(result.p95FrameMs)
  } satisfies FrameProbeResult
}

const hideChromeAroundDiagram = async (page: Page) => {
  const hidePgmlButton = page.getByRole('button', { name: 'Hide PGML' }).first()

  if (await hidePgmlButton.count()) {
    await hidePgmlButton.click()
  }

  const hidePanelButton = page.getByRole('button', { name: 'Hide panel' }).first()

  if (await hidePanelButton.count()) {
    await hidePanelButton.click()
  }
}

const waitForDiagramReady = async (page: Page) => {
  await page.waitForSelector('[data-diagram-viewport="true"]', {
    state: 'visible'
  })
  await page.waitForFunction(() => {
    return document.querySelectorAll('[data-node-anchor]').length >= 25
  })
  await page.waitForTimeout(1200)
  await hideChromeAroundDiagram(page)
  await page.waitForTimeout(500)
}

const readSceneSummary = async (page: Page) => {
  const summary = await page.evaluate(() => {
    const viewport = document.querySelector('[data-diagram-viewport="true"]')
    const viewportBounds = viewport?.getBoundingClientRect()
    const nodeElements = Array.from(document.querySelectorAll('[data-node-anchor]')).filter((element): element is HTMLElement => {
      return element instanceof HTMLElement
    })
    const visibleNodeCount = nodeElements.filter((element) => {
      const bounds = element.getBoundingClientRect()

      if (!viewportBounds) {
        return false
      }

      return (
        bounds.width > 0
        && bounds.height > 0
        && bounds.right >= viewportBounds.left
        && bounds.left <= viewportBounds.right
        && bounds.bottom >= viewportBounds.top
        && bounds.top <= viewportBounds.bottom
      )
    }).length
    const fullyRenderedNodeCount = nodeElements.filter((element) => {
      return Boolean(element.querySelector('[data-node-accent]'))
    }).length

    return {
      fullyRenderedNodeCount,
      nodeCount: nodeElements.length,
      viewportHeight: viewportBounds?.height || 0,
      viewportWidth: viewportBounds?.width || 0,
      visibleNodeCount
    } satisfies DiagramSceneSummary
  })

  return {
    fullyRenderedNodeCount: summary.fullyRenderedNodeCount,
    nodeCount: summary.nodeCount,
    viewportHeight: roundMetric(summary.viewportHeight),
    viewportWidth: roundMetric(summary.viewportWidth),
    visibleNodeCount: summary.visibleNodeCount
  } satisfies DiagramSceneSummary
}

const getPanStartPoint = async (page: Page) => {
  return await page.evaluate(() => {
    const viewport = document.querySelector('[data-diagram-viewport="true"]')

    if (!(viewport instanceof HTMLElement)) {
      return null
    }

    const bounds = viewport.getBoundingClientRect()
    const columnCount = 10
    const rowCount = 8

    for (let row = 1; row < rowCount; row += 1) {
      for (let column = columnCount - 1; column >= 1; column -= 1) {
        const sample = {
          x: bounds.left + (bounds.width * column) / columnCount,
          y: bounds.top + (bounds.height * row) / rowCount
        }
        const target = document.elementFromPoint(sample.x, sample.y)

        if (!(target instanceof HTMLElement)) {
          continue
        }

        if (target.closest('[data-node-anchor], [data-diagram-panel], [data-diagram-zoom-toolbar], [data-diagram-panel-toggle]')) {
          continue
        }

        return sample
      }
    }

    return {
      x: bounds.left + bounds.width * 0.9,
      y: bounds.top + bounds.height * 0.5
    }
  })
}

const getDragTargetPoint = async (page: Page) => {
  return await page.evaluate(() => {
    const viewport = document.querySelector('[data-diagram-viewport="true"]')
    const viewportBounds = viewport?.getBoundingClientRect()

    if (!viewportBounds) {
      return null
    }

    const headers = Array.from(document.querySelectorAll('[data-node-header]')).filter((element): element is HTMLElement => {
      return element instanceof HTMLElement
    })

    const candidate = headers.find((header) => {
      const bounds = header.getBoundingClientRect()

      return (
        bounds.width > 32
        && bounds.height > 20
        && bounds.left >= viewportBounds.left + 24
        && bounds.right <= viewportBounds.right - 24
        && bounds.top >= viewportBounds.top + 24
        && bounds.bottom <= viewportBounds.bottom - 24
        && !header.closest('[data-node-anchor^="group:"]')
      )
    })

    if (!candidate) {
      return null
    }

    const bounds = candidate.getBoundingClientRect()
    const nodeId = candidate.getAttribute('data-node-header')

    if (!nodeId) {
      return null
    }

    return {
      nodeId,
      x: bounds.left + Math.min(36, bounds.width / 2),
      y: bounds.top + bounds.height / 2
    } satisfies BenchmarkDragTargetPoint
  })
}

const runSteppedMouseGesture = async (
  page: Page,
  startPoint: BenchmarkPoint,
  deltaX: number,
  deltaY: number
) => {
  await page.mouse.move(startPoint.x, startPoint.y)
  await page.mouse.down()

  for (let step = 1; step <= benchmarkStepCount; step += 1) {
    const progress = step / benchmarkStepCount

    await page.mouse.move(
      startPoint.x + deltaX * progress,
      startPoint.y + deltaY * progress
    )
    await page.waitForTimeout(benchmarkStepDelayMs)
  }

  await page.mouse.up()
  await page.waitForTimeout(250)
}

const readInlineStyle = async (page: Page, selector: string) => {
  return await page.evaluate((targetSelector) => {
    return document.querySelector(targetSelector)?.getAttribute('style') || ''
  }, selector)
}

const summarizeFrameTimes = (frameTimes: number[]) => {
  if (frameTimes.length < 2) {
    return {
      avgFps: 0,
      durationMs: 0,
      frameCount: frameTimes.length,
      longestFrameMs: 0,
      medianFrameMs: 0,
      p95FrameMs: 0
    } satisfies FrameProbeResult
  }

  const intervals = frameTimes.slice(1).map((time, index) => {
    return time - frameTimes[index]!
  })
  const sortedIntervals = [...intervals].sort((left, right) => left - right)
  const durationMs = frameTimes.at(-1)! - frameTimes[0]!
  const medianFrameMs = sortedIntervals[Math.floor(sortedIntervals.length / 2)] || 0
  const p95Index = Math.min(sortedIntervals.length - 1, Math.floor(sortedIntervals.length * 0.95))
  const p95FrameMs = sortedIntervals[p95Index] || 0
  const longestFrameMs = sortedIntervals[sortedIntervals.length - 1] || 0

  return {
    avgFps: durationMs > 0 ? ((frameTimes.length - 1) / durationMs) * 1000 : 0,
    durationMs,
    frameCount: frameTimes.length,
    longestFrameMs,
    medianFrameMs,
    p95FrameMs
  } satisfies FrameProbeResult
}

const roundFrameProbeResult = (result: FrameProbeResult) => {
  return {
    avgFps: roundMetric(result.avgFps),
    durationMs: roundMetric(result.durationMs),
    frameCount: result.frameCount,
    longestFrameMs: roundMetric(result.longestFrameMs),
    medianFrameMs: roundMetric(result.medianFrameMs),
    p95FrameMs: roundMetric(result.p95FrameMs)
  } satisfies FrameProbeResult
}

const readBoundingBoxSignature = async (page: Page, selector: string) => {
  const locator = page.locator(selector).first()
  const bounds = await locator.boundingBox()

  if (!bounds) {
    return 'hidden'
  }

  return [
    bounds.x,
    bounds.y,
    bounds.width,
    bounds.height
  ].map(value => value.toFixed(2)).join(':')
}

const measureStepwiseMotion = async (
  page: Page,
  selector: string,
  runStep: (step: number) => Promise<void>,
  stepCount: number
) => {
  let previousSignature = await readBoundingBoxSignature(page, selector)
  const frameTimes: number[] = []

  for (let step = 0; step < stepCount; step += 1) {
    await runStep(step)
    await page.waitForTimeout(benchmarkStepDelayMs)

    const nextSignature = await readBoundingBoxSignature(page, selector)

    if (nextSignature !== previousSignature) {
      frameTimes.push(performance.now())
      previousSignature = nextSignature
    }
  }

  await page.waitForTimeout(250)

  return roundFrameProbeResult(summarizeFrameTimes(frameTimes))
}

const getViewportProbeNodeId = async (page: Page) => {
  return await page.evaluate(() => {
    const viewport = document.querySelector('[data-diagram-viewport="true"]')
    const viewportBounds = viewport?.getBoundingClientRect()

    if (!viewportBounds) {
      return null
    }

    const candidates = Array.from(document.querySelectorAll('[data-node-header]')).filter((element): element is HTMLElement => {
      return element instanceof HTMLElement
    })

    const candidate = candidates.find((header) => {
      const bounds = header.getBoundingClientRect()

      return (
        bounds.width > 32
        && bounds.height > 20
        && bounds.left >= viewportBounds.left + viewportBounds.width * 0.2
        && bounds.right <= viewportBounds.right - viewportBounds.width * 0.2
        && bounds.top >= viewportBounds.top + viewportBounds.height * 0.2
        && bounds.bottom <= viewportBounds.bottom - viewportBounds.height * 0.2
      )
    }) || candidates.find((header) => {
      return !header.closest('[data-node-anchor^="group:"]')
    })

    return candidate?.getAttribute('data-node-header') || null
  })
}

const measurePanFps = async (page: Page) => {
  const startPoint = await getPanStartPoint(page)
  const probeNodeId = await getViewportProbeNodeId(page)

  if (!startPoint || !probeNodeId) {
    throw new Error('Unable to find a blank point for the pan benchmark.')
  }

  const selector = `[data-node-anchor="${probeNodeId}"]`
  const styleBeforePan = await readInlineStyle(page, '[data-diagram-plane="true"]')

  await page.mouse.move(startPoint.x, startPoint.y)
  await page.mouse.down()

  const result = await measureStepwiseMotion(
    page,
    selector,
    async (step) => {
      const progress = (step + 1) / benchmarkStepCount

      await page.mouse.move(
        startPoint.x - benchmarkPanDistance * progress,
        startPoint.y
      )
    },
    benchmarkStepCount
  )

  await page.mouse.up()
  const styleAfterPan = await readInlineStyle(page, '[data-diagram-plane="true"]')

  if (styleBeforePan === styleAfterPan && result.frameCount < 1) {
    throw new Error('Pan benchmark did not move the diagram plane.')
  }

  return result
}

const measureZoomFps = async (page: Page) => {
  const startPoint = await getPanStartPoint(page)
  const probeNodeId = await getViewportProbeNodeId(page)

  if (!startPoint || !probeNodeId) {
    throw new Error('Unable to find a pivot point for the zoom benchmark.')
  }

  await page.mouse.move(startPoint.x, startPoint.y)
  const selector = `[data-node-anchor="${probeNodeId}"]`
  const styleBeforeZoom = await readInlineStyle(page, '[data-diagram-plane="true"]')
  const measuredWheelStepCount = Math.max(12, Math.floor(benchmarkStepCount / 2))

  const result = await measureStepwiseMotion(
    page,
    selector,
    async () => {
      await page.mouse.wheel(0, -120)
    },
    measuredWheelStepCount
  )

  const styleAfterZoom = await readInlineStyle(page, '[data-diagram-plane="true"]')

  if (styleBeforeZoom === styleAfterZoom && result.frameCount < 1) {
    throw new Error('Zoom benchmark did not change the diagram plane transform.')
  }

  for (let step = 0; step < measuredWheelStepCount; step += 1) {
    await page.mouse.wheel(0, 120)
    await page.waitForTimeout(benchmarkStepDelayMs)
  }

  await page.waitForTimeout(250)

  return result
}

const measureDragFps = async (page: Page) => {
  const targetPoint = await getDragTargetPoint(page)

  if (!targetPoint) {
    throw new Error('Unable to find a visible node header for the drag benchmark.')
  }

  const selector = `[data-node-anchor="${targetPoint.nodeId}"]`
  const styleBeforeDrag = await readInlineStyle(page, selector)

  await page.mouse.move(targetPoint.x, targetPoint.y)
  await page.mouse.down()

  const result = await measureStepwiseMotion(
    page,
    selector,
    async (step) => {
      const progress = (step + 1) / benchmarkStepCount

      await page.mouse.move(
        targetPoint.x + benchmarkDragDistance * progress,
        targetPoint.y
      )
    },
    benchmarkStepCount
  )

  await page.mouse.up()
  const styleAfterDrag = await readInlineStyle(page, selector)

  if (styleBeforeDrag === styleAfterDrag && result.frameCount < 1) {
    throw new Error(`Drag benchmark did not move node ${targetPoint.nodeId}.`)
  }

  return result
}

const benchmarkDiagram = async (page: Page) => {
  await installStyleProbe(page)

  const loadStartedAt = performance.now()

  await page.goto(`${baseUrl}/diagram?launch=saved&schema=${benchmarkSchemaId}&source=browser`)
  await waitForDiagramReady(page)

  const loadMs = roundMetric(performance.now() - loadStartedAt)
  const scene = await readSceneSummary(page)
  const pan = await measurePanFps(page)
  const zoom = await measureZoomFps(page)
  const drag = await measureDragFps(page)

  return {
    drag,
    loadMs,
    pan,
    scene,
    zoom
  }
}

const main = async () => {
  const sql = await readFile(sqlPath, 'utf8')
  const importResult = convertPgDumpToPgml({
    preferredName: 'migrations-2026-03-24.sql',
    sql
  })
  const browser = await chromium.launch({
    args: [
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding'
    ],
    headless: true
  })
  const context = await browser.newContext({
    viewport: {
      height: 900,
      width: 1600
    }
  })

  await context.addInitScript((input) => {
    sessionStorage.setItem(input.studioLaunchAccessStorageKey, 'granted')
    localStorage.setItem(input.savedSchemaStorageKey, JSON.stringify([
      {
        id: input.schemaId,
        name: input.schemaName,
        text: input.schemaText,
        updatedAt: new Date().toISOString()
      }
    ]))
  }, {
    savedSchemaStorageKey,
    schemaId: benchmarkSchemaId,
    schemaName: benchmarkSchemaName,
    schemaText: importResult.pgml,
    studioLaunchAccessStorageKey
  })

  const page = await context.newPage()

  try {
    await page.bringToFront()
    const metrics = await benchmarkDiagram(page)
    const output: BenchmarkSummary = {
      drag: metrics.drag,
      fixture: {
        pgmlCharacters: importResult.pgml.length,
        schemaName: importResult.schemaName,
        sqlBytes: Buffer.byteLength(sql, 'utf8'),
        sqlPath
      },
      loadMs: metrics.loadMs,
      pan: metrics.pan,
      scene: metrics.scene,
      zoom: metrics.zoom
    }

    console.log(JSON.stringify(output, null, 2))
  } finally {
    await page.close()
    await context.close()
    await browser.close()
  }
}

await main()
