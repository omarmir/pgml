<script setup lang="ts">
import type {
  PgmlCustomType,
  PgmlRoutine,
  PgmlSchemaModel,
  PgmlSequence
} from '~/utils/pgml'

const { model } = defineProps<{
  model: PgmlSchemaModel
}>()

type CanvasNodeKind = 'group' | 'object'
type ObjectKind = 'Index' | 'Constraint' | 'Function' | 'Procedure' | 'Trigger' | 'Sequence' | 'Custom Type'
type ImpactTarget = {
  tableId: string
  columnName: string | null
}

type CanvasNodeState = {
  id: string
  kind: CanvasNodeKind
  objectKind?: ObjectKind
  title: string
  subtitle: string
  details: string[]
  x: number
  y: number
  width: number
  height: number
  color: string
  tableIds: string[]
  impactTargets?: ImpactTarget[]
  tableCount?: number
  columnCount?: number
  note?: string | null
  minWidth?: number
  minHeight?: number
}

type ConnectionLine = {
  key: string
  path: string
  color: string
  dashed: boolean
}

type LayoutRect = {
  id: string
  x: number
  y: number
  width: number
  height: number
}

type LayoutPoint = {
  x: number
  y: number
}

type LayoutConnection = {
  fromId: string
  toId: string
  from: LayoutPoint
  to: LayoutPoint
}

type PlacementMetrics = {
  overlapCount: number
  overlapArea: number
  relationDistance: number
  midpointDistance: number
  crossingCount: number
  lineHitCount: number
  originDistance: number
}

type AnchorSide = 'left' | 'right' | 'top' | 'bottom'

type AnchorPoint = {
  x: number
  y: number
  side: AnchorSide
  slot: number
  count: number
}

const planeRef: Ref<HTMLDivElement | null> = ref(null)
const viewportRef: Ref<HTMLDivElement | null> = ref(null)
const scale: Ref<number> = ref(0.62)
const pan: Ref<{ x: number, y: number }> = ref({
  x: 30,
  y: 36
})
const selectedNodeId: Ref<string | null> = ref(null)
const nodeStates: Ref<Record<string, CanvasNodeState>> = ref({})
const connectionLines: Ref<ConnectionLine[]> = ref([])
let resizeObserver: ResizeObserver | null = null

const palette = ['#8b5cf6', '#f59e0b', '#06b6d4', '#10b981', '#ef4444', '#ec4899', '#f97316']
const groupTableWidth = 232
const groupTableGap = 16
const groupHorizontalPadding = 20
const groupHeaderHeight = 56
const groupVerticalPadding = 18
const groupNoteHeight = 28
const groupColumnRowHeight = 31
const objectColumnX = 1060
const objectColumnGapX = 320
const objectRowGapY = 180
const layoutPadding = 88

const canvasNodes = computed(() => Object.values(nodeStates.value))
const selectedNode = computed(() => {
  if (!selectedNodeId.value) {
    return null
  }

  return nodeStates.value[selectedNodeId.value] || null
})
const tablesByGroup = computed(() => {
  const groups: Record<string, PgmlSchemaModel['tables']> = {}

  for (const table of model.tables) {
    const groupName = table.groupName || 'Ungrouped'

    if (!groups[groupName]) {
      groups[groupName] = []
    }

    groups[groupName]?.push(table)
  }

  return groups
})
const tableGroupById = computed(() => {
  const groups: Record<string, string> = {}

  for (const table of model.tables) {
    groups[table.fullName] = table.groupName || 'Ungrouped'
  }

  return groups
})

const estimateTableHeight = (columnCount: number) => {
  return 40 + columnCount * groupColumnRowHeight
}

const getGroupMinimumSize = (groupName: string, columnCount: number, note?: string | null) => {
  const tables = tablesByGroup.value[groupName] || []
  const safeColumnCount = Math.max(1, Math.min(columnCount, Math.max(tables.length, 1)))
  const rowHeights: number[] = []

  tables.forEach((table, index) => {
    const rowIndex = Math.floor(index / safeColumnCount)
    const tableHeight = estimateTableHeight(table.columns.length)
    rowHeights[rowIndex] = Math.max(rowHeights[rowIndex] || 0, tableHeight)
  })

  const contentHeight = rowHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, rowHeights.length - 1) * groupTableGap

  return {
    minWidth: groupHorizontalPadding * 2 + safeColumnCount * groupTableWidth + Math.max(0, safeColumnCount - 1) * groupTableGap,
    minHeight: groupHeaderHeight + groupVerticalPadding + contentHeight + (note ? groupNoteHeight : 0)
  }
}

const getCanvasBounds = () => {
  if (!canvasNodes.value.length) {
    return null
  }

  const minX = Math.min(...canvasNodes.value.map(node => node.x))
  const minY = Math.min(...canvasNodes.value.map(node => node.y))
  const maxX = Math.max(...canvasNodes.value.map(node => node.x + node.width))
  const maxY = Math.max(...canvasNodes.value.map(node => node.y + node.height))

  return {
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY
  }
}

const measureGroupMinimumSize = (groupId: string) => {
  if (!planeRef.value) {
    return null
  }

  const groupElement = planeRef.value.querySelector(`[data-node-anchor="${groupId}"]`)
  const headerElement = planeRef.value.querySelector(`[data-node-header="${groupId}"]`)
  const contentElement = planeRef.value.querySelector(`[data-group-content="${groupId}"]`)

  if (
    !(groupElement instanceof HTMLElement)
    || !(headerElement instanceof HTMLElement)
    || !(contentElement instanceof HTMLElement)
  ) {
    return null
  }

  const contentWrapper = contentElement.parentElement
  const wrapperStyles = contentWrapper ? window.getComputedStyle(contentWrapper) : null
  const paddingRight = wrapperStyles ? Number.parseFloat(wrapperStyles.paddingRight) : 0
  const paddingBottom = wrapperStyles ? Number.parseFloat(wrapperStyles.paddingBottom) : 0
  const headerBottom = headerElement.offsetTop + headerElement.offsetHeight
  const contentRight = contentElement.offsetLeft + contentElement.scrollWidth + paddingRight
  const contentBottom = contentElement.offsetTop + contentElement.scrollHeight + paddingBottom

  return {
    minWidth: Math.ceil(Math.max(contentRight, 240)),
    minHeight: Math.ceil(Math.max(headerBottom + paddingBottom, contentBottom))
  }
}

const measureObjectMinimumSize = (node: CanvasNodeState) => {
  if (!planeRef.value) {
    return null
  }

  const objectElement = planeRef.value.querySelector(`[data-node-anchor="${node.id}"]`)
  const headerElement = planeRef.value.querySelector(`[data-node-header="${node.id}"]`)
  const bodyElement = planeRef.value.querySelector(`[data-node-body="${node.id}"]`)

  if (
    !(objectElement instanceof HTMLElement)
    || !(headerElement instanceof HTMLElement)
    || !(bodyElement instanceof HTMLElement)
  ) {
    return null
  }

  const bodyStyles = window.getComputedStyle(bodyElement)
  const paddingBottom = Number.parseFloat(bodyStyles.paddingBottom) || 0
  const contentBottom = bodyElement.offsetTop + bodyElement.scrollHeight + paddingBottom

  return {
    minWidth: Math.ceil(Math.max(node.minWidth || node.width, 220)),
    minHeight: Math.ceil(Math.max(contentBottom, headerElement.offsetHeight + bodyElement.scrollHeight + 18, 96))
  }
}

const measureNodeMinimumSize = (node: CanvasNodeState) => {
  if (node.kind === 'group') {
    return measureGroupMinimumSize(node.id)
  }

  return measureObjectMinimumSize(node)
}

const syncMeasuredNodeSizes = () => {
  let hasChanges = false

  for (const node of canvasNodes.value) {
    const measuredSize = measureNodeMinimumSize(node)

    if (!measuredSize) {
      continue
    }

    const current = nodeStates.value[node.id]

    if (!current) {
      continue
    }

    const nextWidth = Math.max(current.width, measuredSize.minWidth)
    const nextHeight = Math.max(current.height, measuredSize.minHeight)
    const needsUpdate = (
      current.minWidth !== measuredSize.minWidth
      || current.minHeight !== measuredSize.minHeight
      || current.width !== nextWidth
      || current.height !== nextHeight
    )

    if (!needsUpdate) {
      continue
    }

    nodeStates.value[node.id] = {
      ...current,
      minWidth: measuredSize.minWidth,
      minHeight: measuredSize.minHeight,
      width: nextWidth,
      height: nextHeight
    }
    hasChanges = true
  }

  return hasChanges
}

const observeCanvasLayout = () => {
  if (!resizeObserver) {
    return
  }

  const observer = resizeObserver

  observer.disconnect()

  if (viewportRef.value) {
    observer.observe(viewportRef.value)
  }

  if (planeRef.value) {
    observer.observe(planeRef.value)

    planeRef.value.querySelectorAll('[data-node-anchor]').forEach((element) => {
      if (element instanceof HTMLElement) {
        observer.observe(element)
      }
    })
  }
}

