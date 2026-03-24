import {
  buildOrthogonalMiddlePoints,
  diagramVerticalLaneShiftPattern,
  getDiagramVerticalLaneCandidateXs,
  getFieldRowAnchorRatios,
  getHeaderSafeGroupLaneSide,
  hasDiagramVerticalLaneOverlap,
  isDiagramVerticalLaneBlockedByRects,
  isHorizontalDiagramSide,
  pickDiagramAnchorSlot,
  type DiagramRect,
  type DiagramVerticalLaneReservation
} from '../utils/diagram-routing'
import { getDiagramConnectionZIndex } from '../utils/diagram-layering'

type AnchorSide = 'left' | 'right' | 'top' | 'bottom'

type LayoutPoint = {
  x: number
  y: number
}

type AnchorPoint = {
  x: number
  y: number
  side: AnchorSide
  slot: number
  count: number
}

type UsageReservation = {
  count: number
  key: string
  slot: number
}

type RouteLeg = {
  anchor: AnchorPoint
  exit: LayoutPoint
  outer: LayoutPoint
  side: AnchorSide
  outerSide: AnchorSide
  grouped: boolean
  hostCenterX: number
}

type VerticalSegmentUsage = Map<string, DiagramVerticalLaneReservation[]>

type WorkerConnectionEndpointLocator = {
  attribute: string
  value: string
} | null

type WorkerMeasuredBounds = {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
}

type WorkerConnectionGeometry = {
  bounds: WorkerMeasuredBounds
  groupNodeId: string | null
  identity: string
  isColumnAnchor: boolean
  isColumnLabelAnchor: boolean
  locator: WorkerConnectionEndpointLocator
  nodeAnchorId: string | null
  ownerNodeId: string | null
  rowKey: string | null
  tableId: string | null
}

type WorkerConnectionDescriptor = {
  animated: boolean
  color: string
  dashPattern: string
  dashed: boolean
  fromGeometry: WorkerConnectionGeometry
  key: string
  selectedForeground: boolean
  toGeometry: WorkerConnectionGeometry
}

type WorkerConnectionLine = {
  animated: boolean
  bounds: {
    maxX: number
    maxY: number
    minX: number
    minY: number
  }
  color: string
  dashPattern: string
  dashed: boolean
  fromEndpoint: WorkerConnectionEndpointLocator
  fromOwnerNodeId: string | null
  key: string
  path: string
  points: LayoutPoint[]
  toEndpoint: WorkerConnectionEndpointLocator
  toOwnerNodeId: string | null
  usageReservations: UsageReservation[]
  zIndex: number
}

type WorkerRouteRequest = {
  descriptors: WorkerConnectionDescriptor[]
  groupHeaderBands: DiagramRect[]
  nodeOrders: Record<string, number>
  planeBounds: WorkerMeasuredBounds
  requestId: number
  scale: number
}

type WorkerRouteResponse = {
  lines: WorkerConnectionLine[]
  requestId: number
}

const groupLaneInnerBaseOffset = 14
const groupLaneInnerBorderClearance = 18
const groupLaneInnerGap = 18
const groupLaneOuterBaseOffset = 18
const groupLaneOuterGap = 18
const groupHeaderLaneClearance = 16
const verticalSegmentKeyScale = 4

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const cloneUsageMap = (usage: Map<string, number[]>) => {
  return new Map(Array.from(usage.entries()).map(([key, slots]) => {
    return [key, [...slots]]
  }))
}

const cloneVerticalSegmentUsage = (verticalUsage: VerticalSegmentUsage) => {
  return new Map(Array.from(verticalUsage.entries()).map(([key, segments]) => {
    return [key, segments.map(segment => ({ ...segment }))]
  }))
}

const replaceUsageMap = <T>(target: Map<string, T>, source: Map<string, T>) => {
  target.clear()

  for (const [key, value] of source.entries()) {
    target.set(key, value)
  }
}

const getAnchorSlotCount = (geometry: WorkerConnectionGeometry, side: AnchorSide) => {
  if (geometry.isColumnLabelAnchor) {
    return isHorizontalDiagramSide(side) ? 2 : 3
  }

  const dimension = isHorizontalDiagramSide(side) ? geometry.bounds.height : geometry.bounds.width
  const divisor = geometry.tableId && geometry.locator?.attribute === 'data-table-anchor'
    ? (isHorizontalDiagramSide(side) ? 72 : 144)
    : (isHorizontalDiagramSide(side) ? 56 : 128)

  return Math.max(2, Math.min(10, Math.ceil(dimension / divisor)))
}

const getAnchorPointFromBounds = (
  bounds: WorkerMeasuredBounds,
  side: AnchorSide,
  slot: number,
  count: number,
  planeBounds: WorkerMeasuredBounds,
  scale: number
): AnchorPoint => {
  const ratio = count === 1 ? 0.5 : (slot + 1) / (count + 1)
  const xLeft = (bounds.left - planeBounds.left) / scale
  const xRight = (bounds.right - planeBounds.left) / scale
  const yTop = (bounds.top - planeBounds.top) / scale
  const yBottom = (bounds.bottom - planeBounds.top) / scale
  const xCenter = (bounds.left - planeBounds.left + bounds.width * ratio) / scale
  const yCenter = (bounds.top - planeBounds.top + bounds.height * ratio) / scale

  if (side === 'left') {
    return { x: xLeft, y: yCenter, side, slot, count }
  }

  if (side === 'right') {
    return { x: xRight, y: yCenter, side, slot, count }
  }

  if (side === 'top') {
    return { x: xCenter, y: yTop, side, slot, count }
  }

  return { x: xCenter, y: yBottom, side, slot, count }
}

