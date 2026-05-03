<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import { defineAsyncComponent, type Ref, type ShallowRef } from 'vue'
import { nanoid } from 'nanoid'
import { storeToRefs } from 'pinia'
import type { StudioHeaderMenu } from '~/stores/studio-shell'
import {
  studioDefaultInputMenuProps,
  studioFieldUi,
  studioInputMenuUi,
  studioSelectUi,
  studioSwitchUi
} from '~/constants/ui'
import PgmlDiagramComparePanel from '~/components/pgml/PgmlDiagramComparePanel.vue'
import PgmlDiagramMigrationsPanel from '~/components/pgml/PgmlDiagramMigrationsPanel.vue'
import PgmlDiagramVersionsPanel from '~/components/pgml/PgmlDiagramVersionsPanel.vue'
import StudioDesktopWorkspace from '~/components/studio/StudioDesktopWorkspace.vue'
import StudioEditorSurface from '~/components/studio/StudioEditorSurface.vue'
import StudioMobileWorkspace from '~/components/studio/StudioMobileWorkspace.vue'
import { usePgmlColumnDefaultSuggestions } from '~/composables/usePgmlColumnDefaultSuggestions'
import { usePgmlStudioComputerFiles } from '~/composables/usePgmlStudioComputerFiles'
import { usePgmlStudioGists } from '~/composables/usePgmlStudioGists'
import {
  usePgmlStudioVersionHistory,
  type PgmlVersionedDocumentEditorMode,
  type PgmlVersionedDocumentScopeItem
} from '~/composables/usePgmlStudioVersionHistory'
import {
  resetStudioWorkspaceState,
  useStudioWorkspaceDocumentNameState,
  useStudioWorkspaceSessionInitializedState,
  useStudioWorkspaceSourceState
} from '~/composables/useStudioWorkspaceState'
import type { PgmlSourceEditorHandle } from '~/composables/usePgmlSourceEditor'
import { useStudioHeaderActions } from '~/composables/useStudioHeaderActions'
import { useStudioSchemaStatus } from '~/composables/useStudioSchemaStatus'
import { useStudioSessionStore } from '~/stores/studio-session'
import { useStudioSourcesStore } from '~/stores/studio-sources'
import {
  downloadSchemaText,
  formatSavedPgmlSchemaTime,
  slugifySchemaName,
  type SavedPgmlSchema
} from '~/utils/studio-browser-schemas'
import {
  getStudioWorkspacePath,
  getStudioLaunchRequestKey,
  isStudioWorkspacePath,
  parseStudioLaunchQuery,
  type StudioWorkspacePage
} from '~/utils/studio-launch'
import { diffPgmlSchemaModels } from '~/utils/pgml-diff'
import {
  buildPgmlDiagramCompareEntries,
  filterPgmlDiagramCompareEntriesForExclusions,
  filterPgmlDiagramCompareEntriesForNoise,
  getPgmlDiagramCompareEntityKindFromEntryId,
  getPgmlDiagramCompareEntityKindLabel,
  type PgmlDiagramCompareEntityKind,
  type PgmlDiagramCompareEntry
} from '~/utils/pgml-diagram-compare'
import { convertDbmlToPgml } from '~/utils/dbml-import'
import { convertPgDumpToPgml } from '~/utils/pg-dump-import'
import {
  applyImportedExecutableAttachmentSelections,
  prepareImportedExecutableAttachments,
  type PgmlImportExecutableAttachmentCandidate,
  type PgmlImportExecutableAttachmentTableOption
} from '~/utils/pgml-import-attachments'
import { retainPgmlTableGroupsFromBaseSource } from '~/utils/pgml-import-groups'
import { analyzePgmlDocument } from '~/utils/pgml-language'
import {
  hasBlockingPgmlDiagnostics,
  type PgmlAnalysisWorkerResponse
} from '~/utils/pgml-analysis-worker'
import {
  buildPgmlDocumentEditorModeDescription,
  buildPgmlEditorReadOnlyLabel,
  buildPgmlVersionPreviewDescription,
  buildPgmlWorkspaceBaseLabel,
  buildPgmlWorkspaceEditorDescription,
  buildPgmlWorkspaceStatus
} from '~/utils/pgml-version-summary'
import {
  buildPgmlCheckpointName,
  getPgmlVersionDisplayLabel,
  getLatestPgmlVersion,
  serializePgmlDocumentScope
} from '~/utils/pgml-document'
import {
  buildPgmlVersionMigrationBundle,
  type PgmlVersionMigrationBundle
} from '~/utils/pgml-version-migration'
import {
  buildPgmlCheckpointCreatedDescription,
  buildPgmlDeleteVersionDescription,
  buildPgmlDeleteVersionSuccessDescription,
  buildPgmlCheckpointRoleDescription,
  buildPgmlCheckpointTargetLabel,
  buildPgmlImportDumpConfirmLabel,
  buildPgmlImportDumpDialogDescription,
  buildPgmlImportDumpInputDescription,
  buildPgmlImportDumpDialogTitle,
  buildPgmlImportBaseRequiredMessage,
  buildPgmlImportDbmlConfirmLabel,
  buildPgmlImportDbmlDialogDescription,
  buildPgmlImportDbmlDialogTitle,
  buildPgmlImportDbmlFailureMessage,
  buildPgmlImportDbmlInputDescription,
  buildPgmlImportDbmlMissingInputMessage,
  buildPgmlImportDbmlConflictMessage,
  buildPgmlImportConflictMessage,
  buildPgmlImportFailureMessage,
  buildPgmlImportMissingInputMessage,
  buildPgmlImportCheckpointRequiredDescription,
  buildPgmlImportSuccessDescription,
  buildPgmlRestoreSuccessDescription,
  buildPgmlRestoreVersionDescription
} from '~/utils/pgml-version-copy'
import { diagramRasterExportScaleFactors } from '~/utils/diagram-export'
import {
  buildPgmlImportBaseVersionItems,
  buildPgmlVersionCompareOptions
} from '~/utils/pgml-version-options'
import { initializePgmlExecutableParser } from '~/utils/pgml-executable-parser'
import {
  clonePgmlCompareExclusions,
  createEmptyPgmlCompareExclusions,
  filterPgmlSchemaModelForCompareExclusions,
  getOrderedGroupTables,
  parsePgml,
  pgmlExample,
  pgmlVersionedExample,
  replacePgmlSourceRange,
  type PgmlCompareNote,
  type PgmlCompareNoteFlag,
  type PgmlCompareNoteFilters,
  type PgmlCompareExclusions,
  type PgmlCompareNoiseFilters,
  type PgmlNodeProperties,
  type PgmlMetadataEntry,
  type PgmlSchemaModel,
  type PgmlSourceRange
} from '~/utils/pgml'
import {
  applyEditableGroupDraftToSource,
  applyEditableTableDraftToSource,
  cloneEditableGroupDraft,
  cloneEditableTableDraft,
  commonPgmlColumnTypes,
  createEditableMetadataEntryDraft,
  createEditableGroupDraft,
  createEditableGroupDraftForCreate,
  createEditableTableDraft,
  createEditableTableDraftForGroup,
  getEditableGroupDraftErrors,
  getEditableTableDraftErrors,
  serializeEditableMetadataEntries,
  type PgmlEditableGroupDraft,
  type PgmlEditableTableDraft
} from '~/utils/pgml-table-editor'
import {
  applyPgmlDocumentSchemaMetadataToModel,
  removePgmlColumnSchemaMetadataForTable,
  removePgmlSchemaMetadataForTable,
  replacePgmlColumnSchemaMetadataEntries,
  replacePgmlTableSchemaMetadataEntries
} from '~/utils/pgml-schema-metadata'
import {
  getStudioChoiceButtonClass,
  getStudioStateButtonClass,
  studioPersistentSelectMenuProps,
  getStudioSelectMenuSearchInputProps,
  getStudioTabButtonClass,
  getStudioToggleChipClass,
  joinStudioClasses,
  studioButtonClasses,
  studioColorInputClass,
  studioCompactBodyCopyClass,
  studioCompactFieldKickerClass,
  studioEmptyStateClass,
  studioFieldKickerClass,
  textareaClass
} from '~/utils/uiStyles'
import {
  defaultStudioMobilePanelTab,
  type DiagramPanelTab,
  type DiagramToolPanelTab,
  type StudioMobileCanvasView,
  type StudioMobileWorkspaceView
} from '~/utils/studio-workspace'

const PgmlDiagramCanvas = defineAsyncComponent(() => import('~/components/pgml/PgmlDiagramCanvas.vue'))

type PgmlDiagramCanvasExposed = {
  exportDiagram: (format: 'svg' | 'png', scaleFactor?: number) => Promise<void>
  exportPng: (scaleFactor: number) => Promise<void>
  exportSvg: () => Promise<void>
  getNodeLayoutProperties: () => Record<string, PgmlNodeProperties>
}

type ReferenceRelationItem = {
  description: string
  label: string
  value: '>' | '<' | '-'
}

type ReferenceTargetItem = {
  description?: string
  label: string
  value: string
}

type ReferenceActionField = 'referenceDeleteAction' | 'referenceUpdateAction'

type ImportExecutableAttachmentResolutionKind = 'dbml' | 'pg_dump'

type ImportExecutableAttachmentResolution = {
  basedOnVersionId: string
  candidates: PgmlImportExecutableAttachmentCandidate[]
  kind: ImportExecutableAttachmentResolutionKind
  pgml: string
  tableOptions: PgmlImportExecutableAttachmentTableOption[]
}

type DiagramViewDialogMode = 'create' | 'rename'
type AnalysisWorkspaceTab = 'versions' | 'compare' | 'migrations'

const {
  workspaceMode = 'diagram'
} = defineProps<{
  workspaceMode?: StudioWorkspacePage
}>()

const defaultReferenceActionSelectValue = '__pgml_default_reference_action__'

const beginnerFriendlyColumnTypePresets: Record<string, Omit<ReferenceTargetItem, 'value'>> = {
  bigint: {
    label: 'Large whole number',
    description: 'For large counts and identifiers, including explicit sequence-backed IDs. Exact type: bigint.'
  },
  boolean: {
    label: 'True / false',
    description: 'Stores yes-or-no values. Exact type: boolean.'
  },
  date: {
    label: 'Date only',
    description: 'Calendar date without a time. Exact type: date.'
  },
  integer: {
    label: 'Whole number',
    description: 'Standard integer value. Exact type: integer.'
  },
  jsonb: {
    label: 'JSON document',
    description: 'Structured JSON data you want to query efficiently. Exact type: jsonb.'
  },
  numeric: {
    label: 'Decimal number',
    description: 'Precise numbers for money and measurements. Exact type: numeric.'
  },
  text: {
    label: 'Long text',
    description: 'Plain text with no practical length limit. Exact type: text.'
  },
  time: {
    label: 'Time only',
    description: 'Clock time without a date. Exact type: time.'
  },
  timestamp: {
    label: 'Date and time',
    description: 'Stores a date and time without timezone conversion. Exact type: timestamp.'
  },
  timestamptz: {
    label: 'Date and time with timezone',
    description: 'Best default for real-world events across timezones. Exact type: timestamptz.'
  },
  tsvector: {
    label: 'Search index text',
    description: 'Postgres full-text search document value. Exact type: tsvector.'
  },
  uuid: {
    label: 'Unique ID',
    description: 'Globally unique identifier like 550e8400-e29b-41d4-a716-446655440000. Exact type: uuid.'
  },
  varchar: {
    label: 'Short text',
    description: 'Text with a chosen maximum length. Exact type: varchar.'
  }
}

const formatColumnTypeLabel = (value: string) => {
  return value
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .trim() || value
}

const route = useRoute()
const isDiagramWorkspace = computed(() => workspaceMode === 'diagram')
const isAnalysisWorkspace = computed(() => workspaceMode === 'analysis')
const studioLaunchRequest = computed(() => parseStudioLaunchQuery(route.query))
const shouldBootstrapBundledExample = computed(() => {
  if (studioLaunchRequest.value === null) {
    return true
  }

  return studioLaunchRequest.value.source === 'browser'
    && studioLaunchRequest.value.launch === 'example'
})
const initialWorkspaceSource = shouldBootstrapBundledExample.value ? pgmlExample : ''
const source: Ref<string> = useStudioWorkspaceSourceState(initialWorkspaceSource)
const studioWorkspaceSessionInitialized: Ref<boolean> = useStudioWorkspaceSessionInitializedState()
const editorDisplaySource: Ref<string> = ref(initialWorkspaceSource)
const canvasRef: Ref<PgmlDiagramCanvasExposed | null> = ref(null)
const canvasViewportResetKey: Ref<number> = ref(0)
const isExporting: Ref<boolean> = ref(false)
const versionDocumentName: Ref<string> = useStudioWorkspaceDocumentNameState('Untitled schema')
const mobileWorkspaceView: Ref<StudioMobileWorkspaceView> = ref(
  workspaceMode === 'analysis' ? 'tool-panel' : 'diagram'
)
const mobilePanelTab: Ref<DiagramPanelTab> = ref(defaultStudioMobilePanelTab)
const mobileToolPanelTab: Ref<DiagramToolPanelTab> = ref('versions')
const toolPanelVisibility: Ref<{
  open: boolean
  tab: DiagramToolPanelTab
}> = ref({
  open: workspaceMode === 'analysis',
  tab: 'versions'
})
const analysisWorkspaceTab: Ref<AnalysisWorkspaceTab> = ref('versions')
const analysisMobileView: Ref<AnalysisWorkspaceTab> = ref('versions')
const analysisSelectedCompareEntryId: Ref<string | null> = ref(null)
const checkpointDialogOpen: Ref<boolean> = ref(false)
const checkpointName: Ref<string> = ref('')
const checkpointSuggestedCreatedAt: Ref<string | null> = ref(null)
const checkpointNameIsSuggested: Ref<boolean> = ref(false)
const checkpointRole: Ref<'design' | 'implementation'> = ref('design')
const diagramViewDialogOpen: Ref<boolean> = ref(false)
const diagramViewDialogMode: Ref<DiagramViewDialogMode> = ref('create')
const diagramViewDraftName: Ref<string> = ref('')
const importDbmlDialogOpen: Ref<boolean> = ref(false)
const importDbmlBaseVersionId: Ref<string | null> = ref(null)
const importDbmlError: Ref<string | null> = ref(null)
const importDbmlFoldIdentifiersToLowercase: Ref<boolean> = ref(false)
const importDbmlParseExecutableComments: Ref<boolean> = ref(false)
const importDbmlSelectedFile: Ref<File | null> = ref(null)
const importDbmlText: Ref<string> = ref('')
const isSubmittingImportDbml: Ref<boolean> = ref(false)
const importDumpDialogOpen: Ref<boolean> = ref(false)
const importDumpBaseVersionId: Ref<string | null> = ref(null)
const importDumpError: Ref<string | null> = ref(null)
const importDumpFoldIdentifiersToLowercase: Ref<boolean> = ref(false)
const importDumpRetainMatchingTableGroups: Ref<boolean> = ref(true)
const importDumpSelectedFile: Ref<File | null> = ref(null)
const importDumpText: Ref<string> = ref('')
const isSubmittingImportDump: Ref<boolean> = ref(false)
const importExecutableAttachmentResolution: Ref<ImportExecutableAttachmentResolution | null> = ref(null)
const importExecutableAttachmentError: Ref<string | null> = ref(null)
const isSubmittingImportExecutableAttachmentResolution: Ref<boolean> = ref(false)
const restoreVersionDialogOpen: Ref<boolean> = ref(false)
const restoreVersionId: Ref<string | null> = ref(null)
const deleteVersionDialogOpen: Ref<boolean> = ref(false)
const deleteVersionId: Ref<string | null> = ref(null)
const compareExclusionsDialogOpen: Ref<boolean> = ref(false)
const compareExclusionsDraft: Ref<PgmlCompareExclusions | null> = ref(null)
const compareExclusionsSearchQuery: Ref<string> = ref('')
const compareExclusionsTypeFilter: Ref<CompareExclusionTypeFilterValue> = ref('all')
const compareNoteDialogOpen: Ref<boolean> = ref(false)
const compareNoteDraftEntryId: Ref<string | null> = ref(null)
const compareNoteDraftFlag: Ref<PgmlCompareNoteFlag> = ref('pending')
const compareNoteDraftText: Ref<string> = ref('')
const comparisonDialogOpen: Ref<boolean> = ref(false)
const comparisonDialogMode: Ref<'create' | 'rename'> = ref('create')
const comparisonDraftName: Ref<string> = ref('')
const renameVersionDialogOpen: Ref<boolean> = ref(false)
const renameVersionDraftName: Ref<string> = ref('')
const renameVersionId: Ref<string | null> = ref(null)
const tableEditorDraft: Ref<PgmlEditableTableDraft | null> = ref(null)
const tableEditorOpen: Ref<boolean> = ref(false)
const groupEditorDraft: Ref<PgmlEditableGroupDraft | null> = ref(null)
const groupEditorOpen: Ref<boolean> = ref(false)
const exportScales = [...diagramRasterExportScaleFactors]
const lastSaveErrorToastMessage: Ref<string | null> = ref(null)
const browserSchemaStatusEligible: Ref<boolean> = ref(false)
const { clearStudioHeaderActions, setStudioHeaderActions } = useStudioHeaderActions()
const { clearStudioSchemaStatus, setStudioSchemaStatus } = useStudioSchemaStatus()
const { getColumnDefaultPlaceholder, getColumnDefaultSuggestions } = usePgmlColumnDefaultSuggestions()
const toast = useToast()
const {
  editorRef,
  focusEditorDiagnostic,
  focusEditorSourceRange
} = usePgmlSourceEditor()
const studioSessionStore = useStudioSessionStore()
const studioSourcesStore = useStudioSourcesStore()
const {
  appliedLaunchKey: appliedStudioLaunchKey,
  currentSourceKind: currentPersistenceSource,
  includeLayoutInSchema,
  loadDialogOpen,
  schemaDialogMode,
  schemaDialogOpen
} = storeToRefs(studioSessionStore)
currentPersistenceSource.value = studioLaunchRequest.value?.source === 'file'
  ? 'file'
  : studioLaunchRequest.value?.source === 'gist'
    ? 'gist'
    : 'browser'
const {
  activeDiagramViewName,
  activeDiagramViewId,
  compareBaseId: versionCompareBaseId,
  compareBaseSource,
  compareExclusions: activeCompareExclusions,
  compareNoteFilters,
  compareNoiseFilters: activeCompareNoiseFilters,
  comparisonItems,
  compareTargetId: versionCompareTargetId,
  compareTargetSource,
  canCheckpoint,
  canDeleteDiagramView,
  compareRelationshipSummary,
  createCheckpoint: createVersionCheckpoint,
  createComparison,
  createNamedDiagramView,
  deleteSelectedComparisonNote,
  deleteComparison,
  deleteVersion,
  document: versionDocument,
  diagramViewItems,
  diagramViewSettings,
  deleteActiveDiagramView,
  documentEditorScope,
  editorMode: versionedEditorMode,
  isWorkspacePreview,
  latestImplementationVersion,
  loadDocument: loadVersionedDocument,
  previewSource,
  previewTargetId,
  replaceWorkspaceFromImportedSnapshot,
  replaceWorkspaceFromVersion,
  renameActiveDiagramView,
  renameComparison,
  renameVersion,
  selectComparison,
  selectDiagramView,
  selectedComparison,
  selectedComparisonId,
  serializeCurrentDocument,
  pruneSelectedComparisonNotes,
  setCompareTargets,
  setCurrentCompareExclusions,
  setCurrentCompareNoteFilters,
  setCurrentCompareNoiseFilters,
  setDocumentEditorScope,
  setPreviewTarget,
  saveSelectedComparisonNote,
  setSchemaMetadata,
  nextDiagramViewName,
  updateCurrentDiagramViewNodeProperties,
  updateCurrentDiagramViewSettings,
  versionItems: versionHistoryItems,
  versionedDocumentScopeItems,
  versionedDocumentScopeSource,
  versions
} = usePgmlStudioVersionHistory({
  documentName: computed(() => versionDocumentName.value),
  source
})
const largeDocumentCharThreshold = 50000
const largeDocumentLineThreshold = 1500
const workspaceAnalysisDiagnostics: Ref<PgmlAnalysisWorkerResponse['diagnostics']> = ref([])
const workspaceAnalysisHasBlockingErrors: Ref<boolean> = ref(false)
const workspaceAnalysisParsedModel: ShallowRef<PgmlSchemaModel> = shallowRef(parsePgml(source.value))
const workspaceAnalysisRevision: Ref<number> = ref(0)
const workspaceAnalysisRequestRevision: Ref<number> = ref(0)
const executableParserReadyRevision: Ref<number> = ref(0)
const lastRenderableWorkspaceModel: ShallowRef<PgmlSchemaModel> = shallowRef(applyPgmlDocumentSchemaMetadataToModel(
  parsePgml(source.value),
  versionDocument.value.schemaMetadata
))
let pgmlAnalysisWorker: Worker | null = null

const syncWorkspaceAnalysisLocally = (
  nextSource: string,
  revision: number
) => {
  const analysis = analyzePgmlDocument(nextSource)

  workspaceAnalysisDiagnostics.value = analysis.diagnostics
  workspaceAnalysisHasBlockingErrors.value = hasBlockingPgmlDiagnostics(analysis.diagnostics)
  workspaceAnalysisParsedModel.value = parsePgml(nextSource)
  workspaceAnalysisRevision.value = revision
}

const ensurePgmlAnalysisWorker = () => {
  if (!import.meta.client) {
    return null
  }

  if (pgmlAnalysisWorker) {
    return pgmlAnalysisWorker
  }

  const worker = new Worker(new URL('../../workers/pgml-analysis.worker.ts', import.meta.url), {
    type: 'module'
  })

  worker.onmessage = (event: MessageEvent<PgmlAnalysisWorkerResponse>) => {
    if (event.data.revision !== workspaceAnalysisRequestRevision.value) {
      return
    }

    workspaceAnalysisDiagnostics.value = event.data.diagnostics
    workspaceAnalysisHasBlockingErrors.value = event.data.hasBlockingErrors
    workspaceAnalysisParsedModel.value = event.data.parsedModel
    workspaceAnalysisRevision.value = event.data.revision
  }
  worker.onerror = () => {
    pgmlAnalysisWorker?.terminate()
    pgmlAnalysisWorker = null
    syncWorkspaceAnalysisLocally(source.value, workspaceAnalysisRequestRevision.value)
  }
  pgmlAnalysisWorker = worker

  return worker
}

const queueWorkspaceAnalysis = (nextSource: string) => {
  const nextRevision = workspaceAnalysisRequestRevision.value + 1

  workspaceAnalysisRequestRevision.value = nextRevision
  const worker = ensurePgmlAnalysisWorker()

  if (!worker) {
    syncWorkspaceAnalysisLocally(nextSource, nextRevision)
    return
  }

  worker.postMessage({
    revision: nextRevision,
    source: nextSource
  })
}

const parsePgmlForCurrentExecutableParser = (
  nextSource: string,
  parserReadyRevision: number
) => {
  if (parserReadyRevision < 0) {
    return parsePgml(nextSource)
  }

  return parsePgml(nextSource)
}

watch(source, (nextSource) => {
  queueWorkspaceAnalysis(nextSource)
}, {
  immediate: true
})

