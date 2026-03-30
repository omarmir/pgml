<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import type { CSSProperties, Ref } from 'vue'
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { studioSelectUi, studioSwitchUi } from '~/constants/ui'
import PgmlDiagramComparePanel from '~/components/pgml/PgmlDiagramComparePanel.vue'
import PgmlDetailPopoverSourceEditor from '~/components/pgml/PgmlDetailPopoverSourceEditor.vue'
import PgmlDiagramGpuScene from '~/components/pgml/PgmlDiagramGpuScene.vue'
import PgmlDiagramVersionsPanel from '~/components/pgml/PgmlDiagramVersionsPanel.vue'
import { buildTableGroupMasonryLayout, type TableAttachment, type TableAttachmentFlag, type TableAttachmentKind } from '~/utils/pgml-diagram-canvas'
import {
  getPgmlDiagramCompareChangeColor,
  type PgmlDiagramCompareEntry
} from '~/utils/pgml-diagram-compare'
import {
  defaultPgmlTableWidthScale,
  normalizePgmlTableWidthScale,
  pgmlTableWidthScaleValues
} from '~/utils/pgml-node-properties'
import {
  diagramBackgroundColor,
  diagramDividerColor,
  diagramDotColor,
  diagramGroupHeaderBandHeight,
  diagramGroupHeaderHeight,
  diagramGroupHorizontalPadding,
  diagramGroupTableGap,
  diagramGroupTableWidth,
  diagramGroupVerticalPadding,
  diagramObjectCollapsedHeight,
  diagramLabelTextColor,
  diagramMutedTextColor,
  diagramObjectHeaderHeight,
  diagramObjectMinHeight,
  diagramPalette,
  diagramRailColor,
  diagramRowSurfaceColor,
  diagramSurfaceColor,
  diagramTableHeaderHeight,
  diagramTableRowHeight,
  diagramTableSurfaceColor,
  diagramTextColor,
  getDiagramSchemaBadgeColor,
  getStoredGroupId,
  normalizeDiagramNodeLayoutProperties,
  estimateDiagramTableHeight,
  type DiagramGpuConnectionLine,
  type DiagramGpuGroupNode,
  type DiagramGpuImpactTarget,
  type DiagramGpuNodeLayoutState,
  type DiagramGpuObjectNode,
  type DiagramGpuRow,
  type DiagramGpuSelection,
  type DiagramGpuTableCard,
  type DiagramGpuWorldBounds
} from '~/utils/diagram-gpu-scene'
import type {
  PgmlAffects,
  PgmlColumn,
  PgmlConstraint,
  PgmlCustomType,
  PgmlIndex,
  PgmlNodeProperties,
  PgmlReference,
  PgmlRoutine,
  PgmlSchemaModel,
  PgmlSequence,
  PgmlTable,
  PgmlSourceRange,
  PgmlTrigger
} from '~/utils/pgml'
import {
  dedentPgmlSourceForEditor,
  extractPgmlRoutineBodyFromExecutableSource,
  getOrderedGroupTables,
  getPgmlSourceSelectionRange,
  normalizePgmlBlockSourceForEditor,
  reindentPgmlBlockEditorText,
  replacePgmlConstraintExpressionInBlock,
  replacePgmlExecutableSourceInBlock,
  replacePgmlRoutineBodyInBlock,
  getSequenceAttachedTableIds
} from '~/utils/pgml'
import { normalizeSvgPaint } from '~/utils/svg-paint'
import {
  defaultStudioMobilePanelTab,
  type DiagramPanelTab,
  type StudioMobileCanvasView
} from '~/utils/studio-workspace'
import {
  getStudioStateButtonClass,
  getStudioTabButtonClass,
  joinStudioClasses,
  studioButtonClasses,
  studioColorInputClass,
  studioCompactInputClass,
  studioToolbarButtonClass
} from '~/utils/uiStyles'

type DiagramCanvasExposed = {
  getScale: () => number
  focusBounds: (bounds: { height: number, width: number, x: number, y: number }, padding?: number) => void
  resetView: () => void
  zoomBy: (direction: 1 | -1) => void
}

type DiagramCanvasViewportTransform = {
  panX: number
  panY: number
  scale: number
}

type MeasuredBounds = {
  bottom: number
  height: number
  left: number
  right: number
  top: number
  width: number
}

type ConnectionEndpointLocator = {
  attribute: string
  value: string
} | null

type RoutingWorkerGeometryInput = {
  bounds: MeasuredBounds
  groupNodeId: string | null
  identity: string
  isColumnAnchor: boolean
  isColumnLabelAnchor: boolean
  locator: ConnectionEndpointLocator
  nodeAnchorId: string | null
  ownerNodeId: string | null
  rowKey: string | null
  tableBounds: MeasuredBounds | null
  tableId: string | null
}

type RoutingWorkerDescriptorInput = {
  animated: boolean
  color: string
  dashPattern: string
  dashed: boolean
  fromGeometry: RoutingWorkerGeometryInput
  key: string
  selectedForeground: boolean
  toGeometry: RoutingWorkerGeometryInput
}

type RoutingWorkerResponse = {
  lines: DiagramGpuConnectionLine[]
  requestId: number
}

type TableRowRecord = {
  key: string
  row: DiagramGpuRow
}

type TableAttachmentState = {
  attachedObjectIds: Set<string>
  attachmentsByTableId: Record<string, TableAttachment[]>
}

type EntityBrowserItemKind = 'attachment' | 'column' | 'group' | 'object' | 'table'

type EntityBrowserItem = {
  children: EntityBrowserItem[]
  id: string
  kind: EntityBrowserItemKind
  kindLabel: string
  label: string
  searchText: string
  selection: DiagramGpuSelection
  sourceRange?: PgmlSourceRange
  subtitle: string
}

type DiagramDetailPopover = {
  color: string
  details: string[]
  flags: TableAttachmentFlag[]
  id: string
  kind: 'attachment' | 'object'
  kindLabel: string
  sourceRange?: PgmlSourceRange
  subtitle: string
  title: string
}

type MeasuredSize = {
  height: number
  width: number
}

type VersionPanelItem = {
  ancestorCount: number
  branchLeafCount: number
  branchMaxDepth: number
  branchVersionCount: number
  branchRootId: string | null
  branchRootLabel: string | null
  childCount: number
  createdAt: string
  descendantCount: number
  depth: number
  id: string
  isLeaf: boolean
  isLatestByRole: boolean
  isLatestOverall: boolean
  isRoot: boolean
  siblingCount: number
  isWorkspaceBase: boolean
  label: string
  lineageLabel: string
  parentVersionLabel: string | null
  parentVersionId: string | null
  role: 'design' | 'implementation'
}

type VersionCompareOption = {
  label: string
  value: string
}

type VersionDiffSection = {
  count: number
  items: Array<{
    id: string
    kind: 'added' | 'modified' | 'removed'
    label: string
  }>
  label: string
}

type DetailPopoverPlacement = {
  left: number
  top: number
  width: number
}

type DiagramCompareGhostOverlay = {
  bounds: MeasuredBounds
  color: string
  entryId: string
  label: string
}

type DiagramCompareNodeHighlight = {
  active: boolean
  color: string
  entryIds: string[]
}

type DetailPopoverEditorSpec = {
  description: string
  languageMode: 'pgml' | 'pgml-snippet' | 'sql'
  source: string
  title: string
  toReplacementText: (nextSource: string) => string | null
}

const {
  canCreateCheckpoint = true,
  canEditDetailSource = false,
  compareBaseLabel = 'Base',
  compareBaseModel = null,
  compareEntries = [],
  compareRelationshipSummary = '',
  compareTargetLabel = 'Target',
  exportBaseName = 'pgml-schema',
  exportPreferenceKey = 'name:pgml-schema',
  hasBlockingSourceErrors = false,
  layoutChanged = 0,
  latestVersionId = null,
  mobileActiveView = null,
  mobilePanelTab = null,
  migrationFileName = 'pgml-version.migration.sql',
  migrationHasChanges = false,
  migrationKysely = '',
  migrationKyselyFileName = 'pgml-version.migration.ts',
  migrationSql = '',
  migrationWarnings = [],
  model,
  previewTargetId = 'workspace',
  sourceText = '',
  versionCompareBaseId = null,
  versionCompareOptions = [],
  versionCompareTargetId = 'workspace',
  versionDiffSections = [],
  versionItems = [],
  workspaceBaseLabel = 'No base version yet',
  workspaceStatus = 'Draft is ready to checkpoint.',
  viewportResetKey = 0
} = defineProps<{
  canCreateCheckpoint?: boolean
  canEditDetailSource?: boolean
  compareBaseLabel?: string
  compareBaseModel?: PgmlSchemaModel | null
  compareEntries?: PgmlDiagramCompareEntry[]
  compareRelationshipSummary?: string
  compareTargetLabel?: string
  exportBaseName?: string
  exportPreferenceKey?: string
  hasBlockingSourceErrors?: boolean
  layoutChanged?: number
  latestVersionId?: string | null
  mobileActiveView?: StudioMobileCanvasView | null
  mobilePanelTab?: DiagramPanelTab | null
  migrationFileName?: string
  migrationHasChanges?: boolean
  migrationKysely?: string
  migrationKyselyFileName?: string
  migrationSql?: string
  migrationWarnings?: string[]
  model: PgmlSchemaModel
  previewTargetId?: string
  sourceText?: string
  versionCompareBaseId?: string | null
  versionCompareOptions?: VersionCompareOption[]
  versionCompareTargetId?: string
  versionDiffSections?: VersionDiffSection[]
  versionItems?: VersionPanelItem[]
  workspaceBaseLabel?: string
  workspaceStatus?: string
  viewportResetKey?: number
}>()

const emit = defineEmits<{
  createGroup: []
  createTable: [groupName: string | null]
  editGroup: [groupName: string]
  editTable: [tableId: string]
  focusSource: [sourceRange: PgmlSourceRange]
  nodePropertiesChange: [properties: Record<string, PgmlNodeProperties>]
  panelTabChange: [tab: DiagramPanelTab]
  replaceSourceRange: [payload: { nextText: string, sourceRange: PgmlSourceRange }]
  restoreVersion: [versionId: string]
  updateVersionCompareBaseId: [value: string | null]
  updateVersionCompareTargetId: [value: string]
  versionCheckpoint: []
  versionImportDump: []
  viewVersionTarget: [targetId: string]
}>()

const sceneRef: Ref<DiagramCanvasExposed | null> = ref(null)
const viewportRef: Ref<HTMLDivElement | null> = ref(null)
const detailPopoverRef: Ref<HTMLDivElement | null> = ref(null)
const selectedSelection: Ref<DiagramGpuSelection | null> = ref(null)
const selectedCompareEntryId: Ref<string | null> = ref(null)
const isEditingDetailSource: Ref<boolean> = ref(false)
const detailPopoverEditorSource: Ref<string> = ref('')
const activePanelTab: Ref<DiagramPanelTab> = ref('inspector')
const isDesktopSidePanelOpen: Ref<boolean> = ref(true)
const showRelationshipLines: Ref<boolean> = ref(true)
const snapToGrid: Ref<boolean> = ref(true)
const currentScale: Ref<number> = ref(1)
const sceneTransform: Ref<DiagramCanvasViewportTransform> = ref({
  panX: 0,
  panY: 0,
  scale: 1
})
const viewportSize: Ref<MeasuredSize> = ref({
  height: 0,
  width: 0
})
const detailPopoverSize: Ref<MeasuredSize> = ref({
  height: 0,
  width: 0
})
const entitySearchQuery: Ref<string> = ref('')
const entitySearchInputRef: Ref<HTMLInputElement | null> = ref(null)
const connectionLines: Ref<DiagramGpuConnectionLine[]> = ref([])
const groupLayoutStates: Ref<Record<string, DiagramGpuGroupNode>> = ref({})
const floatingTableStates: Ref<Record<string, DiagramGpuNodeLayoutState>> = ref({})
const objectLayoutStates: Ref<Record<string, DiagramGpuObjectNode>> = ref({})

let routingWorker: Worker | null = null
let routingWorkerRequestId = 0
let latestConnectionRequestId = 0
const pendingRoutingRequests = new Map<number, {
  reject: (reason?: unknown) => void
  resolve: (lines: DiagramGpuConnectionLine[]) => void
}>()

const panelToggleButtonClass = joinStudioClasses(studioButtonClasses.secondary, studioToolbarButtonClass)
const sidePanelActionButtonClass = joinStudioClasses(studioButtonClasses.secondary, studioToolbarButtonClass)
const sidePanelCloseButtonClass = joinStudioClasses(studioButtonClasses.iconGhost, 'h-7 w-7 justify-center px-0')
const detailPopoverKindBadgeClass = 'inline-flex items-center border px-1.5 font-mono text-[0.56rem] uppercase tracking-[0.08em]'
const detailPopoverFlagBadgeClass = 'inline-flex items-center border px-1.5 py-0.5 font-mono text-[0.54rem] uppercase tracking-[0.06em]'
// Imported routine and sequence bodies often preserve hard tabs from the source
// SQL. Keep the tab width compact in the floating popover so mobile previews do
// not waste horizontal space on indentation alone.
const detailPopoverDetailTextClass = 'break-words whitespace-pre-wrap font-mono text-[0.62rem] leading-5 text-[color:var(--studio-shell-muted)] [overflow-wrap:anywhere] [tab-size:2]'
const browserItemActionButtonBaseClass = 'inline-flex shrink-0 items-center justify-center px-2 leading-none'
const browserItemActionButtonClass = getStudioStateButtonClass({
  extraClass: joinStudioClasses(browserItemActionButtonBaseClass, 'h-7 min-w-[3.5rem]')
})
const browserItemCompactActionButtonClass = getStudioStateButtonClass({
  compact: true,
  extraClass: joinStudioClasses(browserItemActionButtonBaseClass, 'h-6 min-w-[3rem]')
})
const browserItemActionRailClass = 'grid w-[3.5rem] shrink-0 content-start justify-items-stretch gap-1'
const browserItemCompactActionRailClass = 'flex w-[6.25rem] shrink-0 flex-wrap items-start justify-end gap-1'
const browserItemRowGridClass = 'grid grid-cols-[minmax(0,1fr)_3.5rem] items-start gap-2'
const browserItemCompactRowGridClass = 'grid grid-cols-[minmax(0,1fr)_6.25rem] items-start gap-2'
const tableWidthScaleItems = pgmlTableWidthScaleValues.map((value) => {
  return {
    label: `${value}x`,
    value
  }
})
const attachmentKindOrder: Record<TableAttachmentKind, number> = {
  Constraint: 1,
  Function: 3,
  Index: 0,
  Procedure: 4,
  Sequence: 5,
  Trigger: 2
}
const attachmentKindColors: Record<TableAttachmentKind, string> = {
  Constraint: '#fb7185',
  Function: '#c084fc',
  Index: '#38bdf8',
  Procedure: '#f97316',
  Sequence: '#eab308',
  Trigger: '#22c55e'
}
const objectKindColors: Record<string, string> = {
  'Custom Type': '#14b8a6',
  Function: '#c084fc',
  Procedure: '#f97316',
  Sequence: '#eab308',
  Trigger: '#22c55e'
}

const objectColumnGapX = 300
const objectRowGapY = 188

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value))
}

const downloadBlob = (blob: Blob, fileName: string) => {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = objectUrl
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}

const isMobileCanvasShell = computed(() => mobileActiveView !== null)
const isMobilePanelView = computed(() => mobileActiveView === 'panel')
const previewableObjectKindLabels = new Set(['Function', 'Procedure', 'Sequence', 'Trigger'])
const isDiagramPanelVisible = computed(() => {
  if (isMobileCanvasShell.value) {
    return isMobilePanelView.value
  }

  return isDesktopSidePanelOpen.value
})
const shouldShowDiagramPanelToggle = computed(() => !isMobileCanvasShell.value)
const shouldShowZoomToolbar = computed(() => !isMobilePanelView.value)

const normalizeReferenceValue = (value: string) => {
  return value.replaceAll('"', '').trim().toLowerCase()
}

const getMetadataValue = (metadata: Array<{ key: string, value: string }>, key: string) => {
  const normalizedKey = key.trim().toLowerCase()

  return metadata.find(entry => entry.key.trim().toLowerCase() === normalizedKey)?.value || null
}

const uniqueValues = <T,>(values: T[]) => {
  return Array.from(new Set(values))
}

const cleanForSearch = (value: string) => value.toLowerCase().replaceAll(/[^\w.]+/g, ' ')

const sanitizeReferenceValue = (value: string) => {
  return value
    .trim()
    .replaceAll('"', '')
    .replaceAll('\'', '')
    .replace(/[(),;]/g, '')
}

const buildTableReferenceLookup = (tables: PgmlTable[]) => {
  const bareNameMatches = tables.reduce<Record<string, string[]>>((entries, table) => {
    const bareName = table.name.toLowerCase()

    if (!entries[bareName]) {
      entries[bareName] = []
    }

    entries[bareName]?.push(table.fullName)
    return entries
  }, {})
  const referenceLookup = new Map<string, string>()

  tables.forEach((table) => {
    referenceLookup.set(table.fullName.toLowerCase(), table.fullName)

    if (table.schema === 'public') {
      referenceLookup.set(table.name.toLowerCase(), table.fullName)
    }
  })

  Object.entries(bareNameMatches).forEach(([bareName, fullNames]) => {
    if (fullNames.length === 1) {
      referenceLookup.set(bareName, fullNames[0] || '')
    }
  })

  return referenceLookup
}

const tableReferenceLookup = computed(() => buildTableReferenceLookup(model.tables))

const resolveTableIdentifier = (value: string) => {
  const normalizedValue = sanitizeReferenceValue(value).toLowerCase()

  if (!normalizedValue) {
    return null
  }

  const directMatch = tableReferenceLookup.value.get(normalizedValue)

  if (directMatch) {
    return directMatch
  }

  return model.tables.find(table => table.name.toLowerCase() === normalizedValue)?.fullName || null
}

const resolveTableIdsFromValue = (
  value: string,
  defaultTableId: string | null = null
) => {
  const normalizedValue = sanitizeReferenceValue(value)

  if (!normalizedValue) {
    return []
  }

  const parts = normalizedValue.split('.')

  if (
    parts.length === 2
    && defaultTableId
    && ['new', 'old'].includes((parts[0] || '').toLowerCase())
  ) {
    return [defaultTableId]
  }

  if (parts.length === 3) {
    const tableId = resolveTableIdentifier(`${parts[0]}.${parts[1]}`)

    return tableId ? [tableId] : []
  }

  if (parts.length === 2) {
    const fullTableMatch = resolveTableIdentifier(`${parts[0]}.${parts[1]}`)

    if (fullTableMatch) {
      return [fullTableMatch]
    }

    const matchingTable = model.tables.find((table) => {
      return table.name.toLowerCase() === (parts[0] || '').toLowerCase()
    })

    if (matchingTable && matchingTable.columns.some(column => column.name.toLowerCase() === (parts[1] || '').toLowerCase())) {
      return [matchingTable.fullName]
    }
  }

  const directTable = resolveTableIdentifier(normalizedValue)

  if (directTable) {
    return [directTable]
  }

  if (defaultTableId) {
    const defaultTable = model.tables.find(table => table.fullName === defaultTableId)

    if (defaultTable?.columns.some(column => column.name.toLowerCase() === normalizedValue.toLowerCase())) {
      return [defaultTableId]
    }
  }

  return []
}