const getExactAnchorPoint = (
  bounds: WorkerMeasuredBounds,
  side: AnchorSide,
  ratio: number,
  planeBounds: WorkerMeasuredBounds,
  scale: number,
  metadata: {
    slot: number
    count: number
  } = {
    slot: 0,
    count: 1
  }
): AnchorPoint => {
  const clampedRatio = clamp(ratio, 0, 1)
  const xLeft = (bounds.left - planeBounds.left) / scale
  const xRight = (bounds.right - planeBounds.left) / scale
  const yTop = (bounds.top - planeBounds.top) / scale
  const yBottom = (bounds.bottom - planeBounds.top) / scale
  const xCenter = (bounds.left - planeBounds.left + bounds.width * clampedRatio) / scale
  const yCenter = (bounds.top - planeBounds.top + bounds.height * clampedRatio) / scale

  if (side === 'left') {
    return { x: xLeft, y: yCenter, side, slot: metadata.slot, count: metadata.count }
  }

  if (side === 'right') {
    return { x: xRight, y: yCenter, side, slot: metadata.slot, count: metadata.count }
  }

  if (side === 'top') {
    return { x: xCenter, y: yTop, side, slot: metadata.slot, count: metadata.count }
  }

  return { x: xCenter, y: yBottom, side, slot: metadata.slot, count: metadata.count }
}

const reserveAnchorPoint = (
  geometry: WorkerConnectionGeometry,
  side: AnchorSide,
  desiredRatio: number,
  planeBounds: WorkerMeasuredBounds,
  scale: number,
  usage: Map<string, number[]>,
  reservations: UsageReservation[]
) => {
  const count = getAnchorSlotCount(geometry, side)
  const key = `${geometry.identity}:${side}`
  const slots = usage.get(key) || Array.from({ length: count }, () => 0)

  if (slots.length < count) {
    slots.push(...Array.from({ length: count - slots.length }, () => 0))
  }

  let bestSlot = 0
  let bestScore = Number.POSITIVE_INFINITY

  for (let slot = 0; slot < count; slot += 1) {
    const ratio = count === 1 ? 0.5 : (slot + 1) / (count + 1)
    const slotUsage = slots[slot] || 0
    const score = Math.abs(ratio - desiredRatio) + slotUsage * 0.35

    if (score < bestScore) {
      bestScore = score
      bestSlot = slot
    }
  }

  slots[bestSlot] = (slots[bestSlot] || 0) + 1
  usage.set(key, slots)
  reservations.push({
    key,
    slot: bestSlot,
    count
  })

  return getAnchorPointFromBounds(geometry.bounds, side, bestSlot, count, planeBounds, scale)
}

const moveAnchorPoint = (point: AnchorPoint, distance: number) => {
  if (point.side === 'left') {
    return { x: point.x - distance, y: point.y }
  }

  if (point.side === 'right') {
    return { x: point.x + distance, y: point.y }
  }

  if (point.side === 'top') {
    return { x: point.x, y: point.y - distance }
  }

  return { x: point.x, y: point.y + distance }
}

const getDesiredAnchorRatio = (
  side: AnchorSide,
  bounds: WorkerMeasuredBounds,
  targetCenterX: number,
  targetCenterY: number
) => {
  return isHorizontalDiagramSide(side)
    ? clamp((targetCenterY - bounds.top) / Math.max(bounds.height, 1), 0.16, 0.84)
    : clamp((targetCenterX - bounds.left) / Math.max(bounds.width, 1), 0.16, 0.84)
}

const reserveFieldRowAnchorPoint = (
  fieldGeometry: WorkerConnectionGeometry,
  tableGeometry: WorkerConnectionGeometry,
  side: 'left' | 'right',
  targetCenterY: number,
  planeBounds: WorkerMeasuredBounds,
  scale: number,
  usage: Map<string, number[]>,
  reservations: UsageReservation[],
  rowByKey: Map<string, WorkerConnectionGeometry>
) => {
  const rowGeometry = fieldGeometry.rowKey ? rowByKey.get(fieldGeometry.rowKey) || null : null
  const tableBounds = tableGeometry.bounds
  const desiredRatio = clamp((targetCenterY - tableBounds.top) / Math.max(tableBounds.height, 1), 0, 1)

  if (!rowGeometry) {
    return getExactAnchorPoint(tableGeometry.bounds, side, desiredRatio, planeBounds, scale)
  }

  const fieldBounds = fieldGeometry.bounds
  const rowBounds = rowGeometry.bounds
  const anchorBandHeight = fieldBounds.height > 0 ? fieldBounds.height : rowBounds.height
  const candidateRatios = getFieldRowAnchorRatios(
    fieldBounds.top,
    anchorBandHeight,
    tableBounds.top,
    tableBounds.height
  )
  const rowKey = rowGeometry.rowKey || fieldGeometry.identity
  const usageKey = `field-row:${rowKey}:${side}`
  const slotUsage = usage.get(usageKey) || Array.from({ length: candidateRatios.length }, () => 0)

  if (slotUsage.length < candidateRatios.length) {
    slotUsage.push(...Array.from({ length: candidateRatios.length - slotUsage.length }, () => 0))
  }

  const bestSlot = pickDiagramAnchorSlot(candidateRatios, desiredRatio, slotUsage)

  slotUsage[bestSlot] = (slotUsage[bestSlot] || 0) + 1
  usage.set(usageKey, slotUsage)
  reservations.push({
    key: usageKey,
    slot: bestSlot,
    count: candidateRatios.length
  })

  return getExactAnchorPoint(
    tableGeometry.bounds,
    side,
    candidateRatios[bestSlot] ?? desiredRatio,
    planeBounds,
    scale,
    {
      slot: bestSlot,
      count: candidateRatios.length
    }
  )
}