if (import.meta.client) {
  void initializePgmlExecutableParser().then(() => {
    executableParserReadyRevision.value += 1
    queueWorkspaceAnalysis(source.value)
  }).catch(() => null)
}
const {
  isEditorPanelVisible,
  isCompactStudioLayout,
  layoutShellRef,
  resizeEditorPanelBy,
  startEditorResize,
  studioLayoutStyle,
  toggleEditorPanelVisibility
} = useStudioEditorLayout()
const secondaryModalButtonClass = studioButtonClasses.secondary
const primaryModalButtonClass = studioButtonClasses.primary
const tableEditorAddButtonClass = studioButtonClasses.primary
const tableEditorRemoveButtonClass = studioButtonClasses.iconGhost
const versionedEditorModeItems = [
  {
    label: 'Workspace draft',
    value: 'head'
  },
  {
    label: 'Versioned document',
    value: 'document'
  }
] satisfies Array<{
  label: string
  value: PgmlVersionedDocumentEditorMode
}>
const documentEditorScopeItems = computed<PgmlVersionedDocumentScopeItem[]>(() => {
  return versionedDocumentScopeItems.value
})
const checkpointRoleItems = [
  {
    description: 'Lock a draft checkpoint that represents the next intended PGML design.',
    label: 'Design',
    value: 'design'
  },
  {
    description: 'Lock a checkpoint that reflects imported implementation state from a dump.',
    label: 'Implementation',
    value: 'implementation'
  }
] satisfies Array<ReferenceTargetItem & {
  value: 'design' | 'implementation'
}>
const isEditableWorkspaceDraft = computed(() => {
  return versionedEditorMode.value === 'head' && isWorkspacePreview.value
})
const largeDocumentMetrics = computed(() => {
  const value = displayedEditorSource.value

  return {
    characterCount: value.length,
    lineCount: value.split('\n').length
  }
})
const isLargeDocumentMode = computed(() => {
  return isEditableWorkspaceDraft.value && (
    largeDocumentMetrics.value.characterCount >= largeDocumentCharThreshold
    || largeDocumentMetrics.value.lineCount >= largeDocumentLineThreshold
  )
})
const editorCommitDebounceMs = computed(() => {
  if (!isEditableWorkspaceDraft.value) {
    return 0
  }

  return isLargeDocumentMode.value ? 200 : 75
})
const editorDiagnosticsDelayMs = computed(() => {
  if (!isEditableWorkspaceDraft.value) {
    return 150
  }

  return isLargeDocumentMode.value ? 500 : 150
})
// Keep raw PGML completions available even on large drafts. Commit and lint
// throttling already absorb the heavy document cost without making the editor
// feel inert while typing.
const editorActivateCompletionOnTyping = true
const previewSourceDiagnostics = computed(() => {
  if (isWorkspacePreview.value) {
    return workspaceAnalysisDiagnostics.value
  }

  return analyzePgmlDocument(previewSource.value).diagnostics
})
const sourceDiagnostics = computed(() => {
  if (versionedEditorMode.value === 'document') {
    return []
  }

  return previewSourceDiagnostics.value
})
const sourceErrorDiagnostics = computed(() => {
  return sourceDiagnostics.value.filter(diagnostic => diagnostic.severity === 'error')
})
const sourceWarningDiagnostics = computed(() => {
  return sourceDiagnostics.value.filter(diagnostic => diagnostic.severity === 'warning')
})
const hasBlockingSourceErrors = computed(() => sourceErrorDiagnostics.value.length > 0)
const workspaceHasBlockingSourceErrors = computed(() => {
  return workspaceAnalysisHasBlockingErrors.value
})
const workspaceParsedModelWithSchemaMetadata = computed(() => {
  return applyPgmlDocumentSchemaMetadataToModel(
    workspaceAnalysisParsedModel.value,
    versionDocument.value.schemaMetadata
  )
})
watch(workspaceParsedModelWithSchemaMetadata, (nextModel) => {
  if (workspaceHasBlockingSourceErrors.value) {
    return
  }

  lastRenderableWorkspaceModel.value = nextModel
}, {
  immediate: true
})
const parsedModel = computed(() => {
  const parserReadyRevision = executableParserReadyRevision.value

  if (isWorkspacePreview.value) {
    return workspaceHasBlockingSourceErrors.value
      ? lastRenderableWorkspaceModel.value
      : workspaceParsedModelWithSchemaMetadata.value
  }

  return applyPgmlDocumentSchemaMetadataToModel(
    parsePgmlForCurrentExecutableParser(previewSource.value, parserReadyRevision),
    versionDocument.value.schemaMetadata
  )
})
const workspaceParsedModel = computed(() => {
  return workspaceHasBlockingSourceErrors.value
    ? lastRenderableWorkspaceModel.value
    : workspaceParsedModelWithSchemaMetadata.value
})
const canEmbedLayout = computed(() => !workspaceHasBlockingSourceErrors.value)
const isEditorReadOnly = computed(() => {
  return versionedEditorMode.value === 'document' || !isWorkspacePreview.value
})
const editorReadOnlyLabel = computed(() => {
  return buildPgmlEditorReadOnlyLabel({
    isWorkspacePreview: isWorkspacePreview.value,
    mode: versionedEditorMode.value
  })
})
const buildDocumentEditorModeDescription = () => {
  if (documentEditorScope.value === 'workspace-block') {
    return buildPgmlDocumentEditorModeDescription({
      scope: 'workspace'
    })
  }

  if (documentEditorScope.value.startsWith('version:')) {
    const scopedVersionId = documentEditorScope.value.replace(/^version:/, '')
    const scopedVersion = versions.value.find(version => version.id === scopedVersionId) || null

    return buildPgmlDocumentEditorModeDescription({
      scope: 'version',
      scopeLabel: scopedVersion ? getVersionLabel(scopedVersion) : null
    })
  }

  return buildPgmlDocumentEditorModeDescription({
    scope: 'all'
  })
}
const editorModeDescription = computed(() => {
  if (versionedEditorMode.value === 'document') {
    return buildDocumentEditorModeDescription()
  }

  if (!isWorkspacePreview.value) {
    const previewVersion = versions.value.find(version => version.id === previewTargetId.value) || null
    const previewLabel = previewVersion ? getVersionLabel(previewVersion) : 'the selected version'

    return buildPgmlVersionPreviewDescription(previewLabel)
  }

  return buildPgmlWorkspaceEditorDescription()
})
const getPreviewTargetDocumentScope = (): Parameters<typeof setDocumentEditorScope>[0] => {
  return previewTargetId.value === 'workspace'
    ? 'workspace-block'
    : `version:${previewTargetId.value}`
}
const previewTargetDocumentSource = computed(() => {
  return serializePgmlDocumentScope(versionDocument.value, getPreviewTargetDocumentScope())
})
const displayedEditorSource = computed(() => {
  if (versionedEditorMode.value === 'document') {
    return versionedDocumentScopeSource.value
  }

  return isWorkspacePreview.value ? previewSource.value : previewTargetDocumentSource.value
})
const importDumpSelectedFileName = computed(() => importDumpSelectedFile.value?.name || '')
const importDbmlSelectedFileName = computed(() => importDbmlSelectedFile.value?.name || '')
const isImportBusy = computed(() => {
  return isSubmittingImportDbml.value
    || isSubmittingImportDump.value
    || isSubmittingImportExecutableAttachmentResolution.value
})
const importBusyTitle = computed(() => {
  if (isSubmittingImportExecutableAttachmentResolution.value) {
    return 'Applying import selections'
  }

  if (isSubmittingImportDbml.value) {
    return 'Importing DBML'
  }

  if (isSubmittingImportDump.value) {
    return 'Importing pg_dump'
  }

  return ''
})
const importBusyDescription = computed(() => {
  if (isSubmittingImportExecutableAttachmentResolution.value) {
    return 'Updating executable attachment metadata and replacing the active workspace.'
  }

  if (isSubmittingImportDbml.value) {
    return 'Parsing DBML, extracting executable objects, and preparing the imported workspace.'
  }

  if (isSubmittingImportDump.value) {
    return 'Parsing the dump, converting schema objects into PGML, and preparing the imported workspace.'
  }

  return ''
})
const importExecutableAttachmentResolutionTitle = computed(() => {
  const resolution = importExecutableAttachmentResolution.value

  if (!resolution) {
    return ''
  }

  return resolution.kind === 'dbml'
    ? 'Place imported DBML executables'
    : 'Place imported pg_dump executables'
})
const importExecutableAttachmentResolutionDescription = computed(() => {
  const resolution = importExecutableAttachmentResolution.value

  if (!resolution) {
    return ''
  }

  return resolution.kind === 'dbml'
    ? 'Some imported executable objects do not have a certain table attachment. Select one or more tables for each item, or leave it empty to keep that object standalone.'
    : 'Some imported executable objects do not have a certain table attachment. Select one or more tables for each item, or leave it empty to keep that object standalone.'
})
const mobileCanvasView = computed<StudioMobileCanvasView>(() => {
  if (mobileWorkspaceView.value === 'panel' || mobileWorkspaceView.value === 'tool-panel') {
    return mobileWorkspaceView.value
  }

  return 'diagram'
})
const assignEditorRef = (value: unknown) => {
  editorRef.value = value as PgmlSourceEditorHandle | null
}
const assignLayoutShellRef = (value: unknown) => {
  layoutShellRef.value = value instanceof HTMLDivElement ? value : null
}

const getLiveWorkspaceSource = () => {
  if (!isEditableWorkspaceDraft.value) {
    return source.value
  }

  if (!editorRef.value?.hasPendingChanges()) {
    return source.value
  }

  const editorValue = editorRef.value.getValue()

  return editorValue === source.value ? source.value : editorValue
}

const waitForLatestWorkspaceAnalysis = async () => {
  if (!isWorkspacePreview.value || workspaceAnalysisRevision.value >= workspaceAnalysisRequestRevision.value) {
    return
  }

  const startedAt = Date.now()

  while (
    workspaceAnalysisRevision.value < workspaceAnalysisRequestRevision.value
    && Date.now() - startedAt < 1500
  ) {
    await new Promise((resolve) => {
      setTimeout(resolve, 16)
    })
  }
}

const flushPendingEditorChanges = async (options: {
  waitForAnalysis?: boolean
} = {}) => {
  if (editorRef.value?.hasPendingChanges()) {
    await editorRef.value.flushPendingChanges()
  }

  if (options.waitForAnalysis) {
    await waitForLatestWorkspaceAnalysis()
  }
}

const buildSchemaText = (includeLayout: boolean) => {
  const shouldIncludeLayout = includeLayout && canEmbedLayout.value

  return serializeCurrentDocument(shouldIncludeLayout, getLiveWorkspaceSource())
}

const markBrowserSchemaStatusEligible = () => {
  if (currentPersistenceSource.value !== 'browser') {
    return
  }

  browserSchemaStatusEligible.value = true
}

const persistBrowserWorkspaceMutation = async () => {
  if (currentPersistenceSource.value !== 'browser') {
    return true
  }

  markBrowserSchemaStatusEligible()

  return await saveSchemaToBrowser()
}

const resetBrowserSchemaStatusEligibility = () => {
  browserSchemaStatusEligible.value = false
}

const syncSourceWithNodeProperties = (nodeProperties: Record<string, PgmlNodeProperties>) => {
  if (isWorkspacePreview.value && workspaceHasBlockingSourceErrors.value) {
    return
  }

  markBrowserSchemaStatusEligible()
  updateCurrentDiagramViewNodeProperties(nodeProperties)
}

const updateDiagramViewSettings = (settings: {
  snapToGrid?: boolean
  showExecutableObjects?: boolean
  showRelationshipLines?: boolean
  showTableFields?: boolean
}) => {
  markBrowserSchemaStatusEligible()
  const didUpdate = updateCurrentDiagramViewSettings(settings)

  if (!didUpdate) {
    return
  }

  revealPreviewTargetDocumentSource()
}

const selectActiveDiagramView = (viewId: string) => {
  markBrowserSchemaStatusEligible()
  const didSelect = selectDiagramView(viewId)

  if (!didSelect) {
    return
  }

  revealPreviewTargetDocumentSource()
}

const createActiveDiagramView = () => {
  openCreateDiagramViewDialog()
}

const renameSelectedDiagramView = () => {
  openRenameDiagramViewDialog()
}

const deleteSelectedDiagramView = () => {
  markBrowserSchemaStatusEligible()
  const didDelete = deleteActiveDiagramView()

  if (!didDelete) {
    return
  }

  revealPreviewTargetDocumentSource()
}

watch(displayedEditorSource, (nextSource) => {
  if (editorDisplaySource.value === nextSource) {
    return
  }

  editorDisplaySource.value = nextSource
}, {
  immediate: true
})

watch(editorDisplaySource, (nextSource) => {
  if (isEditorReadOnly.value || nextSource === source.value) {
    return
  }

  markBrowserSchemaStatusEligible()
  source.value = nextSource
})

const {
  clearSchema: clearStudioSchema,
  currentSchemaName,
  currentSchemaUpdatedAt,
  clearSaveSchemaTarget,
  deleteSavedSchema,
  formatSavedAt,
  hasPendingLocalChanges,
  hasSavedSchemaInSession,
  isSavedToLocalStorage,
  isSavingToLocalStorage,
  localStorageSaveError,
  loadExample: loadStudioExample,
  loadSavedSchema: loadStudioSavedSchema,
  openSchemaDialog,
  orderedSavedSchemas,
  saveSchemaActionLabel,
  saveSchemaTarget,
  saveSchemaToBrowser,
  selectSaveSchemaTarget,
  schemaActionDescription,
  schemaActionTitle
} = usePgmlStudioSchemas({
  applyLoadedSchemaText: loadVersionedDocument,
  autosaveEnabled: computed(() => currentPersistenceSource.value === 'browser'),
  browserPersistenceEnabled: computed(() => currentPersistenceSource.value === 'browser'),
  buildSchemaText,
  canEmbedLayout,
  initialSource: pgmlVersionedExample,
  restoreLatestOnSetup: studioLaunchRequest.value === null && !studioWorkspaceSessionInitialized.value,
  source
})

studioWorkspaceSessionInitialized.value = true
const {
  computerFileSaveError,
  currentComputerFileName,
  currentComputerFileUpdatedAt,
  formatSavedAt: formatComputerFileSavedAt,
  hasPendingComputerFileChanges,
  hasSavedComputerFileInSession,
  hasSelectedComputerFile,
  isSavedToComputerFile,
  isSavingToComputerFile,
  loadRecentComputerFileById,
  openComputerFileFromPicker,
  passiveComputerFileWritesSupported,
  recentComputerFiles,
  refreshRecentComputerFiles,
  saveSchemaToComputerFile,
  syncLoadedComputerFile
} = usePgmlStudioComputerFiles({
  applyLoadedFileText: loadVersionedDocument,
  buildSchemaText,
  enabled: computed(() => currentPersistenceSource.value === 'file'),
  source
})
const {
  currentGistFileName,
  currentGistFileUpdatedAt,
  formatSavedAt: formatGistFileSavedAt,
  gistFileSaveError,
  githubGistFiles,
  hasPendingGistFileChanges,
  hasSavedGistFileInSession,
  hasSelectedGistFile,
  isSavedToGistFile,
  isSavingToGistFile,
  loadGistPgmlFileByName,
  saveSchemaToGistFile
} = usePgmlStudioGists({
  applyLoadedFileText: loadVersionedDocument,
  buildSchemaText,
  source
})

const requestCanvasViewportReset = () => {
  canvasViewportResetKey.value += 1
}

const withViewportReset = (action: () => void) => {
  // Loading or clearing a schema changes the rendered node set, so the viewport
  // reset stays coupled to those entry points instead of being easy to forget.
  return () => {
    action()
    requestCanvasViewportReset()
  }
}

const loadExample = withViewportReset(() => {
  resetBrowserSchemaStatusEligibility()
  loadStudioExample()
})
const clearSchema = withViewportReset(() => {
  resetBrowserSchemaStatusEligibility()
  clearStudioSchema()
})

const loadSavedSchema = (schema: SavedPgmlSchema) => {
  currentPersistenceSource.value = 'browser'
  resetBrowserSchemaStatusEligibility()
  loadStudioSavedSchema(schema)
  requestCanvasViewportReset()
}

const loadRecentComputerFile = async (recentFileId: string) => {
  const didLoadRecentFile = await loadRecentComputerFileById(recentFileId)

  if (!didLoadRecentFile) {
    return
  }

  currentPersistenceSource.value = 'file'
  resetBrowserSchemaStatusEligibility()
  loadDialogOpen.value = false
  requestCanvasViewportReset()
}

const loadGistFile = async (filename: string) => {
  const didLoadGistFile = await loadGistPgmlFileByName(filename)

  if (!didLoadGistFile) {
    return
  }

  currentPersistenceSource.value = 'gist'
  resetBrowserSchemaStatusEligibility()
  loadDialogOpen.value = false
  requestCanvasViewportReset()
}

const chooseComputerFileFromLoadDialog = async () => {
  const didOpenComputerFile = await openComputerFileFromPicker()

  if (!didOpenComputerFile) {
    return
  }

  currentPersistenceSource.value = 'file'
  resetBrowserSchemaStatusEligibility()
  loadDialogOpen.value = false
  requestCanvasViewportReset()
}

const removeRecentComputerFile = async (recentFileId: string) => {
  const didDeleteRecentFile = await studioSourcesStore.deleteRecentComputerFile(recentFileId)

  if (didDeleteRecentFile) {
    return
  }

  pushComputerFileActionErrorToast(
    studioSourcesStore.recentComputerFilesError || 'Unable to remove the recent file.'
  )
}

const activeSchemaName = computed(() => {
  if (currentPersistenceSource.value === 'file') {
    return currentComputerFileName.value || 'Untitled schema'
  }

  if (currentPersistenceSource.value === 'gist') {
    return currentGistFileName.value || 'Untitled schema'
  }

  return currentSchemaName.value
})
const activeSchemaUpdatedAt = computed(() => {
  if (currentPersistenceSource.value === 'file') {
    return currentComputerFileUpdatedAt.value
  }

  if (currentPersistenceSource.value === 'gist') {
    return currentGistFileUpdatedAt.value
  }

  return currentSchemaUpdatedAt.value
})
const activeSaveError = computed(() => {
  if (currentPersistenceSource.value === 'file') {
    return computerFileSaveError.value
  }

  if (currentPersistenceSource.value === 'gist') {
    return gistFileSaveError.value
  }

  return localStorageSaveError.value
})
const pushSaveErrorToast = (description: string) => {
  lastSaveErrorToastMessage.value = description
  toast.add({
    title: 'Save failed',
    description,
    color: 'error',
    icon: 'i-lucide-circle-alert'
  })
}
const pushSaveSuccessToast = (description: string) => {
  toast.add({
    title: 'Schema saved',
    description,
    color: 'success',
    icon: 'i-lucide-check'
  })
}
const pushComputerFileActionErrorToast = (description: string) => {
  toast.add({
    title: 'Computer file action failed',
    description,
    color: 'error',
    icon: 'i-lucide-circle-alert'
  })
}
const getSaveSuccessToastDescription = () => {
  if (currentPersistenceSource.value === 'file') {
    return 'Saved to the selected file.'
  }

  if (currentPersistenceSource.value === 'gist') {
    return 'Saved to GitHub Gist.'
  }

  return 'Saved to browser local storage.'
}
const activeIsSaving = computed(() => {
  if (currentPersistenceSource.value === 'file') {
    return isSavingToComputerFile.value
  }

  if (currentPersistenceSource.value === 'gist') {
    return isSavingToGistFile.value
  }

  return isSavingToLocalStorage.value
})
const activeHasPendingChanges = computed(() => {
  if (currentPersistenceSource.value === 'file') {
    return hasPendingComputerFileChanges.value
  }

  if (currentPersistenceSource.value === 'gist') {
    return hasPendingGistFileChanges.value
  }

  return hasPendingLocalChanges.value
})
const activeIsSaved = computed(() => {
  if (currentPersistenceSource.value === 'file') {
    return isSavedToComputerFile.value
  }

  if (currentPersistenceSource.value === 'gist') {
    return isSavedToGistFile.value
  }

  return isSavedToLocalStorage.value
})
const activeHasSavedInSession = computed(() => {
  if (currentPersistenceSource.value === 'file') {
    return hasSavedComputerFileInSession.value
  }

  if (currentPersistenceSource.value === 'gist') {
    return hasSavedGistFileInSession.value
  }

  return hasSavedSchemaInSession.value
})
const activeSavedAtFormatter = computed(() => {
  if (currentPersistenceSource.value === 'file') {
    return formatComputerFileSavedAt
  }

  if (currentPersistenceSource.value === 'gist') {
    return formatGistFileSavedAt
  }

  return formatSavedAt
})
const saveDialogActionLabel = computed(() => {
  if (currentPersistenceSource.value === 'file') {
    return 'Save to file'
  }

  if (currentPersistenceSource.value === 'gist') {
    return 'Save to Gist'
  }

  return saveSchemaActionLabel.value
})
const schemaActionDescriptionText = computed(() => {
  if (schemaDialogMode.value === 'download') {
    return canEmbedLayout.value
      ? 'Choose whether to embed the current canvas layout into the PGML text before downloading it.'
      : 'The current PGML has a parse error, so only the raw text can be downloaded right now.'
  }

  if (currentPersistenceSource.value === 'file') {
    return canEmbedLayout.value
      ? passiveComputerFileWritesSupported.value
        ? 'Save the current PGML back to the selected `.pgml` file on your computer. File-backed saves always include the current canvas layout so autosave stays aligned with the selected file.'
        : 'Mobile Chrome requires explicit saves for `.pgml` files, so use Save to write the current PGML back to the selected file. File-backed saves always include the current canvas layout when PGML can be parsed.'
      : passiveComputerFileWritesSupported.value
        ? 'The current PGML has a parse error, so only the raw text can be written back to the selected file right now.'
        : 'Mobile Chrome requires explicit saves for `.pgml` files, and the current PGML has a parse error, so only the raw text can be written back to the selected file right now.'
  }

  if (currentPersistenceSource.value === 'gist') {
    return canEmbedLayout.value
      ? 'Save the current PGML back to the selected file in the connected GitHub Gist. Gist-backed files use manual saves only.'
      : 'The current PGML has a parse error, so only the raw text can be written back to the selected Gist file right now.'
  }

  return schemaActionDescription.value
})
const loadDialogTitle = computed(() => {
  if (currentPersistenceSource.value === 'file') {
    return 'Open file'
  }

  if (currentPersistenceSource.value === 'gist') {
    return 'Open Gist file'
  }

  return 'Load saved schema'
})
const loadDialogDescription = computed(() => {
  if (currentPersistenceSource.value === 'file') {
    return 'Recent `.pgml` files you opened or created on this computer.'
  }

  if (currentPersistenceSource.value === 'gist') {
    return 'Remote `.pgml` files in the connected GitHub Gist.'
  }

  return 'Saved PGML files stored in this browser.'
})
const exportBaseName = computed(() => slugifySchemaName(activeSchemaName.value))
const exportPreferenceKey = computed(() => `name:${slugifySchemaName(activeSchemaName.value)}`)
const getVersionLabel = (input: {
  id: string
  name: string | null
}) => {
  return getPgmlVersionDisplayLabel({
    activeViewId: null,
    compareExclusions: createEmptyPgmlCompareExclusions(),
    createdAt: '',
    id: input.id,
    name: input.name,
    parentVersionId: null,
    role: 'design',
    snapshot: {
      source: ''
    },
    views: []
  })
}
const versionPanelItems = computed(() => {
  return versionHistoryItems.value.map((version) => {
    return {
      ancestorCount: version.ancestorCount,
      branchLeafCount: version.branchLeafCount,
      branchMaxDepth: version.branchMaxDepth,
      branchVersionCount: version.branchVersionCount,
      branchRootId: version.branchRootId,
      branchRootLabel: version.branchRootLabel,
      canDelete: version.canDelete,
      childCount: version.childCount,
      createdAt: formatSavedPgmlSchemaTime(version.createdAt),
      deleteBlockedReason: version.deleteBlockedReason,
      descendantCount: version.descendantCount,
      depth: version.depth,
      id: version.id,
      isLeaf: version.isLeaf,
      isLatestByRole: version.isLatestByRole,
      isLatestOverall: version.isLatestOverall,
      isRoot: version.isRoot,
      siblingCount: version.siblingCount,
      isWorkspaceBase: version.isWorkspaceBase,
      label: getVersionLabel(version),
      lineageLabel: version.lineageLabel,
      parentVersionLabel: version.parentVersionLabel,
      parentVersionId: version.parentVersionId,
      role: version.role
    }
  })
})
const latestVersionId = computed(() => {
  return getLatestPgmlVersion(versionDocument.value)?.id || null
})
const versionCompareOptions = computed(() => {
  return buildPgmlVersionCompareOptions(versionPanelItems.value)
})
const importDumpBaseVersionItems = computed<ReferenceTargetItem[]>(() => {
  return buildPgmlImportBaseVersionItems(versionPanelItems.value)
})
const createEmptyCompareMigrationBundle = (): PgmlVersionMigrationBundle => {
  return {
    kysely: {
      migration: {
        content: '',
        fileName: 'pgml-version.migration.ts',
        label: 'Version Migration',
        warnings: []
      }
    },
    meta: {
      hasChanges: false,
      historyAware: false,
      statementCount: 0,
      stepCount: 0,
      validation: {
        isValid: true,
        issues: []
      },
      warningCount: 0
    },
    sql: {
      migration: {
        content: '',
        fileName: 'pgml-version.migration.sql',
        label: 'Version Migration SQL',
        warnings: []
      }
    },
    steps: []
  }
}
const shouldBuildCompareArtifacts = computed(() => {
  if (isAnalysisWorkspace.value) {
    return analysisWorkspaceTab.value === 'compare'
  }

  return toolPanelVisibility.value.open && toolPanelVisibility.value.tab === 'compare'
})
const shouldBuildMigrationArtifacts = computed(() => {
  if (isAnalysisWorkspace.value) {
    return analysisWorkspaceTab.value === 'migrations'
  }

  return toolPanelVisibility.value.open && toolPanelVisibility.value.tab === 'migrations'
})
const shouldBuildVersionArtifacts = computed(() => {
  return shouldBuildCompareArtifacts.value || shouldBuildMigrationArtifacts.value
})
type CompareExclusionOptionKind = 'entity' | 'group' | 'table'
type CompareExclusionTypeFilterValue = 'all' | 'group' | 'table' | PgmlDiagramCompareEntityKind

type CompareExclusionOption = {
  entityKind?: PgmlDiagramCompareEntityKind | null
  id: string
  isStale?: boolean
  kind: CompareExclusionOptionKind
  label: string
  searchText: string
  value: string
}
type CompareExclusionGroupSection = {
  id: string
  groupOption: CompareExclusionOption
  tableOptions: CompareExclusionOption[]
}
type CompareExclusionEntitySection = {
  entityKind: PgmlDiagramCompareEntityKind
  id: string
  options: CompareExclusionOption[]
  title: string
}
type CompareExclusionTypeFilterItem = {
  count: number
  label: string
  value: CompareExclusionTypeFilterValue
}

type CompareNoteFlagItem = {
  description: string
  label: string
  value: PgmlCompareNoteFlag
}

const compareExclusionEntityKindOrder: PgmlDiagramCompareEntityKind[] = [
  'index',
  'constraint',
  'reference',
  'custom-type',
  'function',
  'procedure',
  'trigger',
  'sequence',
  'layout'
]

const compareExclusionEntitySectionTitleByKind: Readonly<Record<PgmlDiagramCompareEntityKind, string>> = Object.freeze({
  'column': 'Columns',
  'constraint': 'Constraints',
  'custom-type': 'Types',
  'function': 'Functions',
  'group': 'Groups',
  'index': 'Indexes',
  'layout': 'Layout',
  'procedure': 'Procedures',
  'reference': 'References',
  'sequence': 'Sequences',
  'table': 'Tables',
  'trigger': 'Triggers'
})
const compareExclusionChipExtraClass = [
  'max-w-full',
  'min-w-0',
  'px-2',
  'py-1',
  'font-mono',
  'text-[0.58rem]',
  'uppercase',
  'tracking-[0.08em]',
  'whitespace-normal',
  'break-all',
  'text-left',
  'leading-4'
].join(' ')
const compareExclusionTypeFilterChipExtraClass = [
  'px-2',
  'py-1',
  'font-mono',
  'text-[0.58rem]',
  'uppercase',
  'tracking-[0.08em]'
].join(' ')
const compareExclusionTypeFilterOrder: CompareExclusionTypeFilterValue[] = [
  'all',
  'group',
  'table',
  ...compareExclusionEntityKindOrder
]
const compareNoteFlagItems: CompareNoteFlagItem[] = [
  {
    description: 'Work is still open on this difference.',
    label: 'Pending',
    value: 'pending'
  },
  {
    description: 'The difference is intentional and can be left alone.',
    label: 'Ignore',
    value: 'ignore'
  },
  {
    description: 'The difference has already been handled.',
    label: 'Fixed',
    value: 'fixed'
  },
  {
    description: 'Work is blocked by another dependency or decision.',
    label: 'Blocked',
    value: 'blocked'
  }
]

