<script setup lang="ts">
import { useResizeObserver } from '@vueuse/core'
import type { ComponentPublicInstance, CSSProperties, Ref } from 'vue'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { studioSelectUi, studioSwitchUi } from '~/constants/ui'
import PgmlDiagramConnectionCanvas from '~/components/pgml/PgmlDiagramConnectionCanvas.vue'
import PgmlDiagramComparePanel from '~/components/pgml/PgmlDiagramComparePanel.vue'
import PgmlDetailPopoverMetadataEditor from '~/components/pgml/PgmlDetailPopoverMetadataEditor.vue'
import PgmlDetailPopoverSourceEditor from '~/components/pgml/PgmlDetailPopoverSourceEditor.vue'
import PgmlDiagramGpuScene from '~/components/pgml/PgmlDiagramGpuScene.vue'
import PgmlDiagramMigrationsPanel from '~/components/pgml/PgmlDiagramMigrationsPanel.vue'
import PgmlDiagramTableRows from '~/components/pgml/PgmlDiagramTableRows.vue'
import PgmlDiagramVersionsPanel from '~/components/pgml/PgmlDiagramVersionsPanel.vue'
import {
  buildDiagramConnectionPreviewLayers,
  type DiagramNodeDragPreview
} from '~/utils/diagram-connection-preview'
import {
  getDiagramConnectionZIndex,
  getDiagramGroupBackgroundZIndex,
  getDiagramNodeZIndex
} from '~/utils/diagram-layering'
import {
  getDiagramRendererCapability,
  getDiagramRendererHelpText,
  getDiagramRendererStatusLabel,
  isDiagramRendererBackend,
  type DiagramRendererBackend,
  type DiagramRendererCapability
} from '~/utils/diagram-renderer'
import type {
  DiagramRoutingBackend,
  DiagramRoutingDescriptorInput,
  DiagramRoutingGeometryInput,
  DiagramRoutingMeasuredBounds,
  DiagramRoutingRequest
} from '~/utils/diagram-routing-contract'
import { buildOrthogonalMiddlePoints } from '~/utils/diagram-routing'
import { routeDiagramConnectionsWithWebgpu } from '~/utils/diagram-routing-webgpu'
import { routeDiagramConnectionsWithCpu } from '~/workers/diagram-routing.worker'
import {
  buildTableGroupMasonryLayout,
  type TableAttachment,
  type TableAttachmentFlag,
  type TableAttachmentKind,
  type TableRow
} from '~/utils/pgml-diagram-canvas'
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
  diagramObjectMinHeight,
  diagramPalette,
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
  PgmlColumn,
  PgmlCustomType,
  PgmlNodeProperties,
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
  replacePgmlConstraintDefinitionInBlock,
  replacePgmlConstraintExpressionInBlock,
  replacePgmlExecutableMetadataInBlock,
  replacePgmlExecutableSourceInBlock,
  replacePgmlIndexDefinitionInBlock,
  replacePgmlRoutineBodyInBlock,
  getSequenceAttachedTableIds
} from '~/utils/pgml'
import type { PgmlDetailPopoverMetadataDraft } from '~/utils/pgml-detail-popover-metadata'
import {
  clonePgmlDetailPopoverMetadataDraft,
  createPgmlDetailMetadataDraftFromConstraint,
  createPgmlDetailMetadataDraftFromIndex,
  createPgmlDetailMetadataDraftFromRoutine,
  createPgmlDetailMetadataDraftFromSequence,
  createPgmlDetailMetadataDraftFromTrigger
} from '~/utils/pgml-detail-popover-metadata'
import type { PgmlVersionMigrationStepBundle } from '~/utils/pgml-version-migration'
import { normalizeSvgPaint } from '~/utils/svg-paint'
import {
  diagramToolPanelTabIconByValue,
  diagramToolPanelTabLabelByValue,
  type DiagramPanelTab,
  type DiagramToolPanelTab,
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
  setConnectionDragPreview: (preview: ActiveConnectionDragPreview | null) => void
  setDragPreview: (preview: DiagramNodeDragPreview | null) => void
  zoomBy: (direction: 1 | -1) => void
}

type DiagramCanvasViewportTransform = {
  panX: number
  panY: number
  scale: number
}

type MeasuredBounds = DiagramRoutingMeasuredBounds

type RoutingWorkerGeometryInput = DiagramRoutingGeometryInput

type RoutingWorkerDescriptorInput = DiagramRoutingDescriptorInput

type RoutingWorkerResponse = {
  lines: DiagramGpuConnectionLine[]
  requestId: number
}

