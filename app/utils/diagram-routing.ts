export type DiagramAnchorSide = 'left' | 'right' | 'top' | 'bottom'

export type DiagramPoint = {
  x: number
  y: number
}

export type DiagramRect = {
  left: number
  right: number
  top: number
  bottom: number
}

const pointTolerance = 0.01

export const isHorizontalDiagramSide = (side: DiagramAnchorSide) => side === 'left' || side === 'right'

export const buildOrthogonalMiddlePoints = (
  fromPoint: DiagramPoint,
  fromSide: DiagramAnchorSide,
  toPoint: DiagramPoint,
  toSide: DiagramAnchorSide
) => {
  if (
    Math.abs(fromPoint.x - toPoint.x) <= pointTolerance
    || Math.abs(fromPoint.y - toPoint.y) <= pointTolerance
  ) {
    return []
  }

  if (isHorizontalDiagramSide(fromSide) && isHorizontalDiagramSide(toSide)) {
    const midX = fromSide === toSide
      ? (fromSide === 'right'
          ? Math.max(fromPoint.x, toPoint.x) + 28
          : Math.min(fromPoint.x, toPoint.x) - 28)
      : (fromPoint.x + toPoint.x) / 2

    return [
      { x: midX, y: fromPoint.y },
      { x: midX, y: toPoint.y }
    ]
  }

  if (!isHorizontalDiagramSide(fromSide) && !isHorizontalDiagramSide(toSide)) {
    const midY = fromSide === toSide
      ? (fromSide === 'bottom'
          ? Math.max(fromPoint.y, toPoint.y) + 28
          : Math.min(fromPoint.y, toPoint.y) - 28)
      : (fromPoint.y + toPoint.y) / 2

    return [
      { x: fromPoint.x, y: midY },
      { x: toPoint.x, y: midY }
    ]
  }

  if (isHorizontalDiagramSide(fromSide) && !isHorizontalDiagramSide(toSide)) {
    return [{
      x: toPoint.x,
      y: fromPoint.y
    }]
  }

  return [{
    x: fromPoint.x,
    y: toPoint.y
  }]
}

export const getHeaderSafeGroupLaneSide = (
  sourceCenter: DiagramPoint,
  targetCenter: DiagramPoint,
  groupBounds: DiagramRect
): DiagramAnchorSide => {
  const sideScores: Array<{ side: DiagramAnchorSide, score: number }> = [
    {
      side: 'left',
      score: (sourceCenter.x - groupBounds.left) + (targetCenter.x - groupBounds.left)
    },
    {
      side: 'right',
      score: (groupBounds.right - sourceCenter.x) + (groupBounds.right - targetCenter.x)
    },
    {
      side: 'bottom',
      score: (groupBounds.bottom - sourceCenter.y) + (groupBounds.bottom - targetCenter.y)
    }
  ]

  return sideScores.sort((left, right) => left.score - right.score)[0]?.side || 'right'
}
