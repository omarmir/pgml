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
import { useDialogDraft } from '~/composables/useDialogDraft'
import { usePgmlWorkspaceAnalysis } from '~/composables/usePgmlWorkspaceAnalysis'
import { usePgmlDocumentLoader } from '~/composables/usePgmlDocumentLoader'
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
import { useStudioShellStore } from '~/stores/studio-shell'
import { useStudioSessionStore } from '~/stores/studio-session'
import type { StudioLoadIntent } from '~/stores/studio-session'
import { useStudioSourcesStore } from '~/stores/studio-sources'
import {
  downloadSchemaText,
  formatSavedPgmlSchemaTime,
  slugifySchemaName,
  type SavedPgmlSchema
} from '~/utils/studio-browser-schemas'
import {
  buildBrowserStudioSavedQuery,
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
  buildPgmlDocumentEditorModeDescription,
  buildPgmlEditorReadOnlyLabel,
  buildPgmlVersionPreviewDescription,
  buildPgmlWorkspaceBaseLabel,
  buildPgmlWorkspaceEditorDescription,
  buildPgmlWorkspaceStatus
} from '~/utils/pgml-version-summary'
import {
  appendPgmlDocumentImport,
  buildPgmlCheckpointName,
  getPgmlVersionDisplayLabel,
  getLatestPgmlVersion,
  parsePgmlDocument,
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
import {
  clonePgmlCompareExclusions,
  createEmptyPgmlCompareExclusions,
  filterPgmlSchemaModelForCompareExclusions,
  getOrderedGroupTables,
  getPgmlSourceSelectionRange,
  parsePgml,
  pgmlExample,
  pgmlVersionedExample,
  replacePgmlSourceRange,
  type PgmlCompareEntityFilters,
  type PgmlCompareNote,
  type PgmlCompareNoteFlag,
  type PgmlCompareNoteFilters,
  type PgmlCompareExclusions,
  type PgmlCompareExclusionsInput,
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
  type DiagramExportRequest,
  type DiagramPanelTab,
  type DiagramToolPanelTab,
  type StudioMobileCanvasView,
  type StudioMobileWorkspaceView
} from '~/utils/studio-workspace'

const PgmlDiagramCanvas = defineAsyncComponent(() => import('~/components/pgml/PgmlDiagramCanvas.vue'))

type PgmlDiagramCanvasExposed = {
  exportDiagram: (format: 'svg' | 'png', scaleFactor?: number) => Promise<void>
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
const studioSessionStore = useStudioSessionStore()
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
type DiagramExportState = { kind: 'idle' } | { kind: 'disposed' } | {
  kind: 'exporting'
  format: 'svg' | 'png'
  scaleFactor: number | undefined
  canvas: PgmlDiagramCanvasExposed
  documentRevision: number
}
const diagramExport: Ref<DiagramExportState> = shallowRef({ kind: 'idle' })
const isExporting = computed(() => diagramExport.value.kind === 'exporting')
type WorkspaceNavigationRequest = {
  destination: StudioWorkspacePage
  documentRevision: number
  loadRevision: number
  source: StudioLoadIntent['source']
  query: ReturnType<typeof useRoute>['query'] | undefined
}
type WorkspaceNavigationState = { kind: 'idle' } | { kind: 'disposed' }
  | { kind: 'persisting' | 'navigating', request: WorkspaceNavigationRequest }
const workspaceNavigation: Ref<WorkspaceNavigationState> = shallowRef({ kind: 'idle' })
const isNavigatingWorkspace = computed(() => workspaceNavigation.value.kind === 'persisting' || workspaceNavigation.value.kind === 'navigating')
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
type CheckpointDraft = {
  name: string
  role: 'design' | 'implementation'
  nameOrigin: { kind: 'suggested', createdAt: string } | { kind: 'custom' }
}
const checkpointDialog = useDialogDraft<CheckpointDraft>({ context: () => studioSessionStore.workspaceLoadRevision })
const { isOpen: checkpointDialogOpen, isSaving: isSavingCheckpoint } = checkpointDialog
const checkpointName = computed(() => checkpointDialog.draft.value === null ? '' : checkpointDialog.draft.value.name)
const checkpointRole = computed(() => checkpointDialog.draft.value === null ? 'design' : checkpointDialog.draft.value.role)
type DiagramViewNameDraft = { kind: 'create', previewTargetId: string, name: string }
  | { kind: 'rename', previewTargetId: string, viewId: string, name: string }
const diagramViewDialog = useDialogDraft<DiagramViewNameDraft>({ context: () => studioSessionStore.workspaceLoadRevision })
const { isOpen: diagramViewDialogOpen } = diagramViewDialog
const diagramViewDialogMode = computed(() => diagramViewDialog.draft.value === null ? 'create' : diagramViewDialog.draft.value.kind)
const diagramViewDraftName = computed(() => diagramViewDialog.draft.value === null ? '' : diagramViewDialog.draft.value.name)
type WorkspaceImportInput = { text: string, file: File | null }
type WorkspaceImportDraft = WorkspaceImportInput & (
  | { kind: 'pgml' }
  | { kind: 'dbml', baseVersionId: string | null, foldIdentifiersToLowercase: boolean, parseExecutableComments: boolean }
  | { kind: 'pg_dump', baseVersionId: string | null, foldIdentifiersToLowercase: boolean, retainMatchingTableGroups: boolean }
)
const schemaImport = useSchemaImportSession<WorkspaceImportDraft, ImportExecutableAttachmentResolution>()
const importPgmlDraft = computed(() => schemaImport.draft.value?.kind === 'pgml' ? schemaImport.draft.value : null)
const importDbmlDraft = computed(() => schemaImport.draft.value?.kind === 'dbml' ? schemaImport.draft.value : null)
const importDumpDraft = computed(() => schemaImport.draft.value?.kind === 'pg_dump' ? schemaImport.draft.value : null)
const importPgmlDialogOpen = computed(() => schemaImport.isOpen.value && importPgmlDraft.value !== null)
const importDbmlDialogOpen = computed(() => schemaImport.isOpen.value && importDbmlDraft.value !== null)
const importDumpDialogOpen = computed(() => schemaImport.isOpen.value && importDumpDraft.value !== null)
const importPgmlError = computed(() => importPgmlDraft.value === null ? null : schemaImport.error.value)
const importDbmlError = computed(() => importDbmlDraft.value === null ? null : schemaImport.error.value)
const importDumpError = computed(() => importDumpDraft.value === null ? null : schemaImport.error.value)
const importPgmlText = computed(() => importPgmlDraft.value === null ? '' : importPgmlDraft.value.text)
const importDbmlText = computed(() => importDbmlDraft.value === null ? '' : importDbmlDraft.value.text)
const importDumpText = computed(() => importDumpDraft.value === null ? '' : importDumpDraft.value.text)
const importPgmlSelectedFile = computed(() => importPgmlDraft.value === null ? null : importPgmlDraft.value.file)
const importDbmlSelectedFile = computed(() => importDbmlDraft.value === null ? null : importDbmlDraft.value.file)
const importDumpSelectedFile = computed(() => importDumpDraft.value === null ? null : importDumpDraft.value.file)
const importDbmlBaseVersionId = computed(() => importDbmlDraft.value === null ? null : importDbmlDraft.value.baseVersionId)
const importDumpBaseVersionId = computed(() => importDumpDraft.value === null ? null : importDumpDraft.value.baseVersionId)
const importDbmlFoldIdentifiersToLowercase = computed(() => importDbmlDraft.value !== null && importDbmlDraft.value.foldIdentifiersToLowercase)
const importDbmlParseExecutableComments = computed(() => importDbmlDraft.value !== null && importDbmlDraft.value.parseExecutableComments)
const importDumpFoldIdentifiersToLowercase = computed(() => importDumpDraft.value !== null && importDumpDraft.value.foldIdentifiersToLowercase)
const importDumpRetainMatchingTableGroups = computed(() => importDumpDraft.value !== null && importDumpDraft.value.retainMatchingTableGroups)
const isSubmittingImportPgml = computed(() => schemaImport.isBusy.value && importPgmlDraft.value !== null && !schemaImport.isPlacing.value)
const isSubmittingImportDbml = computed(() => schemaImport.isBusy.value && importDbmlDraft.value !== null && !schemaImport.isPlacing.value)
const isSubmittingImportDump = computed(() => schemaImport.isBusy.value && importDumpDraft.value !== null && !schemaImport.isPlacing.value)
const importExecutableAttachmentResolution = schemaImport.placement
const importExecutableAttachmentError = schemaImport.error
const isSubmittingImportExecutableAttachmentResolution = computed(() => schemaImport.isBusy.value && schemaImport.isPlacing.value)
let importLoadIntent: StudioLoadIntent | null = null
const restoreVersionDialog = useDialogDraft<{ versionId: string, label: string }>({ context: () => studioSessionStore.workspaceLoadRevision })
const { isOpen: restoreVersionDialogOpen } = restoreVersionDialog
const restoreVersionLabel = computed(() => restoreVersionDialog.draft.value === null ? 'Unknown version' : restoreVersionDialog.draft.value.label)
const deleteVersionDialog = useDialogDraft<{ versionId: string, label: string }>({ context: () => studioSessionStore.workspaceLoadRevision })
const { isOpen: deleteVersionDialogOpen } = deleteVersionDialog
const deleteVersionId = computed(() => deleteVersionDialog.draft.value === null ? null : deleteVersionDialog.draft.value.versionId)
const deleteVersionLabel = computed(() => deleteVersionDialog.draft.value === null ? 'Unknown version' : deleteVersionDialog.draft.value.label)
const compareExclusionsDialog = useDialogDraft<{
  comparisonId: string | null
  exclusions: PgmlCompareExclusions
  searchQuery: string
  typeFilter: CompareExclusionTypeFilterValue
}>({ context: () => studioSessionStore.workspaceLoadRevision })
const { isOpen: compareExclusionsDialogOpen, isSaving: isSavingCompareExclusions } = compareExclusionsDialog
const compareExclusionsDraft = computed(() => compareExclusionsDialog.draft.value === null ? null : compareExclusionsDialog.draft.value.exclusions)
const compareExclusionsSearchQuery = computed(() => compareExclusionsDialog.draft.value === null ? '' : compareExclusionsDialog.draft.value.searchQuery)
const compareExclusionsTypeFilter = computed(() => compareExclusionsDialog.draft.value === null ? 'all' : compareExclusionsDialog.draft.value.typeFilter)
const compareNoteDialog = useDialogDraft<{ comparisonId: string, entryId: string, flag: PgmlCompareNoteFlag, text: string }>({ context: () => studioSessionStore.workspaceLoadRevision })
const { isOpen: compareNoteDialogOpen, isSaving: isSavingCompareNote } = compareNoteDialog
const compareNoteDraftEntryId = computed(() => compareNoteDialog.draft.value === null ? null : compareNoteDialog.draft.value.entryId)
const compareNoteDraftFlag = computed(() => compareNoteDialog.draft.value === null ? 'pending' : compareNoteDialog.draft.value.flag)
const compareNoteDraftText = computed(() => compareNoteDialog.draft.value === null ? '' : compareNoteDialog.draft.value.text)
const compareSourceDialog = useDialogDraft<{ range: PgmlSourceRange, source: string, versionLabel: string, entryLabel: string | null }>({ context: () => studioSessionStore.workspaceLoadRevision })
const { isOpen: compareSourceDialogOpen } = compareSourceDialog
const compareSourceDialogRange = computed(() => compareSourceDialog.draft.value === null ? null : compareSourceDialog.draft.value.range)
type ComparisonNameDraft = { kind: 'create', name: string } | { kind: 'rename', comparisonId: string, name: string }
const comparisonDialog = useDialogDraft<ComparisonNameDraft>({ context: () => studioSessionStore.workspaceLoadRevision })
const { isOpen: comparisonDialogOpen, isSaving: isSavingComparisonDialog } = comparisonDialog
const comparisonDialogMode = computed(() => comparisonDialog.draft.value === null ? 'create' : comparisonDialog.draft.value.kind)
const comparisonDraftName = computed(() => comparisonDialog.draft.value === null ? '' : comparisonDialog.draft.value.name)
const renameVersionDialog = useDialogDraft<{ versionId: string, name: string }>({ context: () => studioSessionStore.workspaceLoadRevision })
const { isOpen: renameVersionDialogOpen } = renameVersionDialog
const renameVersionDraftName = computed(() => renameVersionDialog.draft.value === null ? '' : renameVersionDialog.draft.value.name)
const renameVersionId = computed(() => renameVersionDialog.draft.value === null ? null : renameVersionDialog.draft.value.versionId)
const tableEditor = useDialogDraft<PgmlEditableTableDraft>({ context: () => [studioSessionStore.workspaceLoadRevision, source.value] })
const { draft: tableEditorDraft, isOpen: tableEditorOpen, isSaving: isSavingTableEditor } = tableEditor
const groupEditor = useDialogDraft<PgmlEditableGroupDraft>({ context: () => [studioSessionStore.workspaceLoadRevision, source.value] })
const { draft: groupEditorDraft, isOpen: groupEditorOpen, isSaving: isSavingGroupEditor } = groupEditor
const exportScales = [...diagramRasterExportScaleFactors]
const lastSaveErrorToastMessage: Ref<string | null> = ref(null)
const browserSchemaStatusEligible: Ref<boolean> = ref(false)
const workspaceLifetime: Ref<'active' | 'leaving' | 'disposed'> = ref('active')
const workspacePersistenceActive = computed(() => workspaceLifetime.value === 'active')
const { clearHeaderActions: clearStudioHeaderActions, setHeaderActions: setStudioHeaderActions,
  clearSchemaStatus: clearStudioSchemaStatus, setSchemaStatus: setStudioSchemaStatus,
  release: releaseWorkspaceChrome } = useStudioShellStore().acquireWorkspaceChrome()
onScopeDispose(releaseWorkspaceChrome)
const { getColumnDefaultPlaceholder, getColumnDefaultSuggestions } = usePgmlColumnDefaultSuggestions()
const toast = useToast()
const {
  editorRef,
  focusEditorDiagnostic,
  focusEditorSourceRange
} = usePgmlSourceEditor()
const studioSourcesStore = useStudioSourcesStore()
const {
  appliedLaunchKey: appliedStudioLaunchKey,
  currentSourceKind: currentPersistenceSource,
  includeLayoutInSchema,
  loadDialogOpen,
  schemaDialogMode,
  schemaDialogOpen
} = storeToRefs(studioSessionStore)
const {
  activeDiagramViewName,
  activeDiagramViewId,
  compareBaseId: versionCompareBaseId,
  compareBaseSource,
  compareExclusions: activeCompareExclusions,
  compareEntityFilters: activeCompareEntityFilters,
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
  loadPreparedDocument,
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
  setCurrentCompareEntityFilters,
  setCurrentCompareExclusions,
  setCurrentCompareNoteFilters,
  setCurrentCompareNoiseFilters,
  setDocumentEditorScope,
  setEditorMode,
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
watch([previewTargetId, activeDiagramViewId], () => diagramViewDialog.discard(), { flush: 'sync' })
watch(selectedComparisonId, () => {
  compareExclusionsDialog.discard()
  compareNoteDialog.discard()
}, { flush: 'sync' })
const largeDocumentCharThreshold = 50000
const largeDocumentLineThreshold = 1500
const {
  isCurrent: isWorkspaceModelCurrent,
  diagnostics: workspaceAnalysisDiagnostics,
  hasBlockingErrors: workspaceAnalysisHasBlockingErrors,
  parsedModel: workspaceAnalysisParsedModel,
  revision: workspaceAnalysisRevision,
  requestedRevision: workspaceAnalysisRequestRevision,
  parserReadyRevision: executableParserReadyRevision
} = usePgmlWorkspaceAnalysis(source)
const lastRenderableWorkspaceModel: ShallowRef<PgmlSchemaModel> = shallowRef(applyPgmlDocumentSchemaMetadataToModel(
  parsePgml(source.value),
  versionDocument.value.schemaMetadata
))
const { load: loadWorkspaceDocument, isLoading: isOpeningPgmlDocument } = usePgmlDocumentLoader({
  documentName: () => versionDocumentName.value,
  applyDocument: loadPreparedDocument,
  onError: (description) => {
    toast.add({ title: 'Open failed', description, color: 'error', icon: 'i-lucide-x' })
  }
})

const parsePgmlForCurrentExecutableParser = (
  nextSource: string,
  parserReadyRevision: number
) => {
  if (parserReadyRevision < 0) {
    return parsePgml(nextSource)
  }

  return parsePgml(nextSource)
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
const importPgmlSelectedFileName = computed(() => importPgmlSelectedFile.value?.name || '')
const isImportBusy = computed(() => {
  return isSubmittingImportPgml.value
    || isSubmittingImportDbml.value
    || isSubmittingImportDump.value
    || isSubmittingImportExecutableAttachmentResolution.value
})
const importBusyTitle = computed(() => {
  if (isSubmittingImportExecutableAttachmentResolution.value) {
    return 'Applying import selections'
  }

  if (isSubmittingImportPgml.value) {
    return 'Importing PGML'
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

  if (isSubmittingImportPgml.value) {
    return 'Parsing the PGML document and appending its version history.'
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
  const editor = editorRef.value
  if (editor !== null
    && editor.getDocumentContextRevision() === studioSessionStore.workspaceDocumentRevision
    && editor.getCommittedInput() === displayedEditorSource.value
    && editor.hasPendingChanges()) {
    await editor.flushPendingChanges()
  }

  if (options.waitForAnalysis) {
    await waitForLatestWorkspaceAnalysis()
  }
}

watch([isEditorPanelVisible, isCompactStudioLayout], ([visible, compact], [, previousCompact]) => {
  if (!visible || compact !== previousCompact) void flushPendingEditorChanges()
}, { flush: 'sync' })

const buildSchemaText = (includeLayout: boolean) => {
  const shouldIncludeLayout = includeLayout && canEmbedLayout.value

  return serializeCurrentDocument(shouldIncludeLayout, source.value)
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
  showConstraints?: boolean
  showCustomTypes?: boolean
  showExecutableObjects?: boolean
  showFunctions?: boolean
  showGroups?: boolean
  showIndexes?: boolean
  showProcedures?: boolean
  showRelationshipLines?: boolean
  showSequences?: boolean
  showTableFields?: boolean
  showTables?: boolean
  showTriggers?: boolean
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
  currentSchemaId,
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
  schemaActionTitle,
  schemaDialogName,
  updateSchemaDialogName
} = usePgmlStudioSchemas({
  applyLoadedSchemaText: loadWorkspaceDocument,
  autosaveEnabled: computed(() => workspacePersistenceActive.value && currentPersistenceSource.value === 'browser'),
  browserPersistenceEnabled: computed(() => workspacePersistenceActive.value && currentPersistenceSource.value === 'browser'),
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
  applyLoadedFileText: loadWorkspaceDocument,
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
  applyLoadedFileText: loadWorkspaceDocument,
  buildSchemaText,
  source
})

const requestCanvasViewportReset = () => {
  canvasViewportResetKey.value += 1
}

const withViewportReset = (action: () => boolean | Promise<boolean>) => {
  // Loading or clearing a schema changes the rendered node set, so the viewport
  // reset stays coupled to those entry points instead of being easy to forget.
  return async () => {
    if (await action()) requestCanvasViewportReset()
  }
}

const loadExample = withViewportReset(() => {
  resetBrowserSchemaStatusEligibility()
  return loadStudioExample()
})
const clearSchema = withViewportReset(() => {
  resetBrowserSchemaStatusEligibility()
  return clearStudioSchema()
})

const loadSavedSchema = async (schema: SavedPgmlSchema) => {
  resetBrowserSchemaStatusEligibility()
  if (await loadStudioSavedSchema(schema)) requestCanvasViewportReset()
}

const loadRecentComputerFile = async (recentFileId: string) => {
  const didLoadRecentFile = await loadRecentComputerFileById(recentFileId)

  if (!didLoadRecentFile) {
    return
  }

  resetBrowserSchemaStatusEligibility()
  studioSessionStore.closeLoadDialog()
  requestCanvasViewportReset()
}

const loadGistFile = async (filename: string) => {
  const didLoadGistFile = await loadGistPgmlFileByName(filename)

  if (!didLoadGistFile) {
    return
  }

  resetBrowserSchemaStatusEligibility()
  studioSessionStore.closeLoadDialog()
  requestCanvasViewportReset()
}

const chooseComputerFileFromLoadDialog = async () => {
  const didOpenComputerFile = await openComputerFileFromPicker()

  if (!didOpenComputerFile) {
    return
  }

  resetBrowserSchemaStatusEligibility()
  studioSessionStore.closeLoadDialog()
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
type CompareExclusionOptionKind = 'entity' | 'group' | 'schema' | 'table'
type CompareExclusionTypeFilterValue = 'all' | 'group' | 'schema' | 'table' | PgmlDiagramCompareEntityKind

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
type CompareExclusionSchemaSection = {
  id: string
  schemaOption: CompareExclusionOption
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
  'schema',
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
const analysisSelectedCompareEntry = computed<PgmlDiagramCompareEntry | null>(() => {
  if (!analysisSelectedCompareEntryId.value) {
    return null
  }

  return compareRawEntriesById.value[analysisSelectedCompareEntryId.value] || null
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
const compareSourceDialogVersionLabel = computed(() => compareSourceDialog.draft.value === null ? '' : compareSourceDialog.draft.value.versionLabel)
const compareSourceDialogSource = computed(() => compareSourceDialog.draft.value === null ? '' : compareSourceDialog.draft.value.source)
const compareSourceDialogContent = computed(() => {
  if (!compareSourceDialogRange.value) {
    return ''
  }

  const selectionRange = getPgmlSourceSelectionRange(compareSourceDialogSource.value, compareSourceDialogRange.value)

  if (!selectionRange) {
    return ''
  }

  return compareSourceDialogSource.value.slice(selectionRange.start, selectionRange.end)
})
const compareSourceDialogLineLabel = computed(() => {
  if (!compareSourceDialogRange.value) {
    return ''
  }

  if (compareSourceDialogRange.value.startLine === compareSourceDialogRange.value.endLine) {
    return `Line ${compareSourceDialogRange.value.startLine}`
  }

  return `Lines ${compareSourceDialogRange.value.startLine}-${compareSourceDialogRange.value.endLine}`
})
const compareSourceDialogTitle = computed(() => {
  const draft = compareSourceDialog.draft.value
  return draft !== null && draft.entryLabel !== null ? `View source: ${draft.entryLabel}` : 'View source'
})
const compareSourceDialogDescription = computed(() => {
  return compareSourceDialogLineLabel.value
    ? `${compareSourceDialogLineLabel.value} in ${compareSourceDialogVersionLabel.value}.`
    : `PGML source from ${compareSourceDialogVersionLabel.value}.`
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
    ? `${compareComparisonLabel.value} keeps its managed exclusions, entity kinds, note flags, notes, and noise filters when you change the base or target here.`
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
      compareNoteDialog.discard()
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
    compareNoteDialog.discard()
  }
}, {
  immediate: true
})
const buildCompareExclusionSummary = (
  exclusions: PgmlCompareExclusionsInput | null | undefined
) => {
  const normalizedExclusions = clonePgmlCompareExclusions(exclusions)
  const parts: string[] = []

  if (normalizedExclusions.groupNames.length > 0) {
    parts.push(`${normalizedExclusions.groupNames.length} excluded group${normalizedExclusions.groupNames.length === 1 ? '' : 's'}`)
  }

  if (normalizedExclusions.schemaNames.length > 0) {
    parts.push(`${normalizedExclusions.schemaNames.length} excluded schema${normalizedExclusions.schemaNames.length === 1 ? '' : 's'}`)
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
const compareExclusionsEffective = computed(() => {
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
    + compareExclusionsDraft.value.schemaNames.length
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
const createCompareExclusionSchemaOption = (schemaName: string): CompareExclusionOption => {
  return {
    entityKind: null,
    id: `schema:${schemaName}`,
    kind: 'schema',
    label: `Schema ${schemaName}`,
    searchText: `schema ${schemaName}`.toLowerCase(),
    value: schemaName
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

  if (option.kind === 'schema') {
    return option.label
  }

  if (option.kind === 'table') {
    return `Table ${option.label}`
  }

  const entityKindLabel = option.entityKind ? getPgmlDiagramCompareEntityKindLabel(option.entityKind) : 'Entity'

  return `${entityKindLabel} ${option.label}`
}
const buildCompareExclusionVisibleLabels = (
  exclusions: PgmlCompareExclusionsInput | null | undefined
) => {
  const normalizedExclusions = clonePgmlCompareExclusions(exclusions)

  return [
    ...normalizedExclusions.groupNames.map(groupName => buildCompareExclusionSummaryLabel(createCompareExclusionGroupOption(groupName))),
    ...normalizedExclusions.schemaNames.map(schemaName => buildCompareExclusionSummaryLabel(createCompareExclusionSchemaOption(schemaName))),
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
const compareExclusionSchemaSections = computed<CompareExclusionSchemaSection[]>(() => {
  const schemaNames = new Set<string>([
    ...compareExclusionSourceModels.value.flatMap(model => model.schemas),
    ...compareExclusionsEffective.value.schemaNames
  ])

  return Array.from(schemaNames)
    .sort((left, right) => left.localeCompare(right))
    .map((schemaName) => {
      const tableIdsForSchema: string[] = []
      const seenTableIds = new Set<string>()
      const pushTableId = (tableId: string) => {
        if (seenTableIds.has(tableId)) {
          return
        }

        seenTableIds.add(tableId)
        tableIdsForSchema.push(tableId)
      }

      compareExclusionSourceModels.value.forEach((model) => {
        model.tables
          .filter(table => table.schema === schemaName)
          .sort((left, right) => left.fullName.localeCompare(right.fullName))
          .forEach((table) => {
            pushTableId(table.fullName)
          })
      })

      compareExclusionsEffective.value.tableIds
        .filter((tableId) => {
          return compareExclusionSourceModels.value.some((model) => {
            return model.tables.some(table => table.fullName === tableId && table.schema === schemaName)
          })
        })
        .sort((left, right) => left.localeCompare(right))
        .forEach(pushTableId)

      return {
        id: `schema-section:${schemaName}`,
        schemaOption: createCompareExclusionSchemaOption(schemaName),
        tableOptions: tableIdsForSchema.map(createCompareExclusionTableOption)
      } satisfies CompareExclusionSchemaSection
    })
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
  const schemaCount = compareExclusionSchemaSections.value.length
  const groupCount = compareExclusionGroupSections.value.length
  const tableCount = compareExclusionGroupSections.value.reduce((count, section) => {
    return count + section.tableOptions.length
  }, 0) + compareExclusionUngroupedTableOptions.value.length
  const entityCountByKind = new Map<PgmlDiagramCompareEntityKind, number>(
    compareExclusionEntitySections.value.map(section => [section.entityKind, section.options.length])
  )
  const totalCount = schemaCount + groupCount + tableCount + Array.from(entityCountByKind.values()).reduce((sum, count) => {
    return sum + count
  }, 0)

  return compareExclusionTypeFilterOrder.flatMap((value) => {
    const count = value === 'all'
      ? totalCount
      : value === 'schema'
        ? schemaCount
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
      : value === 'schema'
        ? 'Schemas'
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
const filteredCompareExclusionSchemaSections = computed(() => {
  const searchQuery = normalizedCompareExclusionsSearchQuery.value
  const typeFilter = compareExclusionsTypeFilter.value

  if (typeFilter !== 'all' && typeFilter !== 'schema') {
    return []
  }

  if (searchQuery.length === 0) {
    return compareExclusionSchemaSections.value
  }

  return compareExclusionSchemaSections.value.filter((section) => {
    return section.schemaOption.searchText.includes(searchQuery)
  })
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
const compareExclusionsShowsSchemaSections = computed(() => {
  return compareExclusionsTypeFilter.value === 'all' || compareExclusionsTypeFilter.value === 'schema'
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
    || (
      compareExclusionsTypeFilter.value !== 'group'
      && compareExclusionsTypeFilter.value !== 'schema'
      && compareExclusionsTypeFilter.value !== 'table'
    )
})
const hasVisibleCompareExclusionOptions = computed(() => {
  return filteredCompareExclusionSchemaSections.value.length > 0
    || filteredCompareExclusionGroupSections.value.length > 0
    || filteredCompareExclusionUngroupedTableOptions.value.length > 0
    || filteredCompareExclusionEntitySections.value.length > 0
})
const comparisonDialogTitle = computed(() => {
  return comparisonDialogMode.value === 'rename' ? 'Rename comparison' : 'Create comparison'
})
const comparisonDialogDescription = computed(() => {
  return comparisonDialogMode.value === 'rename'
    ? 'Update the saved comparison name without changing its base, target, or exclusions.'
    : 'Save the current compare base, target, filters, and exclusions as a reusable comparison preset.'
})
const normalizedComparisonDraftName = computed(() => {
  return comparisonDraftName.value.trim()
})
const comparisonNameError = computed(() => {
  if (normalizedComparisonDraftName.value.length === 0) {
    return 'Comparison name is required.'
  }

  const draft = comparisonDialog.draft.value
  if (draft !== null && draft.kind === 'rename') {
    const duplicateComparison = comparisonItems.value.find((comparison) => {
      return comparison.label === normalizedComparisonDraftName.value && comparison.value !== draft.comparisonId
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

type WorkspaceLaunchState = { kind: 'idle' } | { kind: 'loading', key: string } | { kind: 'disposed' }
const workspaceLaunchState: Ref<WorkspaceLaunchState> = shallowRef({ kind: 'idle' })
watch([studioLaunchRequest, orderedSavedSchemas], async ([request]) => {
  if (!request || workspaceLaunchState.value.kind === 'disposed') return
  const requestKey = getStudioLaunchRequestKey(request)
  if (requestKey === appliedStudioLaunchKey.value || (workspaceLaunchState.value.kind === 'loading' && workspaceLaunchState.value.key === requestKey)) return
  const pending = { kind: 'loading', key: requestKey } satisfies WorkspaceLaunchState
  workspaceLaunchState.value = pending
  const intent = studioSessionStore.beginWorkspaceLoad(request.source)
  let accepted = false
  try {
    if (request.source === 'file') {
      const preloaded = studioSessionStore.consumePreloadedFileLaunch(request)
      accepted = preloaded
        ? await syncLoadedComputerFile(preloaded, intent)
        : await loadRecentComputerFileById(request.recentFileId, intent)
      if (accepted && preloaded) void refreshRecentComputerFiles().catch(() => {})
    } else if (request.source === 'gist') {
      accepted = await loadGistPgmlFileByName(request.filename, intent)
    } else if (request.launch === 'example') {
      accepted = await loadStudioExample(intent)
    } else if (request.launch === 'new') {
      accepted = await clearStudioSchema(intent)
    } else {
      const saved = orderedSavedSchemas.value.find(schema => schema.id === request.schemaId)
      if (saved) accepted = await loadStudioSavedSchema(saved, intent)
    }
    if (!accepted) {
      const message = request.source === 'file' ? computerFileSaveError.value : request.source === 'gist' ? gistFileSaveError.value : null
      if (message !== null && currentPersistenceSource.value !== request.source && workspaceLaunchState.value === pending) {
        toast.add({ id: `studio-open-failed:${requestKey}`, title: 'Open failed', description: message, color: 'error', icon: 'i-lucide-x' })
      }
      return
    }
    if (!studioSessionStore.ownsWorkspaceLoad(intent) || workspaceLaunchState.value !== pending) return
    appliedStudioLaunchKey.value = requestKey
    resetBrowserSchemaStatusEligibility()
    studioSessionStore.closeLoadDialog()
    requestCanvasViewportReset()
  } finally {
    if (!accepted) studioSessionStore.cancelWorkspaceLoad(intent)
    if (workspaceLaunchState.value === pending) workspaceLaunchState.value = { kind: 'idle' }
  }
}, { immediate: true })

watch([currentPersistenceSource, currentSchemaId], async ([persistenceSource, schemaId]) => {
  if (studioSessionStore.isWorkspaceLoading || persistenceSource !== 'browser' || schemaId === null) {
    return
  }

  const request = studioLaunchRequest.value

  if (request?.source === 'browser' && request.launch === 'saved' && request.schemaId === schemaId) {
    return
  }

  appliedStudioLaunchKey.value = getStudioLaunchRequestKey({
    launch: 'saved',
    schemaId,
    source: 'browser'
  })
  await navigateTo({
    path: route.path,
    query: buildBrowserStudioSavedQuery(schemaId)
  }, { replace: true })
}, { immediate: true })

const downloadCurrentSchema = async () => {
  await flushPendingEditorChanges({
    waitForAnalysis: true
  })
  const name = currentPersistenceSource.value === 'browser' && schemaDialogName.value !== null
    ? schemaDialogName.value
    : activeSchemaName.value

  downloadSchemaText(name, buildSchemaText(includeLayoutInSchema.value))
  studioSessionStore.closeSchemaDialog()
}
const saveCurrentSchema = async () => {
  const dialogRevision = studioSessionStore.schemaDialogRevision
  await flushPendingEditorChanges({
    waitForAnalysis: true
  })

  if (currentPersistenceSource.value === 'file') {
    const didSave = await saveSchemaToComputerFile()

    if (didSave) {
      studioSessionStore.closeSchemaDialog(dialogRevision)
      pushSaveSuccessToast(getSaveSuccessToastDescription())
    }

    return
  }

  if (currentPersistenceSource.value === 'gist') {
    const didSave = await saveSchemaToGistFile()

    if (didSave) {
      studioSessionStore.closeSchemaDialog(dialogRevision)
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
const refreshSuggestedCheckpointName = (draft: CheckpointDraft) => {
  if (draft.nameOrigin.kind === 'suggested') {
    draft.name = buildPgmlCheckpointName(versionDocument.value, { createdAt: draft.nameOrigin.createdAt, role: draft.role })
  }
}
const openCheckpointDialog = async () => {
  const createdAt = new Date().toISOString()
  checkpointDialog.open({ name: buildPgmlCheckpointName(versionDocument.value, { createdAt, role: 'design' }),
    role: 'design', nameOrigin: { kind: 'suggested', createdAt } })
  const draft = checkpointDialog.draft.value
  await flushPendingEditorChanges()
  if (draft !== null && checkpointDialog.draft.value === draft && checkpointDialogOpen.value && !isSavingCheckpoint.value) refreshSuggestedCheckpointName(draft)
}
const updateCheckpointName = (value: unknown) => {
  if (typeof value === 'string') checkpointDialog.updateDraft({ name: value, nameOrigin: { kind: 'custom' } })
}
const updateCheckpointRole = (value: unknown) => {
  checkpointDialog.updateDraft({ role: value === 'implementation' ? 'implementation' : 'design' })
  const draft = checkpointDialog.draft.value
  if (draft !== null && !isSavingCheckpoint.value) refreshSuggestedCheckpointName(draft)
}
const ownsWorkspaceNavigation = (request: WorkspaceNavigationRequest) => 'request' in workspaceNavigation.value
  && workspaceNavigation.value.request === request && workspacePersistenceActive.value
  && studioSessionStore.workspaceDocumentRevision === request.documentRevision
  && studioSessionStore.workspaceLoadRevision === request.loadRevision && currentPersistenceSource.value === request.source
const persistWorkspaceBeforeRouteSwitch = async (request: WorkspaceNavigationRequest) => {
  await flushPendingEditorChanges({ waitForAnalysis: true })
  if (!ownsWorkspaceNavigation(request)) return false

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
const navigateToWorkspaceMode = async (destination: StudioWorkspacePage) => {
  if (destination === workspaceMode || workspaceNavigation.value.kind !== 'idle' || !workspacePersistenceActive.value) return
  const source = currentPersistenceSource.value
  const request: WorkspaceNavigationRequest = { destination, source,
    documentRevision: studioSessionStore.workspaceDocumentRevision, loadRevision: studioSessionStore.workspaceLoadRevision,
    query: source === 'file' || source === 'gist' ? { ...route.query } : undefined }
  workspaceNavigation.value = { kind: 'persisting', request }
  try {
    const accepted = await persistWorkspaceBeforeRouteSwitch(request)
    if (!accepted || !ownsWorkspaceNavigation(request)) return
    workspaceNavigation.value = { kind: 'navigating', request }
    const failure = await navigateTo({ path: getStudioWorkspacePath(request.destination), query: request.query })
    if (failure !== undefined && 'request' in workspaceNavigation.value && workspaceNavigation.value.request === request) workspaceNavigation.value = { kind: 'idle' }
  } catch (error) {
    if (ownsWorkspaceNavigation(request)) toast.add({ title: 'Navigation failed', description: getActionErrorMessage(error, 'Unable to switch workspaces.'), color: 'error', icon: 'i-lucide-circle-alert' })
    if ('request' in workspaceNavigation.value && workspaceNavigation.value.request === request) workspaceNavigation.value = { kind: 'idle' }
  } finally {
    if (workspaceNavigation.value.kind === 'persisting' && workspaceNavigation.value.request === request) workspaceNavigation.value = { kind: 'idle' }
  }
}
const closeCheckpointDialog = () => checkpointDialog.close()
const closeRestoreVersionDialog = () => restoreVersionDialog.close()
const closeDeleteVersionDialog = () => deleteVersionDialog.close()
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

  if (option.kind === 'schema') {
    return compareExclusionsEffective.value.schemaNames.includes(option.value)
  }

  if (option.kind === 'table') {
    return compareExclusionsEffective.value.tableIds.includes(option.value)
  }

  return compareExclusionsEffective.value.entityIds.includes(option.value)
}
const openCompareExclusionsDialog = () => {
  compareExclusionsDialog.open({ comparisonId: selectedComparisonId.value, exclusions: clonePgmlCompareExclusions(activeCompareExclusions.value), searchQuery: '', typeFilter: 'all' })
}
const closeCompareExclusionsDialog = () => compareExclusionsDialog.close()
const setCompareExclusionsTypeFilter = (typeFilter: CompareExclusionTypeFilterValue) => compareExclusionsDialog.updateDraft({ typeFilter })
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
        : option.kind === 'schema'
          ? nextDraft.schemaNames
          : nextDraft.tableIds
  )

  if (isCompareExclusionOptionSelected(option)) {
    nextValues.delete(option.value)
  } else {
    nextValues.add(option.value)
  }

  compareExclusionsDialog.updateDraft({ exclusions: clonePgmlCompareExclusions({
    ...nextDraft,
    [option.kind === 'entity'
      ? 'entityIds'
      : option.kind === 'group'
        ? 'groupNames'
        : option.kind === 'schema'
          ? 'schemaNames'
          : 'tableIds']: Array.from(nextValues)
  }) })
}
const removeCompareExclusionOption = (option: CompareExclusionOption) => {
  if (!isCompareExclusionOptionSelected(option)) {
    return
  }

  toggleCompareExclusionOption(option)
}
const clearCompareExclusionsDraft = () => {
  compareExclusionsDialog.updateDraft({ exclusions: createEmptyPgmlCompareExclusions() })
}
const saveCompareExclusionsDialog = async () => {
  const draft = compareExclusionsDialog.beginSave()
  if (draft === null) return
  try {
    if (draft.comparisonId !== selectedComparisonId.value || !setCurrentCompareExclusions(draft.exclusions)) return
    const description = selectedComparison.value ? `${compareComparisonLabel.value} now keeps its saved exclusions.` : 'The current comparison now uses the updated exclusions.'
    if (draft.comparisonId !== null) await persistBrowserWorkspaceMutation()
    if (!isSavingCompareExclusions.value || compareExclusionsDialog.draft.value !== draft) return
    compareExclusionsDialog.completeSave(draft, true)
    toast.add({ title: 'Compare exclusions updated', description, color: 'success', icon: 'i-lucide-check' })
  } finally {
    compareExclusionsDialog.completeSave(draft, false)
  }
}
const closeCompareNoteDialog = () => compareNoteDialog.close()
const openCompareNoteDialog = (entryId: string) => {
  const selected = selectedComparison.value
  if (selected === null) {
    toast.add({ title: 'Save a comparison first', description: 'Create or select a saved comparison before adding persisted compare notes.', color: 'warning', icon: 'i-lucide-bookmark' })
    return
  }
  if (!compareRawEntriesById.value[entryId]) return
  const note = selected.notes.find(entry => entry.entryId === entryId)
  compareNoteDialog.open({ comparisonId: selected.id, entryId, flag: note === undefined ? 'pending' : note.flag, text: note === undefined ? '' : note.note })
}
const updateCompareNoteFlag = (value: unknown) => {
  const item = compareNoteFlagItems.find(candidate => candidate.value === value)
  if (item) compareNoteDialog.updateDraft({ flag: item.value })
}
const updateCompareNoteText = (event: Event) => {
  if (event.target instanceof HTMLTextAreaElement) compareNoteDialog.updateDraft({ text: event.target.value })
}
const saveCompareNoteDialog = async () => {
  if (!canSaveCompareNote.value) return
  const draft = compareNoteDialog.beginSave()
  if (draft === null) return
  try {
    if (draft.comparisonId !== selectedComparisonId.value || !saveSelectedComparisonNote({ entryId: draft.entryId, flag: draft.flag, note: draft.text })) return
    const description = `${compareComparisonLabel.value} now keeps the note for this difference.`
    await persistBrowserWorkspaceMutation()
    if (!isSavingCompareNote.value || compareNoteDialog.draft.value !== draft) return
    compareNoteDialog.completeSave(draft, true)
    toast.add({ title: 'Compare note saved', description, color: 'success', icon: 'i-lucide-check' })
  } finally {
    compareNoteDialog.completeSave(draft, false)
  }
}
const deleteCompareNoteDialog = async () => {
  const draft = compareNoteDialog.beginSave()
  if (draft === null) return
  try {
    if (draft.comparisonId !== selectedComparisonId.value || !deleteSelectedComparisonNote(draft.entryId)) return
    const description = `${compareComparisonLabel.value} no longer keeps a note for this difference.`
    await persistBrowserWorkspaceMutation()
    if (!isSavingCompareNote.value || compareNoteDialog.draft.value !== draft) return
    compareNoteDialog.completeSave(draft, true)
    toast.add({ title: 'Compare note removed', description, color: 'success', icon: 'i-lucide-check' })
  } finally {
    compareNoteDialog.completeSave(draft, false)
  }
}
const buildNextComparisonName = () => {
  let index = comparisonItems.value.length + 1

  while (comparisonItems.value.some(item => item.label === `Comparison ${index}`)) {
    index += 1
  }

  return `Comparison ${index}`
}
const openCreateComparisonDialog = () => {
  comparisonDialog.open({ kind: 'create', name: buildNextComparisonName() })
}
const openRenameComparisonDialog = () => {
  const selected = selectedComparison.value
  if (selected !== null) comparisonDialog.open({ kind: 'rename', comparisonId: selected.id, name: selected.name })
}
const closeComparisonDialog = () => comparisonDialog.close()
const saveComparisonDialog = async () => {
  if (comparisonNameError.value !== null) return
  const draft = comparisonDialog.beginSave()
  if (draft === null) return
  const name = draft.name.trim()
  try {
    let title: string
    let description: string
    if (draft.kind === 'rename') {
      if (!renameComparison(draft.comparisonId, name)) return
      title = 'Comparison renamed'
      description = `${name} is now the saved comparison label.`
    } else {
      const created = createComparison(name)
      if (created === null) return
      title = 'Comparison created'
      description = `${created.name} now stores the current base, target, filters, and exclusions.`
    }
    await persistBrowserWorkspaceMutation()
    if (!isSavingComparisonDialog.value || comparisonDialog.draft.value !== draft) return
    comparisonDialog.completeSave(draft, true)
    toast.add({ title, description, color: 'success', icon: 'i-lucide-check' })
  } finally {
    comparisonDialog.completeSave(draft, false)
  }
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

  renameVersionDialog.open({ versionId, name: getVersionLabel(version) })
}
const closeRenameVersionDialog = () => renameVersionDialog.close()
const openDeleteVersionDialog = (versionId: string) => {
  const version = versionHistoryItems.value.find(entry => entry.id === versionId) || null

  if (!version || !version.canDelete) {
    return
  }

  deleteVersionDialog.open({ versionId, label: getVersionLabel(version) })
}
const saveCheckpoint = async () => {
  const draft = checkpointDialog.beginSave()
  if (draft === null) return
  try {
    await flushPendingEditorChanges()
    if (!isSavingCheckpoint.value || checkpointDialog.draft.value !== draft || !workspacePersistenceActive.value) return
    refreshSuggestedCheckpointName(draft)
    const name = draft.name.trim()
    if (name.length === 0) return
    const created = createVersionCheckpoint({ includeLayout: true, name, role: draft.role })
    if (created === null) return
    checkpointDialog.completeSave(draft, true)
    setPreviewTarget('workspace')
    requestCanvasViewportReset()
    toast.add({ title: 'Checkpoint created', description: buildPgmlCheckpointCreatedDescription(getVersionLabel(created), created.role), color: 'success', icon: 'i-lucide-check' })
  } finally {
    checkpointDialog.completeSave(draft, false)
  }
}

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
  diagramViewDialog.open({ kind: 'create', previewTargetId: previewTargetId.value, name: nextDiagramViewName.value })
}
const openRenameDiagramViewDialog = () => {
  if (activeDiagramViewId.value !== null) diagramViewDialog.open({ kind: 'rename', previewTargetId: previewTargetId.value, viewId: activeDiagramViewId.value, name: activeDiagramViewName.value })
}
const closeDiagramViewDialog = () => diagramViewDialog.close()
const saveRenameVersionDialog = () => {
  if (renameVersionNameError.value !== null) return
  const draft = renameVersionDialog.beginSave()
  if (draft === null) return
  const name = draft.name.trim()
  try {
    if (!renameVersion(draft.versionId, name)) return
    markBrowserSchemaStatusEligible()
    renameVersionDialog.completeSave(draft, true)
    toast.add({ title: 'Version renamed', description: `Locked version renamed to ${name}.`, color: 'success', icon: 'i-lucide-check' })
  } finally {
    renameVersionDialog.completeSave(draft, false)
  }
}
const revealPreviewTargetDocumentSource = () => {
  setDocumentEditorScope(getPreviewTargetDocumentScope())
  setEditorMode('document')
}
const saveDiagramViewDialog = () => {
  if (diagramViewNameError.value !== null) return
  const draft = diagramViewDialog.beginSave()
  if (draft === null) return
  try {
    if (draft.previewTargetId !== previewTargetId.value || (draft.kind === 'rename' && draft.viewId !== activeDiagramViewId.value)) return
    const name = draft.name.trim()
    const accepted = draft.kind === 'rename' ? renameActiveDiagramView(name) : createNamedDiagramView(name)
    if (!accepted) return
    markBrowserSchemaStatusEligible()
    revealPreviewTargetDocumentSource()
    diagramViewDialog.completeSave(draft, true)
  } finally {
    diagramViewDialog.completeSave(draft, false)
  }
}
const importCopy = {
  pgml: { conflict: 'Choose either pasted PGML text or a file upload, not both.', missing: 'Paste PGML text or choose a PGML file before importing.', failure: 'Unable to import that PGML document.' },
  dbml: { conflict: buildPgmlImportDbmlConflictMessage(), missing: buildPgmlImportDbmlMissingInputMessage(), failure: buildPgmlImportDbmlFailureMessage() },
  pg_dump: { conflict: buildPgmlImportConflictMessage(), missing: buildPgmlImportMissingInputMessage(), failure: buildPgmlImportFailureMessage() }
}
const cancelImportIntent = () => {
  const intent = importLoadIntent
  importLoadIntent = null
  if (intent !== null) studioSessionStore.cancelWorkspaceLoad(intent)
}
watch(() => studioSessionStore.workspaceLoadRevision, () => {
  if (importLoadIntent !== null && !studioSessionStore.ownsWorkspaceLoad(importLoadIntent)) {
    importLoadIntent = null
    schemaImport.discard()
  }
}, { flush: 'sync' })
onScopeDispose(cancelImportIntent)
const editImportInput = (patch: Partial<WorkspaceImportInput>) => {
  schemaImport.edit(draft => ({ ...draft, ...patch }))
  const draft = schemaImport.draft.value
  if (draft !== null && draft.file !== null && draft.text.trim().length > 0) schemaImport.setError(importCopy[draft.kind].conflict)
}
const editImportDbml = (patch: Partial<Omit<Extract<WorkspaceImportDraft, { kind: 'dbml' }>, 'kind'>>) => {
  schemaImport.edit(draft => draft.kind === 'dbml' ? { ...draft, ...patch } : draft)
}
const editImportDump = (patch: Partial<Omit<Extract<WorkspaceImportDraft, { kind: 'pg_dump' }>, 'kind'>>) => {
  schemaImport.edit(draft => draft.kind === 'pg_dump' ? { ...draft, ...patch } : draft)
}
const getPreferredImportBaseVersionId = () => versionHistoryItems.value.find(version => version.isWorkspaceBase)?.id
  || latestImplementationVersion.value?.id || latestVersionId.value || null
const openSchemaImport = (kind: WorkspaceImportDraft['kind']) => {
  if (schemaImport.isBusy.value) return
  if (kind !== 'pgml' && versions.value.length === 0) {
    toast.add({ title: 'Checkpoint required', description: buildPgmlImportCheckpointRequiredDescription(), color: 'error', icon: 'i-lucide-circle-alert' })
    return
  }
  cancelImportIntent()
  const input = { text: '', file: null }
  if (kind === 'pgml') schemaImport.open({ ...input, kind })
  else if (kind === 'dbml') schemaImport.open({ ...input, kind, baseVersionId: getPreferredImportBaseVersionId(), foldIdentifiersToLowercase: false, parseExecutableComments: false })
  else schemaImport.open({ ...input, kind, baseVersionId: getPreferredImportBaseVersionId(), foldIdentifiersToLowercase: false, retainMatchingTableGroups: true })
}
const openImportPgmlDialog = () => openSchemaImport('pgml')
const openImportDbmlDialog = () => openSchemaImport('dbml')
const openImportDumpDialog = () => openSchemaImport('pg_dump')
const closeSchemaImport = (open: boolean) => {
  if (open || schemaImport.isBusy.value) return
  cancelImportIntent()
  schemaImport.close()
}
const handleImportPgmlDialogOpenChange = closeSchemaImport
const handleImportDbmlDialogOpenChange = closeSchemaImport
const handleImportDumpDialogOpenChange = closeSchemaImport
const setImportPgmlText = (text: string) => editImportInput({ text })
const setImportDbmlText = (text: string) => editImportInput({ text })
const setImportDumpText = (text: string) => editImportInput({ text })
const setImportPgmlFile = (files: FileList | null) => editImportInput({ file: files === null ? null : files.item(0) })
const setImportDbmlFile = setImportPgmlFile
const setImportDumpFile = setImportPgmlFile
const clearImportPgmlFile = () => editImportInput({ file: null })
const clearImportDbmlFile = clearImportPgmlFile
const clearImportDumpFile = clearImportPgmlFile
const closeImportExecutableAttachmentResolution = () => {
  if (schemaImport.isBusy.value) return
  cancelImportIntent()
  schemaImport.back()
}
const handleImportExecutableAttachmentResolutionOpenChange = (open: boolean) => {
  if (!open) closeImportExecutableAttachmentResolution()
}
const toggleImportExecutableAttachmentCandidateTable = (candidateId: string, tableId: string) => {
  schemaImport.editPlacement(resolution => ({ ...resolution, candidates: resolution.candidates.map(candidate => candidate.id !== candidateId
    ? candidate
    : {
        ...candidate, selectedTableIds: candidate.selectedTableIds.includes(tableId) ? candidate.selectedTableIds.filter(value => value !== tableId) : [...candidate.selectedTableIds, tableId]
      }) }))
}
const clearImportExecutableAttachmentCandidateTables = (candidateId: string) => {
  schemaImport.editPlacement(resolution => ({ ...resolution, candidates: resolution.candidates.map(candidate => candidate.id === candidateId ? { ...candidate, selectedTableIds: [] } : candidate) }))
}
const commitImportedSchema = (input: ImportExecutableAttachmentResolution) => {
  if (!replaceWorkspaceFromImportedSnapshot({ basedOnVersionId: input.basedOnVersionId, includeLayout: true, source: input.pgml })) throw new Error('The selected base version no longer exists.')
  markBrowserSchemaStatusEligible()
  requestCanvasViewportReset()
  toast.add({ title: 'Workspace replaced', description: buildPgmlImportSuccessDescription(), color: 'success', icon: 'i-lucide-check' })
}
const getActionErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim().length > 0) return error.message
  if (typeof error === 'string' && error.trim().length > 0) return error
  return fallback
}
const submitSchemaImport = async (kind: WorkspaceImportDraft['kind']) => {
  const current = schemaImport.draft.value
  if (current === null || current.kind !== kind) return
  if (current.kind !== 'pgml' && current.baseVersionId === null) {
    schemaImport.setError(buildPgmlImportBaseRequiredMessage())
    return
  }
  const request = schemaImport.begin(importCopy[kind])
  if (request === null) return
  const draft = request.draft
  const baseDocument = versionDocument.value
  const baseSource = draft.kind === 'pg_dump' ? versions.value.find(version => version.id === draft.baseVersionId)?.snapshot.source : null
  const intent = studioSessionStore.beginWorkspaceLoad(currentPersistenceSource.value)
  importLoadIntent = intent
  const owns = () => schemaImport.owns(request) && studioSessionStore.ownsWorkspaceLoad(intent)
  try {
    const text = draft.file === null ? draft.text : await draft.file.text()
    if (!owns()) return
    if (draft.kind === 'pgml') {
      const next = appendPgmlDocumentImport(baseDocument, parsePgmlDocument(text))
      studioSessionStore.commitWorkspaceLoad(intent, () => {
        loadPreparedDocument(next)
        markBrowserSchemaStatusEligible()
        requestCanvasViewportReset()
        schemaImport.complete(request)
        toast.add({ title: 'PGML appended', description: 'The imported PGML history was appended and its workspace is now the current draft.', color: 'success', icon: 'i-lucide-check' })
      })
      importLoadIntent = null
      return
    }
    const imported = draft.kind === 'dbml'
      ? convertDbmlToPgml({ dbml: text, foldIdentifiersToLowercase: draft.foldIdentifiersToLowercase, parseExecutableComments: draft.parseExecutableComments, preferredName: draft.file?.name })
      : convertPgDumpToPgml({ sql: text, foldIdentifiersToLowercase: draft.foldIdentifiersToLowercase, preferredName: draft.file?.name })
    let pgml = imported.pgml
    if (draft.kind === 'pg_dump' && draft.retainMatchingTableGroups) {
      if (!baseSource) throw new Error('The selected base version no longer exists.')
      pgml = retainPgmlTableGroupsFromBaseSource({ baseSource, importedSource: pgml })
    }
    if (draft.baseVersionId === null || !versions.value.some(version => version.id === draft.baseVersionId)) throw new Error('The selected base version no longer exists.')
    const prepared = prepareImportedExecutableAttachments(pgml)
    const resolution = { ...prepared, basedOnVersionId: draft.baseVersionId, kind: draft.kind }
    if (prepared.candidates.length > 0) {
      schemaImport.place(request, resolution)
      return
    }
    studioSessionStore.commitWorkspaceLoad(intent, () => {
      commitImportedSchema(resolution)
      schemaImport.complete(request)
    })
    importLoadIntent = null
  } catch (error) {
    if (owns()) {
      schemaImport.fail(request, getActionErrorMessage(error, importCopy[kind].failure))
      cancelImportIntent()
    }
  }
}
const submitImportPgml = () => submitSchemaImport('pgml')
const submitImportDbml = () => submitSchemaImport('dbml')
const submitImportDump = () => submitSchemaImport('pg_dump')
const confirmImportExecutableAttachmentResolution = () => {
  const request = schemaImport.beginApply()
  if (request === null || request.kind !== 'applying') return
  const intent = importLoadIntent === null ? studioSessionStore.beginWorkspaceLoad(currentPersistenceSource.value) : importLoadIntent
  importLoadIntent = intent
  try {
    if (!studioSessionStore.ownsWorkspaceLoad(intent)) return
    const resolution = request.placement
    const pgml = applyImportedExecutableAttachmentSelections(resolution.pgml, resolution.candidates)
    studioSessionStore.commitWorkspaceLoad(intent, () => {
      commitImportedSchema({ ...resolution, pgml })
      schemaImport.complete(request)
    })
    importLoadIntent = null
  } catch (error) {
    schemaImport.fail(request, getActionErrorMessage(error, buildPgmlImportFailureMessage()))
    cancelImportIntent()
  }
}
const viewVersionTarget = (targetId: string) => {
  setPreviewTarget(targetId === 'workspace' ? 'workspace' : targetId)
  requestCanvasViewportReset()
}
const restoreVersionToWorkspace = (versionId: string) => {
  const version = versions.value.find(entry => entry.id === versionId)
  if (version) restoreVersionDialog.open({ versionId, label: getVersionLabel(version) })
}
const confirmDeleteVersion = () => {
  const targetVersion = deleteVersionCandidate.value
  if (!targetVersion || !targetVersion.canDelete) return
  const draft = deleteVersionDialog.beginSave()
  if (draft === null) return
  try {
    if (!deleteVersion(draft.versionId)) return
    markBrowserSchemaStatusEligible()
    requestCanvasViewportReset()
    deleteVersionDialog.completeSave(draft, true)
    toast.add({ title: 'Version deleted', description: buildPgmlDeleteVersionSuccessDescription(draft.label), color: 'success', icon: 'i-lucide-check' })
  } finally {
    deleteVersionDialog.completeSave(draft, false)
  }
}
const confirmRestoreVersionToWorkspace = () => {
  const draft = restoreVersionDialog.beginSave()
  if (draft === null) return
  try {
    if (!replaceWorkspaceFromVersion(draft.versionId)) return
    markBrowserSchemaStatusEligible()
    requestCanvasViewportReset()
    restoreVersionDialog.completeSave(draft, true)
    toast.add({ title: 'Workspace restored', description: buildPgmlRestoreSuccessDescription(), color: 'success', icon: 'i-lucide-check' })
  } finally {
    restoreVersionDialog.completeSave(draft, false)
  }
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
      description: `${compareComparisonLabel.value} now compares the selected base and target while keeping its saved exclusions, entity kinds, note flags, notes, and noise filters.`,
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
const updateVersionCompareEntityFilters = (value: PgmlCompareEntityFilters) => {
  const didUpdate = setCurrentCompareEntityFilters(value)

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
  setEditorMode(normalizeVersionedEditorMode(value))
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
          disabled: workspaceMode === 'diagram' || isNavigatingWorkspace.value,
          onSelect: () => {
            void navigateToWorkspaceMode('diagram')
          }
        },
        {
          label: 'Analysis',
          icon: 'i-lucide-scan-search',
          disabled: workspaceMode === 'analysis' || isNavigatingWorkspace.value,
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
              studioSessionStore.openLoadDialog()
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
            label: 'Import PGML document',
            icon: 'i-lucide-file-code-2',
            onSelect: openImportPgmlDialog
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

const canOpenStructuredEditor = () => workspacePersistenceActive.value && isWorkspacePreview.value && isWorkspaceModelCurrent.value && !workspaceHasBlockingSourceErrors.value && !studioSessionStore.isWorkspaceLoading && getLiveWorkspaceSource() === source.value

const openTableEditor = (tableId: string) => {
  if (!canOpenStructuredEditor()) {
    return
  }

  const table = workspaceParsedModel.value.tables.find(candidate => candidate.fullName === tableId)

  if (!table) {
    return
  }

  tableEditor.open(cloneEditableTableDraft(createEditableTableDraft(table)))
}

const openTableCreator = (groupName: string | null) => {
  if (!canOpenStructuredEditor()) {
    return
  }

  tableEditor.open(createEditableTableDraftForGroup(groupName))
}

const openGroupEditor = (groupName: string) => {
  if (!canOpenStructuredEditor()) {
    return
  }

  const group = workspaceParsedModel.value.groups.find(candidate => candidate.name === groupName)

  if (!group) {
    return
  }

  groupEditor.open(cloneEditableGroupDraft(createEditableGroupDraft(group, workspaceParsedModel.value)))
}

const openGroupCreator = () => {
  if (!canOpenStructuredEditor()) {
    return
  }

  groupEditor.open(createEditableGroupDraftForCreate())
}

const closeTableEditor = () => tableEditor.close()
const closeGroupEditor = () => groupEditor.close()
const handleTableEditorAfterLeave = () => tableEditor.afterLeave()
const handleGroupEditorAfterLeave = () => groupEditor.afterLeave()

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
  if (!isWorkspacePreview.value || tableEditorErrors.value.length > 0) return
  const documentRevision = studioSessionStore.workspaceLoadRevision
  const draft = tableEditor.beginSave()
  if (draft === null) return
  let accepted = false
  try {
    await flushPendingEditorChanges({ waitForAnalysis: true })
    if (!workspacePersistenceActive.value || !isSavingTableEditor.value || !isWorkspaceModelCurrent.value || studioSessionStore.isWorkspaceLoading || studioSessionStore.workspaceLoadRevision !== documentRevision || tableEditorDraft.value !== draft) return
    const previousTableId = draft.originalFullName
    markBrowserSchemaStatusEligible()
    source.value = applyEditableTableDraftToSource(getLiveWorkspaceSource(), workspaceParsedModel.value, draft)
    persistTableDraftSchemaMetadata(draft, previousTableId)
    accepted = true
  } finally {
    tableEditor.completeSave(draft, accepted)
  }
}
const saveGroupEditor = async () => {
  if (!isWorkspacePreview.value || groupEditorErrors.value.length > 0) return
  const documentRevision = studioSessionStore.workspaceLoadRevision
  const draft = groupEditor.beginSave()
  if (draft === null) return
  let accepted = false
  try {
    await flushPendingEditorChanges({ waitForAnalysis: true })
    if (!workspacePersistenceActive.value || !isSavingGroupEditor.value || !isWorkspaceModelCurrent.value || studioSessionStore.isWorkspaceLoading || studioSessionStore.workspaceLoadRevision !== documentRevision || groupEditorDraft.value !== draft) return
    markBrowserSchemaStatusEligible()
    source.value = applyEditableGroupDraftToSource(getLiveWorkspaceSource(), workspaceParsedModel.value, draft)
    accepted = true
  } finally {
    groupEditor.completeSave(draft, accepted)
  }
}

const runExport = async (format: 'svg' | 'png', scaleFactor?: number) => {
  const canvas = canvasRef.value
  if (canvas === null || diagramExport.value.kind !== 'idle' || !workspacePersistenceActive.value) return
  const request: DiagramExportState = { kind: 'exporting', canvas, format, scaleFactor, documentRevision: studioSessionStore.workspaceDocumentRevision }
  diagramExport.value = request
  try {
    await flushPendingEditorChanges({ waitForAnalysis: true })
    if (diagramExport.value !== request || !workspacePersistenceActive.value || canvasRef.value !== canvas || studioSessionStore.workspaceDocumentRevision !== request.documentRevision) return
    await canvas.exportDiagram(request.format, request.scaleFactor)
  } catch (error) {
    if (diagramExport.value === request) toast.add({ title: 'Export failed', description: getActionErrorMessage(error, 'Unable to export the diagram.'), color: 'error', icon: 'i-lucide-circle-alert' })
  } finally {
    if (diagramExport.value === request) diagramExport.value = { kind: 'idle' }
  }
}

const requestDiagramExport = (request: DiagramExportRequest) => runExport(request.format, request.format === 'png' ? request.scaleFactor : undefined)

const handleCanvasFocusSource = async (sourceRange: PgmlSourceRange) => {
  await flushPendingEditorChanges()

  if (versionedEditorMode.value === 'document') {
    setEditorMode('head')
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
  if (!canOpenStructuredEditor()) {
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
const closeCompareSourceDialog = () => compareSourceDialog.close()
const handleAnalysisCompareFocusSource = (range: PgmlSourceRange) => {
  const entry = analysisSelectedCompareEntry.value
  const removed = entry !== null && entry.changeKind === 'removed'
  compareSourceDialog.open({ range: { ...range }, source: removed ? compareBaseSource.value : compareTargetSource.value,
    versionLabel: removed ? compareBaseLabel.value : compareTargetLabel.value, entryLabel: entry === null ? null : entry.label })
}
const handleAnalysisCompareFocusTarget = (_entryId: string) => {
}

const canPublishWorkspaceChrome = computed(() => workspacePersistenceActive.value && workspaceNavigation.value.kind !== 'navigating')
watchEffect(() => {
  if (!canPublishWorkspaceChrome.value) return
  setStudioHeaderActions({
    isLoading: isExporting.value,
    menus: actionMenus.value
  })
})

watchEffect(() => {
  if (!canPublishWorkspaceChrome.value) return
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

  workspaceLifetime.value = 'leaving'
  clearStudioHeaderActions()
  clearStudioSchemaStatus()
  studioSessionStore.resetStudioUiState()
  resetStudioWorkspaceState()
})

onBeforeUnmount(() => {
  workspaceNavigation.value = { kind: 'disposed' }
  diagramExport.value = { kind: 'disposed' }
  workspaceLifetime.value = 'disposed'
  workspaceLaunchState.value = { kind: 'disposed' }
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<template>
  <div class="relative h-full min-h-0">
    <div
      v-if="isOpeningPgmlDocument"
      data-pgml-open-loading="true"
      class="absolute inset-0 z-40 grid place-items-center bg-[color:var(--studio-shell-bg)]/88 backdrop-blur-sm"
    >
      <div class="flex items-center gap-2 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-2 text-[0.72rem] font-medium text-[color:var(--studio-shell-text)] shadow-sm">
        <UIcon
          name="i-lucide-loader-circle"
          class="h-4 w-4 animate-spin text-[color:var(--studio-shell-label)]"
        />
        <span>Opening PGML...</span>
      </div>
    </div>

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
            :can-edit-detail-source="isWorkspacePreview && isWorkspaceModelCurrent && !workspaceHasBlockingSourceErrors && !studioSessionStore.isWorkspaceLoading"
            :compare-base-label="compareBaseLabel"
            :compare-base-model="compareBaseModel"
            :compare-comparison-items="comparisonItems"
            :compare-entries="compareEntries"
            :compare-excluded-labels="activeCompareExclusionVisibleLabels"
            :compare-excluded-summary="activeCompareExclusionSummary"
            :compare-entity-filters="activeCompareEntityFilters"
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
            :document-context-revision="studioSessionStore.workspaceDocumentRevision"
            :load-intent-revision="studioSessionStore.workspaceLoadRevision"
            :model-is-current="!isWorkspacePreview || (isWorkspaceModelCurrent && !workspaceHasBlockingSourceErrors)"
            :export-base-name="exportBaseName"
            :export-in-progress="isExporting"
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
            @export-diagram="requestDiagramExport"
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
            @update-compare-entity-filters="updateVersionCompareEntityFilters"
            @update-compare-note-filters="updateVersionCompareNoteFilters"
            @update-compare-noise-filters="updateVersionCompareNoiseFilters"
            @update-diagram-view-settings="updateDiagramViewSettings"
            @update-version-compare-base-id="updateVersionCompareBaseId"
            @update-version-compare-target-id="updateVersionCompareTargetId"
            @version-checkpoint="openCheckpointDialog"
            @version-import-dbml="openImportDbmlDialog"
            @version-import-dump="openImportDumpDialog"
            @version-import-pgml="openImportPgmlDialog"
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
            :document-context-revision="studioSessionStore.workspaceDocumentRevision"
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
            :document-context-revision="studioSessionStore.workspaceDocumentRevision"
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
            :can-edit-detail-source="isWorkspacePreview && isWorkspaceModelCurrent && !workspaceHasBlockingSourceErrors && !studioSessionStore.isWorkspaceLoading"
            :compare-base-label="compareBaseLabel"
            :compare-base-model="compareBaseModel"
            :compare-comparison-items="comparisonItems"
            :compare-entries="compareEntries"
            :compare-excluded-labels="activeCompareExclusionVisibleLabels"
            :compare-excluded-summary="activeCompareExclusionSummary"
            :compare-entity-filters="activeCompareEntityFilters"
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
            :document-context-revision="studioSessionStore.workspaceDocumentRevision"
            :load-intent-revision="studioSessionStore.workspaceLoadRevision"
            :model-is-current="!isWorkspacePreview || (isWorkspaceModelCurrent && !workspaceHasBlockingSourceErrors)"
            :export-base-name="exportBaseName"
            :export-in-progress="isExporting"
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
            @export-diagram="requestDiagramExport"
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
            @update-compare-entity-filters="updateVersionCompareEntityFilters"
            @update-compare-note-filters="updateVersionCompareNoteFilters"
            @update-compare-noise-filters="updateVersionCompareNoiseFilters"
            @update-diagram-view-settings="updateDiagramViewSettings"
            @update-version-compare-base-id="updateVersionCompareBaseId"
            @update-version-compare-target-id="updateVersionCompareTargetId"
            @version-checkpoint="openCheckpointDialog"
            @version-import-dbml="openImportDbmlDialog"
            @version-import-dump="openImportDumpDialog"
            @version-import-pgml="openImportPgmlDialog"
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
          @import-pgml="openImportPgmlDialog"
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
          :compare-entity-filters="activeCompareEntityFilters"
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
          source-action-label="View source"
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
          @update:compare-entity-filters="updateVersionCompareEntityFilters"
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
        :open="checkpointDialogOpen"
        title="Create checkpoint"
        description="Lock the current workspace snapshot as an immutable PGML version."
        surface-id="checkpoint"
        body-class="grid gap-4 px-4 py-3"
        @update:open="checkpointDialog.updateOpen"
        @close="closeCheckpointDialog"
        @after-leave="checkpointDialog.afterLeave"
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
              :model-value="checkpointName"
              placeholder="Checkpoint name"
              color="neutral"
              variant="outline"
              size="sm"
              :ui="studioFieldUi"
              @update:model-value="updateCheckpointName"
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
              @update:model-value="updateCheckpointRole"
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
            :disabled="checkpointName.trim().length === 0 || !canCheckpoint || isSavingCheckpoint"
            :loading="isSavingCheckpoint"
            @click="saveCheckpoint"
          />
        </template>
      </StudioModalFrame>

      <StudioModalFrame
        :open="restoreVersionDialogOpen"
        title="Restore version to workspace"
        description="Replace the current workspace draft with a locked version snapshot."
        surface-id="restore-version"
        body-class="grid gap-4 px-4 py-3"
        @update:open="restoreVersionDialog.updateOpen"
        @close="closeRestoreVersionDialog"
        @after-leave="restoreVersionDialog.afterLeave"
      >
        <div class="grid gap-3">
          <div class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3">
            <div :class="studioFieldKickerClass">
              Selected version
            </div>
            <div class="mt-2 text-[0.85rem] font-semibold text-[color:var(--studio-shell-text)]">
              {{ restoreVersionLabel }}
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
        :open="deleteVersionDialogOpen"
        title="Delete version"
        :description="deleteVersionDialogDescription"
        surface-id="delete-version"
        body-class="grid gap-4 px-4 py-3"
        @update:open="deleteVersionDialog.updateOpen"
        @close="closeDeleteVersionDialog"
        @after-leave="deleteVersionDialog.afterLeave"
      >
        <div class="grid gap-3">
          <div class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3">
            <div :class="studioFieldKickerClass">
              Selected version
            </div>
            <div class="mt-2 text-[0.85rem] font-semibold text-[color:var(--studio-shell-text)]">
              {{ deleteVersionLabel }}
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
        :open="diagramViewDialogOpen"
        :title="diagramViewDialogTitle"
        :description="diagramViewDialogDescription"
        surface-id="diagram-view"
        body-class="grid gap-4 px-4 py-3"
        @update:open="diagramViewDialog.updateOpen"
        @close="closeDiagramViewDialog"
        @after-leave="diagramViewDialog.afterLeave"
      >
        <div class="grid gap-3">
          <label class="grid gap-1">
            <span :class="studioFieldKickerClass">
              View name
            </span>
            <UInput
              :model-value="diagramViewDraftName"
              data-diagram-view-name-input="true"
              placeholder="View name"
              color="neutral"
              variant="outline"
              size="sm"
              :ui="studioFieldUi"
              @update:model-value="diagramViewDialog.updateDraft({ name: String($event) })"
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
        :open="comparisonDialogOpen"
        :title="comparisonDialogTitle"
        :description="comparisonDialogDescription"
        surface-id="compare-comparison"
        body-class="grid gap-4 px-4 py-3"
        @update:open="comparisonDialog.updateOpen"
        @close="closeComparisonDialog"
        @after-leave="comparisonDialog.afterLeave"
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
              :model-value="comparisonDraftName"
              data-compare-comparison-name-input="true"
              placeholder="Comparison name"
              color="neutral"
              variant="outline"
              size="sm"
              :ui="studioFieldUi"
              @update:model-value="comparisonDialog.updateDraft({ name: String($event) })"
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
            :disabled="comparisonNameError !== null || isSavingComparisonDialog"
            :loading="isSavingComparisonDialog"
            @click="saveComparisonDialog"
          />
        </template>
      </StudioModalFrame>

      <StudioModalFrame
        :open="compareNoteDialogOpen"
        :title="compareNoteDialogTitle"
        :description="compareNoteDialogDescription"
        surface-id="compare-note"
        body-class="grid gap-4 px-4 py-3"
        @update:open="compareNoteDialog.updateOpen"
        @close="closeCompareNoteDialog"
        @after-leave="compareNoteDialog.afterLeave"
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
              :model-value="compareNoteDraftFlag"
              :items="compareNoteFlagItems"
              value-key="value"
              label-key="label"
              color="neutral"
              variant="outline"
              size="sm"
              :ui="studioSelectUi"
              @update:model-value="updateCompareNoteFlag"
            />
          </label>

          <label class="grid gap-1">
            <span :class="studioFieldKickerClass">
              Note
            </span>
            <textarea
              :value="compareNoteDraftText"
              data-compare-note-input="true"
              rows="6"
              placeholder="Describe the follow-up or decision for this difference."
              :class="joinStudioClasses(textareaClass, 'min-h-[7rem]')"
              @input="updateCompareNoteText"
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
            :disabled="!canSaveCompareNote || isSavingCompareNote"
            :loading="isSavingCompareNote"
            @click="saveCompareNoteDialog"
          />
        </template>
      </StudioModalFrame>

      <StudioModalFrame
        :open="compareSourceDialogOpen"
        :title="compareSourceDialogTitle"
        :description="compareSourceDialogDescription"
        surface-id="compare-source"
        width-class="max-w-4xl"
        body-class="grid min-h-0 gap-3 px-4 py-3"
        @update:open="compareSourceDialog.updateOpen"
        @close="closeCompareSourceDialog"
        @after-leave="compareSourceDialog.afterLeave"
      >
        <div
          v-if="compareSourceDialogLineLabel"
          class="flex flex-wrap items-center gap-2"
        >
          <span class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
            {{ compareSourceDialogVersionLabel }}
          </span>
          <span class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
            {{ compareSourceDialogLineLabel }}
          </span>
        </div>

        <pre
          data-compare-source-preview="true"
          :class="joinStudioClasses('max-h-[32rem] min-h-[12rem] overflow-auto border border-[color:var(--studio-divider)] bg-[color:var(--studio-shell-bg)]/50 px-3 py-3 font-mono text-[0.68rem] leading-6 text-[color:var(--studio-shell-text)] [tab-size:2]', compareSourceDialogContent ? '' : 'grid place-items-center text-[color:var(--studio-shell-muted)]')"
        >{{ compareSourceDialogContent || 'Source range is no longer available.' }}</pre>

        <template #footer>
          <UButton
            label="Close"
            color="neutral"
            variant="outline"
            :class="secondaryModalButtonClass"
            @click="closeCompareSourceDialog"
          />
        </template>
      </StudioModalFrame>

      <StudioModalFrame
        :open="compareExclusionsDialogOpen"
        title="Manage compare exclusions"
        :description="compareExclusionsDialogDescription"
        surface-id="compare-exclusions"
        body-class="grid min-h-0 gap-4 px-4 py-3"
        @update:open="compareExclusionsDialog.updateOpen"
        @close="closeCompareExclusionsDialog"
        @after-leave="compareExclusionsDialog.afterLeave"
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
              :model-value="compareExclusionsSearchQuery"
              data-compare-exclusions-search="true"
              type="search"
              placeholder="Filter groups, tables, and compare entities"
              :class="joinStudioClasses(studioCompactInputClass, 'w-full')"
              @update:model-value="compareExclusionsDialog.updateDraft({ searchQuery: String($event) })"
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
                <span>{{ item.label }} ({{ item.count }})</span>
              </button>
            </div>
          </div>

          <div class="grid gap-2">
            <div :class="studioFieldKickerClass">
              Exclude from compare
            </div>
            <p :class="studioCompactBodyCopyClass">
              Select a schema or group to exclude its full cluster, pick individual tables inside it, or exclude other comparable entities like indexes, references, types, and executables.
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
                v-if="compareExclusionsShowsSchemaSections"
                data-compare-exclusion-schemas-section="true"
                class="grid min-w-0 gap-2"
              >
                <div :class="studioFieldKickerClass">
                  Schemas
                </div>
                <div class="grid min-w-0 gap-2 sm:grid-cols-2">
                  <button
                    v-for="section in filteredCompareExclusionSchemaSections"
                    :key="section.id"
                    type="button"
                    :data-compare-exclusion-schema-section="section.schemaOption.value"
                    :data-compare-exclusion-option="section.schemaOption.id"
                    :class="getStudioToggleChipClass({
                      active: isCompareExclusionOptionSelected(section.schemaOption),
                      extraClass: compareExclusionChipExtraClass
                    })"
                    :aria-pressed="isCompareExclusionOptionSelected(section.schemaOption)"
                    @click="toggleCompareExclusionOption(section.schemaOption)"
                  >
                    {{ section.schemaOption.label }}
                  </button>
                </div>
              </section>

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
            :loading="isSavingCompareExclusions"
            color="neutral"
            variant="soft"
            :class="primaryModalButtonClass"
            :disabled="!compareExclusionsDraft || isSavingCompareExclusions"
            @click="saveCompareExclusionsDialog"
          />
        </template>
      </StudioModalFrame>

      <StudioModalFrame
        :open="renameVersionDialogOpen"
        title="Rename version"
        :description="renameVersionDialogDescription"
        surface-id="rename-version"
        body-class="grid gap-4 px-4 py-3"
        @update:open="renameVersionDialog.updateOpen"
        @close="closeRenameVersionDialog"
        @after-leave="renameVersionDialog.afterLeave"
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
              :model-value="renameVersionDraftName"
              data-rename-version-name-input="true"
              placeholder="Version name"
              color="neutral"
              variant="outline"
              size="sm"
              :ui="studioFieldUi"
              @update:model-value="renameVersionDialog.updateDraft({ name: String($event) })"
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

      <AppPgmlImportModal
        :open="importPgmlDialogOpen"
        :model-value="importPgmlText"
        :selected-file-name="importPgmlSelectedFileName"
        :error-message="importPgmlError"
        :is-submitting="isSubmittingImportPgml"
        @update:open="handleImportPgmlDialogOpenChange"
        @update:model-value="setImportPgmlText"
        @select-file="setImportPgmlFile"
        @clear-file="clearImportPgmlFile"
        @submit="submitImportPgml"
        @after-leave="schemaImport.afterLeave('pgml')"
      />

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
        @update:fold-identifiers-to-lowercase="editImportDbml({ foldIdentifiersToLowercase: $event })"
        @update:model-value="setImportDbmlText"
        @update:parse-executable-comments="editImportDbml({ parseExecutableComments: $event })"
        @select-file="setImportDbmlFile"
        @clear-file="clearImportDbmlFile"
        @submit="submitImportDbml"
        @after-leave="schemaImport.afterLeave('dbml')"
      >
        <template #before-inputs>
          <div class="grid gap-3">
            <label class="grid gap-1">
              <span :class="studioFieldKickerClass">
                Increment from version
              </span>
              <USelect
                :items="importDumpBaseVersionItems"
                :disabled="schemaImport.isBusy.value"
                :model-value="importDbmlBaseVersionId || undefined"
                value-key="value"
                label-key="label"
                color="neutral"
                variant="outline"
                size="sm"
                :ui="studioSelectUi"
                @update:model-value="editImportDbml({ baseVersionId: typeof $event === 'string' ? $event : null })"
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
        @update:fold-identifiers-to-lowercase="editImportDump({ foldIdentifiersToLowercase: $event })"
        @update:model-value="setImportDumpText"
        @select-file="setImportDumpFile"
        @clear-file="clearImportDumpFile"
        @submit="submitImportDump"
        @after-leave="schemaImport.afterLeave('pg_dump')"
      >
        <template #before-inputs>
          <div class="grid gap-3">
            <label class="grid gap-1">
              <span :class="studioFieldKickerClass">
                Increment from version
              </span>
              <USelect
                :items="importDumpBaseVersionItems"
                :disabled="schemaImport.isBusy.value"
                :model-value="importDumpBaseVersionId || undefined"
                value-key="value"
                label-key="label"
                color="neutral"
                variant="outline"
                size="sm"
                :ui="studioSelectUi"
                @update:model-value="editImportDump({ baseVersionId: typeof $event === 'string' ? $event : null })"
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
                  :disabled="schemaImport.isBusy.value"
                  :model-value="importDumpRetainMatchingTableGroups"
                  color="neutral"
                  :ui="studioSwitchUi"
                  @update:model-value="editImportDump({ retainMatchingTableGroups: $event === true })"
                />
              </div>
            </label>
          </div>
        </template>
      </AppPgDumpImportModal>

      <StudioModalFrame
        :open="schemaImport.isPlacing.value"
        :title="importExecutableAttachmentResolutionTitle"
        :description="importExecutableAttachmentResolutionDescription"
        surface-id="import-executable-attachments"
        body-class="grid min-h-0 gap-4 px-4 py-3"
        width-class="max-w-4xl"
        @update:open="handleImportExecutableAttachmentResolutionOpenChange"
        @after-leave="schemaImport.afterLeave('placement')"
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
        :open="schemaDialogOpen"
        :title="schemaActionTitle"
        :description="schemaActionDescriptionText"
        surface-id="schema"
        body-class="grid gap-4 px-4 py-3"
        @update:open="studioSessionStore.updateSchemaDialogOpen"
      >
        <div class="grid gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div class="grid gap-3">
            <label
              v-if="currentPersistenceSource === 'browser' && schemaDialogName !== null"
              class="grid gap-1"
            >
              <span :class="studioFieldKickerClass">
                Schema Name
              </span>
              <UInput
                :model-value="schemaDialogName"
                placeholder="Schema name"
                color="neutral"
                variant="outline"
                size="sm"
                :ui="studioFieldUi"
                @update:model-value="updateSchemaDialogName"
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
            @click="studioSessionStore.closeSchemaDialog()"
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
        :open="loadDialogOpen"
        :title="loadDialogTitle"
        :description="loadDialogDescription"
        surface-id="load"
        body-class="max-h-[min(60vh,36rem)] overflow-y-auto px-4 py-3"
        @update:open="studioSessionStore.updateLoadDialogOpen"
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
            @click="studioSessionStore.closeLoadDialog()"
          />
        </template>
      </StudioModalFrame>

      <StudioModalFrame
        :open="tableEditorOpen"
        :title="tableEditorTitle"
        :description="tableEditorDescription"
        surface-id="table-editor"
        width-class="max-w-5xl"
        body-class="grid max-h-[min(74vh,52rem)] gap-5 overflow-y-auto px-4 py-4"
        @update:open="tableEditor.updateOpen"
        @after-leave="handleTableEditorAfterLeave"
      >
        <div
          v-if="tableEditorDraft"
          :inert="isSavingTableEditor"
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
            :disabled="tableEditorErrors.length > 0 || isSavingTableEditor"
            :loading="isSavingTableEditor"
            @click="saveTableEditor"
          />
        </template>
      </StudioModalFrame>

      <StudioModalFrame
        :open="groupEditorOpen"
        :title="groupEditorTitle"
        :description="groupEditorDescription"
        surface-id="group-editor"
        body-class="grid max-h-[min(60vh,32rem)] gap-5 overflow-y-auto px-4 py-4"
        @update:open="groupEditor.updateOpen"
        @after-leave="handleGroupEditorAfterLeave"
      >
        <div
          v-if="groupEditorDraft"
          :inert="isSavingGroupEditor"
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
            :disabled="groupEditorErrors.length > 0 || isSavingGroupEditor"
            :loading="isSavingGroupEditor"
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