const compareBaseRawModel = computed<PgmlSchemaModel | null>(() => {
  const parserReadyRevision = executableParserReadyRevision.value

  if (!shouldBuildVersionArtifacts.value) {
    return null
  }

  return parsePgmlForCurrentExecutableParser(compareBaseSource.value, parserReadyRevision)
})
const compareTargetRawModel = computed<PgmlSchemaModel | null>(() => {
  const parserReadyRevision = executableParserReadyRevision.value

  if (!shouldBuildVersionArtifacts.value) {
    return null
  }

  return parsePgmlForCurrentExecutableParser(compareTargetSource.value, parserReadyRevision)
})
const compareBaseModel = computed<PgmlSchemaModel | null>(() => {
  return compareBaseRawModel.value
    ? filterPgmlSchemaModelForCompareExclusions(compareBaseRawModel.value, activeCompareExclusions.value)
    : null
})
const compareTargetModel = computed<PgmlSchemaModel | null>(() => {
  return compareTargetRawModel.value
    ? filterPgmlSchemaModelForCompareExclusions(compareTargetRawModel.value, activeCompareExclusions.value)
    : null
})
const compareDiff = computed(() => {
  if (!compareBaseModel.value || !compareTargetModel.value) {
    return null
  }

  return diffPgmlSchemaModels(compareBaseModel.value, compareTargetModel.value)
})
const compareRawEntries = computed<PgmlDiagramCompareEntry[]>(() => {
  if (!compareDiff.value || !compareBaseModel.value || !compareTargetModel.value) {
    return []
  }

  return buildPgmlDiagramCompareEntries(
    compareDiff.value,
    compareBaseModel.value,
    compareTargetModel.value
  )
})
const compareEntries = computed<PgmlDiagramCompareEntry[]>(() => {
  return filterPgmlDiagramCompareEntriesForNoise(
    filterPgmlDiagramCompareEntriesForExclusions(compareRawEntries.value, activeCompareExclusions.value),
    activeCompareNoiseFilters.value
  )
})
const compareRawEntriesById = computed<Record<string, PgmlDiagramCompareEntry>>(() => {
  return compareRawEntries.value.reduce<Record<string, PgmlDiagramCompareEntry>>((entries, entry) => {
    entries[entry.id] = entry
    return entries
  }, {})
})
const activeCompareNotes = computed<PgmlCompareNote[]>(() => {
  return selectedComparison.value?.notes || []
})
const activeCompareNoteForDraftEntry = computed<PgmlCompareNote | null>(() => {
  if (!compareNoteDraftEntryId.value) {
    return null
  }

  return activeCompareNotes.value.find((note) => {
    return note.entryId === compareNoteDraftEntryId.value
  }) || null
})
const compareNoteDraftEntry = computed<PgmlDiagramCompareEntry | null>(() => {
  if (!compareNoteDraftEntryId.value) {
    return null
  }

  return compareRawEntriesById.value[compareNoteDraftEntryId.value] || null
})
const compareBaseLabel = computed(() => {
  if (versionCompareBaseId.value === null) {
    return 'empty'
  }

  if (versionCompareBaseId.value === 'workspace') {
    return 'workspace'
  }

  return getVersionLabel({
    id: versionCompareBaseId.value,
    name: versions.value.find(version => version.id === versionCompareBaseId.value)?.name || null
  })
})
const compareTargetLabel = computed(() => {
  if (versionCompareTargetId.value === 'workspace') {
    return 'workspace'
  }

  return getVersionLabel({
    id: versionCompareTargetId.value,
    name: versions.value.find(version => version.id === versionCompareTargetId.value)?.name || null
  })
})
const analysisComparisonLabel = computed(() => {
  if (selectedComparisonId.value === null) {
    return 'Current comparison'
  }

  return comparisonItems.value.find((item) => {
    return item.value === selectedComparisonId.value
  })?.label || 'Saved comparison'
})
const buildCompareMigrationBaseName = () => {
  // File names should stay stable for the currently selected compare pair so
  // repeated downloads produce predictable SQL/Kysely artifacts.
  return `${exportBaseName.value}-${slugifySchemaName(compareBaseLabel.value)}-to-${slugifySchemaName(compareTargetLabel.value)}`
}
const workspaceBaseLabel = computed(() => {
  const baseVersion = versions.value.find((version) => {
    return version.id === versionDocument.value.workspace.basedOnVersionId
  }) || null

  return buildPgmlWorkspaceBaseLabel({
    basedOnVersionId: versionDocument.value.workspace.basedOnVersionId,
    fallbackVersionId: versionDocument.value.workspace.basedOnVersionId,
    versionLabel: baseVersion ? getVersionLabel(baseVersion) : null
  })
})
const workspaceStatus = computed(() => {
  return buildPgmlWorkspaceStatus({
    canCheckpoint: canCheckpoint.value
  })
})
const compareMigrationBundle = computed(() => {
  if (!shouldBuildMigrationArtifacts.value) {
    return createEmptyCompareMigrationBundle()
  }

  return buildPgmlVersionMigrationBundle({
    baseSource: compareBaseSource.value,
    baseVersionId: versionCompareBaseId.value,
    document: versionDocument.value,
    hasSelectedBase: versionCompareBaseId.value !== null,
    targetId: versionCompareTargetId.value,
    targetSource: compareTargetSource.value
  }, {
    baseName: buildCompareMigrationBaseName()
  })
})
const compareMigrationHasOutput = computed(() => {
  // Warning-only transitions still need the migration panel so the user can
  // inspect and download the manual follow-up notes for that compare pair.
  return compareMigrationBundle.value.meta.hasChanges || compareMigrationBundle.value.meta.warningCount > 0
})
const importDumpDialogCopy = computed(() => {
  const baseVersion = importDumpBaseVersionId.value
    ? versions.value.find(version => version.id === importDumpBaseVersionId.value) || null
    : null
  const baseLabel = baseVersion ? getVersionLabel(baseVersion) : 'the selected version'

  return {
    confirmLabel: buildPgmlImportDumpConfirmLabel(),
    description: buildPgmlImportDumpDialogDescription(baseLabel),
    inputDescription: buildPgmlImportDumpInputDescription(),
    title: buildPgmlImportDumpDialogTitle()
  }
})
const importDbmlDialogCopy = computed(() => {
  const baseVersion = importDbmlBaseVersionId.value
    ? versions.value.find(version => version.id === importDbmlBaseVersionId.value) || null
    : null
  const baseLabel = baseVersion ? getVersionLabel(baseVersion) : 'the selected version'

  return {
    confirmLabel: buildPgmlImportDbmlConfirmLabel(),
    description: buildPgmlImportDbmlDialogDescription(baseLabel),
    inputDescription: buildPgmlImportDbmlInputDescription(),
    title: buildPgmlImportDbmlDialogTitle()
  }
})
const checkpointBaseVersion = computed(() => {
  return versions.value.find((version) => {
    return version.id === versionDocument.value.workspace.basedOnVersionId
  }) || null
})
const selectedImportDumpBaseVersion = computed(() => {
  return importDumpBaseVersionId.value
    ? versions.value.find(version => version.id === importDumpBaseVersionId.value) || null
    : null
})
const selectedImportDumpBaseVersionSource = computed(() => {
  return selectedImportDumpBaseVersion.value?.snapshot.source || null
})
const selectedImportDbmlBaseVersion = computed(() => {
  return importDbmlBaseVersionId.value
    ? versions.value.find(version => version.id === importDbmlBaseVersionId.value) || null
    : null
})
const compareComparisonLabel = computed(() => {
  return selectedComparison.value?.name || 'Current comparison'
})
const savedComparisonHint = computed(() => {
  return selectedComparison.value
    ? `${compareComparisonLabel.value} keeps its managed exclusions, note flags, notes, and noise filters when you change the base or target here.`
    : null
})
const compareNoteDialogTitle = computed(() => {
  return activeCompareNoteForDraftEntry.value ? 'Edit compare note' : 'Add compare note'
})
const compareNoteDialogDescription = computed(() => {
  return selectedComparison.value
    ? `Store a flagged note on ${compareComparisonLabel.value}. It will stay with this saved comparison until the underlying diff disappears.`
    : 'Save the current comparison first to persist compare notes.'
})
const compareNoteDialogEntryLabel = computed(() => {
  return compareNoteDraftEntry.value?.label || compareNoteDraftEntryId.value || 'Unknown compare entry'
})
const canSaveCompareNote = computed(() => {
  return compareNoteDraftEntryId.value !== null && compareNoteDraftText.value.trim().length > 0
})
watch([
  () => selectedComparisonId.value,
  () => compareRawEntries.value.map(entry => entry.id).sort().join('|'),
  () => workspaceAnalysisRevision.value,
  () => workspaceAnalysisRequestRevision.value
], () => {
  if (!selectedComparison.value) {
    if (compareNoteDialogOpen.value) {
      compareNoteDialogOpen.value = false
      compareNoteDraftEntryId.value = null
      compareNoteDraftFlag.value = 'pending'
      compareNoteDraftText.value = ''
    }
    return
  }

  if (!isAnalysisWorkspace.value) {
    return
  }

  if (workspaceAnalysisRevision.value < workspaceAnalysisRequestRevision.value) {
    return
  }

  if (!compareDiff.value || !compareBaseModel.value || !compareTargetModel.value) {
    return
  }

  const previousNoteCount = selectedComparison.value.notes.length
  const didPrune = pruneSelectedComparisonNotes(compareRawEntries.value.map(entry => entry.id))
  const nextNoteCount = selectedComparison.value.notes.length

  if (didPrune && nextNoteCount !== previousNoteCount) {
    markBrowserSchemaStatusEligible()
  }

  if (
    compareNoteDialogOpen.value
    && compareNoteDraftEntryId.value
    && !compareRawEntriesById.value[compareNoteDraftEntryId.value]
  ) {
    compareNoteDialogOpen.value = false
    compareNoteDraftEntryId.value = null
    compareNoteDraftFlag.value = 'pending'
    compareNoteDraftText.value = ''
  }
}, {
  immediate: true
})
const buildCompareExclusionSummary = (
  exclusions: Partial<PgmlCompareExclusions> | null | undefined
) => {
  const normalizedExclusions = clonePgmlCompareExclusions(exclusions)
  const parts: string[] = []

  if (normalizedExclusions.groupNames.length > 0) {
    parts.push(`${normalizedExclusions.groupNames.length} excluded group${normalizedExclusions.groupNames.length === 1 ? '' : 's'}`)
  }

  if (normalizedExclusions.tableIds.length > 0) {
    parts.push(`${normalizedExclusions.tableIds.length} excluded table${normalizedExclusions.tableIds.length === 1 ? '' : 's'}`)
  }

  if (normalizedExclusions.entityIds.length > 0) {
    parts.push(`${normalizedExclusions.entityIds.length} excluded compare entit${normalizedExclusions.entityIds.length === 1 ? 'y' : 'ies'}`)
  }

  return parts.length > 0 ? parts.join(' · ') : null
}
const buildStaleCompareExclusionCountLabel = (count: number) => {
  return `${count} stale exclusion${count === 1 ? '' : 's'}`
}
const compareExclusionsEffective = computed<PgmlCompareExclusions>(() => {
  return compareExclusionsDraft.value
    ? compareExclusionsDraft.value
    : activeCompareExclusions.value
})
const compareExclusionsSelectionCount = computed(() => {
  if (!compareExclusionsDraft.value) {
    return 0
  }

  return (
    compareExclusionsDraft.value.entityIds.length
    + compareExclusionsDraft.value.groupNames.length
    + compareExclusionsDraft.value.tableIds.length
  )
})
const activeCompareExclusionSummary = computed(() => {
  const summary = buildCompareExclusionSummary(activeCompareExclusions.value)
  const staleCount = activeCompareExclusionStaleEntityOptions.value.length

  if (staleCount === 0) {
    return summary
  }

  return [summary, buildStaleCompareExclusionCountLabel(staleCount)].filter(Boolean).join(' · ')
})
const draftCompareExclusionSummary = computed(() => {
  if (!compareExclusionsDraft.value) {
    return null
  }

  const summary = buildCompareExclusionSummary(compareExclusionsEffective.value)
  const staleCount = staleCompareExclusionEntityOptions.value.length

  if (staleCount === 0) {
    return summary
  }

  return [summary, buildStaleCompareExclusionCountLabel(staleCount)].filter(Boolean).join(' · ')
})
const compareExclusionSourceModels = computed<PgmlSchemaModel[]>(() => {
  return [compareBaseRawModel.value, compareTargetRawModel.value].flatMap(model => model ? [model] : [])
})
const splitCompareExclusionEntryId = (entryId: string) => {
  const separatorIndex = entryId.indexOf(':')

  return separatorIndex > -1
    ? {
        prefix: entryId.slice(0, separatorIndex),
        suffix: entryId.slice(separatorIndex + 1)
      }
    : {
        prefix: '',
        suffix: entryId
      }
}
const buildCompareExclusionFallbackEntityLabel = (
  entryId: string,
  entityKind: PgmlDiagramCompareEntityKind | null
) => {
  const { suffix } = splitCompareExclusionEntryId(entryId)

  if (entityKind === 'column' || entityKind === 'index' || entityKind === 'constraint') {
    return suffix.replace('::', '.')
  }

  if (entityKind === 'custom-type') {
    return suffix.replace('::', ' ')
  }

  return suffix.replaceAll('::', ' :: ')
}
const createCompareExclusionGroupOption = (groupName: string): CompareExclusionOption => {
  return {
    entityKind: null,
    id: `group:${groupName}`,
    kind: 'group',
    label: `Group ${groupName}`,
    searchText: `group ${groupName}`.toLowerCase(),
    value: groupName
  }
}
const createCompareExclusionTableOption = (tableId: string): CompareExclusionOption => {
  return {
    entityKind: null,
    id: `table:${tableId}`,
    kind: 'table',
    label: tableId,
    searchText: `table ${tableId}`.toLowerCase(),
    value: tableId
  }
}
const createCompareExclusionEntityOption = (entry: PgmlDiagramCompareEntry): CompareExclusionOption => {
  const entityKindLabel = getPgmlDiagramCompareEntityKindLabel(entry.entityKind)

  return {
    entityKind: entry.entityKind,
    id: entry.id,
    isStale: false,
    kind: 'entity',
    label: entry.label,
    searchText: `${entityKindLabel} ${entry.label} ${entry.description}`.toLowerCase(),
    value: entry.id
  }
}
const createStoredCompareExclusionEntityOption = (entryId: string): CompareExclusionOption => {
  const entityKind = getPgmlDiagramCompareEntityKindFromEntryId(entryId)
  const entityKindLabel = entityKind ? getPgmlDiagramCompareEntityKindLabel(entityKind) : 'Entity'
  const label = buildCompareExclusionFallbackEntityLabel(entryId, entityKind)

  return {
    entityKind,
    id: entryId,
    isStale: true,
    kind: 'entity',
    label,
    searchText: `${entityKindLabel} ${label}`.toLowerCase(),
    value: entryId
  }
}
const compareExclusionEntityOptionMap = computed(() => {
  const options = new Map<string, CompareExclusionOption>()

  compareRawEntries.value
    .filter((entry) => {
      return entry.entityKind !== 'group' && entry.entityKind !== 'table'
    })
    .forEach((entry) => {
      options.set(entry.id, createCompareExclusionEntityOption(entry))
    })

  compareExclusionsEffective.value.entityIds.forEach((entryId) => {
    if (!options.has(entryId)) {
      options.set(entryId, createStoredCompareExclusionEntityOption(entryId))
    }
  })

  return options
})
const resolveCompareExclusionEntityOption = (entryId: string) => {
  return compareExclusionEntityOptionMap.value.get(entryId) || createStoredCompareExclusionEntityOption(entryId)
}
const staleCompareExclusionEntityOptions = computed(() => {
  return compareExclusionsEffective.value.entityIds
    .map(resolveCompareExclusionEntityOption)
    .filter(option => option.isStale)
    .sort((left, right) => left.label.localeCompare(right.label))
})
const activeCompareExclusionStaleEntityOptions = computed(() => {
  return activeCompareExclusions.value.entityIds
    .map(resolveCompareExclusionEntityOption)
    .filter(option => option.isStale)
    .sort((left, right) => left.label.localeCompare(right.label))
})
const buildCompareExclusionSummaryLabel = (option: CompareExclusionOption) => {
  if (option.kind === 'group') {
    return option.label
  }

  if (option.kind === 'table') {
    return `Table ${option.label}`
  }

  const entityKindLabel = option.entityKind ? getPgmlDiagramCompareEntityKindLabel(option.entityKind) : 'Entity'

  return `${entityKindLabel} ${option.label}`
}
const buildCompareExclusionVisibleLabels = (
  exclusions: Partial<PgmlCompareExclusions> | null | undefined
) => {
  const normalizedExclusions = clonePgmlCompareExclusions(exclusions)

  return [
    ...normalizedExclusions.groupNames.map(groupName => buildCompareExclusionSummaryLabel(createCompareExclusionGroupOption(groupName))),
    ...normalizedExclusions.tableIds.map(tableId => buildCompareExclusionSummaryLabel(createCompareExclusionTableOption(tableId))),
    ...normalizedExclusions.entityIds.map(entryId => buildCompareExclusionSummaryLabel(resolveCompareExclusionEntityOption(entryId)))
  ]
}
const activeCompareExclusionVisibleLabels = computed(() => {
  return buildCompareExclusionVisibleLabels(activeCompareExclusions.value).slice(0, 6)
})
const activeCompareExclusionHiddenLabelCount = computed(() => {
  return buildCompareExclusionVisibleLabels(activeCompareExclusions.value).length - activeCompareExclusionVisibleLabels.value.length
})
const compareExclusionGroupSections = computed<CompareExclusionGroupSection[]>(() => {
  const groupNames = new Set<string>([
    ...compareExclusionSourceModels.value.flatMap(model => model.groups.map(group => group.name)),
    ...compareExclusionsEffective.value.groupNames
  ])

  return Array.from(groupNames)
    .sort((left, right) => left.localeCompare(right))
    .map((groupName) => {
      const tableIdsForGroup: string[] = []
      const seenTableIds = new Set<string>()
      const pushTableId = (tableId: string) => {
        if (seenTableIds.has(tableId)) {
          return
        }

        seenTableIds.add(tableId)
        tableIdsForGroup.push(tableId)
      }

      compareExclusionSourceModels.value.forEach((model) => {
        getOrderedGroupTables(model, groupName).forEach((table) => {
          pushTableId(table.fullName)
        })
      })

      compareExclusionsEffective.value.tableIds
        .filter((tableId) => {
          return compareExclusionSourceModels.value.some((model) => {
            return model.tables.some((table) => {
              return table.fullName === tableId && table.groupName === groupName
            })
          })
        })
        .sort((left, right) => left.localeCompare(right))
        .forEach(pushTableId)

      return {
        id: `group-section:${groupName}`,
        groupOption: createCompareExclusionGroupOption(groupName),
        tableOptions: tableIdsForGroup.map(createCompareExclusionTableOption)
      } satisfies CompareExclusionGroupSection
    })
})
const compareExclusionUngroupedTableOptions = computed(() => {
  const groupedTableIds = new Set(
    compareExclusionGroupSections.value.flatMap(section => section.tableOptions.map(option => option.value))
  )
  const ungroupedTableIds = new Set<string>([
    ...compareExclusionSourceModels.value.flatMap((model) => {
      return model.tables.flatMap((table) => {
        return table.groupName ? [] : [table.fullName]
      })
    }),
    ...compareExclusionsEffective.value.tableIds.filter(tableId => !groupedTableIds.has(tableId))
  ])

  return Array.from(ungroupedTableIds)
    .sort((left, right) => left.localeCompare(right))
    .map(createCompareExclusionTableOption)
})
const compareExclusionEntitySections = computed<CompareExclusionEntitySection[]>(() => {
  const optionsByKind = new Map<PgmlDiagramCompareEntityKind, CompareExclusionOption[]>()
  const seenOptionIdsByKind = new Map<PgmlDiagramCompareEntityKind, Set<string>>()
  const pushOption = (option: CompareExclusionOption) => {
    if (!option.entityKind || option.entityKind === 'group' || option.entityKind === 'table') {
      return
    }

    const seenOptionIds = seenOptionIdsByKind.get(option.entityKind) || new Set<string>()

    if (seenOptionIds.has(option.id)) {
      return
    }

    seenOptionIds.add(option.id)
    seenOptionIdsByKind.set(option.entityKind, seenOptionIds)
    optionsByKind.set(option.entityKind, [
      ...(optionsByKind.get(option.entityKind) || []),
      option
    ])
  }

  compareRawEntries
    .value
    .filter((entry) => {
      return entry.entityKind !== 'group' && entry.entityKind !== 'table'
    })
    .forEach((entry) => {
      pushOption(createCompareExclusionEntityOption(entry))
    })

  compareExclusionsEffective.value.entityIds.forEach((entryId) => {
    const option = resolveCompareExclusionEntityOption(entryId)

    if (!option.isStale) {
      pushOption(option)
    }
  })

  return compareExclusionEntityKindOrder.flatMap((entityKind) => {
    const options = (optionsByKind.get(entityKind) || []).sort((left, right) => {
      return left.label.localeCompare(right.label)
    })

    if (options.length === 0) {
      return []
    }

    return [{
      entityKind,
      id: `compare-exclusion-entity-section:${entityKind}`,
      options,
      title: compareExclusionEntitySectionTitleByKind[entityKind]
    } satisfies CompareExclusionEntitySection]
  })
})
const compareExclusionTypeFilterItems = computed<CompareExclusionTypeFilterItem[]>(() => {
  const groupCount = compareExclusionGroupSections.value.length
  const tableCount = compareExclusionGroupSections.value.reduce((count, section) => {
    return count + section.tableOptions.length
  }, 0) + compareExclusionUngroupedTableOptions.value.length
  const entityCountByKind = new Map<PgmlDiagramCompareEntityKind, number>(
    compareExclusionEntitySections.value.map(section => [section.entityKind, section.options.length])
  )
  const totalCount = groupCount + tableCount + Array.from(entityCountByKind.values()).reduce((sum, count) => {
    return sum + count
  }, 0)

  return compareExclusionTypeFilterOrder.flatMap((value) => {
    const count = value === 'all'
      ? totalCount
      : value === 'group'
        ? groupCount
        : value === 'table'
          ? tableCount
          : entityCountByKind.get(value) || 0

    if (value !== 'all' && count === 0) {
      return []
    }

    const label = value === 'all'
      ? 'All'
      : value === 'group'
        ? 'Groups'
        : value === 'table'
          ? 'Tables'
          : compareExclusionEntitySectionTitleByKind[value]

    return [{
      count,
      label,
      value
    }]
  })
})
const normalizedCompareExclusionsSearchQuery = computed(() => {
  return compareExclusionsSearchQuery.value.trim().toLowerCase()
})
const filteredCompareExclusionGroupSections = computed(() => {
  const searchQuery = normalizedCompareExclusionsSearchQuery.value
  const typeFilter = compareExclusionsTypeFilter.value

  if (typeFilter !== 'all' && typeFilter !== 'group' && typeFilter !== 'table') {
    return []
  }

  if (typeFilter === 'group') {
    if (searchQuery.length === 0) {
      return compareExclusionGroupSections.value
    }

    return compareExclusionGroupSections.value.filter((section) => {
      return section.groupOption.searchText.includes(searchQuery)
    })
  }

  if (typeFilter === 'table') {
    if (searchQuery.length === 0) {
      return compareExclusionGroupSections.value
    }

    return compareExclusionGroupSections.value.flatMap((section) => {
      const visibleTableOptions = section.tableOptions.filter((tableOption) => {
        return tableOption.searchText.includes(searchQuery)
      })

      if (visibleTableOptions.length === 0) {
        return []
      }

      return [{
        ...section,
        tableOptions: visibleTableOptions
      }]
    })
  }

  if (searchQuery.length === 0) {
    return compareExclusionGroupSections.value
  }

  return compareExclusionGroupSections.value.flatMap((section) => {
    const groupMatches = section.groupOption.searchText.includes(searchQuery)
    let visibleTableOptions = section.tableOptions

    if (!groupMatches) {
      visibleTableOptions = section.tableOptions.filter((tableOption) => {
        return tableOption.searchText.includes(searchQuery)
      })
    }

    if (!groupMatches && visibleTableOptions.length === 0) {
      return []
    }

    return [{
      ...section,
      tableOptions: visibleTableOptions
    }]
  })
})
const filteredCompareExclusionUngroupedTableOptions = computed(() => {
  if (compareExclusionsTypeFilter.value !== 'all' && compareExclusionsTypeFilter.value !== 'table') {
    return []
  }

  if (normalizedCompareExclusionsSearchQuery.value.length === 0) {
    return compareExclusionUngroupedTableOptions.value
  }

  return compareExclusionUngroupedTableOptions.value.filter((option) => {
    return option.searchText.includes(normalizedCompareExclusionsSearchQuery.value)
  })
})
const filteredCompareExclusionEntitySections = computed(() => {
  const searchQuery = normalizedCompareExclusionsSearchQuery.value
  const typeFilter = compareExclusionsTypeFilter.value

  if (typeFilter !== 'all' && typeFilter !== 'group' && typeFilter !== 'table') {
    const matchingSection = compareExclusionEntitySections.value.find((section) => {
      return section.entityKind === typeFilter
    }) || null

    if (!matchingSection) {
      return []
    }

    if (searchQuery.length === 0) {
      return [matchingSection]
    }

    const titleMatches = matchingSection.title.toLowerCase().includes(searchQuery)
    const options = titleMatches
      ? matchingSection.options
      : matchingSection.options.filter((option) => {
          return option.searchText.includes(searchQuery)
        })

    return options.length > 0 || titleMatches
      ? [{
          ...matchingSection,
          options
        }]
      : []
  }

  if (searchQuery.length === 0) {
    return compareExclusionEntitySections.value
  }

  return compareExclusionEntitySections.value.flatMap((section) => {
    const titleMatches = section.title.toLowerCase().includes(searchQuery)
    const options = titleMatches
      ? section.options
      : section.options.filter((option) => {
          return option.searchText.includes(searchQuery)
        })

    if (!titleMatches && options.length === 0) {
      return []
    }

    return [{
      ...section,
      options
    }]
  })
})
const compareExclusionsShowsGroupedTableOptions = computed(() => {
  return compareExclusionsTypeFilter.value === 'all' || compareExclusionsTypeFilter.value === 'table'
})
const compareExclusionsShowsGroupSections = computed(() => {
  return compareExclusionsTypeFilter.value === 'all'
    || compareExclusionsTypeFilter.value === 'group'
    || compareExclusionsTypeFilter.value === 'table'
})
const compareExclusionsShowsUngroupedTableSection = computed(() => {
  return compareExclusionsTypeFilter.value === 'all' || compareExclusionsTypeFilter.value === 'table'
})
const compareExclusionsShowsEntitySections = computed(() => {
  return compareExclusionsTypeFilter.value === 'all'
    || (compareExclusionsTypeFilter.value !== 'group' && compareExclusionsTypeFilter.value !== 'table')
})
const hasVisibleCompareExclusionOptions = computed(() => {
  return filteredCompareExclusionGroupSections.value.length > 0
    || filteredCompareExclusionUngroupedTableOptions.value.length > 0
    || filteredCompareExclusionEntitySections.value.length > 0
})
const comparisonDialogTitle = computed(() => {
  return comparisonDialogMode.value === 'rename' ? 'Rename comparison' : 'Create comparison'
})
const comparisonDialogDescription = computed(() => {
  return comparisonDialogMode.value === 'rename'
    ? 'Update the saved comparison name without changing its base, target, or exclusions.'
    : 'Save the current compare base, target, and exclusions as a reusable comparison preset.'
})
const normalizedComparisonDraftName = computed(() => {
  return comparisonDraftName.value.trim()
})
const comparisonNameError = computed(() => {
  if (normalizedComparisonDraftName.value.length === 0) {
    return 'Comparison name is required.'
  }

  if (comparisonDialogMode.value === 'rename' && selectedComparisonId.value) {
    const duplicateComparison = comparisonItems.value.find((comparison) => {
      return comparison.label === normalizedComparisonDraftName.value && comparison.value !== selectedComparisonId.value
    })

    return duplicateComparison ? 'Comparison name must be unique.' : null
  }

  const duplicateComparison = comparisonItems.value.find((comparison) => {
    return comparison.label === normalizedComparisonDraftName.value
  })

  return duplicateComparison ? 'Comparison name must be unique.' : null
})
const renameVersionCandidate = computed(() => {
  return renameVersionId.value
    ? versions.value.find(version => version.id === renameVersionId.value) || null
    : null
})
const restoreVersionCandidate = computed(() => {
  return restoreVersionId.value
    ? versions.value.find(version => version.id === restoreVersionId.value) || null
    : null
})
const deleteVersionCandidate = computed(() => {
  return deleteVersionId.value
    ? versionHistoryItems.value.find(version => version.id === deleteVersionId.value) || null
    : null
})
const deleteVersionDialogDescription = computed(() => {
  return buildPgmlDeleteVersionDescription({
    blockedReason: deleteVersionCandidate.value?.deleteBlockedReason || null
  })
})

