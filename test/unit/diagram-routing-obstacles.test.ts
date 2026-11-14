import { describe, expect, it } from 'vitest'
import type { DiagramPoint, DiagramRect } from '../../app/utils/diagram-routing'
import { avoidDiagramEndpointHostIntersections } from '../../app/utils/diagram-routing-obstacles'

const expectOutsideHosts = (points: DiagramPoint[], hosts: DiagramRect[]) => {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const point = points[index]
    if (!previous || !point) continue
    expect(previous.x === point.x || previous.y === point.y).toBe(true)
    for (const host of hosts) {
      const crosses = previous.x === point.x
        ? point.x > host.left && point.x < host.right && Math.max(previous.y, point.y) > host.top && Math.min(previous.y, point.y) < host.bottom
        : point.y > host.top && point.y < host.bottom && Math.max(previous.x, point.x) > host.left && Math.min(previous.x, point.x) < host.right
      expect(crosses, JSON.stringify({ previous, point, host })).toBe(false)
    }
  }
}

describe('endpoint host routing obstacles', () => {
  const host = { left: 100, right: 200, top: 0, bottom: 100 }

  it('preserves every point and the array identity of an unobstructed route', () => {
    const points = [{ x: 100, y: 20 }, { x: 90, y: 20 }, { x: 90, y: 80 }, { x: 100, y: 80 }]
    expect(avoidDiagramEndpointHostIntersections(points, { from: host, to: host }, [])).toBe(points)
    expect(avoidDiagramEndpointHostIntersections([], { from: host, to: host }, [])).toEqual([])
  })

  it.each([
    [{ x: 100, y: 20 }, { x: 150, y: 20 }, { x: 150, y: 80 }, { x: 100, y: 80 }],
    [{ x: 200, y: 20 }, { x: 150, y: 20 }, { x: 150, y: 80 }, { x: 200, y: 80 }],
    [{ x: 120, y: 0 }, { x: 120, y: 50 }, { x: 180, y: 50 }, { x: 180, y: 0 }],
    [{ x: 120, y: 100 }, { x: 120, y: 50 }, { x: 180, y: 50 }, { x: 180, y: 100 }]
  ])('keeps a self reference outside its card from each anchor side (%j)', (...points) => {
    const original = structuredClone(points)
    const route = avoidDiagramEndpointHostIntersections(points, { from: host, to: host }, [])

    expect(route[0]).toEqual(points[0])
    expect(route.at(-1)).toEqual(points.at(-1))
    expectOutsideHosts(route, [host])
    expect(points).toEqual(original)
  })

  it('fits an outward connection through a narrow gap between two nonoverlapping cards', () => {
    const from = { left: 0, right: 100, top: 0, bottom: 100 }
    const to = { left: 101, right: 201, top: 0, bottom: 100 }
    const points = [{ x: 100, y: 20 }, { x: 50, y: 20 }, { x: 50, y: 80 }, { x: 101, y: 80 }]
    const route = avoidDiagramEndpointHostIntersections(points, { from, to }, [])

    expect(route[0]).toEqual(points[0])
    expect(route.at(-1)).toEqual(points.at(-1))
    expectOutsideHosts(route, [from, to])
  })

  it('follows the shared edge when two cards touch without overlapping interiors', () => {
    const from = { left: 0, right: 100, top: 0, bottom: 100 }
    const to = { left: 100, right: 200, top: 0, bottom: 100 }
    const points = [{ x: 100, y: 20 }, { x: 50, y: 20 }, { x: 50, y: 80 }, { x: 100, y: 80 }]
    const route = avoidDiagramEndpointHostIntersections(points, { from, to }, [])

    expect(route).toEqual([{ x: 100, y: 20 }, { x: 100, y: 80 }])
    expectOutsideHosts(route, [from, to])
  })

  it('routes object endpoints around a table and intervening group headers', () => {
    const from = { left: 400, right: 500, top: 100, bottom: 160 }
    const to = { left: 100, right: 200, top: 200, bottom: 400 }
    const header = { left: 210, right: 390, top: 170, bottom: 230 }
    const points = [{ x: 400, y: 130 }, { x: 450, y: 130 }, { x: 450, y: 270 }, { x: 200, y: 270 }]
    const route = avoidDiagramEndpointHostIntersections(points, { from, to }, [header])

    expect(route[0]).toEqual(points[0])
    expect(route.at(-1)).toEqual(points.at(-1))
    expectOutsideHosts(route, [from, to, header])
  })

  it('keeps endpoints attached when a group header covers the only approach to an endpoint', () => {
    const header = { left: 80, right: 110, top: 0, bottom: 100 }
    const points = [{ x: 100, y: 20 }, { x: 150, y: 20 }, { x: 150, y: 80 }, { x: 100, y: 80 }]
    const route = avoidDiagramEndpointHostIntersections(points, { from: host, to: host }, [header])

    expect(route[0]).toEqual(points[0])
    expect(route.at(-1)).toEqual(points.at(-1))
    expectOutsideHosts(route, [host])
  })

  it('preserves anchored geometry when overlapping cards physically cover both endpoints', () => {
    const from = { left: 0, right: 100, top: 0, bottom: 100 }
    const to = { left: 50, right: 150, top: 0, bottom: 100 }
    const points = [{ x: 100, y: 20 }, { x: 120, y: 20 }, { x: 120, y: 80 }, { x: 50, y: 80 }]
    expect(avoidDiagramEndpointHostIntersections(points, { from, to }, [])).toBe(points)
  })
})
