import { describe, expect, it } from 'vitest'

import {
  getDiagramConnectionZIndex,
  getDiagramGroupBackgroundZIndex,
  getDiagramNodeZIndex
} from '../../app/utils/diagram-layering'

describe('diagram layering utilities', () => {
  it('keeps group backgrounds in a low ordered band', () => {
    expect(getDiagramGroupBackgroundZIndex(1)).toBe(1)
    expect(getDiagramGroupBackgroundZIndex(3)).toBe(3)
  })

  it('assigns foreground node z-index values in ascending even-numbered bands above the background layer', () => {
    expect(getDiagramNodeZIndex(1)).toBe(1002)
    expect(getDiagramNodeZIndex(3)).toBe(1006)
  })

  it('keeps connection lines above all group backgrounds, above the back owner, and below later foreground nodes', () => {
    expect(getDiagramConnectionZIndex(1, 1)).toBe(1003)
    expect(getDiagramConnectionZIndex(1, 4)).toBe(1003)
    expect(getDiagramConnectionZIndex(3, 4)).toBe(1007)
    expect(getDiagramConnectionZIndex(1, 4)).toBeGreaterThan(getDiagramGroupBackgroundZIndex(5000))
    expect(getDiagramConnectionZIndex(1, 4)).toBeLessThan(getDiagramNodeZIndex(4))
  })
})
