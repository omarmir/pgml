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
const fieldRowAnchorOffsets = [0.22, 0.5, 0.78] as const

export const isHorizontalDiagramSide = (side: DiagramAnchorSide) => side === 'left' || side === 'right'

/**
 * Connection anchor rules for table rows:
 * 1. Field endpoints always terminate on the owning table border, never inside the row body.
 * 2. Each row exposes six candidate border anchors: left/right multiplied by top/middle/bottom.
 * 3. Higher-level routing still decides the side first; this helper only picks among anchors on that side.
 * 4. Unused anchors on the row are preferred before reusing an occupied anchor on the same side.
 * 5. Ties are broken by closeness to the desired target ratio so routes stay visually local.
 * 6. If a caller cannot resolve row metadata, it should fall back to table-level anchors without bypassing
 *    header-avoidance or orthogonal path rules elsewhere in the router.
 */
export const getFieldRowAnchorRatios = (
  rowTop: number,
  rowHeight: number,
  tableTop: number,
  tableHeight: number
) => {
  const safeTableHeight = Math.max(tableHeight, pointTolerance)
  const safeRowHeight = Math.max(rowHeight, pointTolerance)

  return fieldRowAnchorOffsets.map((offset) => {
    return Math.max(0, Math.min(1, (rowTop - tableTop + safeRowHeight * offset) / safeTableHeight))
  })
}

export const pickDiagramAnchorSlot = (
  candidateRatios: number[],
  desiredRatio: number,
  slotUsage: number[]
) => {
  let bestSlot = 0
  let bestScore = Number.POSITIVE_INFINITY

  for (let slot = 0; slot < candidateRatios.length; slot += 1) {
    const candidateRatio = candidateRatios[slot] ?? 0.5
    const usage = slotUsage[slot] || 0
    const score = Math.abs(candidateRatio - desiredRatio) + usage * 0.35

    if (score < bestScore) {
      bestScore = score
      bestSlot = slot
    }
  }

  return bestSlot
}

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
    if (fromSide === toSide) {
      const midX = fromSide === 'right'
        ? Math.max(fromPoint.x, toPoint.x) + 28
        : Math.min(fromPoint.x, toPoint.x) - 28

      return [
        { x: midX, y: fromPoint.y },
        { x: midX, y: toPoint.y }
      ]
    }

    const midX = (fromPoint.x + toPoint.x) / 2

    return [
      { x: midX, y: fromPoint.y },
      { x: midX, y: toPoint.y }
    ]
  }

  if (!isHorizontalDiagramSide(fromSide) && !isHorizontalDiagramSide(toSide)) {
    if (fromSide === toSide) {
      const midY = fromSide === 'bottom'
        ? Math.max(fromPoint.y, toPoint.y) + 28
        : Math.min(fromPoint.y, toPoint.y) - 28

      return [
        { x: fromPoint.x, y: midY },
        { x: toPoint.x, y: midY }
      ]
    }

    const midY = (fromPoint.y + toPoint.y) / 2

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
