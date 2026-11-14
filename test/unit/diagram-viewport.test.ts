import { describe, expect, it } from 'vitest'
import { getDiagramViewportFitTransform } from '../../app/utils/diagram-viewport'

describe('diagram viewport fitting', () => {
  it('fits a large model below the normal manual zoom limit while preserving padding', () => {
    const bounds = { height: 31_000, width: 3800, x: -120, y: 90 }
    const transform = getDiagramViewportFitTransform({
      bounds,
      maxScale: 1.95,
      viewportHeight: 900,
      viewportInsetRight: 336,
      viewportWidth: 1600
    })

    expect(transform.scale).toBeCloseTo(820 / 31_000)
    expect(bounds.y * transform.scale + transform.panY).toBeCloseTo(40)
    expect((bounds.y + bounds.height) * transform.scale + transform.panY).toBeCloseTo(860)
    expect(bounds.x * transform.scale + transform.panX).toBeGreaterThanOrEqual(40)
    expect((bounds.x + bounds.width) * transform.scale + transform.panX).toBeLessThanOrEqual(1600 - 336 - 40)
  })

  it('fits wide models without drawing beneath the right panel', () => {
    const transform = getDiagramViewportFitTransform({
      bounds: { height: 200, width: 10_000, x: 100, y: -60 },
      maxScale: 1.95,
      viewportHeight: 800,
      viewportInsetRight: 336,
      viewportWidth: 1400
    })

    expect(transform.scale).toBeCloseTo(984 / 10_000)
    expect(100 * transform.scale + transform.panX).toBeCloseTo(40)
    expect(10_100 * transform.scale + transform.panX).toBeCloseTo(1400 - 336 - 40)
    expect(40 * transform.scale + transform.panY).toBeCloseTo(400)
  })

  it('caps magnification for small models and accepts custom focus padding', () => {
    expect(getDiagramViewportFitTransform({
      bounds: { height: 100, width: 200, x: 10, y: 20 },
      maxScale: 1.95,
      padding: 72,
      viewportHeight: 800,
      viewportWidth: 1200
    })).toEqual({ panX: 385.5, panY: 263.5, scale: 1.95 })
  })

  it('keeps a positive finite transform for empty bounds and a temporarily collapsed viewport', () => {
    const transform = getDiagramViewportFitTransform({
      bounds: { height: 0, width: 0, x: 0, y: 0 },
      maxScale: 1.95,
      viewportHeight: 0,
      viewportInsetRight: -20,
      viewportWidth: 0
    })

    expect(transform).toEqual({ panX: 40, panY: 40, scale: 1 })
  })
})