watch(activeSchemaName, (nextName) => {
  versionDocumentName.value = nextName
}, {
  immediate: true
})

watch(activeSaveError, (nextError) => {
  if (!nextError) {
    lastSaveErrorToastMessage.value = null
    return
  }

  if (nextError === lastSaveErrorToastMessage.value) {
    return
  }

  pushSaveErrorToast(nextError)
})

watch([studioLaunchRequest, orderedSavedSchemas], async ([request]) => {
  if (!request) {
    return
  }

  const requestKey = getStudioLaunchRequestKey(request)

  if (requestKey === appliedStudioLaunchKey.value) {
    return
  }

  if (request.source === 'file') {
    const preloadedFileLaunch = studioSessionStore.consumePreloadedFileLaunch(request)

    if (preloadedFileLaunch) {
      syncLoadedComputerFile(preloadedFileLaunch)
      await refreshRecentComputerFiles()
      currentPersistenceSource.value = 'file'
      resetBrowserSchemaStatusEligibility()
      appliedStudioLaunchKey.value = requestKey
      requestCanvasViewportReset()
      return
    }

    const didLoadRecentFile = await loadRecentComputerFileById(request.recentFileId)

    if (!didLoadRecentFile) {
      return
    }

    currentPersistenceSource.value = 'file'
    resetBrowserSchemaStatusEligibility()
    loadDialogOpen.value = false
    appliedStudioLaunchKey.value = requestKey
    requestCanvasViewportReset()
    return
  }

  if (request.source === 'gist') {
    const didLoadGistFile = await loadGistPgmlFileByName(request.filename)

    if (!didLoadGistFile) {
      return
    }

    currentPersistenceSource.value = 'gist'
    resetBrowserSchemaStatusEligibility()
    loadDialogOpen.value = false
    appliedStudioLaunchKey.value = requestKey
    requestCanvasViewportReset()
    return
  }

  currentPersistenceSource.value = 'browser'

  if (request.launch === 'example') {
    appliedStudioLaunchKey.value = requestKey
    loadExample()
    return
  }

  if (request.launch === 'new') {
    appliedStudioLaunchKey.value = requestKey
    clearSchema()
    return
  }

  const savedSchema = orderedSavedSchemas.value.find((schema) => {
    return schema.id === request.schemaId
  })

  if (!savedSchema) {
    return
  }

  appliedStudioLaunchKey.value = requestKey
  loadSavedSchema(savedSchema)
}, {
  immediate: true
})

const downloadCurrentSchema = async () => {
  await flushPendingEditorChanges({
    waitForAnalysis: true
  })
  downloadSchemaText(activeSchemaName.value, buildSchemaText(includeLayoutInSchema.value))
  schemaDialogOpen.value = false
}
const saveCurrentSchema = async () => {
  await flushPendingEditorChanges({
    waitForAnalysis: true
  })

  if (currentPersistenceSource.value === 'file') {
    const didSave = await saveSchemaToComputerFile()

    if (didSave) {
      schemaDialogOpen.value = false
      pushSaveSuccessToast(getSaveSuccessToastDescription())
    }

    return
  }

  if (currentPersistenceSource.value === 'gist') {
    const didSave = await saveSchemaToGistFile()

    if (didSave) {
      schemaDialogOpen.value = false
      pushSaveSuccessToast(getSaveSuccessToastDescription())
    }

    return
  }

  markBrowserSchemaStatusEligible()
  const didSave = await saveSchemaToBrowser()

  if (!didSave) {
    return
  }

  pushSaveSuccessToast(getSaveSuccessToastDescription())
}
const openCheckpointDialog = async () => {
  await flushPendingEditorChanges()
  const suggestedCreatedAt = new Date().toISOString()

  checkpointDialogOpen.value = true
  checkpointRole.value = 'design'
  checkpointSuggestedCreatedAt.value = suggestedCreatedAt
  checkpointName.value = buildPgmlCheckpointName(versionDocument.value, {
    createdAt: suggestedCreatedAt,
    role: 'design'
  })
  checkpointNameIsSuggested.value = true
}
const persistWorkspaceBeforeRouteSwitch = async () => {
  await flushPendingEditorChanges({
    waitForAnalysis: true
  })

  if (!activeHasPendingChanges.value) {
    return true
  }

  if (currentPersistenceSource.value === 'file') {
    if (!hasSelectedComputerFile.value) {
      openSchemaDialog('save')
      return false
    }

    return await saveSchemaToComputerFile()
  }

  if (currentPersistenceSource.value === 'gist') {
    const canLeave = window.confirm('This Gist-backed PGML file has unsaved changes. Leave without saving?')

    if (!canLeave) {
      openSchemaDialog('save')
    }

    return canLeave
  }

  markBrowserSchemaStatusEligible()

  return await saveSchemaToBrowser()
}
const navigateToWorkspaceMode = async (page: StudioWorkspacePage) => {
  if (page === workspaceMode) {
    return
  }

  const didPersist = await persistWorkspaceBeforeRouteSwitch()

  if (!didPersist) {
    return
  }

  await navigateTo({
    path: getStudioWorkspacePath(page),
    query: currentPersistenceSource.value === 'file' || currentPersistenceSource.value === 'gist' ? route.query : undefined
  })
}
const closeCheckpointDialog = () => {
  checkpointDialogOpen.value = false
  checkpointSuggestedCreatedAt.value = null
  checkpointNameIsSuggested.value = false
}
const closeRestoreVersionDialog = () => {
  restoreVersionDialogOpen.value = false
  restoreVersionId.value = null
}
const closeDeleteVersionDialog = () => {
  deleteVersionDialogOpen.value = false
  deleteVersionId.value = null
}
const compareExclusionsDialogDescription = computed(() => {
  const staleCount = staleCompareExclusionEntityOptions.value.length
  const staleSuffix = staleCount > 0
    ? ` ${buildStaleCompareExclusionCountLabel(staleCount)} no longer match the current compare target and can be removed below.`
    : ''

  return selectedComparison.value
    ? `Choose the compare entities to exclude for ${compareComparisonLabel.value}. Changes here update that saved comparison preset while keeping its exclusions unless you remove them.${staleSuffix}`
    : `Choose the compare entities to exclude from the current comparison. Save it as a comparison preset if you want to reuse it later.${staleSuffix}`
})
const isCompareExclusionOptionSelected = (option: CompareExclusionOption) => {
  if (option.kind === 'group') {
    return compareExclusionsEffective.value.groupNames.includes(option.value)
  }

  if (option.kind === 'table') {
    return compareExclusionsEffective.value.tableIds.includes(option.value)
  }

  return compareExclusionsEffective.value.entityIds.includes(option.value)
}
const openCompareExclusionsDialog = () => {
  compareExclusionsDraft.value = clonePgmlCompareExclusions(activeCompareExclusions.value)
  compareExclusionsSearchQuery.value = ''
  compareExclusionsTypeFilter.value = 'all'
  compareExclusionsDialogOpen.value = true
}
const closeCompareExclusionsDialog = () => {
  compareExclusionsDialogOpen.value = false
  compareExclusionsDraft.value = null
  compareExclusionsSearchQuery.value = ''
  compareExclusionsTypeFilter.value = 'all'
}
const setCompareExclusionsTypeFilter = (value: CompareExclusionTypeFilterValue) => {
  compareExclusionsTypeFilter.value = value
}
const isCompareExclusionsTypeFilterActive = (value: CompareExclusionTypeFilterValue) => {
  return compareExclusionsTypeFilter.value === value
}
const toggleCompareExclusionOption = (option: CompareExclusionOption) => {
  if (!compareExclusionsDraft.value) {
    return
  }

  const nextDraft = clonePgmlCompareExclusions(compareExclusionsDraft.value)
  const nextValues = new Set(
    option.kind === 'entity'
      ? nextDraft.entityIds
      : option.kind === 'group'
        ? nextDraft.groupNames
        : nextDraft.tableIds
  )

  if (isCompareExclusionOptionSelected(option)) {
    nextValues.delete(option.value)
  } else {
    nextValues.add(option.value)
  }

  compareExclusionsDraft.value = clonePgmlCompareExclusions({
    ...nextDraft,
    [option.kind === 'entity' ? 'entityIds' : option.kind === 'group' ? 'groupNames' : 'tableIds']: Array.from(nextValues)
  })
}
const removeCompareExclusionOption = (option: CompareExclusionOption) => {
  if (!isCompareExclusionOptionSelected(option)) {
    return
  }

  toggleCompareExclusionOption(option)
}
const clearCompareExclusionsDraft = () => {
  compareExclusionsDraft.value = createEmptyPgmlCompareExclusions()
}
const saveCompareExclusionsDialog = async () => {
  if (!compareExclusionsDraft.value) {
    return
  }

  const didSave = setCurrentCompareExclusions(compareExclusionsDraft.value)

  if (!didSave) {
    return
  }

  if (selectedComparison.value) {
    await persistBrowserWorkspaceMutation()
  }

  closeCompareExclusionsDialog()
  toast.add({
    title: 'Compare exclusions updated',
    description: selectedComparison.value
      ? `${compareComparisonLabel.value} now keeps its saved exclusions.`
      : 'The current comparison now uses the updated exclusions.',
    color: 'success',
    icon: 'i-lucide-check'
  })
}
const closeCompareNoteDialog = () => {
  compareNoteDialogOpen.value = false
  compareNoteDraftEntryId.value = null
  compareNoteDraftFlag.value = 'pending'
  compareNoteDraftText.value = ''
}
const openCompareNoteDialog = (entryId: string) => {
  if (!selectedComparison.value) {
    toast.add({
      title: 'Save a comparison first',
      description: 'Create or select a saved comparison before adding persisted compare notes.',
      color: 'warning',
      icon: 'i-lucide-bookmark'
    })
    return
  }

  const existingNote = selectedComparison.value.notes.find((note) => {
    return note.entryId === entryId
  }) || null

  compareNoteDraftEntryId.value = entryId
  compareNoteDraftFlag.value = existingNote?.flag || 'pending'
  compareNoteDraftText.value = existingNote?.note || ''
  compareNoteDialogOpen.value = true
}
const saveCompareNoteDialog = async () => {
  if (!compareNoteDraftEntryId.value || compareNoteDraftText.value.trim().length === 0) {
    return
  }

  const didSave = saveSelectedComparisonNote({
    entryId: compareNoteDraftEntryId.value,
    flag: compareNoteDraftFlag.value,
    note: compareNoteDraftText.value
  })

  if (!didSave) {
    return
  }

  await persistBrowserWorkspaceMutation()
  closeCompareNoteDialog()
  toast.add({
    title: 'Compare note saved',
    description: `${compareComparisonLabel.value} now keeps the note for this difference.`,
    color: 'success',
    icon: 'i-lucide-check'
  })
}
const deleteCompareNoteDialog = async () => {
  if (!compareNoteDraftEntryId.value) {
    return
  }

  const didDelete = deleteSelectedComparisonNote(compareNoteDraftEntryId.value)

  if (!didDelete) {
    return
  }

  await persistBrowserWorkspaceMutation()
  closeCompareNoteDialog()
  toast.add({
    title: 'Compare note removed',
    description: `${compareComparisonLabel.value} no longer keeps a note for this difference.`,
    color: 'success',
    icon: 'i-lucide-check'
  })
}
const buildNextComparisonName = () => {
  let index = comparisonItems.value.length + 1

  while (comparisonItems.value.some(item => item.label === `Comparison ${index}`)) {
    index += 1
  }

  return `Comparison ${index}`
}
const openCreateComparisonDialog = () => {
  comparisonDialogMode.value = 'create'
  comparisonDraftName.value = buildNextComparisonName()
  comparisonDialogOpen.value = true
}
const openRenameComparisonDialog = () => {
  if (!selectedComparison.value) {
    return
  }

  comparisonDialogMode.value = 'rename'
  comparisonDraftName.value = selectedComparison.value.name
  comparisonDialogOpen.value = true
}
const closeComparisonDialog = () => {
  comparisonDialogOpen.value = false
  comparisonDraftName.value = ''
}
const saveComparisonDialog = async () => {
  if (comparisonNameError.value) {
    return
  }

  if (comparisonDialogMode.value === 'rename') {
    if (!selectedComparisonId.value || !renameComparison(selectedComparisonId.value, normalizedComparisonDraftName.value)) {
      return
    }

    await persistBrowserWorkspaceMutation()
    closeComparisonDialog()
    toast.add({
      title: 'Comparison renamed',
      description: `${normalizedComparisonDraftName.value} is now the saved comparison label.`,
      color: 'success',
      icon: 'i-lucide-check'
    })
    return
  }

  const nextComparison = createComparison(normalizedComparisonDraftName.value)

  if (!nextComparison) {
    return
  }

  await persistBrowserWorkspaceMutation()
  closeComparisonDialog()
  toast.add({
    title: 'Comparison created',
    description: `${nextComparison.name} now stores the current base, target, and exclusions.`,
    color: 'success',
    icon: 'i-lucide-check'
  })
}
const deleteSelectedComparisonPreset = () => {
  if (!selectedComparison.value || !deleteComparison(selectedComparison.value.id)) {
    return
  }

  void persistBrowserWorkspaceMutation()
  toast.add({
    title: 'Comparison deleted',
    description: 'The saved comparison preset was removed from this PGML document.',
    color: 'success',
    icon: 'i-lucide-check'
  })
}
const normalizedRenameVersionDraftName = computed(() => {
  return renameVersionDraftName.value.trim()
})
const renameVersionDialogDescription = computed(() => {
  return 'Update the display name of this locked version checkpoint.'
})
const renameVersionNameError = computed(() => {
  if (normalizedRenameVersionDraftName.value.length === 0) {
    return 'Version name is required.'
  }

  return null
})
const openRenameVersionDialog = (versionId: string) => {
  const version = versions.value.find(entry => entry.id === versionId) || null

  if (!version) {
    return
  }

  renameVersionId.value = versionId
  renameVersionDraftName.value = getVersionLabel(version)
  renameVersionDialogOpen.value = true
}
const closeRenameVersionDialog = () => {
  renameVersionDialogOpen.value = false
  renameVersionDraftName.value = ''
  renameVersionId.value = null
}
const openDeleteVersionDialog = (versionId: string) => {
  const version = versionHistoryItems.value.find(entry => entry.id === versionId) || null

  if (!version || !version.canDelete) {
    return
  }

  deleteVersionId.value = versionId
  deleteVersionDialogOpen.value = true
}
const saveCheckpoint = async () => {
  await flushPendingEditorChanges()
  const normalizedName = checkpointName.value.trim()

  if (normalizedName.length === 0) {
    return
  }

  const createdVersion = createVersionCheckpoint({
    includeLayout: true,
    name: normalizedName,
    role: checkpointRole.value
  })

  if (!createdVersion) {
    return
  }

  checkpointDialogOpen.value = false
  checkpointName.value = ''
  checkpointSuggestedCreatedAt.value = null
  checkpointNameIsSuggested.value = false
  setPreviewTarget('workspace')
  requestCanvasViewportReset()
  toast.add({
    title: 'Checkpoint created',
    description: buildPgmlCheckpointCreatedDescription(getVersionLabel(createdVersion), createdVersion.role),
    color: 'success',
    icon: 'i-lucide-check'
  })
}

watch(checkpointRole, (nextRole) => {
  if (!checkpointDialogOpen.value || !checkpointNameIsSuggested.value || !checkpointSuggestedCreatedAt.value) {
    return
  }

  checkpointName.value = buildPgmlCheckpointName(versionDocument.value, {
    createdAt: checkpointSuggestedCreatedAt.value,
    role: nextRole
  })
})
const normalizedDiagramViewDraftName = computed(() => {
  return diagramViewDraftName.value.trim()
})
const diagramViewDialogTitle = computed(() => {
  return diagramViewDialogMode.value === 'rename' ? 'Rename diagram view' : 'Create diagram view'
})
const diagramViewDialogDescription = computed(() => {
  return diagramViewDialogMode.value === 'rename'
    ? 'Update the name of the active view for this workspace or locked version.'
    : 'Create a named view for this workspace or locked version before adding it to the document.'
})
const diagramViewNameError = computed(() => {
  if (normalizedDiagramViewDraftName.value.length === 0) {
    return 'View name is required.'
  }

  const hasDuplicateName = diagramViewItems.value.some((item) => {
    if (diagramViewDialogMode.value === 'rename' && item.value === activeDiagramViewId.value) {
      return false
    }

    return item.label === normalizedDiagramViewDraftName.value
  })

  if (hasDuplicateName) {
    return 'A view with this name already exists here.'
  }

  return null
})
const openCreateDiagramViewDialog = () => {
  diagramViewDialogMode.value = 'create'
  diagramViewDraftName.value = nextDiagramViewName.value
  diagramViewDialogOpen.value = true
}
const openRenameDiagramViewDialog = () => {
  if (!activeDiagramViewId.value) {
    return
  }

  diagramViewDialogMode.value = 'rename'
  diagramViewDraftName.value = activeDiagramViewName.value
  diagramViewDialogOpen.value = true
}
const closeDiagramViewDialog = () => {
  diagramViewDialogOpen.value = false
  diagramViewDialogMode.value = 'create'
  diagramViewDraftName.value = ''
}
const saveRenameVersionDialog = () => {
  if (renameVersionNameError.value !== null || !renameVersionId.value) {
    return
  }

  const didRename = renameVersion(renameVersionId.value, normalizedRenameVersionDraftName.value)

  if (!didRename) {
    return
  }

  markBrowserSchemaStatusEligible()
  closeRenameVersionDialog()
  toast.add({
    title: 'Version renamed',
    description: `Locked version renamed to ${normalizedRenameVersionDraftName.value}.`,
    color: 'success',
    icon: 'i-lucide-check'
  })
}
const revealPreviewTargetDocumentSource = () => {
  setDocumentEditorScope(getPreviewTargetDocumentScope())
  versionedEditorMode.value = 'document'
}
const saveDiagramViewDialog = () => {
  if (diagramViewNameError.value !== null) {
    return
  }

  markBrowserSchemaStatusEligible()

  const didSave = diagramViewDialogMode.value === 'rename'
    ? renameActiveDiagramView(normalizedDiagramViewDraftName.value)
    : createNamedDiagramView(normalizedDiagramViewDraftName.value)

  if (!didSave) {
    return
  }

  revealPreviewTargetDocumentSource()
  closeDiagramViewDialog()
}
const syncImportDumpConflictError = () => {
  const hasFile = importDumpSelectedFile.value !== null
  const hasText = importDumpText.value.trim().length > 0

  if (hasFile && hasText) {
    importDumpError.value = buildPgmlImportConflictMessage()
    return false
  }

  if (importDumpError.value === buildPgmlImportConflictMessage()) {
    importDumpError.value = null
  }

  return true
}
const resetImportDumpDialog = () => {
  importDumpDialogOpen.value = false
  importDumpError.value = null
  importDumpFoldIdentifiersToLowercase.value = false
  importDumpRetainMatchingTableGroups.value = true
  importDumpSelectedFile.value = null
  importDumpText.value = ''
  importDumpBaseVersionId.value = null
}
const syncImportDbmlConflictError = () => {
  const hasFile = importDbmlSelectedFile.value !== null
  const hasText = importDbmlText.value.trim().length > 0

  if (hasFile && hasText) {
    importDbmlError.value = buildPgmlImportDbmlConflictMessage()
    return false
  }

  if (importDbmlError.value === buildPgmlImportDbmlConflictMessage()) {
    importDbmlError.value = null
  }

  return true
}
const resetImportDbmlDialog = () => {
  importDbmlDialogOpen.value = false
  importDbmlError.value = null
  importDbmlFoldIdentifiersToLowercase.value = false
  importDbmlParseExecutableComments.value = false
  importDbmlSelectedFile.value = null
  importDbmlText.value = ''
  importDbmlBaseVersionId.value = null
}
const resetImportExecutableAttachmentResolution = () => {
  importExecutableAttachmentResolution.value = null
  importExecutableAttachmentError.value = null
}
const commitImportedSchema = (input: {
  basedOnVersionId: string
  kind: ImportExecutableAttachmentResolutionKind
  pgml: string
}) => {
  const didReplaceWorkspace = replaceWorkspaceFromImportedSnapshot({
    basedOnVersionId: input.basedOnVersionId,
    includeLayout: true,
    source: input.pgml
  })

  if (!didReplaceWorkspace) {
    throw new Error('The selected base version no longer exists.')
  }

  markBrowserSchemaStatusEligible()
  requestCanvasViewportReset()
  resetImportExecutableAttachmentResolution()

  if (input.kind === 'dbml') {
    resetImportDbmlDialog()
  } else {
    resetImportDumpDialog()
  }

  toast.add({
    title: 'Workspace replaced',
    description: buildPgmlImportSuccessDescription(),
    color: 'success',
    icon: 'i-lucide-check'
  })
}
const openImportExecutableAttachmentResolution = (input: ImportExecutableAttachmentResolution) => {
  importExecutableAttachmentResolution.value = input
  importExecutableAttachmentError.value = null

  if (input.kind === 'dbml') {
    importDbmlDialogOpen.value = false
  } else {
    importDumpDialogOpen.value = false
  }
}
const closeImportExecutableAttachmentResolution = () => {
  if (isSubmittingImportExecutableAttachmentResolution.value) {
    return
  }

  const resolution = importExecutableAttachmentResolution.value

  if (!resolution) {
    return
  }

  resetImportExecutableAttachmentResolution()

  if (resolution.kind === 'dbml') {
    importDbmlDialogOpen.value = true
  } else {
    importDumpDialogOpen.value = true
  }
}
const handleImportExecutableAttachmentResolutionOpenChange = (nextOpen: boolean) => {
  if (nextOpen || !importExecutableAttachmentResolution.value) {
    return
  }

  closeImportExecutableAttachmentResolution()
}
const toggleImportExecutableAttachmentCandidateTable = (candidateId: string, tableId: string) => {
  const resolution = importExecutableAttachmentResolution.value

  if (!resolution) {
    return
  }

  importExecutableAttachmentResolution.value = {
    ...resolution,
    candidates: resolution.candidates.map((candidate) => {
      if (candidate.id !== candidateId) {
        return candidate
      }

      const selectedTableIds = candidate.selectedTableIds.includes(tableId)
        ? candidate.selectedTableIds.filter(value => value !== tableId)
        : [...candidate.selectedTableIds, tableId]

      return {
        ...candidate,
        selectedTableIds
      }
    })
  }
}
const clearImportExecutableAttachmentCandidateTables = (candidateId: string) => {
  const resolution = importExecutableAttachmentResolution.value

  if (!resolution) {
    return
  }

  importExecutableAttachmentResolution.value = {
    ...resolution,
    candidates: resolution.candidates.map((candidate) => {
      return candidate.id === candidateId
        ? {
            ...candidate,
            selectedTableIds: []
          }
        : candidate
    })
  }
}
const confirmImportExecutableAttachmentResolution = () => {
  const resolution = importExecutableAttachmentResolution.value

  if (!resolution) {
    return
  }

  isSubmittingImportExecutableAttachmentResolution.value = true

  try {
    const nextPgml = applyImportedExecutableAttachmentSelections(resolution.pgml, resolution.candidates)

    commitImportedSchema({
      basedOnVersionId: resolution.basedOnVersionId,
      kind: resolution.kind,
      pgml: nextPgml
    })
  } catch (error) {
    if (error instanceof Error && error.message.trim().length > 0) {
      importExecutableAttachmentError.value = error.message
    } else if (typeof error === 'string' && error.trim().length > 0) {
      importExecutableAttachmentError.value = error
    } else {
      importExecutableAttachmentError.value = buildPgmlImportFailureMessage()
    }
  } finally {
    isSubmittingImportExecutableAttachmentResolution.value = false
  }
}
const getPreferredImportBaseVersionId = () => {
  return versionHistoryItems.value.find(version => version.isWorkspaceBase)?.id
    || latestImplementationVersion.value?.id
    || latestVersionId.value
    || null
}
const showImportCheckpointRequiredToast = () => {
  toast.add({
    title: 'Checkpoint required',
    description: buildPgmlImportCheckpointRequiredDescription(),
    color: 'error',
    icon: 'i-lucide-circle-alert'
  })
}
const openImportDumpDialog = () => {
  if (versions.value.length === 0) {
    showImportCheckpointRequiredToast()
    return
  }

  importDumpDialogOpen.value = true
  importDumpError.value = null
  importDumpFoldIdentifiersToLowercase.value = false
  importDumpRetainMatchingTableGroups.value = true
  importDumpSelectedFile.value = null
  importDumpText.value = ''
  importDumpBaseVersionId.value = getPreferredImportBaseVersionId()
}
const openImportDbmlDialog = () => {
  if (versions.value.length === 0) {
    showImportCheckpointRequiredToast()
    return
  }

  importDbmlDialogOpen.value = true
  importDbmlError.value = null
  importDbmlFoldIdentifiersToLowercase.value = false
  importDbmlParseExecutableComments.value = false
  importDbmlSelectedFile.value = null
  importDbmlText.value = ''
  importDbmlBaseVersionId.value = getPreferredImportBaseVersionId()
}
const closeImportDumpDialog = () => {
  if (isSubmittingImportDump.value || isSubmittingImportExecutableAttachmentResolution.value) {
    return
  }

  resetImportDumpDialog()
}
const closeImportDbmlDialog = () => {
  if (isSubmittingImportDbml.value || isSubmittingImportExecutableAttachmentResolution.value) {
    return
  }

  resetImportDbmlDialog()
}
const handleImportDumpDialogOpenChange = (nextOpen: boolean) => {
  if (nextOpen) {
    importDumpDialogOpen.value = true
    return
  }

  closeImportDumpDialog()
}
const handleImportDbmlDialogOpenChange = (nextOpen: boolean) => {
  if (nextOpen) {
    importDbmlDialogOpen.value = true
    return
  }

  closeImportDbmlDialog()
}
const setImportDumpText = (value: string) => {
  importDumpText.value = value
  syncImportDumpConflictError()
}
const setImportDbmlText = (value: string) => {
  importDbmlText.value = value
  syncImportDbmlConflictError()
}
const setImportDumpFile = (files: FileList | null) => {
  importDumpSelectedFile.value = files?.[0] || null
  syncImportDumpConflictError()
}
const setImportDbmlFile = (files: FileList | null) => {
  importDbmlSelectedFile.value = files?.[0] || null
  syncImportDbmlConflictError()
}
const clearImportDumpFile = () => {
  importDumpSelectedFile.value = null
  syncImportDumpConflictError()
}
const clearImportDbmlFile = () => {
  importDbmlSelectedFile.value = null
  syncImportDbmlConflictError()
}
const submitImportDump = async () => {
  if (!importDumpBaseVersionId.value) {
    importDumpError.value = buildPgmlImportBaseRequiredMessage()
    return
  }

  if (!syncImportDumpConflictError()) {
    return
  }

  const selectedFile = importDumpSelectedFile.value
  const trimmedText = importDumpText.value.trim()

  if (!selectedFile && trimmedText.length === 0) {
    importDumpError.value = buildPgmlImportMissingInputMessage()
    return
  }

  isSubmittingImportDump.value = true

  try {
    const importedSql = selectedFile ? await selectedFile.text() : importDumpText.value
    const importedSchema = convertPgDumpToPgml({
      foldIdentifiersToLowercase: importDumpFoldIdentifiersToLowercase.value,
      preferredName: selectedFile?.name,
      sql: importedSql
    })
    const importedPgml = importDumpRetainMatchingTableGroups.value
      ? (() => {
          if (!selectedImportDumpBaseVersionSource.value) {
            throw new Error('The selected base version no longer exists.')
          }

          return retainPgmlTableGroupsFromBaseSource({
            baseSource: selectedImportDumpBaseVersionSource.value,
            importedSource: importedSchema.pgml
          })
        })()
      : importedSchema.pgml
    const preparedImport = prepareImportedExecutableAttachments(importedPgml)

    if (preparedImport.candidates.length > 0) {
      openImportExecutableAttachmentResolution({
        basedOnVersionId: importDumpBaseVersionId.value,
        candidates: preparedImport.candidates,
        kind: 'pg_dump',
        pgml: preparedImport.pgml,
        tableOptions: preparedImport.tableOptions
      })
      return
    }

    commitImportedSchema({
      basedOnVersionId: importDumpBaseVersionId.value,
      kind: 'pg_dump',
      pgml: preparedImport.pgml
    })
  } catch (error) {
    if (error instanceof Error && error.message.trim().length > 0) {
      importDumpError.value = error.message
    } else if (typeof error === 'string' && error.trim().length > 0) {
      importDumpError.value = error
    } else {
      importDumpError.value = buildPgmlImportFailureMessage()
    }
  } finally {
    isSubmittingImportDump.value = false
  }
}
const submitImportDbml = async () => {
  if (!importDbmlBaseVersionId.value) {
    importDbmlError.value = buildPgmlImportBaseRequiredMessage()
    return
  }

  if (!syncImportDbmlConflictError()) {
    return
  }

  const selectedFile = importDbmlSelectedFile.value
  const trimmedText = importDbmlText.value.trim()

  if (!selectedFile && trimmedText.length === 0) {
    importDbmlError.value = buildPgmlImportDbmlMissingInputMessage()
    return
  }

  isSubmittingImportDbml.value = true

  try {
    const importedDbml = selectedFile ? await selectedFile.text() : importDbmlText.value
    const importedSchema = convertDbmlToPgml({
      dbml: importedDbml,
      foldIdentifiersToLowercase: importDbmlFoldIdentifiersToLowercase.value,
      parseExecutableComments: importDbmlParseExecutableComments.value,
      preferredName: selectedFile?.name
    })
    const preparedImport = prepareImportedExecutableAttachments(importedSchema.pgml)

    if (preparedImport.candidates.length > 0) {
      openImportExecutableAttachmentResolution({
        basedOnVersionId: importDbmlBaseVersionId.value,
        candidates: preparedImport.candidates,
        kind: 'dbml',
        pgml: preparedImport.pgml,
        tableOptions: preparedImport.tableOptions
      })
      return
    }

    commitImportedSchema({
      basedOnVersionId: importDbmlBaseVersionId.value,
      kind: 'dbml',
      pgml: preparedImport.pgml
    })
  } catch (error) {
    if (error instanceof Error && error.message.trim().length > 0) {
      importDbmlError.value = error.message
    } else if (typeof error === 'string' && error.trim().length > 0) {
      importDbmlError.value = error
    } else {
      importDbmlError.value = buildPgmlImportDbmlFailureMessage()
    }
  } finally {
    isSubmittingImportDbml.value = false
  }
}
const viewVersionTarget = (targetId: string) => {
  setPreviewTarget(targetId === 'workspace' ? 'workspace' : targetId)
  requestCanvasViewportReset()
}
const restoreVersionToWorkspace = (versionId: string) => {
  restoreVersionId.value = versionId
  restoreVersionDialogOpen.value = true
}
const confirmDeleteVersion = () => {
  const targetVersion = deleteVersionCandidate.value

  if (!targetVersion || !targetVersion.canDelete || !deleteVersion(targetVersion.id)) {
    return
  }

  markBrowserSchemaStatusEligible()
  requestCanvasViewportReset()
  closeDeleteVersionDialog()
  toast.add({
    title: 'Version deleted',
    description: buildPgmlDeleteVersionSuccessDescription(getVersionLabel(targetVersion)),
    color: 'success',
    icon: 'i-lucide-check'
  })
}
const confirmRestoreVersionToWorkspace = () => {
  if (!restoreVersionId.value) {
    return
  }

  const didRestore = replaceWorkspaceFromVersion(restoreVersionId.value)

  if (!didRestore) {
    return
  }

  markBrowserSchemaStatusEligible()
  requestCanvasViewportReset()
  closeRestoreVersionDialog()
  toast.add({
    title: 'Workspace restored',
    description: buildPgmlRestoreSuccessDescription(),
    color: 'success',
    icon: 'i-lucide-check'
  })
}
// Compare selectors live in multiple controls, so keep the page-level pair
// updates centralized before they flow into the shared version-history state.
const updateVersionCompareSelection = (input: {
  baseId: string | null
  targetId: string
}) => {
  const didUpdate = setCompareTargets({
    baseId: input.baseId,
    targetId: input.targetId
  })

  if (didUpdate && selectedComparisonId.value) {
    void persistBrowserWorkspaceMutation()
    toast.add({
      title: 'Saved comparison updated',
      description: `${compareComparisonLabel.value} now compares the selected base and target while keeping its saved exclusions, note flags, notes, and noise filters.`,
      color: 'success',
      icon: 'i-lucide-check'
    })
  }
}
const updateVersionCompareBaseId = (value: string | null) => {
  updateVersionCompareSelection({
    baseId: value,
    targetId: versionCompareTargetId.value
  })
}
const updateVersionCompareTargetId = (value: string) => {
  updateVersionCompareSelection({
    baseId: versionCompareBaseId.value,
    targetId: value
  })
}
const updateVersionCompareNoiseFilters = (value: PgmlCompareNoiseFilters) => {
  const didUpdate = setCurrentCompareNoiseFilters(value)

  if (didUpdate && selectedComparisonId.value) {
    void persistBrowserWorkspaceMutation()
  }
}
const updateVersionCompareNoteFilters = (value: PgmlCompareNoteFilters) => {
  const didUpdate = setCurrentCompareNoteFilters(value)

  if (didUpdate && selectedComparisonId.value) {
    void persistBrowserWorkspaceMutation()
  }
}
const normalizeVersionedEditorMode = (value: string) => {
  return value === 'document' ? 'document' : 'head'
}
const normalizeDocumentEditorScopeUpdate = (value: unknown) => {
  return typeof value === 'string' && value.trim().length > 0
    ? value as Parameters<typeof setDocumentEditorScope>[0]
    : null
}
const updateVersionedEditorMode = (value: string) => {
  versionedEditorMode.value = normalizeVersionedEditorMode(value)
}
const updateDocumentEditorScope = (value: unknown) => {
  const nextScope = normalizeDocumentEditorScopeUpdate(value)

  if (nextScope === null) {
    return
  }

  setDocumentEditorScope(nextScope)
}

