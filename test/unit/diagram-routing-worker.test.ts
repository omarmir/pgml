import { describe, expect, it } from 'vitest'
import type { DiagramRoutingGeometryInput, DiagramRoutingRequest } from '../../app/utils/diagram-routing-contract'
import { routeDiagramConnectionsWithCpu } from '../../app/workers/diagram-routing.worker'

const createColumnGeometry = (tableId: string, x: number, y: number): DiagramRoutingGeometryInput => ({
  bounds: { left: x, right: x + 100, top: y + 60, bottom: y + 80, width: 100, height: 20 },
  groupNodeId: null,
  identity: `${tableId}:id`,
  isColumnAnchor: false,
  isColumnLabelAnchor: true,
  locator: { attribute: 'data-column-label-anchor', value: `${tableId}.id` },
  nodeAnchorId: null,
  ownerNodeId: tableId,
  rowKey: `${tableId}.id`,
  tableBounds: { left: x, right: x + 100, top: y, bottom: y + 180, width: 100, height: 180 },
  tableId
})

const expectPathOutsideHost = (
  line: ReturnType<typeof routeDiagramConnectionsWithCpu>[number],
  host: NonNullable<DiagramRoutingGeometryInput['tableBounds']>
) => {
  for (let index = 1; index < line.points.length; index += 1) {
    const previous = line.points[index - 1]
    const point = line.points[index]
    if (!previous || !point) {
      continue
    }

    const crossesHost = previous.x === point.x
      ? point.x > host.left && point.x < host.right
      && Math.max(previous.y, point.y) > host.top && Math.min(previous.y, point.y) < host.bottom
      : point.y > host.top && point.y < host.bottom
        && Math.max(previous.x, point.x) > host.left && Math.min(previous.x, point.x) < host.right

    expect(crossesHost, line.path).toBe(false)
  }
}

