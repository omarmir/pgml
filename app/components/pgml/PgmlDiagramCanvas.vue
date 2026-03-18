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
const groupTableGap = 8
const groupHorizontalPadding = 20
const groupHeaderHeight = 56
const groupVerticalPadding = 18
const groupNoteHeight = 28
const groupColumnRowHeight = 31
const objectColumnX = 1060
const objectColumnGapX = 320
const objectRowGapY = 180

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

const syncMeasuredGroupSizes = () => {
  let hasChanges = false

  for (const node of canvasNodes.value) {
    if (node.kind !== 'group') {
      continue
    }

    const measuredSize = measureGroupMinimumSize(node.id)

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

const cleanForSearch = (value: string) => value.toLowerCase().replaceAll(/[^\w.]+/g, ' ')

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

const inferSequenceTables = (sequence: PgmlSequence) => {
  const tableIds: string[] = []

  for (const table of model.tables) {
    const usesSequence = table.columns.some((column) => {
      return column.modifiers.some(modifier => modifier.includes(sequence.name))
    })

    if (usesSequence) {
      tableIds.push(table.fullName)
    }
  }

  return tableIds
}

const inferCustomTypeTables = (customType: PgmlCustomType) => {
  return model.tables
    .filter(table => table.columns.some(column => column.type.includes(customType.name)))
    .map(table => table.fullName)
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
        tableIds: [normalizeReference(index.tableName)]
      })
    }

    for (const constraint of table.constraints) {
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
        tableIds: [normalizeReference(constraint.tableName)]
      })
    }
  }

  for (const pgFunction of model.functions) {
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
      tableIds: inferRoutineTables(pgFunction)
    })
  }

  for (const procedure of model.procedures) {
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
      tableIds: inferRoutineTables(procedure)
    })
  }

  for (const trigger of model.triggers) {
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
      tableIds: [normalizeReference(trigger.tableName)]
    })
  }

  for (const sequence of model.sequences) {
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
      tableIds: inferSequenceTables(sequence)
    })
  }

  for (const customType of model.customTypes) {
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
      tableIds: inferCustomTypeTables(customType)
    })
  }

  return nodes
}

const syncNodeStates = () => {
  const nextStates: Record<string, CanvasNodeState> = {}
  const tableGroups = new Map<string, typeof model.tables>()
  const orderedNames: string[] = []

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

    nextStates[`group:${groupName}`] = {
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
    }
  })

  for (const objectNode of buildObjectNodes(nextStates)) {
    const existing = nodeStates.value[objectNode.id]

    nextStates[objectNode.id] = {
      ...objectNode,
      x: existing?.x ?? objectNode.x,
      y: existing?.y ?? objectNode.y,
      width: existing?.width ?? objectNode.width,
      height: existing?.height ?? objectNode.height,
      color: existing?.color || objectNode.color
    }
  }

  nodeStates.value = nextStates

  if (selectedNodeId.value && !nodeStates.value[selectedNodeId.value]) {
    selectedNodeId.value = null
  }
}