const getTableIdsFromValues = (values: string[], defaultTableId: string | null = null) => {
  return uniqueValues(values.flatMap(value => resolveTableIdsFromValue(value, defaultTableId)))
}

const inferSourceTableIds = (source: string, defaultTableId: string | null = null) => {
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

  return getTableIdsFromValues(values, defaultTableId)
}

const getUniqueImpactTargets = (targets: DiagramGpuImpactTarget[]) => {
  const seen = new Set<string>()

  return targets.filter((target) => {
    const key = `${target.tableId}:${target.columnName || '*'}`

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

const inferColumnsFromText = (
  tableId: string,
  value: string
) => {
  const table = model.tables.find(entry => entry.fullName === tableId)

  if (!table) {
    return []
  }

  const haystack = cleanForSearch(value)

  return table.columns
    .filter((column) => {
      const variants = uniqueValues([
        cleanForSearch(column.name),
        cleanForSearch(`${table.name}.${column.name}`),
        cleanForSearch(`${table.fullName}.${column.name}`)
      ])

      return variants.some(variant => variant.length > 0 && haystack.includes(variant))
    })
    .map(column => column.name)
}

const getImpactTargetsFromValues = (
  values: string[],
  defaultTableId: string | null = null
) => {
  return getUniqueImpactTargets(values.flatMap((value) => {
    const tableIds = resolveTableIdsFromValue(value, defaultTableId)
    const normalizedValue = sanitizeReferenceValue(value)
    const parts = normalizedValue.split('.')
    const inferredColumnName = parts.length > 0 ? parts.at(-1) || null : null

    return tableIds.flatMap((tableId) => {
      const table = model.tables.find(entry => entry.fullName === tableId)
      const matchedColumn = inferredColumnName && table?.columns.some(column => column.name.toLowerCase() === inferredColumnName.toLowerCase())
        ? table.columns.find(column => column.name.toLowerCase() === inferredColumnName.toLowerCase())?.name || null
        : null

      return [{
        columnName: matchedColumn,
        tableId
      } satisfies DiagramGpuImpactTarget]
    })
  }))
}

const getRoutineNameSearchKeys = (value: string) => {
  return uniqueValues([
    cleanForSearch(value),
    cleanForSearch(value.split('.').at(-1) || value)
  ]).filter(entry => entry.length > 0)
}

const inferRoutineTargets = (routine: PgmlRoutine) => {
  const affectValues = routine.affects
    ? [
        ...routine.affects.writes,
        ...routine.affects.sets,
        ...routine.affects.dependsOn,
        ...routine.affects.reads,
        ...routine.affects.uses,
        ...routine.affects.ownedBy
      ]
    : []
  const sourceTableIds = routine.source
    ? inferSourceTableIds(routine.source)
    : []
  const tableIds = uniqueValues([
    ...getTableIdsFromValues(affectValues),
    ...sourceTableIds,
    ...getRoutineTableIds(routine)
  ])

  return tableIds.length > 0
    ? tableIds.map((tableId) => {
        const detailColumns = inferColumnsFromText(tableId, `${routine.signature} ${routine.details.join(' ')} ${routine.source || ''}`)

        if (detailColumns.length > 0) {
          return detailColumns.map((columnName) => ({
            columnName,
            tableId
          }))
        }

        return [{
          columnName: null,
          tableId
        }]
      }).flat()
    : []
}

const inferTriggerTargets = (tableId: string, trigger: PgmlTrigger) => {
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
    ? getImpactTargetsFromValues(inferSourceTableIds(trigger.source, tableId), tableId)
    : []
  const matchedColumns = inferColumnsFromText(tableId, `${trigger.details.join(' ')} ${trigger.source || ''}`)

  if (matchedColumns.length === 0) {
    return getUniqueImpactTargets([
      ...explicitTargets,
      ...sourceTargets,
      {
        columnName: null,
        tableId
      }
    ])
  }

  return getUniqueImpactTargets([
    ...explicitTargets,
    ...sourceTargets,
    ...matchedColumns.map((columnName) => ({
      columnName,
      tableId
    }))
  ])
}

const inferIndexTargets = (index: PgmlIndex) => {
  const tableId = resolveTableIdentifier(index.tableName)

  if (!tableId) {
    return []
  }

  const explicitTargets = index.columns.map((columnName) => ({
    columnName,
    tableId
  }))

  return explicitTargets.length > 0
    ? getUniqueImpactTargets(explicitTargets)
    : [{
        columnName: null,
        tableId
      }]
}

const inferConstraintTargets = (constraint: PgmlConstraint) => {
  const tableId = resolveTableIdentifier(constraint.tableName)

  if (!tableId) {
    return []
  }

  const matchedColumns = inferColumnsFromText(tableId, constraint.expression)

  if (matchedColumns.length === 0) {
    return [{
      columnName: null,
      tableId
    }]
  }

  return getUniqueImpactTargets(matchedColumns.map((columnName) => ({
    columnName,
    tableId
  })))
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
    ? getImpactTargetsFromValues(inferSourceTableIds(sequence.source))
    : []
  const modifierTargets = model.tables.flatMap((table) => {
    return table.columns
      .filter((column) => {
        return column.modifiers.some(modifier => modifier.includes(sequence.name))
      })
      .map((column) => {
        return {
          columnName: column.name,
          tableId: table.fullName
        }
      })
  })

  return getUniqueImpactTargets([...explicitTargets, ...sourceTargets, ...modifierTargets])
}

const inferCustomTypeTargets = (customType: PgmlCustomType) => {
  const targets = model.tables.flatMap((table) => {
    return table.columns
      .filter(column => column.type.includes(customType.name))
      .map((column) => {
        return {
          columnName: column.name,
          tableId: table.fullName
        }
      })
  })

  return getUniqueImpactTargets(targets)
}

const groupSourceRangeById = computed(() => {
  return model.groups.reduce<Record<string, PgmlSourceRange | undefined>>((entries, group) => {
    entries[getStoredGroupId(group.name)] = group.sourceRange
    return entries
  }, {})
})

const tableGroupById = computed(() => {
  return model.tables.reduce<Record<string, string | null>>((entries, table) => {
    entries[table.fullName] = table.groupName || null
    return entries
  }, {})
})

const isEntityDirectlyVisible = (id: string) => model.nodeProperties[id]?.visible !== false

const resolveTableIds = (values: string[]) => {
  const nextIds: string[] = []

  values.forEach((value) => {
    const normalizedValue = normalizeReferenceValue(value)

    model.tables.forEach((table) => {
      const aliases = uniqueValues([
        normalizeReferenceValue(table.fullName),
        normalizeReferenceValue(table.name),
        normalizeReferenceValue(`${table.schema}.${table.name}`)
      ])

      if (aliases.includes(normalizedValue) || aliases.some(alias => normalizedValue.endsWith(alias))) {
        nextIds.push(table.fullName)
      }
    })
  })

  return uniqueValues(nextIds)
}

const getRoutineTableIds = (routine: PgmlRoutine) => {
  const affects = routine.affects

  if (!affects) {
    return []
  }

  return resolveTableIds([
    ...affects.calls,
    ...affects.dependsOn,
    ...affects.ownedBy,
    ...affects.reads,
    ...affects.sets,
    ...affects.uses,
    ...affects.writes
  ])
}

const triggerTableIdsByRoutineName = computed(() => {
  const mapping = new Map<string, string[]>()

  model.triggers.forEach((trigger) => {
    const routineName = getMetadataValue(trigger.metadata, 'function')

    if (!routineName) {
      return
    }

    const normalizedValue = normalizeReferenceValue(routineName.split('.').at(-1) || routineName)
    const nextIds = mapping.get(normalizedValue) || []
    nextIds.push(...resolveTableIds([trigger.tableName]))
    mapping.set(normalizedValue, uniqueValues(nextIds))
  })

  return mapping
})

const getSequenceOwnedTableIds = (sequence: PgmlSequence) => {
  return getSequenceAttachedTableIds(model.tables, sequence)
}

const buildIndexSubtitle = (index: { columns: string[], type: string }) => {
  const parts = [index.type.toUpperCase()]

  if (index.columns.length > 0) {
    parts.push(index.columns.join(', '))
  }

  return parts.join(' · ')
}

const buildTriggerSubtitle = (trigger: PgmlTrigger) => {
  const timing = getMetadataValue(trigger.metadata, 'timing')
  const events = (getMetadataValue(trigger.metadata, 'events') || '')
    .replace(/^\[(.*)\]$/, '$1')
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)
  const level = getMetadataValue(trigger.metadata, 'level')
  const parts: string[] = []

  if (timing) {
    parts.push(timing.toUpperCase())
  }

  if (events.length > 0) {
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

const tableAttachmentState = computed<TableAttachmentState>(() => {
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
      resolveTableIds([index.tableName]).forEach((tableId) => {
        addAttachment({
          color: attachmentKindColors.Index,
          details: [
            `Type: ${index.type.toUpperCase()}`,
            `Columns: ${index.columns.join(', ')}`
          ],
          flags: [],
          id: `index:${index.name}`,
          kind: 'Index',
          sourceRange: index.sourceRange,
          subtitle: buildIndexSubtitle(index),
          tableId,
          title: index.name
        })
      })
    })

    table.constraints.forEach((constraint) => {
      resolveTableIds([constraint.tableName]).forEach((tableId) => {
        addAttachment({
          color: attachmentKindColors.Constraint,
          details: [constraint.expression],
          flags: [],
          id: `constraint:${constraint.name}`,
          kind: 'Constraint',
          sourceRange: constraint.sourceRange,
          subtitle: constraint.expression,
          tableId,
          title: constraint.name
        })
      })
    })
  })

  model.triggers.forEach((trigger) => {
    resolveTableIds([trigger.tableName]).forEach((tableId) => {
      addAttachment({
        color: attachmentKindColors.Trigger,
        details: trigger.details,
        flags: [],
        id: `trigger:${trigger.name}`,
        kind: 'Trigger',
        sourceRange: trigger.sourceRange,
        subtitle: buildTriggerSubtitle(trigger),
        tableId,
        title: trigger.name
      })
    })
  })

  model.functions.forEach((routine) => {
    const triggerTableIds = triggerTableIdsByRoutineName.value.get(normalizeReferenceValue(routine.name)) || []
    const tableIds = triggerTableIds.length > 0 ? triggerTableIds : getRoutineTableIds(routine)

    tableIds.forEach((tableId) => {
      addAttachment({
        color: attachmentKindColors.Function,
        details: routine.details,
        flags: triggerTableIds.length > 0
          ? [{ color: '#38bdf8', key: 'trigger', label: 'TRIGGER' }]
          : [],
        id: `function:${routine.name}`,
        kind: 'Function',
        sourceRange: routine.sourceRange,
        subtitle: routine.signature,
        tableId,
        title: routine.name
      })
    })
  })

  model.procedures.forEach((procedure) => {
    const triggerTableIds = triggerTableIdsByRoutineName.value.get(normalizeReferenceValue(procedure.name)) || []
    const tableIds = triggerTableIds.length > 0 ? triggerTableIds : getRoutineTableIds(procedure)

    tableIds.forEach((tableId) => {
      addAttachment({
        color: attachmentKindColors.Procedure,
        details: procedure.details,
        flags: triggerTableIds.length > 0
          ? [{ color: '#38bdf8', key: 'trigger', label: 'TRIGGER' }]
          : [],
        id: `procedure:${procedure.name}`,
        kind: 'Procedure',
        sourceRange: procedure.sourceRange,
        subtitle: procedure.signature,
        tableId,
        title: procedure.name
      })
    })
  })

  model.sequences.forEach((sequence) => {
    getSequenceOwnedTableIds(sequence).forEach((tableId) => {
      addAttachment({
        color: attachmentKindColors.Sequence,
        details: sequence.details,
        flags: [],
        id: `sequence:${sequence.name}`,
        kind: 'Sequence',
        sourceRange: sequence.sourceRange,
        subtitle: buildSequenceSubtitle(sequence),
        tableId,
        title: sequence.name
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
    attachedObjectIds,
    attachmentsByTableId
  }
})

const getAttachmentRowBadges = (flags: TableAttachmentFlag[]) => {
  return flags.map((flag) => {
    return {
      color: flag.color,
      label: flag.label
    }
  })
}

const getColumnRowBadges = (column: PgmlColumn) => {
  const modifierBadges = column.modifiers.slice(0, 2).map((modifier, index) => {
    return {
      color: index === 0 ? '#5eead4' : '#94a3b8',
      label: modifier.length > 14 ? `${modifier.slice(0, 13)}…` : modifier
    }
  })
  const referenceBadge = column.reference
    ? [{
        color: '#64748b',
        label: `REF: ${column.reference.relation} ${column.reference.toTable}.${column.reference.toColumn}`.toUpperCase()
      }]
    : []

  return [...modifierBadges, ...referenceBadge].slice(0, 2)
}

const tableRowsByTableId = computed(() => {
  return model.tables.reduce<Record<string, DiagramGpuRow[]>>((entries, table) => {
    const columnRows = table.columns.map((column) => {
      const rowKey = getColumnAnchorKey(table.fullName, column.name)
      const relationalHighlightColor = selectedTableRelationalRowKeys.value.has(rowKey)
        ? (tableColorById.value[selectedTableId.value || ''] || '#79e3ea')
        : null
      const objectImpactHighlightColor = selectedObjectImpactRowKeys.value.has(rowKey)
        ? (selectedSelection.value?.kind === 'object'
            ? (objectLayoutStates.value[selectedSelection.value.id]?.color || '#14b8a6')
            : '#14b8a6')
        : null
      const compareHighlightColor = isCompareDiagramActive.value
        ? (compareRowHighlightByKey.value[rowKey]?.color || null)
        : null

      return {
        badges: getColumnRowBadges(column),
        columnName: column.name,
        highlightColor: compareHighlightColor || relationalHighlightColor || objectImpactHighlightColor,
        key: `${table.fullName}.${column.name}`,
        kind: 'column' as const,
        subtitle: column.type,
        tableId: table.fullName,
        title: column.name
      }
    })
    const attachmentRows = (tableAttachmentState.value.attachmentsByTableId[table.fullName] || [])
      .filter(attachment => isEntityDirectlyVisible(attachment.id))
      .map((attachment) => {
        return {
          accentColor: attachment.color,
          attachmentId: attachment.id,
          badges: getAttachmentRowBadges(attachment.flags),
          kindLabel: attachment.kind,
          key: attachment.id,
          kind: 'attachment' as const,
          sourceRange: attachment.sourceRange,
          subtitle: attachment.subtitle,
          tableId: table.fullName,
          title: attachment.title
        }
      })

    entries[table.fullName] = [...columnRows, ...attachmentRows]
    return entries
  }, {})
})

const getTableRows = (tableId: string) => tableRowsByTableId.value[tableId] || []

const buildBrowserTableItem = (table: PgmlSchemaModel['tables'][number]): EntityBrowserItem => {
  const columns = table.columns.map<EntityBrowserItem>((column) => {
    return {
      children: [],
      id: `${table.fullName}.${column.name}`,
      kind: 'column',
      kindLabel: 'Field',
      label: column.name,
      searchText: cleanForSearch(`field ${column.name} ${column.type} ${table.fullName}`),
      selection: {
        columnName: column.name,
        kind: 'column',
        tableId: table.fullName
      },
      sourceRange: table.sourceRange,
      subtitle: ''
    }
  })
  const attachments = (tableAttachmentState.value.attachmentsByTableId[table.fullName] || []).map<EntityBrowserItem>((attachment) => {
    return {
      children: [],
      id: attachment.id,
      kind: 'attachment',
      kindLabel: attachment.kind,
      label: attachment.title,
      searchText: cleanForSearch(`${attachment.kind} ${attachment.title} ${attachment.subtitle} ${attachment.details.join(' ')}`),
      selection: {
        attachmentId: attachment.id,
        kind: 'attachment',
        tableId: table.fullName
      },
      sourceRange: attachment.sourceRange,
      subtitle: ''
    }
  })

  return {
    children: [...columns, ...attachments],
    id: table.fullName,
    kind: 'table',
    kindLabel: 'Table',
    label: table.name,
    searchText: cleanForSearch(`table ${table.fullName} ${table.note || ''}`),
    selection: {
      kind: 'table',
      tableId: table.fullName
    },
    sourceRange: table.sourceRange,
    subtitle: ''
  }
}

const groupedBrowserItems = computed<EntityBrowserItem[]>(() => {
  return model.groups.map((group) => {
    const tables = getOrderedGroupTables(model, group.name)

    return {
      children: tables.map(table => buildBrowserTableItem(table)),
      id: getStoredGroupId(group.name),
      kind: 'group',
      kindLabel: 'Group',
      label: group.name,
      searchText: cleanForSearch(`group ${group.name}`),
      selection: {
        id: getStoredGroupId(group.name),
        kind: 'group'
      },
      sourceRange: group.sourceRange,
      subtitle: `${tables.length} table${tables.length === 1 ? '' : 's'}`
    }
  })
})

const filteredUngroupedBrowserItemsSource = computed<EntityBrowserItem[]>(() => {
  return model.tables
    .filter(table => !table.groupName)
    .map(table => buildBrowserTableItem(table))
})

const filteredStandaloneBrowserItemsSource = computed<EntityBrowserItem[]>(() => {
  const items: EntityBrowserItem[] = []
  const attachedObjectIds = tableAttachmentState.value.attachedObjectIds
  const pushNodeItem = (
    id: string,
    label: string,
    kindLabel: string,
    subtitle: string,
    sourceRange?: PgmlSourceRange
  ) => {
    items.push({
      children: [],
      id,
      kind: 'object',
      kindLabel,
      label,
      searchText: cleanForSearch(`${kindLabel} ${label} ${subtitle}`),
      selection: {
        id,
        kind: 'object'
      },
      sourceRange,
      subtitle
    })
  }

  model.functions.forEach((routine) => {
    const id = `function:${routine.name}`

    if (!attachedObjectIds.has(id)) {
      pushNodeItem(id, routine.name, 'Function', routine.signature, routine.sourceRange)
    }
  })

  model.procedures.forEach((routine) => {
    const id = `procedure:${routine.name}`

    if (!attachedObjectIds.has(id)) {
      pushNodeItem(id, routine.name, 'Procedure', routine.signature, routine.sourceRange)
    }
  })

  model.triggers.forEach((trigger) => {
    const id = `trigger:${trigger.name}`

    if (!attachedObjectIds.has(id)) {
      pushNodeItem(id, trigger.name, 'Trigger', buildTriggerSubtitle(trigger), trigger.sourceRange)
    }
  })

  model.sequences.forEach((sequence) => {
    const id = `sequence:${sequence.name}`

    if (!attachedObjectIds.has(id)) {
      pushNodeItem(id, sequence.name, 'Sequence', buildSequenceSubtitle(sequence), sequence.sourceRange)
    }
  })

  model.customTypes.forEach((customType) => {
    pushNodeItem(
      `custom-type:${customType.kind}:${customType.name}`,
      customType.name,
      customType.kind,
      customType.details.join(' '),
      customType.sourceRange
    )
  })

  return items.sort((left, right) => {
    const kindDelta = left.kindLabel.localeCompare(right.kindLabel)

    if (kindDelta !== 0) {
      return kindDelta
    }

    return left.label.localeCompare(right.label)
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
  return filterEntityBrowserItems(filteredUngroupedBrowserItemsSource.value, entitySearchQuery.value)
})

const filteredStandaloneBrowserItems = computed(() => {
  return filterEntityBrowserItems(filteredStandaloneBrowserItemsSource.value, entitySearchQuery.value)
})

const normalizedEntitySearchQuery = computed(() => cleanForSearch(entitySearchQuery.value).trim())

const countEntityBrowserItems = (items: EntityBrowserItem[]): number => {
  return items.reduce((total, item) => {
    return total + 1 + countEntityBrowserItems(item.children)
  }, 0)
}

const filteredEntityResultCount = computed(() => {
  return countEntityBrowserItems([
    ...filteredGroupedBrowserItems.value,
    ...filteredUngroupedBrowserItems.value,
    ...filteredStandaloneBrowserItems.value
  ])
})

const clearEntitySearch = () => {
  entitySearchQuery.value = ''
}

const hiddenEntityCount = computed(() => {
  return Object.values(model.nodeProperties).filter(properties => properties.visible === false).length
})

const isGroupVisible = (groupName: string) => isEntityDirectlyVisible(getStoredGroupId(groupName))
const isTableVisible = (table: PgmlSchemaModel['tables'][number]) => {
  const directVisible = isEntityDirectlyVisible(table.fullName)

  if (!directVisible) {
    return false
  }

  return table.groupName ? isGroupVisible(table.groupName) : true
}

const orderedTablesByGroup = computed(() => {
  return model.groups.reduce<Record<string, PgmlSchemaModel['tables']>>((entries, group) => {
    entries[group.name] = getOrderedGroupTables(model, group.name).filter(table => isTableVisible(table))
    return entries
  }, {})
})

const groupedTableIds = computed(() => {
  return new Set(model.tables.filter(table => table.groupName).map(table => table.fullName))
})

const visibleStandaloneTables = computed(() => {
  return model.tables.filter(table => !table.groupName && isTableVisible(table))
})

const computeGroupLayout = (
  groupName: string,
  tables: PgmlSchemaModel['tables'],
  columnCount: number,
  masonry: boolean,
  tableWidthScale: number
) => {
  const safeTableWidth = Math.round(diagramGroupTableWidth * tableWidthScale)

  if (masonry) {
    const layout = buildTableGroupMasonryLayout(
      tables.map((table) => {
        return {
          height: estimateDiagramTableHeight(getTableRows(table.fullName).length),
          id: table.fullName
        }
      }),
      Math.max(1, Math.min(columnCount, Math.max(tables.length, 1))),
      safeTableWidth,
      diagramGroupTableGap
    )

    return {
      contentHeight: layout.contentHeight,
      contentWidth: layout.contentWidth,
      placements: layout.placements
    }
  }

  const placements: Record<string, { x: number, y: number }> = {}
  const safeColumnCount = Math.max(1, Math.min(columnCount, Math.max(tables.length, 1)))
  const rowHeights: number[] = []

  tables.forEach((table, index) => {
    const columnIndex = index % safeColumnCount
    const rowIndex = Math.floor(index / safeColumnCount)
    const rowY = rowHeights.slice(0, rowIndex).reduce((sum, height) => sum + height, 0) + rowIndex * diagramGroupTableGap
    const height = estimateDiagramTableHeight(getTableRows(table.fullName).length)
    rowHeights[rowIndex] = Math.max(rowHeights[rowIndex] || 0, height)
    placements[table.fullName] = {
      x: columnIndex * (safeTableWidth + diagramGroupTableGap),
      y: rowY
    }
  })

  const contentHeight = rowHeights.reduce((sum, height) => sum + height, 0) + Math.max(0, rowHeights.length - 1) * diagramGroupTableGap
  const contentWidth = safeColumnCount * safeTableWidth + Math.max(0, safeColumnCount - 1) * diagramGroupTableGap

  return {
    contentHeight,
    contentWidth,
    placements
  }
}

const syncLayoutStates = () => {
  const nextGroupStates: Record<string, DiagramGpuGroupNode> = {}
  const nextTableStates: Record<string, DiagramGpuNodeLayoutState> = {}
  const nextObjectStates: Record<string, DiagramGpuObjectNode> = {}

  model.groups.forEach((group, index) => {
    if (!isGroupVisible(group.name)) {
      return
    }

    const groupId = getStoredGroupId(group.name)
    const previousState = groupLayoutStates.value[groupId]
    const storedLayout = model.nodeProperties[groupId]
    const tables = orderedTablesByGroup.value[group.name] || []
    const columnCount = Math.max(1, Math.min(
      Math.round(storedLayout?.tableColumns ?? previousState?.columnCount ?? 1),
      Math.max(tables.length, 1)
    ))
    const masonry = storedLayout?.masonry ?? previousState?.masonry ?? false
    const tableWidthScale = normalizePgmlTableWidthScale(
      storedLayout?.tableWidthScale ?? previousState?.tableWidthScale ?? defaultPgmlTableWidthScale
    )
    const layout = computeGroupLayout(group.name, tables, columnCount, masonry, tableWidthScale)
    const width = Math.max(diagramGroupHorizontalPadding * 2 + layout.contentWidth, diagramGroupTableWidth + diagramGroupHorizontalPadding * 2)
    const height = Math.max(
      diagramGroupHeaderBandHeight + diagramGroupVerticalPadding + layout.contentHeight,
      diagramGroupHeaderHeight + 48
    )

    nextGroupStates[groupId] = {
      color: storedLayout?.color || previousState?.color || diagramPalette[index % diagramPalette.length] || '#8b5cf6',
      columnCount,
      compareHighlightActive: compareNodeHighlightById.value[groupId]?.active || false,
      compareHighlightColor: compareNodeHighlightById.value[groupId]?.color || null,
      height,
      id: groupId,
      masonry,
      minHeight: height,
      minWidth: width,
      note: group.note,
      tableCount: tables.length,
      tableIds: tables.map(table => table.fullName),
      tableWidthScale,
      title: group.name,
      width,
      x: storedLayout?.x ?? previousState?.x ?? 120 + index * 420,
      y: storedLayout?.y ?? previousState?.y ?? 90 + (index % 2) * 120
    }
  })

  visibleStandaloneTables.value.forEach((table, index) => {
    const previousState = floatingTableStates.value[table.fullName]
    const storedLayout = model.nodeProperties[table.fullName]
    const height = estimateDiagramTableHeight(getTableRows(table.fullName).length)

    nextTableStates[table.fullName] = {
      color: storedLayout?.color || previousState?.color || '#38bdf8',
      compareHighlightActive: compareNodeHighlightById.value[table.fullName]?.active || false,
      compareHighlightColor: compareNodeHighlightById.value[table.fullName]?.color || null,
      height,
      id: table.fullName,
      kind: 'table',
      minHeight: height,
      minWidth: diagramGroupTableWidth,
      title: table.name,
      visible: true,
      width: Math.max(diagramGroupTableWidth, storedLayout?.width ?? previousState?.width ?? diagramGroupTableWidth),
      x: storedLayout?.x ?? previousState?.x ?? 120 + (index % 3) * 300,
      y: storedLayout?.y ?? previousState?.y ?? 560 + Math.floor(index / 3) * 220
    }
  })

  const anchorBaseX = Math.max(
    ...[
      920,
      ...Object.values(nextGroupStates).map(group => group.x + group.width + 72),
      ...Object.values(nextTableStates).map(table => table.x + table.width + 72)
    ]
  )

  const objectItems: Array<{
    collapsedHeight?: number
    color: string
    details: string[]
    expandedHeight: number
    id: string
    impactTargets: DiagramGpuImpactTarget[]
    kindLabel: string
    sourceRange?: PgmlSourceRange
    subtitle: string
    tableIds: string[]
    title: string
    width: number
  }> = [
    ...model.functions
      .filter(entry => isEntityDirectlyVisible(`function:${entry.name}`) && !tableAttachmentState.value.attachedObjectIds.has(`function:${entry.name}`))
      .map((entry) => {
        const impactTargets = inferRoutineTargets(entry)

      return {
        color: objectKindColors.Function || '#c084fc',
        details: entry.details,
        expandedHeight: 176,
        id: `function:${entry.name}`,
        impactTargets,
        kindLabel: 'Function',
        sourceRange: entry.sourceRange,
        subtitle: entry.signature,
        tableIds: uniqueValues(impactTargets.map(target => target.tableId)),
        title: entry.name,
        width: 336
      }
    }),
    ...model.procedures
      .filter(entry => isEntityDirectlyVisible(`procedure:${entry.name}`) && !tableAttachmentState.value.attachedObjectIds.has(`procedure:${entry.name}`))
      .map((entry) => {
        const impactTargets = inferRoutineTargets(entry)

      return {
        color: objectKindColors.Procedure || '#f97316',
        details: entry.details,
        expandedHeight: 156,
        id: `procedure:${entry.name}`,
        impactTargets,
        kindLabel: 'Procedure',
        sourceRange: entry.sourceRange,
        subtitle: entry.signature,
        tableIds: uniqueValues(impactTargets.map(target => target.tableId)),
        title: entry.name,
        width: 320
      }
    }),
    ...model.triggers
      .filter(entry => isEntityDirectlyVisible(`trigger:${entry.name}`) && !tableAttachmentState.value.attachedObjectIds.has(`trigger:${entry.name}`))
      .map((entry) => {
        const tableId = resolveTableIdentifier(entry.tableName)
        const impactTargets = tableId ? inferTriggerTargets(tableId, entry) : []

      return {
        color: objectKindColors.Trigger || '#22c55e',
        details: entry.details,
        expandedHeight: 168,
        id: `trigger:${entry.name}`,
        impactTargets,
        kindLabel: 'Trigger',
        sourceRange: entry.sourceRange,
        subtitle: buildTriggerSubtitle(entry),
        tableIds: uniqueValues(impactTargets.map(target => target.tableId)),
        title: entry.name,
        width: 332
      }
    }),
    ...model.sequences
      .filter(entry => isEntityDirectlyVisible(`sequence:${entry.name}`) && !tableAttachmentState.value.attachedObjectIds.has(`sequence:${entry.name}`))
      .map((entry) => {
        const impactTargets = inferSequenceTargets(entry)

      return {
        color: objectKindColors.Sequence || '#eab308',
        details: entry.details,
        expandedHeight: 156,
        id: `sequence:${entry.name}`,
        impactTargets,
        kindLabel: 'Sequence',
        sourceRange: entry.sourceRange,
        subtitle: buildSequenceSubtitle(entry),
        tableIds: uniqueValues(impactTargets.map(target => target.tableId)),
        title: entry.name,
        width: 308
      }
    }),
    ...model.customTypes.filter((entry) => isEntityDirectlyVisible(`custom-type:${entry.kind}:${entry.name}`)).map((entry: PgmlCustomType) => {
      const impactTargets = inferCustomTypeTargets(entry)

      return {
        color: objectKindColors['Custom Type'] || '#14b8a6',
        details: entry.details,
        expandedHeight: 114,
        id: `custom-type:${entry.kind}:${entry.name}`,
        impactTargets,
        kindLabel: 'Custom Type',
        sourceRange: entry.sourceRange,
        subtitle: entry.kind,
        tableIds: uniqueValues(impactTargets.map(target => target.tableId)),
        title: entry.name,
        width: 258
      }
    })
  ]

  objectItems.forEach((item, index) => {
    const previousState = objectLayoutStates.value[item.id]
    const storedLayout = model.nodeProperties[item.id]
    const collapsed = storedLayout?.collapsed ?? previousState?.collapsed ?? true
    const expandedHeight = Math.max(item.expandedHeight, previousState?.expandedHeight ?? item.expandedHeight)

    nextObjectStates[item.id] = {
      collapsed,
      color: storedLayout?.color || previousState?.color || item.color,
      compareHighlightActive: compareNodeHighlightById.value[item.id]?.active || false,
      compareHighlightColor: compareNodeHighlightById.value[item.id]?.color || null,
      details: item.details,
      expandedHeight,
      height: collapsed ? previousState?.height ?? diagramObjectCollapsedHeight : expandedHeight,
      id: item.id,
      impactTargets: item.impactTargets,
      kindLabel: item.kindLabel,
      minHeight: collapsed ? diagramObjectCollapsedHeight : expandedHeight,
      minWidth: item.width,
      sourceRange: item.sourceRange,
      subtitle: item.subtitle,
      tableIds: item.tableIds,
      title: item.title,
      width: Math.max(item.width, storedLayout?.width ?? previousState?.width ?? item.width),
      x: storedLayout?.x ?? previousState?.x ?? anchorBaseX + (index % 2) * objectColumnGapX,
      y: storedLayout?.y ?? previousState?.y ?? 96 + Math.floor(index / 2) * objectRowGapY
    }
  })

  groupLayoutStates.value = nextGroupStates
  floatingTableStates.value = nextTableStates
  objectLayoutStates.value = nextObjectStates
}

const tableCards = computed<DiagramGpuTableCard[]>(() => {
  const groupedCards = Object.values(groupLayoutStates.value).flatMap((group) => {
    const groupName = group.title
    const tables = orderedTablesByGroup.value[groupName] || []
    const layout = computeGroupLayout(groupName, tables, group.columnCount, group.masonry, group.tableWidthScale)
    const cardWidth = Math.round(diagramGroupTableWidth * group.tableWidthScale)

    return tables.map((table) => {
      const placement = layout.placements[table.fullName]
      const rows = getTableRows(table.fullName)
      const height = estimateDiagramTableHeight(rows.length)

      return {
        color: group.color,
        groupId: group.id,
        headerHeight: diagramTableHeaderHeight,
        height,
        id: table.fullName,
        minHeight: height,
        rows,
        schema: table.schema,
        sourceRange: table.sourceRange,
        title: table.name,
        width: cardWidth,
        x: group.x + diagramGroupHorizontalPadding + (placement?.x || 0),
        y: group.y + diagramGroupHeaderBandHeight + (placement?.y || 0)
      }
    })
  })
  const standaloneCards = visibleStandaloneTables.value.map((table) => {
    const state = floatingTableStates.value[table.fullName]
    const rows = getTableRows(table.fullName)
    const height = estimateDiagramTableHeight(rows.length)

    return {
      color: state?.color || '#38bdf8',
      groupId: null,
      headerHeight: diagramTableHeaderHeight,
      height,
      id: table.fullName,
      minHeight: height,
      rows,
      schema: table.schema,
      sourceRange: table.sourceRange,
      title: table.name,
      width: Math.max(diagramGroupTableWidth, state?.width || diagramGroupTableWidth),
      x: state?.x || 0,
      y: state?.y || 0
    }
  })

  return [...groupedCards, ...standaloneCards]
})

const groupNodes = computed(() => Object.values(groupLayoutStates.value))
const objectNodes = computed(() => Object.values(objectLayoutStates.value))

const worldBounds = computed<DiagramGpuWorldBounds>(() => {
  const entries = [
    ...groupNodes.value.map(group => ({
      maxX: group.x + group.width,
      maxY: group.y + group.height,
      minX: group.x,
      minY: group.y
    })),
    ...tableCards.value.map(card => ({
      maxX: card.x + card.width,
      maxY: card.y + card.height,
      minX: card.x,
      minY: card.y
    })),
    ...objectNodes.value.map(node => ({
      maxX: node.x + node.width,
      maxY: node.y + node.height,
      minX: node.x,
      minY: node.y
    }))
  ]

  if (entries.length === 0) {
    return {
      maxX: 1200,
      maxY: 800,
      minX: 0,
      minY: 0
    }
  }

  return {
    maxX: Math.max(...entries.map(entry => entry.maxX)),
    maxY: Math.max(...entries.map(entry => entry.maxY)),
    minX: Math.min(...entries.map(entry => entry.minX)),
    minY: Math.min(...entries.map(entry => entry.minY))
  }
})

const viewportWorldBounds = computed<DiagramGpuWorldBounds>(() => {
  const entries = [
    ...groupNodes.value.map(group => ({
      maxX: group.x + group.width,
      maxY: group.y + group.height,
      minX: group.x,
      minY: group.y
    })),
    ...tableCards.value.map(card => ({
      maxX: card.x + card.width,
      maxY: card.y + card.height,
      minX: card.x,
      minY: card.y
    }))
  ]

  if (entries.length === 0) {
    return worldBounds.value
  }

  return {
    maxX: Math.max(...entries.map(entry => entry.maxX)),
    maxY: Math.max(...entries.map(entry => entry.maxY)),
    minX: Math.min(...entries.map(entry => entry.minX)),
    minY: Math.min(...entries.map(entry => entry.minY))
  }
})

const getColumnAnchorKey = (tableId: string, columnName: string) => `${tableId}.${columnName}`

const tableColorById = computed(() => {
  return tableCards.value.reduce<Record<string, string>>((entries, card) => {
    entries[card.id] = card.color
    return entries
  }, {})
})

const selectedTableId = computed(() => {
  if (!selectedSelection.value) {
    return null
  }

  if (selectedSelection.value.kind === 'table') {
    return selectedSelection.value.tableId
  }

  if (selectedSelection.value.kind === 'column' || selectedSelection.value.kind === 'attachment') {
    return selectedSelection.value.tableId
  }

  return null
})

const selectedTableOutgoingReferences = computed(() => {
  if (!selectedTableId.value) {
    return []
  }

  return model.references.filter((reference) => {
    return reference.fromTable === selectedTableId.value && reference.toTable !== selectedTableId.value
  })
})

const selectedTableRelationalRowKeys = computed(() => {
  return new Set(selectedTableOutgoingReferences.value.map((reference) => {
    return getColumnAnchorKey(reference.toTable, reference.toColumn)
  }))
})

const selectedObjectImpactTargets = computed(() => {
  if (selectedSelection.value?.kind !== 'object') {
    return []
  }

  const selectedObjectNode = objectLayoutStates.value[selectedSelection.value.id]

  if (!selectedObjectNode) {
    return []
  }

  return selectedObjectNode.impactTargets.length > 0
    ? selectedObjectNode.impactTargets
    : selectedObjectNode.tableIds.map((tableId) => {
        return {
          columnName: null,
          tableId
        }
      })
})

const selectedObjectImpactRowKeys = computed(() => {
  return new Set(selectedObjectImpactTargets.value.flatMap((impactTarget) => {
    if (!impactTarget.columnName) {
      return []
    }

    return [getColumnAnchorKey(impactTarget.tableId, impactTarget.columnName)]
  }))
})

const nodeOrderById = computed(() => {
  const entries: Record<string, number> = {}
  let order = 1

  groupNodes.value.forEach((group) => {
    entries[group.id] = order
    order += 1
  })

  tableCards.value.filter(card => !card.groupId).forEach((card) => {
    entries[card.id] = order
    order += 1
  })

  objectNodes.value.forEach((node) => {
    entries[node.id] = order
    order += 1
  })

  return entries
})

const getRoutingWorker = () => {
  if (routingWorker) {
    return routingWorker
  }

  const worker = new Worker(new URL('../../workers/diagram-routing.worker.ts', import.meta.url), {
    type: 'module'
  })

  worker.onmessage = (event: MessageEvent<RoutingWorkerResponse>) => {
    const pendingRequest = pendingRoutingRequests.get(event.data.requestId)

    if (!pendingRequest) {
      return
    }

    pendingRoutingRequests.delete(event.data.requestId)
    pendingRequest.resolve(event.data.lines)
  }
  worker.onerror = (error) => {
    pendingRoutingRequests.forEach((pendingRequest) => {
      pendingRequest.reject(error)
    })
    pendingRoutingRequests.clear()
  }
  routingWorker = worker
  return worker
}

const createBounds = (x: number, y: number, width: number, height: number): MeasuredBounds => {
  return {
    bottom: y + height,
    height,
    left: x,
    right: x + width,
    top: y,
    width
  }
}

const isComparePanelActive = computed(() => activePanelTab.value === 'compare')
const isCompareDiagramActive = computed(() => {
  return isComparePanelActive.value
    && previewTargetId === versionCompareTargetId
    && compareEntries.length > 0
})

const compareEntryById = computed(() => {
  return new Map(compareEntries.map((entry) => {
    return [entry.id, entry]
  }))
})

const getCompareChangeRank = (entryId: string) => {
  const entry = compareEntryById.value.get(entryId)

  if (!entry) {
    return 0
  }

  if (entry.changeKind === 'removed') {
    return 3
  }

  if (entry.changeKind === 'added') {
    return 2
  }

  return 1
}

const pickCompareHighlight = (entryIds: string[]): DiagramCompareNodeHighlight | null => {
  const activeEntry = selectedCompareEntryId.value
    ? entryIds.find(entryId => entryId === selectedCompareEntryId.value) || null
    : null
  const rankedEntryId = activeEntry || entryIds.slice().sort((left, right) => {
    return getCompareChangeRank(right) - getCompareChangeRank(left)
  })[0]

  if (!rankedEntryId) {
    return null
  }

  const rankedEntry = compareEntryById.value.get(rankedEntryId)

  if (!rankedEntry) {
    return null
  }

  return {
    active: activeEntry !== null,
    color: getPgmlDiagramCompareChangeColor(rankedEntry.changeKind),
    entryIds
  }
}

const compareEntryIdsByNodeId = computed(() => {
  const entries: Record<string, string[]> = {}

  if (!isCompareDiagramActive.value) {
    return entries
  }

  compareEntries.forEach((entry) => {
    entry.targetNodeIds.forEach((nodeId) => {
      entries[nodeId] = [...(entries[nodeId] || []), entry.id]
    })
  })

  return entries
})

const compareNodeHighlightById = computed(() => {
  return Object.entries(compareEntryIdsByNodeId.value).reduce<Record<string, DiagramCompareNodeHighlight>>((entries, [nodeId, entryIds]) => {
    const highlight = pickCompareHighlight(entryIds)

    if (highlight) {
      entries[nodeId] = highlight
    }

    return entries
  }, {})
})

const compareRowHighlightByKey = computed(() => {
  const entries: Record<string, DiagramCompareNodeHighlight> = {}

  if (!isCompareDiagramActive.value) {
    return entries
  }

  compareEntries.forEach((entry) => {
    if (!entry.rowKey) {
      return
    }

    const rowEntryIds = [...(entries[entry.rowKey]?.entryIds || []), entry.id]
    const highlight = pickCompareHighlight(rowEntryIds)

    if (highlight) {
      entries[entry.rowKey] = highlight
    }
  })

  return entries
})

const getSelectionWorldBounds = (selection: DiagramGpuSelection | null) => {
  if (!selection) {
    return null
  }

  if (selection.kind === 'group') {
    const group = groupNodes.value.find(entry => entry.id === selection.id)

    return group ? createBounds(group.x, group.y, group.width, group.height) : null
  }

  if (selection.kind === 'object') {
    const objectNode = objectNodes.value.find(entry => entry.id === selection.id)

    return objectNode ? createBounds(objectNode.x, objectNode.y, objectNode.width, objectNode.height) : null
  }

  const table = tableCards.value.find(entry => entry.id === selection.tableId)

  if (!table) {
    return null
  }

  if (selection.kind === 'table') {
    return createBounds(table.x, table.y, table.width, table.height)
  }

  const rowIndex = table.rows.findIndex((row) => {
    if (selection.kind === 'column') {
      return row.kind === 'column' && row.columnName === selection.columnName
    }

    return row.kind === 'attachment' && row.attachmentId === selection.attachmentId
  })

  if (rowIndex < 0) {
    return createBounds(table.x, table.y, table.width, table.height)
  }

  return createBounds(
    table.x,
    table.y + table.headerHeight + rowIndex * diagramTableRowHeight,
    table.width,
    diagramTableRowHeight
  )
}

const focusSelectionInScene = (selection: DiagramGpuSelection | null) => {
  const bounds = getSelectionWorldBounds(selection)

  if (!bounds) {
    return
  }

  sceneRef.value?.focusBounds({
    height: bounds.height,
    width: bounds.width,
    x: bounds.left,
    y: bounds.top
  })
}

const matchesBaseTableIdentity = (table: PgmlTable, candidate: string) => {
  return candidate === table.fullName
    || candidate === table.name
    || candidate === `${table.schema}.${table.name}`
}

const getBaseTableAttachmentCount = (table: PgmlTable) => {
  if (!compareBaseModel) {
    return 0
  }

  const triggerCount = compareBaseModel.triggers.filter(trigger => matchesBaseTableIdentity(table, trigger.tableName)).length
  const sequenceCount = compareBaseModel.sequences.filter((sequence) => {
    return getSequenceAttachedTableIds(compareBaseModel.tables, sequence).includes(table.fullName)
  }).length

  return table.indexes.length + table.constraints.length + triggerCount + sequenceCount
}

const getBaseGhostBounds = (entry: PgmlDiagramCompareEntry) => {
  if (!compareBaseModel || entry.targetNodeIds.length > 0 || entry.baseNodeIds.length === 0) {
    return null
  }

  const topLevelKinds = new Set<PgmlDiagramCompareEntry['entityKind']>([
    'custom-type',
    'function',
    'group',
    'layout',
    'procedure',
    'sequence',
    'table',
    'trigger'
  ])

  if (!topLevelKinds.has(entry.entityKind)) {
    return null
  }

  const nodeId = entry.baseNodeIds[0]

  if (!nodeId) {
    return null
  }

  const storedLayout = compareBaseModel.nodeProperties[nodeId]

  if (typeof storedLayout?.x !== 'number' || typeof storedLayout?.y !== 'number') {
    return null
  }

  if (nodeId.startsWith('group:')) {
    return createBounds(
      storedLayout.x,
      storedLayout.y,
      storedLayout.width || diagramGroupTableWidth + diagramGroupHorizontalPadding * 2,
      storedLayout.height || diagramGroupHeaderHeight + 48
    )
  }

  const table = compareBaseModel.tables.find(baseTable => baseTable.fullName === nodeId)

  if (table) {
    const rowCount = table.columns.length + getBaseTableAttachmentCount(table)

    return createBounds(
      storedLayout.x,
      storedLayout.y,
      storedLayout.width || diagramGroupTableWidth,
      storedLayout.height || estimateDiagramTableHeight(rowCount)
    )
  }

  return createBounds(
    storedLayout.x,
    storedLayout.y,
    storedLayout.width || 320,
    storedLayout.height || diagramObjectMinHeight
  )
}

const compareGhostOverlays = computed<DiagramCompareGhostOverlay[]>(() => {
  if (!isCompareDiagramActive.value) {
    return []
  }

  return compareEntries.flatMap((entry) => {
    const bounds = getBaseGhostBounds(entry)

    if (!bounds) {
      return []
    }

    return [{
      bounds,
      color: getPgmlDiagramCompareChangeColor(entry.changeKind),
      entryId: entry.id,
      label: entry.label
    }]
  })
})

const doesCompareEntryMatchSelection = (
  entry: PgmlDiagramCompareEntry,
  selection: DiagramGpuSelection | null
) => {
  if (!selection) {
    return false
  }

  if (entry.selectionCandidates.some(candidate => diagramSelectionEquals(candidate, selection))) {
    return true
  }

  if (selection.kind === 'group' || selection.kind === 'object') {
    return entry.targetNodeIds.includes(selection.id)
  }

  if (selection.kind === 'table') {
    return entry.targetNodeIds.includes(selection.tableId)
  }

  if (selection.kind === 'column') {
    return entry.rowKey === `${selection.tableId}.${selection.columnName}`
  }

  return entry.rowKey === selection.attachmentId
}

const selectedDiagramCompareEntryIds = computed(() => {
  if (!isCompareDiagramActive.value || !selectedSelection.value) {
    return []
  }

  return compareEntries
    .filter(entry => doesCompareEntryMatchSelection(entry, selectedSelection.value))
    .map(entry => entry.id)
})
const selectedCompareEntry = computed(() => {
  return selectedCompareEntryId.value
    ? compareEntryById.value.get(selectedCompareEntryId.value) || null
    : null
})

const syncComparePreviewTarget = () => {
  if (previewTargetId === versionCompareTargetId) {
    return
  }

  emit('viewVersionTarget', versionCompareTargetId)
}

const openComparator = () => {
  activePanelTab.value = 'compare'
  syncComparePreviewTarget()
}

const focusCompareEntry = (entryId: string) => {
  const entry = compareEntryById.value.get(entryId)

  if (!entry) {
    return
  }

  syncComparePreviewTarget()
  selectedCompareEntryId.value = entryId
  activePanelTab.value = 'compare'

  const nextSelection = entry.selectionCandidates[0] || null

  if (nextSelection) {
    selectedSelection.value = nextSelection
    focusSelectionInScene(nextSelection)
    return
  }

  const ghostOverlay = compareGhostOverlays.value.find(overlay => overlay.entryId === entryId)

  if (!ghostOverlay) {
    return
  }

  sceneRef.value?.focusBounds({
    height: ghostOverlay.bounds.height,
    width: ghostOverlay.bounds.width,
    x: ghostOverlay.bounds.left,
    y: ghostOverlay.bounds.top
  })
}

const geometryRegistry = computed(() => {
  const columnGeometry = new Map<string, RoutingWorkerGeometryInput>()
  const objectGeometry = new Map<string, RoutingWorkerGeometryInput>()
  const tableGeometry = new Map<string, RoutingWorkerGeometryInput>()
  const groupHeaderBands = [
    ...groupNodes.value.map((group) => {
      return {
        bottom: group.y + diagramGroupHeaderBandHeight,
        left: group.x,
        right: group.x + group.width,
        top: group.y
      }
    }),
    ...tableCards.value.map((card) => {
      return {
        bottom: card.y + card.headerHeight,
        left: card.x,
        right: card.x + card.width,
        top: card.y
      }
    })
  ]

  tableCards.value.forEach((card) => {
    const cardBounds = createBounds(card.x, card.y, card.width, card.height)

    tableGeometry.set(card.id, {
      bounds: cardBounds,
      groupNodeId: card.groupId,
      identity: `table:${card.id}`,
      isColumnAnchor: false,
      isColumnLabelAnchor: false,
      locator: {
        attribute: 'data-table-anchor',
        value: card.id
      },
      nodeAnchorId: card.groupId || card.id,
      ownerNodeId: card.groupId || card.id,
      rowKey: null,
      tableBounds: cardBounds,
      tableId: card.id
    })

    card.rows.forEach((row, index) => {
      const rowBounds = createBounds(
        card.x,
        card.y + card.headerHeight + index * diagramTableRowHeight,
        card.width,
        diagramTableRowHeight
      )

      if (row.kind !== 'column' || !row.columnName) {
        return
      }

      columnGeometry.set(getColumnAnchorKey(card.id, row.columnName), {
        bounds: rowBounds,
        groupNodeId: card.groupId,
        identity: `${card.id}:${row.columnName}`,
        isColumnAnchor: true,
        isColumnLabelAnchor: false,
        locator: {
          attribute: 'data-column-anchor',
          value: getColumnAnchorKey(card.id, row.columnName)
        },
        nodeAnchorId: card.groupId || card.id,
        ownerNodeId: card.groupId || card.id,
        rowKey: row.key,
        tableBounds: cardBounds,
        tableId: card.id
      })
    })
  })

  objectNodes.value.forEach((node) => {
    objectGeometry.set(node.id, {
      bounds: createBounds(node.x, node.y, node.width, node.height),
      groupNodeId: null,
      identity: `object:${node.id}`,
      isColumnAnchor: false,
      isColumnLabelAnchor: false,
      locator: {
        attribute: 'data-node-anchor',
        value: node.id
      },
      nodeAnchorId: node.id,
      ownerNodeId: node.id,
      rowKey: null,
      tableBounds: null,
      tableId: null
    })
  })

  return {
    columnGeometry,
    objectGeometry,
    groupHeaderBands,
    tableGeometry
  }
})

const computeConnectionLines = async () => {
  latestConnectionRequestId += 1
  const requestId = latestConnectionRequestId
  const descriptors: RoutingWorkerDescriptorInput[] = []

  model.references.forEach((reference) => {
    const fromGeometry = geometryRegistry.value.columnGeometry.get(getColumnAnchorKey(reference.fromTable, reference.fromColumn))
    const toGeometry = geometryRegistry.value.columnGeometry.get(getColumnAnchorKey(reference.toTable, reference.toColumn))

    if (!fromGeometry || !toGeometry) {
      return
    }

    const isSelectedOutgoingReference = selectedTableId.value !== null && reference.fromTable === selectedTableId.value

    descriptors.push({
      animated: isSelectedOutgoingReference,
      color: isSelectedOutgoingReference
        ? (tableColorById.value[reference.fromTable] || tableColorById.value[reference.toTable] || '#79e3ea')
        : (tableColorById.value[reference.toTable] || '#79e3ea'),
      dashPattern: isSelectedOutgoingReference ? '10 7' : '0',
      dashed: isSelectedOutgoingReference,
      fromGeometry,
      key: `ref:${reference.fromTable}:${reference.fromColumn}:${reference.toTable}:${reference.toColumn}`,
      selectedForeground: isSelectedOutgoingReference,
      toGeometry
    })
  })

  objectNodes.value.forEach((node) => {
    const fromGeometry = geometryRegistry.value.objectGeometry.get(node.id)
    const impactTargets = node.impactTargets.length > 0
      ? node.impactTargets
      : node.tableIds.map((tableId) => {
          return {
            columnName: null,
            tableId
          } satisfies DiagramGpuImpactTarget
        })

    if (!fromGeometry) {
      return
    }

    impactTargets.forEach((impactTarget) => {
      const toGeometry = impactTarget.columnName
        ? geometryRegistry.value.columnGeometry.get(getColumnAnchorKey(impactTarget.tableId, impactTarget.columnName))
        : geometryRegistry.value.tableGeometry.get(impactTarget.tableId)

      if (!toGeometry) {
        return
      }

      const isSelectedObjectImpact = selectedSelection.value?.kind === 'object' && selectedSelection.value.id === node.id

      descriptors.push({
        animated: isSelectedObjectImpact,
        color: node.color,
        dashPattern: node.kindLabel === 'Custom Type' && !isSelectedObjectImpact ? '2 5' : '10 7',
        dashed: true,
        fromGeometry,
        key: `${node.id}->${impactTarget.tableId}:${impactTarget.columnName || '*'}`,
        selectedForeground: isSelectedObjectImpact,
        toGeometry
      })
    })
  })

  if (descriptors.length === 0) {
    connectionLines.value = []
    return
  }

  const worker = getRoutingWorker()

  try {
    const lines = await new Promise<DiagramGpuConnectionLine[]>((resolve, reject) => {
      pendingRoutingRequests.set(requestId, {
        reject,
        resolve
      })
      worker.postMessage({
        descriptors,
        groupHeaderBands: geometryRegistry.value.groupHeaderBands,
        groupGeometries: groupNodes.value.map((group) => {
          return {
            bounds: createBounds(group.x, group.y, group.width, group.height),
            groupNodeId: null,
            identity: `group:${group.id}`,
            isColumnAnchor: false,
            isColumnLabelAnchor: false,
            locator: {
              attribute: 'data-node-anchor',
              value: group.id
            },
            nodeAnchorId: group.id,
            ownerNodeId: group.id,
            rowKey: null,
            tableBounds: null,
            tableId: null
          } satisfies RoutingWorkerGeometryInput
        }),
        nodeOrders: nodeOrderById.value,
        planeBounds: createBounds(0, 0, Math.max(worldBounds.value.maxX + 200, 1), Math.max(worldBounds.value.maxY + 200, 1)),
        requestId,
        scale: 1
      })
    })

    if (requestId === latestConnectionRequestId) {
      connectionLines.value = lines
    }
  } catch {
    if (requestId === latestConnectionRequestId) {
      connectionLines.value = []
    }
  }
}

const selectedGroup = computed(() => {
  if (selectedSelection.value?.kind !== 'group') {
    return null
  }

  return groupLayoutStates.value[selectedSelection.value.id] || null
})

const selectedTable = computed(() => {
  const tableId = selectedTableId.value

  if (!tableId) {
    return null
  }

  return tableCards.value.find(card => card.id === tableId) || null
})

const selectedColumn = computed(() => {
  const selection = selectedSelection.value

  if (selection?.kind !== 'column') {
    return null
  }

  const table = model.tables.find(entry => entry.fullName === selection.tableId)
  const column = table?.columns.find(entry => entry.name === selection.columnName)

  if (!table || !column) {
    return null
  }

  return {
    column,
    table
  }
})

const selectedAttachment = computed(() => {
  const selection = selectedSelection.value

  if (selection?.kind !== 'attachment') {
    return null
  }

  const attachment = (tableAttachmentState.value.attachmentsByTableId[selection.tableId] || [])
    .find(entry => entry.id === selection.attachmentId)

  return attachment || null
})

const selectedObject = computed(() => {
  if (selectedSelection.value?.kind !== 'object') {
    return null
  }

  return objectLayoutStates.value[selectedSelection.value.id] || null
})

const inspectorOverviewStats = computed(() => {
  return [
    {
      key: 'groups',
      label: 'Groups',
      value: groupNodes.value.length
    },
    {
      key: 'tables',
      label: 'Tables',
      value: tableCards.value.length
    },
    {
      key: 'objects',
      label: 'Objects',
      value: objectNodes.value.length
    },
    {
      key: 'lines',
      label: 'Lines',
      value: connectionLines.value.length
    }
  ]
})

const selectedDetailPopover = computed<DiagramDetailPopover | null>(() => {
  if (selectedAttachment.value) {
    return {
      color: selectedAttachment.value.color,
      details: selectedAttachment.value.details,
      flags: selectedAttachment.value.flags,
      id: selectedAttachment.value.id,
      kind: 'attachment',
      kindLabel: selectedAttachment.value.kind,
      sourceRange: selectedAttachment.value.sourceRange,
      subtitle: selectedAttachment.value.subtitle,
      title: selectedAttachment.value.title
    }
  }

  if (!selectedObject.value || !previewableObjectKindLabels.has(selectedObject.value.kindLabel)) {
    return null
  }

  return {
    color: selectedObject.value.color,
    details: selectedObject.value.details,
    flags: [],
    id: selectedObject.value.id,
    kind: 'object',
    kindLabel: selectedObject.value.kindLabel,
    sourceRange: selectedObject.value.sourceRange,
    subtitle: selectedObject.value.subtitle,
    title: selectedObject.value.title
  }
})

const selectedDetailEditorKey = computed(() => {
  const detailPopover = selectedDetailPopover.value

  if (!detailPopover?.sourceRange) {
    return detailPopover ? `${detailPopover.kind}:${detailPopover.id}:none` : 'none'
  }

  return `${detailPopover.kind}:${detailPopover.id}:${detailPopover.sourceRange.startLine}:${detailPopover.sourceRange.endLine}`
})

const selectedDetailSourceSelectionRange = computed(() => {
  const sourceRange = selectedDetailPopover.value?.sourceRange

  if (!sourceRange) {
    return null
  }

  return getPgmlSourceSelectionRange(sourceText, sourceRange)
})

const selectedDetailSourceSnippet = computed(() => {
  const selectionRange = selectedDetailSourceSelectionRange.value

  if (!selectionRange) {
    return ''
  }

  return sourceText.slice(selectionRange.start, selectionRange.end)
})

const buildPgmlBlockEditorSpec = (
  blockSource: string,
  kindLabel: string
): DetailPopoverEditorSpec => {
  return {
    description: `Edit the selected ${kindLabel.toLowerCase()} snippet directly in PGML syntax without treating it as a standalone document.`,
    languageMode: 'pgml-snippet',
    source: normalizePgmlBlockSourceForEditor(blockSource),
    title: `Editing ${kindLabel} snippet`,
    toReplacementText: (nextSource: string) => reindentPgmlBlockEditorText(nextSource, blockSource)
  }
}

const buildExecutableSqlEditorSpec = (
  blockSource: string,
  kindLabel: string,
  executableSource: string | null
) => {
  if (!executableSource || executableSource.trim().length === 0) {
    return null
  }

  return {
    description: `Edit the SQL stored inside this ${kindLabel.toLowerCase()} without the surrounding PGML wrapper.`,
    languageMode: 'sql' as const,
    source: dedentPgmlSourceForEditor(executableSource),
    title: `Editing ${kindLabel} SQL`,
    toReplacementText: (nextSource: string) => replacePgmlExecutableSourceInBlock(blockSource, nextSource)
  }
}

const buildRoutineBodySqlEditorSpec = (
  blockSource: string,
  kindLabel: string,
  executableSource: string | null
) => {
  if (!executableSource || executableSource.trim().length === 0) {
    return null
  }

  const routineBody = extractPgmlRoutineBodyFromExecutableSource(executableSource)

  if (!routineBody) {
    return null
  }

  return {
    description: `Edit the ${kindLabel.toLowerCase()} body directly without the surrounding CREATE statement or language wrapper.`,
    languageMode: 'sql' as const,
    source: routineBody,
    title: `Editing ${kindLabel} body`,
    toReplacementText: (nextSource: string) => replacePgmlRoutineBodyInBlock(blockSource, nextSource)
  }
}

const resolveSelectedRoutineSource = (
  id: string,
  routines: PgmlRoutine[],
  prefix: 'function:' | 'procedure:'
) => {
  return routines.find(entry => `${prefix}${entry.name}` === id)?.source || null
}

const selectedDetailEditorSpec = computed<DetailPopoverEditorSpec | null>(() => {
  const detailPopover = selectedDetailPopover.value
  const blockSource = selectedDetailSourceSnippet.value

  if (!detailPopover?.sourceRange || blockSource.trim().length === 0) {
    return null
  }

  if (selectedAttachment.value?.kind === 'Constraint') {
    return {
      description: 'Edit the SQL check expression directly instead of the indented table row wrapper.',
      languageMode: 'sql',
      source: selectedAttachment.value.subtitle.trim(),
      title: 'Editing Constraint Expression',
      toReplacementText: (nextSource: string) => replacePgmlConstraintExpressionInBlock(blockSource, nextSource)
    }
  }

  if (selectedAttachment.value?.kind === 'Function') {
    return buildRoutineBodySqlEditorSpec(
      blockSource,
      selectedAttachment.value.kind,
      resolveSelectedRoutineSource(selectedAttachment.value.id, model.functions, 'function:')
    ) || buildExecutableSqlEditorSpec(
      blockSource,
      selectedAttachment.value.kind,
      resolveSelectedRoutineSource(selectedAttachment.value.id, model.functions, 'function:')
    ) || buildPgmlBlockEditorSpec(blockSource, selectedAttachment.value.kind)
  }

  if (selectedAttachment.value?.kind === 'Procedure') {
    return buildRoutineBodySqlEditorSpec(
      blockSource,
      selectedAttachment.value.kind,
      resolveSelectedRoutineSource(selectedAttachment.value.id, model.procedures, 'procedure:')
    ) || buildExecutableSqlEditorSpec(
      blockSource,
      selectedAttachment.value.kind,
      resolveSelectedRoutineSource(selectedAttachment.value.id, model.procedures, 'procedure:')
    ) || buildPgmlBlockEditorSpec(blockSource, selectedAttachment.value.kind)
  }

  if (selectedAttachment.value?.kind === 'Trigger') {
    return buildExecutableSqlEditorSpec(
      blockSource,
      selectedAttachment.value.kind,
      model.triggers.find(entry => `trigger:${entry.name}` === selectedAttachment.value?.id)?.source || null
    ) || buildPgmlBlockEditorSpec(blockSource, selectedAttachment.value.kind)
  }

  if (selectedAttachment.value?.kind === 'Sequence') {
    return buildExecutableSqlEditorSpec(
      blockSource,
      selectedAttachment.value.kind,
      model.sequences.find(entry => `sequence:${entry.name}` === selectedAttachment.value?.id)?.source || null
    ) || buildPgmlBlockEditorSpec(blockSource, selectedAttachment.value.kind)
  }

  if (selectedObject.value?.kindLabel === 'Function') {
    return buildRoutineBodySqlEditorSpec(
      blockSource,
      selectedObject.value.kindLabel,
      resolveSelectedRoutineSource(selectedObject.value.id, model.functions, 'function:')
    ) || buildExecutableSqlEditorSpec(
      blockSource,
      selectedObject.value.kindLabel,
      resolveSelectedRoutineSource(selectedObject.value.id, model.functions, 'function:')
    ) || buildPgmlBlockEditorSpec(blockSource, selectedObject.value.kindLabel)
  }

  if (selectedObject.value?.kindLabel === 'Procedure') {
    return buildRoutineBodySqlEditorSpec(
      blockSource,
      selectedObject.value.kindLabel,
      resolveSelectedRoutineSource(selectedObject.value.id, model.procedures, 'procedure:')
    ) || buildExecutableSqlEditorSpec(
      blockSource,
      selectedObject.value.kindLabel,
      resolveSelectedRoutineSource(selectedObject.value.id, model.procedures, 'procedure:')
    ) || buildPgmlBlockEditorSpec(blockSource, selectedObject.value.kindLabel)
  }

  if (selectedObject.value?.kindLabel === 'Trigger') {
    return buildExecutableSqlEditorSpec(
      blockSource,
      selectedObject.value.kindLabel,
      model.triggers.find(entry => `trigger:${entry.name}` === selectedObject.value?.id)?.source || null
    ) || buildPgmlBlockEditorSpec(blockSource, selectedObject.value.kindLabel)
  }

  if (selectedObject.value?.kindLabel === 'Sequence') {
    return buildExecutableSqlEditorSpec(
      blockSource,
      selectedObject.value.kindLabel,
      model.sequences.find(entry => `sequence:${entry.name}` === selectedObject.value?.id)?.source || null
    ) || buildPgmlBlockEditorSpec(blockSource, selectedObject.value.kindLabel)
  }

  return buildPgmlBlockEditorSpec(blockSource, detailPopover.kindLabel)
})

const canEditSelectedDetailSource = computed(() => {
  return canEditDetailSource
    && !!selectedDetailPopover.value?.sourceRange
    && selectedDetailEditorSpec.value !== null
})

const detailPopoverSourceHasChanges = computed(() => {
  return detailPopoverEditorSource.value !== (selectedDetailEditorSpec.value?.source || '')
})

const detailPopoverEditButtonLabel = computed(() => {
  return selectedDetailEditorSpec.value?.languageMode === 'sql' ? 'Edit SQL' : 'Edit block'
})

const shouldShowDetailPopover = computed(() => {
  return selectedDetailPopover.value !== null && !isMobilePanelView.value
})

const detailPopoverViewportInsetRight = computed(() => {
  return !isMobilePanelView.value && isDiagramPanelVisible.value ? 336 : 0
})

const selectedDetailAnchorBounds = computed<MeasuredBounds | null>(() => {
  const transform = sceneTransform.value

  if (transform.scale <= 0.001) {
    return null
  }

  if (selectedSelection.value?.kind === 'attachment') {
    const selection = selectedSelection.value
    const table = tableCards.value.find(entry => entry.id === selection.tableId)

    if (!table) {
      return null
    }

    const rowIndex = table.rows.findIndex((row) => {
      return row.kind === 'attachment' && row.attachmentId === selection.attachmentId
    })

    if (rowIndex < 0) {
      return null
    }

    return createBounds(
      table.x * transform.scale + transform.panX,
      (table.y + table.headerHeight + rowIndex * diagramTableRowHeight) * transform.scale + transform.panY,
      table.width * transform.scale,
      diagramTableRowHeight * transform.scale
    )
  }

  if (selectedSelection.value?.kind === 'object') {
    const objectNode = objectLayoutStates.value[selectedSelection.value.id]

    if (!objectNode || !previewableObjectKindLabels.has(objectNode.kindLabel)) {
      return null
    }

    return createBounds(
      objectNode.x * transform.scale + transform.panX,
      objectNode.y * transform.scale + transform.panY,
      objectNode.width * transform.scale,
      objectNode.height * transform.scale
    )
  }

  return null
})

const detailPopoverPlacement = computed<DetailPopoverPlacement | null>(() => {
  const anchorBounds = selectedDetailAnchorBounds.value
  const safeViewportWidth = viewportSize.value.width
  const safeViewportHeight = viewportSize.value.height

  if (!anchorBounds || safeViewportWidth <= 1 || safeViewportHeight <= 1) {
    return null
  }

  const margin = 12
  const gap = 14
  const minimumPopoverWidth = isEditingDetailSource.value ? 320 : 220
  const fallbackPopoverWidth = isEditingDetailSource.value ? 260 : 160
  const preferredPopoverWidth = isEditingDetailSource.value ? 560 : 360
  const popoverHeight = detailPopoverSize.value.height > 0
    ? detailPopoverSize.value.height
    : isEditingDetailSource.value
      ? 420
      : 260
  const usableViewportWidth = Math.max(margin, safeViewportWidth - detailPopoverViewportInsetRight.value)
  const availableRightWidth = Math.max(0, usableViewportWidth - margin - anchorBounds.right - gap)
  const availableLeftWidth = Math.max(0, anchorBounds.left - gap - margin)
  const shouldPlaceRight = availableRightWidth >= minimumPopoverWidth
    || (availableRightWidth >= availableLeftWidth && availableRightWidth >= fallbackPopoverWidth)
  const availableSideWidth = shouldPlaceRight ? availableRightWidth : availableLeftWidth
  const popoverWidth = availableSideWidth >= minimumPopoverWidth
    ? Math.min(preferredPopoverWidth, availableSideWidth)
    : Math.max(fallbackPopoverWidth, Math.min(preferredPopoverWidth, availableSideWidth))
  const maxLeft = Math.max(margin, usableViewportWidth - popoverWidth - margin)
  const left = shouldPlaceRight
    ? clamp(anchorBounds.right + gap, margin, maxLeft)
    : clamp(anchorBounds.left - gap - popoverWidth, margin, maxLeft)
  const maxTop = Math.max(margin, safeViewportHeight - popoverHeight - margin)
  const top = clamp(anchorBounds.top - 12, margin, maxTop)

  return {
    left,
    top,
    width: popoverWidth
  }
})

const detailPopoverContainerClass = computed(() => {
  return isMobileCanvasShell.value
    ? 'pointer-events-none absolute inset-x-3 top-3 z-[4] flex'
    : 'pointer-events-none absolute z-[4] flex'
})

const detailPopoverContainerStyle = computed<CSSProperties | undefined>(() => {
  if (isMobileCanvasShell.value) {
    return undefined
  }

  if (!detailPopoverPlacement.value) {
    return {
      left: '12px',
      top: '12px',
      width: '24rem'
    }
  }

  return {
    left: `${Math.round(detailPopoverPlacement.value.left)}px`,
    top: `${Math.round(detailPopoverPlacement.value.top)}px`,
    width: `${Math.round(detailPopoverPlacement.value.width)}px`
  }
})

const getCompareGhostOverlayStyle = (overlay: DiagramCompareGhostOverlay): CSSProperties => {
  const transform = sceneTransform.value

  return {
    borderColor: `color-mix(in srgb, ${overlay.color} 66%, var(--studio-divider) 34%)`,
    boxShadow: `0 0 0 1px color-mix(in srgb, ${overlay.color} 18%, transparent), inset 0 0 0 1px color-mix(in srgb, ${overlay.color} 18%, transparent)`,
    color: `color-mix(in srgb, ${overlay.color} 82%, var(--studio-shell-text) 18%)`,
    height: `${Math.max(22, Math.round(overlay.bounds.height * transform.scale))}px`,
    left: `${Math.round(overlay.bounds.left * transform.scale + transform.panX)}px`,
    top: `${Math.round(overlay.bounds.top * transform.scale + transform.panY)}px`,
    width: `${Math.max(72, Math.round(overlay.bounds.width * transform.scale))}px`
  }
}

const getDetailPopoverBadgeStyle = (color: string) => {
  return {
    backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} 54%, var(--studio-rail) 46%)`,
    color: `color-mix(in srgb, ${color} 78%, var(--studio-shell-text) 22%)`
  }
}

const getDetailPopoverFlagStyle = (flag: TableAttachmentFlag) => {
  return getDetailPopoverBadgeStyle(flag.color)
}

const closeDetailPopover = () => {
  isEditingDetailSource.value = false
  selectedSelection.value = null
}

const syncDetailPopoverEditorSource = () => {
  detailPopoverEditorSource.value = selectedDetailEditorSpec.value?.source || ''
}

const openDetailPopoverSourceEditor = () => {
  if (!canEditSelectedDetailSource.value) {
    return
  }

  syncDetailPopoverEditorSource()
  isEditingDetailSource.value = true
}

const cancelDetailPopoverSourceEditor = () => {
  syncDetailPopoverEditorSource()
  isEditingDetailSource.value = false
}

const applyDetailPopoverSourceEditor = () => {
  const sourceRange = selectedDetailPopover.value?.sourceRange
  const replacementText = selectedDetailEditorSpec.value?.toReplacementText(detailPopoverEditorSource.value) || null

  if (!sourceRange || !canEditSelectedDetailSource.value || replacementText === null) {
    return
  }

  emit('replaceSourceRange', {
    nextText: replacementText,
    sourceRange
  })
  isEditingDetailSource.value = false
}

const diagramSelectionEquals = (left: DiagramGpuSelection | null, right: DiagramGpuSelection) => {
  if (!left || left.kind !== right.kind) {
    return false
  }

  if ((left.kind === 'group' || left.kind === 'object') && (right.kind === 'group' || right.kind === 'object')) {
    return left.id === right.id
  }

  if (left.kind === 'table' && right.kind === 'table') {
    return left.tableId === right.tableId
  }

  if (left.kind === 'column' && right.kind === 'column') {
    return left.tableId === right.tableId && left.columnName === right.columnName
  }

  if (left.kind === 'attachment' && right.kind === 'attachment') {
    return left.tableId === right.tableId && left.attachmentId === right.attachmentId
  }

  return false
}

const isBrowserItemSelected = (item: EntityBrowserItem) => {
  return diagramSelectionEquals(selectedSelection.value, item.selection)
}

const browserItemSupportsVisibility = (item: EntityBrowserItem) => item.kind !== 'column'

const isAttachmentEffectivelyVisible = (tableId: string, attachmentId: string) => {
  const table = model.tables.find(entry => entry.fullName === tableId)

  return table ? isTableVisible(table) && isEntityDirectlyVisible(attachmentId) : false
}

const isBrowserItemDirectlyVisible = (item: EntityBrowserItem) => {
  if (item.selection.kind === 'table') {
    return isEntityDirectlyVisible(item.selection.tableId)
  }

  if (item.selection.kind === 'column') {
    return isEntityDirectlyVisible(item.selection.tableId)
  }

  if (item.selection.kind === 'attachment') {
    return isEntityDirectlyVisible(item.selection.attachmentId)
  }

  return isEntityDirectlyVisible(item.selection.id)
}

const isBrowserItemEffectivelyVisible = (item: EntityBrowserItem) => {
  const selection = item.selection

  if (selection.kind === 'table') {
    const table = model.tables.find(entry => entry.fullName === selection.tableId)

    return table ? isTableVisible(table) : false
  }

  if (selection.kind === 'column') {
    const table = model.tables.find(entry => entry.fullName === selection.tableId)

    return table ? isTableVisible(table) : false
  }

  if (selection.kind === 'attachment') {
    return isAttachmentEffectivelyVisible(selection.tableId, selection.attachmentId)
  }

  if (selection.kind === 'group') {
    return isGroupVisible(selection.id.replace(/^group:/, ''))
  }

  return isEntityDirectlyVisible(selection.id)
}

const isBrowserItemHiddenByAncestor = (item: EntityBrowserItem) => {
  return !isBrowserItemEffectivelyVisible(item) && isBrowserItemDirectlyVisible(item)
}

const getBrowserItemVisibilityButtonClass = (item: EntityBrowserItem, compact = false) => {
  return getStudioStateButtonClass({
    compact,
    disabled: isBrowserItemHiddenByAncestor(item),
    emphasized: !isBrowserItemDirectlyVisible(item),
    extraClass: joinStudioClasses(
      browserItemActionButtonBaseClass,
      compact ? 'h-6 min-w-[3rem]' : 'h-7 min-w-[3.5rem]'
    )
  })
}

const getBrowserItemTableId = (item: EntityBrowserItem) => {
  if (item.selection.kind === 'table') {
    return item.selection.tableId
  }

  if (item.selection.kind === 'column') {
    return item.selection.tableId
  }

  if (item.selection.kind === 'attachment') {
    return item.selection.tableId
  }

  return null
}
const getBrowserItemFocusSourceLabel = (item: EntityBrowserItem) => {
  const focusTarget = item.selection.kind === 'table' || item.selection.kind === 'object'
    ? item.id
    : item.label

  return `Focus ${focusTarget} in source`
}
const getBrowserGroupEditLabel = (item: EntityBrowserItem) => {
  return `Edit group ${item.label}`
}

const getGroupColor = (groupId: string) => {
  return groupLayoutStates.value[groupId]?.color || model.nodeProperties[groupId]?.color || '#79e3ea'
}

const getTableColor = (tableId: string) => {
  const groupId = tableGroupById.value[tableId] ? getStoredGroupId(tableGroupById.value[tableId] || '') : null

  if (groupId) {
    return getGroupColor(groupId)
  }

  return tableColorById.value[tableId] || floatingTableStates.value[tableId]?.color || model.nodeProperties[tableId]?.color || '#38bdf8'
}

const getObjectColor = (id: string) => {
  return objectLayoutStates.value[id]?.color || model.nodeProperties[id]?.color || '#14b8a6'
}

const getBrowserItemAccentColor = (item: EntityBrowserItem) => {
  const tableId = getBrowserItemTableId(item)

  if (tableId) {
    return getTableColor(tableId)
  }

  if (item.selection.kind === 'group') {
    return getGroupColor(item.selection.id)
  }

  if (item.selection.kind === 'object') {
    return getObjectColor(item.selection.id)
  }

  return '#79e3ea'
}

const isBrowserItemSearchMatch = (item: EntityBrowserItem) => {
  return normalizedEntitySearchQuery.value.length > 0 && item.searchText.includes(normalizedEntitySearchQuery.value)
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

  const selection = item.selection

  if (selection.kind === 'table') {
    return selection.tableId
  }

  if (selection.kind === 'attachment') {
    return selection.attachmentId
  }

  if (selection.kind === 'group' || selection.kind === 'object') {
    return selection.id
  }

  return null
}

const diagramPanelTitle = computed(() => {
  if (activePanelTab.value === 'compare') {
    return selectedCompareEntry.value ? selectedCompareEntry.value.label : 'Comparator'
  }

  if (activePanelTab.value === 'entities') {
    return 'Entities'
  }

  if (activePanelTab.value === 'export') {
    return 'Export'
  }

  if (activePanelTab.value === 'versions') {
    return 'Versions'
  }

  if (selectedColumn.value) {
    return `${selectedColumn.value.table.fullName}.${selectedColumn.value.column.name}`
  }

  if (selectedAttachment.value) {
    return selectedAttachment.value.title
  }

  if (selectedGroup.value) {
    return selectedGroup.value.title
  }

  if (selectedTable.value) {
    return selectedTable.value.id
  }

  if (selectedObject.value) {
    return selectedObject.value.id
  }

  return 'Inspector'
})

const diagramPanelDescription = computed(() => {
  if (activePanelTab.value === 'compare') {
    if (selectedCompareEntry.value) {
      return selectedCompareEntry.value.description
    }

    return `${compareEntries.length} highlighted change${compareEntries.length === 1 ? '' : 's'} between ${compareBaseLabel} and ${compareTargetLabel}.`
  }

  if (activePanelTab.value === 'entities') {
    const entitySummaryLabel = normalizedEntitySearchQuery.value
      ? `${filteredEntityResultCount.value} matches`
      : `${filteredEntityResultCount.value} visible rows`

    return `${entitySummaryLabel} · ${hiddenEntityCount.value} hidden in saved properties.`
  }

  if (activePanelTab.value === 'export') {
    return 'Export the current accelerated diagram view.'
  }

  if (activePanelTab.value === 'versions') {
    return 'Preview checkpoints, compare snapshots, and generate forward migrations.'
  }

  if (selectedColumn.value) {
    return `${selectedColumn.value.table.name} field.`
  }

  if (selectedAttachment.value) {
    return `${selectedAttachment.value.kind} attached to ${selectedAttachment.value.tableId}.`
  }

  if (selectedGroup.value) {
    return `${selectedGroup.value.tableCount} tables grouped together.`
  }

  if (selectedTable.value) {
    return `${selectedTable.value.schema} schema table with ${selectedTable.value.rows.length} rows.`
  }

  if (selectedObject.value) {
    return `${selectedObject.value.kindLabel} object.`
  }

  return 'Select a group, table, row, or object.'
})

const diagramViewportStyle: CSSProperties = {
  backgroundColor: 'var(--studio-canvas-bg)',
  borderColor: 'var(--studio-divider)'
}

const floatingPanelStyle: CSSProperties = {
  backgroundColor: 'var(--studio-control-bg)',
  borderColor: 'var(--studio-divider)',
  boxShadow: 'var(--studio-floating-shadow)',
  backdropFilter: 'blur(18px)'
}

const diagramPanelSurfaceClass = computed(() => {
  return isMobilePanelView.value
    ? 'absolute inset-0 z-[3] grid min-h-0 w-full grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden'
    : 'absolute bottom-3 right-3 top-14 z-[3] grid w-[320px] grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden border max-[900px]:left-3 max-[900px]:w-auto'
})

const toggleSidePanel = () => {
  isDesktopSidePanelOpen.value = !isDesktopSidePanelOpen.value
}

const focusSourceRange = (sourceRange?: PgmlSourceRange) => {
  if (!sourceRange) {
    return
  }

  emit('focusSource', sourceRange)
}

const updateGroupState = (
  id: string,
  partial: Partial<DiagramGpuGroupNode>,
  options: {
    emitLayout?: boolean
  } = {}
) => {
  const current = groupLayoutStates.value[id]

  if (!current) {
    return
  }

  const nextGroup = {
    ...current,
    ...partial
  }

  groupLayoutStates.value = {
    ...groupLayoutStates.value,
    [id]: nextGroup
  }

  if (options.emitLayout !== false) {
    emit('nodePropertiesChange', getNodeLayoutProperties())
  }
}

const updateTableState = (
  id: string,
  partial: Partial<DiagramGpuNodeLayoutState>,
  options: {
    emitLayout?: boolean
  } = {}
) => {
  const current = floatingTableStates.value[id]

  if (!current) {
    return
  }

  floatingTableStates.value = {
    ...floatingTableStates.value,
    [id]: {
      ...current,
      ...partial
    }
  }

  if (options.emitLayout !== false) {
    emit('nodePropertiesChange', getNodeLayoutProperties())
  }
}

const updateObjectState = (
  id: string,
  partial: Partial<DiagramGpuObjectNode>,
  options: {
    emitLayout?: boolean
  } = {}
) => {
  const current = objectLayoutStates.value[id]

  if (!current) {
    return
  }

  objectLayoutStates.value = {
    ...objectLayoutStates.value,
    [id]: {
      ...current,
      ...partial
    }
  }

  if (options.emitLayout !== false) {
    emit('nodePropertiesChange', getNodeLayoutProperties())
  }
}

const toggleObjectCollapsed = (id: string) => {
  const current = objectLayoutStates.value[id]

  if (!current) {
    return
  }

  if (current.collapsed) {
    updateObjectState(id, {
      collapsed: false,
      height: Math.max(current.expandedHeight, diagramObjectCollapsedHeight),
      minHeight: current.expandedHeight
    })
    return
  }

  updateObjectState(id, {
    collapsed: true,
    expandedHeight: Math.max(current.expandedHeight, current.height),
    height: diagramObjectCollapsedHeight,
    minHeight: diagramObjectCollapsedHeight
  })
}

const handleSceneMoveNode = (payload: { id: string, kind: 'group' | 'object' | 'table', x: number, y: number }) => {
  const nextX = snapToGrid.value ? Math.round(payload.x / 18) * 18 : payload.x
  const nextY = snapToGrid.value ? Math.round(payload.y / 18) * 18 : payload.y

  if (payload.kind === 'group') {
    updateGroupState(payload.id, {
      x: nextX,
      y: nextY
    }, {
      emitLayout: false
    })
    return
  }

  if (payload.kind === 'table') {
    updateTableState(payload.id, {
      x: nextX,
      y: nextY
    }, {
      emitLayout: false
    })
    return
  }

  updateObjectState(payload.id, {
    x: nextX,
    y: nextY
  }, {
    emitLayout: false
  })
}

const handleSceneMoveEnd = () => {
  emit('nodePropertiesChange', getNodeLayoutProperties())
}

const handleSceneToggleObjectCollapsed = (id: string) => {
  toggleObjectCollapsed(id)
}

const handleSceneTransformChange = (nextTransform: DiagramCanvasViewportTransform) => {
  sceneTransform.value = nextTransform
  currentScale.value = nextTransform.scale
}

const handleSceneSelect = (nextSelection: DiagramGpuSelection | null) => {
  selectedSelection.value = nextSelection

  if (activePanelTab.value !== 'compare') {
    activePanelTab.value = 'inspector'
  }
}

const measureElementSize = (element: HTMLElement | null): MeasuredSize => {
  if (!element) {
    return {
      height: 0,
      width: 0
    }
  }

  return {
    height: Math.round(element.offsetHeight),
    width: Math.round(element.offsetWidth)
  }
}

const syncViewportSize = () => {
  viewportSize.value = measureElementSize(viewportRef.value)
}

const syncDetailPopoverSize = () => {
  detailPopoverSize.value = measureElementSize(detailPopoverRef.value)
}

const updateEntityVisibility = (id: string, visible: boolean) => {
  const nextProperties = getNodeLayoutProperties()
  const nextEntry: PgmlNodeProperties = {
    ...(nextProperties[id] || {})
  }

  if (visible) {
    delete nextEntry.visible
  } else {
    nextEntry.visible = false
  }

  if (Object.values(nextEntry).some(value => value !== undefined && value !== null)) {
    nextProperties[id] = nextEntry
  } else {
    delete nextProperties[id]
  }

  emit('nodePropertiesChange', nextProperties)

  if (
    !visible
    && (
      (selectedSelection.value?.kind === 'group' && selectedSelection.value.id === id)
      || (selectedSelection.value?.kind === 'object' && selectedSelection.value.id === id)
      || (selectedSelection.value?.kind === 'table' && selectedSelection.value.tableId === id)
      || (selectedSelection.value?.kind === 'column' && selectedSelection.value.tableId === id)
      || (selectedSelection.value?.kind === 'attachment' && selectedSelection.value.attachmentId === id)
    )
  ) {
    selectedSelection.value = null
  }
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
const restoreAllEntityVisibility = () => {
  const nextProperties = Object.entries(model.nodeProperties).reduce<Record<string, PgmlNodeProperties>>((entries, [id, value]) => {
    const nextEntry: PgmlNodeProperties = {
      ...value
    }

    delete nextEntry.visible

    if (Object.values(nextEntry).some(entryValue => entryValue !== undefined && entryValue !== null)) {
      entries[id] = nextEntry
    }

    return entries
  }, {})

  emit('nodePropertiesChange', nextProperties)
}

const focusBrowserItemSource = (item: EntityBrowserItem) => {
  focusSourceRange(item.sourceRange)
}

const selectBrowserItem = (item: EntityBrowserItem) => {
  if (!isBrowserItemEffectivelyVisible(item)) {
    return
  }

  selectedSelection.value = item.selection
}

const getNodeLayoutProperties = () => {
  const entries: DiagramGpuNodeLayoutState[] = [
    ...Object.values(groupLayoutStates.value).map((group) => {
      return {
        color: group.color,
        height: group.height,
        id: group.id,
        kind: 'group' as const,
        minHeight: group.minHeight,
        minWidth: group.minWidth,
        tableColumns: group.columnCount,
        tableWidthScale: group.tableWidthScale,
        title: group.title,
        visible: true,
        width: group.width,
        x: group.x,
        y: group.y
      }
    }),
    ...Object.values(floatingTableStates.value),
    ...Object.values(objectLayoutStates.value).map((objectNode) => {
      return {
        collapsed: objectNode.collapsed,
        color: objectNode.color,
        height: objectNode.height,
        id: objectNode.id,
        kind: 'object' as const,
        minHeight: objectNode.minHeight,
        minWidth: objectNode.minWidth,
        title: objectNode.title,
        visible: true,
        width: objectNode.width,
        x: objectNode.x,
        y: objectNode.y
      }
    })
  ]

  return normalizeDiagramNodeLayoutProperties(entries, model.nodeProperties)
}

const escapeXml = (value: string) => {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&apos;')
}

type ExportThemeColors = {
  background: string
  divider: string
  dot: string
  label: string
  muted: string
  rowSurface: string
  shellText: string
  surface: string
  tableSurface: string
}

const readDiagramThemeToken = (name: string, fallback: string) => {
  if (!import.meta.client) {
    return fallback
  }

  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

const getExportThemeColors = (): ExportThemeColors => {
  return {
    background: readDiagramThemeToken('--studio-canvas-bg', diagramBackgroundColor),
    divider: readDiagramThemeToken('--studio-divider', diagramDividerColor),
    dot: readDiagramThemeToken('--studio-canvas-dot', diagramDotColor),
    label: readDiagramThemeToken('--studio-shell-label', diagramLabelTextColor),
    muted: readDiagramThemeToken('--studio-shell-muted', diagramMutedTextColor),
    rowSurface: readDiagramThemeToken('--studio-row-surface', diagramRowSurfaceColor),
    shellText: readDiagramThemeToken('--studio-shell-text', diagramTextColor),
    surface: readDiagramThemeToken('--studio-node-surface-bottom', diagramSurfaceColor),
    tableSurface: readDiagramThemeToken('--studio-table-surface', diagramTableSurfaceColor)
  }
}

const buildSvgPaintAttributes = (attribute: 'fill' | 'stroke', value: string, fallback: string) => {
  const paint = normalizeSvgPaint(value, fallback)
  const attributes = [`${attribute}="${paint.color}"`]

  if (paint.opacity !== null && paint.opacity < 1) {
    attributes.push(`${attribute}-opacity="${paint.opacity}"`)
  }

  return attributes.join(' ')
}

const buildExportSvg = () => {
  const padding = 96
  const exportWidth = Math.ceil(worldBounds.value.maxX - worldBounds.value.minX + padding * 2)
  const exportHeight = Math.ceil(worldBounds.value.maxY - worldBounds.value.minY + padding * 2)
  const offsetX = padding - worldBounds.value.minX
  const offsetY = padding - worldBounds.value.minY
  const exportTheme = getExportThemeColors()
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${exportWidth}" height="${exportHeight}" viewBox="0 0 ${exportWidth} ${exportHeight}">`,
    '<defs>',
    '<pattern id="pgml-grid" width="18" height="18" patternUnits="userSpaceOnUse">',
    `<circle cx="9" cy="9" r="1" ${buildSvgPaintAttributes('fill', exportTheme.dot, diagramDotColor)} />`,
    '</pattern>',
    '</defs>',
    `<rect x="0" y="0" width="${exportWidth}" height="${exportHeight}" ${buildSvgPaintAttributes('fill', exportTheme.background, diagramBackgroundColor)} />`,
    `<rect x="0" y="0" width="${exportWidth}" height="${exportHeight}" fill="url(#pgml-grid)" />`
  ]

  groupNodes.value.forEach((group) => {
    parts.push(
      `<rect x="${group.x + offsetX}" y="${group.y + offsetY}" width="${group.width}" height="${group.height}" rx="2" ry="2" fill="${group.color}" fill-opacity="0.14" stroke="${group.color}" stroke-opacity="0.42" />`,
      `<text x="${group.x + offsetX + 12}" y="${group.y + offsetY + 18}" fill="${group.color}" font-size="8" font-family="ui-monospace, monospace">TABLE GROUP</text>`,
      `<text x="${group.x + offsetX + 12}" y="${group.y + offsetY + 38}" ${buildSvgPaintAttributes('fill', exportTheme.shellText, diagramTextColor)} font-size="14" font-weight="600" font-family="ui-sans-serif, system-ui">${escapeXml(group.title)}</text>`,
      `<line x1="${group.x + offsetX}" y1="${group.y + offsetY + diagramGroupHeaderHeight}" x2="${group.x + offsetX + group.width}" y2="${group.y + offsetY + diagramGroupHeaderHeight}" ${buildSvgPaintAttributes('stroke', exportTheme.divider, diagramDividerColor)} />`
    )
  })

  connectionLines.value.forEach((line) => {
    const path = line.points.map((point, index) => {
      const x = point.x + offsetX
      const y = point.y + offsetY

      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
    }).join(' ')

    parts.push(
      `<path d="${path}" fill="none" stroke="${line.color}" stroke-width="2" stroke-dasharray="${line.dashed ? line.dashPattern : '0'}" />`
    )
  })

  tableCards.value.forEach((card) => {
    parts.push(
      `<rect x="${card.x + offsetX}" y="${card.y + offsetY}" width="${card.width}" height="${card.height}" rx="2" ry="2" ${buildSvgPaintAttributes('fill', exportTheme.tableSurface, diagramTableSurfaceColor)} stroke="${card.color}" stroke-opacity="0.48" />`,
      `<text x="${card.x + offsetX + 10}" y="${card.y + offsetY + 16}" fill="${card.color}" font-size="8" font-family="ui-monospace, monospace">TABLE</text>`,
      `<text x="${card.x + offsetX + card.width - 10}" y="${card.y + offsetY + 16}" ${buildSvgPaintAttributes('fill', exportTheme.muted, diagramMutedTextColor)} font-size="8" text-anchor="end" font-family="ui-monospace, monospace">${card.rows.length} ROWS</text>`,
      `<text x="${card.x + offsetX + 10}" y="${card.y + offsetY + 42}" ${buildSvgPaintAttributes('fill', exportTheme.shellText, diagramTextColor)} font-size="14" font-weight="600" font-family="ui-sans-serif, system-ui">${escapeXml(card.title)}</text>`
    )

    card.rows.forEach((row, index) => {
      const rowY = card.y + offsetY + card.headerHeight + index * diagramTableRowHeight

      parts.push(
        `<rect x="${card.x + offsetX}" y="${rowY}" width="${card.width}" height="${diagramTableRowHeight}" ${buildSvgPaintAttributes('fill', exportTheme.rowSurface, diagramRowSurfaceColor)} />`,
        `<text x="${card.x + offsetX + 10}" y="${rowY + 14}" ${buildSvgPaintAttributes('fill', exportTheme.shellText, diagramTextColor)} font-size="9" font-family="ui-monospace, monospace">${escapeXml(row.title)}</text>`,
        `<text x="${card.x + offsetX + 10}" y="${rowY + 25}" ${buildSvgPaintAttributes('fill', exportTheme.muted, diagramMutedTextColor)} font-size="8" font-family="ui-sans-serif, system-ui">${escapeXml(row.subtitle)}</text>`
      )

      if (index < card.rows.length - 1) {
        parts.push(
          `<line x1="${card.x + offsetX}" y1="${rowY + diagramTableRowHeight}" x2="${card.x + offsetX + card.width}" y2="${rowY + diagramTableRowHeight}" ${buildSvgPaintAttributes('stroke', exportTheme.divider, diagramDividerColor)} />`
        )
      }
    })

    parts.push(
      `<line x1="${card.x + offsetX}" y1="${card.y + offsetY + card.headerHeight}" x2="${card.x + offsetX + card.width}" y2="${card.y + offsetY + card.headerHeight}" ${buildSvgPaintAttributes('stroke', exportTheme.divider, diagramDividerColor)} />`
    )
  })

  objectNodes.value.forEach((node) => {
    parts.push(
      `<rect x="${node.x + offsetX}" y="${node.y + offsetY}" width="${node.width}" height="${node.height}" ${buildSvgPaintAttributes('fill', exportTheme.surface, diagramSurfaceColor)} stroke="${node.color}" stroke-opacity="0.4" />`,
      `<text x="${node.x + offsetX + 10}" y="${node.y + offsetY + 16}" fill="${node.color}" font-size="8" font-family="ui-monospace, monospace">${escapeXml(node.kindLabel.toUpperCase())}</text>`,
      `<text x="${node.x + offsetX + 10}" y="${node.y + offsetY + 32}" ${buildSvgPaintAttributes('fill', exportTheme.shellText, diagramTextColor)} font-size="14" font-family="ui-sans-serif, system-ui">${escapeXml(node.title)}</text>`
    )
  })

  parts.push('</svg>')

  return {
    height: exportHeight,
    svg: parts.join(''),
    width: exportWidth
  }
}

const exportSvg = async () => {
  const result = buildExportSvg()
  const blob = new Blob([result.svg], {
    type: 'image/svg+xml;charset=utf-8'
  })

  downloadBlob(blob, `${exportBaseName}-diagram.svg`)
}

const exportPng = async (scaleFactor: number) => {
  const result = buildExportSvg()
  const blob = new Blob([result.svg], {
    type: 'image/svg+xml;charset=utf-8'
  })
  const objectUrl = URL.createObjectURL(blob)

  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const nextImage = new Image()

      nextImage.onload = () => resolve(nextImage)
      nextImage.onerror = () => reject(new Error('Unable to render diagram export.'))
      nextImage.src = objectUrl
    })
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    if (!context) {
      throw new Error('Unable to create export canvas.')
    }

    canvas.width = Math.ceil(result.width * scaleFactor)
    canvas.height = Math.ceil(result.height * scaleFactor)
    context.setTransform(scaleFactor, 0, 0, scaleFactor, 0, 0)
    context.drawImage(image, 0, 0, result.width, result.height)

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((output) => {
        if (!output) {
          reject(new Error('Unable to encode PNG export.'))
          return
        }

        resolve(output)
      }, 'image/png')
    })

    downloadBlob(pngBlob, `${exportBaseName}-diagram.png`)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

const exportDiagram = async (format: 'svg' | 'png', scaleFactor = 1) => {
  if (format === 'svg') {
    await exportSvg()
    return
  }

  await exportPng(scaleFactor)
}

watch(
  () => model,
  () => {
    syncLayoutStates()
  },
  {
    deep: true,
    immediate: true
  }
)

watch(
  () => [
    compareEntries,
    isCompareDiagramActive.value,
    selectedCompareEntryId.value
  ],
  () => {
    syncLayoutStates()
  },
  {
    deep: true
  }
)

watch(
  () => [groupNodes.value, tableCards.value, selectedTableId.value],
  () => {
    computeConnectionLines()
  },
  {
    deep: true,
    immediate: true
  }
)

watch(
  () => activePanelTab.value,
  async (nextTab) => {
    emit('panelTabChange', nextTab)

    if (nextTab === 'compare') {
      syncComparePreviewTarget()
      return
    }

    if (nextTab === 'entities') {
      await nextTick()
      entitySearchInputRef.value?.focus()
    }
  }
)

watch(
  () => mobilePanelTab,
  (nextPanelTab) => {
    if (nextPanelTab && nextPanelTab !== activePanelTab.value) {
      activePanelTab.value = nextPanelTab
    }
  },
  {
    immediate: true
  }
)

watch(
  () => selectedSelection.value,
  () => {
    computeConnectionLines()
  },
  {
    deep: true
  }
)

watch(
  () => [selectedDetailEditorKey.value, sourceText],
  () => {
    isEditingDetailSource.value = false
    syncDetailPopoverEditorSource()
  },
  {
    immediate: true
  }
)

watch(
  () => canEditSelectedDetailSource.value,
  (canEdit) => {
    if (!canEdit) {
      isEditingDetailSource.value = false
    }
  },
  {
    immediate: true
  }
)

watch(
  () => selectedDiagramCompareEntryIds.value,
  (nextEntryIds) => {
    if (activePanelTab.value !== 'compare' || nextEntryIds.length === 0) {
      return
    }

    if (selectedCompareEntryId.value && nextEntryIds.includes(selectedCompareEntryId.value)) {
      return
    }

    selectedCompareEntryId.value = nextEntryIds[0] || null
  },
  {
    immediate: true
  }
)

watch(
  () => versionCompareTargetId,
  () => {
    if (activePanelTab.value !== 'compare') {
      return
    }

    syncComparePreviewTarget()
  }
)

watch(
  () => compareEntries,
  (nextEntries) => {
    if (nextEntries.some(entry => entry.id === selectedCompareEntryId.value)) {
      return
    }

    selectedCompareEntryId.value = nextEntries[0]?.id || null
  },
  {
    deep: true,
    immediate: true
  }
)

watch(
  () => shouldShowDetailPopover.value,
  async (shouldShow) => {
    if (!shouldShow) {
      detailPopoverSize.value = {
        height: 0,
        width: 0
      }
      return
    }

    await nextTick()
    syncViewportSize()
    syncDetailPopoverSize()
  }
)

watch(
  () => [
    connectionLines.value.length,
    tableCards.value.length,
    groupNodes.value.length,
    objectNodes.value.length,
    worldBounds.value.maxX,
    worldBounds.value.maxY
  ],
  () => {
    if (!import.meta.client) {
      return
    }

    ;(window as Window & {
      __pgmlSceneDebug?: {
        connectionCount: number
        firstConnection: DiagramGpuConnectionLine | null
        groupCount: number
        groupCards: Array<{ height: number, id: string, width: number, x: number, y: number }>
        objectCount: number
        objectCards: Array<{ height: number, id: string, width: number, x: number, y: number }>
        selectedSelection: DiagramGpuSelection | null
        tableCards: Array<{
          headerHeight: number
          height: number
          id: string
          rows: Array<{
            attachmentId?: string
            columnName?: string
            kind: DiagramGpuRow['kind']
            key: string
          }>
          width: number
          x: number
          y: number
        }>
        tableCount: number
        worldBounds: DiagramGpuWorldBounds
      }
    }).__pgmlSceneDebug = {
      connectionCount: connectionLines.value.length,
      firstConnection: connectionLines.value[0] || null,
      groupCount: groupNodes.value.length,
      groupCards: groupNodes.value.map((node) => {
        return {
          height: node.height,
          id: node.id,
          width: node.width,
          x: node.x,
          y: node.y
        }
      }),
      objectCount: objectNodes.value.length,
      objectCards: objectNodes.value.map((node) => {
        return {
          height: node.height,
          id: node.id,
          width: node.width,
          x: node.x,
          y: node.y
        }
      }),
      selectedSelection: selectedSelection.value,
      tableCards: tableCards.value.map((card) => {
        return {
          headerHeight: card.headerHeight,
          height: card.height,
          id: card.id,
          rows: card.rows.map((row) => {
            return {
              attachmentId: row.attachmentId,
              columnName: row.columnName,
              key: row.key,
              kind: row.kind
            }
          }),
          width: card.width,
          x: card.x,
          y: card.y
        }
      }),
      tableCount: tableCards.value.length,
      worldBounds: worldBounds.value
    }
  },
  {
    deep: true,
    immediate: true
  }
)

useResizeObserver(viewportRef, syncViewportSize)
useResizeObserver(detailPopoverRef, syncDetailPopoverSize)

onBeforeUnmount(() => {
  routingWorker?.terminate()
  routingWorker = null
  pendingRoutingRequests.clear()
})

defineExpose<{
  exportDiagram: (format: 'svg' | 'png', scaleFactor?: number) => Promise<void>
  exportPng: (scaleFactor: number) => Promise<void>
  exportSvg: () => Promise<void>
  getNodeLayoutProperties: () => Record<string, PgmlNodeProperties>
}>({
  exportDiagram,
  exportPng,
  exportSvg,
  getNodeLayoutProperties
})
</script>

<template>
  <div
    ref="viewportRef"
    data-diagram-viewport="true"
    class="relative h-full min-h-0 overflow-hidden border"
    :style="diagramViewportStyle"
  >
    <PgmlDiagramGpuScene
      ref="sceneRef"
      :connections="connectionLines"
      :groups="groupNodes"
      :objects="objectNodes"
      :selection="selectedSelection"
      :show-relationship-lines="showRelationshipLines"
      :tables="tableCards"
      :viewport-inset-right="detailPopoverViewportInsetRight"
      :viewport-reset-key="viewportResetKey"
      :world-bounds="worldBounds"
      @focus-source="focusSourceRange"
      @move-end="handleSceneMoveEnd"
      @move-node="handleSceneMoveNode"
      @select="handleSceneSelect"
      @transform-change="handleSceneTransformChange"
      @toggle-object-collapsed="handleSceneToggleObjectCollapsed"
    />

    <div
      v-if="isCompareDiagramActive && compareGhostOverlays.length > 0"
      class="pointer-events-none absolute inset-0 z-[3]"
    >
      <button
        v-for="overlay in compareGhostOverlays"
        :key="overlay.entryId"
        type="button"
        :data-compare-ghost-entry="overlay.entryId"
        class="pointer-events-auto absolute grid content-between gap-2 border border-dashed bg-[color:var(--studio-input-bg)]/70 px-2 py-2 text-left backdrop-blur-sm"
        :style="getCompareGhostOverlayStyle(overlay)"
        @click="focusCompareEntry(overlay.entryId)"
      >
        <span class="font-mono text-[0.5rem] uppercase tracking-[0.08em]">
          Removed from target
        </span>
        <span class="text-[0.72rem] font-semibold leading-5">
          {{ overlay.label }}
        </span>
      </button>
    </div>

    <div
      v-if="shouldShowDetailPopover && selectedDetailPopover"
      :class="detailPopoverContainerClass"
      :style="detailPopoverContainerStyle"
    >
      <div
        ref="detailPopoverRef"
        data-diagram-detail-popover="true"
        :data-attachment-popover="selectedDetailPopover.kind === 'attachment' ? selectedDetailPopover.id : undefined"
        :data-object-popover="selectedDetailPopover.kind === 'object' ? selectedDetailPopover.id : undefined"
        class="pointer-events-auto grid w-full gap-3 border px-3 py-3"
        :style="floatingPanelStyle"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <span
              :class="detailPopoverKindBadgeClass"
              :style="getDetailPopoverBadgeStyle(selectedDetailPopover.color)"
            >
              {{ selectedDetailPopover.kindLabel }}
            </span>
            <h4 class="mt-2 break-words text-[0.82rem] font-semibold leading-5 text-[color:var(--studio-shell-text)]">
              {{ selectedDetailPopover.title }}
            </h4>
            <p
              v-if="selectedDetailPopover.subtitle"
              class="mt-1 break-words text-[0.68rem] leading-5 text-[color:var(--studio-shell-muted)]"
            >
              {{ selectedDetailPopover.subtitle }}
            </p>
          </div>

          <div class="flex shrink-0 items-start gap-2">
            <div
              v-if="selectedDetailPopover.flags.length"
              class="flex max-w-[9rem] flex-wrap justify-end gap-1"
            >
              <span
                v-for="flag in selectedDetailPopover.flags"
                :key="flag.key"
                :class="detailPopoverFlagBadgeClass"
                :style="getDetailPopoverFlagStyle(flag)"
              >
                {{ flag.label }}
              </span>
            </div>

            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              size="xs"
              :class="sidePanelCloseButtonClass"
              aria-label="Close detail popover"
              @click="closeDetailPopover"
            />
          </div>
        </div>

        <PgmlDetailPopoverSourceEditor
          v-if="isEditingDetailSource"
          v-model="detailPopoverEditorSource"
          :description="selectedDetailEditorSpec?.description"
          :language-mode="selectedDetailEditorSpec?.languageMode || 'pgml'"
          :original-value="selectedDetailEditorSpec?.source || ''"
          :title="selectedDetailEditorSpec?.title || 'Editing PGML block'"
        />

        <div
          v-else
          class="grid max-h-64 gap-1 overflow-auto border border-[color:var(--studio-rail)] bg-[color:var(--studio-input-bg)] px-2 py-2"
        >
          <p
            v-for="detail in selectedDetailPopover.details"
            :key="detail"
            data-detail-popover-detail="true"
            :class="detailPopoverDetailTextClass"
          >
            {{ detail }}
          </p>
        </div>

        <div
          v-if="selectedDetailPopover.sourceRange"
          class="flex flex-wrap gap-2"
        >
          <UButton
            v-if="canEditSelectedDetailSource && !isEditingDetailSource"
            data-detail-popover-edit-source="true"
            :label="detailPopoverEditButtonLabel"
            leading-icon="i-lucide-pencil-line"
            color="neutral"
            variant="outline"
            size="xs"
            :class="sidePanelActionButtonClass"
            @click="openDetailPopoverSourceEditor"
          />
          <UButton
            v-if="isEditingDetailSource"
            data-detail-popover-cancel-source="true"
            label="Cancel edit"
            leading-icon="i-lucide-rotate-ccw"
            color="neutral"
            variant="ghost"
            size="xs"
            :class="sidePanelActionButtonClass"
            @click="cancelDetailPopoverSourceEditor"
          />
          <UButton
            v-if="isEditingDetailSource"
            data-detail-popover-apply-source="true"
            :label="detailPopoverSourceHasChanges ? 'Apply changes' : 'Keep current block'"
            leading-icon="i-lucide-check"
            color="primary"
            variant="solid"
            size="xs"
            :class="sidePanelActionButtonClass"
            @click="applyDetailPopoverSourceEditor"
          />
          <UButton
            label="Focus source"
            leading-icon="i-lucide-braces"
            color="neutral"
            variant="outline"
            size="xs"
            :class="sidePanelActionButtonClass"
            @click="focusSourceRange(selectedDetailPopover.sourceRange)"
          />
        </div>
      </div>
    </div>

    <div
      v-if="shouldShowZoomToolbar"
      class="pointer-events-none absolute inset-x-0 bottom-3 z-[4] flex justify-center"
    >
      <div
        data-diagram-zoom-toolbar="true"
        class="pointer-events-auto flex items-center gap-1 border px-1 py-1"
        :style="floatingPanelStyle"
      >
        <UButton
          icon="i-lucide-zoom-out"
          aria-label="Zoom out"
          color="neutral"
          variant="ghost"
          size="xs"
          class="rounded-none text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
          @click="sceneRef?.zoomBy(-1)"
        />
        <div class="min-w-[52px] text-center font-mono text-[0.7rem] text-[color:var(--studio-shell-text)]">
          {{ Math.round(currentScale * 100) }}%
        </div>
        <UButton
          icon="i-lucide-zoom-in"
          aria-label="Zoom in"
          color="neutral"
          variant="ghost"
          size="xs"
          class="rounded-none text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
          @click="sceneRef?.zoomBy(1)"
        />
        <UButton
          data-diagram-fit-view="true"
          label="Fit view"
          color="neutral"
          variant="ghost"
          size="xs"
          class="rounded-none text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
          @click="sceneRef?.resetView()"
        />
        <button
          type="button"
          data-relationship-lines-toggle="true"
          :aria-pressed="showRelationshipLines"
          :class="getStudioStateButtonClass({
            emphasized: showRelationshipLines,
            extraClass: 'inline-flex items-center gap-1.5 text-[0.62rem]'
          })"
          @click="showRelationshipLines = !showRelationshipLines"
        >
          <UIcon
            :name="showRelationshipLines ? 'i-lucide-eye' : 'i-lucide-eye-off'"
            class="h-3.5 w-3.5"
          />
          Lines
        </button>
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
      class="pointer-events-none absolute right-3 top-3 z-[4] flex justify-end gap-2"
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

            <div class="flex shrink-0 items-start gap-1">
              <UButton
                v-if="activePanelTab === 'inspector' && selectedSelection"
                data-inspector-clear-selection="true"
                label="Clear"
                color="neutral"
                variant="ghost"
                size="xs"
                :class="sidePanelActionButtonClass"
                @click="closeDetailPopover"
              />

              <UButton
                v-if="activePanelTab === 'compare' && selectedCompareEntry"
                data-compare-clear-selection="true"
                label="Clear"
                color="neutral"
                variant="ghost"
                size="xs"
                :class="sidePanelActionButtonClass"
                @click="selectedCompareEntryId = null"
              />

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
              @click="emit('createTable', null)"
            />
            <UButton
              data-diagram-create-group="true"
              label="Add group"
              leading-icon="i-lucide-folder-plus"
              color="neutral"
              variant="outline"
              size="xs"
              :class="sidePanelActionButtonClass"
              @click="emit('createGroup')"
            />
          </div>
        </div>
      </div>

      <div class="grid grid-cols-5 border-b border-[color:var(--studio-divider)]">
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
          data-diagram-panel-tab="compare"
          :class="getStudioTabButtonClass({ active: activePanelTab === 'compare', withTrailingBorder: true })"
          @click="openComparator"
        >
          Compare
        </button>
        <button
          type="button"
          data-diagram-panel-tab="export"
          :class="getStudioTabButtonClass({ active: activePanelTab === 'export', withTrailingBorder: true })"
          @click="activePanelTab = 'export'"
        >
          Export
        </button>
        <button
          type="button"
          data-diagram-panel-tab="versions"
          :class="getStudioTabButtonClass({ active: activePanelTab === 'versions' })"
          @click="activePanelTab = 'versions'"
        >
          Versions
        </button>
      </div>

      <div
        v-if="activePanelTab === 'inspector'"
        data-studio-scrollable="true"
        class="grid content-start gap-3 overflow-auto px-3 py-3"
      >
        <div
          v-if="selectedGroup"
          class="grid gap-3"
        >
          <label class="grid gap-1">
            <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Group Label</span>
            <input
              :value="selectedGroup.title"
              type="text"
              :class="joinStudioClasses(studioCompactInputClass, 'select-text')"
              @input="updateGroupState(selectedGroup.id, { title: ($event.target as HTMLInputElement).value })"
            >
          </label>
          <label class="grid gap-1">
            <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Accent</span>
            <input
              :value="selectedGroup.color"
              type="color"
              :class="studioColorInputClass"
              @input="updateGroupState(selectedGroup.id, { color: ($event.target as HTMLInputElement).value })"
            >
          </label>
          <USwitch
            :model-value="selectedGroup.masonry"
            color="neutral"
            size="sm"
            label="Masonry"
            description="Pack grouped tables vertically to reduce whitespace."
            :ui="studioSwitchUi"
            @update:model-value="updateGroupState(selectedGroup.id, { masonry: Boolean($event) })"
          />
          <label class="grid gap-1">
            <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Table Width</span>
            <USelect
              :items="tableWidthScaleItems"
              :model-value="normalizePgmlTableWidthScale(selectedGroup.tableWidthScale)"
              value-key="value"
              label-key="label"
              color="neutral"
              variant="outline"
              size="sm"
              :ui="studioSelectUi"
              @update:model-value="updateGroupState(selectedGroup.id, { tableWidthScale: normalizePgmlTableWidthScale(Number($event)) })"
            />
          </label>
          <label class="grid gap-1">
            <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Table Columns · {{ selectedGroup.columnCount }}</span>
            <input
              :value="selectedGroup.columnCount"
              type="range"
              min="1"
              :max="Math.max(1, selectedGroup.tableCount)"
              class="w-full"
              @input="updateGroupState(selectedGroup.id, { columnCount: Number(($event.target as HTMLInputElement).value) })"
            >
          </label>
          <div class="flex flex-wrap gap-2">
            <UButton
              label="Add table"
              leading-icon="i-lucide-table-properties"
              color="neutral"
              variant="outline"
              size="xs"
              :class="sidePanelActionButtonClass"
              @click="emit('createTable', selectedGroup.title)"
            />
            <UButton
              label="Edit group"
              leading-icon="i-lucide-pencil-line"
              color="neutral"
              variant="outline"
              size="xs"
              :class="sidePanelActionButtonClass"
              @click="emit('editGroup', selectedGroup.title)"
            />
            <UButton
              v-if="groupSourceRangeById[selectedGroup.id]"
              label="Focus source"
              leading-icon="i-lucide-braces"
              color="neutral"
              variant="outline"
              size="xs"
              :class="sidePanelActionButtonClass"
              @click="focusSourceRange(groupSourceRangeById[selectedGroup.id])"
            />
          </div>
        </div>

        <div
          v-else-if="selectedColumn"
          class="grid gap-2"
        >
          <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
            Column
          </div>
          <div class="text-[0.82rem] font-semibold text-[color:var(--studio-shell-text)]">
            {{ selectedColumn.column.name }}
          </div>
          <div class="text-[0.68rem] text-[color:var(--studio-shell-muted)]">
            {{ selectedColumn.table.fullName }}
          </div>
          <div class="rounded-none border border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)] px-3 py-2 text-[0.7rem] text-[color:var(--studio-shell-muted)]">
            <div>Type: {{ selectedColumn.column.type }}</div>
            <div v-if="selectedColumn.column.modifiers.length">Modifiers: {{ selectedColumn.column.modifiers.join(', ') }}</div>
            <div v-if="selectedColumn.column.note">Note: {{ selectedColumn.column.note }}</div>
          </div>
          <UButton
            v-if="selectedTable?.sourceRange"
            label="Focus table source"
            leading-icon="i-lucide-braces"
            color="neutral"
            variant="outline"
            size="xs"
            :class="sidePanelActionButtonClass"
            @click="focusSourceRange(selectedTable.sourceRange)"
          />
        </div>

        <div
          v-else-if="selectedAttachment"
          class="grid gap-2"
        >
          <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
            {{ selectedAttachment.kind }}
          </div>
          <div class="text-[0.82rem] font-semibold text-[color:var(--studio-shell-text)]">
            {{ selectedAttachment.title }}
          </div>
          <div class="text-[0.68rem] text-[color:var(--studio-shell-muted)]">
            {{ selectedAttachment.subtitle }}
          </div>
          <div class="rounded-none border border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)] px-3 py-2 text-[0.7rem] leading-6 text-[color:var(--studio-shell-muted)]">
            <div
              v-for="detail in selectedAttachment.details"
              :key="detail"
            >
              {{ detail }}
            </div>
          </div>
          <UButton
            v-if="selectedAttachment.sourceRange"
            label="Focus source"
            leading-icon="i-lucide-braces"
            color="neutral"
            variant="outline"
            size="xs"
            :class="sidePanelActionButtonClass"
            @click="focusSourceRange(selectedAttachment.sourceRange)"
          />
        </div>

        <div
          v-else-if="selectedTable"
          class="grid gap-3"
        >
          <div class="grid gap-1">
            <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Table</span>
            <div class="text-[0.82rem] font-semibold text-[color:var(--studio-shell-text)]">
              {{ selectedTable.title }}
            </div>
            <div class="text-[0.68rem] text-[color:var(--studio-shell-muted)]">
              {{ selectedTable.schema }} schema · {{ selectedTable.rows.length }} rows
            </div>
          </div>
          <label
            v-if="!selectedTable.groupId"
            class="grid gap-1"
          >
            <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Accent</span>
            <input
              :value="selectedTable.color"
              type="color"
              :class="studioColorInputClass"
              @input="updateTableState(selectedTable.id, { color: ($event.target as HTMLInputElement).value })"
            >
          </label>
          <div class="flex flex-wrap gap-2">
            <UButton
              label="Edit table"
              leading-icon="i-lucide-pencil-line"
              color="neutral"
              variant="outline"
              size="xs"
              :class="sidePanelActionButtonClass"
              @click="emit('editTable', selectedTable.id)"
            />
            <UButton
              v-if="selectedTable.sourceRange"
              label="Focus source"
              leading-icon="i-lucide-braces"
              color="neutral"
              variant="outline"
              size="xs"
              :class="sidePanelActionButtonClass"
              @click="focusSourceRange(selectedTable.sourceRange)"
            />
          </div>
        </div>

        <div
          v-else-if="selectedObject"
          class="grid gap-2"
        >
          <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
            {{ selectedObject.kindLabel }}
          </div>
          <div class="text-[0.82rem] font-semibold text-[color:var(--studio-shell-text)]">
            {{ selectedObject.title }}
          </div>
          <div class="text-[0.68rem] text-[color:var(--studio-shell-muted)]">
            {{ selectedObject.subtitle }}
          </div>
          <div class="rounded-none border border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)] px-3 py-2 text-[0.7rem] leading-6 text-[color:var(--studio-shell-muted)]">
            <div
              v-for="detail in selectedObject.details"
              :key="detail"
            >
              {{ detail }}
            </div>
          </div>
          <UButton
            v-if="selectedObject.sourceRange"
            label="Focus source"
            leading-icon="i-lucide-braces"
            color="neutral"
            variant="outline"
            size="xs"
            :class="sidePanelActionButtonClass"
            @click="focusSourceRange(selectedObject.sourceRange)"
          />
        </div>

        <div
          v-else
          data-inspector-overview="true"
          class="grid gap-3 rounded-none border border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)] px-3 py-3 text-[0.7rem] leading-6 text-[color:var(--studio-shell-muted)]"
        >
          <div class="grid gap-1">
            <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
              Schema overview
            </div>
            <p>
              Click a group, table, column, attachment, or object to inspect it.
            </p>
          </div>

          <div class="grid grid-cols-2 gap-2">
            <div
              v-for="stat in inspectorOverviewStats"
              :key="stat.key"
              class="grid gap-1 border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-2 py-2"
            >
              <span class="font-mono text-[0.54rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
                {{ stat.label }}
              </span>
              <span
                :data-inspector-overview-value="stat.key"
                class="text-[0.84rem] font-semibold leading-5 text-[color:var(--studio-shell-text)]"
              >
                {{ stat.value }}
              </span>
            </div>
          </div>

          <div
            v-if="hiddenEntityCount > 0"
            class="border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-3 py-2 text-[0.66rem] leading-5"
          >
            {{ hiddenEntityCount }} entities are hidden by saved properties.
          </div>

          <div class="flex flex-wrap gap-2">
            <UButton
              data-inspector-overview-action="entities"
              label="Browse entities"
              leading-icon="i-lucide-list-tree"
              color="neutral"
              variant="outline"
              size="xs"
              :class="sidePanelActionButtonClass"
              @click="activePanelTab = 'entities'"
            />
            <UButton
              data-inspector-overview-action="fit"
              label="Fit diagram"
              leading-icon="i-lucide-scan-search"
              color="neutral"
              variant="outline"
              size="xs"
              :class="sidePanelActionButtonClass"
              @click="sceneRef?.resetView()"
            />
          </div>
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
              ref="entitySearchInputRef"
              v-model="entitySearchQuery"
              data-entity-search="true"
              type="text"
              placeholder="Groups, tables, routines..."
              :class="studioCompactInputClass"
              @keydown.esc.prevent="clearEntitySearch"
            >
          </label>
          <div class="flex items-center justify-between gap-3 text-[0.62rem] text-[color:var(--studio-shell-muted)]">
            <span>
              {{ normalizedEntitySearchQuery ? `${filteredEntityResultCount} matches` : `${filteredEntityResultCount} visible rows` }}
            </span>
            <div class="flex items-center gap-2">
              <span>{{ hiddenEntityCount }} hidden</span>
              <button
                v-if="hiddenEntityCount > 0"
                type="button"
                data-entity-restore-visibility="true"
                class="border px-2 py-1 font-mono text-[0.54rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-text)] transition-colors duration-150 hover:bg-[color:var(--studio-surface-hover)]"
                @click="restoreAllEntityVisibility"
              >
                Show all
              </button>
              <button
                v-if="normalizedEntitySearchQuery"
                type="button"
                data-entity-search-clear="true"
                class="border px-2 py-1 font-mono text-[0.54rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-text)] transition-colors duration-150 hover:bg-[color:var(--studio-surface-hover)]"
                @click="clearEntitySearch"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        <div
          data-diagram-panel-scroll="true"
          data-studio-scrollable="true"
          class="grid content-start gap-2 overflow-auto overflow-x-hidden px-3 py-3"
          @wheel.stop
        >
          <div
            v-if="filteredGroupedBrowserItems.length"
            data-entity-section-label="grouped"
            class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]"
          >
            Grouped Tables · {{ filteredGroupedBrowserItems.length }} groups
          </div>

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
              <div :class="browserItemRowGridClass">
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
                  <div class="break-words text-[0.64rem] text-[color:var(--studio-shell-muted)]">
                    {{ groupItem.subtitle }}
                  </div>
                </button>

                <div :class="browserItemActionRailClass">
                  <button
                    v-if="groupItem.sourceRange"
                    type="button"
                    :data-browser-focus-source="groupItem.id"
                    :class="browserItemActionButtonClass"
                    :aria-label="getBrowserItemFocusSourceLabel(groupItem)"
                    :title="getBrowserItemFocusSourceLabel(groupItem)"
                    @click="focusBrowserItemSource(groupItem)"
                  >
                    <UIcon
                      name="i-lucide-braces"
                      class="h-3.5 w-3.5"
                    />
                  </button>

                  <button
                    type="button"
                    :data-browser-group-edit="groupItem.label"
                    :class="browserItemActionButtonClass"
                    :aria-label="getBrowserGroupEditLabel(groupItem)"
                    :title="getBrowserGroupEditLabel(groupItem)"
                    @click="emit('editGroup', groupItem.label)"
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
                  <div :class="browserItemRowGridClass">
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

                    <div :class="browserItemActionRailClass">
                      <button
                        v-if="tableItem.sourceRange"
                        type="button"
                        :data-browser-focus-source="tableItem.id"
                        :class="browserItemActionButtonClass"
                        :aria-label="getBrowserItemFocusSourceLabel(tableItem)"
                        :title="getBrowserItemFocusSourceLabel(tableItem)"
                        @click="focusBrowserItemSource(tableItem)"
                      >
                        <UIcon
                          name="i-lucide-braces"
                          class="h-3.5 w-3.5"
                        />
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
                        'grid border-l border-[color:var(--studio-divider)] pl-3 py-0.5',
                        browserItemCompactRowGridClass,
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

                      <div :class="browserItemCompactActionRailClass">
                        <button
                          v-if="childItem.sourceRange"
                          type="button"
                          :data-browser-focus-source="childItem.id"
                          :class="browserItemCompactActionButtonClass"
                          :aria-label="getBrowserItemFocusSourceLabel(childItem)"
                          :title="getBrowserItemFocusSourceLabel(childItem)"
                          @click="focusBrowserItemSource(childItem)"
                        >
                          <UIcon
                            name="i-lucide-braces"
                            class="h-3.5 w-3.5"
                          />
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
          </div>

          <div
            v-if="filteredUngroupedBrowserItems.length"
            class="grid content-start gap-1"
          >
            <div
              data-entity-section-label="ungrouped"
              class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]"
            >
              Ungrouped Tables · {{ filteredUngroupedBrowserItems.length }}
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
              <div :class="browserItemRowGridClass">
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

                <div :class="browserItemActionRailClass">
                  <button
                    v-if="tableItem.sourceRange"
                    type="button"
                    :data-browser-focus-source="tableItem.id"
                    :class="browserItemActionButtonClass"
                    :aria-label="getBrowserItemFocusSourceLabel(tableItem)"
                    :title="getBrowserItemFocusSourceLabel(tableItem)"
                    @click="focusBrowserItemSource(tableItem)"
                  >
                    <UIcon
                      name="i-lucide-braces"
                      class="h-3.5 w-3.5"
                    />
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
                    'grid border-l border-[color:var(--studio-divider)] pl-3 py-0.5',
                    browserItemCompactRowGridClass,
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

                  <div :class="browserItemCompactActionRailClass">
                    <button
                      v-if="childItem.sourceRange"
                      type="button"
                      :data-browser-focus-source="childItem.id"
                      :class="browserItemCompactActionButtonClass"
                      :aria-label="getBrowserItemFocusSourceLabel(childItem)"
                      :title="getBrowserItemFocusSourceLabel(childItem)"
                      @click="focusBrowserItemSource(childItem)"
                    >
                      <UIcon
                        name="i-lucide-braces"
                        class="h-3.5 w-3.5"
                      />
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
          </div>

          <div
            v-if="filteredStandaloneBrowserItems.length"
            class="grid content-start gap-1"
          >
            <div
              data-entity-section-label="standalone"
              class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]"
            >
              Standalone Objects · {{ filteredStandaloneBrowserItems.length }}
            </div>

            <div
              v-for="item in filteredStandaloneBrowserItems"
              :key="item.id"
              :data-browser-entity-row="item.id"
              :data-browser-search-match="isBrowserItemSearchMatch(item) ? 'true' : undefined"
              :style="getBrowserItemSearchMatchStyle(item)"
              :class="[
                'grid border px-2 py-2 transition-colors duration-150',
                browserItemRowGridClass,
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
                  class="break-words text-[0.72rem] font-medium leading-5"
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

              <div :class="browserItemActionRailClass">
                <button
                  v-if="item.sourceRange"
                  type="button"
                  :data-browser-focus-source="item.id"
                  :class="browserItemActionButtonClass"
                  :aria-label="getBrowserItemFocusSourceLabel(item)"
                  :title="getBrowserItemFocusSourceLabel(item)"
                  @click="focusBrowserItemSource(item)"
                >
                  <UIcon
                    name="i-lucide-braces"
                    class="h-3.5 w-3.5"
                  />
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
          </div>

          <div
            v-if="!filteredGroupedBrowserItems.length && !filteredUngroupedBrowserItems.length && !filteredStandaloneBrowserItems.length"
            class="grid gap-3 border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-3 py-3 text-[0.68rem] leading-6 text-[color:var(--studio-shell-muted)]"
          >
            <p>No entities match the current search.</p>

            <div class="flex flex-wrap gap-2">
              <button
                v-if="normalizedEntitySearchQuery"
                type="button"
                data-entity-search-empty-clear="true"
                class="border px-2 py-1 font-mono text-[0.54rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-text)] transition-colors duration-150 hover:bg-[color:var(--studio-surface-hover)]"
                @click="clearEntitySearch"
              >
                Clear search
              </button>

              <button
                v-if="hiddenEntityCount > 0"
                type="button"
                data-entity-search-empty-restore="true"
                class="border px-2 py-1 font-mono text-[0.54rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-text)] transition-colors duration-150 hover:bg-[color:var(--studio-surface-hover)]"
                @click="restoreAllEntityVisibility"
              >
                Show all entities
              </button>
            </div>
          </div>
        </div>
      </div>

      <div
        v-else-if="activePanelTab === 'compare'"
        data-studio-scrollable="true"
        class="min-h-0 overflow-auto"
      >
        <PgmlDiagramComparePanel
          :base-label="compareBaseLabel"
          :entries="compareEntries"
          :relationship-summary="compareRelationshipSummary"
          :selected-diagram-context-ids="selectedDiagramCompareEntryIds"
          :selected-entry-id="selectedCompareEntryId"
          :target-label="compareTargetLabel"
          @focus-source="focusSourceRange"
          @focus-target="focusCompareEntry"
          @select-entry="selectedCompareEntryId = $event"
        />
      </div>

      <div
        v-else-if="activePanelTab === 'export'"
        data-studio-scrollable="true"
        class="grid content-start gap-3 overflow-auto px-3 py-3"
      >
        <div class="rounded-none border border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)] px-3 py-3 text-[0.7rem] leading-6 text-[color:var(--studio-shell-muted)]">
          Export the accelerated scene directly. The preview renderer keeps diagram export working while visual behavior is being reviewed.
        </div>
        <div class="grid grid-cols-2 gap-2">
          <UButton
            label="PNG 1x"
            color="neutral"
            variant="outline"
            size="sm"
            @click="exportPng(1)"
          />
          <UButton
            label="PNG 2x"
            color="neutral"
            variant="outline"
            size="sm"
            @click="exportPng(2)"
          />
          <UButton
            label="SVG"
            color="neutral"
            variant="outline"
            size="sm"
            class="col-span-2"
            @click="exportSvg"
          />
        </div>
      </div>

      <PgmlDiagramVersionsPanel
        v-else
        :compare-base-id="versionCompareBaseId"
        :can-create-checkpoint="canCreateCheckpoint"
        :compare-options="versionCompareOptions"
        :compare-relationship-summary="compareRelationshipSummary"
        :compare-target-id="versionCompareTargetId"
        :diff-sections="versionDiffSections"
        :layout-changed="layoutChanged"
        :latest-version-id="latestVersionId"
        :migration-file-name="migrationFileName"
        :migration-has-changes="migrationHasChanges"
        :migration-kysely="migrationKysely"
        :migration-kysely-file-name="migrationKyselyFileName"
        :migration-sql="migrationSql"
        :migration-warnings="migrationWarnings"
        :preview-target-id="previewTargetId"
        :versions="versionItems"
        :workspace-base-label="workspaceBaseLabel"
        :workspace-status="workspaceStatus"
        @create-checkpoint="emit('versionCheckpoint')"
        @import-dump="emit('versionImportDump')"
        @open-comparator="openComparator"
        @restore-version="emit('restoreVersion', $event)"
        @update:compare-base-id="emit('updateVersionCompareBaseId', $event)"
        @update:compare-target-id="emit('updateVersionCompareTargetId', $event)"
        @view-target="emit('viewVersionTarget', $event)"
      />
    </aside>
  </div>
</template>

<style scoped>
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