const cleanForSearch = (value: string) => value.toLowerCase().replaceAll(/[^\w.]+/g, ' ')
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const uniqueValues = (values: string[]) => Array.from(new Set(values))
const getRectCenter = (rect: LayoutRect): LayoutPoint => ({
  x: rect.x + rect.width / 2,
  y: rect.y + rect.height / 2
})
const getNodeRect = (node: CanvasNodeState): LayoutRect => ({
  id: node.id,
  x: node.x,
  y: node.y,
  width: node.width,
  height: node.height
})
const expandRect = (rect: LayoutRect, padding: number): LayoutRect => ({
  id: rect.id,
  x: rect.x - padding,
  y: rect.y - padding,
  width: rect.width + padding * 2,
  height: rect.height + padding * 2
})
const isPointInsideRect = (point: LayoutPoint, rect: LayoutRect) => {
  return (
    point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height
  )
}
const getOrientation = (pointA: LayoutPoint, pointB: LayoutPoint, pointC: LayoutPoint) => {
  const crossProduct = (pointB.y - pointA.y) * (pointC.x - pointB.x) - (pointB.x - pointA.x) * (pointC.y - pointB.y)

  if (Math.abs(crossProduct) < 0.01) {
    return 0
  }

  return crossProduct > 0 ? 1 : 2
}
const isPointOnSegment = (pointA: LayoutPoint, pointB: LayoutPoint, pointC: LayoutPoint) => {
  return (
    pointB.x <= Math.max(pointA.x, pointC.x)
    && pointB.x >= Math.min(pointA.x, pointC.x)
    && pointB.y <= Math.max(pointA.y, pointC.y)
    && pointB.y >= Math.min(pointA.y, pointC.y)
  )
}
const segmentsIntersect = (
  pointA1: LayoutPoint,
  pointA2: LayoutPoint,
  pointB1: LayoutPoint,
  pointB2: LayoutPoint
) => {
  const orientation1 = getOrientation(pointA1, pointA2, pointB1)
  const orientation2 = getOrientation(pointA1, pointA2, pointB2)
  const orientation3 = getOrientation(pointB1, pointB2, pointA1)
  const orientation4 = getOrientation(pointB1, pointB2, pointA2)

  if (orientation1 !== orientation2 && orientation3 !== orientation4) {
    return true
  }

  if (orientation1 === 0 && isPointOnSegment(pointA1, pointB1, pointA2)) {
    return true
  }

  if (orientation2 === 0 && isPointOnSegment(pointA1, pointB2, pointA2)) {
    return true
  }

  if (orientation3 === 0 && isPointOnSegment(pointB1, pointA1, pointB2)) {
    return true
  }

  if (orientation4 === 0 && isPointOnSegment(pointB1, pointA2, pointB2)) {
    return true
  }

  return false
}
const doesSegmentHitRect = (
  fromPoint: LayoutPoint,
  toPoint: LayoutPoint,
  rect: LayoutRect,
  padding = 0
) => {
  const expandedRect = expandRect(rect, padding)
  const topLeft = { x: expandedRect.x, y: expandedRect.y }
  const topRight = { x: expandedRect.x + expandedRect.width, y: expandedRect.y }
  const bottomLeft = { x: expandedRect.x, y: expandedRect.y + expandedRect.height }
  const bottomRight = { x: expandedRect.x + expandedRect.width, y: expandedRect.y + expandedRect.height }

  if (isPointInsideRect(fromPoint, expandedRect) || isPointInsideRect(toPoint, expandedRect)) {
    return true
  }

  return (
    segmentsIntersect(fromPoint, toPoint, topLeft, topRight)
    || segmentsIntersect(fromPoint, toPoint, topRight, bottomRight)
    || segmentsIntersect(fromPoint, toPoint, bottomRight, bottomLeft)
    || segmentsIntersect(fromPoint, toPoint, bottomLeft, topLeft)
  )
}
const buildConnection = (
  fromRect: LayoutRect,
  toRect: LayoutRect
): LayoutConnection => ({
  fromId: fromRect.id,
  toId: toRect.id,
  from: getRectCenter(fromRect),
  to: getRectCenter(toRect)
})
const countConnectionCrossings = (
  nextConnections: LayoutConnection[],
  existingConnections: LayoutConnection[]
) => {
  let crossingCount = 0

  for (const nextConnection of nextConnections) {
    for (const existingConnection of existingConnections) {
      const sharesEndpoint = (
        nextConnection.fromId === existingConnection.fromId
        || nextConnection.fromId === existingConnection.toId
        || nextConnection.toId === existingConnection.fromId
        || nextConnection.toId === existingConnection.toId
      )

      if (sharesEndpoint) {
        continue
      }

      if (segmentsIntersect(nextConnection.from, nextConnection.to, existingConnection.from, existingConnection.to)) {
        crossingCount += 1
      }
    }
  }

  return crossingCount
}
const countConnectionRectHits = (
  nextConnections: LayoutConnection[],
  rects: LayoutRect[],
  ignoredIds: Set<string>
) => {
  let hitCount = 0

  for (const connection of nextConnections) {
    for (const rect of rects) {
      if (ignoredIds.has(rect.id)) {
        continue
      }

      if (doesSegmentHitRect(connection.from, connection.to, rect, 24)) {
        hitCount += 1
      }
    }
  }

  return hitCount
}
const getOverlapMetrics = (
  nextRect: LayoutRect,
  rects: LayoutRect[],
  getPadding: (rect: LayoutRect) => number
) => {
  let overlapCount = 0
  let overlapArea = 0

  rects.forEach((rect) => {
    const expandedRect = expandRect(rect, getPadding(rect))
    const overlapWidth = Math.min(nextRect.x + nextRect.width, expandedRect.x + expandedRect.width) - Math.max(nextRect.x, expandedRect.x)
    const overlapHeight = Math.min(nextRect.y + nextRect.height, expandedRect.y + expandedRect.height) - Math.max(nextRect.y, expandedRect.y)

    if (overlapWidth > 0 && overlapHeight > 0) {
      overlapCount += 1
      overlapArea += overlapWidth * overlapHeight
    }
  })

  return {
    overlapCount,
    overlapArea
  }
}
const getMidpointCenter = (rects: LayoutRect[]) => {
  if (!rects.length) {
    return null
  }

  const sum = rects.reduce((accumulator, rect) => {
    const rectCenter = getRectCenter(rect)

    return {
      x: accumulator.x + rectCenter.x,
      y: accumulator.y + rectCenter.y
    }
  }, { x: 0, y: 0 })

  return {
    x: sum.x / rects.length,
    y: sum.y / rects.length
  }
}
const comparePlacementMetrics = (left: PlacementMetrics, right: PlacementMetrics) => {
  if (left.overlapCount !== right.overlapCount) {
    return left.overlapCount - right.overlapCount
  }

  if (left.overlapArea !== right.overlapArea) {
    return left.overlapArea - right.overlapArea
  }

  if (Math.abs(left.relationDistance - right.relationDistance) > 0.01) {
    return left.relationDistance - right.relationDistance
  }

  if (Math.abs(left.midpointDistance - right.midpointDistance) > 0.01) {
    return left.midpointDistance - right.midpointDistance
  }

  if (left.crossingCount !== right.crossingCount) {
    return left.crossingCount - right.crossingCount
  }

  if (left.lineHitCount !== right.lineHitCount) {
    return left.lineHitCount - right.lineHitCount
  }

  return left.originDistance - right.originDistance
}
const buildRingCandidates = (
  center: LayoutPoint,
  width: number,
  height: number,
  distances: number[]
) => {
  return distances.flatMap((distance) => {
    return [
      { x: center.x + distance - width / 2, y: center.y - height / 2 },
      { x: center.x - distance - width / 2, y: center.y - height / 2 },
      { x: center.x - width / 2, y: center.y + distance - height / 2 },
      { x: center.x - width / 2, y: center.y - distance - height / 2 },
      { x: center.x + distance * 0.72 - width / 2, y: center.y + distance * 0.72 - height / 2 },
      { x: center.x - distance * 0.72 - width / 2, y: center.y + distance * 0.72 - height / 2 },
      { x: center.x + distance * 0.72 - width / 2, y: center.y - distance * 0.72 - height / 2 },
      { x: center.x - distance * 0.72 - width / 2, y: center.y - distance * 0.72 - height / 2 }
    ]
  })
}
const dedupeCandidates = (candidates: Array<{ x: number, y: number }>) => {
  const seen = new Set<string>()

  return candidates.filter((candidate) => {
    const key = `${Math.round(candidate.x / 12)}:${Math.round(candidate.y / 12)}`

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}
const isHorizontalSide = (side: AnchorSide) => side === 'left' || side === 'right'
const getGroupNameForTableId = (tableId: string) => tableGroupById.value[tableId] || 'Ungrouped'
const getRelatedGroupRectsForNode = (
  node: CanvasNodeState,
  states: Record<string, CanvasNodeState>
) => {
  return uniqueValues(node.tableIds.map(tableId => getGroupNameForTableId(tableId)))
    .map(groupName => states[`group:${groupName}`])
    .filter((groupNode): groupNode is CanvasNodeState => Boolean(groupNode))
    .map(groupNode => getNodeRect(groupNode))
}

const normalizeReference = (value: string) => {
  return value.includes('.') ? value : `public.${value}`
}

const inferRoutineTables = (routine: PgmlRoutine) => {
  const haystack = cleanForSearch(`${routine.signature} ${routine.details.join(' ')}`)
  const tableIds: string[] = []

  for (const table of model.tables) {
    const fullName = cleanForSearch(table.fullName)
    const bareName = cleanForSearch(table.name)
    const singularName = bareName.endsWith('s') ? bareName.slice(0, -1) : bareName

    if (
      haystack.includes(fullName)
      || haystack.includes(bareName)
      || (singularName.length > 2 && haystack.includes(singularName))
    ) {
      tableIds.push(table.fullName)
    }
  }

  return Array.from(new Set(tableIds))
}

const getUniqueImpactTargets = (targets: ImpactTarget[]) => {
  const seen = new Set<string>()

  return targets.filter((target) => {
    const key = `${target.tableId}:${target.columnName || '*'}`.toLowerCase()

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

const inferColumnsFromText = (tableId: string, text: string) => {
  const table = model.tables.find(entry => entry.fullName === tableId)

  if (!table) {
    return []
  }

  const haystack = cleanForSearch(text)
  const tokens = new Set(haystack.split(/\s+/).filter(token => token.length > 0))

  return table.columns
    .filter(column => tokens.has(column.name.toLowerCase()))
    .map(column => column.name)
}

const inferConstraintTargets = (tableId: string, expression: string) => {
  const matchedColumns = inferColumnsFromText(tableId, expression)

  if (!matchedColumns.length) {
    return [{ tableId, columnName: null }]
  }

  return matchedColumns.map(columnName => ({
    tableId,
    columnName
  }))
}

const inferRoutineTargets = (routine: PgmlRoutine) => {
  const tableIds = inferRoutineTables(routine)
  const haystack = `${routine.signature} ${routine.details.join(' ')}`
  const targets: ImpactTarget[] = tableIds.flatMap((tableId): ImpactTarget[] => {
    const matchedColumns = inferColumnsFromText(tableId, haystack)

    if (!matchedColumns.length) {
      return [{
        tableId,
        columnName: null
      }]
    }

    return matchedColumns.map(columnName => ({
      tableId,
      columnName
    }))
  })

  return getUniqueImpactTargets(targets)
}

const inferTriggerTargets = (tableId: string, details: string[]) => {
  const haystack = details.join(' ')
  const matchedColumns = inferColumnsFromText(tableId, haystack)

  if (!matchedColumns.length) {
    return [{ tableId, columnName: null }]
  }

  return matchedColumns.map(columnName => ({
    tableId,
    columnName
  }))
}

const inferSequenceTargets = (sequence: PgmlSequence) => {
  const targets = model.tables.flatMap((table) => {
    return table.columns
      .filter((column) => {
        return column.modifiers.some(modifier => modifier.includes(sequence.name))
      })
      .map(column => ({
        tableId: table.fullName,
        columnName: column.name
      }))
  })

  return getUniqueImpactTargets(targets)
}

const inferCustomTypeTargets = (customType: PgmlCustomType) => {
  const targets = model.tables.flatMap((table) => {
    return table.columns
      .filter(column => column.type.includes(customType.name))
      .map(column => ({
        tableId: table.fullName,
        columnName: column.name
      }))
  })

  return getUniqueImpactTargets(targets)
}

const buildGroupRelationWeights = (groupNames: string[]) => {
  const weights: Record<string, Record<string, number>> = {}

  groupNames.forEach((groupName) => {
    weights[groupName] = {}
  })

  for (const reference of model.references) {
    const fromGroup = getGroupNameForTableId(reference.fromTable)
    const toGroup = getGroupNameForTableId(reference.toTable)

    if (fromGroup === toGroup) {
      continue
    }

    weights[fromGroup] = weights[fromGroup] || {}
    weights[toGroup] = weights[toGroup] || {}
    weights[fromGroup][toGroup] = (weights[fromGroup][toGroup] || 0) + 3
    weights[toGroup][fromGroup] = (weights[toGroup][fromGroup] || 0) + 3
  }

  return weights
}

const buildPlacedGroupConnections = (
  groupRects: LayoutRect[],
  weights: Record<string, Record<string, number>>
) => {
  const connections: LayoutConnection[] = []

  groupRects.forEach((fromRect, fromIndex) => {
    groupRects.slice(fromIndex + 1).forEach((toRect) => {
      const fromGroupName = fromRect.id.replace('group:', '')
      const toGroupName = toRect.id.replace('group:', '')
      const relationWeight = weights[fromGroupName]?.[toGroupName] || 0

      if (relationWeight <= 0) {
        return
      }

      connections.push(buildConnection(fromRect, toRect))
    })
  })

  return connections
}

const resolveObjectCollisions = (states: Record<string, CanvasNodeState>) => {
  const nextStates: Record<string, CanvasNodeState> = { ...states }
  const groupRects = Object.values(nextStates)
    .filter(node => node.kind === 'group')
    .map(node => getNodeRect(node))
  const groupWeights = buildGroupRelationWeights(groupRects.map(rect => rect.id.replace('group:', '')))

  for (let iteration = 0; iteration < 8; iteration += 1) {
    let moved = false
    const objectNodes = Object.values(nextStates).filter(node => node.kind === 'object')

    for (const currentNode of objectNodes) {
      const currentRect = getNodeRect(currentNode)
      const otherObjectRects = objectNodes
        .filter(node => node.id !== currentNode.id)
        .map(node => getNodeRect(node))
      const occupiedRects = [...groupRects, ...otherObjectRects]
      const currentOverlapMetrics = getOverlapMetrics(
        currentRect,
        occupiedRects,
        rect => rect.id.startsWith('group:') ? 28 : 18
      )

      if (currentOverlapMetrics.overlapCount === 0) {
        continue
      }

      const relatedRects = getRelatedGroupRectsForNode(currentNode, nextStates)
      const midpointCenter = getMidpointCenter(relatedRects) || getRectCenter(currentRect)
      const existingConnections = [
        ...buildPlacedGroupConnections(groupRects, groupWeights),
        ...objectNodes
          .filter(node => node.id !== currentNode.id)
          .flatMap((node) => {
            return getRelatedGroupRectsForNode(node, nextStates).map(rect => buildConnection(getNodeRect(node), rect))
          })
      ]
      const currentCenter = getRectCenter(currentRect)
      const candidates = dedupeCandidates([
        ...buildRingCandidates(currentCenter, currentNode.width, currentNode.height, [0, 120, 220, 340, 480, 620]),
        ...relatedRects.flatMap((rect) => {
          return [96, 180, 280, 420].flatMap((distance) => {
            return [
              { x: rect.x + rect.width + distance, y: rect.y + (rect.height - currentNode.height) / 2 },
              { x: rect.x - currentNode.width - distance, y: rect.y + (rect.height - currentNode.height) / 2 },
              { x: rect.x + (rect.width - currentNode.width) / 2, y: rect.y + rect.height + distance },
              { x: rect.x + (rect.width - currentNode.width) / 2, y: rect.y - currentNode.height - distance }
            ]
          })
        })
      ])

      const bestCandidate = candidates
        .map((candidate) => {
          const nextRect: LayoutRect = {
            id: currentNode.id,
            x: Math.max(72, Math.round(candidate.x / 12) * 12),
            y: Math.max(72, Math.round(candidate.y / 12) * 12),
            width: currentNode.width,
            height: currentNode.height
          }
          const nextCenter = getRectCenter(nextRect)
          const nextConnections = relatedRects.map(rect => buildConnection(nextRect, rect))
          const overlapMetrics = getOverlapMetrics(
            nextRect,
            occupiedRects,
            rect => rect.id.startsWith('group:') ? 28 : 18
          )
          const relationDistance = occupiedRects.reduce((sum, rect) => {
            const rectCenter = getRectCenter(rect)
            const distance = Math.hypot(nextCenter.x - rectCenter.x, nextCenter.y - rectCenter.y)
            const isRelated = relatedRects.some(relatedRect => relatedRect.id === rect.id)

            return sum + (isRelated ? distance * 0.72 : Math.max(0, 220 - distance) * 0.9)
          }, 0)
          const metrics: PlacementMetrics = {
            overlapCount: overlapMetrics.overlapCount,
            overlapArea: overlapMetrics.overlapArea,
            relationDistance,
            midpointDistance: Math.hypot(nextCenter.x - midpointCenter.x, nextCenter.y - midpointCenter.y),
            crossingCount: countConnectionCrossings(nextConnections, existingConnections),
            lineHitCount: countConnectionRectHits(
              nextConnections,
              occupiedRects,
              new Set([currentNode.id, ...relatedRects.map(rect => rect.id)])
            ),
            originDistance: Math.hypot(nextCenter.x - currentCenter.x, nextCenter.y - currentCenter.y)
          }

          return {
            candidate: nextRect,
            metrics
          }
        })
        .sort((left, right) => comparePlacementMetrics(left.metrics, right.metrics))[0]

      if (!bestCandidate) {
        continue
      }

      const currentMetrics: PlacementMetrics = {
        overlapCount: currentOverlapMetrics.overlapCount,
        overlapArea: currentOverlapMetrics.overlapArea,
        relationDistance: 0,
        midpointDistance: 0,
        crossingCount: Number.POSITIVE_INFINITY,
        lineHitCount: Number.POSITIVE_INFINITY,
        originDistance: 0
      }

      if (comparePlacementMetrics(bestCandidate.metrics, currentMetrics) >= 0) {
        continue
      }

      nextStates[currentNode.id] = {
        ...currentNode,
        x: bestCandidate.candidate.x,
        y: bestCandidate.candidate.y
      }
      moved = true
    }

    if (!moved) {
      break
    }
  }

  return nextStates
}

const autoLayoutGroups = (groupNodes: CanvasNodeState[]) => {
  const positions: Record<string, { x: number, y: number }> = {}
  const placed: LayoutRect[] = []
  const placedConnections: LayoutConnection[] = []
  const weights = buildGroupRelationWeights(groupNodes.map(node => node.title))
  const orderedGroups = [...groupNodes].sort((left, right) => {
    const leftWeight = Object.values(weights[left.title] || {}).reduce((sum, value) => sum + value, 0)
    const rightWeight = Object.values(weights[right.title] || {}).reduce((sum, value) => sum + value, 0)

    if (rightWeight !== leftWeight) {
      return rightWeight - leftWeight
    }

    if ((right.tableCount || 0) !== (left.tableCount || 0)) {
      return (right.tableCount || 0) - (left.tableCount || 0)
    }

    return left.title.localeCompare(right.title)
  })

  orderedGroups.forEach((groupNode, index) => {
    const relatedRects = placed.filter((rect) => {
      const relatedName = rect.id.replace('group:', '')
      return (weights[groupNode.title]?.[relatedName] || 0) > 0
    })
    const anchors = relatedRects.length ? relatedRects : placed.slice(-3)
    const fallbackX = 120 + (index % 2) * (groupNode.width + 220)
    const fallbackY = 120 + Math.floor(index / 2) * 440
    const anchorCandidates = anchors.flatMap((anchor) => {
      return [160, 280, 420].flatMap((distance) => {
        return [
          {
            x: anchor.x + anchor.width + distance,
            y: anchor.y + (anchor.height - groupNode.height) / 2
          },
          {
            x: anchor.x - groupNode.width - distance,
            y: anchor.y + (anchor.height - groupNode.height) / 2
          },
          {
            x: anchor.x + (anchor.width - groupNode.width) / 2,
            y: anchor.y + anchor.height + distance * 0.76
          },
          {
            x: anchor.x + (anchor.width - groupNode.width) / 2,
            y: anchor.y - groupNode.height - distance * 0.76
          }
        ]
      })
    })
    const centroid = relatedRects.length
      ? relatedRects.reduce((sum, rect) => {
          const rectCenter = getRectCenter(rect)

          return {
            x: sum.x + rectCenter.x,
            y: sum.y + rectCenter.y
          }
        }, { x: 0, y: 0 })
      : { x: fallbackX + groupNode.width / 2, y: fallbackY + groupNode.height / 2 }
    const centroidPoint = relatedRects.length
      ? {
          x: centroid.x / relatedRects.length,
          y: centroid.y / relatedRects.length
        }
      : centroid
    const midpointCenter = getMidpointCenter(relatedRects) || centroidPoint
    const candidates = dedupeCandidates([
      ...anchorCandidates,
      ...buildRingCandidates(centroidPoint, groupNode.width, groupNode.height, [0, 200, 360, 520]),
      { x: fallbackX, y: fallbackY }
    ])

    const bestCandidate = candidates
      .map((candidate) => {
        const nextRect: LayoutRect = {
          id: groupNode.id,
          x: Math.max(72, Math.round(candidate.x / 12) * 12),
          y: Math.max(72, Math.round(candidate.y / 12) * 12),
          width: groupNode.width,
          height: groupNode.height
        }
        const nextCenter = getRectCenter(nextRect)
        const nextConnections = relatedRects.map(rect => buildConnection(nextRect, rect))
        const overlapMetrics = getOverlapMetrics(nextRect, placed, () => layoutPadding)
        const relationDistance = placed.reduce((sum, rect) => {
          const rectCenter = getRectCenter(rect)
          const distance = Math.hypot(nextCenter.x - rectCenter.x, nextCenter.y - rectCenter.y)
          const relationWeight = weights[groupNode.title]?.[rect.id.replace('group:', '')] || 0
          const relationScore = relationWeight > 0
            ? distance / relationWeight
            : Math.max(0, 340 - distance) * 1.2

          return sum + relationScore
        }, 0)
        const crossingCount = countConnectionCrossings(nextConnections, placedConnections)
        const lineHitCount = countConnectionRectHits(
          nextConnections,
          placed,
          new Set([groupNode.id, ...relatedRects.map(rect => rect.id)])
        )
        const metrics: PlacementMetrics = {
          overlapCount: overlapMetrics.overlapCount,
          overlapArea: overlapMetrics.overlapArea,
          relationDistance,
          midpointDistance: Math.hypot(nextCenter.x - midpointCenter.x, nextCenter.y - midpointCenter.y),
          crossingCount,
          lineHitCount,
          originDistance: Math.hypot(nextRect.x - fallbackX, nextRect.y - fallbackY)
        }

        return {
          candidate: nextRect,
          metrics
        }
      })
      .sort((left, right) => comparePlacementMetrics(left.metrics, right.metrics))[0]

    const resolvedCandidate = bestCandidate?.candidate || {
      id: groupNode.id,
      x: fallbackX,
      y: fallbackY,
      width: groupNode.width,
      height: groupNode.height
    }

    positions[groupNode.id] = {
      x: resolvedCandidate.x,
      y: resolvedCandidate.y
    }
    placed.push(resolvedCandidate)
    relatedRects.forEach((rect) => {
      placedConnections.push(buildConnection(resolvedCandidate, rect))
    })
  })

  return positions
}

const autoLayoutObjectNodes = (objectNodes: CanvasNodeState[], groupStates: Record<string, CanvasNodeState>) => {
  const positions: Record<string, { x: number, y: number }> = {}
  const placedObjects: LayoutRect[] = []
  const groupRects = Object.values(groupStates)
    .filter(node => node.kind === 'group')
    .map(node => getNodeRect(node))
  const placedConnections = buildPlacedGroupConnections(groupRects, buildGroupRelationWeights(groupRects.map(rect => rect.id.replace('group:', ''))))
  const orderedObjects = [...objectNodes].sort((left, right) => {
    if (right.tableIds.length !== left.tableIds.length) {
      return right.tableIds.length - left.tableIds.length
    }

    return left.title.localeCompare(right.title)
  })

  orderedObjects.forEach((objectNode, index) => {
    const relatedGroupNames = uniqueValues(objectNode.tableIds.map(tableId => getGroupNameForTableId(tableId)))
    const relatedRects = relatedGroupNames
      .map(groupName => groupStates[`group:${groupName}`])
      .filter((node): node is CanvasNodeState => Boolean(node))
      .map(node => getNodeRect(node))
    const centroid = relatedRects.length
      ? relatedRects.reduce((sum, rect) => {
          const center = getRectCenter(rect)

          return {
            x: sum.x + center.x,
            y: sum.y + center.y
          }
        }, { x: 0, y: 0 })
      : { x: objectColumnX, y: 160 + index * 140 }
    const centroidPoint = relatedRects.length
      ? {
          x: centroid.x / relatedRects.length,
          y: centroid.y / relatedRects.length
        }
      : centroid
    const midpointCenter = getMidpointCenter(relatedRects) || centroidPoint

    const candidates = relatedRects.length
      ? dedupeCandidates([
          ...relatedRects.flatMap((rect, rectIndex) => {
            return [84, 164, 264].flatMap((distance) => {
              return [
                {
                  x: rect.x + rect.width + distance,
                  y: rect.y + 22 + rectIndex * 18
                },
                {
                  x: rect.x - objectNode.width - distance,
                  y: rect.y + 22 + rectIndex * 18
                },
                {
                  x: rect.x + clamp((rect.width - objectNode.width) / 2, -objectNode.width / 2, rect.width),
                  y: rect.y + rect.height + distance
                },
                {
                  x: rect.x + clamp((rect.width - objectNode.width) / 2, -objectNode.width / 2, rect.width),
                  y: rect.y - objectNode.height - distance
                }
              ]
            })
          }),
          ...buildRingCandidates(centroidPoint, objectNode.width, objectNode.height, [96, 180, 280, 380]),
          {
            x: objectColumnX + (index % 2) * objectColumnGapX,
            y: 120 + Math.floor(index / 2) * objectRowGapY
          }
        ])
      : [
          {
            x: objectColumnX + (index % 2) * objectColumnGapX,
            y: 120 + Math.floor(index / 2) * objectRowGapY
          }
        ]

    const bestCandidate = candidates
      .map((candidate) => {
        const nextRect: LayoutRect = {
          id: objectNode.id,
          x: Math.max(72, Math.round(candidate.x / 12) * 12),
          y: Math.max(72, Math.round(candidate.y / 12) * 12),
          width: objectNode.width,
          height: objectNode.height
        }
        const nextCenter = getRectCenter(nextRect)
        const occupiedRects = [...groupRects, ...placedObjects]
        const nextConnections = relatedRects.map(rect => buildConnection(nextRect, rect))
        const overlapMetrics = getOverlapMetrics(
          nextRect,
          occupiedRects,
          rect => rect.id.startsWith('group:') ? 56 : 28
        )
        const relationDistance = occupiedRects.reduce((sum, rect) => {
          const rectCenter = getRectCenter(rect)
          const distance = Math.hypot(nextCenter.x - rectCenter.x, nextCenter.y - rectCenter.y)
          const relationScore = relatedRects.some(relatedRect => relatedRect.id === rect.id)
            ? distance * 0.72
            : Math.max(0, 220 - distance) * 0.9

          return sum + relationScore
        }, 0)
        const crossingCount = countConnectionCrossings(nextConnections, placedConnections)
        const lineHitCount = countConnectionRectHits(
          nextConnections,
          occupiedRects,
          new Set([objectNode.id, ...relatedRects.map(rect => rect.id)])
        )
        const metrics: PlacementMetrics = {
          overlapCount: overlapMetrics.overlapCount,
          overlapArea: overlapMetrics.overlapArea,
          relationDistance,
          midpointDistance: Math.hypot(nextCenter.x - midpointCenter.x, nextCenter.y - midpointCenter.y),
          crossingCount,
          lineHitCount,
          originDistance: Math.hypot(nextRect.x - centroidPoint.x, nextRect.y - centroidPoint.y)
        }

        return {
          candidate: nextRect,
          metrics
        }
      })
      .sort((left, right) => comparePlacementMetrics(left.metrics, right.metrics))[0]

    const resolvedCandidate = bestCandidate?.candidate || {
      id: objectNode.id,
      x: objectColumnX + (index % 2) * objectColumnGapX,
      y: 120 + Math.floor(index / 2) * objectRowGapY,
      width: objectNode.width,
      height: objectNode.height
    }

    positions[objectNode.id] = {
      x: resolvedCandidate.x,
      y: resolvedCandidate.y
    }
    placedObjects.push(resolvedCandidate)
    relatedRects.forEach((rect) => {
      placedConnections.push(buildConnection(resolvedCandidate, rect))
    })
  })

  return positions
}

const buildObjectNodes = (groupStates: Record<string, CanvasNodeState>) => {
  const nodes: CanvasNodeState[] = []
  const lanes: Record<string, number> = {}

  const resolveGroupName = (tableIds: string[]) => {
    const firstTable = model.tables.find(table => tableIds.includes(table.fullName))
    return firstTable?.groupName || 'Ungrouped'
  }

  const nextPosition = (tableIds: string[], kind: ObjectKind) => {
    const groupName = resolveGroupName(tableIds)
    const groupNode = groupStates[`group:${groupName}`]
    const laneKey = `${groupName}:${kind === 'Function' || kind === 'Procedure' || kind === 'Trigger' || kind === 'Sequence' ? 'bottom' : 'side'}`
    const lane = lanes[laneKey] || 0

    lanes[laneKey] = lane + 1

    if (!groupNode) {
      return {
        x: objectColumnX + (lane % 2) * objectColumnGapX,
        y: 90 + Math.floor(lane / 2) * objectRowGapY
      }
    }

    if (kind === 'Function' || kind === 'Procedure' || kind === 'Trigger' || kind === 'Sequence') {
      return {
        x: groupNode.x + (lane % 2) * objectColumnGapX,
        y: groupNode.y + groupNode.height + 56 + Math.floor(lane / 2) * objectRowGapY
      }
    }

    return {
      x: groupNode.x + groupNode.width + 72 + (lane % 2) * objectColumnGapX,
      y: groupNode.y + lane * 136
    }
  }

  const addNode = (partial: Omit<CanvasNodeState, 'x' | 'y'>) => {
    const position = nextPosition(partial.tableIds, partial.objectKind || 'Index')

    nodes.push({
      ...partial,
      ...position
    })
  }

  for (const table of model.tables) {
    for (const index of table.indexes) {
      addNode({
        id: `index:${index.name}`,
        kind: 'object',
        objectKind: 'Index',
        title: index.name,
        subtitle: `${index.type.toUpperCase()} on ${table.name}`,
        details: [`Columns: ${index.columns.join(', ')}`],
        width: 248,
        height: 104,
        color: '#38bdf8',
        tableIds: [normalizeReference(index.tableName)],
        impactTargets: index.columns.map(columnName => ({
          tableId: normalizeReference(index.tableName),
          columnName
        }))
      })
    }

    for (const constraint of table.constraints) {
      const tableId = normalizeReference(constraint.tableName)

      addNode({
        id: `constraint:${constraint.name}`,
        kind: 'object',
        objectKind: 'Constraint',
        title: constraint.name,
        subtitle: `Constraint on ${table.name}`,
        details: [constraint.expression],
        width: 258,
        height: 114,
        color: '#fb7185',
        tableIds: [tableId],
        impactTargets: inferConstraintTargets(tableId, constraint.expression)
      })
    }
  }

  for (const pgFunction of model.functions) {
    const impactTargets = inferRoutineTargets(pgFunction)

    addNode({
      id: `function:${pgFunction.name}`,
      kind: 'object',
      objectKind: 'Function',
      title: pgFunction.name,
      subtitle: pgFunction.signature,
      details: pgFunction.details,
      width: 272,
      height: 122,
      color: '#c084fc',
      tableIds: uniqueValues(impactTargets.map(target => target.tableId)),
      impactTargets
    })
  }

  for (const procedure of model.procedures) {
    const impactTargets = inferRoutineTargets(procedure)

    addNode({
      id: `procedure:${procedure.name}`,
      kind: 'object',
      objectKind: 'Procedure',
      title: procedure.name,
      subtitle: procedure.signature,
      details: procedure.details,
      width: 272,
      height: 122,
      color: '#f97316',
      tableIds: uniqueValues(impactTargets.map(target => target.tableId)),
      impactTargets
    })
  }

  for (const trigger of model.triggers) {
    const tableId = normalizeReference(trigger.tableName)

    addNode({
      id: `trigger:${trigger.name}`,
      kind: 'object',
      objectKind: 'Trigger',
      title: trigger.name,
      subtitle: `On ${trigger.tableName}`,
      details: trigger.details,
      width: 264,
      height: 114,
      color: '#22c55e',
      tableIds: [tableId],
      impactTargets: inferTriggerTargets(tableId, trigger.details)
    })
  }

  for (const sequence of model.sequences) {
    const impactTargets = inferSequenceTargets(sequence)

    addNode({
      id: `sequence:${sequence.name}`,
      kind: 'object',
      objectKind: 'Sequence',
      title: sequence.name,
      subtitle: 'Sequence',
      details: sequence.details,
      width: 240,
      height: 106,
      color: '#eab308',
      tableIds: uniqueValues(impactTargets.map(target => target.tableId)),
      impactTargets
    })
  }

  for (const customType of model.customTypes) {
    const impactTargets = inferCustomTypeTargets(customType)

    addNode({
      id: `custom-type:${customType.kind}:${customType.name}`,
      kind: 'object',
      objectKind: 'Custom Type',
      title: customType.name,
      subtitle: customType.kind,
      details: customType.details,
      width: 258,
      height: 114,
      color: '#14b8a6',
      tableIds: uniqueValues(impactTargets.map(target => target.tableId)),
      impactTargets
    })
  }

  return nodes
}

const syncNodeStates = () => {
  const nextStates: Record<string, CanvasNodeState> = {}
  const tableGroups = new Map<string, typeof model.tables>()
  const orderedNames: string[] = []
  const groupNodes: CanvasNodeState[] = []

  for (const table of model.tables) {
    const groupName = table.groupName || 'Ungrouped'

    if (!tableGroups.has(groupName)) {
      tableGroups.set(groupName, [])
      orderedNames.push(groupName)
    }

    tableGroups.get(groupName)?.push(table)
  }

  orderedNames.forEach((groupName, index) => {
    const tables = tableGroups.get(groupName) || []
    const existing = nodeStates.value[`group:${groupName}`]
    const color = existing?.color || palette[index % palette.length] || '#8b5cf6'
    const columnCount = existing?.columnCount ?? 1
    const note = model.groups.find(group => group.name === groupName)?.note || null
    const minimumSize = getGroupMinimumSize(groupName, columnCount, note)

    groupNodes.push({
      id: `group:${groupName}`,
      kind: 'group',
      title: groupName,
      subtitle: `${tables.length} tables`,
      details: tables.map(table => table.fullName),
      x: existing?.x ?? 120 + index * 420,
      y: existing?.y ?? 90 + (index % 2) * 120,
      width: Math.max(existing?.width ?? 320, minimumSize.minWidth),
      height: Math.max(existing?.height ?? 180, minimumSize.minHeight),
      color,
      tableIds: tables.map(table => table.fullName),
      tableCount: tables.length,
      columnCount,
      note,
      minWidth: minimumSize.minWidth,
      minHeight: minimumSize.minHeight
    })
  })

  const groupPositions = autoLayoutGroups(groupNodes)

  for (const groupNode of groupNodes) {
    const existing = nodeStates.value[groupNode.id]

    nextStates[groupNode.id] = {
      ...groupNode,
      x: existing?.x ?? groupPositions[groupNode.id]?.x ?? groupNode.x,
      y: existing?.y ?? groupPositions[groupNode.id]?.y ?? groupNode.y
    }
  }

  const objectNodes = buildObjectNodes(nextStates)
  const objectPositions = autoLayoutObjectNodes(objectNodes, nextStates)

  for (const objectNode of objectNodes) {
    const existing = nodeStates.value[objectNode.id]

    nextStates[objectNode.id] = {
      ...objectNode,
      x: existing?.x ?? objectPositions[objectNode.id]?.x ?? objectNode.x,
      y: existing?.y ?? objectPositions[objectNode.id]?.y ?? objectNode.y,
      width: existing?.width ?? objectNode.width,
      height: existing?.height ?? objectNode.height,
      color: existing?.color || objectNode.color,
      minWidth: existing?.minWidth ?? objectNode.width,
      minHeight: existing?.minHeight ?? objectNode.height
    }
  }

  nodeStates.value = nextStates

  if (selectedNodeId.value && !nodeStates.value[selectedNodeId.value]) {
    selectedNodeId.value = null
  }
}

const getElementIdentity = (element: HTMLElement) => {
  return (
    element.getAttribute('data-impact-anchor')
    || element.getAttribute('data-column-label-anchor')
    || element.getAttribute('data-column-anchor')
    || element.getAttribute('data-table-anchor')
    || element.getAttribute('data-node-anchor')
    || ''
  )
}

const getColumnAnchorKey = (tableId: string, columnName: string) => `${tableId}.${columnName}`.toLowerCase()
const getColumnLabelAnchorKey = (tableId: string, columnName: string) => `${tableId}.${columnName}`.toLowerCase()
const getImpactAnchorKey = (nodeId: string, tableId: string) => `${nodeId}:${tableId}`.toLowerCase()
const getFieldAnchorElement = (tableId: string, columnName: string) => {
  if (!planeRef.value) {
    return null
  }

  return (
    planeRef.value.querySelector(`[data-column-label-anchor="${getColumnLabelAnchorKey(tableId, columnName)}"]`)
    || planeRef.value.querySelector(`[data-column-anchor="${getColumnAnchorKey(tableId, columnName)}"]`)
    || planeRef.value.querySelector(`[data-table-anchor="${tableId}"]`)
  )
}
const getImpactAnchorElement = (nodeId: string, tableId: string) => {
  if (!planeRef.value) {
    return null
  }

  return (
    planeRef.value.querySelector(`[data-impact-anchor="${getImpactAnchorKey(nodeId, tableId)}"]`)
    || planeRef.value.querySelector(`[data-node-anchor="${nodeId}"]`)
  )
}
const canvasViewportStyle = {
  borderColor: 'var(--studio-shell-border)',
  backgroundColor: 'var(--studio-canvas-bg)',
  backgroundImage: 'radial-gradient(circle at center, var(--studio-canvas-dot) 1px, transparent 1px)',
  backgroundSize: '18px 18px'
}
const floatingPanelStyle = {
  borderColor: 'var(--studio-control-border)',
  backgroundColor: 'var(--studio-control-bg)',
  boxShadow: 'var(--studio-floating-shadow)'
}
const getNodeBorderColor = (node: CanvasNodeState) => {
  return node.kind === 'group'
    ? `color-mix(in srgb, ${node.color} 38%, var(--studio-node-border-neutral) 62%)`
    : `color-mix(in srgb, ${node.color} 62%, var(--studio-node-border-neutral) 38%)`
}
const getNodeBackground = (node: CanvasNodeState) => {
  return node.kind === 'group'
    ? `linear-gradient(180deg, color-mix(in srgb, ${node.color} 12%, transparent), var(--studio-group-surface-soft) 22%), var(--studio-group-surface)`
    : `linear-gradient(180deg, color-mix(in srgb, ${node.color} 9%, transparent), var(--studio-node-surface-top) 18%), var(--studio-node-surface-bottom)`
}
const getNodeAccentColor = (node: CanvasNodeState) => {
  return `color-mix(in srgb, ${node.color} 70%, var(--studio-node-accent-mix) 30%)`
}

const getAnchorSlotCount = (element: HTMLElement, side: AnchorSide) => {
  if (element.hasAttribute('data-column-label-anchor')) {
    return isHorizontalSide(side) ? 2 : 3
  }

  const bounds = element.getBoundingClientRect()
  const dimension = isHorizontalSide(side) ? bounds.height : bounds.width
  const divisor = element.hasAttribute('data-table-anchor')
    ? (isHorizontalSide(side) ? 72 : 144)
    : (isHorizontalSide(side) ? 56 : 128)

  return Math.max(2, Math.min(10, Math.ceil(dimension / divisor)))
}

const getAnchorPoint = (
  element: HTMLElement,
  side: AnchorSide,
  slot: number,
  count: number,
  planeBounds: DOMRect
): AnchorPoint => {
  const bounds = element.getBoundingClientRect()
  const ratio = count === 1 ? 0.5 : (slot + 1) / (count + 1)
  const xLeft = (bounds.left - planeBounds.left) / scale.value
  const xRight = (bounds.right - planeBounds.left) / scale.value
  const yTop = (bounds.top - planeBounds.top) / scale.value
  const yBottom = (bounds.bottom - planeBounds.top) / scale.value
  const xCenter = (bounds.left - planeBounds.left + bounds.width * ratio) / scale.value
  const yCenter = (bounds.top - planeBounds.top + bounds.height * ratio) / scale.value

  if (side === 'left') {
    return {
      x: xLeft,
      y: yCenter,
      side,
      slot,
      count
    }
  }

  if (side === 'right') {
    return {
      x: xRight,
      y: yCenter,
      side,
      slot,
      count
    }
  }

  if (side === 'top') {
    return {
      x: xCenter,
      y: yTop,
      side,
      slot,
      count
    }
  }

  return {
    x: xCenter,
    y: yBottom,
    side,
    slot,
    count
  }
}

const reserveAnchorPoint = (
  element: HTMLElement,
  side: AnchorSide,
  desiredRatio: number,
  planeBounds: DOMRect,
  usage: Map<string, number[]>
) => {
  const count = getAnchorSlotCount(element, side)
  const key = `${getElementIdentity(element)}:${side}`
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

  return getAnchorPoint(element, side, bestSlot, count, planeBounds)
}

const moveAnchorPoint = (point: AnchorPoint, distance: number) => {
  if (point.side === 'left') {
    return {
      x: point.x - distance,
      y: point.y
    }
  }

  if (point.side === 'right') {
    return {
      x: point.x + distance,
      y: point.y
    }
  }

  if (point.side === 'top') {
    return {
      x: point.x,
      y: point.y - distance
    }
  }

  return {
    x: point.x,
    y: point.y + distance
  }
}

const decideAnchorSides = (fromElement: HTMLElement, toElement: HTMLElement): { from: AnchorSide, to: AnchorSide } => {
  const fromBounds = fromElement.getBoundingClientRect()
  const toBounds = toElement.getBoundingClientRect()
  const fromCenterX = fromBounds.left + fromBounds.width / 2
  const fromCenterY = fromBounds.top + fromBounds.height / 2
  const toCenterX = toBounds.left + toBounds.width / 2
  const toCenterY = toBounds.top + toBounds.height / 2
  const deltaX = toCenterX - fromCenterX
  const deltaY = toCenterY - fromCenterY

  if (Math.abs(deltaX) >= Math.abs(deltaY) * 0.75) {
    return deltaX >= 0
      ? { from: 'right', to: 'left' }
      : { from: 'left', to: 'right' }
  }

  return deltaY >= 0
    ? { from: 'bottom', to: 'top' }
    : { from: 'top', to: 'bottom' }
}

const buildPathFromAnchors = (fromAnchor: AnchorPoint, toAnchor: AnchorPoint) => {
  const routeOffset = 18 + (fromAnchor.slot % 4) * 6 + (toAnchor.slot % 4) * 4
  const fromExit = moveAnchorPoint(fromAnchor, routeOffset)
  const toExit = moveAnchorPoint(toAnchor, routeOffset)

  if (isHorizontalSide(fromAnchor.side) && isHorizontalSide(toAnchor.side)) {
    const midX = fromAnchor.side === toAnchor.side
      ? (fromAnchor.side === 'right'
          ? Math.max(fromExit.x, toExit.x) + 28
          : Math.min(fromExit.x, toExit.x) - 28)
      : (fromExit.x + toExit.x) / 2

    return [
      `M ${fromAnchor.x} ${fromAnchor.y}`,
      `L ${fromExit.x} ${fromExit.y}`,
      `L ${midX} ${fromExit.y}`,
      `L ${midX} ${toExit.y}`,
      `L ${toExit.x} ${toExit.y}`,
      `L ${toAnchor.x} ${toAnchor.y}`
    ].join(' ')
  }

  if (!isHorizontalSide(fromAnchor.side) && !isHorizontalSide(toAnchor.side)) {
    const midY = fromAnchor.side === toAnchor.side
      ? (fromAnchor.side === 'bottom'
          ? Math.max(fromExit.y, toExit.y) + 28
          : Math.min(fromExit.y, toExit.y) - 28)
      : (fromExit.y + toExit.y) / 2

    return [
      `M ${fromAnchor.x} ${fromAnchor.y}`,
      `L ${fromExit.x} ${fromExit.y}`,
      `L ${fromExit.x} ${midY}`,
      `L ${toExit.x} ${midY}`,
      `L ${toExit.x} ${toExit.y}`,
      `L ${toAnchor.x} ${toAnchor.y}`
    ].join(' ')
  }

  if (isHorizontalSide(fromAnchor.side) && !isHorizontalSide(toAnchor.side)) {
    return [
      `M ${fromAnchor.x} ${fromAnchor.y}`,
      `L ${fromExit.x} ${fromExit.y}`,
      `L ${toExit.x} ${fromExit.y}`,
      `L ${toExit.x} ${toExit.y}`,
      `L ${toAnchor.x} ${toAnchor.y}`
    ].join(' ')
  }

  return [
    `M ${fromAnchor.x} ${fromAnchor.y}`,
    `L ${fromExit.x} ${fromExit.y}`,
    `L ${fromExit.x} ${toExit.y}`,
    `L ${toExit.x} ${toExit.y}`,
    `L ${toAnchor.x} ${toAnchor.y}`
  ].join(' ')
}

const buildPathBetween = (
  fromElement: HTMLElement,
  toElement: HTMLElement,
  color: string,
  dashed: boolean,
  usage: Map<string, number[]>
) => {
  if (!planeRef.value) {
    return null
  }

  const planeBounds = planeRef.value.getBoundingClientRect()
  const fromBounds = fromElement.getBoundingClientRect()
  const toBounds = toElement.getBoundingClientRect()
  const sourceCenterX = fromBounds.left + fromBounds.width / 2
  const sourceCenterY = fromBounds.top + fromBounds.height / 2
  const targetCenterX = toBounds.left + toBounds.width / 2
  const targetCenterY = toBounds.top + toBounds.height / 2
  const sides = decideAnchorSides(fromElement, toElement)
  const fromRatio = isHorizontalSide(sides.from)
    ? clamp((targetCenterY - fromBounds.top) / Math.max(fromBounds.height, 1), 0.16, 0.84)
    : clamp((targetCenterX - fromBounds.left) / Math.max(fromBounds.width, 1), 0.16, 0.84)
  const toRatio = isHorizontalSide(sides.to)
    ? clamp((sourceCenterY - toBounds.top) / Math.max(toBounds.height, 1), 0.16, 0.84)
    : clamp((sourceCenterX - toBounds.left) / Math.max(toBounds.width, 1), 0.16, 0.84)
  const fromAnchor = reserveAnchorPoint(fromElement, sides.from, fromRatio, planeBounds, usage)
  const toAnchor = reserveAnchorPoint(toElement, sides.to, toRatio, planeBounds, usage)

  return {
    path: buildPathFromAnchors(fromAnchor, toAnchor),
    color,
    dashed
  }
}

const updateConnections = () => {
  if (!planeRef.value) {
    return
  }

  const descriptors: Array<{
    key: string
    color: string
    dashed: boolean
    fromElement: HTMLElement
    toElement: HTMLElement
  }> = []
  const usage = new Map<string, number[]>()

  for (const reference of model.references) {
    const fromElement = getFieldAnchorElement(reference.fromTable, reference.fromColumn)
    const toElement = getFieldAnchorElement(reference.toTable, reference.toColumn)

    if (!(fromElement instanceof HTMLElement) || !(toElement instanceof HTMLElement)) {
      continue
    }

    descriptors.push({
      key: `ref:${reference.fromTable}:${reference.fromColumn}:${reference.toTable}:${reference.toColumn}`,
      color: '#79e3ea',
      dashed: false,
      fromElement,
      toElement
    })
  }

  for (const node of canvasNodes.value.filter(canvasNode => canvasNode.kind === 'object')) {
    const impactTargets = node.impactTargets?.length
      ? node.impactTargets
      : node.tableIds.map(tableId => ({
          tableId,
          columnName: null
        }))

    for (const impactTarget of impactTargets) {
      const fromElement = getImpactAnchorElement(node.id, impactTarget.tableId)
      const toElement = impactTarget.columnName
        ? getFieldAnchorElement(impactTarget.tableId, impactTarget.columnName)
        : planeRef.value.querySelector(`[data-table-anchor="${impactTarget.tableId}"]`)

      if (!(fromElement instanceof HTMLElement) || !(toElement instanceof HTMLElement)) {
        continue
      }

      descriptors.push({
        key: `${node.id}->${impactTarget.tableId}:${impactTarget.columnName || '*'}`,
        color: node.color,
        dashed: true,
        fromElement,
        toElement
      })
    }
  }

  const lines = descriptors
    .map((descriptor) => {
      const result = buildPathBetween(
        descriptor.fromElement,
        descriptor.toElement,
        descriptor.color,
        descriptor.dashed,
        usage
      )

      if (!result) {
        return null
      }

      return {
        key: descriptor.key,
        path: result.path,
        color: result.color,
        dashed: result.dashed
      } satisfies ConnectionLine
    })
    .filter((line): line is ConnectionLine => Boolean(line))

  connectionLines.value = lines
}

const reflowAutoLayout = () => {
  const nextStates: Record<string, CanvasNodeState> = { ...nodeStates.value }
  const groupNodes = Object.values(nextStates).filter(node => node.kind === 'group')
  const groupPositions = autoLayoutGroups(groupNodes)

  for (const groupNode of groupNodes) {
    const currentGroupNode = nextStates[groupNode.id]

    if (!currentGroupNode) {
      continue
    }

    nextStates[groupNode.id] = {
      ...currentGroupNode,
      x: groupPositions[groupNode.id]?.x ?? groupNode.x,
      y: groupPositions[groupNode.id]?.y ?? groupNode.y
    }
  }

  const objectNodes = Object.values(nextStates).filter(node => node.kind === 'object')
  const objectPositions = autoLayoutObjectNodes(objectNodes, nextStates)

  for (const objectNode of objectNodes) {
    const currentObjectNode = nextStates[objectNode.id]

    if (!currentObjectNode) {
      continue
    }

    nextStates[objectNode.id] = {
      ...currentObjectNode,
      x: objectPositions[objectNode.id]?.x ?? objectNode.x,
      y: objectPositions[objectNode.id]?.y ?? objectNode.y
    }
  }

  nodeStates.value = resolveObjectCollisions(nextStates)
}

const zoomBy = (direction: 1 | -1) => {
  const nextScale = scale.value + direction * 0.08
  scale.value = Math.min(1.3, Math.max(0.45, Number(nextScale.toFixed(2))))
}

const fitView = () => {
  if (!viewportRef.value) {
    return
  }

  const bounds = getCanvasBounds()

  if (!bounds) {
    return
  }

  const padding = {
    top: 48,
    right: 240,
    bottom: 72,
    left: 48
  }
  const availableWidth = Math.max(240, viewportRef.value.clientWidth - padding.left - padding.right)
  const availableHeight = Math.max(240, viewportRef.value.clientHeight - padding.top - padding.bottom)
  const nextScale = Math.min(1, Math.max(0.45, Number(Math.min(availableWidth / bounds.width, availableHeight / bounds.height).toFixed(2))))

  scale.value = nextScale
  pan.value = {
    x: Math.round(padding.left + (availableWidth - bounds.width * nextScale) / 2 - bounds.minX * nextScale),
    y: Math.round(padding.top + (availableHeight - bounds.height * nextScale) / 2 - bounds.minY * nextScale)
  }
}

const resetView = () => {
  fitView()
}

const updateNode = (
  id: string,
  partial: Partial<CanvasNodeState>,
  options: {
    remeasure?: boolean
  } = {}
) => {
  const current = nodeStates.value[id]

  if (!current) {
    return
  }

  const remeasure = options.remeasure !== false

  const nextNode = {
    ...current,
    ...partial
  }

  if (current.kind === 'group') {
    const minimumSize = getGroupMinimumSize(
      current.title,
      nextNode.columnCount || 1,
      nextNode.note
    )

    nextNode.minWidth = minimumSize.minWidth
    nextNode.minHeight = minimumSize.minHeight
    nextNode.width = Math.max(nextNode.width, minimumSize.minWidth)
    nextNode.height = Math.max(nextNode.height, minimumSize.minHeight)
  }

  nodeStates.value[id] = nextNode

  nextTick(() => {
    if (remeasure) {
      syncMeasuredNodeSizes()
    }

    updateConnections()
  })
}

const startPan = (event: PointerEvent) => {
  if (event.target instanceof HTMLElement && event.target.closest('[data-node-anchor]')) {
    return
  }

  const origin = {
    x: event.clientX,
    y: event.clientY,
    panX: pan.value.x,
    panY: pan.value.y
  }

  const onMove = (moveEvent: PointerEvent) => {
    pan.value = {
      x: origin.panX + moveEvent.clientX - origin.x,
      y: origin.panY + moveEvent.clientY - origin.y
    }
  }

  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

const startDragNode = (event: PointerEvent, id: string) => {
  event.stopPropagation()
  selectedNodeId.value = id
  const node = nodeStates.value[id]

  if (!node) {
    return
  }

  const origin = {
    x: event.clientX,
    y: event.clientY,
    nodeX: node.x,
    nodeY: node.y
  }

  const onMove = (moveEvent: PointerEvent) => {
    updateNode(id, {
      x: origin.nodeX + (moveEvent.clientX - origin.x) / scale.value,
      y: origin.nodeY + (moveEvent.clientY - origin.y) / scale.value
    }, {
      remeasure: false
    })
  }

  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

const startResizeNode = (event: PointerEvent, id: string) => {
  event.stopPropagation()
  selectedNodeId.value = id
  const node = nodeStates.value[id]

  if (!node) {
    return
  }

  const origin = {
    x: event.clientX,
    y: event.clientY,
    width: node.width,
    height: node.height,
    minWidth: node.minWidth || 200,
    minHeight: node.minHeight || 96
  }

  const onMove = (moveEvent: PointerEvent) => {
    updateNode(id, {
      width: Math.max(origin.minWidth, origin.width + (moveEvent.clientX - origin.x) / scale.value),
      height: Math.max(origin.minHeight, origin.height + (moveEvent.clientY - origin.y) / scale.value)
    })
  }

  const onUp = () => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

const handleWheel = (event: WheelEvent) => {
  event.preventDefault()
  zoomBy(event.deltaY > 0 ? -1 : 1)
}

watch(
  () => model,
  async () => {
    syncNodeStates()
    await nextTick()
    observeCanvasLayout()
    if (syncMeasuredNodeSizes()) {
      await nextTick()
      observeCanvasLayout()
    }
    reflowAutoLayout()
    await nextTick()
    observeCanvasLayout()
    if (syncMeasuredNodeSizes()) {
      await nextTick()
      observeCanvasLayout()
      reflowAutoLayout()
      await nextTick()
      observeCanvasLayout()
    }
    fitView()
    await nextTick()
    observeCanvasLayout()
    updateConnections()
  },
  { deep: true, immediate: true }
)

watch([scale, pan], async () => {
  await nextTick()
  updateConnections()
})

onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    if (syncMeasuredNodeSizes()) {
      reflowAutoLayout()
    }
    updateConnections()
  })

  observeCanvasLayout()

  nextTick(() => {
    observeCanvasLayout()
    if (syncMeasuredNodeSizes()) {
      reflowAutoLayout()
      updateConnections()
    }
    updateConnections()
    requestAnimationFrame(() => {
      observeCanvasLayout()
      if (syncMeasuredNodeSizes()) {
        reflowAutoLayout()
        updateConnections()
      }
      updateConnections()
    })
    window.setTimeout(() => {
      observeCanvasLayout()
      if (syncMeasuredNodeSizes()) {
        reflowAutoLayout()
        updateConnections()
      }
      updateConnections()
    }, 120)
  })
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
})
</script>

<template>
  <div
    ref="viewportRef"
    class="relative h-full min-h-0 select-none overflow-hidden border"
    :style="canvasViewportStyle"
    @pointerdown="startPan"
    @wheel="handleWheel"
  >
    <div
      ref="planeRef"
      class="relative h-[1800px] w-[2600px] origin-top-left"
      :style="{
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`
      }"
    >
      <svg
        class="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 2600 1800"
        preserveAspectRatio="none"
      >
        <path
          v-for="line in connectionLines"
          :key="line.key"
          :d="line.path"
          fill="none"
          :stroke="line.color"
          stroke-width="2"
          :stroke-dasharray="line.dashed ? '10 7' : '0'"
          stroke-linecap="square"
          stroke-linejoin="miter"
          opacity="0.9"
        />
      </svg>

      <div
        v-for="node in canvasNodes"
        :key="node.id"
        :class="[
          'absolute overflow-hidden border select-none',
          node.kind === 'group' ? 'rounded-[2px]' : 'rounded-none',
          selectedNodeId === node.id ? 'ring-1 ring-[color:var(--studio-ring)]' : ''
        ]"
        :style="{
          left: `${node.x}px`,
          top: `${node.y}px`,
          width: `${node.width}px`,
          height: `${node.height}px`,
          borderColor: getNodeBorderColor(node),
          background: getNodeBackground(node)
        }"
        :data-node-anchor="node.id"
        @pointerdown.stop="selectedNodeId = node.id"
      >
        <div
          :data-node-header="node.id"
          class="flex cursor-move items-start justify-between gap-2 border-b border-[color:var(--studio-divider)] px-2.5 py-2"
          @pointerdown="startDragNode($event, node.id)"
        >
          <div class="min-w-0">
            <span
              class="mb-1 inline-flex font-mono text-[0.62rem] uppercase tracking-[0.08em]"
              :style="{ color: getNodeAccentColor(node) }"
            >
              {{ node.kind === 'group' ? 'Table Group' : node.objectKind }}
            </span>
            <h3 class="truncate text-[0.88rem] font-semibold leading-5 tracking-[-0.02em] text-[color:var(--studio-shell-text)]">
              {{ node.title }}
            </h3>
            <p class="truncate text-[0.68rem] text-[color:var(--studio-shell-muted)]">
              {{ node.subtitle }}
            </p>
          </div>

          <span class="inline-flex h-5 items-center border border-[color:var(--studio-rail)] px-1.5 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[color:var(--studio-shell-muted)]">
            {{ node.tableIds.length }} impact
          </span>
        </div>

        <div
          v-if="node.kind === 'group'"
          class="px-2.5 pb-2.5 pt-2"
        >
          <p
            v-if="node.note"
            class="mb-2 text-[0.68rem] leading-5 text-[color:var(--studio-shell-muted)]"
          >
            {{ node.note }}
          </p>

          <div
            :data-group-content="node.id"
            class="grid overflow-visible"
            :style="{
              gridTemplateColumns: `repeat(${node.columnCount || 1}, minmax(0, 1fr))`,
              gap: `${groupTableGap}px`
            }"
          >
            <article
              v-for="table in model.tables.filter((table) => node.tableIds.includes(table.fullName))"
              :key="table.fullName"
              class="rounded-[2px] border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-table-surface)]"
              :data-table-anchor="table.fullName"
            >
              <div class="flex items-start justify-between gap-2 border-b border-[color:var(--studio-divider)] px-2 py-1.5">
                <div class="min-w-0">
                  <h4 class="truncate text-[0.78rem] font-semibold leading-5 text-[color:var(--studio-shell-text)]">
                    {{ table.name }}
                  </h4>
                  <p class="text-[0.62rem] uppercase tracking-[0.06em] text-[color:var(--studio-shell-muted)]">
                    {{ table.schema }} schema
                  </p>
                </div>

                <span class="inline-flex h-5 items-center border border-[color:var(--studio-rail)] px-1.5 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[color:var(--studio-shell-muted)]">
                  {{ table.columns.length }} cols
                </span>
              </div>

              <div class="grid gap-px bg-[color:var(--studio-divider)]">
                <div
                  v-for="column in table.columns"
                  :key="`${table.fullName}.${column.name}`"
                  :data-column-anchor="getColumnAnchorKey(table.fullName, column.name)"
                  class="flex items-start justify-between gap-2 bg-[color:var(--studio-row-surface)] px-2 py-1.5"
                >
                  <div
                    :data-column-label-anchor="getColumnLabelAnchorKey(table.fullName, column.name)"
                    class="min-w-0"
                  >
                    <strong class="block truncate font-mono text-[0.68rem] font-medium text-[color:var(--studio-shell-text)]">{{ column.name }}</strong>
                    <span class="mt-0.5 block truncate text-[0.64rem] text-[color:var(--studio-shell-muted)]">{{ column.type }}</span>
                  </div>
                  <div class="grid max-w-[8.5rem] shrink-0 justify-items-end gap-0.5 text-right">
                    <span
                      v-for="modifier in column.modifiers.slice(0, 2)"
                      :key="modifier"
                      class="inline-flex min-h-[1rem] max-w-full items-center justify-end border border-[color:var(--studio-rail)] px-1 py-0.5 font-mono text-[0.52rem] uppercase leading-[1.15] tracking-[0.04em] whitespace-normal break-all text-[color:var(--studio-shell-muted)]"
                    >
                      {{ modifier }}
                    </span>
                  </div>
                </div>
              </div>
            </article>
          </div>
        </div>

        <div
          v-else
          :data-node-body="node.id"
          class="grid gap-1.5 px-2.5 pb-2.5 pt-2"
        >
          <p
            v-for="detail in node.details"
            :key="detail"
            class="break-words text-[0.68rem] leading-5 text-[color:var(--studio-shell-muted)] [overflow-wrap:anywhere]"
          >
            {{ detail }}
          </p>

          <div class="flex flex-wrap gap-1">
            <span
              v-for="tableId in node.tableIds"
              :key="tableId"
              :data-impact-anchor="getImpactAnchorKey(node.id, tableId)"
              class="inline-flex h-5 items-center border border-[color:var(--studio-rail)] px-1.5 font-mono text-[0.6rem] uppercase tracking-[0.05em] text-[color:var(--studio-shell-muted)]"
            >
              {{ tableId.split('.').at(-1) }}
            </span>
          </div>
        </div>

        <button
          class="absolute bottom-1.5 right-1.5 h-4 w-4 cursor-nwse-resize border-none bg-transparent"
          :style="{
            borderRight: `2px solid ${getNodeAccentColor(node)}`,
            borderBottom: `2px solid ${getNodeAccentColor(node)}`
          }"
          aria-label="Resize node"
          @pointerdown="startResizeNode($event, node.id)"
        />
      </div>
    </div>

    <div class="pointer-events-none absolute inset-x-0 bottom-3 z-[2] flex justify-center">
      <div
        class="pointer-events-auto flex items-center gap-1 border px-1 py-1"
        :style="floatingPanelStyle"
      >
        <UButton
          icon="i-lucide-zoom-out"
          color="neutral"
          variant="ghost"
          size="xs"
          class="rounded-none text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
          @click="zoomBy(-1)"
        />
        <div class="min-w-[52px] text-center font-mono text-[0.7rem] text-[color:var(--studio-shell-text)]">
          {{ Math.round(scale * 100) }}%
        </div>
        <UButton
          icon="i-lucide-zoom-in"
          color="neutral"
          variant="ghost"
          size="xs"
          class="rounded-none text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
          @click="zoomBy(1)"
        />
        <UButton
          label="Reset"
          color="neutral"
          variant="ghost"
          size="xs"
          class="rounded-none text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
          @click="resetView"
        />
      </div>
    </div>

    <aside
      class="absolute right-3 top-3 z-[2] grid max-h-[calc(100%-24px)] w-[182px] gap-1.5 overflow-auto border p-2"
      :style="floatingPanelStyle"
    >
      <div class="font-mono text-[0.6rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
        Inspector
      </div>
      <h3 class="text-[0.82rem] font-semibold leading-5 text-[color:var(--studio-shell-text)]">
        {{ selectedNode?.title || 'Select a shape' }}
      </h3>
      <p class="text-[0.64rem] leading-4 text-[color:var(--studio-shell-muted)]">
        {{ selectedNode ? 'Adjust the selected node.' : 'Select a node.' }}
      </p>

      <div
        v-if="selectedNode"
        class="grid gap-1.5"
      >
        <label class="grid gap-1">
          <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Label</span>
          <input
            :value="selectedNode.title"
            type="text"
            class="w-full select-text border border-[color:var(--studio-rail)] bg-[color:var(--studio-input-bg)] px-2 py-1.5 text-[0.68rem] text-[color:var(--studio-shell-text)] outline-none"
            @input="updateNode(selectedNode.id, { title: ($event.target as HTMLInputElement).value })"
          >
        </label>

        <label class="grid gap-1">
          <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Subtitle</span>
          <input
            :value="selectedNode.subtitle"
            type="text"
            class="w-full select-text border border-[color:var(--studio-rail)] bg-[color:var(--studio-input-bg)] px-2 py-1.5 text-[0.68rem] text-[color:var(--studio-shell-text)] outline-none"
            @input="updateNode(selectedNode.id, { subtitle: ($event.target as HTMLInputElement).value })"
          >
        </label>

        <label class="grid gap-1">
          <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Color</span>
          <input
            :value="selectedNode.color"
            type="color"
            class="h-8 w-full border border-[color:var(--studio-rail)] bg-[color:var(--studio-input-bg)] p-0.5"
            @input="updateNode(selectedNode.id, { color: ($event.target as HTMLInputElement).value })"
          >
        </label>

        <label class="grid gap-1">
          <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Width</span>
          <input
            :value="selectedNode.width"
            type="range"
            :min="selectedNode.minWidth || 200"
            max="640"
            class="w-full"
            @input="updateNode(selectedNode.id, { width: Number(($event.target as HTMLInputElement).value) })"
          >
        </label>

        <label class="grid gap-1">
          <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Height</span>
          <input
            :value="selectedNode.height"
            type="range"
            :min="selectedNode.minHeight || 96"
            max="920"
            class="w-full"
            @input="updateNode(selectedNode.id, { height: Number(($event.target as HTMLInputElement).value) })"
          >
        </label>

        <label
          v-if="selectedNode.kind === 'group'"
          class="grid gap-1"
        >
          <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Table Columns · {{ selectedNode.columnCount || 1 }}</span>
          <input
            :value="selectedNode.columnCount || 1"
            type="range"
            min="1"
            :max="Math.min(4, selectedNode.tableCount || 4)"
            class="w-full"
            @input="updateNode(selectedNode.id, { columnCount: Number(($event.target as HTMLInputElement).value) })"
          >
        </label>
      </div>

      <div
        v-else
        class="text-[0.64rem] leading-4 text-[color:var(--studio-shell-muted)]"
      >
        Drag the canvas or select any schema object.
      </div>
    </aside>
  </div>
</template>