const reserveLaneOffset = (
  key: string,
  usage: Map<string, number[]>,
  baseOffset: number,
  gap: number
) => {
  const slots = usage.get(key) || [0]
  const laneIndex = slots[0] || 0

  slots[0] = laneIndex + 1
  usage.set(key, slots)

  return baseOffset + laneIndex * gap
}

const getRouteOffset = (fromAnchor: AnchorPoint, toAnchor: AnchorPoint) => {
  const baseOffset = 10 + (fromAnchor.slot % 4) * 4 + (toAnchor.slot % 4) * 3

  if (isHorizontalDiagramSide(fromAnchor.side) && isHorizontalDiagramSide(toAnchor.side) && fromAnchor.side !== toAnchor.side) {
    return Math.min(baseOffset, Math.max(0, Math.abs(toAnchor.x - fromAnchor.x) / 2 - 1))
  }

  if (!isHorizontalDiagramSide(fromAnchor.side) && !isHorizontalDiagramSide(toAnchor.side) && fromAnchor.side !== toAnchor.side) {
    return Math.min(baseOffset, Math.max(0, Math.abs(toAnchor.y - fromAnchor.y) / 2 - 1))
  }

  return baseOffset
}

const pointsMatch = (left: LayoutPoint, right: LayoutPoint) => {
  return Math.abs(left.x - right.x) < 0.5 && Math.abs(left.y - right.y) < 0.5
}

const getSharedAxis = (left: LayoutPoint, right: LayoutPoint) => {
  if (Math.abs(left.x - right.x) < 0.5) {
    return 'x'
  }

  if (Math.abs(left.y - right.y) < 0.5) {
    return 'y'
  }

  return null
}

const appendRoutePoint = (points: LayoutPoint[], point: LayoutPoint) => {
  const lastPoint = points.at(-1)

  if (lastPoint && pointsMatch(lastPoint, point)) {
    return
  }

  const previousPoint = points.at(-2)
  const previousAxis = previousPoint && lastPoint ? getSharedAxis(previousPoint, lastPoint) : null
  const nextAxis = lastPoint ? getSharedAxis(lastPoint, point) : null

  if (previousAxis && nextAxis && previousAxis === nextAxis) {
    points[points.length - 1] = point
    return
  }

  points.push(point)
}

