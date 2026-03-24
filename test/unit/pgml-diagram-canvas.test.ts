import { describe, expect, it } from 'vitest'

import { buildTableGroupMasonryLayout } from '../../app/utils/pgml-diagram-canvas'

describe('PGML diagram canvas utilities', () => {
  it('keeps the requested masonry column count when it produces the most compact layout', () => {
    const layout = buildTableGroupMasonryLayout([
      {
        id: 'public.roles',
        height: 80
      },
      {
        id: 'public.users',
        height: 180
      },
      {
        id: 'public.tenants',
        height: 90
      }
    ], 2, 232, 16)

    expect(layout).toMatchObject({
      columnCount: 2,
      contentHeight: 186,
      contentWidth: 480
    })
    expect(layout.placements['public.roles']).toEqual({
      columnIndex: 0,
      height: 80,
      id: 'public.roles',
      x: 0,
      y: 0
    })
    expect(layout.placements['public.users']).toEqual({
      columnIndex: 1,
      height: 180,
      id: 'public.users',
      x: 248,
      y: 0
    })
    expect(layout.placements['public.tenants']).toEqual({
      columnIndex: 0,
      height: 90,
      id: 'public.tenants',
      x: 0,
      y: 96
    })
  })

  it('can reduce the effective masonry column count to compact a group with a late tall table', () => {
    const layout = buildTableGroupMasonryLayout([
      {
        id: 'public.address',
        height: 80
      },
      {
        id: 'public.agency',
        height: 80
      },
      {
        id: 'public.contact',
        height: 80
      },
      {
        id: 'public.other',
        height: 80
      },
      {
        id: 'public.team',
        height: 80
      },
      {
        id: 'public.profile',
        height: 320
      }
    ], 4, 232, 16)

    expect(layout).toMatchObject({
      columnCount: 3,
      contentHeight: 416,
      contentWidth: 728
    })
    expect(layout.placements['public.address']).toEqual({
      columnIndex: 0,
      height: 80,
      id: 'public.address',
      x: 0,
      y: 0
    })
    expect(layout.placements['public.agency']).toEqual({
      columnIndex: 1,
      height: 80,
      id: 'public.agency',
      x: 248,
      y: 0
    })
    expect(layout.placements['public.contact']).toEqual({
      columnIndex: 2,
      height: 80,
      id: 'public.contact',
      x: 496,
      y: 0
    })
    expect(layout.placements['public.other']).toEqual({
      columnIndex: 0,
      height: 80,
      id: 'public.other',
      x: 0,
      y: 96
    })
    expect(layout.placements['public.team']).toEqual({
      columnIndex: 1,
      height: 80,
      id: 'public.team',
      x: 248,
      y: 96
    })
    expect(layout.placements['public.profile']).toEqual({
      columnIndex: 2,
      height: 320,
      id: 'public.profile',
      x: 496,
      y: 96
    })
  })

  it('clamps the masonry column count to the number of items', () => {
    const layout = buildTableGroupMasonryLayout([
      {
        id: 'public.users',
        height: 120
      }
    ], 10, 232, 16)

    expect(layout.columnCount).toBe(1)
    expect(layout.contentWidth).toBe(232)
    expect(layout.contentHeight).toBe(120)
  })
})
