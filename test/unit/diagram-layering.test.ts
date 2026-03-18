import { describe, expect, it } from 'vitest'

import {
  getDiagramConnectionZIndex,
  getDiagramNodeZIndex
} from '../../app/utils/diagram-layering'

describe('diagram layering utilities', () => {
  it('assigns node z-index values in ascending even-numbered bands', () => {
    expect(getDiagramNodeZIndex(1)).toBe(2)
    expect(getDiagramNodeZIndex(3)).toBe(6)
  })

  it('keeps connection lines above the back owner but below later nodes', () => {
    expect(getDiagramConnectionZIndex(1, 1)).toBe(3)
    expect(getDiagramConnectionZIndex(1, 4)).toBe(3)
    expect(getDiagramConnectionZIndex(3, 4)).toBe(7)
  })
})