const actionMenus = computed<StudioHeaderMenu[]>(() => {
  const exportItems: DropdownMenuItem[] = exportScales.map((scaleOption) => {
    return {
      label: `PNG ${scaleOption}x`,
      icon: 'i-lucide-image',
      disabled: isExporting.value,
      onSelect: () => {
        void runExport('png', scaleOption)
      }
    }
  })

  exportItems.push({
    label: 'SVG',
    icon: 'i-lucide-file-image',
    disabled: isExporting.value,
    onSelect: () => {
      void runExport('svg')
    }
  })

  const menus: StudioHeaderMenu[] = [
    {
      icon: 'i-lucide-panels-top-left',
      id: 'workspace',
      items: [[
        {
          label: 'Diagram',
          icon: 'i-lucide-layout-template',
          disabled: workspaceMode === 'diagram',
          onSelect: () => {
            void navigateToWorkspaceMode('diagram')
          }
        },
        {
          label: 'Analysis',
          icon: 'i-lucide-scan-search',
          disabled: workspaceMode === 'analysis',
          onSelect: () => {
            void navigateToWorkspaceMode('analysis')
          }
        }
      ]],
      label: 'Workspace'
    },
    {
      icon: 'i-lucide-file-stack',
      id: 'schema',
      items: [
        [
          {
            label: 'Load example',
            icon: 'i-lucide-flask-conical',
            onSelect: loadExample
          },
          {
            label: 'Clear schema',
            icon: 'i-lucide-eraser',
            color: 'error',
            onSelect: clearSchema
          }
        ],
        [
          {
            label: 'Save schema',
            disabled: (currentPersistenceSource.value === 'file' && !hasSelectedComputerFile.value)
              || (currentPersistenceSource.value === 'gist' && !hasSelectedGistFile.value),
            icon: 'i-lucide-save',
            onSelect: () => {
              openSchemaDialog('save')
            }
          },
          {
            label: loadDialogTitle.value,
            icon: 'i-lucide-folder-open',
            onSelect: () => {
              loadDialogOpen.value = true
            }
          },
          {
            label: 'Download schema',
            icon: 'i-lucide-file-down',
            onSelect: () => {
              openSchemaDialog('download')
            }
          }
        ],
        [
          {
            label: 'Create checkpoint',
            icon: 'i-lucide-bookmark-plus',
            onSelect: openCheckpointDialog
          },
          {
            label: 'Import DBML onto version',
            icon: 'i-lucide-file-stack',
            onSelect: openImportDbmlDialog
          },
          {
            label: 'Import pg_dump onto version',
            icon: 'i-lucide-file-up',
            onSelect: openImportDumpDialog
          }
        ]
      ],
      label: 'Schema'
    }
  ]

  if (isDiagramWorkspace.value) {
    menus.push({
      icon: 'i-lucide-image-down',
      id: 'export',
      items: [
        exportItems
      ],
      label: 'Export'
    })
  }

  return menus
})

