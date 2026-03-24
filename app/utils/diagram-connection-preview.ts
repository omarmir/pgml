export type DiagramConnectionPreviewDragState = {
  nodeId: string
  deltaX: number
  deltaY: number
}

export type DiagramConnectionPreviewPoint = {
  x: number
  y: number
}

type DiagramConnectionPreviewLine = {
  zIndex: number
  fromOwnerNodeId: string | null
  toOwnerNodeId: string | null
}

export type DiagramConnectionPreviewLayer<T extends DiagramConnectionPreviewLine> = {
  zIndex: number
  staticLines: T[]
  bridgedLines: T[]
  translatedLines: T[]
}

const getOrCreateConnectionPreviewLayer = <T extends DiagramConnectionPreviewLine>(
  layersByZIndex: Map<number, DiagramConnectionPreviewLayer<T>>,
  zIndex: number
) => {
  const existingLayer = layersByZIndex.get(zIndex)

  if (existingLayer) {
    return existingLayer
  }

  const nextLayer: DiagramConnectionPreviewLayer<T> = {
    zIndex,
    staticLines: [],
    bridgedLines: [],
    translatedLines: []
  }

  layersByZIndex.set(zIndex, nextLayer)

  return nextLayer
}

const pointsMatch = (left: DiagramConnectionPreviewPoint, right: DiagramConnectionPreviewPoint) => {
  return Math.abs(left.x - right.x) < 0.5 && Math.abs(left.y - right.y) < 0.5
}

const getSharedAxis = (
  left: DiagramConnectionPreviewPoint,
  right: DiagramConnectionPreviewPoint
): 'x' | 'y' | null => {
  if (Math.abs(left.x - right.x) < 0.5) {
    return 'x'
  }

  if (Math.abs(left.y - right.y) < 0.5) {
    return 'y'
  }

  return null
}

const appendRoutePoint = (
  points: DiagramConnectionPreviewPoint[],
  point: DiagramConnectionPreviewPoint
) => {
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

const buildPathFromPoints = (points: DiagramConnectionPreviewPoint[]) => {
  return points.map((point, index) => {
    return `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
  }).join(' ')
}

const buildDraggedEndpointBridgePoint = (
  originalPoint: DiagramConnectionPreviewPoint,
  movedPoint: DiagramConnectionPreviewPoint,
  fixedPoint: DiagramConnectionPreviewPoint
) => {
  const segmentAxis = getSharedAxis(originalPoint, fixedPoint)

  if (segmentAxis === 'x') {
    return {
      x: movedPoint.x,
      y: fixedPoint.y
    }
  }

  if (segmentAxis === 'y') {
    return {
      x: fixedPoint.x,
      y: movedPoint.y
    }
  }

  return Math.abs(movedPoint.x - fixedPoint.x) >= Math.abs(movedPoint.y - fixedPoint.y)
    ? {
        x: fixedPoint.x,
        y: movedPoint.y
      }
    : {
        x: movedPoint.x,
        y: fixedPoint.y
      }
}

export const buildDiagramConnectionDragPreviewPath = (
  points: DiagramConnectionPreviewPoint[],
  deltaX: number,
  deltaY: number,
  movedEnd: 'from' | 'to'
) => {
  const firstPoint = points[0]

  if (!firstPoint || (deltaX === 0 && deltaY === 0)) {
    return buildPathFromPoints(points)
  }

  if (points.length === 1) {
    return buildPathFromPoints([{
      x: firstPoint.x + deltaX,
      y: firstPoint.y + deltaY
    }])
  }

  const previewPoints: DiagramConnectionPreviewPoint[] = []

  if (movedEnd === 'from') {
    const secondPoint = points[1]

    if (!secondPoint) {
      return buildPathFromPoints([{
        x: firstPoint.x + deltaX,
        y: firstPoint.y + deltaY
      }])
    }

    const movedPoint = {
      x: firstPoint.x + deltaX,
      y: firstPoint.y + deltaY
    }
    const bridgePoint = buildDraggedEndpointBridgePoint(firstPoint, movedPoint, secondPoint)

    appendRoutePoint(previewPoints, movedPoint)
    appendRoutePoint(previewPoints, bridgePoint)
    points.slice(1).forEach((point) => {
      appendRoutePoint(previewPoints, point)
    })

    return buildPathFromPoints(previewPoints)
  }

  const movedPoint = {
    x: points.at(-1)!.x + deltaX,
    y: points.at(-1)!.y + deltaY
  }
  const lastFixedPoint = points.at(-2)!
  const bridgePoint = buildDraggedEndpointBridgePoint(points.at(-1)!, movedPoint, lastFixedPoint)

  points.slice(0, -1).forEach((point) => {
    appendRoutePoint(previewPoints, point)
  })
  appendRoutePoint(previewPoints, bridgePoint)
  appendRoutePoint(previewPoints, movedPoint)

  return buildPathFromPoints(previewPoints)
}

export const buildDiagramConnectionPreviewLayers = <T extends DiagramConnectionPreviewLine>(
  lines: T[],
  activeDrag: DiagramConnectionPreviewDragState | null
) => {
  const layersByZIndex = new Map<number, DiagramConnectionPreviewLayer<T>>()
  const hasActiveDrag = Boolean(activeDrag && (activeDrag.deltaX !== 0 || activeDrag.deltaY !== 0))
  const draggedNodeId = hasActiveDrag ? activeDrag?.nodeId || null : null

  lines.forEach((line) => {
    const layer = getOrCreateConnectionPreviewLayer(layersByZIndex, line.zIndex)

    if (!draggedNodeId) {
      layer.staticLines.push(line)
      return
    }

    const fromDraggedNode = line.fromOwnerNodeId === draggedNodeId
    const toDraggedNode = line.toOwnerNodeId === draggedNodeId

    if (fromDraggedNode && toDraggedNode) {
      layer.translatedLines.push(line)
      return
    }

    if (fromDraggedNode || toDraggedNode) {
      layer.bridgedLines.push(line)
      return
    }

    layer.staticLines.push(line)
  })

  return Array.from(layersByZIndex.values())
    .filter(layer => layer.staticLines.length > 0 || layer.bridgedLines.length > 0 || layer.translatedLines.length > 0)
    .sort((left, right) => left.zIndex - right.zIndex)
}