const buildPathBetween = (fromElement: HTMLElement, toElement: HTMLElement, color: string, dashed: boolean) => {
  if (!planeRef.value) {
    return null
  }

  const planeBounds = planeRef.value.getBoundingClientRect()
  const fromBounds = fromElement.getBoundingClientRect()
  const toBounds = toElement.getBoundingClientRect()
  const fromGroup = fromElement.closest('[data-node-anchor^="group:"]')
  const toGroup = toElement.closest('[data-node-anchor^="group:"]')
  const fromCenterX = fromBounds.left - planeBounds.left + fromBounds.width / 2
  const fromCenterY = fromBounds.top - planeBounds.top + fromBounds.height / 2
  const toCenterX = toBounds.left - planeBounds.left + toBounds.width / 2
  const toCenterY = toBounds.top - planeBounds.top + toBounds.height / 2
  const deltaX = toCenterX - fromCenterX
  const deltaY = toCenterY - fromCenterY
  const horizontalFirst = Math.abs(deltaX) >= Math.abs(deltaY)
  const offset = 18

  if (fromGroup instanceof HTMLElement && fromGroup === toGroup) {
    const corridorX = (Math.min(fromBounds.left, toBounds.left) - planeBounds.left) / scale.value - offset
    const fromPoint = {
      x: (fromBounds.left - planeBounds.left) / scale.value,
      y: fromCenterY / scale.value
    }
    const toPoint = {
      x: (toBounds.left - planeBounds.left) / scale.value,
      y: toCenterY / scale.value
    }

    return {
      path: [
        `M ${fromPoint.x} ${fromPoint.y}`,
        `L ${corridorX} ${fromPoint.y}`,
        `L ${corridorX} ${toPoint.y}`,
        `L ${toPoint.x} ${toPoint.y}`
      ].join(' '),
      color,
      dashed
    }
  }

  const fromPoint = horizontalFirst
    ? {
        x: (deltaX >= 0 ? fromBounds.right - planeBounds.left : fromBounds.left - planeBounds.left) / scale.value,
        y: fromCenterY / scale.value
      }
    : {
        x: fromCenterX / scale.value,
        y: (deltaY >= 0 ? fromBounds.bottom - planeBounds.top : fromBounds.top - planeBounds.top) / scale.value
      }

  const toPoint = horizontalFirst
    ? {
        x: (deltaX >= 0 ? toBounds.left - planeBounds.left : toBounds.right - planeBounds.left) / scale.value,
        y: toCenterY / scale.value
      }
    : {
        x: toCenterX / scale.value,
        y: (deltaY >= 0 ? toBounds.top - planeBounds.top : toBounds.bottom - planeBounds.top) / scale.value
      }

  const path = horizontalFirst
    ? [
        `M ${fromPoint.x} ${fromPoint.y}`,
        `L ${fromPoint.x + (deltaX >= 0 ? offset : -offset)} ${fromPoint.y}`,
        `L ${toPoint.x + (deltaX >= 0 ? -offset : offset)} ${fromPoint.y}`,
        `L ${toPoint.x + (deltaX >= 0 ? -offset : offset)} ${toPoint.y}`,
        `L ${toPoint.x} ${toPoint.y}`
      ].join(' ')
    : [
        `M ${fromPoint.x} ${fromPoint.y}`,
        `L ${fromPoint.x} ${fromPoint.y + (deltaY >= 0 ? offset : -offset)}`,
        `L ${toPoint.x} ${fromPoint.y + (deltaY >= 0 ? offset : -offset)}`,
        `L ${toPoint.x} ${toPoint.y + (deltaY >= 0 ? -offset : offset)}`,
        `L ${toPoint.x} ${toPoint.y}`
      ].join(' ')

  return {
    path,
    color,
    dashed
  }
}

