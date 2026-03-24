<script setup lang="ts">
import { useClipboard, useResizeObserver, useTimeoutFn } from '@vueuse/core'
import type { CSSProperties } from 'vue'
import { studioSelectUi, studioSwitchUi } from '~/constants/ui'
import type {
  PgmlCustomType,
  PgmlNodeProperties,
  PgmlRoutine,
  PgmlSchemaModel,
  PgmlSequence,
  PgmlSourceRange
} from '~/utils/pgml'
import { getOrderedGroupTables } from '~/utils/pgml'
import { getRasterExportPlan } from '~/utils/diagram-export'
import {
  buildPgmlExportBundle,
  defaultPgmlExportPreferences,
  type PgmlExportArtifact,
  type PgmlExportFormat,
  type PgmlExportPreferences,
  type PgmlKyselyTypeStyle
} from '~/utils/pgml-export'
import { readPgmlExportPreferences, writePgmlExportPreferences } from '~/utils/pgml-export-preferences'
import {
  getDiagramConnectionZIndex,
  getDiagramGroupBackgroundZIndex,
  getDiagramNodeZIndex
} from '~/utils/diagram-layering'
import {
  buildOrthogonalMiddlePoints,
  diagramVerticalLaneShiftPattern,
  type DiagramRect,
  type DiagramVerticalLaneReservation,
  getDiagramVerticalLaneCandidateXs,
  getFieldRowAnchorRatios,
  getHeaderSafeGroupLaneSide,
  hasDiagramVerticalLaneOverlap,
  isDiagramVerticalLaneBlockedByRects,
  isHorizontalDiagramSide,
  pickDiagramAnchorSlot
} from '~/utils/diagram-routing'
import {
  getDiagramPinchViewportTransform,
  getDiagramTouchGesture,
  type DiagramTouchGesture,
  type DiagramTouchPoint
} from '~/utils/diagram-touch'
import { normalizeSvgColor, normalizeSvgPaint, parseCssLinearGradient } from '~/utils/svg-paint'
import type {
  TableAttachment,
  TableAttachmentFlag,
  TableAttachmentKind,
  TableGroupMasonryLayout,
  TableRow
} from '~/utils/pgml-diagram-canvas'
import { buildTableGroupMasonryLayout } from '~/utils/pgml-diagram-canvas'
import {
  getStudioChoiceButtonClass,
  getStudioStateButtonClass,
  getStudioTabButtonClass,
  joinStudioClasses,
  studioButtonClasses,
  studioColorInputClass,
  studioCompactInputClass,
  studioToolbarButtonClass
} from '~/utils/uiStyles'
import type {
  DiagramPanelTab,
  StudioMobileCanvasView
} from '~/utils/studio-workspace'

const {
  exportBaseName = 'pgml-schema',
  exportPreferenceKey = 'name:pgml-schema',
  hasBlockingSourceErrors = false,
  mobileActiveView = null,
  mobilePanelTab = null,
  model,
  viewportResetKey = 0
} = defineProps<{
  exportBaseName?: string
  exportPreferenceKey?: string
  hasBlockingSourceErrors?: boolean
  mobileActiveView?: StudioMobileCanvasView | null
  mobilePanelTab?: DiagramPanelTab | null
  model: PgmlSchemaModel
  viewportResetKey?: number
}>()
const emit = defineEmits<{
  createTable: [groupName: string | null]
  createGroup: []
  editGroup: [groupName: string]
  editTable: [tableId: string]
  focusSource: [sourceRange: PgmlSourceRange]
  nodePropertiesChange: [properties: Record<string, PgmlNodeProperties>]
  panelTabChange: [tab: DiagramPanelTab]
}>()
const toast = useToast()
const { startPointerSession } = useWindowPointerSession()
const {
  copy: copyToClipboard,
  isSupported: isClipboardSupported
} = useClipboard({
  copiedDuring: 1400,
  legacy: true
})

type CanvasNodeKind = 'group' | 'table' | 'object'
type ObjectKind = 'Index' | 'Constraint' | 'Function' | 'Procedure' | 'Trigger' | 'Sequence' | 'Custom Type'
type ImpactTarget = {
  tableId: string
  columnName: string | null
}

type CanvasNodeState = {
  id: string
  kind: CanvasNodeKind
  objectKind?: ObjectKind
  collapsed: boolean
  masonry?: boolean
  title: string
  subtitle: string
  details: string[]
  x: number
  y: number
  width: number
  height: number
  expandedHeight?: number
  color: string
  tableIds: string[]
  impactTargets?: ImpactTarget[]
  tableCount?: number
  columnCount?: number
  note?: string | null
  minWidth?: number
  minHeight?: number
  hasStoredLayout?: boolean
  sourceRange?: PgmlSourceRange
}

type ConnectionLine = {
  key: string
  path: string
  color: string
  dashed: boolean
  dashPattern: string
  animated: boolean
  zIndex: number
}

type CanvasSelection = {
  kind: 'node'
  id: string
} | {
  kind: 'table'
  tableId: string
} | {
  kind: 'attachment'
  tableId: string
  attachmentId: string
}
type EntityBrowserItemKind = 'group' | 'table' | 'column' | 'attachment' | 'object'