type RoutingGeometryRegistry = {
  columnGeometry: Map<string, RoutingWorkerGeometryInput>
  groupHeaderBands: Array<{
    bottom: number
    left: number
    right: number
    top: number
  }>
  objectGeometry: Map<string, RoutingWorkerGeometryInput>
  tableGeometry: Map<string, RoutingWorkerGeometryInput>
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

type DiagramViewItem = {
  label: string
  value: string
}

type DiagramViewSettings = {
  snapToGrid: boolean
  showExecutableObjects: boolean
  showRelationshipLines: boolean
  showTableFields: boolean
}

type DiagramRendererOption = {
  label: string
  value: DiagramRendererBackend
}

const diagramRendererPreferenceStorageKey = 'pgml-diagram-renderer-backend'
const getInitialRendererBackendPreference = (): DiagramRendererBackend => {
  if (!import.meta.client) {
    return 'auto'
  }

  const storedValue = window.localStorage.getItem(diagramRendererPreferenceStorageKey)

  if (!storedValue || !isDiagramRendererBackend(storedValue)) {
    return 'auto'
  }

  return storedValue
}

type DetailPopoverPlacement = {
  left: number
  top: number
  width: number
}

type ActiveConnectionDragPreview = DiagramNodeDragPreview

type PendingNodePositionOverride = {
  expiresAt: number
  kind: 'group' | 'object' | 'table'
  x: number
  y: number
}

type AutomationPlaneNode = {
  color: string
  height: number
  id: string
  kind: 'group'
  tableCount: number
  title: string
  width: number
  x: number
  y: number
  zIndex: number | string
} | {
  color: string
  height: number
  headerHeight: number
  id: string
  kind: 'table'
  rowCount: number
  schema: string
  title: string
  width: number
  x: number
  y: number
  zIndex: number | string
} | {
  collapsed: boolean
  color: string
  details: string[]
  height: number
  id: string
  impactTargets: DiagramGpuImpactTarget[]
  kind: 'object'
  kindLabel: string
  subtitle: string
  tableIds: string[]
  title: string
  width: number
  x: number
  y: number
  zIndex: number | string
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

type DetailPopoverMetadataEditorSpec = {
  description: string
  draft: PgmlDetailPopoverMetadataDraft
  title: string
  toReplacementText: (nextDraft: PgmlDetailPopoverMetadataDraft) => string | null
}

type VersionMigrationArtifactsProps = {
  // The shell owns the versions panel render branch, so naming the migration
  // prop bundle here keeps the contract readable despite the large prop list.
  migrationFileName?: string
  migrationHasChanges?: boolean
  migrationKysely?: string
  migrationKyselyFileName?: string
  migrationSql?: string
  migrationSteps?: PgmlVersionMigrationStepBundle[]
  migrationWarnings?: string[]
}

const {
  activeDiagramViewId = null,
  canCreateCheckpoint = true,
  canDeleteDiagramView = false,
  canEditDetailSource = false,
  compareBaseLabel = 'Base',
  compareBaseModel = null,
  compareEntries = [],
  compareRelationshipSummary = '',
  compareTargetLabel = 'Target',
  diagramViewItems = [],
  diagramViewSettings = null,
  exportBaseName = 'pgml-schema',
  exportPreferenceKey = 'name:pgml-schema',
  hasBlockingSourceErrors = false,
  mobileActiveView = null,
  mobilePanelTab = 'entities',
  mobileToolPanelTab = null,
  migrationFileName = 'pgml-version.migration.sql',
  migrationHasChanges = false,
  migrationKysely = '',
  migrationKyselyFileName = 'pgml-version.migration.ts',
  migrationSql = '',
  migrationSteps = [],
  migrationWarnings = [],
  model,
  previewTargetId = 'workspace',
  sourceText = '',
  versionCompareBaseId = null,
  versionCompareOptions = [],
  versionCompareTargetId = 'workspace',
  versionItems = [],
  workspaceBaseLabel = 'No base version yet',
  workspaceStatus = 'Draft is ready to checkpoint.',
  viewportResetKey = 0
} = defineProps<VersionMigrationArtifactsProps & {
  activeDiagramViewId?: string | null
  canCreateCheckpoint?: boolean
  canDeleteDiagramView?: boolean
  canEditDetailSource?: boolean
  compareBaseLabel?: string
  compareBaseModel?: PgmlSchemaModel | null
  compareEntries?: PgmlDiagramCompareEntry[]
  compareRelationshipSummary?: string
  compareTargetLabel?: string
  diagramViewItems?: DiagramViewItem[]
  diagramViewSettings?: DiagramViewSettings | null
  exportBaseName?: string
  exportPreferenceKey?: string
  hasBlockingSourceErrors?: boolean
  mobileActiveView?: StudioMobileCanvasView | null
  mobilePanelTab?: DiagramPanelTab | null
  mobileToolPanelTab?: DiagramToolPanelTab | null
  model: PgmlSchemaModel
  previewTargetId?: string
  sourceText?: string
  versionCompareBaseId?: string | null
  versionCompareOptions?: VersionCompareOption[]
  versionCompareTargetId?: string
  versionItems?: VersionPanelItem[]
  workspaceBaseLabel?: string
  workspaceStatus?: string
  viewportResetKey?: number
}>()

const emit = defineEmits<{
  createGroup: []
  createTable: [groupName: string | null]
  createDiagramView: []
  deleteDiagramView: []
  editGroup: [groupName: string]
  renameDiagramView: []
  editTable: [tableId: string]
  focusSource: [sourceRange: PgmlSourceRange]
  mobileCanvasViewChange: [view: StudioMobileCanvasView]
  nodePropertiesChange: [properties: Record<string, PgmlNodeProperties>]
  panelTabChange: [tab: DiagramPanelTab]
  toolPanelTabChange: [tab: DiagramToolPanelTab]
  toolPanelVisibilityChange: [payload: { open: boolean, tab: DiagramToolPanelTab }]
  replaceSourceRange: [payload: { nextText: string, sourceRange: PgmlSourceRange }]
  restoreVersion: [versionId: string]
  selectDiagramView: [viewId: string]
  updateDiagramViewSettings: [settings: Partial<DiagramViewSettings>]
  updateVersionCompareBaseId: [value: string | null]
  updateVersionCompareTargetId: [value: string]
  versionCheckpoint: []
  versionImportDbml: []
  versionImportDump: []
  viewVersionTarget: [targetId: string]
}>()

const sceneRef: Ref<DiagramCanvasExposed | null> = ref(null)
const planeRef: Ref<HTMLDivElement | null> = ref(null)
const viewportRef: Ref<HTMLDivElement | null> = ref(null)
const detailPopoverRef: Ref<HTMLDivElement | null> = ref(null)
const selectedSelection: Ref<DiagramGpuSelection | null> = ref(null)
const selectedCompareEntryId: Ref<string | null> = ref(null)
const isEditingDetailSource: Ref<boolean> = ref(false)
const isEditingDetailMetadata: Ref<boolean> = ref(false)
const detailPopoverEditorSource: Ref<string> = ref('')
const detailPopoverMetadataDraft: Ref<PgmlDetailPopoverMetadataDraft | null> = ref(null)
const activePanelTab: Ref<DiagramPanelTab> = ref('inspector')
const activeToolPanelTab: Ref<DiagramToolPanelTab> = ref('versions')
const isDesktopSidePanelOpen: Ref<boolean> = ref(true)
const isToolPanelOpen: Ref<boolean> = ref(false)
const showRelationshipLines: Ref<boolean> = ref(true)
const showExecutableObjects: Ref<boolean> = ref(true)
const showTableFields: Ref<boolean> = ref(true)
const shouldRenderSvgConnectionOverlay: Ref<boolean> = ref(false)
const shouldPreferMainThreadConnectionRouting: Ref<boolean> = ref(false)
const snapToGrid: Ref<boolean> = ref(true)
const rendererBackend: Ref<DiagramRendererBackend> = ref(getInitialRendererBackendPreference())
const rendererCapability: Ref<DiagramRendererCapability> = ref(getDiagramRendererCapability({
  hasWebGPU: false,
  isSecureContext: false,
  requested: rendererBackend.value
}))
const currentScale: Ref<number> = ref(1)
const sceneTransform: Ref<DiagramCanvasViewportTransform> = ref({
  panX: 0,
  panY: 0,
  scale: 1
})
const activeRoutingBackend: Ref<DiagramRoutingBackend> = ref('cpu')
const shouldRenderAutomationPlane: Ref<boolean> = ref(false)
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
const routedConnectionLines: Ref<DiagramGpuConnectionLine[]> = ref([])
const liveConnectionPreviewLines: Ref<DiagramGpuConnectionLine[]> = ref([])
const activeConnectionDragPreview: Ref<ActiveConnectionDragPreview | null> = ref(null)
const pendingNodePositionOverrides: Ref<Record<string, PendingNodePositionOverride>> = ref({})
const groupLayoutStates: Ref<Record<string, DiagramGpuGroupNode>> = ref({})
const floatingTableStates: Ref<Record<string, DiagramGpuNodeLayoutState>> = ref({})
const objectLayoutStates: Ref<Record<string, DiagramGpuObjectNode>> = ref({})
const diagramPendingNodePositionOverrideTtlMs = 5000

let automationPlaneDragSession: {
  element: HTMLElement
  id: string
  kind: 'group' | 'object' | 'table'
  lastDragX: number
  lastDragY: number
  originClientX: number
  originClientY: number
  originX: number
  originY: number
  pointerId: number
  started: boolean
} | null = null
let activeAutomationNodeDragPreview: DiagramNodeDragPreview | null = null
let liveSceneConnectionDragPreview: ActiveConnectionDragPreview | null = null
let pendingLiveConnectionPreviewRequest: { preview: DiagramNodeDragPreview, version: number } | null = null
let liveConnectionPreviewRequestInFlight = false
let routingWorker: Worker | null = null
let latestConnectionRequestId = 0
let latestPreviewRoutingRequestId = 0
let liveConnectionPreviewVersion = 0
const automationPlaneNodeElements = new Map<string, HTMLElement>()
const pendingRoutingRequests = new Map<number, {
  reject: (reason?: unknown) => void
  resolve: (lines: DiagramGpuConnectionLine[]) => void
}>()
const rendererBackendItems: DiagramRendererOption[] = [
  {
    label: 'Auto',
    value: 'auto'
  },
  {
    label: 'WebGL',
    value: 'webgl'
  },
  {
    label: 'Force WebGPU',
    value: 'webgpu'
  }
]

const panelToggleButtonClass = joinStudioClasses(studioButtonClasses.secondary, studioToolbarButtonClass)
const toolPanelToggleButtonClass = joinStudioClasses(studioButtonClasses.secondary, studioToolbarButtonClass)
const sidePanelActionButtonClass = joinStudioClasses(studioButtonClasses.secondary, studioToolbarButtonClass)
const sidePanelCloseButtonClass = joinStudioClasses(studioButtonClasses.iconGhost, 'h-7 w-7 justify-center px-0')
const exportPanelButtonClass = joinStudioClasses(
  studioButtonClasses.secondary,
  'justify-center font-mono text-[0.62rem] uppercase tracking-[0.08em]'
)
const attachmentPopoverContent = {
  align: 'start' as const,
  collisionPadding: 16,
  side: 'right' as const,
  sideOffset: 10
}
const attachmentPopoverUi = {
  content: 'w-[22rem] rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] p-3 shadow-[var(--studio-floating-shadow)] backdrop-blur-sm'
}
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
const diagramViewToolbarSelectClass = 'w-[10.75rem]'
const diagramViewToolbarButtonClass = getStudioStateButtonClass({
  extraClass: 'inline-flex h-7 w-7 items-center justify-center px-0'
})
const selectedCanvasStackZIndex = 2147483644
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
  'Function': '#c084fc',
  'Procedure': '#f97316',
  'Sequence': '#eab308',
  'Trigger': '#22c55e'
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

const restoreRendererBackendPreference = () => {
  if (!import.meta.client) {
    return
  }

  const storedValue = window.localStorage.getItem(diagramRendererPreferenceStorageKey)

  if (!storedValue || !isDiagramRendererBackend(storedValue)) {
    return
  }

  rendererBackend.value = storedValue
}

const persistRendererBackendPreference = (nextValue: DiagramRendererBackend) => {
  if (!import.meta.client) {
    return
  }

  window.localStorage.setItem(diagramRendererPreferenceStorageKey, nextValue)
}

const handleRendererBackendModelUpdate = (nextValue: string | number | undefined) => {
  if (typeof nextValue !== 'string' || !isDiagramRendererBackend(nextValue)) {
    return
  }

  rendererBackend.value = nextValue
}

const handleRendererCapabilityChange = (nextCapability: DiagramRendererCapability) => {
  rendererCapability.value = nextCapability
}

const isMobileCanvasShell = computed(() => mobileActiveView !== null)
const isMobilePanelView = computed(() => mobileActiveView === 'panel')
const isMobileToolPanelView = computed(() => mobileActiveView === 'tool-panel')
const isMobileSurfaceView = computed(() => {
  return isMobilePanelView.value || isMobileToolPanelView.value
})
const previewableObjectKindLabels = new Set(['Function', 'Procedure', 'Sequence', 'Trigger'])
const isDiagramPanelVisible = computed(() => {
  if (isMobileCanvasShell.value) {
    return isMobilePanelView.value
  }

  return isDesktopSidePanelOpen.value
})
const shouldShowDiagramPanelToggle = computed(() => !isMobileCanvasShell.value)
const shouldShowZoomToolbar = computed(() => !isMobileSurfaceView.value)
const rendererStatusText = computed(() => getDiagramRendererStatusLabel(rendererCapability.value))
const rendererHelpText = computed(() => getDiagramRendererHelpText(rendererCapability.value))
const rendererStatusClass = computed(() => {
  return rendererCapability.value.resolved === 'webgpu'
    ? 'text-[color:var(--studio-shell-text)]'
    : 'text-[color:var(--studio-shell-muted)]'
})
const rendererStatusTitle = computed(() => {
  return rendererHelpText.value || rendererStatusText.value
})

const normalizeReferenceValue = (value: string) => {
  return value.replaceAll('"', '').trim().toLowerCase()
}

const getMetadataValue = (metadata: Array<{ key: string, value: string }>, key: string) => {
  const normalizedKey = key.trim().toLowerCase()

  return metadata.find(entry => entry.key.trim().toLowerCase() === normalizedKey)?.value || null
}

const uniqueValues: <Value>(values: Value[]) => Value[] = (values) => {
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
          return detailColumns.map(columnName => ({
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
    ...matchedColumns.map(columnName => ({
      columnName,
      tableId
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

const executableAttachmentKinds = new Set<TableAttachmentKind>(['Function', 'Procedure', 'Sequence', 'Trigger'])

const isEntityDirectlyVisible = (id: string) => model.nodeProperties[id]?.visible !== false
const isExecutableObjectId = (id: string) => {
  return id.startsWith('function:')
    || id.startsWith('procedure:')
    || id.startsWith('sequence:')
    || id.startsWith('trigger:')
}
const isAttachmentGloballyVisible = (attachment: TableAttachment) => {
  return showExecutableObjects.value || !executableAttachmentKinds.has(attachment.kind)
}
const isColumnGloballyVisible = () => showTableFields.value

const resolveTableIds = (values: string[]) => {
  return uniqueValues(values.flatMap(value => resolveTableIdsFromValue(value)))
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
    const columnRows = isColumnGloballyVisible()
      ? table.columns.map((column) => {
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
      : []
    const attachmentRows = (tableAttachmentState.value.attachmentsByTableId[table.fullName] || [])
      .filter((attachment) => {
        return isAttachmentGloballyVisible(attachment) && isEntityDirectlyVisible(attachment.id)
      })
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

const automationTableRowsById = computed<Record<string, TableRow[]>>(() => {
  return model.tables.reduce<Record<string, TableRow[]>>((entries, table) => {
    const columnRows = isColumnGloballyVisible()
      ? table.columns.map((column) => {
          return {
            column,
            key: `${table.fullName}.${column.name}`,
            kind: 'column' as const,
            tableId: table.fullName
          }
        })
      : []
    const attachmentRows = (tableAttachmentState.value.attachmentsByTableId[table.fullName] || [])
      .filter(attachment => isAttachmentGloballyVisible(attachment))
      .map((attachment) => {
        return {
          attachment,
          key: attachment.id,
          kind: 'attachment' as const,
          tableId: table.fullName
        }
      })

    entries[table.fullName] = [...columnRows, ...attachmentRows]
    return entries
  }, {})
})

const getAutomationTableRows = (tableId: string) => automationTableRowsById.value[tableId] || []

const getColumnLabelAnchorKey = (tableId: string, columnName: string) => `${tableId}.${columnName}`.toLowerCase()
const getImpactAnchorKey = (nodeId: string, tableId: string) => `${nodeId}:${tableId}`.toLowerCase()

const buildBrowserTableItem = (table: PgmlSchemaModel['tables'][number]): EntityBrowserItem => {
  const columns = isColumnGloballyVisible()
    ? table.columns.map<EntityBrowserItem>((column) => {
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
    : []
  const attachments = (tableAttachmentState.value.attachmentsByTableId[table.fullName] || [])
    .filter(attachment => isAttachmentGloballyVisible(attachment))
    .map<EntityBrowserItem>((attachment) => {
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

    if (showExecutableObjects.value && !attachedObjectIds.has(id)) {
      pushNodeItem(id, routine.name, 'Function', routine.signature, routine.sourceRange)
    }
  })

  model.procedures.forEach((routine) => {
    const id = `procedure:${routine.name}`

    if (showExecutableObjects.value && !attachedObjectIds.has(id)) {
      pushNodeItem(id, routine.name, 'Procedure', routine.signature, routine.sourceRange)
    }
  })

  model.triggers.forEach((trigger) => {
    const id = `trigger:${trigger.name}`

    if (showExecutableObjects.value && !attachedObjectIds.has(id)) {
      pushNodeItem(id, trigger.name, 'Trigger', buildTriggerSubtitle(trigger), trigger.sourceRange)
    }
  })

  model.sequences.forEach((sequence) => {
    const id = `sequence:${sequence.name}`

    if (showExecutableObjects.value && !attachedObjectIds.has(id)) {
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
    const pendingPosition = getPendingNodePositionOverride(groupId, 'group')
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
      x: pendingPosition?.x ?? storedLayout?.x ?? previousState?.x ?? 120 + index * 420,
      y: pendingPosition?.y ?? storedLayout?.y ?? previousState?.y ?? 90 + (index % 2) * 120
    }
  })

  visibleStandaloneTables.value.forEach((table, index) => {
    const previousState = floatingTableStates.value[table.fullName]
    const storedLayout = model.nodeProperties[table.fullName]
    const pendingPosition = getPendingNodePositionOverride(table.fullName, 'table')
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
      x: pendingPosition?.x ?? storedLayout?.x ?? previousState?.x ?? 120 + (index % 3) * 300,
      y: pendingPosition?.y ?? storedLayout?.y ?? previousState?.y ?? 560 + Math.floor(index / 3) * 220
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
      .filter((entry) => {
        return showExecutableObjects.value
          && isEntityDirectlyVisible(`function:${entry.name}`)
          && !tableAttachmentState.value.attachedObjectIds.has(`function:${entry.name}`)
      })
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
      .filter((entry) => {
        return showExecutableObjects.value
          && isEntityDirectlyVisible(`procedure:${entry.name}`)
          && !tableAttachmentState.value.attachedObjectIds.has(`procedure:${entry.name}`)
      })
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
      .filter((entry) => {
        return showExecutableObjects.value
          && isEntityDirectlyVisible(`trigger:${entry.name}`)
          && !tableAttachmentState.value.attachedObjectIds.has(`trigger:${entry.name}`)
      })
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
      .filter((entry) => {
        return showExecutableObjects.value
          && isEntityDirectlyVisible(`sequence:${entry.name}`)
          && !tableAttachmentState.value.attachedObjectIds.has(`sequence:${entry.name}`)
      })
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
    ...model.customTypes.filter(entry => isEntityDirectlyVisible(`custom-type:${entry.kind}:${entry.name}`)).map((entry: PgmlCustomType) => {
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
    const pendingPosition = getPendingNodePositionOverride(item.id, 'object')
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
      x: pendingPosition?.x ?? storedLayout?.x ?? previousState?.x ?? anchorBaseX + (index % 2) * objectColumnGapX,
      y: pendingPosition?.y ?? storedLayout?.y ?? previousState?.y ?? 96 + Math.floor(index / 2) * objectRowGapY
    }
  })

  groupLayoutStates.value = nextGroupStates
  floatingTableStates.value = nextTableStates
  objectLayoutStates.value = nextObjectStates
  syncPendingNodePositionOverrides(nextGroupStates, nextTableStates, nextObjectStates)
}

const getPendingNodePositionOverride = (
  id: string,
  kind: 'group' | 'object' | 'table'
) => {
  const override = pendingNodePositionOverrides.value[id]

  if (!override || override.kind !== kind || override.expiresAt <= Date.now()) {
    return null
  }

  return override
}

const syncPendingNodePositionOverrides = (
  nextGroupStates: Record<string, DiagramGpuGroupNode>,
  nextTableStates: Record<string, DiagramGpuNodeLayoutState>,
  nextObjectStates: Record<string, DiagramGpuObjectNode>
) => {
  const nextOverrides = Object.entries(pendingNodePositionOverrides.value).reduce<Record<string, PendingNodePositionOverride>>((entries, [id, override]) => {
    if (override.expiresAt <= Date.now()) {
      return entries
    }

    const nextState = override.kind === 'group'
      ? nextGroupStates[id]
      : override.kind === 'table'
        ? nextTableStates[id]
        : nextObjectStates[id]

    if (!nextState) {
      return entries
    }

    const storedLayout = model.nodeProperties[id]

    if (storedLayout?.x === override.x && storedLayout?.y === override.y) {
      return entries
    }

    entries[id] = override

    return entries
  }, {})

  if (JSON.stringify(nextOverrides) === JSON.stringify(pendingNodePositionOverrides.value)) {
    return
  }

  pendingNodePositionOverrides.value = nextOverrides
}

const setPendingNodePositionOverride = (payload: { id: string, kind: 'group' | 'object' | 'table', x: number, y: number }) => {
  pendingNodePositionOverrides.value = {
    ...pendingNodePositionOverrides.value,
    [payload.id]: {
      expiresAt: Date.now() + diagramPendingNodePositionOverrideTtlMs,
      kind: payload.kind,
      x: payload.x,
      y: payload.y
    }
  }
}

const syncCompareHighlightStates = () => {
  const nextHighlights = compareNodeHighlightById.value

  groupLayoutStates.value = Object.fromEntries(Object.entries(groupLayoutStates.value).map(([id, group]) => {
    const highlight = nextHighlights[id] || null

    return [
      id,
      {
        ...group,
        compareHighlightActive: highlight?.active || false,
        compareHighlightColor: highlight?.color || null
      }
    ]
  }))
  floatingTableStates.value = Object.fromEntries(Object.entries(floatingTableStates.value).map(([id, table]) => {
    const highlight = nextHighlights[id] || null

    return [
      id,
      {
        ...table,
        compareHighlightActive: highlight?.active || false,
        compareHighlightColor: highlight?.color || null
      }
    ]
  }))
  objectLayoutStates.value = Object.fromEntries(Object.entries(objectLayoutStates.value).map(([id, objectNode]) => {
    const highlight = nextHighlights[id] || null

    return [
      id,
      {
        ...objectNode,
        compareHighlightActive: highlight?.active || false,
        compareHighlightColor: highlight?.color || null
      }
    ]
  }))
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

const getColumnAnchorKey = (tableId: string, columnName: string) => `${tableId}.${columnName}`

const automationPlaneWidth = computed(() => {
  return Math.max(2600, Math.ceil(worldBounds.value.maxX + 400))
})

const automationPlaneHeight = computed(() => {
  return Math.max(1800, Math.ceil(worldBounds.value.maxY + 400))
})

const automationPlaneStyle = computed<CSSProperties>(() => {
  return {
    '--pgml-plane-pan-x': `${Math.round(sceneTransform.value.panX)}px`,
    '--pgml-plane-pan-y': `${Math.round(sceneTransform.value.panY)}px`,
    '--pgml-plane-scale': String(sceneTransform.value.scale),
    'height': `${automationPlaneHeight.value}px`,
    'transform': `translate(var(--pgml-plane-pan-x), var(--pgml-plane-pan-y)) scale(var(--pgml-plane-scale))`,
    'transformOrigin': '0 0',
    'width': `${automationPlaneWidth.value}px`
  }
})

const groupNodeOrderById = computed(() => {
  return groupNodes.value.reduce<Record<string, number>>((entries, group, index) => {
    entries[group.id] = index + 1
    return entries
  }, {})
})

const selectedStackTargetId = computed(() => {
  const selection = selectedSelection.value

  if (!selection) {
    return null
  }

  if (selection.kind === 'group') {
    return selection.id
  }

  if (selection.kind === 'object') {
    return selection.id
  }

  const table = tableCards.value.find((entry) => {
    return entry.id === selection.tableId
  })

  return table?.groupId || selection.tableId
})

const getGroupNodeLayerOrder = (groupId: string) => {
  return groupNodeOrderById.value[groupId] || 1
}

const getAutomationNodeZIndex = (nodeId: string, kind: 'group' | 'object' | 'table') => {
  if (selectedStackTargetId.value === nodeId) {
    return selectedCanvasStackZIndex
  }

  if (kind === 'group') {
    return 'auto'
  }

  return getDiagramNodeZIndex(getGroupNodeLayerOrder(nodeId))
}

const automationPlaneNodes = computed<AutomationPlaneNode[]>(() => {
  return [
    ...groupNodes.value.map((group) => {
      return {
        color: group.color,
        height: group.height,
        id: group.id,
        kind: 'group' as const,
        tableCount: group.tableCount,
        title: group.title,
        width: group.width,
        x: group.x,
        y: group.y,
        zIndex: getAutomationNodeZIndex(group.id, 'group')
      }
    }),
    ...tableCards.value
      .filter(card => !card.groupId)
      .map((card) => {
        return {
          color: card.color,
          height: card.height,
          headerHeight: card.headerHeight,
          id: card.id,
          kind: 'table' as const,
          rowCount: card.rows.length,
          schema: card.schema,
          title: card.title,
          width: card.width,
          x: card.x,
          y: card.y,
          zIndex: getAutomationNodeZIndex(card.id, 'table')
        }
      }),
    ...objectNodes.value.map((node) => {
      return {
        collapsed: node.collapsed,
        color: node.color,
        details: node.details,
        height: node.height,
        id: node.id,
        impactTargets: node.impactTargets,
        kind: 'object' as const,
        kindLabel: node.kindLabel,
        subtitle: node.subtitle,
        tableIds: node.tableIds,
        title: node.title,
        width: node.width,
        x: node.x,
        y: node.y,
        zIndex: getAutomationNodeZIndex(node.id, 'object')
      }
    })
  ]
})

const setAutomationNodeElement = (
  nodeId: string,
  element: Element | ComponentPublicInstance | null
) => {
  if (element instanceof HTMLElement) {
    automationPlaneNodeElements.set(nodeId, element)
    return
  }

  automationPlaneNodeElements.delete(nodeId)
}

const clearAutomationNodeDragElement = (preview: DiagramNodeDragPreview | null) => {
  if (!preview) {
    return
  }

  const element = automationPlaneNodeElements.get(preview.id)

  if (!element) {
    return
  }

  element.style.removeProperty('transform')
  element.style.removeProperty('will-change')
}

const applyAutomationNodeDragPreview = (preview: DiagramNodeDragPreview | null) => {
  if (
    activeAutomationNodeDragPreview
    && (
      !preview
      || activeAutomationNodeDragPreview.id !== preview.id
      || activeAutomationNodeDragPreview.kind !== preview.kind
    )
  ) {
    clearAutomationNodeDragElement(activeAutomationNodeDragPreview)
  }

  activeAutomationNodeDragPreview = preview

  if (!preview) {
    return
  }

  const element = automationPlaneNodeElements.get(preview.id)

  if (!element) {
    return
  }

  element.style.transform = `translate3d(${Math.round(preview.deltaX)}px, ${Math.round(preview.deltaY)}px, 0)`
  element.style.willChange = 'transform'
}

const setSceneConnectionDragPreview = (preview: ActiveConnectionDragPreview | null) => {
  liveSceneConnectionDragPreview = preview
  sceneRef.value?.setConnectionDragPreview(preview)
}

const setSceneDragPreview = (preview: DiagramNodeDragPreview | null) => {
  sceneRef.value?.setDragPreview(preview)
}

const hasConnectionDragPreview = (preview: ActiveConnectionDragPreview | null) => {
  return Boolean(preview && (preview.deltaX !== 0 || preview.deltaY !== 0))
}

const resetLiveConnectionPreviewState = (options: {
  clearLines?: boolean
} = {}) => {
  liveConnectionPreviewVersion += 1
  pendingLiveConnectionPreviewRequest = null

  if (options.clearLines !== false) {
    liveConnectionPreviewLines.value = []
  }
}

const getAutomationGroupTables = (groupId: string) => {
  return tableCards.value.filter(card => card.groupId === groupId)
}

const getAutomationGroupContentStyle = (groupId: string): CSSProperties => {
  const group = groupLayoutStates.value[groupId]
  const tables = getAutomationGroupTables(groupId)

  if (!group || tables.length === 0) {
    return {
      height: '0px',
      position: 'relative',
      width: '0px'
    }
  }

  const contentWidth = Math.max(...tables.map((table) => {
    return table.x + table.width - (group.x + diagramGroupHorizontalPadding)
  }))
  const contentHeight = Math.max(...tables.map((table) => {
    return table.y + table.height - (group.y + diagramGroupHeaderBandHeight)
  }))

  return {
    height: `${Math.max(0, Math.round(contentHeight))}px`,
    position: 'relative',
    width: `${Math.max(0, Math.round(contentWidth))}px`
  }
}

const getAutomationGroupTableLayoutStyle = (groupId: string, tableId: string): CSSProperties => {
  const group = groupLayoutStates.value[groupId]
  const table = tableCards.value.find((entry) => {
    return entry.id === tableId && entry.groupId === groupId
  })

  if (!group || !table) {
    return {}
  }

  return {
    height: `${table.height}px`,
    left: `${Math.round(table.x - group.x - diagramGroupHorizontalPadding)}px`,
    position: 'absolute',
    top: `${Math.round(table.y - group.y - diagramGroupHeaderBandHeight)}px`,
    width: `${table.width}px`
  }
}

const selectAutomationGroup = (groupId: string) => {
  selectedSelection.value = {
    id: groupId,
    kind: 'group'
  }

  if (activePanelTab.value !== 'inspector') {
    activePanelTab.value = 'inspector'
  }
}

const handleAutomationTableClick = (tableId: string) => {
  selectedSelection.value = {
    kind: 'table',
    tableId
  }

  if (activePanelTab.value !== 'inspector') {
    activePanelTab.value = 'inspector'
  }
}

const handleAttachmentClick = (tableId: string, attachment: TableAttachment) => {
  selectedSelection.value = {
    attachmentId: attachment.id,
    kind: 'attachment',
    tableId
  }

  if (activePanelTab.value !== 'inspector') {
    activePanelTab.value = 'inspector'
  }
}

const handleAttachmentDoubleClick = (attachment: TableAttachment) => {
  focusSourceRange(attachment.sourceRange)
}

const handleAutomationObjectClick = (objectId: string) => {
  selectedSelection.value = {
    id: objectId,
    kind: 'object'
  }

  if (activePanelTab.value !== 'inspector') {
    activePanelTab.value = 'inspector'
  }
}

const handleAutomationTableDoubleClick = (tableId: string) => {
  const table = model.tables.find((entry) => {
    return entry.fullName === tableId
  })

  focusSourceRange(table?.sourceRange)
}

const handleAutomationGroupDoubleClick = (groupId: string) => {
  focusSourceRange(groupSourceRangeById.value[groupId])
}

const handleAutomationObjectDoubleClick = (objectId: string) => {
  const objectNode = objectLayoutStates.value[objectId]

  focusSourceRange(objectNode?.sourceRange)
}

const shouldStartAutomationPlaneGroupDrag = (
  event: PointerEvent,
  node: AutomationPlaneNode
) => {
  if (node.kind !== 'group' || !(event.target instanceof HTMLElement)) {
    return false
  }

  return !event.target.closest('[data-node-header]')
    && !event.target.closest('[data-table-anchor]')
    && !event.target.closest('[data-group-add-table]')
    && !event.target.closest('[data-group-edit-button]')
}

const handleAutomationPlaneGroupSurfacePointerDown = (
  event: PointerEvent,
  node: AutomationPlaneNode
) => {
  if (!shouldStartAutomationPlaneGroupDrag(event, node)) {
    return
  }

  startAutomationPlaneNodeDrag(event, node)
}

const shouldStartAutomationPlaneNodeSurfaceDrag = (
  event: PointerEvent,
  node: AutomationPlaneNode
) => {
  if (node.kind === 'group' || !(event.target instanceof HTMLElement)) {
    return false
  }

  return !event.target.closest('[data-node-header]')
    && !event.target.closest('[data-table-edit-button]')
    && !event.target.closest('[data-object-collapse-button]')
}

const handleAutomationPlaneNodeSurfacePointerDown = (
  event: PointerEvent,
  node: AutomationPlaneNode
) => {
  if (!shouldStartAutomationPlaneNodeSurfaceDrag(event, node)) {
    return
  }

  startAutomationPlaneNodeDrag(event, node)
}

const shouldStartAutomationPlaneGroupedTableDrag = (event: PointerEvent) => {
  if (!(event.target instanceof HTMLElement)) {
    return false
  }

  return !event.target.closest('[data-table-edit-button]')
}

const handleAutomationPlaneGroupedTablePointerDown = (
  event: PointerEvent,
  node: AutomationPlaneNode
) => {
  if (node.kind !== 'group' || !shouldStartAutomationPlaneGroupedTableDrag(event)) {
    return
  }

  startAutomationPlaneNodeDrag(event, node)
}

const startAutomationPlaneNodeDrag = (
  event: PointerEvent,
  node: AutomationPlaneNode
) => {
  if (!(event.currentTarget instanceof HTMLElement)) {
    return
  }

  if (node.kind === 'group') {
    selectAutomationGroup(node.id)
  } else if (node.kind === 'table') {
    handleAutomationTableClick(node.id)
  } else {
    handleAutomationObjectClick(node.id)
  }

  automationPlaneDragSession = {
    element: event.currentTarget,
    id: node.id,
    kind: node.kind,
    lastDragX: node.x,
    lastDragY: node.y,
    originClientX: event.clientX,
    originClientY: event.clientY,
    originX: node.x,
    originY: node.y,
    pointerId: event.pointerId,
    started: false
  }
  automationPlaneDragSession.element.setPointerCapture(event.pointerId)
}

const handleAutomationPlanePointerMove = (event: PointerEvent) => {
  if (!automationPlaneDragSession || automationPlaneDragSession.pointerId !== event.pointerId) {
    return
  }

  if (!(event.currentTarget instanceof HTMLElement) || event.currentTarget !== automationPlaneDragSession.element) {
    return
  }

  const deltaClientX = event.clientX - automationPlaneDragSession.originClientX
  const deltaClientY = event.clientY - automationPlaneDragSession.originClientY
  const deltaX = (event.clientX - automationPlaneDragSession.originClientX) / Math.max(sceneTransform.value.scale, 0.001)
  const deltaY = (event.clientY - automationPlaneDragSession.originClientY) / Math.max(sceneTransform.value.scale, 0.001)
  const movedEnoughToDrag = Math.abs(deltaClientX) > 4 || Math.abs(deltaClientY) > 4

  if (!automationPlaneDragSession.started && !movedEnoughToDrag) {
    return
  }

  automationPlaneDragSession.started = true
  automationPlaneDragSession.lastDragX = automationPlaneDragSession.originX + deltaX
  automationPlaneDragSession.lastDragY = automationPlaneDragSession.originY + deltaY
  handleSceneDragPreviewChange({
    id: automationPlaneDragSession.id,
    kind: automationPlaneDragSession.kind,
    x: automationPlaneDragSession.lastDragX,
    y: automationPlaneDragSession.lastDragY
  })
}

const handleAutomationPlanePointerUp = (event: PointerEvent) => {
  if (!automationPlaneDragSession || automationPlaneDragSession.pointerId !== event.pointerId) {
    return
  }

  if (!(event.currentTarget instanceof HTMLElement) || event.currentTarget !== automationPlaneDragSession.element) {
    return
  }

  if (automationPlaneDragSession.element.hasPointerCapture(event.pointerId)) {
    automationPlaneDragSession.element.releasePointerCapture(event.pointerId)
  }

  if (automationPlaneDragSession.started) {
    handleSceneMoveEnd({
      id: automationPlaneDragSession.id,
      kind: automationPlaneDragSession.kind,
      x: automationPlaneDragSession.lastDragX,
      y: automationPlaneDragSession.lastDragY
    })
  }

  automationPlaneDragSession = null
}

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

const tableGroupColorByTableId = computed(() => {
  return tableCards.value.reduce<Record<string, string>>((entries, card) => {
    entries[card.id] = card.color
    return entries
  }, {})
})

const getSelectionGlowStyle = (color: string) => {
  return {
    '--pgml-selection-color': color,
    '--pgml-selection-border': `color-mix(in srgb, ${color} 78%, white 22%)`,
    '--pgml-selection-shadow-near': `color-mix(in srgb, ${color} 48%, transparent)`,
    '--pgml-selection-shadow-far': `color-mix(in srgb, ${color} 24%, transparent)`
  }
}

const getNodeBorderColor = (color: string, kind: 'group' | 'object' | 'table') => {
  return kind === 'group'
    ? `color-mix(in srgb, ${color} 38%, var(--studio-node-border-neutral) 62%)`
    : `color-mix(in srgb, ${color} 62%, var(--studio-node-border-neutral) 38%)`
}

const getNodeBackground = (color: string, kind: 'group' | 'object' | 'table') => {
  if (kind === 'group') {
    return `linear-gradient(180deg, color-mix(in srgb, ${color} 12%, transparent), var(--studio-group-surface-soft) 22%), var(--studio-group-surface)`
  }

  if (kind === 'table') {
    return `color-mix(in srgb, ${color} 8%, var(--studio-table-surface) 92%)`
  }

  return `color-mix(in srgb, ${color} 8%, var(--studio-node-surface-bottom) 92%)`
}

const getNodeAccentColor = (color: string) => {
  return `color-mix(in srgb, ${color} 70%, var(--studio-node-accent-mix) 30%)`
}

const getSchemaBadgeStyle = (schemaName: string) => {
  const color = getDiagramSchemaBadgeColor(schemaName, model.schemas)

  return {
    backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} 58%, var(--studio-rail) 42%)`,
    color: `color-mix(in srgb, ${color} 72%, var(--studio-shell-text) 28%)`
  }
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
    backgroundColor: `color-mix(in srgb, ${attachment.color} 16%, transparent)`,
    borderColor: `color-mix(in srgb, ${attachment.color} 58%, var(--studio-rail) 42%)`,
    color: `color-mix(in srgb, ${attachment.color} 72%, var(--studio-shell-text) 28%)`
  }
}

const getAttachmentFlagStyle = (flag: TableAttachmentFlag) => {
  return {
    backgroundColor: `color-mix(in srgb, ${flag.color} 14%, transparent)`,
    borderColor: `color-mix(in srgb, ${flag.color} 56%, var(--studio-rail) 44%)`,
    color: `color-mix(in srgb, ${flag.color} 72%, var(--studio-shell-text) 28%)`
  }
}

const isGroupSelectionActive = (groupId: string) => {
  return selectedSelection.value?.kind === 'group' && selectedSelection.value.id === groupId
}

const isObjectSelectionActive = (objectId: string) => {
  return selectedSelection.value?.kind === 'object' && selectedSelection.value.id === objectId
}

const isTableSelectionActive = (tableId: string) => {
  return selectedSelection.value?.kind === 'table' && selectedSelection.value.tableId === tableId
}

const isColumnSelectionActive = (tableId: string, columnName: string) => {
  return (
    selectedSelection.value?.kind === 'column'
    && selectedSelection.value.tableId === tableId
    && selectedSelection.value.columnName === columnName
  )
}

const isAttachmentSelectionActive = (tableId: string, attachmentId: string) => {
  return (
    selectedSelection.value?.kind === 'attachment'
    && selectedSelection.value.tableId === tableId
    && selectedSelection.value.attachmentId === attachmentId
  )
}

const getRelationalRowHighlightColor = (tableId: string, columnName: string) => {
  if (isColumnSelectionActive(tableId, columnName)) {
    return tableGroupColorByTableId.value[tableId] || '#79e3ea'
  }

  const rowKey = getColumnAnchorKey(tableId, columnName)

  if (selectedTableRelationalRowKeys.value.has(rowKey)) {
    return tableGroupColorByTableId.value[selectedTableId.value || ''] || '#79e3ea'
  }

  if (selectedObjectImpactRowKeys.value.has(rowKey)) {
    return selectedSelection.value?.kind === 'object'
      ? (objectLayoutStates.value[selectedSelection.value.id]?.color || '#14b8a6')
      : '#14b8a6'
  }

  return null
}

const isHighlightedRelationalRow = (tableId: string, columnName: string) => {
  return getRelationalRowHighlightColor(tableId, columnName) !== null
}

const connectionStyleByKey = computed<Record<string, {
  animated: boolean
  color: string
  dashPattern: string
  dashed: boolean
  zIndex: number
}>>(() => {
  const entries: Record<string, {
    animated: boolean
    color: string
    dashPattern: string
    dashed: boolean
    zIndex: number
  }> = {}

  model.references.forEach((reference) => {
    const isSelectedOutgoingReference = selectedTableId.value !== null && reference.fromTable === selectedTableId.value
    const color = isSelectedOutgoingReference
      ? (tableColorById.value[reference.fromTable] || tableColorById.value[reference.toTable] || '#79e3ea')
      : (tableColorById.value[reference.toTable] || '#79e3ea')

    entries[`ref:${reference.fromTable}:${reference.fromColumn}:${reference.toTable}:${reference.toColumn}`] = {
      animated: isSelectedOutgoingReference,
      color,
      dashPattern: isSelectedOutgoingReference ? '10 7' : '0',
      dashed: isSelectedOutgoingReference,
      zIndex: getDiagramConnectionZIndex(0, 0, isSelectedOutgoingReference)
    }
  })

  objectNodes.value.forEach((node) => {
    const impactTargets = node.impactTargets.length > 0
      ? node.impactTargets
      : node.tableIds.map((tableId) => {
          return {
            columnName: null,
            tableId
          } satisfies DiagramGpuImpactTarget
        })

    impactTargets.forEach((impactTarget) => {
      const isSelectedObjectImpact = selectedSelection.value?.kind === 'object' && selectedSelection.value.id === node.id

      entries[`${node.id}->${impactTarget.tableId}:${impactTarget.columnName || '*'}`] = {
        animated: isSelectedObjectImpact,
        color: node.color,
        dashPattern: node.kindLabel === 'Custom Type' && !isSelectedObjectImpact ? '2 5' : '10 7',
        dashed: true,
        zIndex: getDiagramConnectionZIndex(0, 0, isSelectedObjectImpact)
      }
    })
  })

  return entries
})

const styledConnectionLines = computed(() => {
  return routedConnectionLines.value.map((line) => {
    const style = connectionStyleByKey.value[line.key]

    if (!style) {
      return line
    }

    return {
      ...line,
      animated: style.animated,
      color: style.color,
      dashPattern: style.dashPattern,
      dashed: style.dashed,
      zIndex: style.zIndex
    }
  })
})

const displayedConnectionLines = computed(() => {
  if (liveConnectionPreviewLines.value.length === 0) {
    return styledConnectionLines.value
  }

  const livePreviewLinesByKey = new Map(liveConnectionPreviewLines.value.map((line) => {
    return [line.key, applyConnectionStyle(line)]
  }))

  return styledConnectionLines.value.map((line) => {
    return livePreviewLinesByKey.get(line.key) || line
  })
})

const applyConnectionStyle = (line: DiagramGpuConnectionLine) => {
  const style = connectionStyleByKey.value[line.key]

  if (!style) {
    return line
  }

  return {
    ...line,
    animated: style.animated,
    color: style.color,
    dashPattern: style.dashPattern,
    dashed: style.dashed,
    zIndex: style.zIndex
  }
}

const buildConnectionPath = (line: DiagramGpuConnectionLine) => {
  return line.points.map((point, index) => {
    return `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
  }).join(' ')
}

const automationConnectionCanvasLayers = computed(() => {
  return buildDiagramConnectionPreviewLayers(
    displayedConnectionLines.value.map((styledLine) => {
      return {
        ...styledLine,
        path: buildConnectionPath(styledLine)
      }
    }),
    activeConnectionDragPreview.value
  )
})

const svgConnectionOverlayTransform = computed(() => {
  const transform = sceneTransform.value

  return `translate(${transform.panX} ${transform.panY}) scale(${transform.scale})`
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

const getElementOffsetWithinPlane = (element: HTMLElement) => {
  if (!(planeRef.value instanceof HTMLElement)) {
    return null
  }

  let current: HTMLElement | null = element
  let x = 0
  let y = 0

  while (current && current !== planeRef.value) {
    x += current.offsetLeft
    y += current.offsetTop
    current = current.offsetParent instanceof HTMLElement ? current.offsetParent : null
  }

  if (current !== planeRef.value) {
    return null
  }

  return { x, y }
}

const getAutomationPlaneMeasuredBounds = (selector: string) => {
  if (!(planeRef.value instanceof HTMLElement)) {
    return null
  }

  const element = planeRef.value.querySelector(selector)

  if (!(element instanceof HTMLElement)) {
    return null
  }

  const offset = getElementOffsetWithinPlane(element)

  if (!offset) {
    return null
  }

  return createBounds(offset.x, offset.y, element.offsetWidth, element.offsetHeight)
}

const getEstimatedColumnLabelBounds = (rowBounds: MeasuredBounds) => {
  const topInset = Math.min(3, Math.max(rowBounds.height - 1, 0))
  const height = Math.max(1, Math.min(13, rowBounds.height - topInset))

  return createBounds(rowBounds.left, rowBounds.top + topInset, rowBounds.width, height)
}

const getColumnRoutingBounds = (tableId: string, columnName: string, rowBounds: MeasuredBounds) => {
  const measuredLabelBounds = getAutomationPlaneMeasuredBounds(
    `[data-column-label-anchor="${getColumnLabelAnchorKey(tableId, columnName)}"]`
  )

  if (measuredLabelBounds) {
    return measuredLabelBounds
  }

  return getEstimatedColumnLabelBounds(rowBounds)
}

const isComparePanelActive = computed(() => {
  return isToolPanelOpen.value && activeToolPanelTab.value === 'compare'
})
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
    return entry.targetNodeIds.includes(selection.id) || entry.baseNodeIds.includes(selection.id)
  }

  if (selection.kind === 'table') {
    return entry.targetNodeIds.includes(selection.tableId) || entry.baseNodeIds.includes(selection.tableId)
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

const openToolPanel = (tab: DiagramToolPanelTab) => {
  activeToolPanelTab.value = tab
  isToolPanelOpen.value = true
  emit('toolPanelTabChange', tab)

  if (isMobileCanvasShell.value) {
    emit('mobileCanvasViewChange', 'tool-panel')
  }

  if (tab === 'compare') {
    syncComparePreviewTarget()
  }
}

const closeToolPanel = () => {
  isToolPanelOpen.value = false

  if (isMobileToolPanelView.value) {
    emit('mobileCanvasViewChange', 'diagram')
  }
}

const toggleToolPanel = (tab: DiagramToolPanelTab) => {
  if (isToolPanelOpen.value && activeToolPanelTab.value === tab) {
    closeToolPanel()
    return
  }

  openToolPanel(tab)
}

const openComparator = () => {
  openToolPanel('compare')
}

const openVersionsPanel = () => {
  openToolPanel('versions')
}

const openMigrationsPanel = () => {
  openToolPanel('migrations')
}

watch(
  () => [isToolPanelOpen.value, activeToolPanelTab.value] as const,
  ([open, tab]) => {
    emit('toolPanelVisibilityChange', {
      open,
      tab
    })
  },
  {
    immediate: true
  }
)

const focusCompareEntry = (entryId: string) => {
  const entry = compareEntryById.value.get(entryId)

  if (!entry) {
    return
  }

  openToolPanel('compare')
  selectedCompareEntryId.value = entryId

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
  const groupHeaderBands = groupNodes.value.map((group) => {
    return {
      bottom: group.y + diagramGroupHeaderBandHeight,
      left: group.x,
      right: group.x + group.width,
      top: group.y
    }
  })

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

      const labelBounds = getColumnRoutingBounds(card.id, row.columnName, rowBounds)

      columnGeometry.set(getColumnAnchorKey(card.id, row.columnName), {
        bounds: labelBounds,
        groupNodeId: card.groupId,
        identity: `${card.id}:${row.columnName}`,
        isColumnAnchor: false,
        isColumnLabelAnchor: true,
        locator: {
          attribute: 'data-column-label-anchor',
          value: getColumnLabelAnchorKey(card.id, row.columnName)
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

const translateMeasuredBounds = (
  bounds: DiagramRoutingMeasuredBounds,
  deltaX: number,
  deltaY: number
): DiagramRoutingMeasuredBounds => {
  return {
    ...bounds,
    bottom: bounds.bottom + deltaY,
    left: bounds.left + deltaX,
    right: bounds.right + deltaX,
    top: bounds.top + deltaY
  }
}

const translateRoutingGeometry = (
  geometry: RoutingWorkerGeometryInput,
  deltaX: number,
  deltaY: number
): RoutingWorkerGeometryInput => {
  return {
    ...geometry,
    bounds: translateMeasuredBounds(geometry.bounds, deltaX, deltaY),
    tableBounds: geometry.tableBounds
      ? translateMeasuredBounds(geometry.tableBounds, deltaX, deltaY)
      : null
  }
}

const buildPreviewRoutingGeometryRegistry = (
  preview: DiagramNodeDragPreview | null
): RoutingGeometryRegistry => {
  const baseGeometry = geometryRegistry.value

  if (!preview || !hasConnectionDragPreview(preview)) {
    return baseGeometry
  }

  const nextColumnGeometry = new Map(baseGeometry.columnGeometry)
  const nextObjectGeometry = new Map(baseGeometry.objectGeometry)
  const nextTableGeometry = new Map(baseGeometry.tableGeometry)
  const deltaX = preview.deltaX
  const deltaY = preview.deltaY

  if (preview.kind === 'group') {
    tableCards.value.forEach((card) => {
      if (card.groupId !== preview.id) {
        return
      }

      const tableGeometry = baseGeometry.tableGeometry.get(card.id)

      if (tableGeometry) {
        nextTableGeometry.set(card.id, translateRoutingGeometry(tableGeometry, deltaX, deltaY))
      }

      card.rows.forEach((row) => {
        if (row.kind !== 'column' || !row.columnName) {
          return
        }

        const key = getColumnAnchorKey(card.id, row.columnName)
        const columnGeometry = baseGeometry.columnGeometry.get(key)

        if (columnGeometry) {
          nextColumnGeometry.set(key, translateRoutingGeometry(columnGeometry, deltaX, deltaY))
        }
      })
    })
  } else if (preview.kind === 'table') {
    const tableGeometry = baseGeometry.tableGeometry.get(preview.id)

    if (tableGeometry) {
      nextTableGeometry.set(preview.id, translateRoutingGeometry(tableGeometry, deltaX, deltaY))
    }

    const tableCard = tableCards.value.find((card) => {
      return card.id === preview.id
    })

    tableCard?.rows.forEach((row) => {
      if (row.kind !== 'column' || !row.columnName) {
        return
      }

      const key = getColumnAnchorKey(preview.id, row.columnName)
      const columnGeometry = baseGeometry.columnGeometry.get(key)

      if (columnGeometry) {
        nextColumnGeometry.set(key, translateRoutingGeometry(columnGeometry, deltaX, deltaY))
      }
    })
  } else {
    const objectGeometry = baseGeometry.objectGeometry.get(preview.id)

    if (objectGeometry) {
      nextObjectGeometry.set(preview.id, translateRoutingGeometry(objectGeometry, deltaX, deltaY))
    }
  }

  return {
    columnGeometry: nextColumnGeometry,
    groupHeaderBands: groupNodes.value.map((group) => {
      const offsetX = preview.kind === 'group' && group.id === preview.id ? deltaX : 0
      const offsetY = preview.kind === 'group' && group.id === preview.id ? deltaY : 0

      return {
        bottom: group.y + offsetY + diagramGroupHeaderBandHeight,
        left: group.x + offsetX,
        right: group.x + offsetX + group.width,
        top: group.y + offsetY
      }
    }),
    objectGeometry: nextObjectGeometry,
    tableGeometry: nextTableGeometry
  }
}

const buildConnectionRoutingDescriptors = (
  routingGeometry: RoutingGeometryRegistry,
  ownerNodeId: string | null = null
) => {
  const descriptors: RoutingWorkerDescriptorInput[] = []
  const getReferenceTargetGeometry = (
    tableId: string,
    columnName: string | null
  ) => {
    if (!columnName) {
      return routingGeometry.tableGeometry.get(tableId) || null
    }

    return routingGeometry.columnGeometry.get(getColumnAnchorKey(tableId, columnName))
      || routingGeometry.tableGeometry.get(tableId)
      || null
  }

  model.references.forEach((reference) => {
    const fromGeometry = getReferenceTargetGeometry(reference.fromTable, reference.fromColumn)
    const toGeometry = getReferenceTargetGeometry(reference.toTable, reference.toColumn)

    if (!fromGeometry || !toGeometry) {
      return
    }

    if (
      ownerNodeId
      && fromGeometry.ownerNodeId !== ownerNodeId
      && toGeometry.ownerNodeId !== ownerNodeId
    ) {
      return
    }

    descriptors.push({
      animated: false,
      color: '#79e3ea',
      dashPattern: '0',
      dashed: false,
      fromGeometry,
      key: `ref:${reference.fromTable}:${reference.fromColumn}:${reference.toTable}:${reference.toColumn}`,
      selectedForeground: false,
      toGeometry
    })
  })

  objectNodes.value.forEach((node) => {
    const fromGeometry = routingGeometry.objectGeometry.get(node.id)
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
      const toGeometry = getReferenceTargetGeometry(impactTarget.tableId, impactTarget.columnName)

      if (!toGeometry) {
        return
      }

      if (
        ownerNodeId
        && fromGeometry.ownerNodeId !== ownerNodeId
        && toGeometry.ownerNodeId !== ownerNodeId
      ) {
        return
      }

      descriptors.push({
        animated: false,
        color: node.color,
        dashPattern: '10 7',
        dashed: true,
        fromGeometry,
        key: `${node.id}->${impactTarget.tableId}:${impactTarget.columnName || '*'}`,
        selectedForeground: false,
        toGeometry
      })
    })
  })

  return descriptors
}

const buildConnectionRoutingRequest = (
  descriptors: RoutingWorkerDescriptorInput[],
  requestId: number,
  preview: DiagramNodeDragPreview | null = null,
  routingGeometry: RoutingGeometryRegistry = geometryRegistry.value
): DiagramRoutingRequest => {
  return {
    descriptors,
    groupGeometries: groupNodes.value.map((group) => {
      const offsetX = preview?.kind === 'group' && group.id === preview.id ? preview.deltaX : 0
      const offsetY = preview?.kind === 'group' && group.id === preview.id ? preview.deltaY : 0

      return {
        bounds: createBounds(group.x + offsetX, group.y + offsetY, group.width, group.height),
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
    groupHeaderBands: routingGeometry.groupHeaderBands,
    nodeOrders: nodeOrderById.value,
    planeBounds: createBounds(0, 0, Math.max(worldBounds.value.maxX + 200, 1), Math.max(worldBounds.value.maxY + 200, 1)),
    requestId,
    scale: 1
  }
}

const getRoutingBoundsCenterX = (bounds: DiagramRoutingMeasuredBounds) => {
  return bounds.left + bounds.width / 2
}

const getRoutingBoundsCenterY = (bounds: DiagramRoutingMeasuredBounds) => {
  return bounds.top + bounds.height / 2
}

const clampRoutingCoordinate = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value))
}

const getFallbackAnchorSide = (
  fromGeometry: RoutingWorkerGeometryInput,
  toGeometry: RoutingWorkerGeometryInput
) => {
  const deltaX = getRoutingBoundsCenterX(toGeometry.bounds) - getRoutingBoundsCenterX(fromGeometry.bounds)
  const deltaY = getRoutingBoundsCenterY(toGeometry.bounds) - getRoutingBoundsCenterY(fromGeometry.bounds)

  if (Math.abs(deltaX) >= Math.abs(deltaY) * 0.75) {
    return deltaX >= 0 ? 'right' : 'left'
  }

  return deltaY >= 0 ? 'bottom' : 'top'
}

const buildFallbackAnchorPoint = (
  geometry: RoutingWorkerGeometryInput,
  side: 'bottom' | 'left' | 'right' | 'top',
  targetGeometry: RoutingWorkerGeometryInput
) => {
  const hostBounds = geometry.tableBounds || geometry.bounds
  const geometryCenterX = getRoutingBoundsCenterX(geometry.bounds)
  const geometryCenterY = getRoutingBoundsCenterY(geometry.bounds)
  const targetCenterX = getRoutingBoundsCenterX(targetGeometry.bounds)
  const targetCenterY = getRoutingBoundsCenterY(targetGeometry.bounds)
  const safeLeft = hostBounds.left + 6
  const safeRight = hostBounds.right - 6
  const safeTop = hostBounds.top + 6
  const safeBottom = hostBounds.bottom - 6

  if (side === 'left') {
    return {
      x: hostBounds.left,
      y: clampRoutingCoordinate(
        geometry.isColumnLabelAnchor ? geometryCenterY : targetCenterY,
        safeTop,
        safeBottom
      )
    }
  }

  if (side === 'right') {
    return {
      x: hostBounds.right,
      y: clampRoutingCoordinate(
        geometry.isColumnLabelAnchor ? geometryCenterY : targetCenterY,
        safeTop,
        safeBottom
      )
    }
  }

  if (side === 'top') {
    return {
      x: clampRoutingCoordinate(
        geometry.isColumnLabelAnchor ? geometryCenterX : targetCenterX,
        safeLeft,
        safeRight
      ),
      y: hostBounds.top
    }
  }

  return {
    x: clampRoutingCoordinate(
      geometry.isColumnLabelAnchor ? geometryCenterX : targetCenterX,
      safeLeft,
      safeRight
    ),
    y: hostBounds.bottom
  }
}

const buildFallbackConnectionLineBounds = (points: Array<{ x: number, y: number }>) => {
  return {
    maxX: Math.max(...points.map(point => point.x)),
    maxY: Math.max(...points.map(point => point.y)),
    minX: Math.min(...points.map(point => point.x)),
    minY: Math.min(...points.map(point => point.y))
  }
}

const buildMainThreadFallbackConnectionLines = (
  request: DiagramRoutingRequest
) => {
  return request.descriptors.map((descriptor) => {
    const fromSide = getFallbackAnchorSide(descriptor.fromGeometry, descriptor.toGeometry)
    const toSide = getFallbackAnchorSide(descriptor.toGeometry, descriptor.fromGeometry)
    const fromPoint = buildFallbackAnchorPoint(descriptor.fromGeometry, fromSide, descriptor.toGeometry)
    const toPoint = buildFallbackAnchorPoint(descriptor.toGeometry, toSide, descriptor.fromGeometry)
    const middlePoints = buildOrthogonalMiddlePoints(fromPoint, fromSide, toPoint, toSide)
    const points = [fromPoint, ...middlePoints, toPoint]
    const fromOwnerNodeId = descriptor.fromGeometry.ownerNodeId
    const toOwnerNodeId = descriptor.toGeometry.ownerNodeId

    return {
      animated: descriptor.animated,
      bounds: buildFallbackConnectionLineBounds(points),
      color: descriptor.color,
      dashPattern: descriptor.dashPattern,
      dashed: descriptor.dashed,
      fromOwnerNodeId,
      key: descriptor.key,
      points,
      toOwnerNodeId,
      zIndex: getDiagramConnectionZIndex(
        request.nodeOrders[fromOwnerNodeId || ''] || 1,
        request.nodeOrders[toOwnerNodeId || ''] || 1,
        descriptor.selectedForeground
      )
    } satisfies DiagramGpuConnectionLine
  })
}

const tryComputeConnectionLinesWithWebgpu = async (
  request: DiagramRoutingRequest,
  _requestId: number
) => {
  if (shouldRenderAutomationPlane.value) {
    return null
  }

  const nextLines = await routeDiagramConnectionsWithWebgpu(request)

  return nextLines
}

const routeConnectionLinesWithWorker = async (
  request: DiagramRoutingRequest
) => {
  const worker = getRoutingWorker()

  return await new Promise<DiagramGpuConnectionLine[]>((resolve, reject) => {
    pendingRoutingRequests.set(request.requestId, {
      reject,
      resolve
    })
    worker.postMessage(request)
  })
}

const computeLiveConnectionPreviewLines = async (
  preview: DiagramNodeDragPreview
) => {
  const routingGeometry = buildPreviewRoutingGeometryRegistry(preview)
  const descriptors = buildConnectionRoutingDescriptors(routingGeometry, preview.nodeId)

  if (descriptors.length === 0) {
    return []
  }

  latestPreviewRoutingRequestId += 1
  const requestId = 1_000_000_000 + latestPreviewRoutingRequestId
  const routingRequest = buildConnectionRoutingRequest(descriptors, requestId, preview, routingGeometry)

  if (shouldPreferMainThreadConnectionRouting.value) {
    const lines = routeDiagramConnectionsWithCpu(routingRequest)

    return lines.length > 0 ? lines : buildMainThreadFallbackConnectionLines(routingRequest)
  }

  const webgpuLines = await tryComputeConnectionLinesWithWebgpu(routingRequest, requestId)

  if (webgpuLines && webgpuLines.length > 0) {
    return webgpuLines
  }

  try {
    const lines = await routeConnectionLinesWithWorker(routingRequest)

    return lines.length > 0 ? lines : buildMainThreadFallbackConnectionLines(routingRequest)
  } catch {
    return buildMainThreadFallbackConnectionLines(routingRequest)
  }
}

const flushLiveConnectionPreviewRequest = async () => {
  if (liveConnectionPreviewRequestInFlight || !pendingLiveConnectionPreviewRequest) {
    return
  }

  liveConnectionPreviewRequestInFlight = true
  const nextRequest = pendingLiveConnectionPreviewRequest

  pendingLiveConnectionPreviewRequest = null

  try {
    const nextLines = await computeLiveConnectionPreviewLines(nextRequest.preview)

    if (nextRequest.version === liveConnectionPreviewVersion) {
      liveConnectionPreviewLines.value = nextLines

      if (nextLines.length > 0) {
        activeConnectionDragPreview.value = null
        setSceneConnectionDragPreview(null)
      }
    }
  } finally {
    liveConnectionPreviewRequestInFlight = false

    if (pendingLiveConnectionPreviewRequest) {
      void flushLiveConnectionPreviewRequest()
    }
  }
}

const scheduleLiveConnectionPreview = (preview: DiagramNodeDragPreview) => {
  liveConnectionPreviewVersion += 1
  pendingLiveConnectionPreviewRequest = {
    preview,
    version: liveConnectionPreviewVersion
  }
  void flushLiveConnectionPreviewRequest()
}

const computeConnectionLines = async (options: {
  preserveDragPreviewUntilSettled?: boolean
} = {}) => {
  const currentConnectionDragPreview = hasConnectionDragPreview(liveSceneConnectionDragPreview)
    ? liveSceneConnectionDragPreview
    : activeConnectionDragPreview.value
  const preservedDragPreview = options.preserveDragPreviewUntilSettled
    ? currentConnectionDragPreview
    : null

  if (currentConnectionDragPreview && !options.preserveDragPreviewUntilSettled) {
    return
  }

  latestConnectionRequestId += 1
  const requestId = latestConnectionRequestId

  const clearPreservedDragPreview = () => {
    if (preservedDragPreview && liveSceneConnectionDragPreview === preservedDragPreview) {
      setSceneConnectionDragPreview(null)
    }

    if (preservedDragPreview && activeConnectionDragPreview.value === preservedDragPreview) {
      activeConnectionDragPreview.value = null
    }

    liveConnectionPreviewLines.value = []
  }

  const commitSettledLines = (nextLines: DiagramGpuConnectionLine[], backend: DiagramRoutingBackend) => {
    if (requestId !== latestConnectionRequestId) {
      return
    }

    activeRoutingBackend.value = backend
    routedConnectionLines.value = nextLines
    clearPreservedDragPreview()
  }

  const descriptors = buildConnectionRoutingDescriptors(geometryRegistry.value)

  if (descriptors.length === 0) {
    commitSettledLines([], 'cpu')
    return
  }

  const routingRequest = buildConnectionRoutingRequest(descriptors, requestId)

  if (shouldPreferMainThreadConnectionRouting.value) {
    const lines = routeDiagramConnectionsWithCpu(routingRequest)

    commitSettledLines(lines.length > 0 ? lines : buildMainThreadFallbackConnectionLines(routingRequest), 'cpu')
    return
  }

  const webgpuLines = await tryComputeConnectionLinesWithWebgpu(routingRequest, requestId)

  if (webgpuLines && webgpuLines.length > 0 && !options.preserveDragPreviewUntilSettled && requestId === latestConnectionRequestId) {
    activeRoutingBackend.value = 'webgpu'
    routedConnectionLines.value = webgpuLines
  }

  if (!webgpuLines || webgpuLines.length === 0) {
    activeRoutingBackend.value = 'cpu'
  }

  try {
    const lines = await routeConnectionLinesWithWorker(routingRequest)

    commitSettledLines(
      lines.length > 0 ? lines : buildMainThreadFallbackConnectionLines(routingRequest),
      'cpu'
    )
  } catch {
    commitSettledLines(buildMainThreadFallbackConnectionLines(routingRequest), 'cpu')
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
      value: routedConnectionLines.value.length
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

const getDraftListValues = (entries: Array<{ value: string }>) => {
  return entries
    .map(entry => entry.value.trim())
    .filter(entry => entry.length > 0)
}

const getDraftKeyValueEntries = (entries: Array<{ key: string, value: string }>) => {
  return entries
    .map((entry) => {
      return {
        key: entry.key.trim(),
        value: entry.value.trim()
      }
    })
    .filter(entry => entry.key.length > 0 && entry.value.length > 0)
}

const buildListLiteral = (values: string[]) => {
  return `[${values.join(', ')}]`
}

const parseCommaSeparatedValues = (value: string) => {
  return value
    .split(',')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)
}

const buildExecutableMetadataSectionsFromDraft = (draft: PgmlDetailPopoverMetadataDraft) => {
  const metadata: Array<{ key: string, value: string }> = []

  if (draft.kind === 'function' || draft.kind === 'procedure') {
    if (draft.known.language.trim().length > 0) {
      metadata.push({ key: 'language', value: draft.known.language.trim() })
    }

    if (draft.known.volatility.trim().length > 0) {
      metadata.push({ key: 'volatility', value: draft.known.volatility.trim() })
    }

    if (draft.known.security.trim().length > 0) {
      metadata.push({ key: 'security', value: draft.known.security.trim() })
    }
  }

  if (draft.kind === 'trigger') {
    if (draft.known.triggerTiming.trim().length > 0) {
      metadata.push({ key: 'timing', value: draft.known.triggerTiming.trim() })
    }

    const triggerEvents = getDraftListValues(draft.known.triggerEvents)

    if (triggerEvents.length > 0) {
      metadata.push({ key: 'events', value: buildListLiteral(triggerEvents) })
    }

    if (draft.known.triggerLevel.trim().length > 0) {
      metadata.push({ key: 'level', value: draft.known.triggerLevel.trim() })
    }

    if (draft.known.triggerFunction.trim().length > 0) {
      metadata.push({ key: 'function', value: draft.known.triggerFunction.trim() })
    }

    const triggerArguments = getDraftListValues(draft.known.triggerArguments)

    if (triggerArguments.length > 0) {
      metadata.push({ key: 'arguments', value: buildListLiteral(triggerArguments) })
    }
  }

  if (draft.kind === 'sequence') {
    if (draft.known.sequenceAs.trim().length > 0) {
      metadata.push({ key: 'as', value: draft.known.sequenceAs.trim() })
    }

    if (draft.known.sequenceStart.trim().length > 0) {
      metadata.push({ key: 'start', value: draft.known.sequenceStart.trim() })
    }

    if (draft.known.sequenceIncrement.trim().length > 0) {
      metadata.push({ key: 'increment', value: draft.known.sequenceIncrement.trim() })
    }

    if (draft.known.sequenceMin.trim().length > 0) {
      metadata.push({ key: 'min', value: draft.known.sequenceMin.trim() })
    }

    if (draft.known.sequenceMax.trim().length > 0) {
      metadata.push({ key: 'max', value: draft.known.sequenceMax.trim() })
    }

    if (draft.known.sequenceCache.trim().length > 0) {
      metadata.push({ key: 'cache', value: draft.known.sequenceCache.trim() })
    }

    if (draft.known.sequenceCycle === 'true' || draft.known.sequenceCycle === 'false') {
      metadata.push({ key: 'cycle', value: draft.known.sequenceCycle })
    }

    if (draft.known.sequenceOwnedBy.trim().length > 0) {
      metadata.push({ key: 'owned_by', value: draft.known.sequenceOwnedBy.trim() })
    }
  }

  metadata.push(...getDraftKeyValueEntries(draft.customMetadata))

  return {
    affects: {
      calls: getDraftListValues(draft.affects.calls),
      dependsOn: getDraftListValues(draft.affects.dependsOn),
      extras: draft.affects.extras
        .map((entry) => {
          return {
            key: entry.key.trim(),
            values: parseCommaSeparatedValues(entry.value)
          }
        })
        .filter(entry => entry.key.length > 0 && entry.values.length > 0),
      ownedBy: getDraftListValues(draft.affects.ownedBy),
      reads: getDraftListValues(draft.affects.reads),
      sets: getDraftListValues(draft.affects.sets),
      uses: getDraftListValues(draft.affects.uses),
      writes: getDraftListValues(draft.affects.writes)
    },
    docsEntries: getDraftKeyValueEntries(draft.docsEntries),
    docsSummary: draft.docsSummary.trim(),
    metadata
  }
}

const buildExecutableMetadataEditorSpec = (
  kindLabel: 'Function' | 'Procedure' | 'Sequence' | 'Trigger',
  draft: PgmlDetailPopoverMetadataDraft,
  blockSource: string
): DetailPopoverMetadataEditorSpec => {
  return {
    description: `Edit the ${kindLabel.toLowerCase()} metadata with dedicated controls for docs, affects, and supported settings before dropping down to raw PGML.`,
    draft,
    title: `Editing ${kindLabel} metadata`,
    toReplacementText: (nextDraft: PgmlDetailPopoverMetadataDraft) => {
      return replacePgmlExecutableMetadataInBlock(
        blockSource,
        buildExecutableMetadataSectionsFromDraft(nextDraft)
      )
    }
  }
}

const routineMetadataSelectItems = computed(() => {
  return [
    ...model.functions.map((routine) => {
      return {
        label: `Function · ${routine.name}`,
        value: routine.name
      }
    }),
    ...model.procedures.map((routine) => {
      return {
        label: `Procedure · ${routine.name}`,
        value: routine.name
      }
    })
  ]
})

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

const selectedDetailMetadataEditorSpec = computed<DetailPopoverMetadataEditorSpec | null>(() => {
  const detailPopover = selectedDetailPopover.value
  const blockSource = selectedDetailSourceSnippet.value

  if (!detailPopover?.sourceRange || blockSource.trim().length === 0) {
    return null
  }

  if (selectedAttachment.value?.kind === 'Index') {
    const table = model.tables.find(entry => entry.fullName === selectedAttachment.value?.tableId)
    const index = table?.indexes.find(entry => `index:${entry.name}` === selectedAttachment.value?.id)

    if (!index) {
      return null
    }

    return {
      description: 'Edit the index definition with structured fields for access method and indexed columns.',
      draft: createPgmlDetailMetadataDraftFromIndex(index),
      title: 'Editing Index metadata',
      toReplacementText: (nextDraft: PgmlDetailPopoverMetadataDraft) => {
        return replacePgmlIndexDefinitionInBlock(blockSource, {
          columns: getDraftListValues(nextDraft.known.indexColumns),
          name: index.name,
          type: nextDraft.known.indexType.trim() || index.type
        })
      }
    }
  }

  if (selectedAttachment.value?.kind === 'Constraint') {
    const table = model.tables.find(entry => entry.fullName === selectedAttachment.value?.tableId)
    const constraint = table?.constraints.find(entry => `constraint:${entry.name}` === selectedAttachment.value?.id)

    if (!constraint) {
      return null
    }

    return {
      description: 'Edit the constraint expression directly without digging through the surrounding table block.',
      draft: createPgmlDetailMetadataDraftFromConstraint(constraint),
      title: 'Editing Constraint metadata',
      toReplacementText: (nextDraft: PgmlDetailPopoverMetadataDraft) => {
        return replacePgmlConstraintDefinitionInBlock(blockSource, {
          expression: nextDraft.known.constraintExpression,
          name: constraint.name
        })
      }
    }
  }

  if (selectedAttachment.value?.kind === 'Function') {
    const routine = model.functions.find(entry => `function:${entry.name}` === selectedAttachment.value?.id)

    return routine
      ? buildExecutableMetadataEditorSpec(
          'Function',
          createPgmlDetailMetadataDraftFromRoutine('function', routine),
          blockSource
        )
      : null
  }

  if (selectedAttachment.value?.kind === 'Procedure') {
    const routine = model.procedures.find(entry => `procedure:${entry.name}` === selectedAttachment.value?.id)

    return routine
      ? buildExecutableMetadataEditorSpec(
          'Procedure',
          createPgmlDetailMetadataDraftFromRoutine('procedure', routine),
          blockSource
        )
      : null
  }

  if (selectedAttachment.value?.kind === 'Trigger') {
    const trigger = model.triggers.find(entry => `trigger:${entry.name}` === selectedAttachment.value?.id)

    return trigger
      ? buildExecutableMetadataEditorSpec(
          'Trigger',
          createPgmlDetailMetadataDraftFromTrigger(trigger),
          blockSource
        )
      : null
  }

  if (selectedAttachment.value?.kind === 'Sequence') {
    const sequence = model.sequences.find(entry => `sequence:${entry.name}` === selectedAttachment.value?.id)

    return sequence
      ? buildExecutableMetadataEditorSpec(
          'Sequence',
          createPgmlDetailMetadataDraftFromSequence(sequence),
          blockSource
        )
      : null
  }

  if (selectedObject.value?.kindLabel === 'Function') {
    const routine = model.functions.find(entry => `function:${entry.name}` === selectedObject.value?.id)

    return routine
      ? buildExecutableMetadataEditorSpec(
          'Function',
          createPgmlDetailMetadataDraftFromRoutine('function', routine),
          blockSource
        )
      : null
  }

  if (selectedObject.value?.kindLabel === 'Procedure') {
    const routine = model.procedures.find(entry => `procedure:${entry.name}` === selectedObject.value?.id)

    return routine
      ? buildExecutableMetadataEditorSpec(
          'Procedure',
          createPgmlDetailMetadataDraftFromRoutine('procedure', routine),
          blockSource
        )
      : null
  }

  if (selectedObject.value?.kindLabel === 'Trigger') {
    const trigger = model.triggers.find(entry => `trigger:${entry.name}` === selectedObject.value?.id)

    return trigger
      ? buildExecutableMetadataEditorSpec(
          'Trigger',
          createPgmlDetailMetadataDraftFromTrigger(trigger),
          blockSource
        )
      : null
  }

  if (selectedObject.value?.kindLabel === 'Sequence') {
    const sequence = model.sequences.find(entry => `sequence:${entry.name}` === selectedObject.value?.id)

    return sequence
      ? buildExecutableMetadataEditorSpec(
          'Sequence',
          createPgmlDetailMetadataDraftFromSequence(sequence),
          blockSource
        )
      : null
  }

  return null
})

const canEditSelectedDetailSource = computed(() => {
  return canEditDetailSource
    && !!selectedDetailPopover.value?.sourceRange
    && selectedDetailEditorSpec.value !== null
})

const canEditSelectedDetailMetadata = computed(() => {
  return canEditDetailSource
    && !!selectedDetailPopover.value?.sourceRange
    && selectedDetailMetadataEditorSpec.value !== null
})

const detailPopoverSourceHasChanges = computed(() => {
  return detailPopoverEditorSource.value !== (selectedDetailEditorSpec.value?.source || '')
})

const detailPopoverMetadataHasChanges = computed(() => {
  return JSON.stringify(detailPopoverMetadataDraft.value)
    !== JSON.stringify(selectedDetailMetadataEditorSpec.value?.draft || null)
})

const detailPopoverEditButtonLabel = computed(() => {
  return selectedDetailEditorSpec.value?.languageMode === 'sql' ? 'Edit SQL' : 'Edit block'
})

const shouldShowDetailPopover = computed(() => {
  return selectedDetailPopover.value !== null && !isMobilePanelView.value
})

const detailPopoverViewportInsetTop = computed(() => {
  if (isMobileCanvasShell.value) {
    return 12
  }

  return isEditingDetailSource.value || isEditingDetailMetadata.value ? 56 : 12
})

const detailPopoverViewportInsetBottom = computed(() => {
  if (isMobileCanvasShell.value) {
    return 12
  }

  if (!isEditingDetailSource.value && !isEditingDetailMetadata.value) {
    return 12
  }

  return shouldShowZoomToolbar.value ? 56 : 12
})

const detailPopoverViewportInsetRight = computed(() => {
  if (isMobilePanelView.value) {
    return 0
  }

  const diagramPanelInset = isDiagramPanelVisible.value ? 336 : 0
  const toolPanelInset = isToolPanelOpen.value ? 684 : 0

  return Math.max(diagramPanelInset, toolPanelInset)
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
  const isEditingDetailPanel = isEditingDetailSource.value || isEditingDetailMetadata.value
  const minimumPopoverWidth = isEditingDetailPanel ? 320 : 220
  const fallbackPopoverWidth = isEditingDetailPanel ? 260 : 160
  const preferredPopoverWidth = isEditingDetailPanel ? 560 : 360
  const popoverHeight = detailPopoverSize.value.height > 0
    ? detailPopoverSize.value.height
    : isEditingDetailPanel
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
  const topInset = detailPopoverViewportInsetTop.value
  const bottomInset = detailPopoverViewportInsetBottom.value
  const maxTop = Math.max(topInset, safeViewportHeight - popoverHeight - bottomInset)
  const top = clamp(anchorBounds.top - 12, topInset, maxTop)

  return {
    left,
    top,
    width: popoverWidth
  }
})

const detailPopoverContainerClass = computed(() => {
  return isMobileCanvasShell.value
    ? 'pointer-events-none absolute inset-x-3 top-3 z-[4] flex'
    : 'pointer-events-none absolute z-[4] flex min-h-0'
})

const detailPopoverContainerStyle = computed<CSSProperties | undefined>(() => {
  if (isMobileCanvasShell.value) {
    return undefined
  }

  const fallbackTop = detailPopoverViewportInsetTop.value
  const bottomInset = detailPopoverViewportInsetBottom.value

  if (!detailPopoverPlacement.value) {
    return {
      left: '12px',
      top: `${fallbackTop}px`,
      width: '24rem',
      maxHeight: `calc(100% - ${fallbackTop + bottomInset}px)`
    }
  }

  return {
    left: `${Math.round(detailPopoverPlacement.value.left)}px`,
    top: `${Math.round(detailPopoverPlacement.value.top)}px`,
    width: `${Math.round(detailPopoverPlacement.value.width)}px`,
    maxHeight: `calc(100% - ${Math.round(detailPopoverPlacement.value.top) + bottomInset}px)`
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
  isEditingDetailMetadata.value = false
  selectedSelection.value = null
}

const syncDetailPopoverEditorSource = () => {
  detailPopoverEditorSource.value = selectedDetailEditorSpec.value?.source || ''
}

const syncDetailPopoverMetadataDraft = () => {
  detailPopoverMetadataDraft.value = selectedDetailMetadataEditorSpec.value
    ? clonePgmlDetailPopoverMetadataDraft(selectedDetailMetadataEditorSpec.value.draft)
    : null
}

const updateDetailPopoverMetadataDraft = (nextDraft: PgmlDetailPopoverMetadataDraft) => {
  detailPopoverMetadataDraft.value = nextDraft
}

const openDetailPopoverSourceEditor = () => {
  if (!canEditSelectedDetailSource.value) {
    return
  }

  isEditingDetailMetadata.value = false
  syncDetailPopoverEditorSource()
  isEditingDetailSource.value = true
}

const openDetailPopoverMetadataEditor = () => {
  if (!canEditSelectedDetailMetadata.value) {
    return
  }

  isEditingDetailSource.value = false
  syncDetailPopoverMetadataDraft()
  isEditingDetailMetadata.value = true
}

const cancelDetailPopoverSourceEditor = () => {
  syncDetailPopoverEditorSource()
  isEditingDetailSource.value = false
}

const cancelDetailPopoverMetadataEditor = () => {
  syncDetailPopoverMetadataDraft()
  isEditingDetailMetadata.value = false
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

const applyDetailPopoverMetadataEditor = () => {
  const sourceRange = selectedDetailPopover.value?.sourceRange
  const nextDraft = detailPopoverMetadataDraft.value
  const replacementText = nextDraft
    ? selectedDetailMetadataEditorSpec.value?.toReplacementText(nextDraft) || null
    : null

  if (!sourceRange || !canEditSelectedDetailMetadata.value || replacementText === null) {
    return
  }

  emit('replaceSourceRange', {
    nextText: replacementText,
    sourceRange
  })
  isEditingDetailMetadata.value = false
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
  const attachment = (tableAttachmentState.value.attachmentsByTableId[tableId] || [])
    .find(entry => entry.id === attachmentId) || null

  return table
    ? isTableVisible(table) && isEntityDirectlyVisible(attachmentId) && (!!attachment && isAttachmentGloballyVisible(attachment))
    : false
}

const isBrowserItemDirectlyVisible = (item: EntityBrowserItem) => {
  if (item.selection.kind === 'table') {
    return isEntityDirectlyVisible(item.selection.tableId)
  }

  if (item.selection.kind === 'column') {
    return isColumnGloballyVisible() && isEntityDirectlyVisible(item.selection.tableId)
  }

  if (item.selection.kind === 'attachment') {
    const selection = item.selection
    const attachment = (tableAttachmentState.value.attachmentsByTableId[selection.tableId] || [])
      .find(entry => entry.id === selection.attachmentId) || null

    return !!attachment && isAttachmentGloballyVisible(attachment) && isEntityDirectlyVisible(selection.attachmentId)
  }

  return (!isExecutableObjectId(item.selection.id) || showExecutableObjects.value) && isEntityDirectlyVisible(item.selection.id)
}

const isBrowserItemEffectivelyVisible = (item: EntityBrowserItem) => {
  const selection = item.selection

  if (selection.kind === 'table') {
    const table = model.tables.find(entry => entry.fullName === selection.tableId)

    return table ? isTableVisible(table) : false
  }

  if (selection.kind === 'column') {
    const table = model.tables.find(entry => entry.fullName === selection.tableId)

    return isColumnGloballyVisible() && (table ? isTableVisible(table) : false)
  }

  if (selection.kind === 'attachment') {
    return isAttachmentEffectivelyVisible(selection.tableId, selection.attachmentId)
  }

  if (selection.kind === 'group') {
    return isGroupVisible(selection.id.replace(/^group:/, ''))
  }

  return isEntityDirectlyVisible(selection.id)
}

const isSelectionVisibleUnderGlobalToggles = (selection: DiagramGpuSelection | null) => {
  if (!selection) {
    return true
  }

  if (selection.kind === 'column') {
    return isColumnGloballyVisible()
  }

  if (selection.kind === 'attachment') {
    const attachment = (tableAttachmentState.value.attachmentsByTableId[selection.tableId] || [])
      .find(entry => entry.id === selection.attachmentId) || null

    return !!attachment && isAttachmentGloballyVisible(attachment)
  }

  if (selection.kind === 'object') {
    return !isExecutableObjectId(selection.id) || showExecutableObjects.value
  }

  return true
}

const isBrowserItemHiddenByAncestor = (item: EntityBrowserItem) => {
  return !isBrowserItemEffectivelyVisible(item) && isBrowserItemDirectlyVisible(item)
}

const syncDiagramViewSettings = (settings: DiagramViewSettings | null | undefined) => {
  snapToGrid.value = settings?.snapToGrid ?? true
  showRelationshipLines.value = settings?.showRelationshipLines ?? true
  showExecutableObjects.value = settings?.showExecutableObjects ?? true
  showTableFields.value = settings?.showTableFields ?? true
}

const updatePersistedDiagramViewSettings = (settings: Partial<DiagramViewSettings>) => {
  emit('updateDiagramViewSettings', settings)
}

const toggleRelationshipLines = () => {
  const nextValue = !showRelationshipLines.value

  showRelationshipLines.value = nextValue
  updatePersistedDiagramViewSettings({
    showRelationshipLines: nextValue
  })
}

const toggleExecutableObjects = () => {
  const nextValue = !showExecutableObjects.value

  showExecutableObjects.value = nextValue
  updatePersistedDiagramViewSettings({
    showExecutableObjects: nextValue
  })
}

const toggleTableFields = () => {
  const nextValue = !showTableFields.value

  showTableFields.value = nextValue
  updatePersistedDiagramViewSettings({
    showTableFields: nextValue
  })
}

const toggleSnapToGrid = () => {
  const nextValue = !snapToGrid.value

  snapToGrid.value = nextValue
  updatePersistedDiagramViewSettings({
    snapToGrid: nextValue
  })
}

const handleDiagramViewModelUpdate = (value: string | number | null) => {
  if (typeof value !== 'string' || value.trim().length === 0 || value === activeDiagramViewId) {
    return
  }

  emit('selectDiagramView', value)
}

watch(
  () => diagramViewSettings,
  (nextSettings) => {
    syncDiagramViewSettings(nextSettings)
  },
  {
    deep: true,
    immediate: true
  }
)

watch([showExecutableObjects, showTableFields], () => {
  syncLayoutStates()

  if (!isSelectionVisibleUnderGlobalToggles(selectedSelection.value)) {
    selectedSelection.value = null
  }
})

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
  if (activePanelTab.value === 'entities') {
    return 'Entities'
  }

  if (activePanelTab.value === 'export') {
    return 'Export'
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
  if (activePanelTab.value === 'entities') {
    const entitySummaryLabel = normalizedEntitySearchQuery.value
      ? `${filteredEntityResultCount.value} matches`
      : `${filteredEntityResultCount.value} visible rows`

    return `${entitySummaryLabel} · ${hiddenEntityCount.value} hidden in saved properties.`
  }

  if (activePanelTab.value === 'export') {
    return 'Export the current accelerated diagram view.'
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

const toolPanelTitle = computed(() => {
  if (activeToolPanelTab.value === 'compare') {
    return selectedCompareEntry.value ? selectedCompareEntry.value.label : 'Compare changes'
  }

  if (activeToolPanelTab.value === 'migrations') {
    return 'Migrations'
  }

  return 'Versions'
})

const toolPanelDescription = computed(() => {
  if (activeToolPanelTab.value === 'compare') {
    if (selectedCompareEntry.value) {
      return selectedCompareEntry.value.description
    }

    return `${compareEntries.length} highlighted change${compareEntries.length === 1 ? '' : 's'} between ${compareBaseLabel} and ${compareTargetLabel}.`
  }

  if (activeToolPanelTab.value === 'migrations') {
    return 'Preview, copy, and download SQL or Kysely files for the current compare lineage.'
  }

  return 'Lock checkpoints, manage preview targets, and choose the compare pair that powers compare and migrations.'
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

const toolPanelSurfaceClass = computed(() => {
  return isMobileCanvasShell.value
    ? 'absolute inset-0 z-[5] grid min-h-0 w-full grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden'
    : 'absolute bottom-3 right-3 top-14 z-[4] grid min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden border max-[900px]:left-3'
})

const shouldShowToolPanel = computed(() => {
  if (!isToolPanelOpen.value) {
    return false
  }

  if (!isMobileCanvasShell.value) {
    return true
  }

  return isMobileToolPanelView.value
})

const toolPanelSurfaceStyle = computed<CSSProperties>(() => {
  return {
    ...floatingPanelStyle,
    width: isMobileCanvasShell.value ? '100%' : 'min(42rem, calc(100% - 1.5rem))'
  }
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

const getSceneNodeState = (payload: { id: string, kind: 'group' | 'object' | 'table' }) => {
  return payload.kind === 'group'
    ? groupLayoutStates.value[payload.id]
    : payload.kind === 'table'
      ? floatingTableStates.value[payload.id]
      : objectLayoutStates.value[payload.id]
}

const getSnappedSceneNodePosition = (payload: { x: number, y: number }) => {
  const nextX = snapToGrid.value ? Math.round(payload.x / 18) * 18 : payload.x
  const nextY = snapToGrid.value ? Math.round(payload.y / 18) * 18 : payload.y

  return {
    x: nextX,
    y: nextY
  }
}

const updateSceneDragPreview = (
  payload: { id: string, kind: 'group' | 'object' | 'table', x: number, y: number }
) => {
  const currentState = getSceneNodeState(payload)

  if (!currentState) {
    return
  }

  const nextPreview: DiagramNodeDragPreview = {
    deltaX: payload.x - currentState.x,
    deltaY: payload.y - currentState.y,
    id: payload.id,
    kind: payload.kind,
    nodeId: payload.id,
    originX: currentState.x,
    originY: currentState.y,
    x: payload.x,
    y: payload.y
  }

  setSceneDragPreview(nextPreview)
  scheduleLiveConnectionPreview(nextPreview)

  if (liveConnectionPreviewLines.value.length === 0) {
    setSceneConnectionDragPreview(nextPreview)
  } else {
    setSceneConnectionDragPreview(null)
  }

  if (shouldRenderAutomationPlane.value) {
    applyAutomationNodeDragPreview(nextPreview)
    activeConnectionDragPreview.value = liveConnectionPreviewLines.value.length === 0
      ? nextPreview
      : null
    return
  }

  applyAutomationNodeDragPreview(null)
  activeConnectionDragPreview.value = null
}

const commitSceneNodePosition = (
  payload: { id: string, kind: 'group' | 'object' | 'table', x: number, y: number }
) => {
  const currentState = getSceneNodeState(payload)

  if (!currentState) {
    resetLiveConnectionPreviewState()
    setSceneDragPreview(null)
    setSceneConnectionDragPreview(null)
    applyAutomationNodeDragPreview(null)
    activeConnectionDragPreview.value = null
    return
  }

  const nextPosition = getSnappedSceneNodePosition(payload)
  const settledPreview: DiagramNodeDragPreview = {
    deltaX: nextPosition.x - currentState.x,
    deltaY: nextPosition.y - currentState.y,
    id: payload.id,
    kind: payload.kind,
    nodeId: payload.id,
    originX: currentState.x,
    originY: currentState.y,
    x: nextPosition.x,
    y: nextPosition.y
  }

  setPendingNodePositionOverride({
    ...payload,
    x: nextPosition.x,
    y: nextPosition.y
  })

  if (payload.kind === 'group') {
    updateGroupState(payload.id, {
      x: nextPosition.x,
      y: nextPosition.y
    }, {
      emitLayout: false
    })
  } else if (payload.kind === 'table') {
    updateTableState(payload.id, {
      x: nextPosition.x,
      y: nextPosition.y
    }, {
      emitLayout: false
    })
  } else {
    updateObjectState(payload.id, {
      x: nextPosition.x,
      y: nextPosition.y
    }, {
      emitLayout: false
    })
  }

  resetLiveConnectionPreviewState()
  setSceneConnectionDragPreview(settledPreview)
  setSceneDragPreview(null)
  applyAutomationNodeDragPreview(null)

  if (shouldRenderAutomationPlane.value) {
    activeConnectionDragPreview.value = settledPreview
    return
  }

  activeConnectionDragPreview.value = null
}

const handleSceneDragPreviewChange = (payload: { id: string, kind: 'group' | 'object' | 'table', x: number, y: number }) => {
  updateSceneDragPreview(payload)
}

const handleSceneMoveEnd = (payload: { id: string, kind: 'group' | 'object' | 'table', x: number, y: number }) => {
  commitSceneNodePosition(payload)
  emit('nodePropertiesChange', getNodeLayoutProperties())
  void computeConnectionLines({
    preserveDragPreviewUntilSettled: true
  })
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

  if (activePanelTab.value !== 'inspector') {
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
    const { [id]: _removedEntry, ...remainingProperties } = nextProperties

    emit('nodePropertiesChange', remainingProperties)

    if (
      !visible
      && (
        (selectedSelection.value?.kind === 'group' && selectedSelection.value.id === id)
        || (selectedSelection.value?.kind === 'object' && selectedSelection.value.id === id)
        || (selectedSelection.value?.kind === 'table' && selectedSelection.value.tableId === id)
        || (selectedSelection.value?.kind === 'column' && selectedSelection.value.tableId === id)
        || (selectedSelection.value?.kind === 'attachment' && selectedSelection.value.tableId === id)
      )
    ) {
      selectedSelection.value = null
    }

    return
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
        masonry: group.masonry,
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

  styledConnectionLines.value.forEach((line) => {
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
  () => compareNodeHighlightById.value,
  () => {
    syncCompareHighlightStates()
  },
  {
    deep: true,
    immediate: true
  }
)

watch(
  () => [groupNodes.value, tableCards.value, objectNodes.value, model.references],
  () => {
    void computeConnectionLines()
  },
  {
    deep: true,
    immediate: true
  }
)

watch(
  () => shouldRenderAutomationPlane.value,
  async (nextValue) => {
    if (!nextValue) {
      resetLiveConnectionPreviewState()
      applyAutomationNodeDragPreview(null)
      activeConnectionDragPreview.value = null
      return
    }

    await nextTick()
    void computeConnectionLines()
  }
)

watch(
  () => activePanelTab.value,
  async (nextTab) => {
    emit('panelTabChange', nextTab)

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
  () => mobileToolPanelTab,
  (nextToolPanelTab) => {
    if (!nextToolPanelTab || nextToolPanelTab === activeToolPanelTab.value) {
      return
    }

    activeToolPanelTab.value = nextToolPanelTab
  },
  {
    immediate: true
  }
)

watch(
  () => mobileActiveView,
  (nextMobileView) => {
    if (!isMobileCanvasShell.value) {
      return
    }

    if (nextMobileView === 'tool-panel') {
      openToolPanel(mobileToolPanelTab || activeToolPanelTab.value)
      return
    }

    if (isToolPanelOpen.value) {
      isToolPanelOpen.value = false
    }
  },
  {
    immediate: true
  }
)

watch(
  rendererBackend,
  (nextValue) => {
    persistRendererBackendPreference(nextValue)
  }
)

watch(
  () => [selectedDetailEditorKey.value, sourceText],
  () => {
    isEditingDetailSource.value = false
    isEditingDetailMetadata.value = false
    syncDetailPopoverEditorSource()
    syncDetailPopoverMetadataDraft()
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
  () => canEditSelectedDetailMetadata.value,
  (canEdit) => {
    if (!canEdit) {
      isEditingDetailMetadata.value = false
    }
  },
  {
    immediate: true
  }
)

watch(
  () => selectedDiagramCompareEntryIds.value,
  (nextEntryIds) => {
    if (!isComparePanelActive.value || nextEntryIds.length === 0) {
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
    if (!isComparePanelActive.value) {
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
    styledConnectionLines.value.length,
    tableCards.value.length,
    groupNodes.value.length,
    objectNodes.value.length,
    rendererCapability.value.fallbackReason,
    rendererCapability.value.requested,
    rendererCapability.value.resolved,
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
        connectionSignature: string
        exportPreferenceKey: string
        firstConnection: DiagramGpuConnectionLine | null
        groupCount: number
        groupCards: Array<{ height: number, id: string, width: number, x: number, y: number }>
        hasBlockingSourceErrors: boolean
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
        rendererFallbackReason: DiagramRendererCapability['fallbackReason']
        rendererRequested: DiagramRendererBackend
        rendererResolved: DiagramRendererCapability['resolved']
        routingBackend: DiagramRoutingBackend
        worldBounds: DiagramGpuWorldBounds
      }
    }).__pgmlSceneDebug = {
      connectionCount: styledConnectionLines.value.length,
      connectionSignature: styledConnectionLines.value.map((line) => {
        return [
          line.key,
          line.points.map(point => `${point.x},${point.y}`).join(';')
        ].join(':')
      }).join('|'),
      exportPreferenceKey,
      firstConnection: styledConnectionLines.value[0] || null,
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
      hasBlockingSourceErrors,
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
      rendererFallbackReason: rendererCapability.value.fallbackReason,
      rendererRequested: rendererCapability.value.requested,
      rendererResolved: rendererCapability.value.resolved,
      routingBackend: activeRoutingBackend.value,
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

onMounted(() => {
  if (!import.meta.client) {
    return
  }

  restoreRendererBackendPreference()

  const windowWithDebugFlag = window as Window & {
    __PGML_ENABLE_DOM_PLANE__?: boolean
    __PGML_FORCE_GPU_SCENE__?: boolean
  }
  const isAndroidBrowser = /Android/i.test(navigator.userAgent)
  const prefersCoarsePointer = window.matchMedia('(pointer: coarse)').matches
  const forceGpuScene = windowWithDebugFlag.__PGML_FORCE_GPU_SCENE__ === true

  shouldRenderAutomationPlane.value = !forceGpuScene && (
    windowWithDebugFlag.__PGML_ENABLE_DOM_PLANE__ === true
    || (navigator.webdriver && !prefersCoarsePointer)
  )
  shouldRenderSvgConnectionOverlay.value = !isAndroidBrowser && !shouldRenderAutomationPlane.value && prefersCoarsePointer
  shouldPreferMainThreadConnectionRouting.value = prefersCoarsePointer || isAndroidBrowser
})

onBeforeUnmount(() => {
  automationPlaneDragSession = null
  resetLiveConnectionPreviewState()
  applyAutomationNodeDragPreview(null)
  activeConnectionDragPreview.value = null
  liveSceneConnectionDragPreview = null
  automationPlaneNodeElements.clear()
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
      :connections="displayedConnectionLines"
      :groups="groupNodes"
      :objects="objectNodes"
      :renderer-backend="rendererBackend"
      :selection="selectedSelection"
      :show-relationship-lines="showRelationshipLines"
      :tables="tableCards"
      :viewport-inset-right="detailPopoverViewportInsetRight"
      :viewport-reset-key="viewportResetKey"
      :world-bounds="worldBounds"
      @focus-source="focusSourceRange"
      @move-end="handleSceneMoveEnd"
      @renderer-capability-change="handleRendererCapabilityChange"
      @select="handleSceneSelect"
      @transform-change="handleSceneTransformChange"
      @toggle-object-collapsed="handleSceneToggleObjectCollapsed"
    />

    <div
      v-if="shouldRenderAutomationPlane"
      class="pointer-events-none absolute inset-0 z-[2] overflow-hidden"
    >
      <div
        ref="planeRef"
        data-diagram-plane="true"
        class="relative origin-top-left"
        :style="automationPlaneStyle"
      >
        <div
          v-for="node in automationPlaneNodes"
          :key="node.id"
          :ref="(element) => setAutomationNodeElement(node.id, element)"
          :data-node-anchor="node.id"
          :data-table-anchor="node.kind === 'table' ? node.id : undefined"
          :data-selection-active="(node.kind === 'group' && isGroupSelectionActive(node.id)) || (node.kind === 'object' && isObjectSelectionActive(node.id)) || (node.kind === 'table' && isTableSelectionActive(node.id)) ? 'true' : undefined"
          class="pointer-events-auto absolute select-none overflow-hidden"
          :style="[
            {
              background: getNodeBackground(node.color, node.kind),
              borderColor: node.kind === 'group' ? 'transparent' : getNodeBorderColor(node.color, node.kind),
              borderWidth: node.kind === 'group' ? '0' : '1px',
              height: `${node.height}px`,
              left: `${node.x}px`,
              top: `${node.y}px`,
              width: `${node.width}px`,
              zIndex: node.zIndex
            },
            (node.kind === 'object' && isObjectSelectionActive(node.id)) || (node.kind === 'table' && isTableSelectionActive(node.id))
              ? getSelectionGlowStyle(node.color)
              : undefined
          ]"
          :class="[
            node.kind === 'group' ? 'rounded-[2px]' : 'border',
            node.kind === 'table' || node.kind === 'object'
              ? 'hover:ring-1 hover:ring-[color:var(--studio-ring)]'
              : '',
            (node.kind === 'object' && isObjectSelectionActive(node.id)) || (node.kind === 'table' && isTableSelectionActive(node.id))
              ? 'pgml-selection-glow'
              : ''
          ]"
          @click.stop="node.kind === 'group' ? selectAutomationGroup(node.id) : node.kind === 'table' ? handleAutomationTableClick(node.id) : handleAutomationObjectClick(node.id)"
          @dblclick.stop="node.kind === 'group' ? handleAutomationGroupDoubleClick(node.id) : node.kind === 'table' ? handleAutomationTableDoubleClick(node.id) : handleAutomationObjectDoubleClick(node.id)"
          @pointerdown="node.kind === 'group' ? handleAutomationPlaneGroupSurfacePointerDown($event, node) : handleAutomationPlaneNodeSurfacePointerDown($event, node)"
          @pointermove="handleAutomationPlanePointerMove"
          @pointerup="handleAutomationPlanePointerUp"
          @pointercancel="handleAutomationPlanePointerUp"
        >
          <div
            v-if="node.kind === 'group'"
            :data-group-surface="node.id"
            class="absolute inset-0 rounded-[2px] border"
            :style="{
              background: getNodeBackground(node.color, 'group'),
              borderColor: getNodeBorderColor(node.color, 'group'),
              zIndex: getDiagramGroupBackgroundZIndex(getGroupNodeLayerOrder(node.id))
            }"
          />

          <div
            :data-node-header="node.id"
            class="relative flex items-start justify-between gap-2 border-b border-[color:var(--studio-divider)] px-2.5 py-2"
            :style="node.kind === 'group'
              ? {
                height: `${diagramGroupHeaderHeight}px`,
                zIndex: getDiagramNodeZIndex(getGroupNodeLayerOrder(node.id))
              }
              : node.kind === 'table'
                ? {
                  height: `${diagramTableHeaderHeight}px`
                }
                : undefined"
            @pointerdown="startAutomationPlaneNodeDrag($event, node)"
            @pointermove="handleAutomationPlanePointerMove"
            @pointerup="handleAutomationPlanePointerUp"
            @pointercancel="handleAutomationPlanePointerUp"
          >
            <div class="min-w-0">
              <span
                :data-node-accent="node.id"
                class="mb-1 inline-flex font-mono text-[0.62rem] uppercase tracking-[0.08em]"
                :style="{ color: getNodeAccentColor(node.color) }"
              >
                {{ node.kind === 'group' ? 'Table Group' : (node.kind === 'table' ? 'Table' : node.kindLabel) }}
              </span>
              <h3 class="truncate text-[0.88rem] font-semibold leading-5 tracking-[-0.02em] text-[color:var(--studio-shell-text)]">
                {{ node.title }}
              </h3>
              <span
                v-if="node.kind === 'table'"
                data-table-schema-badge
                class="mt-1 inline-flex min-h-[1rem] items-center border px-1.5 py-0.5 font-mono text-[0.52rem] uppercase leading-[1.15] tracking-[0.05em]"
                :style="getSchemaBadgeStyle(node.schema)"
              >
                {{ node.schema }}
              </span>
              <p
                v-else-if="node.kind === 'object' && node.subtitle"
                class="truncate text-[0.68rem] text-[color:var(--studio-shell-muted)]"
              >
                {{ node.subtitle }}
              </p>
            </div>

            <div class="flex shrink-0 items-start gap-1">
              <span class="inline-flex h-5 items-center border border-[color:var(--studio-rail)] px-1.5 font-mono text-[0.62rem] uppercase tracking-[0.06em] text-[color:var(--studio-shell-muted)]">
                {{ node.kind === 'group' ? `${node.tableCount} tables` : (node.kind === 'table' ? `${node.rowCount} rows` : `${node.tableIds.length} impact`) }}
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
                @click.stop="emit('createTable', node.title)"
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
                @click.stop="emit('editGroup', node.title)"
              />
              <UButton
                v-if="node.kind === 'object'"
                :icon="node.collapsed ? 'i-lucide-plus' : 'i-lucide-minus'"
                :data-object-collapse-button="node.id"
                color="neutral"
                variant="ghost"
                size="xs"
                class="h-5 w-5 rounded-none border border-[color:var(--studio-rail)] px-0 text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
                :aria-label="node.collapsed ? `Expand ${node.title}` : `Collapse ${node.title}`"
                :title="node.collapsed ? `Expand ${node.title}` : `Collapse ${node.title}`"
                @pointerdown.stop
                @click.stop="toggleObjectCollapsed(node.id)"
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
                @click.stop="emit('editTable', node.id)"
              />
            </div>
          </div>

          <div
            v-if="node.kind === 'group'"
            class="relative"
            :style="{
              paddingBottom: `${diagramGroupVerticalPadding}px`,
              paddingLeft: `${diagramGroupHorizontalPadding}px`,
              paddingRight: `${diagramGroupHorizontalPadding}px`,
              paddingTop: `${diagramGroupVerticalPadding}px`,
              zIndex: getDiagramNodeZIndex(getGroupNodeLayerOrder(node.id))
            }"
          >
            <div
              :data-group-content="node.id"
              class="grid items-start justify-start overflow-visible"
              :style="getAutomationGroupContentStyle(node.id)"
            >
              <article
                v-for="table in getAutomationGroupTables(node.id)"
                :key="table.id"
                :data-table-anchor="table.id"
                :data-selection-active="isTableSelectionActive(table.id) ? 'true' : undefined"
                class="relative min-w-0 self-start overflow-hidden rounded-[2px] border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-table-surface)] hover:ring-1 hover:ring-[color:var(--studio-ring)]"
                :style="[
                  getAutomationGroupTableLayoutStyle(node.id, table.id),
                  isTableSelectionActive(table.id) ? getSelectionGlowStyle(table.color) : undefined
                ]"
                :class="isTableSelectionActive(table.id) ? 'pgml-selection-glow pgml-selection-glow-subtle' : ''"
                @click.stop="handleAutomationTableClick(table.id)"
                @dblclick.stop="handleAutomationTableDoubleClick(table.id)"
                @pointerdown="handleAutomationPlaneGroupedTablePointerDown($event, node)"
                @pointermove="handleAutomationPlanePointerMove"
                @pointerup="handleAutomationPlanePointerUp"
                @pointercancel="handleAutomationPlanePointerUp"
              >
                <div
                  class="flex items-start justify-between gap-2 border-b border-[color:var(--studio-divider)] px-2 py-1.5"
                  :style="{ height: `${table.headerHeight}px` }"
                >
                  <div class="min-w-0">
                    <h4 class="truncate text-[0.78rem] font-semibold leading-5 text-[color:var(--studio-shell-text)]">
                      {{ table.title }}
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
                    :data-table-edit-button="table.id"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    class="h-5 w-5 rounded-none border border-[color:var(--studio-rail)] px-0 text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
                    aria-label="Edit table"
                    title="Edit table"
                    @pointerdown.stop
                    @click.stop="emit('editTable', table.id)"
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
                    :is-column-selection-active="isColumnSelectionActive"
                    :is-highlighted-relational-row="isHighlightedRelationalRow"
                    :rows="getAutomationTableRows(table.id)"
                    :table-id="table.id"
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
              :is-column-selection-active="isColumnSelectionActive"
              :is-highlighted-relational-row="isHighlightedRelationalRow"
              :rows="getAutomationTableRows(node.id)"
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
        </div>

        <PgmlDiagramConnectionCanvas
          :active-drag="activeConnectionDragPreview"
          :height="automationPlaneHeight"
          :layers="automationConnectionCanvasLayers"
          :preview-paths="{}"
          :width="automationPlaneWidth"
        />
      </div>
    </div>

    <div
      v-else-if="shouldRenderSvgConnectionOverlay"
      class="pointer-events-none absolute inset-0 z-[2] overflow-hidden"
    >
      <PgmlDiagramConnectionCanvas
        :active-drag="activeConnectionDragPreview"
        :content-transform="svgConnectionOverlayTransform"
        :height="automationPlaneHeight"
        :layers="automationConnectionCanvasLayers"
        :preview-paths="{}"
        :render-height="viewportSize.height"
        :render-width="viewportSize.width"
        :width="automationPlaneWidth"
      />
    </div>

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
        class="pointer-events-auto grid max-h-full min-h-0 w-full grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden border px-3 py-3"
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

        <div
          data-detail-popover-body="true"
          class="min-h-0 overflow-auto pr-1"
        >
          <PgmlDetailPopoverSourceEditor
            v-if="isEditingDetailSource"
            v-model="detailPopoverEditorSource"
            :description="selectedDetailEditorSpec?.description"
            :language-mode="selectedDetailEditorSpec?.languageMode || 'pgml'"
            :original-value="selectedDetailEditorSpec?.source || ''"
            :title="selectedDetailEditorSpec?.title || 'Editing PGML block'"
          />

          <PgmlDetailPopoverMetadataEditor
            v-else-if="isEditingDetailMetadata && detailPopoverMetadataDraft"
            :model-value="detailPopoverMetadataDraft"
            :description="selectedDetailMetadataEditorSpec?.description"
            :original-value="selectedDetailMetadataEditorSpec?.draft || detailPopoverMetadataDraft"
            :routine-items="routineMetadataSelectItems"
            :title="selectedDetailMetadataEditorSpec?.title || 'Editing metadata'"
            @update:model-value="updateDetailPopoverMetadataDraft"
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
        </div>

        <div
          v-if="selectedDetailPopover.sourceRange"
          class="flex flex-wrap gap-2"
        >
          <UButton
            v-if="canEditSelectedDetailMetadata && !isEditingDetailSource && !isEditingDetailMetadata"
            data-detail-popover-edit-metadata="true"
            label="Edit metadata"
            leading-icon="i-lucide-sliders-horizontal"
            color="neutral"
            variant="outline"
            size="xs"
            :class="sidePanelActionButtonClass"
            @click="openDetailPopoverMetadataEditor"
          />
          <UButton
            v-if="canEditSelectedDetailSource && !isEditingDetailSource && !isEditingDetailMetadata"
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
            v-if="isEditingDetailSource || isEditingDetailMetadata"
            data-detail-popover-cancel-source="true"
            :label="isEditingDetailMetadata ? 'Cancel metadata' : 'Cancel edit'"
            leading-icon="i-lucide-rotate-ccw"
            color="neutral"
            variant="ghost"
            size="xs"
            :class="sidePanelActionButtonClass"
            @click="isEditingDetailMetadata ? cancelDetailPopoverMetadataEditor() : cancelDetailPopoverSourceEditor()"
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
            v-if="isEditingDetailMetadata"
            data-detail-popover-apply-metadata="true"
            :label="detailPopoverMetadataHasChanges ? 'Apply metadata' : 'Keep metadata'"
            leading-icon="i-lucide-check"
            color="primary"
            variant="solid"
            size="xs"
            :class="sidePanelActionButtonClass"
            @click="applyDetailPopoverMetadataEditor"
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
        <div class="mx-1 h-5 w-px bg-[color:var(--studio-divider)]" />
        <label class="flex items-center gap-2">
          <span class="font-mono text-[0.54rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
            View
          </span>
          <USelect
            data-diagram-view-select="desktop"
            :items="diagramViewItems"
            :model-value="activeDiagramViewId || undefined"
            value-key="value"
            label-key="label"
            color="neutral"
            variant="outline"
            size="xs"
            :class="diagramViewToolbarSelectClass"
            :ui="studioSelectUi"
            @update:model-value="handleDiagramViewModelUpdate"
          />
        </label>
        <button
          type="button"
          data-diagram-view-create="desktop"
          aria-label="Create view"
          :class="diagramViewToolbarButtonClass"
          @click="emit('createDiagramView')"
        >
          <UIcon
            name="i-lucide-plus"
            class="h-3.5 w-3.5"
          />
        </button>
        <button
          type="button"
          data-diagram-view-rename="desktop"
          aria-label="Rename active view"
          :class="diagramViewToolbarButtonClass"
          :disabled="!activeDiagramViewId"
          @click="emit('renameDiagramView')"
        >
          <UIcon
            name="i-lucide-pencil"
            class="h-3.5 w-3.5"
          />
        </button>
        <button
          type="button"
          data-diagram-view-delete="desktop"
          aria-label="Delete active view"
          :class="diagramViewToolbarButtonClass"
          :disabled="!canDeleteDiagramView"
          @click="emit('deleteDiagramView')"
        >
          <UIcon
            name="i-lucide-trash-2"
            class="h-3.5 w-3.5"
          />
        </button>
        <button
          type="button"
          data-relationship-lines-toggle="true"
          :aria-pressed="showRelationshipLines"
          :class="getStudioStateButtonClass({
            emphasized: showRelationshipLines,
            extraClass: 'inline-flex items-center gap-1.5 text-[0.62rem]'
          })"
          @click="toggleRelationshipLines"
        >
          <UIcon
            :name="showRelationshipLines ? 'i-lucide-eye' : 'i-lucide-eye-off'"
            class="h-3.5 w-3.5"
          />
          Lines
        </button>
        <button
          type="button"
          data-executable-objects-toggle="true"
          :aria-pressed="showExecutableObjects"
          :class="getStudioStateButtonClass({
            emphasized: showExecutableObjects,
            extraClass: 'inline-flex items-center gap-1.5 text-[0.62rem]'
          })"
          @click="toggleExecutableObjects"
        >
          <UIcon
            :name="showExecutableObjects ? 'i-lucide-eye' : 'i-lucide-eye-off'"
            class="h-3.5 w-3.5"
          />
          Execs
        </button>
        <button
          type="button"
          data-table-fields-toggle="true"
          :aria-pressed="showTableFields"
          :class="getStudioStateButtonClass({
            emphasized: showTableFields,
            extraClass: 'inline-flex items-center gap-1.5 text-[0.62rem]'
          })"
          @click="toggleTableFields"
        >
          <UIcon
            :name="showTableFields ? 'i-lucide-eye' : 'i-lucide-eye-off'"
            class="h-3.5 w-3.5"
          />
          Fields
        </button>
        <button
          type="button"
          data-grid-snap-toggle="true"
          :aria-pressed="snapToGrid"
          :class="getStudioStateButtonClass({
            emphasized: snapToGrid,
            extraClass: 'inline-flex items-center gap-1.5 text-[0.62rem]'
          })"
          @click="toggleSnapToGrid"
        >
          <UIcon
            :name="snapToGrid ? 'i-lucide-lock' : 'i-lucide-unlock'"
            class="h-3.5 w-3.5"
          />
          Snap
        </button>
        <div class="mx-1 h-5 w-px bg-[color:var(--studio-divider)]" />
        <label class="flex items-center gap-2">
          <span class="font-mono text-[0.54rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
            Renderer
          </span>
          <USelect
            data-diagram-renderer-select="desktop"
            :items="rendererBackendItems"
            :model-value="rendererBackend"
            value-key="value"
            label-key="label"
            color="neutral"
            variant="outline"
            size="xs"
            class="w-[9.25rem]"
            :ui="studioSelectUi"
            @update:model-value="handleRendererBackendModelUpdate"
          />
        </label>
        <span
          data-diagram-renderer-status="desktop"
          class="hidden max-w-[16rem] truncate font-mono text-[0.54rem] uppercase tracking-[0.08em] lg:block"
          :class="rendererStatusClass"
          :title="rendererStatusTitle"
        >
          {{ rendererStatusText }}
        </span>
      </div>
    </div>

    <div
      v-if="!isMobilePanelView"
      class="pointer-events-none absolute right-3 top-3 z-[4] flex justify-end gap-2"
    >
      <UButton
        data-diagram-tool-toggle="versions"
        :label="diagramToolPanelTabLabelByValue.versions"
        :leading-icon="diagramToolPanelTabIconByValue.versions"
        :variant="isToolPanelOpen && activeToolPanelTab === 'versions' ? 'soft' : 'outline'"
        color="neutral"
        size="xs"
        class="pointer-events-auto"
        :class="toolPanelToggleButtonClass"
        @click="toggleToolPanel('versions')"
      />
      <UButton
        data-diagram-tool-toggle="compare"
        :label="diagramToolPanelTabLabelByValue.compare"
        :leading-icon="diagramToolPanelTabIconByValue.compare"
        :variant="isToolPanelOpen && activeToolPanelTab === 'compare' ? 'soft' : 'outline'"
        color="neutral"
        size="xs"
        class="pointer-events-auto"
        :class="toolPanelToggleButtonClass"
        @click="toggleToolPanel('compare')"
      />
      <UButton
        data-diagram-tool-toggle="migrations"
        :label="diagramToolPanelTabLabelByValue.migrations"
        :leading-icon="diagramToolPanelTabIconByValue.migrations"
        :variant="isToolPanelOpen && activeToolPanelTab === 'migrations' ? 'soft' : 'outline'"
        color="neutral"
        size="xs"
        class="pointer-events-auto"
        :class="toolPanelToggleButtonClass"
        @click="toggleToolPanel('migrations')"
      />
      <UButton
        v-if="shouldShowDiagramPanelToggle"
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

          <div class="mt-3 grid gap-1.5">
            <label class="grid gap-1">
              <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
                View
              </span>
              <div class="flex items-center gap-2">
                <USelect
                  data-diagram-view-select="mobile"
                  :items="diagramViewItems"
                  :model-value="activeDiagramViewId || undefined"
                  value-key="value"
                  label-key="label"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  class="min-w-0 flex-1"
                  :ui="studioSelectUi"
                  @update:model-value="handleDiagramViewModelUpdate"
                />
                <UButton
                  data-diagram-view-create="mobile"
                  aria-label="Create view"
                  icon="i-lucide-plus"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :class="sidePanelActionButtonClass"
                  @click="emit('createDiagramView')"
                />
                <UButton
                  data-diagram-view-rename="mobile"
                  aria-label="Rename active view"
                  icon="i-lucide-pencil"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :class="sidePanelActionButtonClass"
                  :disabled="!activeDiagramViewId"
                  @click="emit('renameDiagramView')"
                />
                <UButton
                  data-diagram-view-delete="mobile"
                  aria-label="Delete active view"
                  icon="i-lucide-trash-2"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :class="sidePanelActionButtonClass"
                  :disabled="!canDeleteDiagramView"
                  @click="emit('deleteDiagramView')"
                />
              </div>
            </label>
            <label class="grid gap-1">
              <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
                Renderer
              </span>
              <USelect
                data-diagram-renderer-select="mobile"
                :items="rendererBackendItems"
                :model-value="rendererBackend"
                value-key="value"
                label-key="label"
                color="neutral"
                variant="outline"
                size="sm"
                :ui="studioSelectUi"
                @update:model-value="handleRendererBackendModelUpdate"
              />
            </label>
            <p
              data-diagram-renderer-status="mobile"
              class="text-[0.64rem] leading-5"
              :class="rendererStatusClass"
            >
              {{ rendererStatusText }}
            </p>
            <p
              v-if="rendererHelpText"
              data-diagram-renderer-help="mobile"
              class="text-[0.62rem] leading-5 text-[color:var(--studio-shell-muted)]"
            >
              {{ rendererHelpText }}
            </p>
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
            <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Table width scale</span>
            <USelect
              aria-label="Table width scale"
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
              data-group-column-count-slider="true"
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
            <div v-if="selectedColumn.column.modifiers.length">
              Modifiers: {{ selectedColumn.column.modifiers.join(', ') }}
            </div>
            <div v-if="selectedColumn.column.note">
              Note: {{ selectedColumn.column.note }}
            </div>
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
        v-else-if="activePanelTab === 'export'"
        data-studio-scrollable="true"
        class="grid content-start gap-3 overflow-auto px-3 py-3"
      >
        <div class="rounded-none border border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)] px-3 py-3 text-[0.7rem] leading-6 text-[color:var(--studio-shell-muted)]">
          Export the accelerated scene directly. The preview renderer keeps diagram export working while visual behavior is being reviewed.
        </div>
        <div class="grid grid-cols-2 gap-2">
          <UButton
            data-diagram-export-button="png-1x"
            label="PNG 1x"
            color="neutral"
            variant="outline"
            size="sm"
            :class="exportPanelButtonClass"
            :disabled="hasBlockingSourceErrors"
            @click="exportPng(1)"
          />
          <UButton
            data-diagram-export-button="png-2x"
            label="PNG 2x"
            color="neutral"
            variant="outline"
            size="sm"
            :class="exportPanelButtonClass"
            :disabled="hasBlockingSourceErrors"
            @click="exportPng(2)"
          />
          <UButton
            data-diagram-export-button="svg"
            label="SVG"
            color="neutral"
            variant="outline"
            size="sm"
            :class="joinStudioClasses(exportPanelButtonClass, 'col-span-2')"
            :disabled="hasBlockingSourceErrors"
            @click="exportSvg"
          />
        </div>
      </div>
    </aside>

    <aside
      v-if="shouldShowToolPanel"
      data-diagram-tool-panel="true"
      :data-diagram-tool-panel-mode="activeToolPanelTab"
      :class="toolPanelSurfaceClass"
      :style="toolPanelSurfaceStyle"
    >
      <div class="flex items-start justify-between gap-3 border-b border-[color:var(--studio-divider)] px-3 py-2.5">
        <div class="min-w-0 flex-1">
          <div class="font-mono text-[0.6rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
            History tools
          </div>
          <h3 class="truncate text-[0.88rem] font-semibold leading-5 text-[color:var(--studio-shell-text)]">
            {{ toolPanelTitle }}
          </h3>
          <p class="mt-1 text-[0.66rem] leading-5 text-[color:var(--studio-shell-muted)]">
            {{ toolPanelDescription }}
          </p>
        </div>

        <div class="flex shrink-0 items-start gap-1">
          <UButton
            v-if="activeToolPanelTab === 'compare' && selectedCompareEntry"
            data-compare-clear-selection="true"
            label="Clear"
            color="neutral"
            variant="ghost"
            size="xs"
            :class="sidePanelActionButtonClass"
            @click="selectedCompareEntryId = null"
          />

          <UButton
            data-diagram-tool-panel-close="true"
            icon="i-lucide-x"
            color="neutral"
            variant="ghost"
            size="xs"
            :class="sidePanelCloseButtonClass"
            aria-label="Close history tools"
            @click="closeToolPanel"
          />
        </div>
      </div>

      <div class="grid grid-cols-3 border-b border-[color:var(--studio-divider)]">
        <button
          type="button"
          data-diagram-tool-panel-tab="versions"
          :class="getStudioTabButtonClass({ active: activeToolPanelTab === 'versions', withTrailingBorder: true })"
          @click="openVersionsPanel"
        >
          Versions
        </button>
        <button
          type="button"
          data-diagram-tool-panel-tab="compare"
          :class="getStudioTabButtonClass({ active: activeToolPanelTab === 'compare', withTrailingBorder: true })"
          @click="openComparator"
        >
          Compare
        </button>
        <button
          type="button"
          data-diagram-tool-panel-tab="migrations"
          :class="getStudioTabButtonClass({ active: activeToolPanelTab === 'migrations' })"
          @click="openMigrationsPanel"
        >
          Migrations
        </button>
      </div>

      <div
        v-if="activeToolPanelTab === 'compare'"
        data-studio-scrollable="true"
        class="grid min-h-0 min-w-0 overflow-hidden"
      >
        <PgmlDiagramComparePanel
          :base-label="compareBaseLabel"
          :compare-base-id="versionCompareBaseId"
          :compare-options="versionCompareOptions"
          :compare-target-id="versionCompareTargetId"
          :entries="compareEntries"
          :relationship-summary="compareRelationshipSummary"
          :selected-diagram-context-ids="selectedDiagramCompareEntryIds"
          :selected-entry-id="selectedCompareEntryId"
          :target-label="compareTargetLabel"
          @focus-source="focusSourceRange"
          @focus-target="focusCompareEntry"
          @select-entry="selectedCompareEntryId = $event"
          @update:compare-base-id="emit('updateVersionCompareBaseId', $event)"
          @update:compare-target-id="emit('updateVersionCompareTargetId', $event)"
        />
      </div>

      <PgmlDiagramVersionsPanel
        v-else-if="activeToolPanelTab === 'versions'"
        :can-create-checkpoint="canCreateCheckpoint"
        :preview-target-id="previewTargetId"
        :versions="versionItems"
        :workspace-base-label="workspaceBaseLabel"
        :workspace-status="workspaceStatus"
        @create-checkpoint="emit('versionCheckpoint')"
        @import-dbml="emit('versionImportDbml')"
        @import-dump="emit('versionImportDump')"
        @restore-version="emit('restoreVersion', $event)"
        @view-target="emit('viewVersionTarget', $event)"
      />

      <PgmlDiagramMigrationsPanel
        v-else
        :compare-base-label="compareBaseLabel"
        :compare-target-label="compareTargetLabel"
        :migration-file-name="migrationFileName"
        :migration-has-changes="migrationHasChanges"
        :migration-kysely="migrationKysely"
        :migration-kysely-file-name="migrationKyselyFileName"
        :migration-sql="migrationSql"
        :migration-steps="migrationSteps"
        :migration-warnings="migrationWarnings"
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