const buildPathFromPoints = (points: LayoutPoint[]) => {
  return points.map((point, index) => {
    return `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
  }).join(' ')
}

const getConnectionLineBounds = (points: LayoutPoint[]) => {
  const firstPoint = points[0]

  if (!firstPoint) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 }
  }

  return points.slice(1).reduce<WorkerConnectionLine['bounds']>((bounds, point) => {
    return {
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y)
    }
  }, {
    minX: firstPoint.x,
    minY: firstPoint.y,
    maxX: firstPoint.x,
    maxY: firstPoint.y
  })
}

const getVerticalSegmentUsageKey = (x: number) => {
  return `vertical:${Math.round(x * verticalSegmentKeyScale) / verticalSegmentKeyScale}`
}

const reserveVerticalSegmentX = (
  baseX: number,
  startY: number,
  endY: number,
  verticalUsage: VerticalSegmentUsage,
  headerBands: DiagramRect[]
) => {
  const candidateXs = getDiagramVerticalLaneCandidateXs(baseX, startY, endY, headerBands, groupHeaderLaneClearance)
  const seenCandidates = new Set<number>()

  for (const candidateBaseX of candidateXs) {
    for (const shift of diagramVerticalLaneShiftPattern) {
      const candidateX = Math.round((candidateBaseX + shift) * verticalSegmentKeyScale) / verticalSegmentKeyScale

      if (seenCandidates.has(candidateX)) {
        continue
      }

      seenCandidates.add(candidateX)

      if (isDiagramVerticalLaneBlockedByRects(candidateX, startY, endY, headerBands, groupHeaderLaneClearance)) {
        continue
      }

      const key = getVerticalSegmentUsageKey(candidateX)
      const segments = verticalUsage.get(key) || []

      if (hasDiagramVerticalLaneOverlap(segments, startY, endY)) {
        continue
      }

      segments.push({
        start: Math.min(startY, endY),
        end: Math.max(startY, endY),
        shift: candidateX - baseX
      })
      verticalUsage.set(key, segments)

      return candidateX
    }
  }

  const fallbackX = candidateXs[0] ?? baseX
  const fallbackKey = getVerticalSegmentUsageKey(fallbackX)
  const fallbackSegments = verticalUsage.get(fallbackKey) || []

  fallbackSegments.push({
    start: Math.min(startY, endY),
    end: Math.max(startY, endY),
    shift: fallbackX - baseX
  })
  verticalUsage.set(fallbackKey, fallbackSegments)

  return fallbackX
}

const offsetOverlappingVerticalSegments = (
  points: LayoutPoint[],
  verticalUsage: VerticalSegmentUsage,
  headerBands: DiagramRect[]
) => {
  const basePoints = points.map(point => ({ ...point }))
  const adjustedPoints = points.map(point => ({ ...point }))

  for (let index = 0; index < basePoints.length - 1; index += 1) {
    const fromPoint = basePoints[index]
    const toPoint = basePoints[index + 1]
    const previousPoint = basePoints[index - 1]
    const nextPoint = basePoints[index + 2]

    if (!fromPoint || !toPoint || !previousPoint || !nextPoint) {
      continue
    }

    if (Math.abs(fromPoint.x - toPoint.x) >= 0.5 || Math.abs(fromPoint.y - toPoint.y) < 0.5) {
      continue
    }

    if (Math.abs(previousPoint.y - fromPoint.y) >= 0.5 || Math.abs(toPoint.y - nextPoint.y) >= 0.5) {
      continue
    }

    const shift = reserveVerticalSegmentX(fromPoint.x, fromPoint.y, toPoint.y, verticalUsage, headerBands) - fromPoint.x

    if (shift === 0) {
      continue
    }

    adjustedPoints[index] = { ...adjustedPoints[index]!, x: adjustedPoints[index]!.x + shift }
    adjustedPoints[index + 1] = { ...adjustedPoints[index + 1]!, x: adjustedPoints[index + 1]!.x + shift }
  }

  return adjustedPoints
}

const getHorizontalSideBacktrack = (
  points: LayoutPoint[],
  leg: RouteLeg,
  direction: 'from' | 'to'
): 'left' | 'right' | null => {
  if (!isHorizontalDiagramSide(leg.outerSide)) {
    return null
  }

  const lanePoint = direction === 'from'
    ? points.slice(1).find((point, index) => {
        const previous = points[index]

        return Boolean(previous && Math.abs(previous.x - point.x) < 0.5 && Math.abs(previous.y - point.y) > 0.5)
      })
    : [...points.keys()].slice(1).reverse().map((index) => {
        const previous = points[index - 1]
        const point = points[index]

        if (!previous || !point || Math.abs(previous.x - point.x) >= 0.5 || Math.abs(previous.y - point.y) <= 0.5) {
          return null
        }

        return point
      }).find(point => Boolean(point)) || null

  if (lanePoint) {
    const horizontalCenterX = leg.hostCenterX

    if (lanePoint.x < horizontalCenterX - 0.5) {
      return 'left'
    }

    if (lanePoint.x > horizontalCenterX + 0.5) {
      return 'right'
    }
  }

  const pointIndex = direction === 'from'
    ? points.findIndex(point => pointsMatch(point, leg.outer))
    : points.findLastIndex(point => pointsMatch(point, leg.outer))

  if (pointIndex < 0) {
    return null
  }

  const adjacentPoint = direction === 'from' ? points[pointIndex + 1] : points[pointIndex - 1]

  if (!adjacentPoint || Math.abs(adjacentPoint.y - leg.outer.y) >= 0.5) {
    return null
  }

  if (leg.outerSide === 'right' && adjacentPoint.x < leg.outer.x - 0.5) {
    return 'left'
  }

  if (leg.outerSide === 'left' && adjacentPoint.x > leg.outer.x + 0.5) {
    return 'right'
  }

  return null
}

const getHorizontalAnchorInwardSide = (
  points: LayoutPoint[],
  leg: RouteLeg,
  direction: 'from' | 'to'
): 'left' | 'right' | null => {
  if (!isHorizontalDiagramSide(leg.side)) {
    return null
  }

  const pointIndex = direction === 'from'
    ? points.findIndex(point => pointsMatch(point, leg.anchor))
    : points.findLastIndex(point => pointsMatch(point, leg.anchor))

  if (pointIndex < 0) {
    return null
  }

  const adjacentPoint = direction === 'from' ? points[pointIndex + 1] : points[pointIndex - 1]

  if (!adjacentPoint || Math.abs(adjacentPoint.y - leg.anchor.y) >= 0.5) {
    return null
  }

  if (leg.side === 'left' && adjacentPoint.x > leg.anchor.x + 0.5) {
    return 'right'
  }

  if (leg.side === 'right' && adjacentPoint.x < leg.anchor.x - 0.5) {
    return 'left'
  }

  return null
}

const countPathBends = (points: LayoutPoint[]) => {
  let bends = 0

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]
    const point = points[index]
    const next = points[index + 1]

    if (!previous || !point || !next) {
      continue
    }

    const entersHorizontally = Math.abs(previous.y - point.y) < 0.5 && Math.abs(previous.x - point.x) > 0.5
    const exitsHorizontally = Math.abs(next.y - point.y) < 0.5 && Math.abs(next.x - point.x) > 0.5
    const entersVertically = Math.abs(previous.x - point.x) < 0.5 && Math.abs(previous.y - point.y) > 0.5
    const exitsVertically = Math.abs(next.x - point.x) < 0.5 && Math.abs(next.y - point.y) > 0.5

    if ((entersHorizontally && exitsVertically) || (entersVertically && exitsHorizontally)) {
      bends += 1
    }
  }

  return bends
}

const getPathLength = (points: LayoutPoint[]) => {
  return points.slice(1).reduce((total, point, index) => {
    const previous = points[index]

    if (!previous) {
      return total
    }

    return total + Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y)
  }, 0)
}

const getOppositeHorizontalSide = (side: AnchorSide) => {
  if (side === 'left') {
    return 'right'
  }

  if (side === 'right') {
    return 'left'
  }

  return null
}

const isFieldEndpointGeometry = (geometry: WorkerConnectionGeometry) => {
  return geometry.isColumnLabelAnchor || geometry.isColumnAnchor
}

const getHorizontalGroupLaneSide = (
  fromBounds: WorkerMeasuredBounds,
  toBounds: WorkerMeasuredBounds,
  groupBounds: WorkerMeasuredBounds
): 'left' | 'right' => {
  const sourceCenterX = fromBounds.left + fromBounds.width / 2
  const targetCenterX = toBounds.left + toBounds.width / 2
  const leftScore = (sourceCenterX - groupBounds.left) + (targetCenterX - groupBounds.left)
  const rightScore = (groupBounds.right - sourceCenterX) + (groupBounds.right - targetCenterX)

  return leftScore <= rightScore ? 'left' : 'right'
}

const projectLegToSharedLane = (leg: RouteLeg, laneSide: AnchorSide, lanePoint: LayoutPoint): RouteLeg => {
  if (leg.grouped) {
    return leg
  }

  const outer = isHorizontalDiagramSide(laneSide)
    ? { x: lanePoint.x, y: leg.exit.y }
    : { x: leg.exit.x, y: lanePoint.y }

  return {
    ...leg,
    outer,
    outerSide: laneSide
  }
}

const buildRawPathPointsFromLegs = (fromLeg: RouteLeg, toLeg: RouteLeg) => {
  const laneLeg = fromLeg.grouped !== toLeg.grouped ? (fromLeg.grouped ? fromLeg : toLeg) : null
  const nextFromLeg = laneLeg ? projectLegToSharedLane(fromLeg, laneLeg.side, laneLeg.outer) : fromLeg
  const nextToLeg = laneLeg ? projectLegToSharedLane(toLeg, laneLeg.side, laneLeg.outer) : toLeg
  const middlePoints = buildOrthogonalMiddlePoints(
    nextFromLeg.outer,
    nextFromLeg.outerSide,
    nextToLeg.outer,
    nextToLeg.outerSide
  )

  return [
    { x: nextFromLeg.anchor.x, y: nextFromLeg.anchor.y },
    nextFromLeg.exit,
    nextFromLeg.outer,
    ...middlePoints,
    nextToLeg.outer,
    nextToLeg.exit,
    { x: nextToLeg.anchor.x, y: nextToLeg.anchor.y }
  ]
}

const buildPathPointsFromLegs = (
  fromLeg: RouteLeg,
  toLeg: RouteLeg,
  verticalUsage: VerticalSegmentUsage,
  headerBands: DiagramRect[]
) => {
  const points: LayoutPoint[] = []
  const rawPoints = buildRawPathPointsFromLegs(fromLeg, toLeg)

  rawPoints.forEach((point) => {
    appendRoutePoint(points, point)
  })

  return offsetOverlappingVerticalSegments(points, verticalUsage, headerBands)
}

const buildConnectionLines = (input: WorkerRouteRequest) => {
  const geometryMaps = input.descriptors.reduce<{
    nodeById: Map<string, WorkerConnectionGeometry>
    rowByKey: Map<string, WorkerConnectionGeometry>
    tableById: Map<string, WorkerConnectionGeometry>
  }>((maps, descriptor) => {
    for (const geometry of [descriptor.fromGeometry, descriptor.toGeometry]) {
      if (geometry.nodeAnchorId) {
        maps.nodeById.set(geometry.nodeAnchorId, geometry)
      }

      if (geometry.rowKey) {
        maps.rowByKey.set(geometry.rowKey, geometry)
      }

      if (geometry.tableId && geometry.locator?.attribute === 'data-table-anchor') {
        maps.tableById.set(geometry.tableId, geometry)
      }
    }

    return maps
  }, {
    nodeById: new Map<string, WorkerConnectionGeometry>(),
    rowByKey: new Map<string, WorkerConnectionGeometry>(),
    tableById: new Map<string, WorkerConnectionGeometry>()
  })

  const buildPathBetween = (
    fromGeometry: WorkerConnectionGeometry,
    toGeometry: WorkerConnectionGeometry,
    color: string,
    dashed: boolean,
    usage: Map<string, number[]>,
    verticalUsage: VerticalSegmentUsage,
    headerBands: DiagramRect[]
  ) => {
    const sharedGroupGeometry = !dashed && fromGeometry.groupNodeId && fromGeometry.groupNodeId === toGeometry.groupNodeId
      ? geometryMaps.nodeById.get(fromGeometry.groupNodeId) || null
      : null

    if (sharedGroupGeometry) {
      const reservations: UsageReservation[] = []
      const fromBounds = fromGeometry.bounds
      const toBounds = toGeometry.bounds
      const groupBounds = sharedGroupGeometry.bounds
      const sourceCenterX = fromBounds.left + fromBounds.width / 2
      const sourceCenterY = fromBounds.top + fromBounds.height / 2
      const targetCenterX = toBounds.left + toBounds.width / 2
      const targetCenterY = toBounds.top + toBounds.height / 2
      const laneSide = isFieldEndpointGeometry(fromGeometry) || isFieldEndpointGeometry(toGeometry)
        ? getHorizontalGroupLaneSide(fromBounds, toBounds, groupBounds)
        : getHeaderSafeGroupLaneSide(
            { x: sourceCenterX, y: sourceCenterY },
            { x: targetCenterX, y: targetCenterY },
            {
              left: groupBounds.left,
              right: groupBounds.right,
              top: groupBounds.top,
              bottom: groupBounds.bottom
            }
          )
      const fromTableGeometry = isFieldEndpointGeometry(fromGeometry) && fromGeometry.tableId
        ? geometryMaps.tableById.get(fromGeometry.tableId) || null
        : null
      const toTableGeometry = isFieldEndpointGeometry(toGeometry) && toGeometry.tableId
        ? geometryMaps.tableById.get(toGeometry.tableId) || null
        : null
      const fromAnchorHost = fromTableGeometry || fromGeometry
      const toAnchorHost = toTableGeometry || toGeometry
      const fromAnchorBounds = fromAnchorHost.bounds
      const toAnchorBounds = toAnchorHost.bounds
      const fromRatio = fromTableGeometry
        ? clamp(
            ((fromBounds.top + fromBounds.height / 2) - fromAnchorBounds.top) / Math.max(fromAnchorBounds.height, 1),
            0.16,
            0.84
          )
        : getDesiredAnchorRatio(laneSide, fromAnchorBounds, targetCenterX, targetCenterY)
      const toRatio = toTableGeometry
        ? clamp(
            ((toBounds.top + toBounds.height / 2) - toAnchorBounds.top) / Math.max(toAnchorBounds.height, 1),
            0.16,
            0.84
          )
        : getDesiredAnchorRatio(laneSide, toAnchorBounds, sourceCenterX, sourceCenterY)
      const fromAnchor = fromTableGeometry
        ? isHorizontalDiagramSide(laneSide)
          ? reserveFieldRowAnchorPoint(
              fromGeometry,
              fromTableGeometry,
              laneSide,
              targetCenterY,
              input.planeBounds,
              input.scale,
              usage,
              reservations,
              geometryMaps.rowByKey
            )
          : getExactAnchorPoint(fromAnchorHost.bounds, laneSide, fromRatio, input.planeBounds, input.scale)
        : reserveAnchorPoint(fromAnchorHost, laneSide, fromRatio, input.planeBounds, input.scale, usage, reservations)
      const toAnchor = toTableGeometry
        ? isHorizontalDiagramSide(laneSide)
          ? reserveFieldRowAnchorPoint(
              toGeometry,
              toTableGeometry,
              laneSide,
              sourceCenterY,
              input.planeBounds,
              input.scale,
              usage,
              reservations,
              geometryMaps.rowByKey
            )
          : getExactAnchorPoint(toAnchorHost.bounds, laneSide, toRatio, input.planeBounds, input.scale)
        : reserveAnchorPoint(toAnchorHost, laneSide, toRatio, input.planeBounds, input.scale, usage, reservations)
      const laneKey = `group-lane:${sharedGroupGeometry.nodeAnchorId}:${laneSide}`
      const laneOffset = reserveLaneOffset(laneKey, usage, groupLaneInnerBaseOffset, groupLaneInnerGap)

      reservations.push({ key: laneKey, slot: 0, count: 1 })
      const points: LayoutPoint[] = []
      const groupLeft = (groupBounds.left - input.planeBounds.left) / input.scale
      const groupRight = (groupBounds.right - input.planeBounds.left) / input.scale
      const groupBottom = (groupBounds.bottom - input.planeBounds.top) / input.scale

      appendRoutePoint(points, { x: fromAnchor.x, y: fromAnchor.y })

      if (laneSide === 'left' || laneSide === 'right') {
        const preferredLaneX = laneSide === 'left'
          ? Math.min(fromAnchor.x, toAnchor.x) - laneOffset
          : Math.max(fromAnchor.x, toAnchor.x) + laneOffset
        const laneX = laneSide === 'left'
          ? Math.max(groupLeft + groupLaneInnerBorderClearance, preferredLaneX)
          : Math.min(groupRight - groupLaneInnerBorderClearance, preferredLaneX)

        appendRoutePoint(points, { x: laneX, y: fromAnchor.y })
        appendRoutePoint(points, { x: laneX, y: toAnchor.y })
        appendRoutePoint(points, { x: toAnchor.x, y: toAnchor.y })
      } else {
        const laneY = Math.min(groupBottom - groupLaneInnerBorderClearance, Math.max(fromAnchor.y, toAnchor.y) + laneOffset)

        appendRoutePoint(points, { x: fromAnchor.x, y: laneY })
        appendRoutePoint(points, { x: toAnchor.x, y: laneY })
        appendRoutePoint(points, { x: toAnchor.x, y: toAnchor.y })
      }

      const adjustedPoints = offsetOverlappingVerticalSegments(points, verticalUsage, headerBands)

      return {
        path: buildPathFromPoints(adjustedPoints),
        points: adjustedPoints,
        usageReservations: reservations
      }
    }

    const defaultSides = (() => {
      const fromBounds = fromGeometry.bounds
      const toBounds = toGeometry.bounds
      const fromCenterX = fromBounds.left + fromBounds.width / 2
      const fromCenterY = fromBounds.top + fromBounds.height / 2
      const toCenterX = toBounds.left + toBounds.width / 2
      const toCenterY = toBounds.top + toBounds.height / 2
      const deltaX = toCenterX - fromCenterX
      const deltaY = toCenterY - fromCenterY

      if (Math.abs(deltaX) >= Math.abs(deltaY) * 0.75) {
        return deltaX >= 0 ? { from: 'right', to: 'left' } : { from: 'left', to: 'right' }
      }

      return deltaY >= 0 ? { from: 'bottom', to: 'top' } : { from: 'top', to: 'bottom' }
    })()

    const buildCandidate = (forcedSides: Partial<{ from: AnchorSide, to: AnchorSide }> = {}) => {
      const localUsage = cloneUsageMap(usage)
      const localVerticalUsage = cloneVerticalSegmentUsage(verticalUsage)
      const reservations: UsageReservation[] = []
      const reserveLeg = (
        geometry: WorkerConnectionGeometry,
        otherGeometry: WorkerConnectionGeometry,
        fallbackSide: AnchorSide,
        forcedSide: AnchorSide | null
      ) => {
        const elementBounds = geometry.bounds
        const otherBounds = otherGeometry.bounds
        const targetCenterX = otherBounds.left + otherBounds.width / 2
        const targetCenterY = otherBounds.top + otherBounds.height / 2
        const tableGeometry = isFieldEndpointGeometry(geometry) && geometry.tableId
          ? geometryMaps.tableById.get(geometry.tableId) || null
          : null
        const anchorHost = tableGeometry || geometry
        const anchorBounds = anchorHost.bounds
        const groupGeometry = anchorHost.groupNodeId ? geometryMaps.nodeById.get(anchorHost.groupNodeId) || null : null
        const groupBounds = groupGeometry?.bounds
        let side: AnchorSide = forcedSide || fallbackSide

        if (tableGeometry && !forcedSide) {
          side = targetCenterX >= anchorBounds.left + anchorBounds.width / 2 ? 'right' : 'left'
        } else if (groupBounds && !forcedSide) {
          side = getHeaderSafeGroupLaneSide(
            {
              x: anchorBounds.left + anchorBounds.width / 2,
              y: anchorBounds.top + anchorBounds.height / 2
            },
            {
              x: targetCenterX,
              y: targetCenterY
            },
            {
              left: groupBounds.left,
              right: groupBounds.right,
              top: groupBounds.top,
              bottom: groupBounds.bottom
            }
          )
        }

        const ratio = tableGeometry
          ? clamp(
              ((elementBounds.top + elementBounds.height / 2) - anchorBounds.top) / Math.max(anchorBounds.height, 1),
              0.16,
              0.84
            )
          : getDesiredAnchorRatio(side, anchorBounds, targetCenterX, targetCenterY)

        return {
          anchor: tableGeometry && isHorizontalDiagramSide(side)
            ? reserveFieldRowAnchorPoint(
                geometry,
                tableGeometry,
                side,
                targetCenterY,
                input.planeBounds,
                input.scale,
                localUsage,
                reservations,
                geometryMaps.rowByKey
              )
            : tableGeometry
              ? getExactAnchorPoint(anchorHost.bounds, side, ratio, input.planeBounds, input.scale)
              : reserveAnchorPoint(anchorHost, side, ratio, input.planeBounds, input.scale, localUsage, reservations),
          side,
          groupGeometry,
          hostCenterX: ((anchorBounds.left - input.planeBounds.left) / input.scale) + (anchorBounds.width / (2 * input.scale))
        }
      }

      const fromPendingLeg = reserveLeg(fromGeometry, toGeometry, forcedSides.from || defaultSides.from, forcedSides.from || null)
      const toPendingLeg = reserveLeg(toGeometry, fromGeometry, forcedSides.to || defaultSides.to, forcedSides.to || null)
      const routeOffset = getRouteOffset(fromPendingLeg.anchor, toPendingLeg.anchor)
      const finalizeLeg = (pendingLeg: typeof fromPendingLeg): RouteLeg => {
        const exit = moveAnchorPoint(pendingLeg.anchor, routeOffset)

        if (!pendingLeg.groupGeometry) {
          return {
            anchor: pendingLeg.anchor,
            exit,
            outer: exit,
            side: pendingLeg.side,
            outerSide: pendingLeg.side,
            grouped: false,
            hostCenterX: pendingLeg.hostCenterX
          }
        }

        const groupBounds = pendingLeg.groupGeometry.bounds
        const laneKey = `group-lane:${pendingLeg.groupGeometry.nodeAnchorId}:${pendingLeg.side}`
        const laneOffset = reserveLaneOffset(laneKey, localUsage, groupLaneOuterBaseOffset, groupLaneOuterGap)

        reservations.push({ key: laneKey, slot: 0, count: 1 })
        const groupLeft = (groupBounds.left - input.planeBounds.left) / input.scale
        const groupRight = (groupBounds.right - input.planeBounds.left) / input.scale
        const groupBottom = (groupBounds.bottom - input.planeBounds.top) / input.scale
        const outer = pendingLeg.side === 'left'
          ? { x: groupLeft - laneOffset, y: exit.y }
          : pendingLeg.side === 'right'
            ? { x: groupRight + laneOffset, y: exit.y }
            : { x: exit.x, y: groupBottom + laneOffset }

        return {
          anchor: pendingLeg.anchor,
          exit,
          outer,
          side: pendingLeg.side,
          outerSide: pendingLeg.side,
          grouped: true,
          hostCenterX: pendingLeg.hostCenterX
        }
      }

      const fromLeg = finalizeLeg(fromPendingLeg)
      const toLeg = finalizeLeg(toPendingLeg)
      const points = buildPathPointsFromLegs(fromLeg, toLeg, localVerticalUsage, headerBands)

      return {
        localUsage,
        localVerticalUsage,
        fromLeg,
        toLeg,
        points,
        reservations,
        forcedSides
      }
    }

    const describeCandidate = (candidate: ReturnType<typeof buildCandidate>) => {
      const fromInwardSide = getHorizontalAnchorInwardSide(candidate.points, candidate.fromLeg, 'from')
      const toInwardSide = getHorizontalAnchorInwardSide(candidate.points, candidate.toLeg, 'to')
      const fromBacktrackSide = getHorizontalSideBacktrack(candidate.points, candidate.fromLeg, 'from')
      const toBacktrackSide = getHorizontalSideBacktrack(candidate.points, candidate.toLeg, 'to')

      return {
        candidate,
        inwardCount: Number(Boolean(fromInwardSide)) + Number(Boolean(toInwardSide)),
        backtrackCount: Number(Boolean(fromBacktrackSide)) + Number(Boolean(toBacktrackSide)),
        bendCount: countPathBends(candidate.points),
        pathLength: getPathLength(candidate.points),
        forcedCount: Number(Boolean(candidate.forcedSides.from)) + Number(Boolean(candidate.forcedSides.to))
      }
    }

    const initialCandidate = buildCandidate()
    const candidates = [initialCandidate]
    const forcedFromSide = getOppositeHorizontalSide(initialCandidate.fromLeg.side)
    const forcedToSide = getOppositeHorizontalSide(initialCandidate.toLeg.side)
    const seenCandidateKeys = new Set<string>(['default'])

    for (const fromSide of [null, forcedFromSide] as Array<'left' | 'right' | null>) {
      for (const toSide of [null, forcedToSide] as Array<'left' | 'right' | null>) {
        if (!fromSide && !toSide) {
          continue
        }

        const key = `${fromSide || 'default'}:${toSide || 'default'}`

        if (seenCandidateKeys.has(key)) {
          continue
        }

        seenCandidateKeys.add(key)
        candidates.push(buildCandidate({
          ...(fromSide ? { from: fromSide } : {}),
          ...(toSide ? { to: toSide } : {})
        }))
      }
    }

    const scoredCandidates = candidates.map(describeCandidate)
    const chosenCandidate = scoredCandidates.sort((left, right) => {
      if (left.inwardCount !== right.inwardCount) {
        return left.inwardCount - right.inwardCount
      }

      if (left.backtrackCount !== right.backtrackCount) {
        return left.backtrackCount - right.backtrackCount
      }

      if (left.bendCount !== right.bendCount) {
        return left.bendCount - right.bendCount
      }

      if (Math.abs(left.pathLength - right.pathLength) > 0.5) {
        return left.pathLength - right.pathLength
      }

      return left.forcedCount - right.forcedCount
    })[0]?.candidate || initialCandidate

    replaceUsageMap(usage, chosenCandidate.localUsage)
    replaceUsageMap(verticalUsage, chosenCandidate.localVerticalUsage)

    return {
      path: buildPathFromPoints(chosenCandidate.points),
      points: chosenCandidate.points,
      usageReservations: chosenCandidate.reservations
    }
  }

  const usage = new Map<string, number[]>()
  const verticalUsage: VerticalSegmentUsage = new Map()

  return input.descriptors.map((descriptor) => {
    const result = buildPathBetween(
      descriptor.fromGeometry,
      descriptor.toGeometry,
      descriptor.color,
      descriptor.dashed,
      usage,
      verticalUsage,
      input.groupHeaderBands
    )
    const fromOwnerNodeId = descriptor.fromGeometry.ownerNodeId
    const toOwnerNodeId = descriptor.toGeometry.ownerNodeId

    return {
      key: descriptor.key,
      path: result.path,
      points: result.points,
      bounds: getConnectionLineBounds(result.points),
      color: descriptor.color,
      dashed: descriptor.dashed,
      dashPattern: descriptor.dashPattern,
      animated: descriptor.animated,
      fromOwnerNodeId,
      toOwnerNodeId,
      fromEndpoint: descriptor.fromGeometry.locator,
      toEndpoint: descriptor.toGeometry.locator,
      usageReservations: result.usageReservations,
      zIndex: getDiagramConnectionZIndex(
        input.nodeOrders[fromOwnerNodeId || ''] || 1,
        input.nodeOrders[toOwnerNodeId || ''] || 1,
        descriptor.selectedForeground
      )
    } satisfies WorkerConnectionLine
  })
}

self.onmessage = (event: MessageEvent<WorkerRouteRequest>) => {
  const input = event.data
  const response: WorkerRouteResponse = {
    requestId: input.requestId,
    lines: buildConnectionLines(input)
  }

  self.postMessage(response)
}
