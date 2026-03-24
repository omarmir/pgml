export type DiagramConnectionPreviewDragState = {
  nodeId: string
  deltaX: number
  deltaY: number
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