type EntityBrowserItem = {
  id: string
  kind: EntityBrowserItemKind
  label: string
  subtitle: string
  kindLabel: string
  searchText: string
  children: EntityBrowserItem[]
  selection: CanvasSelection
  sourceRange?: PgmlSourceRange
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

type ExportCopyFeedbackStatus = 'success' | 'error'

type TouchPanSession = {
  clientX: number
  clientY: number
  panX: number
  panY: number
  touchId: number
}

type TouchPinchSession = {
  initialCenter: DiagramTouchPoint
  initialDistance: number
  initialPan: DiagramTouchPoint
  initialScale: number
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

type DiagramExportFormat = 'svg' | 'png'

const planeRef: Ref<HTMLDivElement | null> = ref(null)
const viewportRef: Ref<HTMLDivElement | null> = ref(null)
const scale: Ref<number> = ref(0.62)
const pan: Ref<{ x: number, y: number }> = ref({
  x: 30,
  y: 36
})
const snapToGrid: Ref<boolean> = ref(true)
const selectedNodeId: Ref<string | null> = ref(null)
const selectedCanvasSelection: Ref<CanvasSelection | null> = ref(null)
const nodeStates: Ref<Record<string, CanvasNodeState>> = ref({})
const connectionLines: Ref<ConnectionLine[]> = ref([])
const isDesktopSidePanelOpen: Ref<boolean> = ref(true)
const activePanelTab: Ref<DiagramPanelTab> = ref('inspector')
const touchPanSession: Ref<TouchPanSession | null> = ref(null)
const touchPinchSession: Ref<TouchPinchSession | null> = ref(null)
const entitySearchQuery: Ref<string> = ref('')
const exportPreferences: Ref<PgmlExportPreferences> = ref({
  ...defaultPgmlExportPreferences
})
const exportCopyFeedback: Ref<{ key: string | null, status: ExportCopyFeedbackStatus | null }> = ref({
  key: null,
  status: null
})
const resetExportCopyFeedback = () => {
  exportCopyFeedback.value = {
    key: null,
    status: null
  }
}
const { start: scheduleExportCopyFeedbackReset, stop: stopExportCopyFeedbackReset } = useTimeoutFn(resetExportCopyFeedback, 1800, {
  immediate: false
})
const exportTypeStyleItems = [
  {
    label: 'Pragmatic app types',
    value: 'pragmatic'
  },
  {
    label: 'Driver-safe strict types',
    value: 'strict'
  },
  {
    label: 'Minimal loose types',
    value: 'loose'
  }
] satisfies Array<{ label: string, value: PgmlKyselyTypeStyle }>

const palette = ['#8b5cf6', '#f59e0b', '#06b6d4', '#10b981', '#ef4444', '#ec4899', '#f97316']
const schemaBadgePalette = ['#0f766e', '#f59e0b', '#2563eb', '#dc2626', '#7c3aed', '#0891b2', '#ea580c', '#65a30d']
const groupTableWidth = 232
const groupTableGap = 16
const groupHorizontalPadding = 20
const groupHeaderHeight = 56
const groupVerticalPadding = 18
const groupColumnRowHeight = 31
const objectColumnX = 1060
const objectColumnGapX = 320
const objectRowGapY = 180
const minCanvasScale = 0.28
const maxCanvasScale = 1.3
const zoomStep = 0.08
const gridSize = 18
const groupLaneOuterBaseOffset = 16
const groupLaneOuterGap = 10
const groupLaneInnerBaseOffset = 12
const groupLaneInnerGap = 8
const groupLaneInnerBorderClearance = 10
const groupHeaderLaneClearance = 10
const layoutPadding = 88
const exportPadding = 96
const collapsedObjectHeight = 56
const verticalSegmentKeyScale = 2
const triggerCallFlagColor = '#38bdf8'
const attachmentPopoverContent = {
  side: 'right' as const,
  align: 'start' as const,
  sideOffset: 10,
  collisionPadding: 16
}
const attachmentPopoverUi = {
  content: 'w-[22rem] rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] p-3 shadow-[var(--studio-floating-shadow)] backdrop-blur-sm'
}
const exportArtifactButtonErrorClass = 'border-[color:var(--studio-shell-error)] bg-[color:var(--studio-shell-error)]/8 text-[color:var(--studio-shell-error)] hover:bg-[color:var(--studio-shell-error)]/12 hover:text-[color:var(--studio-shell-error)]'
const panelToggleButtonClass = joinStudioClasses(studioButtonClasses.secondary, studioToolbarButtonClass)
const sidePanelCloseButtonClass = joinStudioClasses(studioButtonClasses.iconGhost, 'h-7 w-7 justify-center px-0')
const sidePanelActionButtonClass = joinStudioClasses(studioButtonClasses.secondary, studioToolbarButtonClass)
const attachmentKindOrder: Record<TableAttachmentKind, number> = {
  Index: 0,
  Constraint: 1,
  Trigger: 2,
  Function: 3,
  Procedure: 4,
  Sequence: 5
}
const attachmentKindColors: Record<TableAttachmentKind, string> = {
  Index: '#38bdf8',
  Constraint: '#fb7185',
  Function: '#c084fc',
  Procedure: '#f97316',
  Trigger: '#22c55e',
  Sequence: '#eab308'
}
let suppressLayoutObserverUntil = 0
let previousViewportResetKey: number | null = null

const canvasNodes = computed(() => Object.values(nodeStates.value))
const isMobileCanvasShell = computed(() => mobileActiveView !== null)
const isMobilePanelView = computed(() => mobileActiveView === 'panel')
const isDiagramPanelVisible = computed(() => {
  if (isMobileCanvasShell.value) {
    return isMobilePanelView.value
  }

  return isDesktopSidePanelOpen.value
})
const isEntityDirectlyVisible = (id: string) => model.nodeProperties[id]?.visible !== false
const getStoredGroupId = (groupName: string) => `group:${groupName}`
const getTableGroupName = (table: PgmlSchemaModel['tables'][number]) => table.groupName || null
const isGroupDirectlyVisible = (groupName: string) => isEntityDirectlyVisible(getStoredGroupId(groupName))
const isTableEffectivelyVisible = (table: PgmlSchemaModel['tables'][number]) => {
  const groupName = getTableGroupName(table)

  return isEntityDirectlyVisible(table.fullName) && (!groupName || isGroupDirectlyVisible(groupName))
}
const isAttachmentEffectivelyVisible = (tableId: string, attachmentId: string) => {
  const table = model.tables.find(entry => entry.fullName === tableId)

  if (!table) {
    return false
  }

  return isTableEffectivelyVisible(table) && isEntityDirectlyVisible(attachmentId)
}
const visibleTables = computed(() => {
  return model.tables.filter(table => isTableEffectivelyVisible(table))
})
const orderedTablesByGroup = computed(() => {
  return model.groups.reduce<Record<string, PgmlSchemaModel['tables']>>((entries, group) => {
    entries[group.name] = getOrderedGroupTables(model, group.name)
    return entries
  }, {})
})
const getGroupTables = (groupName: string) => orderedTablesByGroup.value[groupName] || []
const tableGroupColorByTableId = computed(() => {
  return model.tables.reduce<Record<string, string>>((colors, table) => {
    const groupName = getTableGroupName(table)

    if (!groupName) {
      const tableNode = nodeStates.value[table.fullName]

      if (tableNode?.color) {
        colors[table.fullName] = tableNode.color
      }

      return colors
    }

    const groupNode = nodeStates.value[`group:${groupName}`]

    if (groupNode?.color) {
      colors[table.fullName] = groupNode.color
    }

    return colors
  }, {})
})
const hashSchemaName = (schemaName: string) => {
  let hash = 0

  for (const character of schemaName) {
    hash = ((hash << 5) - hash) + character.charCodeAt(0)
    hash |= 0
  }

  return Math.abs(hash)
}
const schemaBadgeColorBySchema = computed(() => {
  const colors: Record<string, string> = {}

  model.schemas.forEach((schemaName) => {
    const normalizedSchemaName = schemaName.trim()

    if (normalizedSchemaName.length === 0) {
      return
    }

    colors[normalizedSchemaName] = schemaBadgePalette[hashSchemaName(normalizedSchemaName) % schemaBadgePalette.length] || '#0f766e'
  })

  colors.public ||= schemaBadgePalette[hashSchemaName('public') % schemaBadgePalette.length] || '#0f766e'

  return colors
})
const getSchemaBadgeColor = (schemaName: string) => {
  return schemaBadgeColorBySchema.value[schemaName] || schemaBadgePalette[hashSchemaName(schemaName) % schemaBadgePalette.length] || '#0f766e'
}
const getSchemaBadgeStyle = (schemaName: string) => {
  const color = getSchemaBadgeColor(schemaName)

  return {
    borderColor: `color-mix(in srgb, ${color} 58%, var(--studio-rail) 42%)`,
    backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
    color: `color-mix(in srgb, ${color} 72%, var(--studio-shell-text) 28%)`
  }
}
const getTableSchemaName = (tableId: string) => {
  return model.tables.find(table => table.fullName === tableId)?.schema || 'public'
}
const nodeLayerOrderById = computed(() => {
  return canvasNodes.value.reduce<Record<string, number>>((orders, node, index) => {
    orders[node.id] = index + 1
    return orders
  }, {})
})
const getNodeLayerOrder = (nodeId: string) => {
  return nodeLayerOrderById.value[nodeId] || 1
}
const getGroupBackgroundLayerZIndex = (nodeId: string) => {
  return getDiagramGroupBackgroundZIndex(getNodeLayerOrder(nodeId))
}
const getNodeForegroundLayerZIndex = (nodeId: string) => {
  return getDiagramNodeZIndex(getNodeLayerOrder(nodeId))
}
const connectionLineLayers = computed(() => {
  const layers = connectionLines.value.reduce<Record<string, ConnectionLine[]>>((entries, line) => {
    const key = String(line.zIndex)

    if (!entries[key]) {
      entries[key] = []
    }

    entries[key]?.push(line)
    return entries
  }, {})

  return Object.entries(layers)
    .map(([key, lines]) => ({
      zIndex: Number.parseInt(key, 10),
      lines
    }))
    .sort((left, right) => left.zIndex - right.zIndex)
})
const hasEmbeddedLayout = computed(() => Object.keys(model.nodeProperties).length > 0)
const selectedNode = computed(() => {
  if (!selectedNodeId.value) {
    return null
  }

  return nodeStates.value[selectedNodeId.value] || null
})
const selectedTable = computed(() => {
  const selection = selectedCanvasSelection.value

  if (selection?.kind !== 'table') {
    return null
  }

  return model.tables.find(table => table.fullName === selection.tableId) || null
})
const selectedAttachment = computed(() => {
  const selection = selectedCanvasSelection.value

  if (selection?.kind !== 'attachment') {
    return null
  }

  const attachments = tableAttachmentState.value.attachmentsByTableId[selection.tableId] || []

  return attachments.find(attachment => attachment.id === selection.attachmentId) || null
})
const selectedCanvasEntityTitle = computed(() => {
  if (selectedNode.value) {
    return selectedNode.value.title
  }

  if (selectedTable.value) {
    return selectedTable.value.name
  }

  if (selectedAttachment.value) {
    return selectedAttachment.value.title
  }

  return 'Select a shape'
})
const selectedCanvasEntityDescription = computed(() => {
  if (selectedNode.value) {
    return 'Adjust the selected node.'
  }

  if (selectedTable.value) {
    return `${selectedTable.value.schema} schema table.`
  }

  if (selectedAttachment.value) {
    return `${selectedAttachment.value.kind} on ${selectedAttachment.value.tableId}.`
  }

  return 'Select a node.'
})
const exportBundle = computed(() => {
  if (hasBlockingSourceErrors) {
    return null
  }

  return buildPgmlExportBundle(model, {
    baseName: exportBaseName,
    kyselyTypeStyle: exportPreferences.value.kyselyTypeStyle
  })
})
const activeExportArtifacts = computed(() => {
  if (!exportBundle.value) {
    return [] as Array<PgmlExportArtifact & { key: string }>
  }

  if (exportPreferences.value.format === 'sql') {
    return [
      {
        ...exportBundle.value.sql.migration,
        key: 'sql:migration'
      },
      {
        ...exportBundle.value.sql.ddl,
        key: 'sql:ddl'
      }
    ]
  }

  return [
    {
      ...exportBundle.value.kysely.migration,
      key: 'kysely:migration'
    },
    {
      ...exportBundle.value.kysely.interfaces,
      key: 'kysely:interfaces'
    }
  ]
})
const activeExportWarnings = computed(() => {
  return Array.from(new Set(activeExportArtifacts.value.flatMap(artifact => artifact.warnings)))
})
const diagramPanelTitle = computed(() => {
  if (activePanelTab.value === 'inspector') {
    return selectedCanvasEntityTitle.value
  }

  if (activePanelTab.value === 'export') {
    return exportPreferences.value.format === 'sql' ? 'SQL Export' : 'Kysely Export'
  }

  return 'Entities'
})
const diagramPanelDescription = computed(() => {
  if (activePanelTab.value === 'inspector') {
    return selectedCanvasEntityDescription.value
  }

  if (activePanelTab.value === 'export') {
    if (hasBlockingSourceErrors) {
      return 'Fix PGML parse errors before exporting migration files.'
    }

    return exportPreferences.value.format === 'sql'
      ? 'Preview migration SQL and raw DDL from the current PGML snapshot.'
      : 'Preview a Kysely migration plus generated database interfaces from the current PGML snapshot.'
  }

  return `${hiddenEntityCount.value} hidden in saved properties.`
})
const diagramPanelSurfaceClass = computed(() => {
  return isMobilePanelView.value
    ? 'absolute inset-0 z-[2] grid min-h-0 w-full grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden'
    : 'absolute bottom-3 right-3 top-14 z-[2] grid w-[320px] grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden border max-[900px]:left-3 max-[900px]:w-auto'
})
const shouldShowDiagramPanelToggle = computed(() => !isMobileCanvasShell.value)
const shouldShowZoomToolbar = computed(() => !isMobilePanelView.value)
const selectedTableOutgoingReferences = computed(() => {
  if (!selectedTable.value) {
    return []
  }

  return model.references.filter((reference) => {
    return reference.fromTable === selectedTable.value?.fullName && reference.toTable !== selectedTable.value?.fullName
  })
})
const selectedTableRelationalRowKeys = computed(() => {
  return new Set(selectedTableOutgoingReferences.value.map((reference) => {
    return getColumnAnchorKey(reference.toTable, reference.toColumn)
  }))
})
const selectedObjectImpactTargets = computed(() => {
  if (!selectedNode.value || selectedNode.value.kind !== 'object') {
    return []
  }

  return selectedNode.value.impactTargets?.length
    ? selectedNode.value.impactTargets
    : selectedNode.value.tableIds.map(tableId => ({
        tableId,
        columnName: null
      }))
})
const selectedObjectImpactRowKeys = computed(() => {
  return new Set(selectedObjectImpactTargets.value.flatMap((impactTarget) => {
    if (!impactTarget.columnName) {
      return []
    }

    return [getColumnAnchorKey(impactTarget.tableId, impactTarget.columnName)]
  }))
})
const isCollapsibleNode = (node: CanvasNodeState) => node.kind === 'object'
const measuredGroupTableHeights: Ref<Record<string, number>> = ref({})
const tablesByGroup = computed(() => {
  return model.groups.reduce<Record<string, PgmlSchemaModel['tables']>>((entries, group) => {
    entries[group.name] = getGroupTables(group.name).filter(table => isTableEffectivelyVisible(table))
    return entries
  }, {})
})
const tableGroupById = computed(() => {
  const groups: Record<string, string | null> = {}

  for (const table of model.tables) {
    groups[table.fullName] = getTableGroupName(table)
  }

  return groups
})
const knownTableIds = computed(() => new Set(model.tables.map(table => table.fullName)))

const estimateTableHeight = (rowCount: number) => {
  return 40 + rowCount * groupColumnRowHeight
}

const getGroupSafeColumnCount = (columnCount: number, tableCount: number) => {
  return Math.max(1, Math.min(Math.round(columnCount), Math.max(tableCount, 1)))
}

const getRenderedGroupTables = (groupName: string) => {
  return tablesByGroup.value[groupName] || []
}

const getGroupTableRenderHeight = (tableId: string) => {
  return measuredGroupTableHeights.value[tableId] || estimateTableHeight(getTableRows(tableId).length)
}

const getGroupNodeColumnCount = (groupName: string) => {
  const groupId = getStoredGroupId(groupName)
  const tableCount = getRenderedGroupTables(groupName).length
  const columnCount = nodeStates.value[groupId]?.columnCount
    ?? model.nodeProperties[groupId]?.tableColumns
    ?? 1

  return getGroupSafeColumnCount(columnCount, tableCount)
}

const groupTableLayouts = computed<Record<string, TableGroupMasonryLayout>>(() => {
  return model.groups.reduce<Record<string, TableGroupMasonryLayout>>((entries, group) => {
    entries[group.name] = buildTableGroupMasonryLayout(
      getRenderedGroupTables(group.name).map(table => ({
        id: table.fullName,
        height: getGroupTableRenderHeight(table.fullName)
      })),
      getGroupNodeColumnCount(group.name),
      groupTableWidth,
      groupTableGap
    )
    return entries
  }, {})
})

const getGroupTableLayout = (groupName: string) => {
  return groupTableLayouts.value[groupName]
    || buildTableGroupMasonryLayout([], 1, groupTableWidth, groupTableGap)
}

const getGroupContentStyle = (node: CanvasNodeState): CSSProperties => {
  if (node.kind !== 'group' || !node.masonry) {
    return {
      gap: `${groupTableGap}px`,
      gridTemplateColumns: `repeat(${node.columnCount || 1}, ${groupTableWidth}px)`
    }
  }

  const layout = getGroupTableLayout(node.title)

  return {
    height: `${layout.contentHeight}px`,
    position: 'relative',
    width: `${layout.contentWidth}px`
  }
}

const getGroupTableLayoutStyle = (node: CanvasNodeState, tableId: string): CSSProperties => {
  if (node.kind !== 'group' || !node.masonry) {
    return {
      width: `${groupTableWidth}px`
    }
  }

  const placement = getGroupTableLayout(node.title).placements[tableId]

  return {
    left: `${placement?.x || 0}px`,
    position: 'absolute',
    top: `${placement?.y || 0}px`,
    width: `${groupTableWidth}px`
  }
}

const getGroupMinimumSize = (groupName: string, columnCount: number, masonry = false) => {
  const tables = getRenderedGroupTables(groupName)
  const safeColumnCount = getGroupSafeColumnCount(columnCount, tables.length)

  if (masonry) {
    const layout = buildTableGroupMasonryLayout(
      tables.map(table => ({
        id: table.fullName,
        height: getGroupTableRenderHeight(table.fullName)
      })),
      safeColumnCount,
      groupTableWidth,
      groupTableGap
    )

    return {
      minWidth: groupHorizontalPadding * 2 + layout.contentWidth,
      minHeight: groupHeaderHeight + groupVerticalPadding + layout.contentHeight
    }
  }

  const rowHeights: number[] = []

  tables.forEach((table, index) => {
    const rowIndex = Math.floor(index / safeColumnCount)
    const tableHeight = getGroupTableRenderHeight(table.fullName)
    rowHeights[rowIndex] = Math.max(rowHeights[rowIndex] || 0, tableHeight)
  })

  const contentHeight = rowHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, rowHeights.length - 1) * groupTableGap

  return {
    minWidth: groupHorizontalPadding * 2 + safeColumnCount * groupTableWidth + Math.max(0, safeColumnCount - 1) * groupTableGap,
    minHeight: groupHeaderHeight + groupVerticalPadding + contentHeight
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

const waitForAnimationFrame = () => {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

const waitForCanvasRender = async () => {
  await nextTick()
  updateConnections()
  await nextTick()
  await waitForAnimationFrame()

  updateConnections()
}

const escapeXml = (value: string) => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&apos;')
}

const getPlaneRelativeRect = (element: Element) => {
  if (!(planeRef.value instanceof HTMLDivElement)) {
    return null
  }

  const planeBounds = planeRef.value.getBoundingClientRect()
  const elementBounds = element.getBoundingClientRect()

  return {
    x: (elementBounds.left - planeBounds.left) / scale.value,
    y: (elementBounds.top - planeBounds.top) / scale.value,
    width: elementBounds.width / scale.value,
    height: elementBounds.height / scale.value
  }
}

const readStudioToken = (token: string, fallback: string) => {
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(token).trim()

  return value.length > 0 ? value : fallback
}

const resolveComputedCssColor = (
  property: 'backgroundColor' | 'borderColor' | 'color',
  value: string,
  fallback: string
) => {
  const probeElement = document.createElement('span')
  probeElement.style.position = 'absolute'
  probeElement.style.pointerEvents = 'none'
  probeElement.style.opacity = '0'
  probeElement.style[property] = value
  document.body.append(probeElement)

  const resolvedValue = window.getComputedStyle(probeElement)[property]
  probeElement.remove()

  return normalizeSvgColor(resolvedValue, fallback)
}

const translatePathData = (path: string, offsetX: number, offsetY: number) => {
  return path.replace(/([ML])\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g, (_match, command, xValue, yValue) => {
    const nextX = Number.parseFloat(xValue) + offsetX
    const nextY = Number.parseFloat(yValue) + offsetY

    return `${command} ${nextX} ${nextY}`
  })
}

const chunkLongWord = (value: string, maxCharacters: number) => {
  const chunks: string[] = []
  let index = 0

  while (index < value.length) {
    chunks.push(value.slice(index, index + maxCharacters))
    index += maxCharacters
  }

  return chunks
}

const wrapSvgText = (
  value: string,
  maxWidth: number,
  fontSize: number,
  mono = false,
  preserveWhitespace = false
) => {
  const normalizedValue = preserveWhitespace
    ? value.replaceAll('\t', '  ').replaceAll('\r', '')
    : value.trim()

  if (normalizedValue.length === 0) {
    return ['']
  }

  const averageCharacterWidth = fontSize * (mono ? 0.62 : 0.56)
  const maxCharacters = Math.max(8, Math.floor(maxWidth / averageCharacterWidth))

  if (preserveWhitespace) {
    return chunkLongWord(normalizedValue, maxCharacters)
  }

  const words = normalizedValue.split(/\s+/)
  const lines: string[] = []
  let currentLine = ''

  for (const word of words) {
    if (word.length > maxCharacters) {
      if (currentLine.length > 0) {
        lines.push(currentLine)
        currentLine = ''
      }

      lines.push(...chunkLongWord(word, maxCharacters))
      continue
    }

    const nextLine = currentLine.length > 0 ? `${currentLine} ${word}` : word

    if (nextLine.length > maxCharacters) {
      lines.push(currentLine)
      currentLine = word
      continue
    }

    currentLine = nextLine
  }

  if (currentLine.length > 0) {
    lines.push(currentLine)
  }

  return lines.length > 0 ? lines : [normalizedValue]
}

const buildSvgText = (
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
  style: string,
  anchor: 'start' | 'middle' | 'end' = 'start'
) => {
  return [
    `<text x="${x}" y="${y}" text-anchor="${anchor}" xml:space="preserve" style="${style}">`,
    ...lines.map((line, index) => {
      const dy = index === 0 ? 0 : lineHeight

      return `<tspan x="${x}" dy="${dy}">${escapeXml(line)}</tspan>`
    }),
    '</text>'
  ].join('')
}

const getSvgGradientOffset = (offset: string | null, index: number, count: number) => {
  if (offset) {
    return offset
  }

  if (count <= 1) {
    return '0%'
  }

  return `${Math.round((index / (count - 1)) * 100)}%`
}

const buildSvgPaintAttributes = (
  attribute: 'fill' | 'stroke' | 'stop-color',
  value: string,
  fallback = 'transparent'
) => {
  const paint = normalizeSvgPaint(value, fallback)
  const opacityAttribute = attribute === 'stop-color' ? 'stop-opacity' : `${attribute}-opacity`
  const attributes = [`${attribute}="${escapeXml(paint.color)}"`]

  if (paint.opacity !== null && paint.opacity < 1) {
    attributes.push(`${opacityAttribute}="${paint.opacity}"`)
  }

  return attributes.join(' ')
}

const buildSvgTextPaintStyle = (value: string, fallback: string) => {
  const paint = normalizeSvgPaint(value, fallback)
  const style = [`fill: ${paint.color};`]

  if (paint.opacity !== null && paint.opacity < 1) {
    style.push(`fill-opacity: ${paint.opacity};`)
  }

  return style.join(' ')
}

const buildExportSvgString = async (padding = exportPadding) => {
  await waitForCanvasRender()

  if (!(planeRef.value instanceof HTMLDivElement) || !(viewportRef.value instanceof HTMLDivElement)) {
    throw new Error('Canvas is not ready for export.')
  }

  const bounds = getCanvasBounds()

  if (!bounds) {
    throw new Error('Nothing is available to export.')
  }

  const exportWidth = Math.ceil(bounds.width + padding * 2)
  const exportHeight = Math.ceil(bounds.height + padding * 2)
  const offsetX = padding - bounds.minX
  const offsetY = padding - bounds.minY
  const monoFont = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace'
  const sansFont = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'
  const backgroundColor = readStudioToken('--studio-canvas-bg', '#0b141a')
  const dotColor = readStudioToken('--studio-canvas-dot', 'rgba(148, 163, 184, 0.24)')
  const shellText = readStudioToken('--studio-shell-text', '#e2e8f0')
  const shellMuted = readStudioToken('--studio-shell-muted', '#94a3b8')
  const railColor = readStudioToken('--studio-rail', 'rgba(148, 163, 184, 0.25)')
  const dividerColor = readStudioToken('--studio-divider', 'rgba(148, 163, 184, 0.16)')
  const tableSurface = readStudioToken('--studio-table-surface', '#101c24')
  const rowSurface = readStudioToken('--studio-row-surface', '#0d1820')
  const getExportElementId = (value: string) => value.replaceAll(/[^\w-]+/g, '-')
  const defs: string[] = [
    '<pattern id="pgml-grid" width="18" height="18" patternUnits="userSpaceOnUse">',
    `<circle cx="9" cy="9" r="1" ${buildSvgPaintAttributes('fill', dotColor, '#94a3b8')} />`,
    '</pattern>'
  ]
  const sceneParts: string[] = [
    `<rect x="0" y="0" width="${exportWidth}" height="${exportHeight}" ${buildSvgPaintAttributes('fill', backgroundColor, '#0b141a')} />`,
    `<rect x="0" y="0" width="${exportWidth}" height="${exportHeight}" fill="url(#pgml-grid)" />`
  ]
  const backgroundParts: string[] = []
  const connectionParts: string[] = []
  const foregroundParts: string[] = []

  canvasNodes.value.forEach((node) => {
    const nodeElement = planeRef.value?.querySelector(`[data-node-anchor="${node.id}"]`)
    const nodeSurfaceElement = node.kind === 'group'
      ? planeRef.value?.querySelector(`[data-group-surface="${node.id}"]`)
      : nodeElement
    const headerElement = planeRef.value?.querySelector(`[data-node-header="${node.id}"]`)
    const accentElement = planeRef.value?.querySelector(`[data-node-accent="${node.id}"]`)

    if (
      !(nodeElement instanceof HTMLElement)
      || !(nodeSurfaceElement instanceof HTMLElement)
      || !(headerElement instanceof HTMLElement)
    ) {
      return
    }

    const nodeStyles = window.getComputedStyle(nodeSurfaceElement)
    const nodeRect = getPlaneRelativeRect(nodeElement)
    const accentColor = accentElement instanceof HTMLElement
      ? normalizeSvgColor(window.getComputedStyle(accentElement).color, node.color)
      : normalizeSvgColor(node.color, node.color)
    const nodeBorderColor = normalizeSvgColor(nodeStyles.borderColor, railColor)
    const nodeFillColor = normalizeSvgColor(nodeStyles.backgroundColor, node.kind === 'object' ? rowSurface : tableSurface)
    const nodeGradientStops = node.kind === 'group'
      ? parseCssLinearGradient(nodeStyles.backgroundImage)
      : null
    const headerRect = getPlaneRelativeRect(headerElement)

    if (!headerRect || !nodeRect) {
      return
    }

    const x = nodeRect.x + offsetX
    const y = nodeRect.y + offsetY
    const nodeWidth = nodeRect.width
    const nodeHeight = nodeRect.height
    const outerRadius = node.kind === 'group' ? 2 : 0
    const headerBottom = headerRect.y + headerRect.height + offsetY
    const badgeText = node.kind === 'group'
      ? `${node.tableCount || node.tableIds.length} tables`
      : (node.kind === 'table' ? `${getTableRows(node.id).length} rows` : `${node.tableIds.length} impact`)
    const nodeExportId = getExportElementId(node.id)

    const gradientId = nodeGradientStops?.length
      ? `pgml-node-gradient-${nodeExportId}`
      : null

    if (gradientId && nodeGradientStops) {
      defs.push(
        `<linearGradient id="${gradientId}" x1="0%" y1="0%" x2="0%" y2="100%">`,
        ...nodeGradientStops.map((stop, index) => {
          return `<stop offset="${getSvgGradientOffset(stop.offset, index, nodeGradientStops.length)}" ${buildSvgPaintAttributes('stop-color', stop.color, stop.color)} />`
        }),
        '</linearGradient>'
      )
    }

    const nodeBaseParts = node.kind === 'group' ? backgroundParts : foregroundParts

    nodeBaseParts.push(
      `<rect id="pgml-node-${nodeExportId}-base" x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="${outerRadius}" ry="${outerRadius}" ${buildSvgPaintAttributes('fill', nodeFillColor, node.kind === 'group' ? tableSurface : rowSurface)} ${buildSvgPaintAttributes('stroke', nodeBorderColor, railColor)} stroke-width="1" />`
    )

    if (gradientId) {
      nodeBaseParts.push(
        `<rect id="pgml-node-${nodeExportId}-gradient" x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="${outerRadius}" ry="${outerRadius}" fill="url(#${gradientId})" stroke="none" />`
      )
    }

    if (node.kind === 'group' || !node.collapsed) {
      foregroundParts.push(
        `<line x1="${x}" y1="${headerBottom}" x2="${x + nodeWidth}" y2="${headerBottom}" ${buildSvgPaintAttributes('stroke', dividerColor, dividerColor)} stroke-width="1" />`
      )
    }
    foregroundParts.push(
      buildSvgText(
        [node.kind === 'group' ? 'TABLE GROUP' : (node.kind === 'table' ? 'TABLE' : (node.objectKind || '').toUpperCase())],
        x + 10,
        y + 14,
        8,
        `font: 600 8px ${monoFont}; letter-spacing: 0.9px; ${buildSvgTextPaintStyle(accentColor, accentColor)}`
      )
    )
    foregroundParts.push(
      buildSvgText(
        [node.title],
        x + 10,
        y + 30,
        10,
        `font: 600 14px ${sansFont}; ${buildSvgTextPaintStyle(shellText, '#e2e8f0')}`
      )
    )

    if (node.subtitle.length > 0) {
      foregroundParts.push(
        buildSvgText(
          wrapSvgText(node.subtitle, nodeWidth - 90, 10),
          x + 10,
          y + 44,
          12,
          `font: 400 10px ${sansFont}; ${buildSvgTextPaintStyle(shellMuted, '#94a3b8')}`
        )
      )
    }

    foregroundParts.push(
      `<rect x="${x + nodeWidth - 72}" y="${y + 8}" width="62" height="18" fill="none" ${buildSvgPaintAttributes('stroke', railColor, railColor)} stroke-width="1" />`
    )
    foregroundParts.push(
      buildSvgText(
        [badgeText.toUpperCase()],
        x + nodeWidth - 41,
        y + 20,
        8,
        `font: 500 8px ${monoFont}; letter-spacing: 0.45px; ${buildSvgTextPaintStyle(shellMuted, '#94a3b8')}`,
        'middle'
      )
    )

    if (node.kind === 'group') {
      const tables = getRenderedGroupTables(node.title)

      tables.forEach((table) => {
        const tableElement = planeRef.value?.querySelector(`[data-table-anchor="${table.fullName}"]`)

        if (!(tableElement instanceof HTMLElement)) {
          return
        }

        const tableRect = getPlaneRelativeRect(tableElement)
        const tableHeaderElement = tableElement.firstElementChild
        const tableHeaderRect = tableHeaderElement ? getPlaneRelativeRect(tableHeaderElement) : null
        const tableStyles = window.getComputedStyle(tableElement)
        const tableBorderColor = normalizeSvgColor(tableStyles.borderColor, railColor)

        if (!tableRect || !tableHeaderRect) {
          return
        }

        const tableX = tableRect.x + offsetX
        const tableY = tableRect.y + offsetY
        const tableExportId = getExportElementId(table.fullName)

        foregroundParts.push(
          `<rect id="pgml-table-${tableExportId}-base" x="${tableX}" y="${tableY}" width="${tableRect.width}" height="${tableRect.height}" rx="2" ry="2" ${buildSvgPaintAttributes('fill', window.getComputedStyle(tableElement).backgroundColor, tableSurface)} ${buildSvgPaintAttributes('stroke', tableBorderColor, railColor)} stroke-width="1" />`
        )
        foregroundParts.push(
          `<line x1="${tableX}" y1="${tableHeaderRect.y + tableHeaderRect.height + offsetY}" x2="${tableX + tableRect.width}" y2="${tableHeaderRect.y + tableHeaderRect.height + offsetY}" ${buildSvgPaintAttributes('stroke', dividerColor, dividerColor)} stroke-width="1" />`
        )
        foregroundParts.push(
          buildSvgText(
            [table.name],
            tableX + 8,
            tableY + 16,
            10,
            `font: 600 11px ${sansFont}; ${buildSvgTextPaintStyle(shellText, '#e2e8f0')}`
          )
        )
        const schemaBadgeColor = getSchemaBadgeColor(table.schema)
        const schemaBadgeBorder = resolveComputedCssColor(
          'borderColor',
          `color-mix(in srgb, ${schemaBadgeColor} 58%, ${railColor} 42%)`,
          railColor
        )
        const schemaBadgeFill = resolveComputedCssColor(
          'backgroundColor',
          `color-mix(in srgb, ${schemaBadgeColor} 14%, transparent)`,
          'transparent'
        )
        const schemaBadgeText = resolveComputedCssColor(
          'color',
          `color-mix(in srgb, ${schemaBadgeColor} 72%, ${shellText} 28%)`,
          shellText
        )
        const schemaBadgeLabel = table.schema.toUpperCase()
        const schemaBadgeWidth = Math.max(42, (schemaBadgeLabel.length * 5.1) + 12)

        foregroundParts.push(
          `<rect x="${tableX + 8}" y="${tableY + 20}" width="${schemaBadgeWidth}" height="12" ${buildSvgPaintAttributes('fill', schemaBadgeFill, 'transparent')} ${buildSvgPaintAttributes('stroke', schemaBadgeBorder, railColor)} stroke-width="1" />`
        )
        foregroundParts.push(
          buildSvgText(
            [schemaBadgeLabel],
            tableX + 12,
            tableY + 29,
            8,
            `font: 500 8px ${monoFont}; letter-spacing: 0.5px; ${buildSvgTextPaintStyle(schemaBadgeText, shellText)}`
          )
        )
        const rowElements = Array.from(tableElement.querySelectorAll('[data-table-row-anchor]'))
          .filter((rowElement): rowElement is HTMLElement => rowElement instanceof HTMLElement)

        rowElements.forEach((rowElement, rowIndex) => {
          const rowRect = getPlaneRelativeRect(rowElement)

          if (!rowRect) {
            return
          }

          const rowX = rowRect.x + offsetX
          const rowY = rowRect.y + offsetY
          const rowHeight = rowRect.height
          const rowStyles = window.getComputedStyle(rowElement)

          foregroundParts.push(
            `<rect x="${rowX}" y="${rowY}" width="${rowRect.width}" height="${rowHeight}" ${buildSvgPaintAttributes('fill', rowStyles.backgroundColor, rowSurface)} />`
          )

          const titleElement = rowElement.querySelector('[data-table-row-title]')
          const subtitleElement = rowElement.querySelector('[data-table-row-subtitle]')

          if (titleElement instanceof HTMLElement) {
            const titleRect = getPlaneRelativeRect(titleElement)

            if (titleRect) {
              foregroundParts.push(
                buildSvgText(
                  [titleElement.textContent || ''],
                  titleRect.x + offsetX,
                  titleRect.y + offsetY + titleRect.height - 2,
                  9,
                  `font: 600 9px ${monoFont}; ${buildSvgTextPaintStyle(shellText, '#e2e8f0')}`
                )
              )
            }
          }

          if (subtitleElement instanceof HTMLElement) {
            const subtitleRect = getPlaneRelativeRect(subtitleElement)

            if (subtitleRect) {
              foregroundParts.push(
                buildSvgText(
                  [subtitleElement.textContent || ''],
                  subtitleRect.x + offsetX,
                  subtitleRect.y + offsetY + subtitleRect.height - 2,
                  8,
                  `font: 400 8px ${sansFont}; ${buildSvgTextPaintStyle(shellMuted, '#94a3b8')}`
                )
              )
            }
          }

          rowElement.querySelectorAll('[data-table-row-badge]').forEach((badgeElement) => {
            if (!(badgeElement instanceof HTMLElement)) {
              return
            }

            const badgeRect = getPlaneRelativeRect(badgeElement)

            if (!badgeRect) {
              return
            }

            const badgeStyles = window.getComputedStyle(badgeElement)
            const badgeFill = normalizeSvgColor(badgeStyles.backgroundColor, 'transparent')
            const badgeBorderColor = normalizeSvgColor(badgeStyles.borderColor, railColor)
            const badgeTextColor = normalizeSvgColor(badgeStyles.color, shellMuted)

            foregroundParts.push(
              `<rect x="${badgeRect.x + offsetX}" y="${badgeRect.y + offsetY}" width="${badgeRect.width}" height="${badgeRect.height}" ${buildSvgPaintAttributes('fill', badgeFill, 'transparent')} ${buildSvgPaintAttributes('stroke', badgeBorderColor, railColor)} stroke-width="1" />`
            )
            foregroundParts.push(
              buildSvgText(
                [badgeElement.textContent || ''],
                badgeRect.x + offsetX + badgeRect.width / 2,
                badgeRect.y + offsetY + badgeRect.height / 2 + 2.5,
                7.5,
                `font: 500 7.5px ${monoFont}; letter-spacing: 0.24px; ${buildSvgTextPaintStyle(badgeTextColor, shellMuted)}`,
                'middle'
              )
            )
          })

          if (rowIndex < rowElements.length - 1) {
            foregroundParts.push(
              `<line x1="${rowX}" y1="${rowY + rowHeight}" x2="${rowX + rowRect.width}" y2="${rowY + rowHeight}" ${buildSvgPaintAttributes('stroke', dividerColor, dividerColor)} stroke-width="1" />`
            )
          }
        })
      })

      return
    }

    if (node.kind === 'table') {
      const rowElements = Array.from(nodeElement.querySelectorAll('[data-table-row-anchor]'))
        .filter((rowElement): rowElement is HTMLElement => rowElement instanceof HTMLElement)

      rowElements.forEach((rowElement, rowIndex) => {
        const rowRect = getPlaneRelativeRect(rowElement)

        if (!rowRect) {
          return
        }

        const rowX = rowRect.x + offsetX
        const rowY = rowRect.y + offsetY
        const rowHeight = rowRect.height
        const rowStyles = window.getComputedStyle(rowElement)

        foregroundParts.push(
          `<rect x="${rowX}" y="${rowY}" width="${rowRect.width}" height="${rowHeight}" ${buildSvgPaintAttributes('fill', rowStyles.backgroundColor, rowSurface)} />`
        )

        const titleElement = rowElement.querySelector('[data-table-row-title]')
        const subtitleElement = rowElement.querySelector('[data-table-row-subtitle]')

        if (titleElement instanceof HTMLElement) {
          const titleRect = getPlaneRelativeRect(titleElement)

          if (titleRect) {
            foregroundParts.push(
              buildSvgText(
                [titleElement.textContent || ''],
                titleRect.x + offsetX,
                titleRect.y + offsetY + titleRect.height - 2,
                9,
                `font: 600 9px ${monoFont}; ${buildSvgTextPaintStyle(shellText, '#e2e8f0')}`
              )
            )
          }
        }

        if (subtitleElement instanceof HTMLElement) {
          const subtitleRect = getPlaneRelativeRect(subtitleElement)

          if (subtitleRect) {
            foregroundParts.push(
              buildSvgText(
                [subtitleElement.textContent || ''],
                subtitleRect.x + offsetX,
                subtitleRect.y + offsetY + subtitleRect.height - 2,
                8,
                `font: 400 8px ${sansFont}; ${buildSvgTextPaintStyle(shellMuted, '#94a3b8')}`
              )
            )
          }
        }

        rowElement.querySelectorAll('[data-table-row-badge]').forEach((badgeElement) => {
          if (!(badgeElement instanceof HTMLElement)) {
            return
          }

          const badgeRect = getPlaneRelativeRect(badgeElement)

          if (!badgeRect) {
            return
          }

          const badgeStyles = window.getComputedStyle(badgeElement)
          const badgeFill = normalizeSvgColor(badgeStyles.backgroundColor, 'transparent')
          const badgeBorderColor = normalizeSvgColor(badgeStyles.borderColor, railColor)
          const badgeTextColor = normalizeSvgColor(badgeStyles.color, shellMuted)

          foregroundParts.push(
            `<rect x="${badgeRect.x + offsetX}" y="${badgeRect.y + offsetY}" width="${badgeRect.width}" height="${badgeRect.height}" ${buildSvgPaintAttributes('fill', badgeFill, 'transparent')} ${buildSvgPaintAttributes('stroke', badgeBorderColor, railColor)} stroke-width="1" />`
          )
          foregroundParts.push(
            buildSvgText(
              [badgeElement.textContent || ''],
              badgeRect.x + offsetX + badgeRect.width / 2,
              badgeRect.y + offsetY + badgeRect.height / 2 + 2.5,
              7.5,
              `font: 500 7.5px ${monoFont}; letter-spacing: 0.24px; ${buildSvgTextPaintStyle(badgeTextColor, shellMuted)}`,
              'middle'
            )
          )
        })

        if (rowIndex < rowElements.length - 1) {
          foregroundParts.push(
            `<line x1="${rowX}" y1="${rowY + rowHeight}" x2="${rowX + rowRect.width}" y2="${rowY + rowHeight}" ${buildSvgPaintAttributes('stroke', dividerColor, dividerColor)} stroke-width="1" />`
          )
        }
      })

      return
    }

    const bodyElement = planeRef.value?.querySelector(`[data-node-body="${node.id}"]`)

    if (!(bodyElement instanceof HTMLElement)) {
      return
    }

    bodyElement.querySelectorAll('p').forEach((paragraph) => {
      const paragraphRect = getPlaneRelativeRect(paragraph)

      if (!paragraphRect) {
        return
      }

      const paragraphText = paragraph.textContent || ''
      const preserveParagraphWhitespace = /^\s+/.test(paragraphText) || paragraphText.length === 0
      const paragraphLines = wrapSvgText(paragraphText, paragraphRect.width, 9, true, preserveParagraphWhitespace)

      foregroundParts.push(
        buildSvgText(
          paragraphLines,
          paragraphRect.x + offsetX,
          paragraphRect.y + offsetY + 8,
          10,
          `font: 400 9px ${monoFont}; ${buildSvgTextPaintStyle(shellMuted, '#94a3b8')}`
        )
      )
    })

    bodyElement.querySelectorAll('[data-impact-anchor]').forEach((chip) => {
      const chipRect = getPlaneRelativeRect(chip)

      if (!chipRect) {
        return
      }

      foregroundParts.push(
        `<rect x="${chipRect.x + offsetX}" y="${chipRect.y + offsetY}" width="${chipRect.width}" height="${chipRect.height}" fill="none" ${buildSvgPaintAttributes('stroke', railColor, railColor)} stroke-width="1" />`
      )
      foregroundParts.push(
        buildSvgText(
          [chip.textContent || ''],
          chipRect.x + offsetX + chipRect.width / 2,
          chipRect.y + offsetY + chipRect.height / 2 + 3,
          8,
          `font: 500 8px ${monoFont}; letter-spacing: 0.35px; ${buildSvgTextPaintStyle(shellMuted, '#94a3b8')}`,
          'middle'
        )
      )
    })

    const resizeHandleElement = nodeElement.querySelector('button[aria-label="Resize node"]')
    const resizeHandleRect = resizeHandleElement ? getPlaneRelativeRect(resizeHandleElement) : null

    if (resizeHandleRect) {
      const handleX = resizeHandleRect.x + offsetX
      const handleY = resizeHandleRect.y + offsetY
      const handleWidth = resizeHandleRect.width
      const handleHeight = resizeHandleRect.height

      foregroundParts.push(
        `<line x1="${handleX + handleWidth}" y1="${handleY}" x2="${handleX + handleWidth}" y2="${handleY + handleHeight}" ${buildSvgPaintAttributes('stroke', accentColor, accentColor)} stroke-width="2" />`
      )
      foregroundParts.push(
        `<line x1="${handleX}" y1="${handleY + handleHeight}" x2="${handleX + handleWidth}" y2="${handleY + handleHeight}" ${buildSvgPaintAttributes('stroke', accentColor, accentColor)} stroke-width="2" />`
      )
    }
  })

  connectionLines.value.forEach((line) => {
    connectionParts.push(
      `<path d="${escapeXml(translatePathData(line.path, offsetX, offsetY))}" fill="none" ${buildSvgPaintAttributes('stroke', line.color, line.color)} stroke-width="2" stroke-dasharray="${line.dashed ? '10 7' : '0'}" stroke-linecap="square" stroke-linejoin="miter" opacity="0.9" />`
    )
  })

  return {
    width: exportWidth,
    height: exportHeight,
    svg: [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" width="${exportWidth}" height="${exportHeight}" viewBox="0 0 ${exportWidth} ${exportHeight}">`,
      '<defs>',
      ...defs,
      '</defs>',
      ...sceneParts,
      ...backgroundParts,
      ...connectionParts,
      ...foregroundParts,
      '</svg>'
    ].join('')
  }
}

const downloadBlob = (blob: Blob, fileName: string) => {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = objectUrl
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
  }, 0)
}

const loadExportPreferences = (schemaKey: string) => {
  exportPreferences.value = readPgmlExportPreferences(schemaKey)
}

const persistExportPreferences = () => {
  writePgmlExportPreferences(exportPreferenceKey, exportPreferences.value)
}

const updateExportFormat = (format: PgmlExportFormat) => {
  exportPreferences.value = {
    ...exportPreferences.value,
    format
  }
}

const updateKyselyTypeStyle = (nextStyle: string) => {
  if (nextStyle !== 'pragmatic' && nextStyle !== 'strict' && nextStyle !== 'loose') {
    return
  }

  exportPreferences.value = {
    ...exportPreferences.value,
    kyselyTypeStyle: nextStyle
  }
}

const downloadExportArtifact = (artifact: PgmlExportArtifact) => {
  const blob = new Blob([artifact.content], {
    type: artifact.fileName.endsWith('.ts') ? 'text/typescript;charset=utf-8' : 'text/plain;charset=utf-8'
  })

  downloadBlob(blob, artifact.fileName)
}

const setExportCopyFeedback = (key: string, status: ExportCopyFeedbackStatus) => {
  exportCopyFeedback.value = {
    key,
    status
  }

  stopExportCopyFeedbackReset()
  scheduleExportCopyFeedbackReset()
}

const getExportCopyFeedbackStatus = (key: string) => {
  return exportCopyFeedback.value.key === key ? exportCopyFeedback.value.status : null
}

const getExportCopyButtonIcon = (key: string) => {
  const status = getExportCopyFeedbackStatus(key)

  if (status === 'success') {
    return 'i-lucide-check'
  }

  if (status === 'error') {
    return 'i-lucide-circle-alert'
  }

  return 'i-lucide-copy'
}

const getExportCopyButtonLabel = (key: string) => {
  const status = getExportCopyFeedbackStatus(key)

  if (status === 'success') {
    return 'Copied'
  }

  if (status === 'error') {
    return 'Copy failed'
  }

  return 'Copy'
}

const getExportCopyButtonClass = (key: string) => {
  const status = getExportCopyFeedbackStatus(key)

  // Copy buttons reuse the same active/error treatment as the rest of the
  // studio so export feedback reads consistently with selection state.
  return joinStudioClasses(
    getStudioChoiceButtonClass({
      active: status === 'success',
      extraClass: 'justify-center'
    }),
    status === 'error' && exportArtifactButtonErrorClass
  )
}

const getClipboardCopyFailureMessage = (error: unknown) => {
  if (!isClipboardSupported.value) {
    return 'Clipboard access is not available in this browser.'
  }

  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error
  }

  return 'The browser blocked clipboard access.'
}

