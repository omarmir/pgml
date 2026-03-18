import { describe, expect, it } from 'vitest'

import {
  buildOrthogonalMiddlePoints,
  getHeaderSafeGroupLaneSide
} from '../../app/utils/diagram-routing'

describe('diagram routing utilities', () => {
  it('keeps shared group lanes out of the header by never choosing the top edge', () => {
    expect(getHeaderSafeGroupLaneSide(
      { x: 220, y: 140 },
      { x: 240, y: 60 },
      { left: 120, right: 420, top: 80, bottom: 420 }
    )).toBe('left')

    expect(getHeaderSafeGroupLaneSide(
      { x: 320, y: 180 },
      { x: 340, y: 520 },
      { left: 120, right: 420, top: 80, bottom: 420 }
    )).toBe('bottom')
  })

  it('keeps lane-aligned orthogonal segments straight instead of adding extra bends', () => {
    expect(buildOrthogonalMiddlePoints(
      { x: 160, y: 120 },
      'left',
      { x: 160, y: 260 },
      'left'
    )).toEqual([])

    expect(buildOrthogonalMiddlePoints(
      { x: 200, y: 340 },
      'bottom',
      { x: 360, y: 340 },
      'bottom'
    )).toEqual([])
  })
})