describe('CPU diagram routing', () => {
  it('reserves independent field anchors and vertical lanes across candidate routes', () => {
    const input: DiagramRoutingRequest = {
      descriptors: Array.from({ length: 5 }, (_, index) => ({
        animated: false,
        color: '#79e3ea',
        dashPattern: '0',
        dashed: false,
        fromGeometry: createColumnGeometry('public.source', 100, 100),
        key: `ref:${index}`,
        selectedForeground: false,
        toGeometry: createColumnGeometry('public.target', 500, 350)
      })),
      groupGeometries: [],
      groupHeaderBands: [],
      nodeOrders: {},
      planeBounds: { left: 0, right: 1000, top: 0, bottom: 1000, width: 1000, height: 1000 },
      requestId: 1,
      scale: 1
    }
    const originalInput = structuredClone(input)
    const lines = routeDiagramConnectionsWithCpu(input)

    expect(lines.map(line => line.path)).toEqual([
      'M 200 170 L 350 170 L 350 420 L 500 420',
      'M 200 164.4 L 354 164.4 L 354 414.4 L 500 414.4',
      'M 200 175.6 L 346 175.6 L 346 425.6 L 500 425.6',
      'M 200 170 L 358 170 L 358 420 L 500 420',
      'M 200 164.4 L 342 164.4 L 342 414.4 L 500 414.4'
    ])
    expect(input).toEqual(originalInput)
    expect(routeDiagramConnectionsWithCpu(input)).toEqual(lines)
  })

  it('routes every segment around the opposite endpoint table when both field anchors face left', () => {
    const groupId = 'group:Source'
    const source = {
      ...createColumnGeometry('public.source', 250, 200),
      groupNodeId: groupId,
      nodeAnchorId: groupId,
      ownerNodeId: groupId
    }
    const target = createColumnGeometry('public.target', 100, 100)
    const input: DiagramRoutingRequest = {
      descriptors: [{
        animated: false,
        color: '#79e3ea',
        dashPattern: '0',
        dashed: false,
        fromGeometry: source,
        key: 'ref:crossing',
        selectedForeground: false,
        toGeometry: target
      }],
      groupGeometries: [{
        bounds: { left: 80, right: 400, top: 90, bottom: 500, width: 320, height: 410 },
        groupNodeId: null,
        identity: groupId,
        isColumnAnchor: false,
        isColumnLabelAnchor: false,
        locator: { attribute: 'data-node-anchor', value: groupId },
        nodeAnchorId: groupId,
        ownerNodeId: groupId,
        rowKey: null,
        tableBounds: null,
        tableId: null
      }],
      groupHeaderBands: [],
      nodeOrders: {},
      planeBounds: { left: 0, right: 1000, top: 0, bottom: 1000, width: 1000, height: 1000 },
      requestId: 1,
      scale: 1
    }
    const lines = routeDiagramConnectionsWithCpu(input)

    expect(lines).toHaveLength(1)
    const line = lines[0]
    expect(line?.points[0]).toEqual({ x: 250, y: 270 })
    expect(line?.points.at(-1)).toEqual({ x: 100, y: 170 })
    if (line && source.tableBounds && target.tableBounds) {
      expectPathOutsideHost(line, source.tableBounds)
      expectPathOutsideHost(line, target.tableBounds)
    }
  })

  it.each(['from', 'to'] as const)('keeps crowded group lanes outside the %s endpoint card', (endpoint) => {
    const groupId = 'group:Source'
    const groupGeometry: DiagramRoutingGeometryInput = {
      bounds: { left: 1136, right: 1276, top: 90, bottom: 2000, width: 140, height: 1910 },
      groupNodeId: null,
      identity: groupId,
      isColumnAnchor: false,
      isColumnLabelAnchor: false,
      locator: { attribute: 'data-node-anchor', value: groupId },
      nodeAnchorId: groupId,
      ownerNodeId: groupId,
      rowKey: null,
      tableBounds: null,
      tableId: null
    }
    const headerBand = { left: 1200, right: 1340, top: 220, bottom: 260 }
    const input: DiagramRoutingRequest = {
      descriptors: Array.from({ length: 3 }, (_, index) => {
        const grouped = {
          ...createColumnGeometry(`public.source${index}`, 1156, 1200 + index * 200),
          groupNodeId: groupId,
          nodeAnchorId: groupId,
          ownerNodeId: groupId
        }
        const floating = createColumnGeometry('public.target', 1000, 168)

        return {
          animated: false,
          color: '#79e3ea',
          dashPattern: '0',
          dashed: false,
          fromGeometry: endpoint === 'from' ? floating : grouped,
          key: `ref:${index}`,
          selectedForeground: false,
          toGeometry: endpoint === 'to' ? floating : grouped
        }
      }),
      groupGeometries: [groupGeometry],
      groupHeaderBands: [headerBand],
      nodeOrders: {},
      planeBounds: { left: 0, right: 2000, top: 0, bottom: 2200, width: 2000, height: 2200 },
      requestId: 1,
      scale: 1
    }
    const lines = routeDiagramConnectionsWithCpu(input)

    expect(lines).toHaveLength(3)
    for (const line of lines) {
      const anchor = endpoint === 'from' ? line.points[0] : line.points.at(-1)
      const adjacent = endpoint === 'from' ? line.points[1] : line.points.at(-2)

      expect(anchor).toBeDefined()
      expect(adjacent).toBeDefined()
      if (!anchor || !adjacent) {
        continue
      }

      expect([1000, 1100]).toContain(anchor.x)
      expect(anchor.y).toBeGreaterThanOrEqual(228)
      expect(anchor.y).toBeLessThanOrEqual(248)
      if (anchor.x === 1000) {
        expect(adjacent.x, line.path).toBeLessThanOrEqual(anchor.x)
      } else {
        expect(adjacent.x, line.path).toBeGreaterThanOrEqual(anchor.x)
      }

      for (let index = 1; index < line.points.length; index += 1) {
        const previous = line.points[index - 1]
        const point = line.points[index]
        if (!previous || !point) {
          continue
        }

        const vertical = previous.x === point.x
        expect(vertical || previous.y === point.y).toBe(true)
        const hitsHeader = vertical
          ? point.x > headerBand.left && point.x < headerBand.right
          && Math.max(previous.y, point.y) > headerBand.top && Math.min(previous.y, point.y) < headerBand.bottom
          : point.y > headerBand.top && point.y < headerBand.bottom
            && Math.max(previous.x, point.x) > headerBand.left && Math.min(previous.x, point.x) < headerBand.right

        expect(hitsHeader, line.path).toBe(false)
      }
    }
  })
})