const copyExportArtifact = async (artifact: PgmlExportArtifact & { key: string }) => {
  try {
    if (!import.meta.client || !isClipboardSupported.value) {
      throw new Error('Clipboard access is not available in this browser.')
    }

    await copyToClipboard(artifact.content)
    setExportCopyFeedback(artifact.key, 'success')
  } catch (error) {
    const description = getClipboardCopyFailureMessage(error)

    setExportCopyFeedback(artifact.key, 'error')
    toast.add({
      title: 'Copy failed',
      description,
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
  }
}

const exportSvg = async () => {
  const result = await buildExportSvgString()
  const blob = new Blob([result.svg], {
    type: 'image/svg+xml;charset=utf-8'
  })

  downloadBlob(blob, 'pgml-diagram.svg')
}

const exportPng = async (scaleFactor: number) => {
  await waitForCanvasRender()

  const bounds = getCanvasBounds()

  if (!bounds) {
    throw new Error('Nothing is available to export.')
  }

  const { padding, rasterWidth, rasterHeight } = getRasterExportPlan(bounds.width, bounds.height, scaleFactor, 24)
  const result = await buildExportSvgString(padding)

  const blob = new Blob([result.svg], {
    type: 'image/svg+xml;charset=utf-8'
  })
  const objectUrl = URL.createObjectURL(blob)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image()

      nextImage.onload = () => resolve(nextImage)
      nextImage.onerror = () => reject(new Error('Unable to render the diagram export.'))
      nextImage.src = objectUrl
    })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Unable to create a canvas for export.')
    }

    canvas.width = rasterWidth
    canvas.height = rasterHeight
    context.setTransform(scaleFactor, 0, 0, scaleFactor, 0, 0)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, result.width, result.height)

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((output) => {
        if (output) {
          resolve(output)
          return
        }

        reject(new Error('Unable to create a PNG export.'))
      }, 'image/png')
    })

    downloadBlob(pngBlob, `pgml-diagram-${scaleFactor}x.png`)
  } finally {
    URL.revokeObjectURL(objectUrl)
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
  const groupState = nodeStates.value[groupId]
  const baselineSize = getGroupMinimumSize(
    groupId.replace(/^group:/, ''),
    groupState?.columnCount || 1,
    groupState?.masonry ?? false
  )
  const wrapperStyles = contentWrapper ? window.getComputedStyle(contentWrapper) : null
  const paddingRight = wrapperStyles ? Number.parseFloat(wrapperStyles.paddingRight) : 0
  const paddingBottom = wrapperStyles ? Number.parseFloat(wrapperStyles.paddingBottom) : 0
  const sizeBuffer = 1
  const scaleFactor = Math.max(scale.value, 0.001)
  const groupBounds = groupElement.getBoundingClientRect()
  const headerBounds = headerElement.getBoundingClientRect()
  const contentWrapperBounds = contentWrapper instanceof HTMLElement ? contentWrapper.getBoundingClientRect() : null
  const contentBounds = contentElement.getBoundingClientRect()
  const contentChildren = Array.from(contentElement.children).filter((child): child is HTMLElement => child instanceof HTMLElement)
  const contentRight = contentChildren.length
    ? Math.max(...contentChildren.map(child => (child.getBoundingClientRect().right - groupBounds.left) / scaleFactor)) + paddingRight
    : ((contentBounds.right - groupBounds.left) / scaleFactor) + paddingRight
  const contentBottomFromChildren = contentChildren.length
    ? Math.max(...contentChildren.map(child => (child.getBoundingClientRect().bottom - groupBounds.top) / scaleFactor)) + paddingBottom
    : ((contentBounds.bottom - groupBounds.top) / scaleFactor) + paddingBottom
  const contentBottom = contentWrapperBounds
    ? (contentWrapperBounds.bottom - groupBounds.top) / scaleFactor
    : contentBottomFromChildren
  const headerBottom = (headerBounds.bottom - groupBounds.top) / scaleFactor

  return {
    minWidth: Math.ceil(Math.max(contentRight + sizeBuffer, 240, baselineSize.minWidth)),
    minHeight: Math.ceil(Math.max(headerBottom + paddingBottom, contentBottom + sizeBuffer, baselineSize.minHeight))
  }
}

const measureTableMinimumSize = (tableId: string) => {
  if (!planeRef.value) {
    return null
  }

  const tableElement = planeRef.value.querySelector(`[data-node-anchor="${tableId}"][data-table-anchor="${tableId}"]`)
  const headerElement = planeRef.value.querySelector(`[data-node-header="${tableId}"]`)
  const baselineHeight = estimateTableHeight(getTableRows(tableId).length)

  if (
    !(tableElement instanceof HTMLElement)
    || !(headerElement instanceof HTMLElement)
  ) {
    return {
      minWidth: groupTableWidth,
      minHeight: baselineHeight
    }
  }

  const measuredHeight = Math.ceil(Math.max(
    tableElement.scrollHeight,
    headerElement.offsetHeight + baselineHeight,
    baselineHeight
  ))

  return {
    minWidth: groupTableWidth,
    minHeight: measuredHeight
  }
}

const measureObjectMinimumSize = (node: CanvasNodeState) => {
  if (!planeRef.value) {
    return null
  }

  const objectElement = planeRef.value.querySelector(`[data-node-anchor="${node.id}"]`)
  const headerElement = planeRef.value.querySelector(`[data-node-header="${node.id}"]`)

  if (
    !(objectElement instanceof HTMLElement)
    || !(headerElement instanceof HTMLElement)
  ) {
    return null
  }

  if (node.collapsed) {
    return {
      minWidth: Math.ceil(Math.max(node.minWidth || node.width, 220)),
      minHeight: Math.ceil(Math.max(headerElement.offsetHeight, collapsedObjectHeight))
    }
  }

  const bodyElement = planeRef.value.querySelector(`[data-node-body="${node.id}"]`)

  if (!(bodyElement instanceof HTMLElement)) {
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

  if (node.kind === 'table') {
    return measureTableMinimumSize(node.id)
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

    const nextWidth = current.kind === 'group'
      ? measuredSize.minWidth
      : Math.max(current.width, measuredSize.minWidth)
    const nextHeight = current.kind === 'group'
      ? measuredSize.minHeight
      : Math.max(current.height, measuredSize.minHeight)
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
      height: nextHeight,
      expandedHeight: current.kind === 'group'
        ? nextHeight
        : current.expandedHeight
    }
    hasChanges = true
  }

  return hasChanges
}

const getCanvasLayoutObserverTargets = () => {
  const targets: HTMLElement[] = []
  const seenTargets = new Set<HTMLElement>()
  const pushTarget = (element: HTMLElement | null) => {
    if (!element || seenTargets.has(element)) {
      return
    }

    seenTargets.add(element)
    targets.push(element)
  }

  if (viewportRef.value) {
    pushTarget(viewportRef.value)
  }

  if (!planeRef.value) {
    return targets
  }

  pushTarget(planeRef.value)

  planeRef.value.querySelectorAll('[data-node-anchor]').forEach((element) => {
    if (element instanceof HTMLElement) {
      pushTarget(element)
    }
  })

  planeRef.value.querySelectorAll('[data-table-anchor]').forEach((element) => {
    if (element instanceof HTMLElement) {
      pushTarget(element)
    }
  })

  return targets
}

const syncMeasuredGroupTableHeights = () => {
  if (!(planeRef.value instanceof HTMLElement)) {
    if (Object.keys(measuredGroupTableHeights.value).length === 0) {
      return false
    }

    measuredGroupTableHeights.value = {}
    return true
  }

  const nextHeights: Record<string, number> = {}
  const groupedTableElements = Array.from(planeRef.value.querySelectorAll('[data-group-content] [data-table-anchor]'))
    .filter((element): element is HTMLElement => element instanceof HTMLElement)

  groupedTableElements.forEach((element) => {
    const tableId = element.getAttribute('data-table-anchor')

    if (!tableId) {
      return
    }

    nextHeights[tableId] = Math.ceil(element.offsetHeight)
  })

  const currentEntries = Object.entries(measuredGroupTableHeights.value)
  const nextEntries = Object.entries(nextHeights)
  const hasChanges = currentEntries.length !== nextEntries.length
    || nextEntries.some(([tableId, height]) => measuredGroupTableHeights.value[tableId] !== height)

  if (!hasChanges) {
    return false
  }

  measuredGroupTableHeights.value = nextHeights
  return true
}

const layoutObserverTargets: Ref<HTMLElement[]> = ref([])
const syncLayoutObserverTargets = async () => {
  await nextTick()
  layoutObserverTargets.value = getCanvasLayoutObserverTargets()
}

const refreshMeasuredGroupTableHeights = async () => {
  if (!syncMeasuredGroupTableHeights()) {
    return
  }

  await nextTick()
  await syncLayoutObserverTargets()
}

const handleCanvasLayoutResize = () => {
  if (Date.now() < suppressLayoutObserverUntil) {
    return
  }

  if (syncMeasuredGroupTableHeights()) {
    nextTick(() => {
      if (syncMeasuredNodeSizes() && !hasEmbeddedLayout.value) {
        reflowAutoLayout()
      }

      updateConnections()
    })
    return
  }

  if (syncMeasuredNodeSizes() && !hasEmbeddedLayout.value) {
    reflowAutoLayout()
  }

  updateConnections()
}

useResizeObserver(layoutObserverTargets, handleCanvasLayoutResize)

const cleanForSearch = (value: string) => value.toLowerCase().replaceAll(/[^\w.]+/g, ' ')
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const snapCoordinate = (value: number) => {
  if (!snapToGrid.value) {
    return value
  }

  return Math.round(value / gridSize) * gridSize
}
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
const getGroupNameForTableId = (tableId: string) => tableGroupById.value[tableId] || null
const getRelatedHostRectsForTableIds = (
  tableIds: string[],
  states: Record<string, CanvasNodeState>
) => {
  const seen = new Set<string>()

  return tableIds.flatMap((tableId) => {
    const groupName = getGroupNameForTableId(tableId)
    const hostNode = groupName ? states[`group:${groupName}`] : states[tableId]

    if (!hostNode || seen.has(hostNode.id)) {
      return []
    }

    seen.add(hostNode.id)
    return [getNodeRect(hostNode)]
  })
}

