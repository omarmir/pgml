import { describe, expect, it } from 'vitest'
import {
  getDiagramPinchViewportTransform,
  getDiagramTouchGesture
} from '../../app/utils/diagram-touch'

describe('diagram touch utilities', () => {
  it('derives the center point and distance for a two-touch gesture', () => {
    expect(getDiagramTouchGesture(
      {
        x: 20,
        y: 40
      },
      {
        x: 80,
        y: 100
      }
    )).toEqual({
      center: {
        x: 50,
        y: 70
      },
      distance: Math.hypot(60, 60)
    })
  })

  it('keeps the original plane anchor under the gesture while pinch zooming', () => {
    expect(getDiagramPinchViewportTransform({
      currentCenter: {
        x: 190,
        y: 230
      },
      currentDistance: 240,
      initialCenter: {
        x: 150,
        y: 180
      },
      initialDistance: 120,
      initialPan: {
        x: 30,
        y: 60
      },
      initialScale: 0.5,
      maxScale: 1.3,
      minScale: 0.28
    })).toEqual({
      pan: {
        x: -50,
        y: -10
      },
      scale: 1
    })
  })

  it('preserves small scale changes while pinch zooming an overview of a large model', () => {
    const transform = getDiagramPinchViewportTransform({
      currentCenter: { x: 100, y: 100 },
      currentDistance: 108,
      initialCenter: { x: 100, y: 100 },
      initialDistance: 100,
      initialPan: { x: 0, y: 0 },
      initialScale: 0.004,
      maxScale: 1.95,
      minScale: 0.001
    })

    expect(transform.scale).toBeCloseTo(0.00432)
    expect(transform.pan).toEqual({ x: -8, y: -8 })
  })
})