const updateConnections = () => {
  if (!planeRef.value) {
    return
  }

  const lines: ConnectionLine[] = []

  for (const reference of model.references) {
    const fromElement = planeRef.value.querySelector(`[data-table-anchor="${reference.fromTable}"]`)
    const toElement = planeRef.value.querySelector(`[data-table-anchor="${reference.toTable}"]`)

    if (!(fromElement instanceof HTMLElement) || !(toElement instanceof HTMLElement)) {
      continue
    }

    const result = buildPathBetween(fromElement, toElement, '#79e3ea', false)

    if (!result) {
      continue
    }

    lines.push({
      key: `ref:${reference.fromTable}:${reference.fromColumn}:${reference.toTable}:${reference.toColumn}`,
      path: result.path,
      color: result.color,
      dashed: result.dashed
    })
  }

  for (const node of canvasNodes.value.filter(canvasNode => canvasNode.kind === 'object')) {
    const fromElement = planeRef.value.querySelector(`[data-node-anchor="${node.id}"]`)

    if (!(fromElement instanceof HTMLElement)) {
      continue
    }

    for (const tableId of node.tableIds) {
      const toElement = planeRef.value.querySelector(`[data-table-anchor="${tableId}"]`)

      if (!(toElement instanceof HTMLElement)) {
        continue
      }

      const result = buildPathBetween(fromElement, toElement, node.color, node.kind === 'object')

      if (!result) {
        continue
      }

      lines.push({
        key: `${node.id}->${tableId}`,
        path: result.path,
        color: result.color,
        dashed: result.dashed
      })
    }
  }

  connectionLines.value = lines
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

const updateNode = (id: string, partial: Partial<CanvasNodeState>) => {
  const current = nodeStates.value[id]

  if (!current) {
    return
  }

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
    if (syncMeasuredGroupSizes()) {
      await nextTick()
    }
    fitView()
    await nextTick()
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
    syncMeasuredGroupSizes()
    updateConnections()
  })

  if (viewportRef.value) {
    resizeObserver.observe(viewportRef.value)
  }

  if (planeRef.value) {
    resizeObserver.observe(planeRef.value)
  }

  nextTick(() => {
    if (syncMeasuredGroupSizes()) {
      updateConnections()
    }
    updateConnections()
    requestAnimationFrame(() => {
      if (syncMeasuredGroupSizes()) {
        updateConnections()
      }
      updateConnections()
    })
    window.setTimeout(() => {
      if (syncMeasuredGroupSizes()) {
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
    class="relative h-full min-h-0 select-none overflow-hidden border border-white/8 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[length:18px_18px] bg-[#07131b]"
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
          'absolute overflow-hidden border bg-[#08141d] select-none',
          node.kind === 'group' ? 'rounded-[2px]' : 'rounded-none',
          selectedNodeId === node.id ? 'ring-1 ring-white/25' : ''
        ]"
        :style="{
          left: `${node.x}px`,
          top: `${node.y}px`,
          width: `${node.width}px`,
          height: `${node.height}px`,
          borderColor: `color-mix(in srgb, ${node.color} 68%, white 10%)`,
          background: `linear-gradient(180deg, color-mix(in srgb, ${node.color} 10%, transparent), rgba(8, 20, 29, 0.98) 18%), rgba(8, 20, 29, 0.98)`
        }"
        :data-node-anchor="node.id"
        @pointerdown.stop="selectedNodeId = node.id"
      >
        <div
          :data-node-header="node.id"
          class="flex cursor-move items-start justify-between gap-2 border-b border-white/6 px-2.5 py-2"
          @pointerdown="startDragNode($event, node.id)"
        >
          <div class="min-w-0">
            <span
              class="mb-1 inline-flex font-mono text-[0.62rem] uppercase tracking-[0.08em]"
              :style="{ color: `color-mix(in srgb, ${node.color} 70%, white 18%)` }"
            >
              {{ node.kind === 'group' ? 'Table Group' : node.objectKind }}
            </span>
            <h3 class="truncate text-[0.88rem] font-semibold leading-5 tracking-[-0.02em] text-slate-100">
              {{ node.title }}
            </h3>
            <p class="truncate text-[0.68rem] text-slate-400">
              {{ node.subtitle }}
            </p>
          </div>

          <span class="inline-flex h-5 items-center border border-white/10 px-1.5 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-slate-300">
            {{ node.tableIds.length }} impact
          </span>
        </div>

        <div
          v-if="node.kind === 'group'"
          class="px-2.5 pb-2.5 pt-2"
        >
          <p
            v-if="node.note"
            class="mb-2 text-[0.68rem] leading-5 text-slate-400"
          >
            {{ node.note }}
          </p>

          <div
            :data-group-content="node.id"
            class="grid gap-2 overflow-visible"
            :style="{ gridTemplateColumns: `repeat(${node.columnCount || 1}, minmax(0, 1fr))` }"
          >
            <article
              v-for="table in model.tables.filter((table) => node.tableIds.includes(table.fullName))"
              :key="table.fullName"
              class="rounded-[2px] border border-white/8 bg-white/[0.02]"
              :data-table-anchor="table.fullName"
            >
              <div class="flex items-start justify-between gap-2 border-b border-white/6 px-2 py-1.5">
                <div class="min-w-0">
                  <h4 class="truncate text-[0.78rem] font-semibold leading-5 text-slate-100">
                    {{ table.name }}
                  </h4>
                  <p class="text-[0.62rem] uppercase tracking-[0.06em] text-slate-500">
                    {{ table.schema }} schema
                  </p>
                </div>

                <span class="inline-flex h-5 items-center border border-white/10 px-1.5 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-slate-300">
                  {{ table.columns.length }} cols
                </span>
              </div>

              <div class="grid gap-px bg-white/6">
                <div
                  v-for="column in table.columns"
                  :key="`${table.fullName}.${column.name}`"
                  class="flex items-start justify-between gap-2 bg-[#07131b] px-2 py-1.5"
                >
                  <div class="min-w-0">
                    <strong class="block truncate font-mono text-[0.68rem] font-medium text-slate-100">{{ column.name }}</strong>
                    <span class="mt-0.5 block truncate text-[0.64rem] text-slate-400">{{ column.type }}</span>
                  </div>
                  <div class="flex shrink-0 flex-wrap justify-end gap-1">
                    <span
                      v-for="modifier in column.modifiers.slice(0, 2)"
                      :key="modifier"
                      class="inline-flex h-4 items-center border border-white/10 px-1 font-mono uppercase tracking-[0.05em] text-slate-400"
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
          class="grid gap-1.5 px-2.5 pb-2.5 pt-2"
        >
          <p
            v-for="detail in node.details.slice(0, 3)"
            :key="detail"
            class="text-[0.68rem] leading-5 text-slate-400"
          >
            {{ detail }}
          </p>

          <div class="flex flex-wrap gap-1">
            <span
              v-for="tableId in node.tableIds.slice(0, 4)"
              :key="tableId"
              class="inline-flex h-5 items-center border border-white/10 px-1.5 font-mono text-[0.6rem] uppercase tracking-[0.05em] text-slate-300"
            >
              {{ tableId.split('.').at(-1) }}
            </span>
          </div>
        </div>

        <button
          class="absolute bottom-1.5 right-1.5 h-4 w-4 cursor-nwse-resize border-none bg-transparent"
          :style="{
            borderRight: `2px solid color-mix(in srgb, ${node.color} 80%, white 10%)`,
            borderBottom: `2px solid color-mix(in srgb, ${node.color} 80%, white 10%)`
          }"
          aria-label="Resize node"
          @pointerdown="startResizeNode($event, node.id)"
        />
      </div>
    </div>

    <div class="pointer-events-none absolute inset-x-0 bottom-3 z-[2] flex justify-center">
      <div class="pointer-events-auto flex items-center gap-1 border border-white/8 bg-[#08141d] px-1 py-1">
        <UButton
          icon="i-lucide-zoom-out"
          color="neutral"
          variant="ghost"
          size="xs"
          class="rounded-none"
          @click="zoomBy(-1)"
        />
        <div class="min-w-[52px] text-center font-mono text-[0.7rem] text-slate-100">
          {{ Math.round(scale * 100) }}%
        </div>
        <UButton
          icon="i-lucide-zoom-in"
          color="neutral"
          variant="ghost"
          size="xs"
          class="rounded-none"
          @click="zoomBy(1)"
        />
        <UButton
          label="Reset"
          color="neutral"
          variant="ghost"
          size="xs"
          class="rounded-none"
          @click="resetView"
        />
      </div>
    </div>

    <aside class="absolute right-3 top-3 z-[2] grid max-h-[calc(100%-24px)] w-[182px] gap-1.5 overflow-auto border border-white/8 bg-[#08141d] p-2">
      <div class="font-mono text-[0.6rem] uppercase tracking-[0.08em] text-cyan-300">
        Inspector
      </div>
      <h3 class="text-[0.82rem] font-semibold leading-5 text-slate-100">
        {{ selectedNode?.title || 'Select a shape' }}
      </h3>
      <p class="text-[0.64rem] leading-4 text-slate-400">
        {{ selectedNode ? 'Adjust the selected node.' : 'Select a node.' }}
      </p>

      <div
        v-if="selectedNode"
        class="grid gap-1.5"
      >
        <label class="grid gap-1">
          <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-cyan-300">Label</span>
          <input
            :value="selectedNode.title"
            type="text"
            class="w-full select-text border border-white/10 bg-white/5 px-2 py-1.5 text-[0.68rem] text-slate-100 outline-none"
            @input="updateNode(selectedNode.id, { title: ($event.target as HTMLInputElement).value })"
          >
        </label>

        <label class="grid gap-1">
          <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-cyan-300">Subtitle</span>
          <input
            :value="selectedNode.subtitle"
            type="text"
            class="w-full select-text border border-white/10 bg-white/5 px-2 py-1.5 text-[0.68rem] text-slate-100 outline-none"
            @input="updateNode(selectedNode.id, { subtitle: ($event.target as HTMLInputElement).value })"
          >
        </label>

        <label class="grid gap-1">
          <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-cyan-300">Color</span>
          <input
            :value="selectedNode.color"
            type="color"
            class="h-8 w-full border border-white/10 bg-white/5 p-0.5"
            @input="updateNode(selectedNode.id, { color: ($event.target as HTMLInputElement).value })"
          >
        </label>

        <label class="grid gap-1">
          <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-cyan-300">Width</span>
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
          <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-cyan-300">Height</span>
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
          <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-cyan-300">Table Columns · {{ selectedNode.columnCount || 1 }}</span>
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
        class="text-[0.64rem] leading-4 text-slate-500"
      >
        Drag the canvas or select any schema object.
      </div>
    </aside>
  </div>
</template>