const editorModeLabels = {
  create: {
    groupAction: 'Create group',
    groupDescription: 'Create a new table group and assign tables to it in one pass.',
    groupTitle: 'Add table group',
    tableAction: 'Create table',
    tableDescription: 'Create a new table block, leave it floating, or place it in a selected group.',
    tableTitle: 'Add table'
  },
  edit: {
    groupAction: 'Save group',
    groupDescription: 'Update the selected group metadata and its table membership without leaving the diagram.',
    groupTitle: 'Edit table group',
    tableAction: 'Save table',
    tableDescription: 'Update table metadata and column definitions from a structured editor.',
    tableTitle: 'Edit table'
  }
} as const
const tableEditorMode = computed(() => tableEditorDraft.value?.mode || 'create')
const groupEditorMode = computed(() => groupEditorDraft.value?.mode || 'create')
const tableEditorTitle = computed(() => editorModeLabels[tableEditorMode.value].tableTitle)
const tableEditorActionLabel = computed(() => editorModeLabels[tableEditorMode.value].tableAction)
const tableEditorDescription = computed(() => editorModeLabels[tableEditorMode.value].tableDescription)
const groupEditorTitle = computed(() => editorModeLabels[groupEditorMode.value].groupTitle)
const groupEditorActionLabel = computed(() => editorModeLabels[groupEditorMode.value].groupAction)
const groupEditorDescription = computed(() => editorModeLabels[groupEditorMode.value].groupDescription)
const groupSelectItems = computed<ReferenceTargetItem[]>(() => {
  return [
    {
      label: 'Ungrouped',
      value: 'Ungrouped',
      description: 'Leave this table floating outside a table group.'
    },
    ...workspaceParsedModel.value.groups
      .map(group => ({
        label: group.name,
        value: group.name,
        description: group.tableNames.length === 1
          ? '1 table currently in this group'
          : `${group.tableNames.length} tables currently in this group`
      }))
      .sort((left, right) => left.label.localeCompare(right.label))
  ]
})
const schemaSelectItems = computed(() => {
  return Array.from(new Set(['public', ...workspaceParsedModel.value.schemas])).sort((left, right) => left.localeCompare(right))
})
const tableTypeItems = computed<ReferenceTargetItem[]>(() => {
  const dynamicTypes = Array.from(new Set([
    ...workspaceParsedModel.value.customTypes.map(customType => customType.name),
    ...workspaceParsedModel.value.tables.flatMap(table => table.columns.map(column => column.type)),
    ...(tableEditorDraft.value?.columns.map(column => column.type) || [])
  ].filter(type => type.trim().length > 0))).sort((left, right) => left.localeCompare(right))
  const orderedTypes = Array.from(new Set([
    ...commonPgmlColumnTypes,
    ...dynamicTypes
  ]))
  const customTypeKinds = new Map(workspaceParsedModel.value.customTypes.map(customType => [customType.name, customType.kind]))

  return orderedTypes.map((value) => {
    const beginnerPreset = beginnerFriendlyColumnTypePresets[value]

    if (beginnerPreset) {
      return {
        ...beginnerPreset,
        value
      }
    }

    const customTypeKind = customTypeKinds.get(value)

    if (customTypeKind) {
      return {
        label: formatColumnTypeLabel(value),
        value,
        description: `Custom ${customTypeKind.toLowerCase()} from this diagram. Exact type: ${value}.`
      }
    }

    return {
      label: formatColumnTypeLabel(value),
      value,
      description: `Use the exact PostgreSQL type ${value}.`
    }
  })
})
const referenceRelationItems: ReferenceRelationItem[] = [
  {
    label: 'This column references the target',
    value: '>',
    description: 'Most foreign keys use this. Example: `tenant_id` points to `tenants.id`.'
  },
  {
    label: 'The target references this column',
    value: '<',
    description: 'Use this when the other table points back to this column.'
  },
  {
    label: 'Associate both sides',
    value: '-',
    description: 'Use for an undirected relationship when neither side should read as the source.'
  }
]
const referenceRelationSymbolItems: ReferenceTargetItem[] = referenceRelationItems.map(item => ({
  label: item.value,
  value: item.value,
  description: item.label
}))
const referenceActionItems: ReferenceTargetItem[] = [
  {
    label: 'Default behavior',
    value: defaultReferenceActionSelectValue,
    description: 'Do not write an explicit clause. PostgreSQL keeps its default action.'
  },
  {
    label: 'No action',
    value: 'no action',
    description: 'Keep the reference valid at statement end without adding a cascading change.'
  },
  {
    label: 'Restrict',
    value: 'restrict',
    description: 'Reject the change immediately when dependent rows still exist.'
  },
  {
    label: 'Cascade',
    value: 'cascade',
    description: 'Propagate the delete or update to dependent rows.'
  },
  {
    label: 'Set null',
    value: 'set null',
    description: 'Set the referencing column to null.'
  },
  {
    label: 'Set default',
    value: 'set default',
    description: 'Set the referencing column to its default value.'
  }
]
const tableTargetItems = computed<ReferenceTargetItem[]>(() => {
  return workspaceParsedModel.value.tables
    .map(table => ({
      label: table.fullName,
      value: table.fullName,
      description: `${table.columns.length} column${table.columns.length === 1 ? '' : 's'}`
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
})
const groupTableItems = computed<ReferenceTargetItem[]>(() => {
  return workspaceParsedModel.value.tables
    .map(table => ({
      label: table.fullName,
      value: table.fullName,
      description: table.groupName ? `In ${table.groupName}` : 'Floating table'
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
})
const tableEditorErrors = computed(() => {
  return tableEditorDraft.value ? getEditableTableDraftErrors(tableEditorDraft.value) : []
})
const groupEditorErrors = computed(() => {
  return groupEditorDraft.value ? getEditableGroupDraftErrors(groupEditorDraft.value) : []
})

const getColumnDefaultItems = (columnType: string) => {
  return getColumnDefaultSuggestions(columnType)
}

const getReferenceColumnItems = (tableFullName: string): ReferenceTargetItem[] => {
  const referenceTable = workspaceParsedModel.value.tables.find(table => table.fullName === tableFullName)

  return referenceTable?.columns.map(column => ({
    label: column.name,
    value: column.name,
    description: column.type
  })) || []
}
const getReferenceActionSelectValue = (value: string) => {
  return value.length > 0 ? value : defaultReferenceActionSelectValue
}
const normalizeReferenceActionSelectValue = (value: unknown) => {
  if (typeof value !== 'string') {
    return ''
  }

  return value === defaultReferenceActionSelectValue ? '' : value
}

const openTableEditor = (tableId: string) => {
  if (!isWorkspacePreview.value || workspaceHasBlockingSourceErrors.value) {
    return
  }

  const table = workspaceParsedModel.value.tables.find(candidate => candidate.fullName === tableId)

  if (!table) {
    return
  }

  tableEditorDraft.value = cloneEditableTableDraft(createEditableTableDraft(table))
  tableEditorOpen.value = true
}

const openTableCreator = (groupName: string | null) => {
  if (!isWorkspacePreview.value || workspaceHasBlockingSourceErrors.value) {
    return
  }

  tableEditorDraft.value = createEditableTableDraftForGroup(groupName)
  tableEditorOpen.value = true
}

const openGroupEditor = (groupName: string) => {
  if (!isWorkspacePreview.value || workspaceHasBlockingSourceErrors.value) {
    return
  }

  const group = workspaceParsedModel.value.groups.find(candidate => candidate.name === groupName)

  if (!group) {
    return
  }

  groupEditorDraft.value = cloneEditableGroupDraft(createEditableGroupDraft(group, workspaceParsedModel.value))
  groupEditorOpen.value = true
}

const openGroupCreator = () => {
  if (!isWorkspacePreview.value || workspaceHasBlockingSourceErrors.value) {
    return
  }

  groupEditorDraft.value = createEditableGroupDraftForCreate()
  groupEditorOpen.value = true
}

const closeTableEditor = () => {
  tableEditorOpen.value = false
}

const closeGroupEditor = () => {
  groupEditorOpen.value = false
}
const handleTableEditorAfterLeave = () => {
  if (!tableEditorOpen.value) {
    tableEditorDraft.value = null
  }
}
const handleGroupEditorAfterLeave = () => {
  if (!groupEditorOpen.value) {
    groupEditorDraft.value = null
  }
}

const addTableDraftMetadataEntry = () => {
  if (!tableEditorDraft.value) {
    return
  }

  tableEditorDraft.value.customMetadata.push(createEditableMetadataEntryDraft())
}

const removeTableDraftMetadataEntry = (metadataEntryId: string) => {
  if (!tableEditorDraft.value) {
    return
  }

  tableEditorDraft.value.customMetadata = tableEditorDraft.value.customMetadata.filter((entry) => {
    return entry.id !== metadataEntryId
  })
}

const addTableDraftColumnMetadataEntry = (columnId: string) => {
  if (!tableEditorDraft.value) {
    return
  }

  const draftColumn = tableEditorDraft.value.columns.find(column => column.id === columnId)

  if (!draftColumn) {
    return
  }

  draftColumn.customMetadata.push(createEditableMetadataEntryDraft())
}

const removeTableDraftColumnMetadataEntry = (
  columnId: string,
  metadataEntryId: string
) => {
  if (!tableEditorDraft.value) {
    return
  }

  const draftColumn = tableEditorDraft.value.columns.find(column => column.id === columnId)

  if (!draftColumn) {
    return
  }

  draftColumn.customMetadata = draftColumn.customMetadata.filter((entry) => {
    return entry.id !== metadataEntryId
  })
}

const addTableDraftColumn = () => {
  if (!tableEditorDraft.value) {
    return
  }

  tableEditorDraft.value.columns.push({
    customMetadata: [],
    id: nanoid(),
    defaultValue: '',
    extraModifiers: [],
    name: '',
    note: '',
    notNull: false,
    originalName: null,
    primaryKey: false,
    referenceColumn: '',
    referenceDeleteAction: '',
    referenceEnabled: false,
    referenceRelation: '>',
    referenceSchema: 'public',
    referenceTable: '',
    referenceUpdateAction: '',
    type: 'text',
    unique: false
  })
}

const removeTableDraftColumn = (columnId: string) => {
  if (!tableEditorDraft.value || tableEditorDraft.value.columns.length <= 1) {
    return
  }

  tableEditorDraft.value.columns = tableEditorDraft.value.columns.filter(column => column.id !== columnId)
}

const updateTableDraftGroup = (value: string) => {
  if (!tableEditorDraft.value) {
    return
  }

  tableEditorDraft.value.groupName = value === 'Ungrouped' ? null : value
}

const updateGroupDraftTableNames = (value: unknown) => {
  if (!groupEditorDraft.value) {
    return
  }

  groupEditorDraft.value.tableNames = Array.isArray(value)
    ? Array.from(new Set(
        value
          .map((entry) => {
            if (typeof entry === 'string') {
              return entry
            }

            if (entry && typeof entry === 'object' && 'value' in entry) {
              return String((entry as { value: unknown }).value)
            }

            return ''
          })
          .filter(entry => entry.trim().length > 0)
      ))
    : []
}

const getGroupEditorColorPickerValue = (value: string) => {
  const normalizedValue = value.trim()
  const expandedHexMatch = normalizedValue.match(/^#([\da-f]{6})$/i)
  const shortHexMatch = normalizedValue.match(/^#([\da-f]{3})$/i)

  if (expandedHexMatch) {
    return normalizedValue
  }

  if (shortHexMatch) {
    const shortHexDigits = shortHexMatch[1] || ''
    const [red = '0', green = '0', blue = '0'] = shortHexDigits.split('')

    return `#${red}${red}${green}${green}${blue}${blue}`.toLowerCase()
  }

  return '#14b8a6'
}

const updateGroupDraftColor = (value: string) => {
  if (!groupEditorDraft.value) {
    return
  }

  groupEditorDraft.value.color = value
}

const updateTableDraftReferenceTarget = (columnId: string, value: string) => {
  if (!tableEditorDraft.value) {
    return
  }

  const draftColumn = tableEditorDraft.value.columns.find(column => column.id === columnId)

  if (!draftColumn) {
    return
  }

  const targetParts = value.split('.')

  if (targetParts.length >= 2) {
    draftColumn.referenceSchema = targetParts[0] || 'public'
    draftColumn.referenceTable = targetParts[1] || ''
  } else {
    draftColumn.referenceSchema = 'public'
    draftColumn.referenceTable = targetParts[0] || ''
  }

  draftColumn.referenceColumn = ''
}

const updateTableDraftReferenceColumn = (columnId: string, value: string) => {
  if (!tableEditorDraft.value) {
    return
  }

  const draftColumn = tableEditorDraft.value.columns.find(column => column.id === columnId)

  if (!draftColumn) {
    return
  }

  draftColumn.referenceColumn = value
}
const updateTableDraftReferenceAction = (
  columnId: string,
  field: ReferenceActionField,
  value: unknown
) => {
  if (!tableEditorDraft.value) {
    return
  }

  const draftColumn = tableEditorDraft.value.columns.find(column => column.id === columnId)

  if (!draftColumn) {
    return
  }

  draftColumn[field] = normalizeReferenceActionSelectValue(value)
}

const buildTableFullName = (schema: string, tableName: string) => {
  return `${schema.trim()}.${tableName.trim()}`
}

const persistTableDraftSchemaMetadata = (
  draft: PgmlEditableTableDraft,
  previousTableId: string | null
) => {
  const nextTableId = buildTableFullName(draft.schema, draft.name)
  const tableMetadataEntries = serializeEditableMetadataEntries(draft.customMetadata)
  const columnMetadataEntries = draft.columns.reduce<Array<{
    columnName: string
    entries: PgmlMetadataEntry[]
  }>>((entries, column) => {
    const normalizedColumnName = column.name.trim()

    if (normalizedColumnName.length === 0) {
      return entries
    }

    entries.push({
      columnName: normalizedColumnName,
      entries: serializeEditableMetadataEntries(column.customMetadata)
    })

    return entries
  }, [])
  let nextSchemaMetadata = versionDocument.value.schemaMetadata

  if (previousTableId && previousTableId !== nextTableId) {
    nextSchemaMetadata = removePgmlSchemaMetadataForTable(nextSchemaMetadata, previousTableId)
  }

  nextSchemaMetadata = replacePgmlTableSchemaMetadataEntries(
    nextSchemaMetadata,
    nextTableId,
    tableMetadataEntries
  )
  nextSchemaMetadata = removePgmlColumnSchemaMetadataForTable(nextSchemaMetadata, nextTableId)

  columnMetadataEntries.forEach((entry) => {
    nextSchemaMetadata = replacePgmlColumnSchemaMetadataEntries(
      nextSchemaMetadata,
      nextTableId,
      entry.columnName,
      entry.entries
    )
  })

  setSchemaMetadata(nextSchemaMetadata)
}

const saveTableEditor = async () => {
  if (!isWorkspacePreview.value || !tableEditorDraft.value || tableEditorErrors.value.length > 0) {
    return
  }

  await flushPendingEditorChanges({
    waitForAnalysis: true
  })
  const previousTableId = tableEditorDraft.value.originalFullName

  markBrowserSchemaStatusEligible()
  source.value = applyEditableTableDraftToSource(getLiveWorkspaceSource(), workspaceParsedModel.value, tableEditorDraft.value)
  persistTableDraftSchemaMetadata(tableEditorDraft.value, previousTableId)
  closeTableEditor()
}

const saveGroupEditor = async () => {
  if (!isWorkspacePreview.value || !groupEditorDraft.value || groupEditorErrors.value.length > 0) {
    return
  }

  await flushPendingEditorChanges({
    waitForAnalysis: true
  })
  markBrowserSchemaStatusEligible()
  source.value = applyEditableGroupDraftToSource(getLiveWorkspaceSource(), workspaceParsedModel.value, groupEditorDraft.value)
  closeGroupEditor()
}

const runExport = async (format: 'svg' | 'png', scaleFactor?: number) => {
  if (!canvasRef.value || isExporting.value) {
    return
  }

  await flushPendingEditorChanges({
    waitForAnalysis: true
  })
  isExporting.value = true

  try {
    await canvasRef.value.exportDiagram(format, scaleFactor)
  } catch (error) {
    console.error(error)
  } finally {
    isExporting.value = false
  }
}

const handleCanvasFocusSource = async (sourceRange: PgmlSourceRange) => {
  await flushPendingEditorChanges()

  if (versionedEditorMode.value === 'document') {
    versionedEditorMode.value = 'head'
  }

  if (isCompactStudioLayout.value) {
    mobileWorkspaceView.value = 'pgml'
  }

  focusEditorSourceRange(sourceRange)
}

const handleCanvasReplaceSourceRange = (input: {
  nextText: string
  sourceRange: PgmlSourceRange
}) => {
  if (!isWorkspacePreview.value) {
    return
  }

  const nextSource = replacePgmlSourceRange(getLiveWorkspaceSource(), input.sourceRange, input.nextText)

  if (nextSource === null || nextSource === source.value) {
    return
  }

  markBrowserSchemaStatusEligible()
  source.value = nextSource
}

const handleCanvasPanelTabChange = (nextTab: DiagramPanelTab) => {
  mobilePanelTab.value = nextTab
}

const handleCanvasToolPanelTabChange = (nextTab: DiagramToolPanelTab) => {
  mobileToolPanelTab.value = nextTab
}

const handleCanvasToolPanelVisibilityChange = (payload: {
  open: boolean
  tab: DiagramToolPanelTab
}) => {
  toolPanelVisibility.value = payload
}

const handleMobileCanvasViewChange = (nextView: StudioMobileCanvasView) => {
  mobileWorkspaceView.value = nextView
}
const analysisWorkspaceTabDescription = computed(() => {
  if (analysisWorkspaceTab.value === 'versions') {
    return 'Inspect the locked lineage, choose the current analysis target, and manage checkpoints without opening the diagram or raw PGML editor.'
  }

  if (analysisWorkspaceTab.value === 'compare') {
    return 'Review structural changes between versions without diagram highlights or source-jump behavior.'
  }

  return 'Generate forward migration artifacts for the currently selected compare pair.'
})
const setAnalysisWorkspaceTab = (tab: AnalysisWorkspaceTab) => {
  analysisWorkspaceTab.value = tab
  analysisMobileView.value = tab
}
const getAnalysisTabButtonClass = (tab: AnalysisWorkspaceTab) => {
  return getStudioTabButtonClass({
    active: analysisWorkspaceTab.value === tab,
    withTrailingBorder: tab !== 'migrations'
  })
}
const getAnalysisMobileButtonClass = (view: AnalysisWorkspaceTab) => {
  return joinStudioClasses(
    getStudioStateButtonClass({
      compact: true,
      emphasized: analysisMobileView.value === view
    }),
    'flex min-w-0 cursor-default items-center justify-center gap-1.5 px-2.5 py-2'
  )
}
const handleAnalysisCompareFocusSource = (_sourceRange: PgmlSourceRange) => {
}
const handleAnalysisCompareFocusTarget = (_entryId: string) => {
}

watchEffect(() => {
  setStudioHeaderActions({
    isLoading: isExporting.value,
    menus: actionMenus.value
  })
})

watchEffect(() => {
  const isWaitingToSave = activeHasPendingChanges.value && !activeIsSaving.value
  const isManualGistPending = currentPersistenceSource.value === 'gist' && isWaitingToSave
  const hasSavedInSession = activeHasSavedInSession.value && activeIsSaved.value && !isWaitingToSave
  const canShowBrowserSchemaStatus = currentPersistenceSource.value === 'file'
    || currentPersistenceSource.value === 'gist'
    || browserSchemaStatusEligible.value
  const showsManualMobileChromeSaveState = currentPersistenceSource.value === 'file'
    && !passiveComputerFileWritesSupported.value
    && activeHasPendingChanges.value
  const showSchemaStatus = canShowBrowserSchemaStatus && (
    activeSaveError.value !== null
    || isWaitingToSave
    || activeIsSaving.value
    || hasSavedInSession
  )
  const persistenceLabel = currentPersistenceSource.value === 'file'
    ? 'file'
    : currentPersistenceSource.value === 'gist'
      ? 'Gist'
      : 'local storage'
  let detail = ''

  if (activeSaveError.value) {
    detail = activeSaveError.value
  } else if (activeIsSaving.value) {
    detail = `Saving to ${persistenceLabel}...`
  } else if (showsManualMobileChromeSaveState) {
    detail = 'Changes are pending. Use Save to write them to the selected file on mobile Chrome.'
  } else if (isManualGistPending) {
    detail = 'Unsaved changes. Use Save to write them to Gist.'
  } else if (isWaitingToSave) {
    detail = `Waiting to save to ${persistenceLabel}...`
  } else if (hasSavedInSession && activeSchemaUpdatedAt.value) {
    detail = `Saved to ${persistenceLabel} at ${activeSavedAtFormatter.value(activeSchemaUpdatedAt.value)}`
  } else if (hasSavedInSession) {
    detail = `Saved to ${persistenceLabel}`
  }

  setStudioSchemaStatus({
    action: currentPersistenceSource.value === 'gist'
      ? {
          disabled: !hasSelectedGistFile.value || activeIsSaving.value,
          icon: 'i-lucide-save',
          label: 'Save',
          loading: activeIsSaving.value,
          onSelect: () => {
            void saveCurrentSchema()
          }
        }
      : null,
    detail,
    name: activeSchemaName.value,
    saveState: activeSaveError.value
      ? 'error'
      : activeIsSaving.value
        ? 'saving'
        : isWaitingToSave
          ? 'pending'
          : 'saved',
    visible: showSchemaStatus
  })
})

const handleBeforeUnload = (event: BeforeUnloadEvent) => {
  if (currentPersistenceSource.value !== 'gist' || !activeHasPendingChanges.value) {
    return
  }

  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onBeforeRouteLeave((to) => {
  if (isStudioWorkspacePath(to.path)) {
    return
  }

  if (
    currentPersistenceSource.value === 'gist'
    && activeHasPendingChanges.value
    && !window.confirm('This Gist-backed PGML file has unsaved changes. Leave without saving?')
  ) {
    return false
  }

  clearStudioHeaderActions()
  clearStudioSchemaStatus()
  studioSessionStore.resetStudioUiState()
  resetStudioWorkspaceState()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  pgmlAnalysisWorker?.terminate()
  pgmlAnalysisWorker = null
})
</script>

<template>
  <div class="h-full min-h-0">
    <template v-if="isDiagramWorkspace">
      <StudioMobileWorkspace
        v-if="isCompactStudioLayout"
        v-model:active-view="mobileWorkspaceView"
        v-model:active-panel-tab="mobilePanelTab"
        v-model:active-tool-panel-tab="mobileToolPanelTab"
      >
        <template #canvas>
          <PgmlDiagramCanvas
            ref="canvasRef"
            :active-diagram-view-id="activeDiagramViewId"
            :can-create-checkpoint="canCheckpoint"
            :can-delete-diagram-view="canDeleteDiagramView"
            :can-edit-detail-source="isWorkspacePreview"
            :compare-base-label="compareBaseLabel"
            :compare-base-model="compareBaseModel"
            :compare-comparison-items="comparisonItems"
            :compare-entries="compareEntries"
            :compare-excluded-labels="activeCompareExclusionVisibleLabels"
            :compare-excluded-summary="activeCompareExclusionSummary"
            :compare-hidden-excluded-label-count="activeCompareExclusionHiddenLabelCount"
            :compare-note-filters="compareNoteFilters"
            :compare-notes="activeCompareNotes"
            :compare-noise-filters="activeCompareNoiseFilters"
            :compare-relationship-summary="compareRelationshipSummary"
            :compare-saved-comparison-hint="savedComparisonHint"
            :compare-selected-comparison-id="selectedComparisonId"
            :compare-target-label="compareTargetLabel"
            :diagram-view-items="diagramViewItems"
            :diagram-view-settings="diagramViewSettings"
            :model="parsedModel"
            :export-base-name="exportBaseName"
            :export-preference-key="exportPreferenceKey"
            :has-blocking-source-errors="hasBlockingSourceErrors"
            :migration-file-name="compareMigrationBundle.sql.migration.fileName"
            :migration-has-changes="compareMigrationHasOutput"
            :migration-kysely="compareMigrationBundle.kysely.migration.content"
            :migration-kysely-file-name="compareMigrationBundle.kysely.migration.fileName"
            :migration-sql="compareMigrationBundle.sql.migration.content"
            :migration-steps="compareMigrationBundle.steps"
            :migration-warnings="compareMigrationBundle.sql.migration.warnings"
            :mobile-active-view="mobileCanvasView"
            :mobile-panel-tab="mobilePanelTab"
            :mobile-tool-panel-tab="mobileToolPanelTab"
            :preview-target-id="previewTargetId"
            :source-text="source"
            :version-compare-base-id="versionCompareBaseId"
            :version-compare-options="versionCompareOptions"
            :version-compare-target-id="versionCompareTargetId"
            :version-items="versionPanelItems"
            :workspace-base-label="workspaceBaseLabel"
            :workspace-status="workspaceStatus"
            :viewport-reset-key="canvasViewportResetKey"
            @create-compare-comparison="openCreateComparisonDialog"
            @create-group="openGroupCreator"
            @create-diagram-view="createActiveDiagramView"
            @focus-source="handleCanvasFocusSource"
            @mobile-canvas-view-change="handleMobileCanvasViewChange"
            @panel-tab-change="handleCanvasPanelTabChange"
            @replace-source-range="handleCanvasReplaceSourceRange"
            @tool-panel-tab-change="handleCanvasToolPanelTabChange"
            @tool-panel-visibility-change="handleCanvasToolPanelVisibilityChange"
            @create-table="openTableCreator"
            @delete-compare-comparison="deleteSelectedComparisonPreset"
            @delete-diagram-view="deleteSelectedDiagramView"
            @delete-version="openDeleteVersionDialog"
            @edit-group="openGroupEditor"
            @edit-table="openTableEditor"
            @edit-compare-entry-note="openCompareNoteDialog"
            @edit-compare-exclusions="openCompareExclusionsDialog"
            @node-properties-change="syncSourceWithNodeProperties"
            @rename-compare-comparison="openRenameComparisonDialog"
            @rename-diagram-view="renameSelectedDiagramView"
            @rename-version="openRenameVersionDialog"
            @restore-version="restoreVersionToWorkspace"
            @select-compare-comparison="selectComparison"
            @select-diagram-view="selectActiveDiagramView"
            @update-compare-note-filters="updateVersionCompareNoteFilters"
            @update-compare-noise-filters="updateVersionCompareNoiseFilters"
            @update-diagram-view-settings="updateDiagramViewSettings"
            @update-version-compare-base-id="updateVersionCompareBaseId"
            @update-version-compare-target-id="updateVersionCompareTargetId"
            @version-checkpoint="openCheckpointDialog"
            @version-import-dbml="openImportDbmlDialog"
            @version-import-dump="openImportDumpDialog"
            @view-version-target="viewVersionTarget"
          />
        </template>

        <template #pgml>
          <StudioEditorSurface
            v-model="editorDisplaySource"
            :document-scope="documentEditorScope"
            :document-scope-items="documentEditorScopeItems"
            :editor-mode="versionedEditorMode"
            :editor-mode-items="versionedEditorModeItems"
            :editor-ref-setter="assignEditorRef"
            :activate-completion-on-typing="editorActivateCompletionOnTyping"
            :commit-debounce-ms="editorCommitDebounceMs"
            :diagnostics-delay-ms="editorDiagnosticsDelayMs"
            :focus-diagnostic="focusEditorDiagnostic"
            :mode-description="editorModeDescription"
            :read-only="isEditorReadOnly"
            :read-only-label="editorReadOnlyLabel"
            :source-diagnostics="sourceDiagnostics"
            :source-error-count="sourceErrorDiagnostics.length"
            :source-warning-count="sourceWarningDiagnostics.length"
            @update:document-scope="updateDocumentEditorScope"
            @update:editor-mode="updateVersionedEditorMode"
          />
        </template>
      </StudioMobileWorkspace>

      <StudioDesktopWorkspace
        v-else
        :is-editor-panel-visible="isEditorPanelVisible"
        :layout-shell-ref-setter="assignLayoutShellRef"
        :studio-layout-style="studioLayoutStyle"
        @toggle-editor-visibility="toggleEditorPanelVisibility"
        @resize-editor-by="resizeEditorPanelBy"
        @start-editor-resize="startEditorResize"
      >
        <template #editor>
          <StudioEditorSurface
            v-model="editorDisplaySource"
            :document-scope="documentEditorScope"
            :document-scope-items="documentEditorScopeItems"
            :editor-mode="versionedEditorMode"
            :editor-mode-items="versionedEditorModeItems"
            :editor-ref-setter="assignEditorRef"
            :activate-completion-on-typing="editorActivateCompletionOnTyping"
            :commit-debounce-ms="editorCommitDebounceMs"
            :diagnostics-delay-ms="editorDiagnosticsDelayMs"
            :focus-diagnostic="focusEditorDiagnostic"
            :mode-description="editorModeDescription"
            :read-only="isEditorReadOnly"
            :read-only-label="editorReadOnlyLabel"
            :source-diagnostics="sourceDiagnostics"
            :source-error-count="sourceErrorDiagnostics.length"
            :source-warning-count="sourceWarningDiagnostics.length"
            @update:document-scope="updateDocumentEditorScope"
            @update:editor-mode="updateVersionedEditorMode"
          />
        </template>

        <template #canvas>
          <PgmlDiagramCanvas
            ref="canvasRef"
            :active-diagram-view-id="activeDiagramViewId"
            :can-create-checkpoint="canCheckpoint"
            :can-delete-diagram-view="canDeleteDiagramView"
            :can-edit-detail-source="isWorkspacePreview"
            :compare-base-label="compareBaseLabel"
            :compare-base-model="compareBaseModel"
            :compare-comparison-items="comparisonItems"
            :compare-entries="compareEntries"
            :compare-excluded-labels="activeCompareExclusionVisibleLabels"
            :compare-excluded-summary="activeCompareExclusionSummary"
            :compare-hidden-excluded-label-count="activeCompareExclusionHiddenLabelCount"
            :compare-note-filters="compareNoteFilters"
            :compare-notes="activeCompareNotes"
            :compare-noise-filters="activeCompareNoiseFilters"
            :compare-relationship-summary="compareRelationshipSummary"
            :compare-saved-comparison-hint="savedComparisonHint"
            :compare-selected-comparison-id="selectedComparisonId"
            :compare-target-label="compareTargetLabel"
            :diagram-view-items="diagramViewItems"
            :diagram-view-settings="diagramViewSettings"
            :model="parsedModel"
            :export-base-name="exportBaseName"
            :export-preference-key="exportPreferenceKey"
            :has-blocking-source-errors="hasBlockingSourceErrors"
            :migration-file-name="compareMigrationBundle.sql.migration.fileName"
            :migration-has-changes="compareMigrationHasOutput"
            :migration-kysely="compareMigrationBundle.kysely.migration.content"
            :migration-kysely-file-name="compareMigrationBundle.kysely.migration.fileName"
            :migration-sql="compareMigrationBundle.sql.migration.content"
            :migration-steps="compareMigrationBundle.steps"
            :migration-warnings="compareMigrationBundle.sql.migration.warnings"
            :preview-target-id="previewTargetId"
            :source-text="source"
            :version-compare-base-id="versionCompareBaseId"
            :version-compare-options="versionCompareOptions"
            :version-compare-target-id="versionCompareTargetId"
            :version-items="versionPanelItems"
            :workspace-base-label="workspaceBaseLabel"
            :workspace-status="workspaceStatus"
            :viewport-reset-key="canvasViewportResetKey"
            @create-compare-comparison="openCreateComparisonDialog"
            @create-group="openGroupCreator"
            @create-diagram-view="createActiveDiagramView"
            @focus-source="handleCanvasFocusSource"
            @mobile-canvas-view-change="handleMobileCanvasViewChange"
            @panel-tab-change="handleCanvasPanelTabChange"
            @replace-source-range="handleCanvasReplaceSourceRange"
            @tool-panel-tab-change="handleCanvasToolPanelTabChange"
            @tool-panel-visibility-change="handleCanvasToolPanelVisibilityChange"
            @create-table="openTableCreator"
            @delete-compare-comparison="deleteSelectedComparisonPreset"
            @delete-diagram-view="deleteSelectedDiagramView"
            @delete-version="openDeleteVersionDialog"
            @edit-group="openGroupEditor"
            @edit-table="openTableEditor"
            @edit-compare-entry-note="openCompareNoteDialog"
            @edit-compare-exclusions="openCompareExclusionsDialog"
            @node-properties-change="syncSourceWithNodeProperties"
            @rename-compare-comparison="openRenameComparisonDialog"
            @rename-diagram-view="renameSelectedDiagramView"
            @rename-version="openRenameVersionDialog"
            @restore-version="restoreVersionToWorkspace"
            @select-compare-comparison="selectComparison"
            @select-diagram-view="selectActiveDiagramView"
            @update-compare-note-filters="updateVersionCompareNoteFilters"
            @update-compare-noise-filters="updateVersionCompareNoiseFilters"
            @update-diagram-view-settings="updateDiagramViewSettings"
            @update-version-compare-base-id="updateVersionCompareBaseId"
            @update-version-compare-target-id="updateVersionCompareTargetId"
            @version-checkpoint="openCheckpointDialog"
            @version-import-dbml="openImportDbmlDialog"
            @version-import-dump="openImportDumpDialog"
            @view-version-target="viewVersionTarget"
          />
        </template>
      </StudioDesktopWorkspace>
    </template>

    <section
      v-else
      data-analysis-workspace="true"
      class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] bg-[color:var(--studio-shell-bg)] text-[color:var(--studio-shell-text)]"
    >
      <div class="border-b border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)] px-3 py-3 sm:px-4">
        <div class="flex flex-col gap-3">
          <div>
            <div class="font-mono text-[0.58rem] uppercase tracking-[0.12em] text-[color:var(--studio-shell-label)]">
              Analysis workspace
            </div>
            <p class="mt-1 max-w-3xl text-[0.78rem] leading-6 text-[color:var(--studio-shell-muted)]">
              {{ analysisWorkspaceTabDescription }}
            </p>
          </div>

          <div
            class="grid grid-cols-3 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)]"
            data-analysis-tabs="true"
          >
            <button
              type="button"
              data-analysis-tab="versions"
              :class="getAnalysisTabButtonClass('versions')"
              @click="setAnalysisWorkspaceTab('versions')"
            >
              Versions
            </button>
            <button
              type="button"
              data-analysis-tab="compare"
              :class="getAnalysisTabButtonClass('compare')"
              @click="setAnalysisWorkspaceTab('compare')"
            >
              Compare
            </button>
            <button
              type="button"
              data-analysis-tab="migrations"
              :class="getAnalysisTabButtonClass('migrations')"
              @click="setAnalysisWorkspaceTab('migrations')"
            >
              Migrations
            </button>
          </div>

          <div
            v-if="isCompactStudioLayout"
            class="grid grid-cols-3 gap-2"
            data-analysis-mobile-tabs="true"
          >
            <button
              type="button"
              data-analysis-mobile-tab="versions"
              :class="getAnalysisMobileButtonClass('versions')"
              @click="setAnalysisWorkspaceTab('versions')"
            >
              Versions
            </button>
            <button
              type="button"
              data-analysis-mobile-tab="compare"
              :class="getAnalysisMobileButtonClass('compare')"
              @click="setAnalysisWorkspaceTab('compare')"
            >
              Compare
            </button>
            <button
              type="button"
              data-analysis-mobile-tab="migrations"
              :class="getAnalysisMobileButtonClass('migrations')"
              @click="setAnalysisWorkspaceTab('migrations')"
            >
              Migrations
            </button>
          </div>
        </div>
      </div>

      <div class="min-h-0 overflow-hidden">
        <PgmlDiagramVersionsPanel
          v-if="analysisWorkspaceTab === 'versions'"
          :can-create-checkpoint="canCheckpoint"
          :preview-target-id="previewTargetId"
          :versions="versionPanelItems"
          :workspace-base-label="workspaceBaseLabel"
          :workspace-status="workspaceStatus"
          @create-checkpoint="openCheckpointDialog"
          @delete-version="openDeleteVersionDialog"
          @import-dbml="openImportDbmlDialog"
          @import-dump="openImportDumpDialog"
          @rename-version="openRenameVersionDialog"
          @restore-version="restoreVersionToWorkspace"
          @view-target="viewVersionTarget"
        />

        <PgmlDiagramComparePanel
          v-else-if="analysisWorkspaceTab === 'compare'"
          :base-label="compareBaseLabel"
          :comparison-items="comparisonItems"
          :comparison-label="analysisComparisonLabel"
          :can-edit-notes="selectedComparison !== null"
          :compare-base-id="versionCompareBaseId"
          :compare-note-filters="compareNoteFilters"
          :compare-notes="activeCompareNotes"
          :compare-noise-filters="activeCompareNoiseFilters"
          :compare-options="versionCompareOptions"
          :compare-target-id="versionCompareTargetId"
          :excluded-labels="activeCompareExclusionVisibleLabels"
          :excluded-summary="activeCompareExclusionSummary"
          :entries="compareEntries"
          :hidden-excluded-label-count="activeCompareExclusionHiddenLabelCount"
          :relationship-summary="compareRelationshipSummary"
          :saved-comparison-hint="savedComparisonHint"
          :selected-comparison-id="selectedComparisonId"
          :selected-diagram-context-ids="[]"
          :selected-entry-id="analysisSelectedCompareEntryId"
          :target-label="compareTargetLabel"
          @create-comparison="openCreateComparisonDialog"
          @delete-comparison="deleteSelectedComparisonPreset"
          @edit-entry-note="openCompareNoteDialog"
          @edit-comparison-exclusions="openCompareExclusionsDialog"
          @focus-source="handleAnalysisCompareFocusSource"
          @focus-target="handleAnalysisCompareFocusTarget"
          @rename-comparison="openRenameComparisonDialog"
          @select-comparison="selectComparison"
          @select-entry="analysisSelectedCompareEntryId = $event"
          @update:compare-base-id="updateVersionCompareBaseId"
          @update:compare-note-filters="updateVersionCompareNoteFilters"
          @update:compare-noise-filters="updateVersionCompareNoiseFilters"
          @update:compare-target-id="updateVersionCompareTargetId"
        />

        <PgmlDiagramMigrationsPanel
          v-else
          :compare-base-label="compareBaseLabel"
          :compare-target-label="compareTargetLabel"
          :migration-file-name="compareMigrationBundle.sql.migration.fileName"
          :migration-has-changes="compareMigrationHasOutput"
          :migration-kysely="compareMigrationBundle.kysely.migration.content"
          :migration-kysely-file-name="compareMigrationBundle.kysely.migration.fileName"
          :migration-sql="compareMigrationBundle.sql.migration.content"
          :migration-steps="compareMigrationBundle.steps"
          :migration-warnings="compareMigrationBundle.sql.migration.warnings"
        />
      </div>
    </section>

    <ClientOnly>
      <StudioModalFrame
        v-model:open="checkpointDialogOpen"
        title="Create checkpoint"
        description="Lock the current workspace snapshot as an immutable PGML version."
        surface-id="checkpoint"
        body-class="grid gap-4 px-4 py-3"
      >
        <div class="grid gap-4">
          <div class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3">
            <div :class="studioFieldKickerClass">
              Checkpoint target
            </div>
            <div class="mt-2 text-[0.84rem] font-semibold text-[color:var(--studio-shell-text)]">
              {{ buildPgmlCheckpointTargetLabel(checkpointBaseVersion ? getVersionLabel(checkpointBaseVersion) : null) }}
            </div>
            <p class="mt-2 text-[0.72rem] leading-6 text-[color:var(--studio-shell-muted)]">
              {{
                buildPgmlCheckpointRoleDescription(checkpointRole)
              }}
            </p>
          </div>

          <label class="grid gap-1">
            <span :class="studioFieldKickerClass">
              Version name
            </span>
            <UInput
              v-model="checkpointName"
              placeholder="Checkpoint name"
              color="neutral"
              variant="outline"
              size="sm"
              :ui="studioFieldUi"
              @update:model-value="checkpointNameIsSuggested = false"
            />
          </label>

          <label class="grid gap-1">
            <span :class="studioFieldKickerClass">
              Version role
            </span>
            <USelect
              :items="checkpointRoleItems"
              :model-value="checkpointRole"
              value-key="value"
              label-key="label"
              color="neutral"
              variant="outline"
              size="sm"
              :ui="studioSelectUi"
              @update:model-value="checkpointRole = $event === 'implementation' ? 'implementation' : 'design'"
            />
          </label>
        </div>

        <template #footer>
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            :class="secondaryModalButtonClass"
            @click="closeCheckpointDialog"
          />
          <UButton
            :label="checkpointRole === 'implementation' ? 'Create implementation checkpoint' : 'Create design checkpoint'"
            color="neutral"
            variant="soft"
            :class="primaryModalButtonClass"
            :disabled="checkpointName.trim().length === 0 || !canCheckpoint"
            @click="saveCheckpoint"
          />
        </template>
      </StudioModalFrame>

      <StudioModalFrame
        v-model:open="restoreVersionDialogOpen"
        title="Restore version to workspace"
        description="Replace the current workspace draft with a locked version snapshot."
        surface-id="restore-version"
        body-class="grid gap-4 px-4 py-3"
      >
        <div class="grid gap-3">
          <div class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3">
            <div :class="studioFieldKickerClass">
              Selected version
            </div>
            <div class="mt-2 text-[0.85rem] font-semibold text-[color:var(--studio-shell-text)]">
              {{ restoreVersionCandidate ? getVersionLabel(restoreVersionCandidate) : 'Unknown version' }}
            </div>
            <p class="mt-2 text-[0.74rem] leading-6 text-[color:var(--studio-shell-muted)]">
              {{
                buildPgmlRestoreVersionDescription(activeHasPendingChanges)
              }}
            </p>
          </div>
        </div>

        <template #footer>
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            :class="secondaryModalButtonClass"
            @click="closeRestoreVersionDialog"
          />
          <UButton
            label="Restore version"
            color="neutral"
            variant="soft"
            :class="primaryModalButtonClass"
            @click="confirmRestoreVersionToWorkspace"
          />
        </template>
      </StudioModalFrame>

      <StudioModalFrame
        v-model:open="deleteVersionDialogOpen"
        title="Delete version"
        :description="deleteVersionDialogDescription"
        surface-id="delete-version"
        body-class="grid gap-4 px-4 py-3"
        @close="closeDeleteVersionDialog"
      >
        <div class="grid gap-3">
          <div class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3">
            <div :class="studioFieldKickerClass">
              Selected version
            </div>
            <div class="mt-2 text-[0.85rem] font-semibold text-[color:var(--studio-shell-text)]">
              {{ deleteVersionCandidate ? getVersionLabel(deleteVersionCandidate) : 'Unknown version' }}
            </div>
            <p class="mt-2 text-[0.74rem] leading-6 text-[color:var(--studio-shell-muted)]">
              {{
                deleteVersionCandidate?.deleteBlockedReason
                  ? `Delete stays locked while ${deleteVersionCandidate.deleteBlockedReason}.`
                  : 'This permanently removes the locked checkpoint from the current PGML document.'
              }}
            </p>
          </div>
        </div>

        <template #footer>
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            :class="secondaryModalButtonClass"
            @click="closeDeleteVersionDialog"
          />
          <UButton
            label="Delete version"
            data-delete-version-confirm="true"
            color="neutral"
            variant="soft"
            :class="primaryModalButtonClass"
            :disabled="!deleteVersionCandidate || !deleteVersionCandidate.canDelete"
            @click="confirmDeleteVersion"
          />
        </template>
      </StudioModalFrame>

      <StudioModalFrame
        v-model:open="diagramViewDialogOpen"
        :title="diagramViewDialogTitle"
        :description="diagramViewDialogDescription"
        surface-id="diagram-view"
        body-class="grid gap-4 px-4 py-3"
        @close="closeDiagramViewDialog"
      >
        <div class="grid gap-3">
          <label class="grid gap-1">
            <span :class="studioFieldKickerClass">
              View name
            </span>
            <UInput
              v-model="diagramViewDraftName"
              data-diagram-view-name-input="true"
              placeholder="View name"
              color="neutral"
              variant="outline"
              size="sm"
              :ui="studioFieldUi"
            />
          </label>

          <div
            v-if="diagramViewNameError"
            data-diagram-view-name-error="true"
            class="grid gap-1 border border-[color:var(--studio-shell-error)]/40 bg-[color:var(--studio-shell-error)]/8 px-3 py-3 text-[0.74rem] text-[color:var(--studio-shell-error)]"
          >
            <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em]">
              View name
            </div>
            <div>
              {{ diagramViewNameError }}
            </div>
          </div>
        </div>

        <template #footer>
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            :class="secondaryModalButtonClass"
            @click="closeDiagramViewDialog"
          />
          <UButton
            :label="diagramViewDialogMode === 'rename' ? 'Rename view' : 'Create view'"
            data-diagram-view-save="true"
            color="neutral"
            variant="soft"
            :class="primaryModalButtonClass"
            :disabled="diagramViewNameError !== null"
            @click="saveDiagramViewDialog"
          />
        </template>
      </StudioModalFrame>

      <StudioModalFrame
        v-model:open="comparisonDialogOpen"
        :title="comparisonDialogTitle"
        :description="comparisonDialogDescription"
        surface-id="compare-comparison"
        body-class="grid gap-4 px-4 py-3"
        @close="closeComparisonDialog"
      >
        <div class="grid gap-3">
          <div class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3">
            <div :class="studioFieldKickerClass">
              Current comparison
            </div>
            <div class="mt-2 text-[0.85rem] font-semibold text-[color:var(--studio-shell-text)]">
              {{ compareBaseLabel }} to {{ compareTargetLabel }}
            </div>
            <p class="mt-2 text-[0.74rem] leading-6 text-[color:var(--studio-shell-muted)]">
              {{ activeCompareExclusionSummary || 'No compare exclusions selected yet.' }}
            </p>
          </div>

          <label class="grid gap-1">
            <span :class="studioFieldKickerClass">
              Comparison name
            </span>
            <UInput
              v-model="comparisonDraftName"
              data-compare-comparison-name-input="true"
              placeholder="Comparison name"
              color="neutral"
              variant="outline"
              size="sm"
              :ui="studioFieldUi"
            />
          </label>

          <div
            v-if="comparisonNameError"
            class="grid gap-1 border border-[color:var(--studio-shell-error)]/40 bg-[color:var(--studio-shell-error)]/8 px-3 py-3 text-[0.74rem] text-[color:var(--studio-shell-error)]"
          >
            <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em]">
              Comparison name
            </div>
            <div>
              {{ comparisonNameError }}
            </div>
          </div>
        </div>

        <template #footer>
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            :class="secondaryModalButtonClass"
            @click="closeComparisonDialog"
          />
          <UButton
            :label="comparisonDialogMode === 'rename' ? 'Rename comparison' : 'Create comparison'"
            data-compare-comparison-save="true"
            color="neutral"
            variant="soft"
            :class="primaryModalButtonClass"
            :disabled="comparisonNameError !== null"
            @click="saveComparisonDialog"
          />
        </template>
      </StudioModalFrame>

      <StudioModalFrame
        v-model:open="compareNoteDialogOpen"
        :title="compareNoteDialogTitle"
        :description="compareNoteDialogDescription"
        surface-id="compare-note"
        body-class="grid gap-4 px-4 py-3"
        @close="closeCompareNoteDialog"
      >
        <div class="grid gap-4">
          <div class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3">
            <div :class="studioFieldKickerClass">
              Compare entry
            </div>
            <div class="mt-2 text-[0.85rem] font-semibold text-[color:var(--studio-shell-text)] [overflow-wrap:anywhere]">
              {{ compareNoteDialogEntryLabel }}
            </div>
          </div>

          <label class="grid gap-1">
            <span :class="studioFieldKickerClass">
              Flag
            </span>
            <USelect
              v-model="compareNoteDraftFlag"
              :items="compareNoteFlagItems"
              value-key="value"
              label-key="label"
              color="neutral"
              variant="outline"
              size="sm"
              :ui="studioSelectUi"
            />
          </label>

          <label class="grid gap-1">
            <span :class="studioFieldKickerClass">
              Note
            </span>
            <textarea
              v-model="compareNoteDraftText"
              data-compare-note-input="true"
              rows="6"
              placeholder="Describe the follow-up or decision for this difference."
              :class="joinStudioClasses(textareaClass, 'min-h-[7rem]')"
            />
          </label>
        </div>

        <template #footer>
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            :class="secondaryModalButtonClass"
            @click="closeCompareNoteDialog"
          />
          <UButton
            v-if="activeCompareNoteForDraftEntry"
            label="Remove note"
            color="neutral"
            variant="outline"
            :class="secondaryModalButtonClass"
            @click="deleteCompareNoteDialog"
          />
          <UButton
            label="Save note"
            data-compare-note-save="true"
            color="neutral"
            variant="soft"
            :class="primaryModalButtonClass"
            :disabled="!canSaveCompareNote"
            @click="saveCompareNoteDialog"
          />
        </template>
      </StudioModalFrame>

      <StudioModalFrame
        v-model:open="compareExclusionsDialogOpen"
        title="Manage compare exclusions"
        :description="compareExclusionsDialogDescription"
        surface-id="compare-exclusions"
        body-class="grid min-h-0 gap-4 px-4 py-3"
        @close="closeCompareExclusionsDialog"
      >
        <div class="grid gap-4">
          <div class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3">
            <div :class="studioFieldKickerClass">
              Editing exclusions for
            </div>
            <div class="mt-2 text-[0.85rem] font-semibold text-[color:var(--studio-shell-text)]">
              {{ compareComparisonLabel }}
            </div>
            <p class="mt-2 text-[0.74rem] leading-6 text-[color:var(--studio-shell-muted)]">
              {{
                compareExclusionsDraft
                  ? `${draftCompareExclusionSummary || 'No compare exclusions selected'} · ${compareExclusionsSelectionCount} selected chip${compareExclusionsSelectionCount === 1 ? '' : 's'}`
                  : 'No exclusions loaded.'
              }}
            </p>
          </div>

          <label class="grid gap-1">
            <span :class="studioFieldKickerClass">
              Search exclusions
            </span>
            <input
              v-model="compareExclusionsSearchQuery"
              data-compare-exclusions-search="true"
              type="search"
              placeholder="Filter groups, tables, and compare entities"
              :class="joinStudioClasses(studioCompactInputClass, 'w-full')"
            >
          </label>

          <div class="grid gap-1">
            <span :class="studioFieldKickerClass">
              Filter by type
            </span>
            <div
              data-compare-exclusions-type-filters="true"
              class="flex min-w-0 flex-wrap gap-2"
            >
              <button
                v-for="item in compareExclusionTypeFilterItems"
                :key="item.value"
                type="button"
                :data-compare-exclusions-type-filter="item.value"
                :class="getStudioToggleChipClass({
                  active: isCompareExclusionsTypeFilterActive(item.value),
                  extraClass: joinStudioClasses(compareExclusionTypeFilterChipExtraClass, 'items-center gap-2')
                })"
                :aria-pressed="isCompareExclusionsTypeFilterActive(item.value)"
                @click="setCompareExclusionsTypeFilter(item.value)"
              >
                <span>{{ item.label }}</span>
                <span class="text-[color:var(--studio-shell-muted)]">
                  {{ item.count }}
                </span>
              </button>
            </div>
          </div>

          <div class="grid gap-2">
            <div :class="studioFieldKickerClass">
              Exclude from compare
            </div>
            <p :class="studioCompactBodyCopyClass">
              Select a group to exclude its full cluster, pick individual tables inside it, or exclude other comparable entities like indexes, references, types, and executables.
            </p>
            <section
              v-if="staleCompareExclusionEntityOptions.length > 0"
              data-compare-exclusion-stale-section="true"
              class="grid gap-2 border border-amber-500/30 bg-amber-500/8 px-3 py-3"
            >
              <div :class="studioFieldKickerClass">
                No longer applicable
              </div>
              <p :class="studioCompactBodyCopyClass">
                These saved entity exclusions no longer exist in the current base and target pair. Remove them if they are no longer needed.
              </p>
              <div class="grid gap-2">
                <div
                  v-for="option in staleCompareExclusionEntityOptions"
                  :key="`stale:${option.id}`"
                  class="flex flex-wrap items-center justify-between gap-2 border border-[color:var(--studio-shell-border)]/70 px-3 py-2"
                >
                  <div class="min-w-0 text-[0.72rem] leading-5 text-[color:var(--studio-shell-text)]">
                    {{ buildCompareExclusionSummaryLabel(option) }}
                  </div>
                  <UButton
                    label="Remove"
                    :data-compare-exclusion-stale-remove="option.id"
                    color="neutral"
                    variant="outline"
                    size="xs"
                    :class="secondaryModalButtonClass"
                    @click="removeCompareExclusionOption(option)"
                  />
                </div>
              </div>
            </section>
            <div
              v-if="hasVisibleCompareExclusionOptions"
              data-compare-exclusion-options="true"
              class="grid min-w-0 gap-4 pr-1"
            >
              <section
                v-if="compareExclusionsShowsGroupSections"
                data-compare-exclusion-groups-section="true"
                class="grid min-w-0 gap-2"
              >
                <div :class="studioFieldKickerClass">
                  Groups
                </div>
                <div
                  v-if="filteredCompareExclusionGroupSections.length > 0"
                  class="grid gap-3"
                >
                  <section
                    v-for="section in filteredCompareExclusionGroupSections"
                    :key="section.id"
                    :data-compare-exclusion-group-section="section.groupOption.value"
                    class="grid min-w-0 gap-2 border border-[color:var(--studio-shell-border)]/70 px-3 py-3"
                  >
                    <div class="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        :data-compare-exclusion-option="section.groupOption.id"
                        :class="getStudioToggleChipClass({
                          active: isCompareExclusionOptionSelected(section.groupOption),
                          extraClass: compareExclusionChipExtraClass
                        })"
                        :aria-pressed="isCompareExclusionOptionSelected(section.groupOption)"
                        @click="toggleCompareExclusionOption(section.groupOption)"
                      >
                        {{ section.groupOption.label }}
                      </button>
                      <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
                        {{ section.tableOptions.length }} table{{ section.tableOptions.length === 1 ? '' : 's' }}
                      </span>
                    </div>

                    <div
                      v-if="compareExclusionsShowsGroupedTableOptions && section.tableOptions.length > 0"
                      :data-compare-exclusion-group-tables="section.groupOption.value"
                      class="grid min-w-0 gap-2 border-l border-[color:var(--studio-divider)] pl-3"
                    >
                      <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
                        Tables
                      </div>
                      <div class="flex min-w-0 flex-wrap gap-2">
                        <button
                          v-for="option in section.tableOptions"
                          :key="`${section.groupOption.value}:${option.id}`"
                          type="button"
                          :data-compare-exclusion-option="option.id"
                          :class="getStudioToggleChipClass({
                            active: isCompareExclusionOptionSelected(option),
                            extraClass: compareExclusionChipExtraClass
                          })"
                          :aria-pressed="isCompareExclusionOptionSelected(option)"
                          @click="toggleCompareExclusionOption(option)"
                        >
                          {{ option.label }}
                        </button>
                      </div>
                    </div>
                  </section>
                </div>
                <div
                  v-else
                  :class="studioEmptyStateClass"
                >
                  No groups or grouped tables match the current filter.
                </div>
              </section>

              <section
                v-if="compareExclusionsShowsUngroupedTableSection"
                data-compare-exclusion-ungrouped-section="true"
                class="grid min-w-0 gap-2"
              >
                <div :class="studioFieldKickerClass">
                  Ungrouped tables
                </div>
                <div
                  v-if="filteredCompareExclusionUngroupedTableOptions.length > 0"
                  class="flex min-w-0 flex-wrap gap-2"
                >
                  <button
                    v-for="option in filteredCompareExclusionUngroupedTableOptions"
                    :key="option.id"
                    type="button"
                    :data-compare-exclusion-option="option.id"
                    :class="getStudioToggleChipClass({
                      active: isCompareExclusionOptionSelected(option),
                      extraClass: compareExclusionChipExtraClass
                    })"
                    :aria-pressed="isCompareExclusionOptionSelected(option)"
                    @click="toggleCompareExclusionOption(option)"
                  >
                    {{ option.label }}
                  </button>
                </div>
                <div
                  v-else
                  :class="studioEmptyStateClass"
                >
                  No ungrouped tables match the current filter.
                </div>
              </section>

              <section
                v-if="compareExclusionsShowsEntitySections"
                data-compare-exclusion-entities-section="true"
                class="grid min-w-0 gap-2"
              >
                <div :class="studioFieldKickerClass">
                  Other compare entities
                </div>
                <div
                  v-if="filteredCompareExclusionEntitySections.length > 0"
                  class="grid min-w-0 gap-3"
                >
                  <section
                    v-for="section in filteredCompareExclusionEntitySections"
                    :key="section.id"
                    :data-compare-exclusion-entity-section="section.entityKind"
                    class="grid min-w-0 gap-2"
                  >
                    <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
                      {{ section.title }}
                    </div>
                    <div class="flex min-w-0 flex-wrap gap-2">
                      <button
                        v-for="option in section.options"
                        :key="option.id"
                        type="button"
                        :data-compare-exclusion-option="option.id"
                        :class="getStudioToggleChipClass({
                          active: isCompareExclusionOptionSelected(option),
                          extraClass: compareExclusionChipExtraClass
                        })"
                        :aria-pressed="isCompareExclusionOptionSelected(option)"
                        @click="toggleCompareExclusionOption(option)"
                      >
                        {{ option.label }}
                      </button>
                    </div>
                  </section>
                </div>
                <div
                  v-else
                  :class="studioEmptyStateClass"
                >
                  No additional compare entities match the current filter.
                </div>
              </section>
            </div>
            <div
              v-else
              :class="studioEmptyStateClass"
            >
              No compare exclusions match the current filter.
            </div>
          </div>
        </div>

        <template #footer>
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            :class="secondaryModalButtonClass"
            @click="closeCompareExclusionsDialog"
          />
          <UButton
            label="Clear exclusions"
            color="neutral"
            variant="outline"
            :class="secondaryModalButtonClass"
            :disabled="!compareExclusionsDraft || compareExclusionsSelectionCount === 0"
            @click="clearCompareExclusionsDraft"
          />
          <UButton
            label="Save exclusions"
            data-compare-exclusions-save="true"
            color="neutral"
            variant="soft"
            :class="primaryModalButtonClass"
            :disabled="!compareExclusionsDraft"
            @click="saveCompareExclusionsDialog"
          />
        </template>
      </StudioModalFrame>

      <StudioModalFrame
        v-model:open="renameVersionDialogOpen"
        title="Rename version"
        :description="renameVersionDialogDescription"
        surface-id="rename-version"
        body-class="grid gap-4 px-4 py-3"
        @close="closeRenameVersionDialog"
      >
        <div class="grid gap-3">
          <div class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3">
            <div :class="studioFieldKickerClass">
              Selected version
            </div>
            <div class="mt-2 text-[0.85rem] font-semibold text-[color:var(--studio-shell-text)]">
              {{ renameVersionCandidate ? getVersionLabel(renameVersionCandidate) : 'Unknown version' }}
            </div>
            <p class="mt-2 text-[0.74rem] leading-6 text-[color:var(--studio-shell-muted)]">
              Rename the locked checkpoint without changing its position in the history tree.
            </p>
          </div>

          <label class="grid gap-1">
            <span :class="studioFieldKickerClass">
              Version name
            </span>
            <UInput
              v-model="renameVersionDraftName"
              data-rename-version-name-input="true"
              placeholder="Version name"
              color="neutral"
              variant="outline"
              size="sm"
              :ui="studioFieldUi"
            />
          </label>

          <div
            v-if="renameVersionNameError"
            data-rename-version-name-error="true"
            class="grid gap-1 border border-[color:var(--studio-shell-error)]/40 bg-[color:var(--studio-shell-error)]/8 px-3 py-3 text-[0.74rem] text-[color:var(--studio-shell-error)]"
          >
            <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em]">
              Version name
            </div>
            <div>
              {{ renameVersionNameError }}
            </div>
          </div>
        </div>

        <template #footer>
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            :class="secondaryModalButtonClass"
            @click="closeRenameVersionDialog"
          />
          <UButton
            label="Rename version"
            data-rename-version-save="true"
            color="neutral"
            variant="soft"
            :class="primaryModalButtonClass"
            :disabled="renameVersionNameError !== null || !renameVersionCandidate"
            @click="saveRenameVersionDialog"
          />
        </template>
      </StudioModalFrame>

      <AppDbmlImportModal
        :open="importDbmlDialogOpen"
        :title="importDbmlDialogCopy.title"
        :description="importDbmlDialogCopy.description"
        :confirm-label="importDbmlDialogCopy.confirmLabel"
        :input-description="importDbmlDialogCopy.inputDescription"
        :fold-identifiers-to-lowercase="importDbmlFoldIdentifiersToLowercase"
        :model-value="importDbmlText"
        :parse-executable-comments="importDbmlParseExecutableComments"
        :selected-file-name="importDbmlSelectedFileName"
        :error-message="importDbmlError"
        :is-submitting="isSubmittingImportDbml"
        @update:open="handleImportDbmlDialogOpenChange"
        @update:fold-identifiers-to-lowercase="importDbmlFoldIdentifiersToLowercase = $event"
        @update:model-value="setImportDbmlText"
        @update:parse-executable-comments="importDbmlParseExecutableComments = $event"
        @select-file="setImportDbmlFile"
        @clear-file="clearImportDbmlFile"
        @submit="submitImportDbml"
      >
        <template #before-inputs>
          <div class="grid gap-3">
            <label class="grid gap-1">
              <span :class="studioFieldKickerClass">
                Increment from version
              </span>
              <USelect
                :items="importDumpBaseVersionItems"
                :model-value="importDbmlBaseVersionId || undefined"
                value-key="value"
                label-key="label"
                color="neutral"
                variant="outline"
                size="sm"
                :ui="studioSelectUi"
                @update:model-value="importDbmlBaseVersionId = typeof $event === 'string' ? $event : null"
              />
            </label>

            <div
              v-if="selectedImportDbmlBaseVersion"
              class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3"
            >
              <div :class="studioFieldKickerClass">
                Selected base
              </div>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <span class="text-[0.82rem] font-semibold text-[color:var(--studio-shell-text)]">
                  {{ getVersionLabel(selectedImportDbmlBaseVersion) }}
                </span>
                <span class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
                  {{ selectedImportDbmlBaseVersion.role }}
                </span>
              </div>
            </div>
          </div>
        </template>
      </AppDbmlImportModal>

      <AppPgDumpImportModal
        :open="importDumpDialogOpen"
        :title="importDumpDialogCopy.title"
        :description="importDumpDialogCopy.description"
        :confirm-label="importDumpDialogCopy.confirmLabel"
        :input-description="importDumpDialogCopy.inputDescription"
        :fold-identifiers-to-lowercase="importDumpFoldIdentifiersToLowercase"
        :model-value="importDumpText"
        :selected-file-name="importDumpSelectedFileName"
        :error-message="importDumpError"
        :is-submitting="isSubmittingImportDump"
        @update:open="handleImportDumpDialogOpenChange"
        @update:fold-identifiers-to-lowercase="importDumpFoldIdentifiersToLowercase = $event"
        @update:model-value="setImportDumpText"
        @select-file="setImportDumpFile"
        @clear-file="clearImportDumpFile"
        @submit="submitImportDump"
      >
        <template #before-inputs>
          <div class="grid gap-3">
            <label class="grid gap-1">
              <span :class="studioFieldKickerClass">
                Increment from version
              </span>
              <USelect
                :items="importDumpBaseVersionItems"
                :model-value="importDumpBaseVersionId || undefined"
                value-key="value"
                label-key="label"
                color="neutral"
                variant="outline"
                size="sm"
                :ui="studioSelectUi"
                @update:model-value="importDumpBaseVersionId = typeof $event === 'string' ? $event : null"
              />
            </label>

            <div
              v-if="selectedImportDumpBaseVersion"
              class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3"
            >
              <div :class="studioFieldKickerClass">
                Selected base
              </div>
              <div class="mt-2 flex flex-wrap items-center gap-2">
                <span class="text-[0.82rem] font-semibold text-[color:var(--studio-shell-text)]">
                  {{ getVersionLabel(selectedImportDumpBaseVersion) }}
                </span>
                <span class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
                  {{ selectedImportDumpBaseVersion.role }}
                </span>
              </div>
              <p class="mt-2 text-[0.72rem] leading-6 text-[color:var(--studio-shell-muted)]">
                {{
                  activeHasPendingChanges
                    ? 'Importing now will replace the current workspace draft before you checkpoint the new state.'
                    : 'The imported dump will replace the current workspace and continue forward from this base version.'
                }}
              </p>
            </div>

            <label class="grid gap-2 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3">
              <div class="flex items-start justify-between gap-3">
                <div class="grid gap-1">
                  <span :class="studioFieldKickerClass">
                    Retain matching table groups from base version
                  </span>
                  <p class="text-[0.72rem] leading-6 text-[color:var(--studio-shell-muted)]">
                    Keep TableGroup assignments from the selected base when the imported dump contains the same tables.
                  </p>
                </div>

                <USwitch
                  :model-value="importDumpRetainMatchingTableGroups"
                  color="neutral"
                  :ui="studioSwitchUi"
                  @update:model-value="importDumpRetainMatchingTableGroups = $event === true"
                />
              </div>
            </label>
          </div>
        </template>
      </AppPgDumpImportModal>

      <StudioModalFrame
        :open="importExecutableAttachmentResolution !== null"
        :title="importExecutableAttachmentResolutionTitle"
        :description="importExecutableAttachmentResolutionDescription"
        surface-id="import-executable-attachments"
        body-class="grid min-h-0 gap-4 px-4 py-3"
        width-class="max-w-4xl"
        @update:open="handleImportExecutableAttachmentResolutionOpenChange"
      >
        <div
          v-if="importExecutableAttachmentResolution"
          data-import-executable-attachment-dialog="true"
          class="grid gap-4"
        >
          <div class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3">
            <div :class="studioFieldKickerClass">
              Attachment review
            </div>
            <p :class="joinStudioClasses(studioCompactBodyCopyClass, 'mt-2')">
              {{ importExecutableAttachmentResolution.candidates.length }} executable object{{ importExecutableAttachmentResolution.candidates.length === 1 ? '' : 's' }} need table placement before import continues.
            </p>
          </div>

          <div
            v-if="importExecutableAttachmentResolution.candidates.length > 0"
            class="grid max-h-[60vh] gap-3 overflow-y-auto pr-1"
          >
            <section
              v-for="candidate in importExecutableAttachmentResolution.candidates"
              :key="candidate.id"
              :data-import-executable-candidate="candidate.id"
              class="grid gap-3 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <span class="inline-flex items-center border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
                    {{ candidate.kind }}
                  </span>
                  <div class="mt-2 break-words text-[0.84rem] font-semibold text-[color:var(--studio-shell-text)]">
                    {{ candidate.name }}
                  </div>
                  <p class="mt-1 break-words text-[0.72rem] leading-6 text-[color:var(--studio-shell-muted)]">
                    {{ candidate.subtitle }}
                  </p>
                </div>

                <button
                  type="button"
                  :class="getStudioToggleChipClass({
                    active: candidate.selectedTableIds.length === 0,
                    extraClass: 'px-2 py-1 font-mono text-[0.58rem] uppercase tracking-[0.08em]'
                  })"
                  :disabled="candidate.selectedTableIds.length === 0 || isSubmittingImportExecutableAttachmentResolution"
                  @click="clearImportExecutableAttachmentCandidateTables(candidate.id)"
                >
                  Keep standalone
                </button>
              </div>

              <div class="grid gap-2">
                <div :class="studioFieldKickerClass">
                  Nest under tables
                </div>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="tableOption in importExecutableAttachmentResolution.tableOptions"
                    :key="`${candidate.id}:${tableOption.value}`"
                    type="button"
                    :data-import-executable-table-toggle="`${candidate.id}:${tableOption.value}`"
                    :class="getStudioToggleChipClass({
                      active: candidate.selectedTableIds.includes(tableOption.value),
                      extraClass: 'px-2 py-1 font-mono text-[0.58rem] uppercase tracking-[0.08em]'
                    })"
                    :disabled="isSubmittingImportExecutableAttachmentResolution"
                    @click="toggleImportExecutableAttachmentCandidateTable(candidate.id, tableOption.value)"
                  >
                    {{ tableOption.label }}
                  </button>
                </div>
              </div>
            </section>
          </div>

          <div
            v-else
            :class="studioEmptyStateClass"
          >
            No unresolved executable attachments remain.
          </div>

          <div
            v-if="importExecutableAttachmentError"
            class="grid gap-1 border border-[color:var(--studio-shell-error)]/40 bg-[color:var(--studio-shell-error)]/8 px-3 py-3 text-[0.74rem] text-[color:var(--studio-shell-error)]"
          >
            <div class="flex items-start gap-2">
              <UIcon
                name="i-lucide-circle-alert"
                class="mt-0.5 h-4 w-4 shrink-0"
              />
              <p>{{ importExecutableAttachmentError }}</p>
            </div>
          </div>
        </div>

        <template #footer>
          <UButton
            label="Back"
            color="neutral"
            variant="outline"
            :class="secondaryModalButtonClass"
            :disabled="isSubmittingImportExecutableAttachmentResolution"
            @click="closeImportExecutableAttachmentResolution"
          />
          <UButton
            label="Continue import"
            color="neutral"
            variant="soft"
            :class="primaryModalButtonClass"
            :loading="isSubmittingImportExecutableAttachmentResolution"
            @click="confirmImportExecutableAttachmentResolution"
          />
        </template>
      </StudioModalFrame>

      <StudioModalFrame
        v-model:open="schemaDialogOpen"
        :title="schemaActionTitle"
        :description="schemaActionDescriptionText"
        surface-id="schema"
        body-class="grid gap-4 px-4 py-3"
      >
        <div class="grid gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div class="grid gap-3">
            <label
              v-if="currentPersistenceSource === 'browser'"
              class="grid gap-1"
            >
              <span :class="studioFieldKickerClass">
                Schema Name
              </span>
              <UInput
                v-model="currentSchemaName"
                placeholder="Schema name"
                color="neutral"
                variant="outline"
                size="sm"
                :ui="studioFieldUi"
              />
            </label>

            <label
              v-else-if="currentPersistenceSource === 'file'"
              class="grid gap-1"
            >
              <span :class="studioFieldKickerClass">
                File Name
              </span>
              <UInput
                :model-value="currentComputerFileName"
                placeholder="No file selected"
                color="neutral"
                variant="outline"
                size="sm"
                readonly
                :ui="studioFieldUi"
              />
            </label>

            <label
              v-else
              class="grid gap-1"
            >
              <span :class="studioFieldKickerClass">
                Gist File
              </span>
              <UInput
                :model-value="currentGistFileName"
                placeholder="No Gist file selected"
                color="neutral"
                variant="outline"
                size="sm"
                readonly
                :ui="studioFieldUi"
              />
            </label>

            <USwitch
              v-if="schemaDialogMode === 'download'"
              v-model="includeLayoutInSchema"
              color="neutral"
              size="sm"
              :disabled="!canEmbedLayout"
              label="Include current layout"
              description="Embed node positions, colors, grouped table columns, and masonry settings into the PGML text."
              :ui="studioSwitchUi"
            />
          </div>

          <div
            v-if="currentPersistenceSource === 'browser'"
            class="grid gap-2 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3"
          >
            <div class="flex items-center justify-between gap-3">
              <div>
                <div :class="studioFieldKickerClass">
                  Overwrite Existing
                </div>
                <p class="mt-1 text-[0.7rem] leading-5 text-[color:var(--studio-shell-muted)]">
                  Pick an existing local schema when you want this save to replace it instead of creating a new entry.
                </p>
              </div>

              <UButton
                v-if="saveSchemaTarget"
                label="Save as new"
                color="neutral"
                variant="soft"
                size="xs"
                :class="primaryModalButtonClass"
                @click="clearSaveSchemaTarget"
              />
            </div>

            <div
              v-if="orderedSavedSchemas.length"
              class="grid max-h-56 gap-2 overflow-y-auto pr-1"
            >
              <button
                v-for="schema in orderedSavedSchemas"
                :key="schema.id"
                type="button"
                :class="getStudioChoiceButtonClass({
                  active: saveSchemaTarget?.id === schema.id,
                  extraClass: 'grid gap-1 px-3 py-2 text-left'
                })"
                @click="selectSaveSchemaTarget(schema)"
              >
                <span class="truncate text-[0.78rem] font-semibold text-[color:var(--studio-shell-text)]">
                  {{ schema.name }}
                </span>
                <span class="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
                  {{ formatSavedAt(schema.updatedAt) }}
                </span>
              </button>
            </div>

            <div
              v-else
              :class="studioEmptyStateClass"
            >
              No saved schemas in this browser yet.
            </div>
          </div>

          <div
            v-else-if="currentPersistenceSource === 'file'"
            class="grid gap-3 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3"
          >
            <div>
              <div :class="studioFieldKickerClass">
                Target File
              </div>
              <p class="mt-1 text-[0.7rem] leading-5 text-[color:var(--studio-shell-muted)]">
                This schema writes back to the selected `.pgml` file on your computer and keeps autosave pointed at that file.
              </p>
            </div>

            <div
              v-if="hasSelectedComputerFile"
              class="grid gap-1 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] px-3 py-3"
            >
              <div class="truncate text-[0.78rem] font-semibold text-[color:var(--studio-shell-text)]">
                {{ currentComputerFileName }}
              </div>
              <div class="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
                {{ currentComputerFileUpdatedAt ? formatComputerFileSavedAt(currentComputerFileUpdatedAt) : 'Ready to save' }}
              </div>
            </div>

            <div
              v-else
              :class="studioEmptyStateClass"
            >
              Choose or create a computer file before saving from this mode.
            </div>
          </div>

          <div
            v-else
            class="grid gap-3 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3"
          >
            <div>
              <div :class="studioFieldKickerClass">
                Target Gist
              </div>
              <p class="mt-1 text-[0.7rem] leading-5 text-[color:var(--studio-shell-muted)]">
                This schema writes back to the selected `.pgml` file in the connected GitHub Gist only when you save.
              </p>
            </div>

            <div
              v-if="hasSelectedGistFile"
              class="grid gap-1 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] px-3 py-3"
            >
              <div class="truncate text-[0.78rem] font-semibold text-[color:var(--studio-shell-text)]">
                {{ currentGistFileName }}
              </div>
              <div class="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
                {{ currentGistFileUpdatedAt ? formatGistFileSavedAt(currentGistFileUpdatedAt) : 'Ready to save' }}
              </div>
            </div>

            <div
              v-else
              :class="studioEmptyStateClass"
            >
              Open a Gist file before saving from this mode.
            </div>
          </div>
        </div>

        <template #footer>
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            :class="secondaryModalButtonClass"
            @click="schemaDialogOpen = false"
          />
          <UButton
            v-if="schemaDialogMode === 'save'"
            :label="saveDialogActionLabel"
            color="neutral"
            variant="soft"
            :class="primaryModalButtonClass"
            :disabled="(currentPersistenceSource === 'file' && !hasSelectedComputerFile) || (currentPersistenceSource === 'gist' && !hasSelectedGistFile)"
            @click="saveCurrentSchema"
          />
          <UButton
            v-else
            label="Download .pgml"
            color="neutral"
            variant="soft"
            :class="primaryModalButtonClass"
            @click="downloadCurrentSchema"
          />
        </template>
      </StudioModalFrame>

      <StudioModalFrame
        v-model:open="loadDialogOpen"
        :title="loadDialogTitle"
        :description="loadDialogDescription"
        surface-id="load"
        body-class="max-h-[min(60vh,36rem)] overflow-y-auto px-4 py-3"
      >
        <div
          v-if="currentPersistenceSource === 'browser'"
          class="contents"
        >
          <div
            v-if="orderedSavedSchemas.length"
            class="grid gap-2"
          >
            <div
              v-for="schema in orderedSavedSchemas"
              :key="schema.id"
              class="grid gap-2 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="truncate text-[0.82rem] font-semibold text-[color:var(--studio-shell-text)]">
                    {{ schema.name }}
                  </div>
                  <div class="font-mono text-[0.64rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
                    {{ formatSavedAt(schema.updatedAt) }}
                  </div>
                </div>

                <div class="flex items-center gap-1">
                  <UButton
                    label="Load"
                    color="neutral"
                    variant="outline"
                    size="xs"
                    :class="secondaryModalButtonClass"
                    @click="loadSavedSchema(schema)"
                  />
                  <UButton
                    icon="i-lucide-trash-2"
                    color="neutral"
                    variant="outline"
                    size="xs"
                    :class="secondaryModalButtonClass"
                    aria-label="Delete saved schema"
                    @click="deleteSavedSchema(schema.id)"
                  />
                </div>
              </div>
            </div>
          </div>

          <div
            v-else
            :class="studioEmptyStateClass"
          >
            No saved schemas in this browser yet.
          </div>
        </div>

        <div
          v-else-if="currentPersistenceSource === 'file'"
          class="grid gap-3"
        >
          <UButton
            label="Choose .pgml file from computer"
            color="neutral"
            variant="soft"
            :class="primaryModalButtonClass"
            @click="chooseComputerFileFromLoadDialog"
          />

          <div
            v-if="recentComputerFiles.length"
            class="grid gap-2"
          >
            <div
              v-for="recentFile in recentComputerFiles"
              :key="recentFile.id"
              class="grid gap-2 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="truncate text-[0.82rem] font-semibold text-[color:var(--studio-shell-text)]">
                    {{ recentFile.name }}
                  </div>
                  <div class="font-mono text-[0.64rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
                    {{ formatComputerFileSavedAt(recentFile.updatedAt) }}
                  </div>
                </div>

                <div class="flex items-center gap-1">
                  <UButton
                    label="Open"
                    color="neutral"
                    variant="outline"
                    size="xs"
                    :class="secondaryModalButtonClass"
                    @click="loadRecentComputerFile(recentFile.id)"
                  />
                  <UButton
                    icon="i-lucide-trash-2"
                    color="neutral"
                    variant="outline"
                    size="xs"
                    :class="secondaryModalButtonClass"
                    :aria-label="`Remove ${recentFile.name} from recent files`"
                    @click="removeRecentComputerFile(recentFile.id)"
                  />
                </div>
              </div>
            </div>
          </div>

          <div
            v-else
            :class="studioEmptyStateClass"
          >
            No recent computer files yet.
          </div>
        </div>

        <div
          v-else
          class="grid gap-3"
        >
          <div
            v-if="githubGistFiles.length"
            class="grid gap-2"
          >
            <div
              v-for="gistFile in githubGistFiles"
              :key="gistFile.filename"
              class="grid gap-2 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="truncate text-[0.82rem] font-semibold text-[color:var(--studio-shell-text)]">
                    {{ gistFile.filename }}
                  </div>
                  <div class="font-mono text-[0.64rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
                    {{ formatGistFileSavedAt(gistFile.updatedAt) }}
                  </div>
                </div>

                <UButton
                  label="Open"
                  color="neutral"
                  variant="outline"
                  size="xs"
                  :class="secondaryModalButtonClass"
                  @click="loadGistFile(gistFile.filename)"
                />
              </div>
            </div>
          </div>

          <div
            v-else
            :class="studioEmptyStateClass"
          >
            No PGML files are loaded from the connected Gist.
          </div>
        </div>

        <template #footer>
          <UButton
            label="Close"
            color="neutral"
            variant="outline"
            :class="secondaryModalButtonClass"
            @click="loadDialogOpen = false"
          />
        </template>
      </StudioModalFrame>

      <StudioModalFrame
        v-model:open="tableEditorOpen"
        :title="tableEditorTitle"
        :description="tableEditorDescription"
        surface-id="table-editor"
        width-class="max-w-5xl"
        body-class="grid max-h-[min(74vh,52rem)] gap-5 overflow-y-auto px-4 py-4"
        @after-leave="handleTableEditorAfterLeave"
      >
        <div
          v-if="tableEditorDraft"
          class="contents"
        >
          <div
            v-if="tableEditorErrors.length"
            class="grid gap-1 border border-[color:var(--studio-shell-error)]/40 bg-[color:var(--studio-shell-error)]/8 px-3 py-3 text-[0.74rem] text-[color:var(--studio-shell-error)]"
          >
            <p
              v-for="error in tableEditorErrors"
              :key="error"
            >
              {{ error }}
            </p>
          </div>

          <div class="grid gap-3 lg:grid-cols-3">
            <label class="grid gap-1">
              <span :class="studioFieldKickerClass">Table name</span>
              <UInput
                v-model="tableEditorDraft.name"
                aria-label="Table name"
                data-table-editor-name="true"
                color="neutral"
                variant="outline"
                size="sm"
                :ui="studioFieldUi"
              />
            </label>

            <label class="grid gap-1">
              <span :class="studioFieldKickerClass">Schema</span>
              <USelect
                v-model="tableEditorDraft.schema"
                aria-label="Table schema"
                :items="schemaSelectItems"
                color="neutral"
                variant="outline"
                size="sm"
                :ui="studioSelectUi"
              />
            </label>

            <label class="grid gap-1">
              <span :class="studioFieldKickerClass">Table group</span>
              <USelectMenu
                aria-label="Table group"
                :model-value="tableEditorDraft.groupName || 'Ungrouped'"
                :items="groupSelectItems"
                v-bind="studioPersistentSelectMenuProps"
                :search-input="getStudioSelectMenuSearchInputProps('Search groups')"
                :filter-fields="['label', 'description', 'value']"
                value-key="value"
                label-key="label"
                description-key="description"
                placeholder="Choose a group"
                color="neutral"
                variant="outline"
                size="sm"
                :ui="studioInputMenuUi"
                @update:model-value="updateTableDraftGroup(String($event || 'Ungrouped'))"
              />
            </label>
          </div>

          <label class="grid gap-1">
            <span :class="studioFieldKickerClass">Table note</span>
            <textarea
              v-model="tableEditorDraft.note"
              rows="3"
              :class="[textareaClass, 'min-h-[5rem]']"
            />
          </label>

          <div
            class="grid gap-3 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3"
            data-table-editor-metadata="true"
          >
            <div class="flex items-center justify-between gap-3">
              <div>
                <div :class="studioFieldKickerClass">
                  Table metadata
                </div>
                <p :class="joinStudioClasses(studioCompactBodyCopyClass, 'mt-1')">
                  Store custom schema fields on this table outside version snapshots so they persist across versions.
                </p>
              </div>

              <UButton
                label="Add field"
                icon="i-lucide-plus"
                color="neutral"
                variant="soft"
                size="sm"
                :class="tableEditorAddButtonClass"
                @click="addTableDraftMetadataEntry"
              />
            </div>

            <div
              v-if="tableEditorDraft.customMetadata.length === 0"
              :class="studioEmptyStateClass"
            >
              No table metadata fields yet.
            </div>

            <div
              v-else
              class="grid gap-2"
            >
              <div
                v-for="metadataEntry in tableEditorDraft.customMetadata"
                :key="metadataEntry.id"
                class="grid gap-2 md:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)_auto]"
                data-table-editor-metadata-row="true"
              >
                <UInput
                  v-model="metadataEntry.key"
                  aria-label="Table metadata field name"
                  placeholder="Field name"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :ui="studioFieldUi"
                />
                <UInput
                  v-model="metadataEntry.value"
                  aria-label="Table metadata field value"
                  placeholder="Field value"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :ui="studioFieldUi"
                />
                <UButton
                  icon="i-lucide-trash-2"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :class="tableEditorRemoveButtonClass"
                  aria-label="Remove table metadata field"
                  @click="removeTableDraftMetadataEntry(metadataEntry.id)"
                />
              </div>
            </div>
          </div>

          <div class="grid gap-3">
            <div class="flex items-center justify-between gap-3">
              <div>
                <div :class="studioFieldKickerClass">
                  Columns
                </div>
                <p :class="joinStudioClasses(studioCompactBodyCopyClass, 'mt-1')">
                  Choose types and references from structured inputs where available, then refine the exact values if needed.
                </p>
              </div>

              <UButton
                label="Add column"
                icon="i-lucide-plus"
                color="neutral"
                variant="soft"
                size="sm"
                :class="tableEditorAddButtonClass"
                @click="addTableDraftColumn"
              />
            </div>

            <div class="grid gap-3">
              <article
                v-for="column in tableEditorDraft.columns"
                :key="column.id"
                :data-table-editor-column="column.id"
                class="grid gap-3 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3"
              >
                <div class="flex items-center justify-between gap-3">
                  <div :class="studioFieldKickerClass">
                    {{ column.name || 'New column' }}
                  </div>

                  <UButton
                    icon="i-lucide-trash-2"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :class="tableEditorRemoveButtonClass"
                    aria-label="Remove column"
                    :disabled="tableEditorDraft.columns.length <= 1"
                    @click="removeTableDraftColumn(column.id)"
                  />
                </div>

                <div class="grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                  <label class="grid gap-1">
                    <span :class="studioCompactFieldKickerClass">Column name</span>
                    <UInput
                      v-model="column.name"
                      aria-label="Column name"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      :ui="studioFieldUi"
                    />
                  </label>

                  <div class="grid gap-2">
                    <span :class="studioCompactFieldKickerClass">Column type</span>
                    <div class="grid gap-2 lg:grid-cols-[minmax(0,0.56fr)_minmax(0,0.44fr)]">
                      <USelectMenu
                        aria-label="Column type preset"
                        :model-value="column.type"
                        :items="tableTypeItems"
                        v-bind="studioPersistentSelectMenuProps"
                        :search-input="getStudioSelectMenuSearchInputProps('Search column types')"
                        :filter-fields="['label', 'description', 'value']"
                        value-key="value"
                        label-key="label"
                        description-key="description"
                        placeholder="Choose a type"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        :ui="studioInputMenuUi"
                        @update:model-value="column.type = String($event || '')"
                      />
                      <UInput
                        v-model="column.type"
                        aria-label="Column type"
                        placeholder="Exact type"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        :ui="studioFieldUi"
                      />
                    </div>
                  </div>
                </div>

                <div class="grid gap-3 lg:grid-cols-3">
                  <label class="grid gap-1">
                    <span :class="studioCompactFieldKickerClass">Default</span>
                    <UInputMenu
                      v-model="column.defaultValue"
                      v-bind="studioDefaultInputMenuProps"
                      aria-label="Column default"
                      :items="getColumnDefaultItems(column.type)"
                      :filter-fields="['label', 'value', 'description']"
                      value-key="value"
                      label-key="label"
                      description-key="description"
                      :placeholder="getColumnDefaultPlaceholder(column.type)"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      :ui="studioInputMenuUi"
                    />
                  </label>

                  <label class="grid gap-1 lg:col-span-2">
                    <span :class="studioCompactFieldKickerClass">Column note</span>
                    <UInput
                      v-model="column.note"
                      aria-label="Column note"
                      placeholder="Optional column note"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      :ui="studioFieldUi"
                    />
                  </label>
                </div>

                <div
                  class="grid gap-2 border border-[color:var(--studio-shell-border)]/70 bg-[color:var(--studio-shell-bg)]/55 px-3 py-3"
                  :data-table-editor-column-metadata="column.id"
                >
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <div :class="studioCompactFieldKickerClass">
                        Column metadata
                      </div>
                      <p :class="joinStudioClasses(studioCompactBodyCopyClass, 'mt-1')">
                        Attach custom key/value fields to this column without changing version history snapshots.
                      </p>
                    </div>

                    <UButton
                      label="Add field"
                      icon="i-lucide-plus"
                      color="neutral"
                      variant="soft"
                      size="xs"
                      :class="tableEditorAddButtonClass"
                      @click="addTableDraftColumnMetadataEntry(column.id)"
                    />
                  </div>

                  <div
                    v-if="column.customMetadata.length === 0"
                    :class="studioEmptyStateClass"
                  >
                    No column metadata fields yet.
                  </div>

                  <div
                    v-else
                    class="grid gap-2"
                  >
                    <div
                      v-for="metadataEntry in column.customMetadata"
                      :key="metadataEntry.id"
                      class="grid gap-2 md:grid-cols-[minmax(0,0.42fr)_minmax(0,0.58fr)_auto]"
                    >
                      <UInput
                        v-model="metadataEntry.key"
                        aria-label="Column metadata field name"
                        placeholder="Field name"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        :ui="studioFieldUi"
                      />
                      <UInput
                        v-model="metadataEntry.value"
                        aria-label="Column metadata field value"
                        placeholder="Field value"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        :ui="studioFieldUi"
                      />
                      <UButton
                        icon="i-lucide-trash-2"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        :class="tableEditorRemoveButtonClass"
                        aria-label="Remove column metadata field"
                        @click="removeTableDraftColumnMetadataEntry(column.id, metadataEntry.id)"
                      />
                    </div>
                  </div>
                </div>

                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    :class="getStudioToggleChipClass({
                      active: column.primaryKey,
                      extraClass: 'px-2 py-1 font-mono text-[0.58rem] uppercase tracking-[0.08em]'
                    })"
                    @click="column.primaryKey = !column.primaryKey"
                  >
                    Primary key
                  </button>
                  <button
                    type="button"
                    :class="getStudioToggleChipClass({
                      active: column.notNull,
                      extraClass: 'px-2 py-1 font-mono text-[0.58rem] uppercase tracking-[0.08em]'
                    })"
                    @click="column.notNull = !column.notNull"
                  >
                    Not null
                  </button>
                  <button
                    type="button"
                    :class="getStudioToggleChipClass({
                      active: column.unique,
                      extraClass: 'px-2 py-1 font-mono text-[0.58rem] uppercase tracking-[0.08em]'
                    })"
                    @click="column.unique = !column.unique"
                  >
                    Unique
                  </button>
                </div>

                <USwitch
                  v-model="column.referenceEnabled"
                  color="neutral"
                  size="sm"
                  label="Reference"
                  description="Choose the referenced table and column instead of typing a raw ref modifier."
                  :ui="studioSwitchUi"
                />

                <div
                  v-if="column.referenceEnabled"
                  class="grid gap-3 lg:grid-cols-2"
                >
                  <label class="grid gap-1">
                    <span :class="studioCompactFieldKickerClass">Relationship direction</span>
                    <div class="grid gap-2 lg:grid-cols-[minmax(0,1fr)_4.5rem]">
                      <USelect
                        v-model="column.referenceRelation"
                        aria-label="Relationship direction"
                        :items="referenceRelationItems"
                        value-key="value"
                        label-key="label"
                        description-key="description"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        :ui="studioSelectUi"
                      />
                      <USelect
                        v-model="column.referenceRelation"
                        aria-label="Relationship direction symbol"
                        :items="referenceRelationSymbolItems"
                        value-key="value"
                        label-key="label"
                        description-key="description"
                        color="neutral"
                        variant="outline"
                        size="sm"
                        :ui="studioSelectUi"
                      />
                    </div>
                  </label>

                  <label class="grid gap-1">
                    <span :class="studioCompactFieldKickerClass">Target table</span>
                    <USelectMenu
                      aria-label="Reference target table"
                      :model-value="`${column.referenceSchema}.${column.referenceTable}`"
                      :items="tableTargetItems"
                      v-bind="studioPersistentSelectMenuProps"
                      :search-input="getStudioSelectMenuSearchInputProps('Search tables')"
                      :filter-fields="['label', 'description', 'value']"
                      value-key="value"
                      label-key="label"
                      description-key="description"
                      placeholder="Select a table"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      :ui="studioInputMenuUi"
                      @update:model-value="updateTableDraftReferenceTarget(column.id, String($event))"
                    />
                  </label>

                  <label class="grid gap-1">
                    <span :class="studioCompactFieldKickerClass">Target column</span>
                    <USelectMenu
                      aria-label="Reference target column"
                      :items="getReferenceColumnItems(`${column.referenceSchema}.${column.referenceTable}`)"
                      :model-value="column.referenceColumn"
                      v-bind="studioPersistentSelectMenuProps"
                      :search-input="getStudioSelectMenuSearchInputProps('Search columns')"
                      :filter-fields="['label', 'description', 'value']"
                      value-key="value"
                      label-key="label"
                      description-key="description"
                      placeholder="Select a column"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      :ui="studioInputMenuUi"
                      @update:model-value="updateTableDraftReferenceColumn(column.id, String($event || ''))"
                    />
                  </label>

                  <label class="grid gap-1">
                    <span :class="studioCompactFieldKickerClass">On delete</span>
                    <USelect
                      :model-value="getReferenceActionSelectValue(column.referenceDeleteAction)"
                      aria-label="Reference on delete action"
                      :items="referenceActionItems"
                      value-key="value"
                      label-key="label"
                      description-key="description"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      :ui="studioSelectUi"
                      @update:model-value="updateTableDraftReferenceAction(column.id, 'referenceDeleteAction', $event)"
                    />
                  </label>

                  <label class="grid gap-1">
                    <span :class="studioCompactFieldKickerClass">On update</span>
                    <USelect
                      :model-value="getReferenceActionSelectValue(column.referenceUpdateAction)"
                      aria-label="Reference on update action"
                      :items="referenceActionItems"
                      value-key="value"
                      label-key="label"
                      description-key="description"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      :ui="studioSelectUi"
                      @update:model-value="updateTableDraftReferenceAction(column.id, 'referenceUpdateAction', $event)"
                    />
                  </label>
                </div>
              </article>
            </div>
          </div>
        </div>

        <template #footer>
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            :class="secondaryModalButtonClass"
            @click="closeTableEditor"
          />
          <UButton
            :label="tableEditorActionLabel"
            data-table-editor-save="true"
            color="neutral"
            variant="soft"
            :class="primaryModalButtonClass"
            :disabled="tableEditorErrors.length > 0"
            @click="saveTableEditor"
          />
        </template>
      </StudioModalFrame>

      <StudioModalFrame
        v-model:open="groupEditorOpen"
        :title="groupEditorTitle"
        :description="groupEditorDescription"
        surface-id="group-editor"
        body-class="grid max-h-[min(60vh,32rem)] gap-5 overflow-y-auto px-4 py-4"
        @after-leave="handleGroupEditorAfterLeave"
      >
        <div
          v-if="groupEditorDraft"
          class="contents"
        >
          <div
            v-if="groupEditorErrors.length"
            class="grid gap-1 border border-[color:var(--studio-shell-error)]/40 bg-[color:var(--studio-shell-error)]/8 px-3 py-3 text-[0.74rem] text-[color:var(--studio-shell-error)]"
          >
            <p
              v-for="error in groupEditorErrors"
              :key="error"
            >
              {{ error }}
            </p>
          </div>

          <div class="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div class="grid gap-3">
              <label class="grid gap-1">
                <span :class="studioFieldKickerClass">Group name</span>
                <UInput
                  v-model="groupEditorDraft.name"
                  aria-label="Group name"
                  data-group-editor-name="true"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  :ui="studioFieldUi"
                />
              </label>

              <label class="grid gap-1">
                <span :class="studioFieldKickerClass">Group color</span>
                <input
                  :value="getGroupEditorColorPickerValue(groupEditorDraft.color)"
                  aria-label="Group color"
                  data-group-editor-color="true"
                  type="color"
                  :class="studioColorInputClass"
                  @input="updateGroupDraftColor(($event.target as HTMLInputElement).value)"
                >
                <p :class="studioCompactBodyCopyClass">
                  Choose the same persisted accent used by the diagram inspector.
                </p>
              </label>
            </div>

            <div class="grid content-start gap-1 self-start">
              <span :class="studioFieldKickerClass">Tables in this group</span>
              <USelectMenu
                aria-label="Group tables"
                :items="groupTableItems"
                :model-value="groupEditorDraft.tableNames"
                :multiple="true"
                v-bind="studioPersistentSelectMenuProps"
                :search-input="getStudioSelectMenuSearchInputProps('Search tables')"
                :filter-fields="['label', 'description', 'value']"
                value-key="value"
                label-key="label"
                description-key="description"
                placeholder="Choose tables"
                color="neutral"
                variant="outline"
                size="sm"
                :ui="studioInputMenuUi"
                @update:model-value="updateGroupDraftTableNames($event)"
              />
            </div>
          </div>

          <label class="grid gap-1">
            <span :class="studioFieldKickerClass">Group note</span>
            <textarea
              v-model="groupEditorDraft.note"
              data-group-editor-note="true"
              rows="4"
              :class="[textareaClass, 'min-h-[6rem]']"
            />
          </label>
        </div>

        <template #footer>
          <UButton
            label="Cancel"
            color="neutral"
            variant="outline"
            :class="secondaryModalButtonClass"
            @click="closeGroupEditor"
          />
          <UButton
            :label="groupEditorActionLabel"
            data-group-editor-save="true"
            color="neutral"
            variant="soft"
            :class="primaryModalButtonClass"
            :disabled="groupEditorErrors.length > 0"
            @click="saveGroupEditor"
          />
        </template>
      </StudioModalFrame>

      <div
        v-if="isImportBusy"
        data-import-loading="true"
        class="fixed inset-0 z-[70] grid place-items-center bg-black/45 px-4 backdrop-blur-sm"
      >
        <div class="grid max-w-sm gap-2 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-4 py-4 text-left shadow-2xl">
          <div class="flex items-center gap-2">
            <UIcon
              name="i-lucide-loader-circle"
              class="h-5 w-5 animate-spin text-[color:var(--studio-shell-text)]"
            />
            <div class="text-[0.84rem] font-semibold text-[color:var(--studio-shell-text)]">
              {{ importBusyTitle }}
            </div>
          </div>
          <p class="text-[0.72rem] leading-6 text-[color:var(--studio-shell-muted)]">
            {{ importBusyDescription }}
          </p>
        </div>
      </div>
    </ClientOnly>
  </div>
</template>