const getRelatedGroupRectsForNode = (
  node: CanvasNodeState,
  states: Record<string, CanvasNodeState>
) => {
  return getRelatedHostRectsForTableIds(node.tableIds, states)
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

const sanitizeReferenceValue = (value: string) => {
  return value
    .trim()
    .replaceAll('"', '')
    .replaceAll('\'', '')
    .replace(/[(),;]/g, '')
}

const resolveTableIdentifier = (value: string) => {
  const normalized = sanitizeReferenceValue(value).toLowerCase()

  if (!normalized) {
    return null
  }

  const directMatch = model.tables.find(table => table.fullName.toLowerCase() === normalized)

  if (directMatch) {
    return directMatch.fullName
  }

  const byName = model.tables.find(table => table.name.toLowerCase() === normalized)

  return byName?.fullName || null
}

const resolveImpactTargetsFromValue = (value: string, defaultTableId: string | null = null): ImpactTarget[] => {
  const normalized = sanitizeReferenceValue(value)

  if (!normalized) {
    return []
  }

  const parts = normalized.split('.')

  if (
    parts.length === 2
    && defaultTableId
    && (parts[0]?.toLowerCase() === 'new' || parts[0]?.toLowerCase() === 'old')
  ) {
    return [{
      tableId: defaultTableId,
      columnName: parts[1] || null
    }]
  }

  if (parts.length === 3) {
    const tableId = resolveTableIdentifier(`${parts[0]}.${parts[1]}`)

    if (tableId) {
      return [{
        tableId,
        columnName: parts[2] || null
      }]
    }
  }

  if (parts.length === 2) {
    const fullTableMatch = resolveTableIdentifier(`${parts[0]}.${parts[1]}`)

    if (fullTableMatch) {
      return [{
        tableId: fullTableMatch,
        columnName: null
      }]
    }

    const matchingTable = model.tables.find((table) => {
      return table.name.toLowerCase() === (parts[0] || '').toLowerCase()
    })

    if (matchingTable && matchingTable.columns.some(column => column.name.toLowerCase() === (parts[1] || '').toLowerCase())) {
      return [{
        tableId: matchingTable.fullName,
        columnName: parts[1] || null
      }]
    }
  }

  const directTable = resolveTableIdentifier(normalized)

  if (directTable) {
    return [{
      tableId: directTable,
      columnName: null
    }]
  }

  if (defaultTableId) {
    const defaultTable = model.tables.find(table => table.fullName === defaultTableId)

    if (defaultTable?.columns.some(column => column.name.toLowerCase() === normalized.toLowerCase())) {
      return [{
        tableId: defaultTableId,
        columnName: normalized
      }]
    }
  }

  return []
}

const getImpactTargetsFromValues = (values: string[], defaultTableId: string | null = null) => {
  return getUniqueImpactTargets(values.flatMap(value => resolveImpactTargetsFromValue(value, defaultTableId)))
}

const inferSourceTargets = (source: string, defaultTableId: string | null = null) => {
  const values: string[] = []

  Array.from(source.matchAll(/\b(?:insert\s+into|update|delete\s+from|from|join|on|owned\s+by)\s+([a-zA-Z_"][\w."]*)/gi)).forEach((match) => {
    const identifier = match[1] || ''

    if (identifier.length > 0) {
      values.push(identifier)
    }
  })

  Array.from(source.matchAll(/\b(?:NEW|OLD)\.([a-zA-Z_]\w*)/g)).forEach((match) => {
    const columnName = match[1] || ''

    if (columnName.length > 0) {
      values.push(`NEW.${columnName}`)
    }
  })

  return getImpactTargetsFromValues(values, defaultTableId)
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

const inferRoutineTargets = (routine: PgmlRoutine) => {
  const explicitTargets = routine.affects
    ? getImpactTargetsFromValues([
        ...routine.affects.writes,
        ...routine.affects.sets,
        ...routine.affects.dependsOn,
        ...routine.affects.reads,
        ...routine.affects.uses,
        ...routine.affects.ownedBy
      ])
    : []
  const sourceTargets = routine.source
    ? inferSourceTargets(routine.source)
    : []
  const tableIds = inferRoutineTables(routine)
  const haystack = `${routine.signature} ${routine.details.join(' ')} ${routine.source || ''}`
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

  return getUniqueImpactTargets([...explicitTargets, ...sourceTargets, ...targets])
}

const inferTriggerTargets = (tableId: string, trigger: PgmlSchemaModel['triggers'][number]) => {
  const explicitTargets = trigger.affects
    ? getImpactTargetsFromValues([
        ...trigger.affects.writes,
        ...trigger.affects.sets,
        ...trigger.affects.dependsOn,
        ...trigger.affects.reads,
        ...trigger.affects.uses,
        ...trigger.affects.ownedBy
      ], tableId)
    : []
  const sourceTargets = trigger.source
    ? inferSourceTargets(trigger.source, tableId)
    : []
  const haystack = `${trigger.details.join(' ')} ${trigger.source || ''}`
  const matchedColumns = inferColumnsFromText(tableId, haystack)

  if (!matchedColumns.length) {
    return getUniqueImpactTargets([...explicitTargets, ...sourceTargets, { tableId, columnName: null }])
  }

  return getUniqueImpactTargets([
    ...explicitTargets,
    ...sourceTargets,
    ...matchedColumns.map(columnName => ({
      tableId,
      columnName
    }))
  ])
}

const inferSequenceTargets = (sequence: PgmlSequence) => {
  const explicitTargets = sequence.affects
    ? getImpactTargetsFromValues([
        ...sequence.affects.ownedBy,
        ...sequence.affects.writes,
        ...sequence.affects.dependsOn
      ])
    : []
  const sourceTargets = sequence.source
    ? inferSourceTargets(sequence.source)
    : []
  const modifierTargets = model.tables.flatMap((table) => {
    return table.columns
      .filter((column) => {
        return column.modifiers.some(modifier => modifier.includes(sequence.name))
      })
      .map(column => ({
        tableId: table.fullName,
        columnName: column.name
      }))
  })

  return getUniqueImpactTargets([...explicitTargets, ...sourceTargets, ...modifierTargets])
}
const inferIndexTargets = (index: PgmlSchemaModel['tables'][number]['indexes'][number]) => {
  const tableId = normalizeReference(index.tableName)
  const targets = index.columns.map(columnName => ({
    tableId,
    columnName
  }))

  if (!targets.length) {
    return [{
      tableId,
      columnName: null
    }]
  }

  return getUniqueImpactTargets(targets)
}
const inferConstraintTargets = (constraint: PgmlSchemaModel['tables'][number]['constraints'][number]) => {
  const tableId = normalizeReference(constraint.tableName)
  const matchedColumns = inferColumnsFromText(tableId, constraint.expression)

  if (!matchedColumns.length) {
    return [{
      tableId,
      columnName: null
    }]
  }

  return getUniqueImpactTargets(matchedColumns.map(columnName => ({
    tableId,
    columnName
  })))
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

const normalizeMetadataKey = (value: string) => value.toLowerCase().replaceAll(/[^\w]+/g, '_')
const getMetadataValue = (metadata: Array<{ key: string, value: string }>, key: string) => {
  const normalizedKey = normalizeMetadataKey(key)

  return metadata.find(entry => normalizeMetadataKey(entry.key) === normalizedKey)?.value || null
}
const getUniqueTableIds = (targets: ImpactTarget[]) => uniqueValues(targets.map(target => target.tableId))
const getResolvedTableIds = (tableIds: string[]) => uniqueValues(tableIds.filter(tableId => knownTableIds.value.has(tableId)))
const parseMetadataList = (value: string | null) => {
  if (!value) {
    return []
  }

  return value
    .replace(/^\[(.*)\]$/, '$1')
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)
}
const buildTriggerSubtitle = (trigger: PgmlSchemaModel['triggers'][number]) => {
  const timing = getMetadataValue(trigger.metadata, 'timing')
  const events = parseMetadataList(getMetadataValue(trigger.metadata, 'events'))
  const level = getMetadataValue(trigger.metadata, 'level')
  const parts: string[] = []

  if (timing) {
    parts.push(timing.toUpperCase())
  }

  if (events.length) {
    parts.push(events.map(eventName => eventName.toUpperCase()).join(' / '))
  }

  if (level) {
    parts.push(level.toUpperCase())
  }

  return parts.join(' · ') || `On ${trigger.tableName}`
}
const buildSequenceSubtitle = (sequence: PgmlSequence) => {
  const ownedBy = getMetadataValue(sequence.metadata, 'owned_by')

  if (ownedBy) {
    return `Owned by ${ownedBy}`
  }

  return 'Sequence'
}
const buildIndexSubtitle = (index: PgmlSchemaModel['tables'][number]['indexes'][number]) => {
  const parts = [index.type.toUpperCase()]

  if (index.columns.length) {
    parts.push(index.columns.join(', '))
  }

  return parts.join(' · ')
}
const getRoutinePrimaryTableIds = (routine: PgmlRoutine) => {
  const candidateGroups = routine.affects
    ? [routine.affects.ownedBy, routine.affects.sets, routine.affects.writes]
    : []

  for (const values of candidateGroups) {
    const tableIds = getUniqueTableIds(getImpactTargetsFromValues(values))

    if (tableIds.length) {
      return tableIds
    }
  }

  const inferredTableIds = getUniqueTableIds(inferRoutineTargets(routine))

  return inferredTableIds
}
const getSequenceOwnedTableIds = (sequence: PgmlSequence) => {
  const metadataOwnedBy = getMetadataValue(sequence.metadata, 'owned_by')
  const explicitOwnedBy = sequence.affects?.ownedBy || []
  const values = metadataOwnedBy
    ? [metadataOwnedBy, ...explicitOwnedBy]
    : explicitOwnedBy

  return getUniqueTableIds(getImpactTargetsFromValues(values))
}
const triggerTableIdsByRoutineName = computed(() => {
  const mapping = new Map<string, string[]>()

  model.triggers.forEach((trigger) => {
    const routineName = getMetadataValue(trigger.metadata, 'function')

    if (!routineName) {
      return
    }

    const normalizedRoutineName = cleanForSearch(routineName.split('.').at(-1) || routineName)
    const nextTableIds = mapping.get(normalizedRoutineName) || []

    nextTableIds.push(normalizeReference(trigger.tableName))
    mapping.set(normalizedRoutineName, uniqueValues(nextTableIds))
  })

  return mapping
})
const tableAttachmentState = computed(() => {
  const attachmentsByTableId: Record<string, TableAttachment[]> = {}
  const attachedObjectIds = new Set<string>()
  const addAttachment = (attachment: TableAttachment) => {
    if (!attachmentsByTableId[attachment.tableId]) {
      attachmentsByTableId[attachment.tableId] = []
    }

    attachmentsByTableId[attachment.tableId]?.push(attachment)
    attachedObjectIds.add(attachment.id)
  }

  model.tables.forEach((table) => {
    table.indexes.forEach((index) => {
      getResolvedTableIds([normalizeReference(index.tableName)]).forEach((tableId) => {
        addAttachment({
          id: `index:${index.name}`,
          kind: 'Index',
          title: index.name,
          subtitle: buildIndexSubtitle(index),
          details: [
            `Type: ${index.type.toUpperCase()}`,
            `Columns: ${index.columns.join(', ')}`
          ],
          tableId,
          color: attachmentKindColors.Index,
          flags: [],
          sourceRange: index.sourceRange
        })
      })
    })

    table.constraints.forEach((constraint) => {
      getResolvedTableIds([normalizeReference(constraint.tableName)]).forEach((tableId) => {
        addAttachment({
          id: `constraint:${constraint.name}`,
          kind: 'Constraint',
          title: constraint.name,
          subtitle: constraint.expression,
          details: [constraint.expression],
          tableId,
          color: attachmentKindColors.Constraint,
          flags: [],
          sourceRange: constraint.sourceRange
        })
      })
    })
  })

  model.triggers.forEach((trigger) => {
    getResolvedTableIds([normalizeReference(trigger.tableName)]).forEach((tableId) => {
      addAttachment({
        id: `trigger:${trigger.name}`,
        kind: 'Trigger',
        title: trigger.name,
        subtitle: buildTriggerSubtitle(trigger),
        details: trigger.details,
        tableId,
        color: attachmentKindColors.Trigger,
        flags: [],
        sourceRange: trigger.sourceRange
      })
    })
  })

  model.functions.forEach((routine) => {
    const routineId = `function:${routine.name}`
    const triggerTableIds = triggerTableIdsByRoutineName.value.get(cleanForSearch(routine.name)) || []
    const tableIds = getResolvedTableIds(triggerTableIds.length ? triggerTableIds : getRoutinePrimaryTableIds(routine))

    tableIds.forEach((tableId) => {
      addAttachment({
        id: routineId,
        kind: 'Function',
        title: routine.name,
        subtitle: routine.signature,
        details: routine.details,
        tableId,
        color: attachmentKindColors.Function,
        flags: triggerTableIds.length
          ? [{ key: 'trigger-call', label: 'TRIGGER', color: triggerCallFlagColor }]
          : [],
        sourceRange: routine.sourceRange
      })
    })
  })

  model.procedures.forEach((procedure) => {
    const procedureId = `procedure:${procedure.name}`
    const triggerTableIds = triggerTableIdsByRoutineName.value.get(cleanForSearch(procedure.name)) || []
    const tableIds = getResolvedTableIds(triggerTableIds.length ? triggerTableIds : getRoutinePrimaryTableIds(procedure))

    tableIds.forEach((tableId) => {
      addAttachment({
        id: procedureId,
        kind: 'Procedure',
        title: procedure.name,
        subtitle: procedure.signature,
        details: procedure.details,
        tableId,
        color: attachmentKindColors.Procedure,
        flags: triggerTableIds.length
          ? [{ key: 'trigger-call', label: 'TRIGGER', color: triggerCallFlagColor }]
          : [],
        sourceRange: procedure.sourceRange
      })
    })
  })

  model.sequences.forEach((sequence) => {
    const tableIds = getResolvedTableIds(getSequenceOwnedTableIds(sequence))

    tableIds.forEach((tableId) => {
      addAttachment({
        id: `sequence:${sequence.name}`,
        kind: 'Sequence',
        title: sequence.name,
        subtitle: buildSequenceSubtitle(sequence),
        details: sequence.details,
        tableId,
        color: attachmentKindColors.Sequence,
        flags: [],
        sourceRange: sequence.sourceRange
      })
    })
  })

  Object.values(attachmentsByTableId).forEach((attachments) => {
    attachments.sort((left, right) => {
      const orderDelta = attachmentKindOrder[left.kind] - attachmentKindOrder[right.kind]

      if (orderDelta !== 0) {
        return orderDelta
      }

      return left.title.localeCompare(right.title)
    })
  })

  return {
    attachmentsByTableId,
    attachedObjectIds
  }
})
const tableRowsByTableId = computed(() => {
  return model.tables.reduce<Record<string, TableRow[]>>((rowsByTableId, table) => {
    const rows: TableRow[] = [
      ...table.columns.map((column) => {
        return {
          kind: 'column' as const,
          key: `${table.fullName}.${column.name}`,
          tableId: table.fullName,
          column
        }
      }),
      ...(tableAttachmentState.value.attachmentsByTableId[table.fullName] || []).map((attachment) => {
        return {
          kind: 'attachment' as const,
          key: attachment.id,
          tableId: table.fullName,
          attachment
        }
      })
    ].filter((row) => {
      if (row.kind === 'attachment') {
        return isEntityDirectlyVisible(row.attachment.id)
      }

      return true
    })

    rowsByTableId[table.fullName] = rows
    return rowsByTableId
  }, {})
})
const getTableRows = (tableId: string) => tableRowsByTableId.value[tableId] || []
const browserGroupNames = computed(() => {
  return model.groups.map(group => group.name)
})
const diagramGroupNames = computed(() => {
  return browserGroupNames.value.filter(groupName => isGroupDirectlyVisible(groupName))
})
const buildBrowserTableItem = (table: PgmlSchemaModel['tables'][number]): EntityBrowserItem => {
  const columns = table.columns.map<EntityBrowserItem>((column) => {
    return {
      id: `${table.fullName}.${column.name}`,
      kind: 'column',
      label: column.name,
      subtitle: '',
      kindLabel: 'Field',
      searchText: cleanForSearch(`field ${column.name} ${column.type} ${table.fullName}`),
      children: [],
      selection: {
        kind: 'table',
        tableId: table.fullName
      },
      sourceRange: table.sourceRange
    }
  })
  const attachments = (tableAttachmentState.value.attachmentsByTableId[table.fullName] || []).map<EntityBrowserItem>((attachment) => {
    return {
      id: attachment.id,
      kind: 'attachment',
      label: attachment.title,
      subtitle: '',
      kindLabel: attachment.kind,
      searchText: cleanForSearch(`${attachment.kind} ${attachment.title} ${attachment.subtitle} ${attachment.details.join(' ')}`),
      children: [],
      selection: {
        kind: 'attachment',
        tableId: table.fullName,
        attachmentId: attachment.id
      },
      sourceRange: attachment.sourceRange
    }
  })

  return {
    id: table.fullName,
    kind: 'table',
    label: table.name,
    subtitle: '',
    kindLabel: 'Table',
    searchText: cleanForSearch(`table ${table.fullName} ${table.note || ''}`),
    children: [...columns, ...attachments],
    selection: {
      kind: 'table',
      tableId: table.fullName
    },
    sourceRange: table.sourceRange
  }
}
const standaloneBrowserItems = computed(() => {
  const items: EntityBrowserItem[] = []
  const attachedObjectIds = tableAttachmentState.value.attachedObjectIds
  const pushNodeItem = (
    id: string,
    label: string,
    kindLabel: string,
    subtitle: string
  ) => {
    items.push({
      id,
      kind: 'object',
      label,
      subtitle: '',
      kindLabel,
      searchText: cleanForSearch(`${kindLabel} ${label} ${subtitle}`),
      children: [],
      selection: {
        kind: 'node',
        id
      },
      sourceRange: model.functions.find(entry => `function:${entry.name}` === id)?.sourceRange
        || model.procedures.find(entry => `procedure:${entry.name}` === id)?.sourceRange
        || model.triggers.find(entry => `trigger:${entry.name}` === id)?.sourceRange
        || model.sequences.find(entry => `sequence:${entry.name}` === id)?.sourceRange
        || model.customTypes.find(entry => `custom-type:${entry.kind}:${entry.name}` === id)?.sourceRange
    })
  }

  model.functions.forEach((routine) => {
    const id = `function:${routine.name}`

    if (!attachedObjectIds.has(id)) {
      pushNodeItem(id, routine.name, 'Function', routine.signature)
    }
  })

  model.procedures.forEach((routine) => {
    const id = `procedure:${routine.name}`

    if (!attachedObjectIds.has(id)) {
      pushNodeItem(id, routine.name, 'Procedure', routine.signature)
    }
  })

  model.triggers.forEach((trigger) => {
    const id = `trigger:${trigger.name}`

    if (!attachedObjectIds.has(id)) {
      pushNodeItem(id, trigger.name, 'Trigger', buildTriggerSubtitle(trigger))
    }
  })

  model.sequences.forEach((sequence) => {
    const id = `sequence:${sequence.name}`

    if (!attachedObjectIds.has(id)) {
      pushNodeItem(id, sequence.name, 'Sequence', buildSequenceSubtitle(sequence))
    }
  })

  model.customTypes.forEach((customType) => {
    const id = `custom-type:${customType.kind}:${customType.name}`

    pushNodeItem(id, customType.name, customType.kind, customType.details.join(' '))
  })

  return items.sort((left, right) => {
    const kindDelta = left.kindLabel.localeCompare(right.kindLabel)

    if (kindDelta !== 0) {
      return kindDelta
    }

    return left.label.localeCompare(right.label)
  })
})
const ungroupedBrowserItems = computed(() => {
  return model.tables
    .filter(table => !getTableGroupName(table))
    .map(table => buildBrowserTableItem(table))
})
const groupedBrowserItems = computed(() => {
  return browserGroupNames.value.map((groupName) => {
    const tables = getGroupTables(groupName)
    const tableItems = tables.map(table => buildBrowserTableItem(table))

    const group = model.groups.find(entry => entry.name === groupName)

    return {
      id: getStoredGroupId(groupName),
      kind: 'group',
      label: groupName,
      subtitle: `${tables.length} table${tables.length === 1 ? '' : 's'}`,
      kindLabel: 'Group',
      searchText: cleanForSearch(`group ${groupName}`),
      children: tableItems,
      selection: {
        kind: 'node',
        id: getStoredGroupId(groupName)
      },
      sourceRange: group?.sourceRange
    } satisfies EntityBrowserItem
  })
})
const filterEntityBrowserItems = (items: EntityBrowserItem[], query: string): EntityBrowserItem[] => {
  const normalizedQuery = cleanForSearch(query).trim()

  if (!normalizedQuery) {
    return items
  }

  return items.flatMap((item) => {
    const filteredChildren = filterEntityBrowserItems(item.children, normalizedQuery)

    if (item.kind === 'group') {
      if (item.searchText.includes(normalizedQuery)) {
        return [{
          ...item,
          children: []
        }]
      }

      if (filteredChildren.length > 0) {
        return [{
          ...item,
          children: filteredChildren
        }]
      }

      return []
    }

    if (item.kind === 'table') {
      if (item.searchText.includes(normalizedQuery) || filteredChildren.length > 0) {
        return [{
          ...item,
          children: item.children
        }]
      }

      return []
    }

    if (item.searchText.includes(normalizedQuery)) {
      return [{
        ...item,
        children: []
      }]
    }

    return []
  })
}
const filteredGroupedBrowserItems = computed(() => {
  return filterEntityBrowserItems(groupedBrowserItems.value, entitySearchQuery.value)
})
const filteredUngroupedBrowserItems = computed(() => {
  return filterEntityBrowserItems(ungroupedBrowserItems.value, entitySearchQuery.value)
})
const filteredStandaloneBrowserItems = computed(() => {
  return filterEntityBrowserItems(standaloneBrowserItems.value, entitySearchQuery.value)
})
const normalizedEntitySearchQuery = computed(() => cleanForSearch(entitySearchQuery.value).trim())
const hiddenEntityCount = computed(() => {
  return Object.values(model.nodeProperties).filter(properties => properties.visible === false).length
})

const buildGroupRelationWeights = (groupNames: string[]) => {
  const weights: Record<string, Record<string, number>> = {}

  groupNames.forEach((groupName) => {
    weights[groupName] = {}
  })

  for (const reference of model.references) {
    const fromGroup = getGroupNameForTableId(reference.fromTable)
    const toGroup = getGroupNameForTableId(reference.toTable)

    if (!fromGroup || !toGroup || fromGroup === toGroup) {
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
    .filter(node => node.kind === 'group' || node.kind === 'table')
    .map(node => getNodeRect(node))
  const groupWeights = buildGroupRelationWeights(
    groupRects
      .filter(rect => rect.id.startsWith('group:'))
      .map(rect => rect.id.replace('group:', ''))
  )

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

const autoLayoutFloatingTables = (
  tableNodes: CanvasNodeState[],
  states: Record<string, CanvasNodeState>
) => {
  const positions: Record<string, { x: number, y: number }> = {}
  const groupRects = Object.values(states)
    .filter(node => node.kind === 'group')
    .map(node => getNodeRect(node))
  const placedTables: LayoutRect[] = []
  const orderedTables = [...tableNodes].sort((left, right) => left.title.localeCompare(right.title))

  orderedTables.forEach((tableNode, index) => {
    const relatedTableIds = uniqueValues(model.references.flatMap((reference) => {
      if (reference.fromTable === tableNode.id) {
        return [reference.toTable]
      }

      if (reference.toTable === tableNode.id) {
        return [reference.fromTable]
      }

      return []
    }))
    const relatedRects = getRelatedHostRectsForTableIds(relatedTableIds, {
      ...states,
      ...Object.fromEntries(placedTables.map(rect => [rect.id, {
        id: rect.id,
        kind: 'table',
        collapsed: false,
        title: rect.id,
        subtitle: '',
        details: [],
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        color: '#38bdf8',
        tableIds: [rect.id]
      } satisfies CanvasNodeState]))
    })
    const centroid = relatedRects.length
      ? relatedRects.reduce((sum, rect) => {
          const center = getRectCenter(rect)

          return {
            x: sum.x + center.x,
            y: sum.y + center.y
          }
        }, { x: 0, y: 0 })
      : { x: 140, y: 120 + index * 180 }
    const centroidPoint = relatedRects.length
      ? {
          x: centroid.x / relatedRects.length,
          y: centroid.y / relatedRects.length
        }
      : centroid
    const candidates = relatedRects.length
      ? dedupeCandidates([
          ...relatedRects.flatMap((rect) => {
            return [72, 132, 212].flatMap((distance) => {
              return [
                {
                  x: rect.x + rect.width + distance,
                  y: rect.y + 18
                },
                {
                  x: rect.x - tableNode.width - distance,
                  y: rect.y + 18
                },
                {
                  x: rect.x + clamp((rect.width - tableNode.width) / 2, -tableNode.width / 2, rect.width),
                  y: rect.y + rect.height + distance
                },
                {
                  x: rect.x + clamp((rect.width - tableNode.width) / 2, -tableNode.width / 2, rect.width),
                  y: rect.y - tableNode.height - distance
                }
              ]
            })
          }),
          ...buildRingCandidates(centroidPoint, tableNode.width, tableNode.height, [84, 160, 260]),
          {
            x: 140 + (index % 2) * (tableNode.width + 96),
            y: 120 + Math.floor(index / 2) * 220
          }
        ])
      : [
          {
            x: 140 + (index % 2) * (tableNode.width + 96),
            y: 120 + Math.floor(index / 2) * 220
          }
        ]

    const bestCandidate = candidates
      .map((candidate) => {
        const nextRect: LayoutRect = {
          id: tableNode.id,
          x: Math.max(72, Math.round(candidate.x / 12) * 12),
          y: Math.max(72, Math.round(candidate.y / 12) * 12),
          width: tableNode.width,
          height: tableNode.height
        }
        const occupiedRects = [...groupRects, ...placedTables]
        const overlapMetrics = getOverlapMetrics(
          nextRect,
          occupiedRects,
          rect => rect.id.startsWith('group:') ? 44 : 22
        )
        const nextCenter = getRectCenter(nextRect)
        const relationDistance = occupiedRects.reduce((sum, rect) => {
          const rectCenter = getRectCenter(rect)
          const distance = Math.hypot(nextCenter.x - rectCenter.x, nextCenter.y - rectCenter.y)
          const relationScore = relatedRects.some(relatedRect => relatedRect.id === rect.id)
            ? distance * 0.72
            : Math.max(0, 180 - distance) * 0.9

          return sum + relationScore
        }, 0)

        return {
          candidate: nextRect,
          metrics: {
            overlapCount: overlapMetrics.overlapCount,
            overlapArea: overlapMetrics.overlapArea,
            relationDistance,
            midpointDistance: Math.hypot(nextCenter.x - centroidPoint.x, nextCenter.y - centroidPoint.y),
            crossingCount: 0,
            lineHitCount: 0,
            originDistance: Math.hypot(nextRect.x - centroidPoint.x, nextRect.y - centroidPoint.y)
          } satisfies PlacementMetrics
        }
      })
      .sort((left, right) => comparePlacementMetrics(left.metrics, right.metrics))[0]

    const resolvedCandidate = bestCandidate?.candidate || {
      id: tableNode.id,
      x: 140 + (index % 2) * (tableNode.width + 96),
      y: 120 + Math.floor(index / 2) * 220,
      width: tableNode.width,
      height: tableNode.height
    }

    positions[tableNode.id] = {
      x: resolvedCandidate.x,
      y: resolvedCandidate.y
    }
    placedTables.push(resolvedCandidate)
  })

  return positions
}

const autoLayoutObjectNodes = (objectNodes: CanvasNodeState[], groupStates: Record<string, CanvasNodeState>) => {
  const positions: Record<string, { x: number, y: number }> = {}
  const placedObjects: LayoutRect[] = []
  const groupRects = Object.values(groupStates)
    .filter(node => node.kind === 'group' || node.kind === 'table')
    .map(node => getNodeRect(node))
  const placedConnections = buildPlacedGroupConnections(groupRects, buildGroupRelationWeights(groupRects.map(rect => rect.id.replace('group:', ''))))
  const orderedObjects = [...objectNodes].sort((left, right) => {
    if (right.tableIds.length !== left.tableIds.length) {
      return right.tableIds.length - left.tableIds.length
    }

    return left.title.localeCompare(right.title)
  })

  orderedObjects.forEach((objectNode, index) => {
    const relatedRects = getRelatedHostRectsForTableIds(objectNode.tableIds, groupStates)
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
  const attachedObjectIds = tableAttachmentState.value.attachedObjectIds

  const resolveHostId = (tableIds: string[]) => {
    const firstTable = model.tables.find(table => tableIds.includes(table.fullName))
    const groupName = firstTable?.groupName

    return groupName ? `group:${groupName}` : firstTable?.fullName || 'floating'
  }

  const nextPosition = (tableIds: string[], kind: ObjectKind) => {
    const hostId = resolveHostId(tableIds)
    const groupNode = groupStates[hostId]
    const laneKey = `${hostId}:${kind === 'Function' || kind === 'Procedure' || kind === 'Trigger' || kind === 'Sequence' ? 'bottom' : 'side'}`
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
      const indexId = `index:${index.name}`

      if (!isEntityDirectlyVisible(indexId)) {
        continue
      }

      if (attachedObjectIds.has(indexId)) {
        continue
      }

      addNode({
        id: indexId,
        kind: 'object',
        objectKind: 'Index',
        collapsed: true,
        title: index.name,
        subtitle: `${index.type.toUpperCase()} on ${table.name}`,
        details: [
          `Type: ${index.type.toUpperCase()}`,
          `Columns: ${index.columns.join(', ')}`
        ],
        width: 248,
        height: 104,
        expandedHeight: 104,
        color: attachmentKindColors.Index,
        tableIds: [normalizeReference(index.tableName)],
        impactTargets: inferIndexTargets(index),
        sourceRange: index.sourceRange
      })
    }
  }

  for (const table of model.tables) {
    for (const constraint of table.constraints) {
      const constraintId = `constraint:${constraint.name}`

      if (!isEntityDirectlyVisible(constraintId)) {
        continue
      }

      if (attachedObjectIds.has(constraintId)) {
        continue
      }

      addNode({
        id: constraintId,
        kind: 'object',
        objectKind: 'Constraint',
        collapsed: true,
        title: constraint.name,
        subtitle: constraint.expression,
        details: [constraint.expression],
        width: 320,
        height: 114,
        expandedHeight: 114,
        color: attachmentKindColors.Constraint,
        tableIds: [normalizeReference(constraint.tableName)],
        impactTargets: inferConstraintTargets(constraint),
        sourceRange: constraint.sourceRange
      })
    }
  }

  for (const pgFunction of model.functions) {
    const functionId = `function:${pgFunction.name}`

    if (!isEntityDirectlyVisible(functionId)) {
      continue
    }

    if (attachedObjectIds.has(functionId)) {
      continue
    }

    const impactTargets = inferRoutineTargets(pgFunction)

    addNode({
      id: functionId,
      kind: 'object',
      objectKind: 'Function',
      collapsed: true,
      title: pgFunction.name,
      subtitle: pgFunction.signature,
      details: pgFunction.details,
      width: 336,
      height: 176,
      expandedHeight: 176,
      color: attachmentKindColors.Function,
      tableIds: uniqueValues(impactTargets.map(target => target.tableId)),
      impactTargets,
      sourceRange: pgFunction.sourceRange
    })
  }

  for (const procedure of model.procedures) {
    const procedureId = `procedure:${procedure.name}`

    if (!isEntityDirectlyVisible(procedureId)) {
      continue
    }

    if (attachedObjectIds.has(procedureId)) {
      continue
    }

    const impactTargets = inferRoutineTargets(procedure)

    addNode({
      id: procedureId,
      kind: 'object',
      objectKind: 'Procedure',
      collapsed: true,
      title: procedure.name,
      subtitle: procedure.signature,
      details: procedure.details,
      width: 320,
      height: 156,
      expandedHeight: 156,
      color: attachmentKindColors.Procedure,
      tableIds: uniqueValues(impactTargets.map(target => target.tableId)),
      impactTargets,
      sourceRange: procedure.sourceRange
    })
  }

  for (const trigger of model.triggers) {
    const triggerId = `trigger:${trigger.name}`

    if (!isEntityDirectlyVisible(triggerId)) {
      continue
    }

    if (attachedObjectIds.has(triggerId)) {
      continue
    }

    const tableId = normalizeReference(trigger.tableName)

    addNode({
      id: triggerId,
      kind: 'object',
      objectKind: 'Trigger',
      collapsed: true,
      title: trigger.name,
      subtitle: `On ${trigger.tableName}`,
      details: trigger.details,
      width: 332,
      height: 168,
      expandedHeight: 168,
      color: attachmentKindColors.Trigger,
      tableIds: [tableId],
      impactTargets: inferTriggerTargets(tableId, trigger),
      sourceRange: trigger.sourceRange
    })
  }

  for (const sequence of model.sequences) {
    const sequenceId = `sequence:${sequence.name}`

    if (!isEntityDirectlyVisible(sequenceId)) {
      continue
    }

    if (attachedObjectIds.has(sequenceId)) {
      continue
    }

    const impactTargets = inferSequenceTargets(sequence)

    addNode({
      id: sequenceId,
      kind: 'object',
      objectKind: 'Sequence',
      collapsed: true,
      title: sequence.name,
      subtitle: 'Sequence',
      details: sequence.details,
      width: 308,
      height: 156,
      expandedHeight: 156,
      color: attachmentKindColors.Sequence,
      tableIds: uniqueValues(impactTargets.map(target => target.tableId)),
      impactTargets,
      sourceRange: sequence.sourceRange
    })
  }

  for (const customType of model.customTypes) {
    const customTypeId = `custom-type:${customType.kind}:${customType.name}`

    if (!isEntityDirectlyVisible(customTypeId)) {
      continue
    }

    const impactTargets = inferCustomTypeTargets(customType)

    addNode({
      id: customTypeId,
      kind: 'object',
      objectKind: 'Custom Type',
      collapsed: true,
      title: customType.name,
      subtitle: customType.kind,
      details: customType.details,
      width: 258,
      height: 114,
      expandedHeight: 114,
      color: '#14b8a6',
      tableIds: uniqueValues(impactTargets.map(target => target.tableId)),
      impactTargets,
      sourceRange: customType.sourceRange
    })
  }

  return nodes
}

const syncNodeStates = () => {
  const nextStates: Record<string, CanvasNodeState> = {}
  const orderedNames = [...diagramGroupNames.value]
  const groupNodes: CanvasNodeState[] = []
  const floatingTableNodes: CanvasNodeState[] = []

  orderedNames.forEach((groupName, index) => {
    const tables = getRenderedGroupTables(groupName)
    const groupId = getStoredGroupId(groupName)
    const existing = nodeStates.value[`group:${groupName}`]
    const storedLayout = model.nodeProperties[groupId]
    const color = storedLayout?.color || existing?.color || palette[index % palette.length] || '#8b5cf6'
    const columnCount = getGroupSafeColumnCount(
      storedLayout?.tableColumns ?? existing?.columnCount ?? 1,
      tables.length
    )
    const masonry = storedLayout?.masonry ?? existing?.masonry ?? false
    const note = model.groups.find(group => group.name === groupName)?.note || null
    const minimumSize = getGroupMinimumSize(groupName, columnCount, masonry)

    groupNodes.push({
      id: groupId,
      kind: 'group',
      collapsed: false,
      masonry,
      title: groupName,
      subtitle: note || '',
      details: tables.map(table => table.fullName),
      x: storedLayout?.x ?? existing?.x ?? 120 + index * 420,
      y: storedLayout?.y ?? existing?.y ?? 90 + (index % 2) * 120,
      width: minimumSize.minWidth,
      height: minimumSize.minHeight,
      expandedHeight: minimumSize.minHeight,
      color,
      tableIds: tables.map(table => table.fullName),
      tableCount: tables.length,
      columnCount,
      note,
      minWidth: minimumSize.minWidth,
      minHeight: minimumSize.minHeight,
      hasStoredLayout: Boolean(storedLayout)
    })
  })

  const groupPositions = autoLayoutGroups(groupNodes)

  for (const groupNode of groupNodes) {
    const existing = nodeStates.value[groupNode.id]
    const storedLayout = model.nodeProperties[groupNode.id]

    nextStates[groupNode.id] = {
      ...groupNode,
      x: storedLayout?.x ?? existing?.x ?? groupPositions[groupNode.id]?.x ?? groupNode.x,
      y: storedLayout?.y ?? existing?.y ?? groupPositions[groupNode.id]?.y ?? groupNode.y
    }
  }

  for (const table of visibleTables.value.filter(entry => !getTableGroupName(entry))) {
    const existing = nodeStates.value[table.fullName]
    const storedLayout = model.nodeProperties[table.fullName]

    floatingTableNodes.push({
      id: table.fullName,
      kind: 'table',
      collapsed: false,
      title: table.name,
      subtitle: `${table.schema} schema`,
      details: [],
      x: storedLayout?.x ?? existing?.x ?? 140,
      y: storedLayout?.y ?? existing?.y ?? 120,
      width: existing?.width ?? groupTableWidth,
      height: existing?.height ?? estimateTableHeight(getTableRows(table.fullName).length),
      expandedHeight: existing?.expandedHeight ?? estimateTableHeight(getTableRows(table.fullName).length),
      color: storedLayout?.color || existing?.color || '#38bdf8',
      tableIds: [table.fullName],
      minWidth: groupTableWidth,
      minHeight: estimateTableHeight(getTableRows(table.fullName).length),
      hasStoredLayout: Boolean(storedLayout),
      sourceRange: table.sourceRange
    })
  }

  const floatingTablePositions = autoLayoutFloatingTables(floatingTableNodes, nextStates)

  for (const tableNode of floatingTableNodes) {
    const existing = nodeStates.value[tableNode.id]
    const storedLayout = model.nodeProperties[tableNode.id]

    nextStates[tableNode.id] = {
      ...tableNode,
      x: storedLayout?.x ?? existing?.x ?? floatingTablePositions[tableNode.id]?.x ?? tableNode.x,
      y: storedLayout?.y ?? existing?.y ?? floatingTablePositions[tableNode.id]?.y ?? tableNode.y
    }
  }

  const objectNodes = buildObjectNodes(nextStates)
  const objectPositions = autoLayoutObjectNodes(objectNodes, nextStates)

  for (const objectNode of objectNodes) {
    const existing = nodeStates.value[objectNode.id]
    const storedLayout = model.nodeProperties[objectNode.id]
    const collapsed = objectNode.objectKind === 'Custom Type'
      ? storedLayout?.collapsed ?? existing?.collapsed ?? true
      : existing?.collapsed ?? true
    const expandedHeight = Math.max(
      existing?.expandedHeight
      ?? (existing?.collapsed ? objectNode.expandedHeight || objectNode.height : existing?.height)
      ?? objectNode.expandedHeight
      ?? objectNode.height,
      objectNode.expandedHeight || objectNode.height
    )

    nextStates[objectNode.id] = {
      ...objectNode,
      collapsed,
      x: storedLayout?.x ?? existing?.x ?? objectPositions[objectNode.id]?.x ?? objectNode.x,
      y: storedLayout?.y ?? existing?.y ?? objectPositions[objectNode.id]?.y ?? objectNode.y,
      width: existing?.width ?? objectNode.width,
      height: collapsed ? existing?.height ?? collapsedObjectHeight : expandedHeight,
      expandedHeight,
      color: storedLayout?.color || existing?.color || objectNode.color,
      minWidth: existing?.minWidth ?? objectNode.width,
      minHeight: collapsed ? existing?.minHeight ?? collapsedObjectHeight : existing?.minHeight ?? objectNode.height,
      hasStoredLayout: Boolean(storedLayout)
    }
  }

  nodeStates.value = nextStates

  if (selectedNodeId.value && !nodeStates.value[selectedNodeId.value]) {
    selectedNodeId.value = null
  }

  if (selectedCanvasSelection.value?.kind === 'node' && !nodeStates.value[selectedCanvasSelection.value.id]) {
    selectedCanvasSelection.value = null
  }

  const tableSelection = selectedCanvasSelection.value

  if (
    tableSelection?.kind === 'table'
    && !model.tables.some((table) => {
      return table.fullName === tableSelection.tableId && isTableEffectivelyVisible(table)
    })
  ) {
    selectedCanvasSelection.value = null
  }

  const attachmentSelection = selectedCanvasSelection.value

  if (attachmentSelection?.kind === 'attachment') {
    const attachments = tableAttachmentState.value.attachmentsByTableId[attachmentSelection.tableId] || []
    const hasAttachment = attachments.some((attachment) => {
      return (
        attachment.id === attachmentSelection.attachmentId
        && isAttachmentEffectivelyVisible(attachmentSelection.tableId, attachment.id)
      )
    })

    if (!hasAttachment) {
      selectedCanvasSelection.value = null
    }
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
const getConnectionOwnerNodeId = (element: HTMLElement) => {
  const owner = element.closest('[data-node-anchor]')

  if (!(owner instanceof HTMLElement)) {
    return null
  }

  return owner.getAttribute('data-node-anchor')
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
const browserItemSelectionEquals = (left: CanvasSelection | null, right: CanvasSelection) => {
  if (!left || left.kind !== right.kind) {
    return false
  }

  if (left.kind === 'node' && right.kind === 'node') {
    return left.id === right.id
  }

  if (left.kind === 'table' && right.kind === 'table') {
    return left.tableId === right.tableId
  }

  if (left.kind === 'attachment' && right.kind === 'attachment') {
    return left.tableId === right.tableId && left.attachmentId === right.attachmentId
  }

  return false
}
const isBrowserItemSelected = (item: EntityBrowserItem) => {
  return browserItemSelectionEquals(selectedCanvasSelection.value, item.selection)
}
const browserItemSupportsVisibility = (item: EntityBrowserItem) => item.kind !== 'column'
const isBrowserItemDirectlyVisible = (item: EntityBrowserItem) => {
  const selection = item.selection

  if (selection.kind === 'table') {
    return isEntityDirectlyVisible(selection.tableId)
  }

  if (selection.kind === 'attachment') {
    return isEntityDirectlyVisible(selection.attachmentId)
  }

  return isEntityDirectlyVisible(selection.id)
}
const isBrowserItemEffectivelyVisible = (item: EntityBrowserItem) => {
  const selection = item.selection

  if (selection.kind === 'table') {
    const table = model.tables.find(entry => entry.fullName === selection.tableId)

    return table ? isTableEffectivelyVisible(table) : false
  }

  if (selection.kind === 'attachment') {
    return isAttachmentEffectivelyVisible(selection.tableId, selection.attachmentId)
  }

  if (selection.id.startsWith('group:')) {
    return isGroupDirectlyVisible(selection.id.replace(/^group:/, ''))
  }

  return isEntityDirectlyVisible(selection.id)
}
const isBrowserItemHiddenByAncestor = (item: EntityBrowserItem) => {
  return !isBrowserItemEffectivelyVisible(item) && isBrowserItemDirectlyVisible(item)
}
const getBrowserItemVisibilityButtonClass = (
  item: EntityBrowserItem,
  compact = false
) => {
  // Hidden descendants keep the same button API but render in a disabled state
  // so the tree explains why an item cannot be toggled independently.
  return getStudioStateButtonClass({
    compact,
    disabled: isBrowserItemHiddenByAncestor(item),
    emphasized: !isBrowserItemDirectlyVisible(item),
    extraClass: 'shrink-0'
  })
}
const getBrowserItemTableId = (item: EntityBrowserItem) => {
  const selection = item.selection

  if (selection.kind === 'table') {
    return selection.tableId
  }

  if (selection.kind === 'attachment') {
    return selection.tableId
  }

  return null
}
const getBrowserItemAccentColor = (item: EntityBrowserItem) => {
  const tableId = getBrowserItemTableId(item)

  if (tableId) {
    return tableGroupColorByTableId.value[tableId] || nodeStates.value[tableId]?.color || '#79e3ea'
  }

  if (item.selection.kind === 'node') {
    return nodeStates.value[item.selection.id]?.color || '#79e3ea'
  }

  return '#79e3ea'
}
const isBrowserItemSearchMatch = (item: EntityBrowserItem) => {
  const normalizedQuery = normalizedEntitySearchQuery.value

  return normalizedQuery.length > 0 && item.searchText.includes(normalizedQuery)
}
const getBrowserItemSearchMatchStyle = (item: EntityBrowserItem) => {
  if (!isBrowserItemSearchMatch(item)) {
    return undefined
  }

  return {
    '--pgml-browser-match-color': getBrowserItemAccentColor(item)
  }
}
const getBrowserItemVisibilityId = (item: EntityBrowserItem) => {
  if (!browserItemSupportsVisibility(item)) {
    return null
  }

  if (item.selection.kind === 'table') {
    return item.selection.tableId
  }

  if (item.selection.kind === 'attachment') {
    return item.selection.attachmentId
  }

  return item.selection.id
}
const toggleBrowserItemVisibility = (item: EntityBrowserItem) => {
  if (isBrowserItemHiddenByAncestor(item)) {
    return
  }

  const visibilityId = getBrowserItemVisibilityId(item)

  if (!visibilityId) {
    return
  }

  updateEntityVisibility(visibilityId, !isBrowserItemDirectlyVisible(item))
}
const focusBrowserItemSource = (item: EntityBrowserItem) => {
  focusSourceRange(item.sourceRange)
}
const selectBrowserItem = (item: EntityBrowserItem) => {
  if (!isBrowserItemEffectivelyVisible(item)) {
    return
  }

  const selection = item.selection

  if (selection.kind === 'node') {
    const node = nodeStates.value[selection.id]

    if (node) {
      handleNodeClick(node)
    }

    return
  }

  if (selection.kind === 'table') {
    handleTableClick(selection.tableId)
    return
  }

  const attachment = tableAttachmentState.value.attachmentsByTableId[selection.tableId]
    ?.find(entry => entry.id === selection.attachmentId)

  if (attachment) {
    handleAttachmentClick(selection.tableId, attachment)
  }
}
const toggleSidePanel = () => {
  if (isMobileCanvasShell.value) {
    return
  }

  isDesktopSidePanelOpen.value = !isDesktopSidePanelOpen.value
}
const getSelectionGlowStyle = (color: string) => {
  return {
    '--pgml-selection-color': color,
    '--pgml-selection-border': `color-mix(in srgb, ${color} 78%, white 22%)`,
    '--pgml-selection-shadow-near': `color-mix(in srgb, ${color} 48%, transparent)`,
    '--pgml-selection-shadow-far': `color-mix(in srgb, ${color} 24%, transparent)`
  }
}
const getReferenceRaceStyle = (color: string) => {
  return {
    '--pgml-reference-race-color': color,
    '--pgml-reference-race-soft': `color-mix(in srgb, ${color} 32%, transparent)`,
    '--pgml-reference-race-strong': `color-mix(in srgb, ${color} 68%, transparent)`,
    '--pgml-reference-race-solid': `color-mix(in srgb, ${color} 88%, white 12%)`
  }
}
const getNodeBorderColor = (node: CanvasNodeState) => {
  return node.kind === 'group'
    ? `color-mix(in srgb, ${node.color} 38%, var(--studio-node-border-neutral) 62%)`
    : `color-mix(in srgb, ${node.color} 62%, var(--studio-node-border-neutral) 38%)`
}
const getNodeBackground = (node: CanvasNodeState) => {
  if (node.kind === 'group') {
    return `linear-gradient(180deg, color-mix(in srgb, ${node.color} 12%, transparent), var(--studio-group-surface-soft) 22%), var(--studio-group-surface)`
  }

  if (node.kind === 'table') {
    return `color-mix(in srgb, ${node.color} 8%, var(--studio-table-surface) 92%)`
  }

  return `color-mix(in srgb, ${node.color} 8%, var(--studio-node-surface-bottom) 92%)`
}
const getNodeAccentColor = (node: CanvasNodeState) => {
  return `color-mix(in srgb, ${node.color} 70%, var(--studio-node-accent-mix) 30%)`
}
const getAttachmentRowStyle = (attachment: TableAttachment) => {
  return {
    backgroundColor: `color-mix(in srgb, ${attachment.color} 8%, var(--studio-row-surface) 92%)`,
    boxShadow: `inset 3px 0 0 color-mix(in srgb, ${attachment.color} 58%, transparent)`
  }
}
const getSelectedAttachmentRowStyle = () => {
  return {
    boxShadow: 'none'
  }
}
const getAttachmentKindBadgeStyle = (attachment: TableAttachment) => {
  return {
    borderColor: `color-mix(in srgb, ${attachment.color} 58%, var(--studio-rail) 42%)`,
    backgroundColor: `color-mix(in srgb, ${attachment.color} 16%, transparent)`,
    color: `color-mix(in srgb, ${attachment.color} 72%, var(--studio-shell-text) 28%)`
  }
}
const getAttachmentFlagStyle = (flag: TableAttachmentFlag) => {
  return {
    borderColor: `color-mix(in srgb, ${flag.color} 56%, var(--studio-rail) 44%)`,
    backgroundColor: `color-mix(in srgb, ${flag.color} 14%, transparent)`,
    color: `color-mix(in srgb, ${flag.color} 72%, var(--studio-shell-text) 28%)`
  }
}
const isNodeSelectionActive = (nodeId: string) => {
  return selectedCanvasSelection.value?.kind === 'node' && selectedCanvasSelection.value.id === nodeId
}
const isTableSelectionActive = (tableId: string) => {
  return selectedCanvasSelection.value?.kind === 'table' && selectedCanvasSelection.value.tableId === tableId
}
const isAttachmentSelectionActive = (tableId: string, attachmentId: string) => {
  return (
    selectedCanvasSelection.value?.kind === 'attachment'
    && selectedCanvasSelection.value.tableId === tableId
    && selectedCanvasSelection.value.attachmentId === attachmentId
  )
}
const getRelationalRowHighlightColor = (tableId: string, columnName: string) => {
  const rowKey = getColumnAnchorKey(tableId, columnName)

  if (selectedTableRelationalRowKeys.value.has(rowKey)) {
    return tableGroupColorByTableId.value[selectedTable.value?.fullName || ''] || '#79e3ea'
  }

  if (selectedObjectImpactRowKeys.value.has(rowKey)) {
    return selectedNode.value?.color || '#14b8a6'
  }

  return null
}
const isHighlightedRelationalRow = (tableId: string, columnName: string) => {
  return getRelationalRowHighlightColor(tableId, columnName) !== null
}

const getAnchorSlotCount = (element: HTMLElement, side: AnchorSide) => {
  if (element.hasAttribute('data-column-label-anchor')) {
    return isHorizontalDiagramSide(side) ? 2 : 3
  }

  const bounds = element.getBoundingClientRect()
  const dimension = isHorizontalDiagramSide(side) ? bounds.height : bounds.width
  const divisor = element.hasAttribute('data-table-anchor')
    ? (isHorizontalDiagramSide(side) ? 72 : 144)
    : (isHorizontalDiagramSide(side) ? 56 : 128)

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

const getExactAnchorPoint = (
  element: HTMLElement,
  side: AnchorSide,
  ratio: number,
  planeBounds: DOMRect,
  metadata: {
    slot: number
    count: number
  } = {
    slot: 0,
    count: 1
  }
): AnchorPoint => {
  const bounds = element.getBoundingClientRect()
  const clampedRatio = clamp(ratio, 0, 1)
  const xLeft = (bounds.left - planeBounds.left) / scale.value
  const xRight = (bounds.right - planeBounds.left) / scale.value
  const yTop = (bounds.top - planeBounds.top) / scale.value
  const yBottom = (bounds.bottom - planeBounds.top) / scale.value
  const xCenter = (bounds.left - planeBounds.left + bounds.width * clampedRatio) / scale.value
  const yCenter = (bounds.top - planeBounds.top + bounds.height * clampedRatio) / scale.value

  if (side === 'left') {
    return {
      x: xLeft,
      y: yCenter,
      side,
      slot: metadata.slot,
      count: metadata.count
    }
  }

  if (side === 'right') {
    return {
      x: xRight,
      y: yCenter,
      side,
      slot: metadata.slot,
      count: metadata.count
    }
  }

  if (side === 'top') {
    return {
      x: xCenter,
      y: yTop,
      side,
      slot: metadata.slot,
      count: metadata.count
    }
  }

  return {
    x: xCenter,
    y: yBottom,
    side,
    slot: metadata.slot,
    count: metadata.count
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

const isFieldEndpointElement = (element: HTMLElement) => {
  return element.hasAttribute('data-column-label-anchor') || element.hasAttribute('data-column-anchor')
}

const getOwningTableElement = (element: HTMLElement) => {
  const table = element.closest('[data-table-anchor]')

  if (!(table instanceof HTMLElement)) {
    return null
  }

  return table
}

const getOwningTableRowElement = (element: HTMLElement) => {
  const row = element.closest('[data-table-row-anchor]')

  if (!(row instanceof HTMLElement)) {
    return null
  }

  return row
}

const getOwningGroupElement = (element: HTMLElement) => {
  const group = element.closest('[data-node-anchor^="group:"]')

  if (!(group instanceof HTMLElement)) {
    return null
  }

  return group
}

const getHorizontalGroupLaneSide = (fromBounds: DOMRect, toBounds: DOMRect, groupBounds: DOMRect): 'left' | 'right' => {
  const sourceCenterX = fromBounds.left + fromBounds.width / 2
  const targetCenterX = toBounds.left + toBounds.width / 2
  const leftScore = (sourceCenterX - groupBounds.left) + (targetCenterX - groupBounds.left)
  const rightScore = (groupBounds.right - sourceCenterX) + (groupBounds.right - targetCenterX)

  return leftScore <= rightScore ? 'left' : 'right'
}

const getSharedGroupElement = (fromElement: HTMLElement, toElement: HTMLElement) => {
  const fromGroup = getOwningGroupElement(fromElement)
  const toGroup = getOwningGroupElement(toElement)

  if (!(fromGroup instanceof HTMLElement) || !(toGroup instanceof HTMLElement) || fromGroup !== toGroup) {
    return null
  }

  return fromGroup
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

function replaceUsageMap<T>(target: Map<string, T>, source: Map<string, T>) {
  target.clear()

  for (const [key, value] of source.entries()) {
    target.set(key, value)
  }
}

const getDesiredAnchorRatio = (
  side: AnchorSide,
  elementBounds: DOMRect,
  targetCenterX: number,
  targetCenterY: number
) => {
  return isHorizontalDiagramSide(side)
    ? clamp((targetCenterY - elementBounds.top) / Math.max(elementBounds.height, 1), 0.16, 0.84)
    : clamp((targetCenterX - elementBounds.left) / Math.max(elementBounds.width, 1), 0.16, 0.84)
}

const reserveFieldRowAnchorPoint = (
  fieldElement: HTMLElement,
  tableElement: HTMLElement,
  side: 'left' | 'right',
  targetCenterY: number,
  planeBounds: DOMRect,
  usage: Map<string, number[]>
) => {
  // Keep row-side anchor selection aligned with the shared rules documented in diagram-routing.ts.
  const rowElement = getOwningTableRowElement(fieldElement)
  const tableBounds = tableElement.getBoundingClientRect()
  const desiredRatio = clamp((targetCenterY - tableBounds.top) / Math.max(tableBounds.height, 1), 0, 1)

  if (!(rowElement instanceof HTMLElement)) {
    return getExactAnchorPoint(tableElement, side, desiredRatio, planeBounds)
  }

  const fieldBounds = fieldElement.getBoundingClientRect()
  const rowBounds = rowElement.getBoundingClientRect()
  const anchorBandHeight = fieldBounds.height > 0 ? fieldBounds.height : rowBounds.height
  const candidateRatios = getFieldRowAnchorRatios(
    fieldBounds.top,
    anchorBandHeight,
    tableBounds.top,
    tableBounds.height
  )
  const rowKey = rowElement.getAttribute('data-table-row-anchor') || getElementIdentity(fieldElement)
  const usageKey = `field-row:${rowKey}:${side}`
  const slotUsage = usage.get(usageKey) || Array.from({ length: candidateRatios.length }, () => 0)

  if (slotUsage.length < candidateRatios.length) {
    slotUsage.push(...Array.from({ length: candidateRatios.length - slotUsage.length }, () => 0))
  }

  const bestSlot = pickDiagramAnchorSlot(candidateRatios, desiredRatio, slotUsage)

  slotUsage[bestSlot] = (slotUsage[bestSlot] || 0) + 1
  usage.set(usageKey, slotUsage)

  return getExactAnchorPoint(
    tableElement,
    side,
    candidateRatios[bestSlot] ?? desiredRatio,
    planeBounds,
    {
      slot: bestSlot,
      count: candidateRatios.length
    }
  )
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

  if (
    previousAxis
    && nextAxis
    && previousAxis === nextAxis
  ) {
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

const getVerticalSegmentUsageKey = (x: number) => {
  return `vertical:${Math.round(x * verticalSegmentKeyScale) / verticalSegmentKeyScale}`
}

const getElementOffsetWithinAncestor = (element: HTMLElement, ancestor: HTMLElement) => {
  let current: HTMLElement | null = element
  let x = 0
  let y = 0

  while (current && current !== ancestor) {
    x += current.offsetLeft
    y += current.offsetTop
    current = current.offsetParent instanceof HTMLElement ? current.offsetParent : null
  }

  return { x, y }
}

const collectGroupHeaderBands = () => {
  if (!(planeRef.value instanceof HTMLElement)) {
    return []
  }

  const planeElement = planeRef.value

  return Array.from(planeElement.querySelectorAll('[data-node-anchor^="group:"]')).flatMap((element) => {
    if (!(element instanceof HTMLElement)) {
      return []
    }

    const groupId = element.getAttribute('data-node-anchor')

    if (!groupId) {
      return []
    }

    const contentElement = planeElement.querySelector(`[data-group-content="${groupId}"]`)

    if (!(contentElement instanceof HTMLElement)) {
      return []
    }

    const groupOffset = getElementOffsetWithinAncestor(element, planeElement)
    const contentOffset = getElementOffsetWithinAncestor(contentElement, planeElement)

    return [{
      left: groupOffset.x,
      right: groupOffset.x + element.offsetWidth,
      top: groupOffset.y,
      bottom: contentOffset.y
    } satisfies DiagramRect]
  })
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

    adjustedPoints[index] = {
      ...adjustedPoints[index]!,
      x: adjustedPoints[index]!.x + shift
    }
    adjustedPoints[index + 1] = {
      ...adjustedPoints[index + 1]!,
      x: adjustedPoints[index + 1]!.x + shift
    }
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

        return Boolean(
          previous
          && Math.abs(previous.x - point.x) < 0.5
          && Math.abs(previous.y - point.y) > 0.5
        )
      })
    : [...points.keys()].slice(1).reverse().map((index) => {
        const previous = points[index - 1]
        const point = points[index]

        if (
          !previous
          || !point
          || Math.abs(previous.x - point.x) >= 0.5
          || Math.abs(previous.y - point.y) <= 0.5
        ) {
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

  const adjacentPoint = direction === 'from'
    ? points[pointIndex + 1]
    : points[pointIndex - 1]

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

  const adjacentPoint = direction === 'from'
    ? points[pointIndex + 1]
    : points[pointIndex - 1]

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

const reserveRouteLegAnchor = (
  element: HTMLElement,
  otherElement: HTMLElement,
  fallbackSide: AnchorSide,
  planeBounds: DOMRect,
  usage: Map<string, number[]>,
  forcedSide: AnchorSide | null = null
) => {
  const elementBounds = element.getBoundingClientRect()
  const otherBounds = otherElement.getBoundingClientRect()
  const targetCenterX = otherBounds.left + otherBounds.width / 2
  const targetCenterY = otherBounds.top + otherBounds.height / 2
  const tableElement = isFieldEndpointElement(element) ? getOwningTableElement(element) : null
  const anchorHost = tableElement || element
  const anchorBounds = anchorHost.getBoundingClientRect()
  const groupElement = getOwningGroupElement(anchorHost)
  const groupBounds = groupElement?.getBoundingClientRect()
  let side: AnchorSide = forcedSide || fallbackSide

  if (tableElement && !forcedSide) {
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
  const ratio = tableElement
    ? clamp(
        ((elementBounds.top + elementBounds.height / 2) - anchorBounds.top) / Math.max(anchorBounds.height, 1),
        0.16,
        0.84
      )
    : getDesiredAnchorRatio(side, anchorBounds, targetCenterX, targetCenterY)

  return {
    anchor: tableElement && isHorizontalDiagramSide(side)
      ? reserveFieldRowAnchorPoint(element, tableElement, side, targetCenterY, planeBounds, usage)
      : tableElement
        ? getExactAnchorPoint(anchorHost, side, ratio, planeBounds)
        : reserveAnchorPoint(anchorHost, side, ratio, planeBounds, usage),
    side,
    groupElement,
    hostCenterX: ((anchorBounds.left - planeBounds.left) / scale.value) + (anchorBounds.width / (2 * scale.value))
  }
}

const finalizeRouteLeg = (
  pendingLeg: {
    anchor: AnchorPoint
    side: AnchorSide
    groupElement: HTMLElement | null
    hostCenterX: number
  },
  planeBounds: DOMRect,
  usage: Map<string, number[]>,
  routeOffset: number
): RouteLeg => {
  const exit = moveAnchorPoint(pendingLeg.anchor, routeOffset)

  if (!(pendingLeg.groupElement instanceof HTMLElement)) {
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

  const groupBounds = pendingLeg.groupElement.getBoundingClientRect()
  const laneOffset = reserveLaneOffset(
    `group-lane:${pendingLeg.groupElement.getAttribute('data-node-anchor')}:${pendingLeg.side}`,
    usage,
    groupLaneOuterBaseOffset,
    groupLaneOuterGap
  )
  const groupLeft = (groupBounds.left - planeBounds.left) / scale.value
  const groupRight = (groupBounds.right - planeBounds.left) / scale.value
  const groupBottom = (groupBounds.bottom - planeBounds.top) / scale.value
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

const buildRawPathPointsFromLegs = (
  fromLeg: RouteLeg,
  toLeg: RouteLeg
) => {
  const laneLeg = fromLeg.grouped !== toLeg.grouped
    ? (fromLeg.grouped ? fromLeg : toLeg)
    : null
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

const buildSharedGroupPath = (
  fromElement: HTMLElement,
  toElement: HTMLElement,
  groupElement: HTMLElement,
  planeBounds: DOMRect,
  usage: Map<string, number[]>,
  verticalUsage: VerticalSegmentUsage,
  headerBands: DiagramRect[]
) => {
  const fromBounds = fromElement.getBoundingClientRect()
  const toBounds = toElement.getBoundingClientRect()
  const groupBounds = groupElement.getBoundingClientRect()
  const sourceCenterX = fromBounds.left + fromBounds.width / 2
  const sourceCenterY = fromBounds.top + fromBounds.height / 2
  const targetCenterX = toBounds.left + toBounds.width / 2
  const targetCenterY = toBounds.top + toBounds.height / 2
  const laneSide = isFieldEndpointElement(fromElement) || isFieldEndpointElement(toElement)
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
  const fromTableElement = isFieldEndpointElement(fromElement) ? getOwningTableElement(fromElement) : null
  const toTableElement = isFieldEndpointElement(toElement) ? getOwningTableElement(toElement) : null
  const fromAnchorHost = fromTableElement || fromElement
  const toAnchorHost = toTableElement || toElement
  const fromAnchorBounds = fromAnchorHost.getBoundingClientRect()
  const toAnchorBounds = toAnchorHost.getBoundingClientRect()
  const fromRatio = fromTableElement
    ? clamp(
        ((fromBounds.top + fromBounds.height / 2) - fromAnchorBounds.top) / Math.max(fromAnchorBounds.height, 1),
        0.16,
        0.84
      )
    : getDesiredAnchorRatio(laneSide, fromAnchorBounds, targetCenterX, targetCenterY)
  const toRatio = toTableElement
    ? clamp(
        ((toBounds.top + toBounds.height / 2) - toAnchorBounds.top) / Math.max(toAnchorBounds.height, 1),
        0.16,
        0.84
      )
    : getDesiredAnchorRatio(laneSide, toAnchorBounds, sourceCenterX, sourceCenterY)
  const fromAnchor = fromTableElement
    ? isHorizontalDiagramSide(laneSide)
      ? reserveFieldRowAnchorPoint(fromElement, fromTableElement, laneSide, targetCenterY, planeBounds, usage)
      : getExactAnchorPoint(fromAnchorHost, laneSide, fromRatio, planeBounds)
    : reserveAnchorPoint(fromAnchorHost, laneSide, fromRatio, planeBounds, usage)
  const toAnchor = toTableElement
    ? isHorizontalDiagramSide(laneSide)
      ? reserveFieldRowAnchorPoint(toElement, toTableElement, laneSide, sourceCenterY, planeBounds, usage)
      : getExactAnchorPoint(toAnchorHost, laneSide, toRatio, planeBounds)
    : reserveAnchorPoint(toAnchorHost, laneSide, toRatio, planeBounds, usage)
  const laneOffset = reserveLaneOffset(
    `group-lane:${groupElement.getAttribute('data-node-anchor')}:${laneSide}`,
    usage,
    groupLaneInnerBaseOffset,
    groupLaneInnerGap
  )
  const points: LayoutPoint[] = []
  const groupLeft = (groupBounds.left - planeBounds.left) / scale.value
  const groupRight = (groupBounds.right - planeBounds.left) / scale.value
  const groupBottom = (groupBounds.bottom - planeBounds.top) / scale.value

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

    return buildPathFromPoints(offsetOverlappingVerticalSegments(points, verticalUsage, headerBands))
  }

  const laneY = Math.min(groupBottom - groupLaneInnerBorderClearance, Math.max(fromAnchor.y, toAnchor.y) + laneOffset)

  appendRoutePoint(points, { x: fromAnchor.x, y: laneY })
  appendRoutePoint(points, { x: toAnchor.x, y: laneY })
  appendRoutePoint(points, { x: toAnchor.x, y: toAnchor.y })

  return buildPathFromPoints(offsetOverlappingVerticalSegments(points, verticalUsage, headerBands))
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

const buildPathBetween = (
  fromElement: HTMLElement,
  toElement: HTMLElement,
  color: string,
  dashed: boolean,
  usage: Map<string, number[]>,
  verticalUsage: VerticalSegmentUsage,
  headerBands: DiagramRect[]
) => {
  if (!planeRef.value) {
    return null
  }

  const planeBounds = planeRef.value.getBoundingClientRect()
  const sharedGroupElement = !dashed ? getSharedGroupElement(fromElement, toElement) : null

  if (sharedGroupElement) {
    return {
      path: buildSharedGroupPath(fromElement, toElement, sharedGroupElement, planeBounds, usage, verticalUsage, headerBands),
      color,
      dashed
    }
  }

  const defaultSides = decideAnchorSides(fromElement, toElement)
  const buildCandidate = (forcedSides: Partial<{ from: AnchorSide, to: AnchorSide }> = {}) => {
    const localUsage = cloneUsageMap(usage)
    const localVerticalUsage = cloneVerticalSegmentUsage(verticalUsage)
    const sides = {
      from: forcedSides.from || defaultSides.from,
      to: forcedSides.to || defaultSides.to
    }
    const fromPendingLeg = reserveRouteLegAnchor(fromElement, toElement, sides.from, planeBounds, localUsage, forcedSides.from || null)
    const toPendingLeg = reserveRouteLegAnchor(toElement, fromElement, sides.to, planeBounds, localUsage, forcedSides.to || null)
    const routeOffset = getRouteOffset(fromPendingLeg.anchor, toPendingLeg.anchor)
    const fromLeg = finalizeRouteLeg(fromPendingLeg, planeBounds, localUsage, routeOffset)
    const toLeg = finalizeRouteLeg(toPendingLeg, planeBounds, localUsage, routeOffset)
    const points = buildPathPointsFromLegs(fromLeg, toLeg, localVerticalUsage, headerBands)

    return {
      localUsage,
      localVerticalUsage,
      fromLeg,
      toLeg,
      points,
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
    dashPattern: string
    animated: boolean
    fromElement: HTMLElement
    toElement: HTMLElement
  }> = []
  const usage = new Map<string, number[]>()
  const verticalUsage: VerticalSegmentUsage = new Map()
  const nodeOrders = nodeLayerOrderById.value
  const tableColors = tableGroupColorByTableId.value
  const groupHeaderBands = collectGroupHeaderBands()
  const selectedTableId = selectedTable.value?.fullName || null
  const selectedTableColor = selectedTableId
    ? (tableColors[selectedTableId] || '#79e3ea')
    : null

  for (const reference of model.references) {
    const fromElement = getFieldAnchorElement(reference.fromTable, reference.fromColumn)
    const toElement = getFieldAnchorElement(reference.toTable, reference.toColumn)

    if (!(fromElement instanceof HTMLElement) || !(toElement instanceof HTMLElement)) {
      continue
    }

    const isSelectedOutgoingReference = selectedTableId !== null && reference.fromTable === selectedTableId

    descriptors.push({
      key: `ref:${reference.fromTable}:${reference.fromColumn}:${reference.toTable}:${reference.toColumn}`,
      color: isSelectedOutgoingReference
        ? (selectedTableColor || tableColors[reference.toTable] || '#79e3ea')
        : (tableColors[reference.toTable] || '#79e3ea'),
      dashed: isSelectedOutgoingReference,
      dashPattern: isSelectedOutgoingReference ? '10 7' : '0',
      animated: isSelectedOutgoingReference,
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

      const isSelectedNodeImpact = selectedNode.value?.id === node.id

      descriptors.push({
        key: `${node.id}->${impactTarget.tableId}:${impactTarget.columnName || '*'}`,
        color: node.color,
        dashed: true,
        dashPattern: node.objectKind === 'Custom Type' && !isSelectedNodeImpact ? '2 5' : '10 7',
        animated: isSelectedNodeImpact,
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
        usage,
        verticalUsage,
        groupHeaderBands
      )

      if (!result) {
        return null
      }

      return {
        key: descriptor.key,
        path: result.path,
        color: result.color,
        dashed: result.dashed,
        dashPattern: descriptor.dashPattern,
        animated: descriptor.animated,
        zIndex: getDiagramConnectionZIndex(
          nodeOrders[getConnectionOwnerNodeId(descriptor.fromElement) || ''] || 1,
          nodeOrders[getConnectionOwnerNodeId(descriptor.toElement) || ''] || 1
        )
      } satisfies ConnectionLine
    })
    .filter((line): line is ConnectionLine => Boolean(line))

  connectionLines.value = lines
}

const reflowAutoLayout = () => {
  if (hasEmbeddedLayout.value) {
    return
  }

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

  const tableNodes = Object.values(nextStates).filter(node => node.kind === 'table')
  const tablePositions = autoLayoutFloatingTables(tableNodes, nextStates)

  for (const tableNode of tableNodes) {
    const currentTableNode = nextStates[tableNode.id]

    if (!currentTableNode) {
      continue
    }

    nextStates[tableNode.id] = {
      ...currentTableNode,
      x: tablePositions[tableNode.id]?.x ?? tableNode.x,
      y: tablePositions[tableNode.id]?.y ?? tableNode.y
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

const getViewportRelativePoint = (clientX: number, clientY: number) => {
  if (!viewportRef.value) {
    return null
  }

  const bounds = viewportRef.value.getBoundingClientRect()

  return {
    x: clientX - bounds.left,
    y: clientY - bounds.top
  }
}

const canStartCanvasGesture = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return true
  }

  return !target.closest('[data-node-anchor], [data-diagram-panel], [data-diagram-panel-toggle], [data-diagram-zoom-toolbar]')
}

const getTouchGesture = (touches: TouchList): DiagramTouchGesture | null => {
  const firstTouch = touches.item(0)
  const secondTouch = touches.item(1)

  if (!firstTouch || !secondTouch) {
    return null
  }

  return getDiagramTouchGesture(
    {
      x: firstTouch.clientX,
      y: firstTouch.clientY
    },
    {
      x: secondTouch.clientX,
      y: secondTouch.clientY
    }
  )
}

const startTouchPanSession = (touch: Touch) => {
  touchPinchSession.value = null
  touchPanSession.value = {
    clientX: touch.clientX,
    clientY: touch.clientY,
    panX: pan.value.x,
    panY: pan.value.y,
    touchId: touch.identifier
  }
}

const startTouchPinchSession = (gesture: DiagramTouchGesture) => {
  touchPanSession.value = null
  touchPinchSession.value = {
    initialCenter: gesture.center,
    initialDistance: gesture.distance,
    initialPan: {
      x: pan.value.x,
      y: pan.value.y
    },
    initialScale: scale.value
  }
}

const getTrackedTouch = (touches: TouchList) => {
  if (!touchPanSession.value) {
    return null
  }

  return Array.from(touches).find(touch => touch.identifier === touchPanSession.value?.touchId) || touches.item(0)
}

const resetTouchInteraction = () => {
  touchPanSession.value = null
  touchPinchSession.value = null
}

const suppressLayoutObserver = (durationMs = 180) => {
  suppressLayoutObserverUntil = Date.now() + durationMs
}

const zoomToScale = (nextScale: number, pivot: { x: number, y: number } | null = null) => {
  const normalizedScale = Number(clamp(nextScale, minCanvasScale, maxCanvasScale).toFixed(2))

  suppressLayoutObserver()

  if (!pivot) {
    scale.value = normalizedScale
    return
  }

  const planeX = (pivot.x - pan.value.x) / scale.value
  const planeY = (pivot.y - pan.value.y) / scale.value

  scale.value = normalizedScale
  pan.value = {
    x: Math.round(pivot.x - planeX * normalizedScale),
    y: Math.round(pivot.y - planeY * normalizedScale)
  }
}

const zoomBy = (direction: 1 | -1, pivot: { x: number, y: number } | null = null) => {
  zoomToScale(scale.value + direction * zoomStep, pivot)
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
    right: 48,
    bottom: 72,
    left: 48
  }
  const availableWidth = Math.max(240, viewportRef.value.clientWidth - padding.left - padding.right)
  const availableHeight = Math.max(240, viewportRef.value.clientHeight - padding.top - padding.bottom)
  const nextScale = Math.min(
    1,
    Math.max(
      minCanvasScale,
      Number(Math.min(availableWidth / bounds.width, availableHeight / bounds.height).toFixed(2))
    )
  )

  suppressLayoutObserver()
  scale.value = nextScale
  pan.value = {
    x: Math.round(padding.left + (availableWidth - bounds.width * nextScale) / 2 - bounds.minX * nextScale),
    y: Math.round(padding.top + (availableHeight - bounds.height * nextScale) / 2 - bounds.minY * nextScale)
  }
}

const resetView = () => {
  fitView()
}

const normalizeStoredNodeProperties = (properties: PgmlNodeProperties) => {
  const normalized: PgmlNodeProperties = {}

  if (typeof properties.x === 'number') {
    normalized.x = Math.round(properties.x)
  }

  if (typeof properties.y === 'number') {
    normalized.y = Math.round(properties.y)
  }

  if (typeof properties.color === 'string' && properties.color.length > 0) {
    normalized.color = properties.color
  }

  if (typeof properties.collapsed === 'boolean') {
    normalized.collapsed = properties.collapsed
  }

  if (properties.visible === false) {
    normalized.visible = false
  }

  if (properties.masonry === true) {
    normalized.masonry = true
  }

  if (typeof properties.tableColumns === 'number') {
    normalized.tableColumns = Math.max(1, Math.round(properties.tableColumns))
  }

  return normalized
}

const hasStoredNodeProperties = (properties: PgmlNodeProperties) => {
  return (
    typeof properties.x === 'number'
    || typeof properties.y === 'number'
    || typeof properties.color === 'string'
    || typeof properties.collapsed === 'boolean'
    || properties.visible === false
    || properties.masonry === true
    || typeof properties.tableColumns === 'number'
  )
}

const getNodeLayoutProperties = () => {
  const properties = Object.entries(model.nodeProperties).reduce<Record<string, PgmlNodeProperties>>((entries, [id, value]) => {
    const normalized = normalizeStoredNodeProperties(value)

    if (hasStoredNodeProperties(normalized)) {
      entries[id] = normalized
    }

    return entries
  }, {})

  Object.values(nodeStates.value).forEach((node) => {
    const nextProperties: PgmlNodeProperties = {
      ...properties[node.id]
    }

    if (node.kind === 'group') {
      nextProperties.color = node.color
      nextProperties.x = Math.round(node.x)
      nextProperties.y = Math.round(node.y)
      nextProperties.tableColumns = Math.max(1, Math.round(node.columnCount || 1))

      if (node.masonry) {
        nextProperties.masonry = true
      } else {
        delete nextProperties.masonry
      }
    }

    if (node.kind === 'table' || node.kind === 'object') {
      nextProperties.color = node.color
      nextProperties.x = Math.round(node.x)
      nextProperties.y = Math.round(node.y)
    }

    if (node.kind === 'object' && node.objectKind === 'Custom Type') {
      nextProperties.collapsed = node.collapsed
    }

    properties[node.id] = nextProperties
  })

  return Object.entries(properties).reduce<Record<string, PgmlNodeProperties>>((entries, [id, value]) => {
    const normalized = normalizeStoredNodeProperties(value)

    if (hasStoredNodeProperties(normalized)) {
      entries[id] = normalized
    }

    return entries
  }, {})
}

const emitNodePropertiesChange = () => {
  emit('nodePropertiesChange', getNodeLayoutProperties())
}

const updateEntityVisibility = (id: string, visible: boolean) => {
  const nextProperties = getNodeLayoutProperties()
  const nextEntry: PgmlNodeProperties = {
    ...(nextProperties[id] || {})
  }

  const normalizedEntry = visible
    ? (() => {
        const { visible: _visible, ...rest } = nextEntry

        return rest satisfies PgmlNodeProperties
      })()
    : {
        ...nextEntry,
        visible: false
      }

  if (hasStoredNodeProperties(normalizedEntry)) {
    nextProperties[id] = normalizeStoredNodeProperties(normalizedEntry)
    emit('nodePropertiesChange', nextProperties)
  } else {
    emit('nodePropertiesChange', Object.entries(nextProperties).reduce<Record<string, PgmlNodeProperties>>((entries, [entryId, entryValue]) => {
      if (entryId !== id) {
        entries[entryId] = entryValue
      }

      return entries
    }, {}))
  }

  if (
    !visible
    && (
      (selectedCanvasSelection.value?.kind === 'node' && selectedCanvasSelection.value.id === id)
      || (selectedCanvasSelection.value?.kind === 'table' && selectedCanvasSelection.value.tableId === id)
      || (selectedCanvasSelection.value?.kind === 'attachment' && selectedCanvasSelection.value.attachmentId === id)
    )
  ) {
    selectedCanvasSelection.value = null
    selectedNodeId.value = null
  }
}

const updateNode = (
  id: string,
  partial: Partial<CanvasNodeState>,
  options: {
    remeasure?: boolean
    emitNodeProperties?: boolean
  } = {}
) => {
  const current = nodeStates.value[id]

  if (!current) {
    return
  }

  const remeasure = options.remeasure !== false
  const emitNodeProperties = options.emitNodeProperties !== false

  const nextNode = {
    ...current,
    ...partial
  }

  if (current.kind === 'object') {
    if (nextNode.collapsed) {
      const headerElement = planeRef.value?.querySelector(`[data-node-header="${id}"]`)
      const nextCollapsedHeight = Math.ceil(Math.max(
        headerElement instanceof HTMLElement ? headerElement.offsetHeight : 0,
        collapsedObjectHeight
      ))

      nextNode.minHeight = nextCollapsedHeight
      nextNode.height = nextCollapsedHeight
    } else {
      nextNode.expandedHeight = typeof partial.height === 'number'
        ? nextNode.height
        : nextNode.expandedHeight || nextNode.height
    }
  }

  if (current.kind === 'group') {
    const minimumSize = getGroupMinimumSize(
      current.id.replace('group:', ''),
      nextNode.columnCount || 1,
      nextNode.masonry ?? false
    )
    const resetGroupSize = typeof partial.columnCount === 'number' || typeof partial.masonry === 'boolean'
    const nextGroupWidth = resetGroupSize
      ? minimumSize.minWidth
      : Math.max(nextNode.width, minimumSize.minWidth)
    const nextGroupHeight = resetGroupSize
      ? minimumSize.minHeight
      : Math.max(nextNode.height, minimumSize.minHeight)

    nextNode.minWidth = minimumSize.minWidth
    nextNode.minHeight = minimumSize.minHeight
    nextNode.width = nextGroupWidth
    nextNode.height = nextGroupHeight
    nextNode.expandedHeight = nextGroupHeight
  }

  if (current.kind === 'table') {
    const minimumHeight = estimateTableHeight(getTableRows(id).length)

    nextNode.minWidth = groupTableWidth
    nextNode.minHeight = minimumHeight
    nextNode.width = Math.max(nextNode.width, groupTableWidth)
    nextNode.height = Math.max(nextNode.height, minimumHeight)
    nextNode.expandedHeight = nextNode.height
  }

  nodeStates.value[id] = nextNode

  if (emitNodeProperties) {
    emitNodePropertiesChange()
  }

  nextTick(() => {
    if (remeasure) {
      syncMeasuredNodeSizes()
    }

    updateConnections()
  })
}

const toggleNodeCollapsed = (id: string) => {
  const node = nodeStates.value[id]

  if (!node || node.kind !== 'object') {
    return
  }

  if (node.collapsed) {
    updateNode(id, {
      collapsed: false,
      height: Math.max(node.expandedHeight || node.height, collapsedObjectHeight)
    })
    return
  }

  const headerElement = planeRef.value?.querySelector(`[data-node-header="${id}"]`)
  const nextCollapsedHeight = Math.ceil(Math.max(
    headerElement instanceof HTMLElement ? headerElement.offsetHeight : 0,
    collapsedObjectHeight
  ))

  updateNode(id, {
    collapsed: true,
    expandedHeight: node.height,
    height: nextCollapsedHeight
  })
}

const startPan = (event: PointerEvent) => {
  if (event.pointerType === 'touch' || !canStartCanvasGesture(event.target)) {
    return
  }

  const origin = {
    x: event.clientX,
    y: event.clientY,
    panX: pan.value.x,
    panY: pan.value.y
  }

  startPointerSession({
    onMove: (moveEvent) => {
      pan.value = {
        x: origin.panX + moveEvent.clientX - origin.x,
        y: origin.panY + moveEvent.clientY - origin.y
      }
    }
  })
}

const handleTouchStart = (event: TouchEvent) => {
  if (isMobilePanelView.value || !canStartCanvasGesture(event.target)) {
    return
  }

  if (event.touches.length >= 2) {
    const gesture = getTouchGesture(event.touches)

    if (!gesture) {
      return
    }

    event.preventDefault()
    startTouchPinchSession(gesture)
    return
  }

  const touch = event.touches.item(0)

  if (!touch) {
    return
  }

  startTouchPanSession(touch)
}

const handleTouchMove = (event: TouchEvent) => {
  if (isMobilePanelView.value) {
    return
  }

  if (event.touches.length >= 2) {
    const gesture = getTouchGesture(event.touches)

    if (!gesture) {
      return
    }

    if (!touchPinchSession.value) {
      startTouchPinchSession(gesture)
    }

    if (!touchPinchSession.value) {
      return
    }

    event.preventDefault()
    const transform = getDiagramPinchViewportTransform({
      currentCenter: gesture.center,
      currentDistance: gesture.distance,
      initialCenter: touchPinchSession.value.initialCenter,
      initialDistance: touchPinchSession.value.initialDistance,
      initialPan: touchPinchSession.value.initialPan,
      initialScale: touchPinchSession.value.initialScale,
      maxScale: maxCanvasScale,
      minScale: minCanvasScale
    })

    suppressLayoutObserver()
    pan.value = transform.pan
    scale.value = transform.scale
    return
  }

  const touch = getTrackedTouch(event.touches)

  if (!touch || !touchPanSession.value) {
    return
  }

  event.preventDefault()
  pan.value = {
    x: touchPanSession.value.panX + touch.clientX - touchPanSession.value.clientX,
    y: touchPanSession.value.panY + touch.clientY - touchPanSession.value.clientY
  }
}

const handleTouchEnd = (event: TouchEvent) => {
  if (isMobilePanelView.value) {
    resetTouchInteraction()
    return
  }

  if (event.touches.length >= 2) {
    const gesture = getTouchGesture(event.touches)

    if (!gesture) {
      resetTouchInteraction()
      return
    }

    startTouchPinchSession(gesture)
    return
  }

  if (event.touches.length === 1) {
    const touch = event.touches.item(0)

    if (!touch) {
      resetTouchInteraction()
      return
    }

    startTouchPanSession(touch)
    return
  }

  resetTouchInteraction()
}

const startDragNode = (event: PointerEvent, id: string) => {
  if (event.pointerType === 'touch') {
    return
  }

  event.stopPropagation()
  const node = nodeStates.value[id]

  if (!node) {
    return
  }

  if (node.kind === 'table') {
    selectedNodeId.value = null
    selectedCanvasSelection.value = {
      kind: 'table',
      tableId: id
    }
  } else {
    selectedNodeId.value = id
    selectedCanvasSelection.value = {
      kind: 'node',
      id
    }
  }

  const origin = {
    x: event.clientX,
    y: event.clientY,
    nodeX: node.x,
    nodeY: node.y
  }

  startPointerSession({
    onMove: (moveEvent) => {
      updateNode(id, {
        x: snapCoordinate(origin.nodeX + (moveEvent.clientX - origin.x) / scale.value),
        y: snapCoordinate(origin.nodeY + (moveEvent.clientY - origin.y) / scale.value)
      }, {
        remeasure: false,
        emitNodeProperties: false
      })
    },
    onEnd: emitNodePropertiesChange
  })
}

const startResizeNode = (event: PointerEvent, id: string) => {
  if (event.pointerType === 'touch') {
    return
  }

  event.stopPropagation()
  selectedNodeId.value = id
  selectedCanvasSelection.value = {
    kind: 'node',
    id
  }
  const node = nodeStates.value[id]

  if (!node || node.kind !== 'object') {
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

  startPointerSession({
    onMove: (moveEvent) => {
      updateNode(id, {
        width: Math.max(origin.minWidth, origin.width + (moveEvent.clientX - origin.x) / scale.value),
        height: Math.max(origin.minHeight, origin.height + (moveEvent.clientY - origin.y) / scale.value)
      }, {
        emitNodeProperties: false
      })
    },
    onEnd: emitNodePropertiesChange
  })
}

const focusSourceRange = (sourceRange?: PgmlSourceRange) => {
  if (!sourceRange) {
    return
  }

  emit('focusSource', sourceRange)
}

const handleNodeClick = (node: CanvasNodeState) => {
  selectedNodeId.value = node.id
  selectedCanvasSelection.value = {
    kind: 'node',
    id: node.id
  }
}

const handleTableClick = (tableId: string) => {
  selectedNodeId.value = null
  selectedCanvasSelection.value = {
    kind: 'table',
    tableId
  }
}

const handleAttachmentClick = (tableId: string, attachment: TableAttachment) => {
  selectedNodeId.value = null
  selectedCanvasSelection.value = {
    kind: 'attachment',
    tableId,
    attachmentId: attachment.id
  }
}

const handleNodeDoubleClick = (node: CanvasNodeState) => {
  if (node.kind !== 'object' || !node.sourceRange) {
    return
  }

  focusSourceRange(node.sourceRange)
}

const handleTableDoubleClick = (tableId: string) => {
  const table = model.tables.find(candidate => candidate.fullName === tableId)

  focusSourceRange(table?.sourceRange)
}

const handleAttachmentDoubleClick = (attachment: TableAttachment) => {
  focusSourceRange(attachment.sourceRange)
}

const handleEditTable = (tableId: string) => {
  emit('editTable', tableId)
}

const handleCreateTable = (groupName: string | null) => {
  emit('createTable', groupName)
}

const handleCreateGroup = () => {
  isDesktopSidePanelOpen.value = true
  activePanelTab.value = 'entities'
  emit('createGroup')
}

const handleEditGroup = (groupName: string) => {
  emit('editGroup', groupName)
}

const handleWheel = (event: WheelEvent) => {
  event.preventDefault()
  zoomBy(event.deltaY > 0 ? -1 : 1, getViewportRelativePoint(event.clientX, event.clientY))
}

watch(
  () => mobilePanelTab,
  (nextTab) => {
    if (nextTab && nextTab !== activePanelTab.value) {
      activePanelTab.value = nextTab
    }
  },
  { immediate: true }
)

watch(
  activePanelTab,
  (nextTab) => {
    emit('panelTabChange', nextTab)
  }
)

watch(
  () => mobileActiveView,
  () => {
    resetTouchInteraction()
  }
)

watch(
  () => exportPreferenceKey,
  (nextKey) => {
    loadExportPreferences(nextKey)
  },
  { immediate: true }
)

watch(
  exportPreferences,
  () => {
    persistExportPreferences()
  },
  { deep: true }
)

watch(
  () => model,
  async () => {
    const shouldFitViewport = previousViewportResetKey !== null && viewportResetKey !== previousViewportResetKey

    syncNodeStates()
    await syncLayoutObserverTargets()
    await refreshMeasuredGroupTableHeights()
    if (syncMeasuredNodeSizes()) {
      await syncLayoutObserverTargets()
    }
    if (!hasEmbeddedLayout.value) {
      reflowAutoLayout()
    }
    await syncLayoutObserverTargets()
    if (syncMeasuredNodeSizes()) {
      await syncLayoutObserverTargets()
      if (!hasEmbeddedLayout.value) {
        reflowAutoLayout()
      }
      await syncLayoutObserverTargets()
    }
    if (shouldFitViewport) {
      fitView()
    }
    await syncLayoutObserverTargets()
    updateConnections()
    previousViewportResetKey = viewportResetKey
  },
  { deep: true, immediate: true }
)

watch(
  selectedCanvasSelection,
  () => {
    nextTick(() => {
      updateConnections()
    })
  },
  { deep: true }
)

watch(
  () => canvasNodes.value.map(node => `${node.id}:${node.kind}:${node.collapsed}`).join('|'),
  () => {
    void syncLayoutObserverTargets()
  },
  { immediate: true, flush: 'post' }
)

onMounted(() => {
  nextTick(async () => {
    await syncLayoutObserverTargets()
    await refreshMeasuredGroupTableHeights()
    if (syncMeasuredNodeSizes()) {
      reflowAutoLayout()
      updateConnections()
    }
    updateConnections()
    await waitForAnimationFrame()
    await syncLayoutObserverTargets()
    if (syncMeasuredNodeSizes()) {
      reflowAutoLayout()
      updateConnections()
    }
    fitView()
    await nextTick()
    await waitForAnimationFrame()
    updateConnections()
  })
})

onBeforeUnmount(() => {
  stopExportCopyFeedbackReset()
  resetTouchInteraction()
})

defineExpose<{
  exportDiagram: (format: DiagramExportFormat, scaleFactor?: number) => Promise<void>
  exportPng: (scaleFactor: number) => Promise<void>
  exportSvg: () => Promise<void>
  getNodeLayoutProperties: () => Record<string, PgmlNodeProperties>
}>({
  exportDiagram: async (format, scaleFactor = 1) => {
    if (format === 'svg') {
      await exportSvg()
      return
    }

    await exportPng(scaleFactor)
  },
  exportPng,
  exportSvg,
  getNodeLayoutProperties
})
</script>

<template>
  <div
    ref="viewportRef"
    data-diagram-viewport="true"
    class="relative h-full min-h-0 select-none overflow-hidden border"
    :style="canvasViewportStyle"
    @pointerdown="startPan"
    @touchstart="handleTouchStart"
    @touchmove="handleTouchMove"
    @touchend="handleTouchEnd"
    @touchcancel="handleTouchEnd"
    @wheel="handleWheel"
  >
    <div
      ref="planeRef"
      data-diagram-plane="true"
      class="relative h-[1800px] w-[2600px] origin-top-left"
      :style="{
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`
      }"
    >
      <div
        v-for="node in canvasNodes"
        :key="node.id"
        :class="[
          'absolute select-none',
          node.kind === 'group' ? 'overflow-hidden rounded-[2px]' : 'overflow-hidden rounded-none border',
          node.kind === 'table' || node.kind === 'object' ? 'transition-transform duration-150 hover:-translate-y-0.5 hover:ring-1 hover:ring-[color:var(--studio-ring)]' : '',
          isNodeSelectionActive(node.id) && node.kind !== 'group' ? 'pgml-selection-glow' : ''
        ]"
        :style="[
          {
            left: `${node.x}px`,
            top: `${node.y}px`,
            width: `${node.width}px`,
            height: `${node.height}px`,
            zIndex: node.kind === 'group' ? 'auto' : getNodeForegroundLayerZIndex(node.id),
            borderColor: node.kind === 'group' ? 'transparent' : getNodeBorderColor(node),
            background: node.kind === 'group' ? 'transparent' : getNodeBackground(node)
          },
          node.kind === 'table' || node.kind === 'object' ? getSelectionGlowStyle(node.color) : undefined
        ]"
        :data-node-anchor="node.id"
        :data-table-anchor="node.kind === 'table' ? node.id : undefined"
        :data-selection-active="isNodeSelectionActive(node.id) ? 'true' : undefined"
        @pointerdown.capture="selectedNodeId = node.kind === 'table' ? null : node.id"
        @click.stop="node.kind === 'table' ? handleTableClick(node.id) : handleNodeClick(node)"
        @dblclick.stop="node.kind === 'table' ? handleTableDoubleClick(node.id) : handleNodeDoubleClick(node)"
      >
        <div
          v-if="node.kind === 'group'"
          :data-group-surface="node.id"
          :class="[
            'pointer-events-none absolute inset-0 rounded-[2px] border',
            selectedNodeId === node.id ? 'ring-1 ring-[color:var(--studio-ring)]' : ''
          ]"
          :style="{
            zIndex: getGroupBackgroundLayerZIndex(node.id),
            borderColor: getNodeBorderColor(node),
            background: getNodeBackground(node)
          }"
        />

        <div
          :data-node-header="node.id"
          :class="[
            'relative flex cursor-move items-start justify-between gap-2 px-2.5 py-2',
            node.kind === 'group' || !node.collapsed ? 'border-b border-[color:var(--studio-divider)]' : ''
          ]"
          :style="node.kind === 'group' ? { zIndex: getNodeForegroundLayerZIndex(node.id) } : undefined"
          @pointerdown="startDragNode($event, node.id)"
        >
          <div class="min-w-0">
            <span
              :data-node-accent="node.id"
              class="mb-1 inline-flex font-mono text-[0.62rem] uppercase tracking-[0.08em]"
              :style="{ color: getNodeAccentColor(node) }"
            >
              {{ node.kind === 'group' ? 'Table Group' : (node.kind === 'table' ? 'Table' : node.objectKind) }}
            </span>
            <h3 class="truncate text-[0.88rem] font-semibold leading-5 tracking-[-0.02em] text-[color:var(--studio-shell-text)]">
              {{ node.title }}
            </h3>
            <span
              v-if="node.kind === 'table'"
              data-table-schema-badge
              class="mt-1 inline-flex min-h-[1rem] items-center border px-1.5 py-0.5 font-mono text-[0.52rem] uppercase leading-[1.15] tracking-[0.05em]"
              :style="getSchemaBadgeStyle(getTableSchemaName(node.id))"
            >
              {{ getTableSchemaName(node.id) }}
            </span>
            <p
              v-if="node.subtitle && node.kind !== 'table'"
              class="truncate text-[0.68rem] text-[color:var(--studio-shell-muted)]"
            >
              {{ node.subtitle }}
            </p>
          </div>

          <div class="flex shrink-0 items-start gap-1">
            <span class="inline-flex h-5 items-center border border-[color:var(--studio-rail)] px-1.5 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[color:var(--studio-shell-muted)]">
              {{ node.kind === 'group' ? `${node.tableCount || node.tableIds.length} tables` : (node.kind === 'table' ? `${getTableRows(node.id).length} rows` : `${node.tableIds.length} impact`) }}
            </span>
            <UButton
              v-if="node.kind === 'group'"
              icon="i-lucide-table-2"
              :data-group-add-table="node.title"
              color="neutral"
              variant="ghost"
              size="xs"
              class="h-5 rounded-none border border-[color:var(--studio-rail)] px-1 text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
              :aria-label="`Add table to ${node.title}`"
              :title="`Add table to ${node.title}`"
              @pointerdown.stop
              @click.stop="handleCreateTable(node.title)"
            />
            <UButton
              v-if="node.kind === 'group'"
              icon="i-lucide-pencil-line"
              :data-group-edit-button="node.title"
              color="neutral"
              variant="ghost"
              size="xs"
              class="h-5 w-5 rounded-none border border-[color:var(--studio-rail)] px-0 text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
              aria-label="Edit group"
              title="Edit group"
              @pointerdown.stop
              @click.stop="handleEditGroup(node.title)"
            />
            <UButton
              v-if="isCollapsibleNode(node)"
              :icon="node.collapsed ? 'i-lucide-plus' : 'i-lucide-minus'"
              color="neutral"
              variant="ghost"
              size="xs"
              class="h-5 w-5 rounded-none border border-[color:var(--studio-rail)] px-0 text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
              :aria-label="node.collapsed ? `Expand ${node.title}` : `Collapse ${node.title}`"
              :title="node.collapsed ? `Expand ${node.title}` : `Collapse ${node.title}`"
              @pointerdown.stop
              @click.stop="toggleNodeCollapsed(node.id)"
            />
            <UButton
              v-if="node.kind === 'table'"
              icon="i-lucide-pencil-line"
              :data-table-edit-button="node.id"
              color="neutral"
              variant="ghost"
              size="xs"
              class="h-5 w-5 rounded-none border border-[color:var(--studio-rail)] px-0 text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
              aria-label="Edit table"
              title="Edit table"
              @pointerdown.stop
              @click.stop="handleEditTable(node.id)"
            />
          </div>
        </div>

        <div
          v-if="node.kind === 'group'"
          class="relative px-5 pb-2.5 pt-2"
          :style="{ zIndex: getNodeForegroundLayerZIndex(node.id) }"
        >
          <div
            :data-group-content="node.id"
            class="grid items-start justify-start overflow-visible"
            :style="getGroupContentStyle(node)"
          >
            <article
              v-for="table in getRenderedGroupTables(node.title)"
              :key="table.fullName"
              :class="[
                'relative min-w-0 self-start overflow-hidden rounded-[2px] border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-table-surface)] transition-transform duration-150 hover:-translate-y-0.5 hover:ring-1 hover:ring-[color:var(--studio-ring)]',
                isTableSelectionActive(table.fullName) ? 'pgml-selection-glow pgml-selection-glow-subtle' : ''
              ]"
              :style="[
                getGroupTableLayoutStyle(node, table.fullName),
                getSelectionGlowStyle(tableGroupColorByTableId[table.fullName] || '#38bdf8')
              ]"
              :data-table-anchor="table.fullName"
              :data-selection-active="isTableSelectionActive(table.fullName) ? 'true' : undefined"
              @click.stop="handleTableClick(table.fullName)"
              @dblclick.stop="handleTableDoubleClick(table.fullName)"
            >
              <div class="flex items-start justify-between gap-2 border-b border-[color:var(--studio-divider)] px-2 py-1.5">
                <div class="min-w-0">
                  <h4 class="truncate text-[0.78rem] font-semibold leading-5 text-[color:var(--studio-shell-text)]">
                    {{ table.name }}
                  </h4>
                  <span
                    data-table-schema-badge
                    class="mt-1 inline-flex min-h-[1rem] items-center border px-1.5 py-0.5 font-mono text-[0.5rem] uppercase leading-[1.15] tracking-[0.05em]"
                    :style="getSchemaBadgeStyle(table.schema)"
                  >
                    {{ table.schema }}
                  </span>
                </div>

                <UButton
                  icon="i-lucide-pencil-line"
                  :data-table-edit-button="table.fullName"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  class="h-5 w-5 rounded-none border border-[color:var(--studio-rail)] px-0 text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
                  aria-label="Edit table"
                  title="Edit table"
                  @pointerdown.stop
                  @click.stop="handleEditTable(table.fullName)"
                />
              </div>

              <div class="grid gap-px bg-[color:var(--studio-divider)]">
                <PgmlDiagramTableRows
                  :attachment-popover-content="attachmentPopoverContent"
                  :attachment-popover-ui="attachmentPopoverUi"
                  :get-attachment-flag-style="getAttachmentFlagStyle"
                  :get-attachment-kind-badge-style="getAttachmentKindBadgeStyle"
                  :get-attachment-row-style="getAttachmentRowStyle"
                  :get-column-anchor-key="getColumnAnchorKey"
                  :get-column-label-anchor-key="getColumnLabelAnchorKey"
                  :get-relational-row-highlight-color="getRelationalRowHighlightColor"
                  :get-selected-attachment-row-style="getSelectedAttachmentRowStyle"
                  :get-selection-glow-style="getSelectionGlowStyle"
                  :is-attachment-selection-active="isAttachmentSelectionActive"
                  :is-highlighted-relational-row="isHighlightedRelationalRow"
                  :rows="getTableRows(table.fullName)"
                  :table-id="table.fullName"
                  @attachment-click="handleAttachmentClick"
                  @attachment-double-click="handleAttachmentDoubleClick"
                />
              </div>
            </article>
          </div>
        </div>

        <div
          v-else-if="node.kind === 'table'"
          class="grid gap-px bg-[color:var(--studio-divider)]"
        >
          <PgmlDiagramTableRows
            :attachment-popover-content="attachmentPopoverContent"
            :attachment-popover-ui="attachmentPopoverUi"
            :get-attachment-flag-style="getAttachmentFlagStyle"
            :get-attachment-kind-badge-style="getAttachmentKindBadgeStyle"
            :get-attachment-row-style="getAttachmentRowStyle"
            :get-column-anchor-key="getColumnAnchorKey"
            :get-column-label-anchor-key="getColumnLabelAnchorKey"
            :get-relational-row-highlight-color="getRelationalRowHighlightColor"
            :get-selected-attachment-row-style="getSelectedAttachmentRowStyle"
            :get-selection-glow-style="getSelectionGlowStyle"
            :is-attachment-selection-active="isAttachmentSelectionActive"
            :is-highlighted-relational-row="isHighlightedRelationalRow"
            :rows="getTableRows(node.id)"
            :table-id="node.id"
            @attachment-click="handleAttachmentClick"
            @attachment-double-click="handleAttachmentDoubleClick"
          />
        </div>

        <div
          v-else-if="!node.collapsed"
          :data-node-body="node.id"
          class="grid gap-1.5 px-2.5 pb-2.5 pt-2"
        >
          <p
            v-for="detail in node.details"
            :key="detail"
            class="break-words whitespace-pre-wrap font-mono text-[0.64rem] leading-5 text-[color:var(--studio-shell-muted)] [overflow-wrap:anywhere]"
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
          v-if="node.kind === 'object' && !node.collapsed"
          class="absolute bottom-1.5 right-1.5 h-4 w-4 cursor-nwse-resize border-none bg-transparent"
          :style="{
            borderRight: `2px solid ${getNodeAccentColor(node)}`,
            borderBottom: `2px solid ${getNodeAccentColor(node)}`
          }"
          aria-label="Resize node"
          @pointerdown="startResizeNode($event, node.id)"
          @click.stop
        />
      </div>

      <svg
        v-for="layer in connectionLineLayers"
        :key="layer.zIndex"
        data-connection-layer="true"
        class="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        :style="{ zIndex: layer.zIndex }"
        viewBox="0 0 2600 1800"
        preserveAspectRatio="none"
      >
        <path
          v-for="line in layer.lines"
          :key="line.key"
          :class="line.animated ? 'pgml-reference-race-path' : undefined"
          :d="line.path"
          fill="none"
          :stroke="line.color"
          stroke-width="2"
          :stroke-dasharray="line.dashPattern"
          :style="line.animated ? getReferenceRaceStyle(line.color) : undefined"
          :data-connection-key="line.key"
          :data-connection-highlighted="line.animated ? 'true' : undefined"
          stroke-linecap="square"
          stroke-linejoin="miter"
          opacity="0.9"
        />
      </svg>
    </div>

    <div
      v-if="shouldShowZoomToolbar"
      class="pointer-events-none absolute inset-x-0 bottom-3 z-[2] flex justify-center"
    >
      <div
        data-diagram-zoom-toolbar="true"
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
        <button
          type="button"
          data-grid-snap-toggle="true"
          :aria-pressed="snapToGrid"
          :class="getStudioStateButtonClass({
            emphasized: snapToGrid,
            extraClass: 'inline-flex items-center gap-1.5 text-[0.62rem]'
          })"
          @click="snapToGrid = !snapToGrid"
        >
          <UIcon
            :name="snapToGrid ? 'i-lucide-lock' : 'i-lucide-unlock'"
            class="h-3.5 w-3.5"
          />
          Snap
        </button>
      </div>
    </div>

    <div
      v-if="shouldShowDiagramPanelToggle"
      class="pointer-events-none absolute right-3 top-3 z-[3] flex justify-end gap-2"
    >
      <UButton
        data-diagram-panel-toggle="true"
        :label="isDiagramPanelVisible ? 'Hide panel' : 'Show panel'"
        :leading-icon="isDiagramPanelVisible ? 'i-lucide-panel-right-close' : 'i-lucide-panel-right-open'"
        color="neutral"
        variant="outline"
        size="xs"
        class="pointer-events-auto"
        :class="panelToggleButtonClass"
        @click="toggleSidePanel"
      />
    </div>

    <aside
      v-if="isDiagramPanelVisible"
      data-diagram-panel="true"
      :class="diagramPanelSurfaceClass"
      :style="floatingPanelStyle"
      @wheel.stop
    >
      <div class="flex items-start justify-between gap-3 border-b border-[color:var(--studio-divider)] px-3 py-2.5">
        <div class="min-w-0 flex-1">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="font-mono text-[0.6rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
                Diagram panel
              </div>
              <h3 class="truncate text-[0.88rem] font-semibold leading-5 text-[color:var(--studio-shell-text)]">
                {{ diagramPanelTitle }}
              </h3>
              <p class="mt-1 text-[0.66rem] leading-5 text-[color:var(--studio-shell-muted)]">
                {{ diagramPanelDescription }}
              </p>
            </div>

            <UButton
              v-if="shouldShowDiagramPanelToggle"
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              :class="sidePanelCloseButtonClass"
              aria-label="Hide panel"
              @click="toggleSidePanel"
            />
          </div>

          <div class="mt-3 flex flex-wrap gap-2">
            <UButton
              data-diagram-create-table="true"
              label="Add table"
              leading-icon="i-lucide-table-properties"
              color="neutral"
              variant="outline"
              size="xs"
              :class="sidePanelActionButtonClass"
              @click="handleCreateTable(null)"
            />

            <UButton
              data-diagram-create-group="true"
              label="Add group"
              leading-icon="i-lucide-folder-plus"
              color="neutral"
              variant="outline"
              size="xs"
              :class="sidePanelActionButtonClass"
              @click="handleCreateGroup"
            />
          </div>
        </div>
      </div>

      <div class="grid grid-cols-3 border-b border-[color:var(--studio-divider)]">
        <button
          type="button"
          data-diagram-panel-tab="inspector"
          :class="getStudioTabButtonClass({ active: activePanelTab === 'inspector', withTrailingBorder: true })"
          @click="activePanelTab = 'inspector'"
        >
          Inspector
        </button>
        <button
          type="button"
          data-diagram-panel-tab="entities"
          :class="getStudioTabButtonClass({ active: activePanelTab === 'entities', withTrailingBorder: true })"
          @click="activePanelTab = 'entities'"
        >
          Entities
        </button>
        <button
          type="button"
          data-diagram-panel-tab="export"
          :class="getStudioTabButtonClass({ active: activePanelTab === 'export' })"
          @click="activePanelTab = 'export'"
        >
          Export
        </button>
      </div>

      <div
        v-if="activePanelTab === 'inspector'"
        data-studio-scrollable="true"
        class="grid content-start gap-3 overflow-auto px-3 py-3"
      >
        <div
          v-if="selectedNode"
          class="grid gap-2"
        >
          <label class="grid gap-1">
            <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Label</span>
            <input
              :value="selectedNode.title"
              type="text"
              :class="joinStudioClasses(studioCompactInputClass, 'select-text')"
              @input="updateNode(selectedNode.id, { title: ($event.target as HTMLInputElement).value })"
            >
          </label>

          <label class="grid gap-1">
            <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Color</span>
            <input
              :value="selectedNode.color"
              type="color"
              :class="studioColorInputClass"
              @input="updateNode(selectedNode.id, { color: ($event.target as HTMLInputElement).value })"
            >
          </label>

          <label
            v-if="selectedNode.kind !== 'group' && !selectedNode.collapsed"
            class="grid gap-1"
          >
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

          <label
            v-if="selectedNode.kind !== 'group' && !selectedNode.collapsed"
            class="grid gap-1"
          >
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

          <div
            v-if="selectedNode.kind === 'group'"
            class="grid gap-1"
          >
            <USwitch
              :model-value="selectedNode.masonry ?? false"
              data-group-masonry-switch="true"
              color="neutral"
              size="sm"
              label="Masonry"
              description="Keep the chosen column count, but pack tables vertically to reduce whitespace."
              :ui="studioSwitchUi"
              @update:model-value="updateNode(selectedNode.id, { masonry: Boolean($event) })"
            />
          </div>

          <label
            v-if="selectedNode.kind === 'group'"
            class="grid gap-1"
          >
            <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Table Columns · {{ selectedNode.columnCount || 1 }}</span>
            <input
              :value="selectedNode.columnCount || 1"
              data-group-column-count-slider="true"
              type="range"
              min="1"
              :max="Math.max(1, selectedNode.tableCount || 1)"
              class="w-full"
              @input="updateNode(selectedNode.id, { columnCount: Number(($event.target as HTMLInputElement).value) })"
            >
          </label>
        </div>

        <div
          v-else
          class="border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-3 py-3 text-[0.68rem] leading-6 text-[color:var(--studio-shell-muted)]"
        >
          Drag the canvas or select any schema object.
        </div>
      </div>

      <div
        v-else-if="activePanelTab === 'entities'"
        class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden"
      >
        <div class="grid gap-2 border-b border-[color:var(--studio-divider)] px-3 py-3">
          <label class="grid gap-1">
            <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Search entities</span>
            <input
              v-model="entitySearchQuery"
              data-entity-search="true"
              type="text"
              placeholder="Groups, tables, routines..."
              :class="studioCompactInputClass"
            >
          </label>
          <div class="flex items-center justify-between gap-3 text-[0.62rem] text-[color:var(--studio-shell-muted)]">
            <span>{{ filteredGroupedBrowserItems.length + filteredUngroupedBrowserItems.length + filteredStandaloneBrowserItems.length }} sections</span>
            <span>{{ hiddenEntityCount }} hidden</span>
          </div>
        </div>

        <div
          data-diagram-panel-scroll="true"
          data-studio-scrollable="true"
          class="grid content-start gap-2 overflow-auto overflow-x-hidden px-3 py-3"
          @wheel.stop
        >
          <div
            v-for="groupItem in filteredGroupedBrowserItems"
            :key="groupItem.id"
            class="grid content-start gap-1"
          >
            <div
              :data-browser-entity-row="groupItem.id"
              :data-browser-search-match="isBrowserItemSearchMatch(groupItem) ? 'true' : undefined"
              :style="getBrowserItemSearchMatchStyle(groupItem)"
              :class="[
                'grid content-start gap-1.5 border px-2 py-2 transition-colors duration-150',
                isBrowserItemSearchMatch(groupItem) ? 'pgml-browser-search-match-row' : '',
                isBrowserItemSelected(groupItem) ? 'border-[color:var(--studio-ring)] bg-[color:var(--studio-input-bg)]' : 'border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)]'
              ]"
            >
              <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <button
                  type="button"
                  class="min-w-0 flex-1 text-left"
                  @click="selectBrowserItem(groupItem)"
                  @dblclick.stop="focusBrowserItemSource(groupItem)"
                >
                  <div class="font-mono text-[0.54rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
                    <span :class="isBrowserItemSearchMatch(groupItem) ? 'pgml-browser-search-match-text' : ''">
                      {{ groupItem.kindLabel }}
                    </span>
                  </div>
                  <div class="break-words text-[0.76rem] font-semibold leading-5 text-[color:var(--studio-shell-text)]">
                    <span :class="isBrowserItemSearchMatch(groupItem) ? 'pgml-browser-search-match-text' : ''">
                      {{ groupItem.label }}
                    </span>
                  </div>
                  <div class="text-[0.64rem] text-[color:var(--studio-shell-muted)]">
                    {{ groupItem.subtitle }}
                  </div>
                </button>

                <div class="grid shrink-0 content-start gap-1">
                  <button
                    type="button"
                    :data-browser-group-edit="groupItem.label"
                    class="border px-2 py-1 font-mono text-[0.54rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-text)] transition-colors duration-150 hover:bg-[color:var(--studio-surface-hover)]"
                    @click="handleEditGroup(groupItem.label)"
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    :data-browser-visibility-toggle="groupItem.id"
                    :class="getBrowserItemVisibilityButtonClass(groupItem)"
                    @click="toggleBrowserItemVisibility(groupItem)"
                  >
                    {{ isBrowserItemDirectlyVisible(groupItem) ? 'Hide' : 'Show' }}
                  </button>
                </div>
              </div>

              <div class="grid content-start gap-1.5 pl-3">
                <div
                  v-for="tableItem in groupItem.children"
                  :key="tableItem.id"
                  :data-browser-entity-row="tableItem.id"
                  :data-browser-search-match="isBrowserItemSearchMatch(tableItem) ? 'true' : undefined"
                  :style="getBrowserItemSearchMatchStyle(tableItem)"
                  :class="[
                    'grid content-start gap-1 border-l border-[color:var(--studio-divider)] pl-3',
                    isBrowserItemSearchMatch(tableItem) ? 'pgml-browser-search-match-row' : ''
                  ]"
                >
                  <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                    <button
                      type="button"
                      class="min-w-0 flex-1 text-left"
                      @click="selectBrowserItem(tableItem)"
                      @dblclick.stop="focusBrowserItemSource(tableItem)"
                    >
                      <div class="font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
                        <span :class="isBrowserItemSearchMatch(tableItem) ? 'pgml-browser-search-match-text' : ''">
                          {{ tableItem.kindLabel }}
                        </span>
                      </div>
                      <div
                        class="break-words text-[0.72rem] font-medium leading-5"
                        :class="isBrowserItemEffectivelyVisible(tableItem) ? 'text-[color:var(--studio-shell-text)]' : 'text-[color:var(--studio-shell-muted)]'"
                      >
                        <span :class="isBrowserItemSearchMatch(tableItem) ? 'pgml-browser-search-match-text' : ''">
                          {{ tableItem.label }}
                        </span>
                      </div>
                    </button>

                    <button
                      type="button"
                      :data-browser-visibility-toggle="tableItem.id"
                      :disabled="isBrowserItemHiddenByAncestor(tableItem)"
                      :class="getBrowserItemVisibilityButtonClass(tableItem)"
                      @click="toggleBrowserItemVisibility(tableItem)"
                    >
                      {{ isBrowserItemHiddenByAncestor(tableItem) ? 'Group hidden' : (isBrowserItemDirectlyVisible(tableItem) ? 'Hide' : 'Show') }}
                    </button>
                  </div>

                  <div
                    v-if="tableItem.children.length"
                    class="grid content-start gap-0.5 pl-3"
                  >
                    <div
                      v-for="childItem in tableItem.children"
                      :key="childItem.id"
                      :data-browser-entity-row="childItem.id"
                      :data-browser-search-match="isBrowserItemSearchMatch(childItem) ? 'true' : undefined"
                      :style="getBrowserItemSearchMatchStyle(childItem)"
                      :class="[
                        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-l border-[color:var(--studio-divider)] pl-3 py-0.5',
                        isBrowserItemSearchMatch(childItem) ? 'pgml-browser-search-match-row' : ''
                      ]"
                    >
                      <button
                        type="button"
                        class="min-w-0 text-left"
                        @click="selectBrowserItem(childItem)"
                        @dblclick.stop="focusBrowserItemSource(childItem)"
                      >
                        <span class="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                          <span class="font-mono text-[0.48rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
                            <span :class="isBrowserItemSearchMatch(childItem) ? 'pgml-browser-search-match-text' : ''">
                              {{ childItem.kindLabel }}
                            </span>
                          </span>
                          <span
                            class="break-words text-[0.66rem] leading-4"
                            :class="isBrowserItemEffectivelyVisible(childItem) ? 'text-[color:var(--studio-shell-text)]' : 'text-[color:var(--studio-shell-muted)]'"
                          >
                            <span :class="isBrowserItemSearchMatch(childItem) ? 'pgml-browser-search-match-text' : ''">
                              {{ childItem.label }}
                            </span>
                          </span>
                        </span>
                      </button>

                      <button
                        v-if="browserItemSupportsVisibility(childItem)"
                        type="button"
                        :data-browser-visibility-toggle="childItem.id"
                        :disabled="isBrowserItemHiddenByAncestor(childItem)"
                        :class="getBrowserItemVisibilityButtonClass(childItem, true)"
                        @click="toggleBrowserItemVisibility(childItem)"
                      >
                        {{ isBrowserItemHiddenByAncestor(childItem) ? 'Table hidden' : (isBrowserItemDirectlyVisible(childItem) ? 'Hide' : 'Show') }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="filteredUngroupedBrowserItems.length"
            class="grid content-start gap-1"
          >
            <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
              Ungrouped Tables
            </div>

            <div
              v-for="tableItem in filteredUngroupedBrowserItems"
              :key="tableItem.id"
              :data-browser-entity-row="tableItem.id"
              :data-browser-search-match="isBrowserItemSearchMatch(tableItem) ? 'true' : undefined"
              :style="getBrowserItemSearchMatchStyle(tableItem)"
              :class="[
                'grid content-start gap-1 border px-2 py-2 transition-colors duration-150',
                isBrowserItemSearchMatch(tableItem) ? 'pgml-browser-search-match-row' : '',
                isBrowserItemSelected(tableItem) ? 'border-[color:var(--studio-ring)] bg-[color:var(--studio-input-bg)]' : 'border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)]'
              ]"
            >
              <div class="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <button
                  type="button"
                  class="min-w-0 flex-1 text-left"
                  @click="selectBrowserItem(tableItem)"
                  @dblclick.stop="focusBrowserItemSource(tableItem)"
                >
                  <div class="font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
                    <span :class="isBrowserItemSearchMatch(tableItem) ? 'pgml-browser-search-match-text' : ''">
                      {{ tableItem.kindLabel }}
                    </span>
                  </div>
                  <div
                    class="break-words text-[0.72rem] font-medium leading-5"
                    :class="isBrowserItemEffectivelyVisible(tableItem) ? 'text-[color:var(--studio-shell-text)]' : 'text-[color:var(--studio-shell-muted)]'"
                  >
                    <span :class="isBrowserItemSearchMatch(tableItem) ? 'pgml-browser-search-match-text' : ''">
                      {{ tableItem.label }}
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  :data-browser-visibility-toggle="tableItem.id"
                  :class="getBrowserItemVisibilityButtonClass(tableItem)"
                  @click="toggleBrowserItemVisibility(tableItem)"
                >
                  {{ isBrowserItemDirectlyVisible(tableItem) ? 'Hide' : 'Show' }}
                </button>
              </div>

              <div
                v-if="tableItem.children.length"
                class="grid content-start gap-0.5 pl-3"
              >
                <div
                  v-for="childItem in tableItem.children"
                  :key="childItem.id"
                  :data-browser-entity-row="childItem.id"
                  :data-browser-search-match="isBrowserItemSearchMatch(childItem) ? 'true' : undefined"
                  :style="getBrowserItemSearchMatchStyle(childItem)"
                  :class="[
                    'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-l border-[color:var(--studio-divider)] pl-3 py-0.5',
                    isBrowserItemSearchMatch(childItem) ? 'pgml-browser-search-match-row' : ''
                  ]"
                >
                  <button
                    type="button"
                    class="min-w-0 text-left"
                    @click="selectBrowserItem(childItem)"
                    @dblclick.stop="focusBrowserItemSource(childItem)"
                  >
                    <span class="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <span class="font-mono text-[0.48rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
                        <span :class="isBrowserItemSearchMatch(childItem) ? 'pgml-browser-search-match-text' : ''">
                          {{ childItem.kindLabel }}
                        </span>
                      </span>
                      <span
                        class="break-words text-[0.66rem] leading-4"
                        :class="isBrowserItemEffectivelyVisible(childItem) ? 'text-[color:var(--studio-shell-text)]' : 'text-[color:var(--studio-shell-muted)]'"
                      >
                        <span :class="isBrowserItemSearchMatch(childItem) ? 'pgml-browser-search-match-text' : ''">
                          {{ childItem.label }}
                        </span>
                      </span>
                    </span>
                  </button>

                  <button
                    v-if="browserItemSupportsVisibility(childItem)"
                    type="button"
                    :data-browser-visibility-toggle="childItem.id"
                    :class="getBrowserItemVisibilityButtonClass(childItem, true)"
                    @click="toggleBrowserItemVisibility(childItem)"
                  >
                    {{ isBrowserItemDirectlyVisible(childItem) ? 'Hide' : 'Show' }}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="filteredStandaloneBrowserItems.length"
            class="grid content-start gap-1"
          >
            <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
              Standalone Objects
            </div>

            <div
              v-for="item in filteredStandaloneBrowserItems"
              :key="item.id"
              :data-browser-entity-row="item.id"
              :data-browser-search-match="isBrowserItemSearchMatch(item) ? 'true' : undefined"
              :style="getBrowserItemSearchMatchStyle(item)"
              :class="[
                'flex items-start justify-between gap-2 border px-2 py-2 transition-colors duration-150',
                isBrowserItemSearchMatch(item) ? 'pgml-browser-search-match-row' : '',
                isBrowserItemSelected(item) ? 'border-[color:var(--studio-ring)] bg-[color:var(--studio-input-bg)]' : 'border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)]'
              ]"
            >
              <button
                type="button"
                class="min-w-0 flex-1 text-left"
                @click="selectBrowserItem(item)"
                @dblclick.stop="focusBrowserItemSource(item)"
              >
                <div class="font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
                  <span :class="isBrowserItemSearchMatch(item) ? 'pgml-browser-search-match-text' : ''">
                    {{ item.kindLabel }}
                  </span>
                </div>
                <div
                  class="truncate text-[0.72rem] font-medium"
                  :class="isBrowserItemEffectivelyVisible(item) ? 'text-[color:var(--studio-shell-text)]' : 'text-[color:var(--studio-shell-muted)]'"
                >
                  <span :class="isBrowserItemSearchMatch(item) ? 'pgml-browser-search-match-text' : ''">
                    {{ item.label }}
                  </span>
                </div>
                <div
                  v-if="item.subtitle"
                  class="break-words text-[0.62rem] leading-5 text-[color:var(--studio-shell-muted)]"
                >
                  {{ item.subtitle }}
                </div>
              </button>

              <button
                type="button"
                :data-browser-visibility-toggle="item.id"
                :class="getBrowserItemVisibilityButtonClass(item)"
                @click="toggleBrowserItemVisibility(item)"
              >
                {{ isBrowserItemDirectlyVisible(item) ? 'Hide' : 'Show' }}
              </button>
            </div>
          </div>

          <div
            v-if="!filteredGroupedBrowserItems.length && !filteredUngroupedBrowserItems.length && !filteredStandaloneBrowserItems.length"
            class="border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-3 py-3 text-[0.68rem] leading-6 text-[color:var(--studio-shell-muted)]"
          >
            No entities match the current search.
          </div>
        </div>
      </div>

      <div
        v-else
        class="grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden"
      >
        <div class="grid gap-3 border-b border-[color:var(--studio-divider)] px-3 py-3">
          <div class="grid grid-cols-2 gap-2">
            <UButton
              data-export-format="sql"
              label="SQL"
              color="neutral"
              variant="outline"
              size="xs"
              :class="getStudioChoiceButtonClass({
                active: exportPreferences.format === 'sql',
                extraClass: 'justify-center'
              })"
              @click="updateExportFormat('sql')"
            />
            <UButton
              data-export-format="kysely"
              label="Kysely"
              color="neutral"
              variant="outline"
              size="xs"
              :class="getStudioChoiceButtonClass({
                active: exportPreferences.format === 'kysely',
                extraClass: 'justify-center'
              })"
              @click="updateExportFormat('kysely')"
            />
          </div>

          <label
            v-if="exportPreferences.format === 'kysely'"
            class="grid gap-1"
          >
            <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Kysely type style</span>
            <USelect
              aria-label="Kysely type style"
              :items="exportTypeStyleItems"
              :model-value="exportPreferences.kyselyTypeStyle"
              value-key="value"
              label-key="label"
              color="neutral"
              variant="outline"
              size="sm"
              :ui="studioSelectUi"
              @update:model-value="updateKyselyTypeStyle(String($event))"
            />
          </label>
        </div>

        <div
          v-if="activeExportWarnings.length"
          class="grid gap-1 border-b border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-3 py-3"
        >
          <div class="font-mono text-[0.56rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
            Export Notes
          </div>
          <p
            v-for="warning in activeExportWarnings"
            :key="warning"
            class="text-[0.66rem] leading-5 text-[color:var(--studio-shell-muted)]"
          >
            {{ warning }}
          </p>
        </div>

        <div
          data-diagram-export-panel="true"
          data-studio-scrollable="true"
          class="grid min-h-0 content-start gap-3 overflow-auto px-3 py-3"
        >
          <div
            v-if="hasBlockingSourceErrors"
            class="border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-3 py-3 text-[0.68rem] leading-6 text-[color:var(--studio-shell-muted)]"
          >
            Resolve the current PGML parse errors to generate SQL or Kysely exports.
          </div>

          <template v-else>
            <article
              v-for="artifact in activeExportArtifacts"
              :key="artifact.key"
              :data-export-artifact="artifact.key"
              class="grid min-h-0 gap-2 border border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)]"
            >
              <div class="flex items-start justify-between gap-3 border-b border-[color:var(--studio-divider)] px-3 py-2.5">
                <div class="min-w-0">
                  <div class="font-mono text-[0.56rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
                    {{ artifact.label }}
                  </div>
                  <div class="mt-1 break-words text-[0.68rem] text-[color:var(--studio-shell-muted)]">
                    {{ artifact.fileName }}
                  </div>
                </div>

                <div class="flex shrink-0 items-center gap-1">
                  <UButton
                    :data-export-copy="artifact.key"
                    :data-export-copy-state="getExportCopyFeedbackStatus(artifact.key) || 'idle'"
                    :leading-icon="getExportCopyButtonIcon(artifact.key)"
                    :label="getExportCopyButtonLabel(artifact.key)"
                    color="neutral"
                    variant="outline"
                    size="xs"
                    :class="getExportCopyButtonClass(artifact.key)"
                    @click="void copyExportArtifact(artifact)"
                  />
                  <UButton
                    :data-export-download="artifact.key"
                    label="Download"
                    color="neutral"
                    variant="outline"
                    size="xs"
                    :class="getStudioChoiceButtonClass({
                      extraClass: 'justify-center'
                    })"
                    @click="downloadExportArtifact(artifact)"
                  />
                </div>
              </div>

              <pre
                data-studio-scrollable="true"
                class="max-h-[16rem] overflow-auto px-3 py-3 font-mono text-[0.64rem] leading-5 text-[color:var(--studio-shell-text)]"
              >{{ artifact.content }}</pre>
            </article>
          </template>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.pgml-reference-race-path {
  stroke: var(--pgml-reference-race-solid);
  stroke-width: 2px !important;
  opacity: 1 !important;
  stroke-dasharray: 14 10;
  stroke-dashoffset: 0;
  stroke-linecap: round;
  animation: pgml-reference-race-line 0.58s linear infinite;
  filter:
    drop-shadow(0 0 6px var(--pgml-reference-race-soft))
    drop-shadow(0 0 16px var(--pgml-reference-race-strong))
    drop-shadow(0 0 28px var(--pgml-reference-race-strong));
}

.pgml-browser-search-match-row {
  box-shadow:
    inset 2px 0 0 color-mix(in srgb, var(--pgml-browser-match-color) 82%, transparent),
    inset 0 0 0 1px color-mix(in srgb, var(--pgml-browser-match-color) 14%, transparent);
  background-image: linear-gradient(90deg, color-mix(in srgb, var(--pgml-browser-match-color) 12%, transparent), transparent 42%);
}

.pgml-browser-search-match-text {
  display: inline-block;
  color: color-mix(in srgb, var(--pgml-browser-match-color) 72%, var(--studio-shell-text) 28%);
  text-shadow: 0 0 10px color-mix(in srgb, var(--pgml-browser-match-color) 26%, transparent);
  animation: pgml-browser-match-bounce 0.26s cubic-bezier(0.22, 1, 0.36, 1);
}

@media (prefers-reduced-motion: reduce) {
  .pgml-browser-search-match-text {
    animation: none;
  }
}

@keyframes pgml-reference-race-line {
  to {
    stroke-dashoffset: 24;
  }
}

@keyframes pgml-browser-match-bounce {
  0% {
    transform: translateY(0) scale(1);
  }

  34% {
    transform: translateY(-1.5px) scale(1.03);
  }

  58% {
    transform: translateY(0.8px) scale(0.995);
  }

  100% {
    transform: translateY(0) scale(1);
  }
}
</style>
