import { describe, expect, it } from 'vitest'

import { buildTableGroupMasonryLayout } from '../../app/utils/pgml-diagram-canvas'

describe('PGML diagram canvas utilities', () => {
  it('packs tables in source order into the currently shortest masonry column', () => {
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
