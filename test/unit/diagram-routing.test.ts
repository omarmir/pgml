import { describe, expect, it } from 'vitest'

import {
  buildOrthogonalMiddlePoints,
  getDiagramVerticalLaneCandidateXs,
  getDiagramVerticalObstacleIntervals,
  getFieldRowAnchorRatios,
  getHeaderSafeGroupLaneSide,
  pickDiagramVerticalLaneShift,
  pickDiagramAnchorSlot
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

  it('routes mixed-orientation legs with a single corner', () => {
    expect(buildOrthogonalMiddlePoints(
      { x: 80, y: 120 },
      'left',
      { x: 140, y: 220 },
      'bottom'
    )).toEqual([
      { x: 140, y: 120 }
    ])

    expect(buildOrthogonalMiddlePoints(
      { x: 220, y: 140 },
      'right',
      { x: 320, y: 260 },
      'bottom'
    )).toEqual([
      { x: 320, y: 140 }
    ])

    expect(buildOrthogonalMiddlePoints(
      { x: 180, y: 260 },
      'top',
      { x: 320, y: 160 },
      'right'
    )).toEqual([
      { x: 180, y: 160 }
    ])
  })

  it('keeps opposing anchor routes to a single shared lane with two corners', () => {
    expect(buildOrthogonalMiddlePoints(
      { x: 80, y: 120 },
      'left',
      { x: 140, y: 220 },
      'right'
    )).toEqual([
      { x: 110, y: 120 },
      { x: 110, y: 220 }
    ])

    expect(buildOrthogonalMiddlePoints(
      { x: 180, y: 260 },
      'bottom',
      { x: 320, y: 160 },
      'top'
    )).toEqual([
      { x: 180, y: 210 },
      { x: 320, y: 210 }
    ])
  })

  it('maps each field row to top, middle, and bottom border anchors on the row band', () => {
    const ratios = getFieldRowAnchorRatios(40, 20, 0, 100)

    expect(ratios).toHaveLength(3)
    expect(ratios[0]).toBeCloseTo(0.444, 3)
    expect(ratios[1]).toBeCloseTo(0.5, 3)
    expect(ratios[2]).toBeCloseTo(0.556, 3)
  })

  it('prefers unused row anchors before reusing a busier anchor on the same side', () => {
    expect(pickDiagramAnchorSlot(
      [0.444, 0.5, 0.556],
      0.45,
      [1, 0, 0]
    )).toBe(1)

    expect(pickDiagramAnchorSlot(
      [0.444, 0.5, 0.556],
      0.54,
      [0, 0, 1]
    )).toBe(1)

    expect(pickDiagramAnchorSlot(
      [0.444, 0.5, 0.556],
      0.55,
      [0, 0, 0]
    )).toBe(2)

    expect(pickDiagramAnchorSlot(
      [0.444, 0.5, 0.556],
      1,
      [0, 0, 0]
    )).toBe(1)

    expect(pickDiagramAnchorSlot(
      [0.444, 0.5, 0.556],
      0.444,
      [1, 0, 0]
    )).toBe(1)
  })

  it('nudges overlapping vertical lane reservations while leaving non-overlapping spans on the base lane', () => {
    expect(pickDiagramVerticalLaneShift([], 120, 220)).toBe(0)

    expect(pickDiagramVerticalLaneShift([
      { start: 120, end: 220, shift: 0 }
    ], 140, 240)).toBe(4)

    expect(pickDiagramVerticalLaneShift([
      { start: 120, end: 220, shift: 0 },
      { start: 140, end: 240, shift: 4 }
    ], 150, 260)).toBe(-4)

    expect(pickDiagramVerticalLaneShift([
      { start: 120, end: 180, shift: 0 }
    ], 220, 280)).toBe(0)
  })

  it('merges overlapping header obstacles before evaluating vertical lane clearance', () => {
    expect(getDiagramVerticalObstacleIntervals(
      120,
      360,
      [
        { left: 120, right: 220, top: 150, bottom: 220 },
        { left: 210, right: 320, top: 180, bottom: 260 },
        { left: 400, right: 460, top: 500, bottom: 560 }
      ],
      10
    )).toEqual([
      { start: 110, end: 330 }
    ])
  })

  it('offers the nearest clear vertical lane outside any overlapping group header band', () => {
    expect(getDiagramVerticalLaneCandidateXs(
      240,
      120,
      420,
      [
        { left: 120, right: 300, top: 180, bottom: 260 },
        { left: 320, right: 390, top: 200, bottom: 280 }
      ],
      10
    )).toEqual([110, 400])

    expect(getDiagramVerticalLaneCandidateXs(
      90,
      120,
      420,
      [
        { left: 120, right: 300, top: 180, bottom: 260 }
      ],
      10
    )).toEqual([90, 110, 310])
  })
})
