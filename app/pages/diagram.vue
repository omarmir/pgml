<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Ref } from 'vue'
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
import PgmlDiagramCanvas from '~/components/pgml/PgmlDiagramCanvas.vue'
import StudioDesktopWorkspace from '~/components/studio/StudioDesktopWorkspace.vue'
import StudioEditorSurface from '~/components/studio/StudioEditorSurface.vue'
import StudioMobileWorkspace from '~/components/studio/StudioMobileWorkspace.vue'
import { usePgmlColumnDefaultSuggestions } from '~/composables/usePgmlColumnDefaultSuggestions'
import { usePgmlStudioComputerFiles } from '~/composables/usePgmlStudioComputerFiles'
import {
  usePgmlStudioVersionHistory,
  type PgmlVersionedDocumentEditorMode
} from '~/composables/usePgmlStudioVersionHistory'
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
  getStudioLaunchRequestKey,
  parseStudioLaunchQuery
} from '~/utils/studio-launch'
import { diffPgmlSchemaModels } from '~/utils/pgml-diff'
import { convertPgDumpToPgml } from '~/utils/pg-dump-import'
import { analyzePgmlDocument } from '~/utils/pgml-language'
import { buildPgmlMigrationDiffBundle } from '~/utils/pgml-migration-diff'
import {
  buildPgmlVersionDiffSections,
  type PgmlVersionDiffSection
} from '~/utils/pgml-version-summary'
import { buildPgmlCheckpointName } from '~/utils/pgml-document'
import {
  buildPgmlWithNodeProperties,
  parsePgml,
  pgmlExample,
  stripPgmlPropertiesBlocks,
  type PgmlNodeProperties,
  type PgmlSourceRange
} from '~/utils/pgml'
import {
  applyEditableGroupDraftToSource,
  applyEditableTableDraftToSource,
  cloneEditableGroupDraft,
  cloneEditableTableDraft,
  commonPgmlColumnTypes,
  createEditableGroupDraft,
  createEditableGroupDraftForCreate,
  createEditableTableDraft,
  createEditableTableDraftForGroup,
  getEditableGroupDraftErrors,
  getEditableTableDraftErrors,
  type PgmlEditableGroupDraft,
  type PgmlEditableTableDraft
} from '~/utils/pgml-table-editor'
import {
  getStudioChoiceButtonClass,
  studioPersistentSelectMenuProps,
  getStudioSelectMenuSearchInputProps,
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
  type StudioMobileCanvasView,
  type StudioMobileWorkspaceView
} from '~/utils/studio-workspace'

definePageMeta({
  layout: 'studio',
  middleware: 'require-studio-launch'
})

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

const defaultReferenceActionSelectValue = '__pgml_default_reference_action__'

const beginnerFriendlyColumnTypePresets: Record<string, Omit<ReferenceTargetItem, 'value'>> = {
  bigint: {
    label: 'Large whole number',
    description: 'For large counts and identifiers. Exact type: bigint.'
  },
  bigserial: {
    label: 'Auto-incrementing large number',
    description: 'Good for generated primary keys that may grow large. Exact type: bigserial.'
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
  serial: {
    label: 'Auto-incrementing number',
    description: 'Generated integer ID. Exact type: serial.'
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

const source: Ref<string> = ref(pgmlExample)
const editorDisplaySource: Ref<string> = ref(pgmlExample)
const canvasRef: Ref<PgmlDiagramCanvasExposed | null> = ref(null)
const canvasViewportResetKey: Ref<number> = ref(0)
const isExporting: Ref<boolean> = ref(false)
const versionDocumentName: Ref<string> = ref('Untitled schema')
const mobileWorkspaceView: Ref<StudioMobileWorkspaceView> = ref('diagram')
const mobilePanelTab: Ref<DiagramPanelTab> = ref(defaultStudioMobilePanelTab)
const checkpointDialogOpen: Ref<boolean> = ref(false)
const checkpointName: Ref<string> = ref('')
const checkpointSuggestedCreatedAt: Ref<string | null> = ref(null)
const checkpointNameIsSuggested: Ref<boolean> = ref(false)
const checkpointRole: Ref<'design' | 'implementation'> = ref('design')
const importDumpDialogOpen: Ref<boolean> = ref(false)
const importDumpBaseVersionId: Ref<string | null> = ref(null)
const importDumpError: Ref<string | null> = ref(null)
const importDumpSelectedFile: Ref<File | null> = ref(null)
const importDumpText: Ref<string> = ref('')
const isSubmittingImportDump: Ref<boolean> = ref(false)
const restoreVersionDialogOpen: Ref<boolean> = ref(false)
const restoreVersionId: Ref<string | null> = ref(null)
const importDumpConflictErrorMessage = 'Choose either pasted pg_dump text or a file upload, not both.'
const importDumpMissingInputErrorMessage = 'Paste pg_dump text or choose a text dump file before importing.'
const tableEditorDraft: Ref<PgmlEditableTableDraft | null> = ref(null)
const tableEditorOpen: Ref<boolean> = ref(false)
const groupEditorDraft: Ref<PgmlEditableGroupDraft | null> = ref(null)
const groupEditorOpen: Ref<boolean> = ref(false)
const exportScales = [1, 2, 3, 4, 8]
const lastSaveErrorToastMessage: Ref<string | null> = ref(null)
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
const route = useRoute()
const studioLaunchRequest = computed(() => parseStudioLaunchQuery(route.query))
currentPersistenceSource.value = studioLaunchRequest.value?.source === 'file' ? 'file' : 'browser'
const {
  compareBaseId: versionCompareBaseId,
  compareBaseSource,
  compareTargetId: versionCompareTargetId,
  compareTargetSource,
  canCheckpoint,
  createCheckpoint: createVersionCheckpoint,
  document: versionDocument,
  editorMode: versionedEditorMode,
  isWorkspacePreview,
  loadDocument: loadVersionedDocument,
  previewSource,
  previewTargetId,
  replaceWorkspaceFromImportedSnapshot,
  replaceWorkspaceFromVersion,
  serializeCurrentDocument,
  setCompareTargets,
  setPreviewTarget,
  versionItems: versionHistoryItems,
  versionedDocumentSource,
  versions
} = usePgmlStudioVersionHistory({
  documentName: computed(() => versionDocumentName.value),
  source
})
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
const workspaceSourceAnalysis = computed(() => analyzePgmlDocument(source.value))
const previewSourceAnalysis = computed(() => analyzePgmlDocument(previewSource.value))
const sourceDiagnostics = computed(() => {
  if (versionedEditorMode.value === 'document') {
    return []
  }

  return previewSourceAnalysis.value.diagnostics
})
const sourceErrorDiagnostics = computed(() => {
  return sourceDiagnostics.value.filter(diagnostic => diagnostic.severity === 'error')
})
const sourceWarningDiagnostics = computed(() => {
  return sourceDiagnostics.value.filter(diagnostic => diagnostic.severity === 'warning')
})
const visibleSourceDiagnostics = computed(() => sourceDiagnostics.value.slice(0, 6))
const hasBlockingSourceErrors = computed(() => sourceErrorDiagnostics.value.length > 0)
const workspaceHasBlockingSourceErrors = computed(() => {
  return workspaceSourceAnalysis.value.diagnostics.some(diagnostic => diagnostic.severity === 'error')
})
const parsedModel = computed(() => parsePgml(previewSource.value))
const workspaceParsedModel = computed(() => parsePgml(source.value))
const canEmbedLayout = computed(() => !workspaceHasBlockingSourceErrors.value)
const isEditorReadOnly = computed(() => {
  return versionedEditorMode.value === 'document' || !isWorkspacePreview.value
})
const editorReadOnlyLabel = computed(() => {
  if (versionedEditorMode.value === 'document') {
    return 'Document view'
  }

  if (!isWorkspacePreview.value) {
    return 'Version preview'
  }

  return 'Read only'
})
const editorModeDescription = computed(() => {
  if (versionedEditorMode.value === 'document') {
    return 'Showing the full VersionSet document, including locked checkpoints and workspace metadata.'
  }

  if (!isWorkspacePreview.value) {
    const previewVersion = versions.value.find(version => version.id === previewTargetId.value) || null
    const previewLabel = previewVersion ? getVersionLabel(previewVersion) : 'the selected version'

    return `Showing ${previewLabel} as a locked snapshot preview. Restore it to the workspace if you want to edit from it.`
  }

  return 'Editing the current workspace snapshot. Checkpoint it when you want to lock a version into the history.'
})
const displayedEditorSource = computed(() => {
  return versionedEditorMode.value === 'document'
    ? versionedDocumentSource.value
    : previewSource.value
})
const importDumpSelectedFileName = computed(() => importDumpSelectedFile.value?.name || '')
const mobileCanvasView = computed<StudioMobileCanvasView>(() => {
  return mobileWorkspaceView.value === 'panel' ? 'panel' : 'diagram'
})
const assignEditorRef = (value: unknown) => {
  editorRef.value = value as PgmlSourceEditorHandle | null
}
const assignLayoutShellRef = (value: unknown) => {
  layoutShellRef.value = value instanceof HTMLDivElement ? value : null
}

const buildSchemaText = (includeLayout: boolean) => {
  const shouldIncludeLayout = includeLayout && canEmbedLayout.value && canvasRef.value !== null

  return serializeCurrentDocument(shouldIncludeLayout)
}

const syncSourceWithNodeProperties = (nodeProperties: Record<string, PgmlNodeProperties>) => {
  if (!isWorkspacePreview.value || workspaceHasBlockingSourceErrors.value) {
    return
  }

  const nextSource = buildPgmlWithNodeProperties(
    stripPgmlPropertiesBlocks(source.value),
    nodeProperties
  )

  if (nextSource === source.value) {
    return
  }

  source.value = nextSource
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
  buildSchemaText,
  canEmbedLayout,
  initialSource: versionedDocumentSource.value,
  restoreLatestOnSetup: studioLaunchRequest.value === null,
  source
})
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

const loadExample = withViewportReset(loadStudioExample)
const clearSchema = withViewportReset(clearStudioSchema)

const loadSavedSchema = (schema: SavedPgmlSchema) => {
  currentPersistenceSource.value = 'browser'
  loadStudioSavedSchema(schema)
  requestCanvasViewportReset()
}

const loadRecentComputerFile = async (recentFileId: string) => {
  const didLoadRecentFile = await loadRecentComputerFileById(recentFileId)

  if (!didLoadRecentFile) {
    return
  }

  currentPersistenceSource.value = 'file'
  loadDialogOpen.value = false
  requestCanvasViewportReset()
}

const chooseComputerFileFromLoadDialog = async () => {
  const didOpenComputerFile = await openComputerFileFromPicker()

  if (!didOpenComputerFile) {
    return
  }

  currentPersistenceSource.value = 'file'
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
  return currentPersistenceSource.value === 'file'
    ? (currentComputerFileName.value || 'Untitled schema')
    : currentSchemaName.value
})
const activeSchemaUpdatedAt = computed(() => {
  return currentPersistenceSource.value === 'file'
    ? currentComputerFileUpdatedAt.value
    : currentSchemaUpdatedAt.value
})
const activeSaveError = computed(() => {
  return currentPersistenceSource.value === 'file'
    ? computerFileSaveError.value
    : localStorageSaveError.value
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
  return currentPersistenceSource.value === 'file'
    ? 'Saved to the selected file.'
    : 'Saved to browser local storage.'
}
const activeIsSaving = computed(() => {
  return currentPersistenceSource.value === 'file'
    ? isSavingToComputerFile.value
    : isSavingToLocalStorage.value
})
const activeHasPendingChanges = computed(() => {
  return currentPersistenceSource.value === 'file'
    ? hasPendingComputerFileChanges.value
    : hasPendingLocalChanges.value
})
const activeIsSaved = computed(() => {
  return currentPersistenceSource.value === 'file'
    ? isSavedToComputerFile.value
    : isSavedToLocalStorage.value
})
const activeHasSavedInSession = computed(() => {
  return currentPersistenceSource.value === 'file'
    ? hasSavedComputerFileInSession.value
    : hasSavedSchemaInSession.value
})
const activeSavedAtFormatter = computed(() => {
  return currentPersistenceSource.value === 'file' ? formatComputerFileSavedAt : formatSavedAt
})
const saveDialogActionLabel = computed(() => {
  return currentPersistenceSource.value === 'file' ? 'Save to file' : saveSchemaActionLabel.value
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
        ? 'Save the current PGML back to the selected `.pgml` file on your computer and optionally embed the current canvas layout.'
        : 'Mobile Chrome requires explicit saves for `.pgml` files, so use Save to write the current PGML back to the selected file and optionally embed the current canvas layout.'
      : passiveComputerFileWritesSupported.value
        ? 'The current PGML has a parse error, so only the raw text can be written back to the selected file right now.'
        : 'Mobile Chrome requires explicit saves for `.pgml` files, and the current PGML has a parse error, so only the raw text can be written back to the selected file right now.'
  }

  return schemaActionDescription.value
})
const loadDialogTitle = computed(() => {
  return currentPersistenceSource.value === 'file' ? 'Open file' : 'Load saved schema'
})
const loadDialogDescription = computed(() => {
  return currentPersistenceSource.value === 'file'
    ? 'Recent `.pgml` files you opened or created on this computer.'
    : 'Saved PGML files stored in this browser.'
})
const exportBaseName = computed(() => slugifySchemaName(activeSchemaName.value))
const exportPreferenceKey = computed(() => `name:${slugifySchemaName(activeSchemaName.value)}`)
const getVersionLabel = (input: {
  id: string
  name: string | null
}) => {
  return input.name && input.name.trim().length > 0 ? input.name : input.id
}
const versionPanelItems = computed(() => {
  return versionHistoryItems.value.map((version) => {
    return {
      createdAt: formatSavedPgmlSchemaTime(version.createdAt),
      id: version.id,
      isWorkspaceBase: version.isWorkspaceBase,
      label: getVersionLabel(version),
      parentVersionId: version.parentVersionId,
      role: version.role
    }
  })
})
const versionCompareOptions = computed(() => {
  return [
    {
      label: 'Current workspace',
      value: 'workspace'
    },
    ...versionHistoryItems.value.map((version) => {
      return {
        label: getVersionLabel(version),
        value: version.id
      }
    })
  ]
})
const importDumpBaseVersionItems = computed<ReferenceTargetItem[]>(() => {
  return versions.value.map((version) => {
    return {
      description: version.parentVersionId
        ? `Continues from ${version.parentVersionId}`
        : 'Root version',
      label: getVersionLabel(version),
      value: version.id
    }
  })
})
const compareDiff = computed(() => {
  return diffPgmlSchemaModels(
    parsePgml(compareBaseSource.value),
    parsePgml(compareTargetSource.value)
  )
})
const versionDiffSections = computed<PgmlVersionDiffSection[]>(() => {
  return buildPgmlVersionDiffSections(compareDiff.value)
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
const workspaceBaseLabel = computed(() => {
  if (!versionDocument.value.workspace.basedOnVersionId) {
    return 'No locked base version yet.'
  }

  const baseVersion = versions.value.find((version) => {
    return version.id === versionDocument.value.workspace.basedOnVersionId
  }) || null

  return baseVersion
    ? `Incrementing from ${getVersionLabel(baseVersion)}.`
    : `Incrementing from ${versionDocument.value.workspace.basedOnVersionId}.`
})
const workspaceStatus = computed(() => {
  if (!canCheckpoint.value) {
    return 'Draft matches the current locked base version.'
  }

  return 'Draft changes are waiting to be checkpointed.'
})
const compareMigrationBundle = computed(() => {
  const migrationBundle = buildPgmlMigrationDiffBundle(
    parsePgml(compareBaseSource.value),
    parsePgml(compareTargetSource.value),
    {
      baseName: `${exportBaseName.value}-${slugifySchemaName(compareBaseLabel.value)}-to-${slugifySchemaName(compareTargetLabel.value)}`
    }
  )

  if (versionCompareBaseId.value !== null) {
    return migrationBundle
  }

  return {
    meta: migrationBundle.meta,
    sql: {
      migration: {
        ...migrationBundle.sql.migration,
        warnings: [
          'No base version is selected. The migration is being generated from an empty schema.',
          ...migrationBundle.sql.migration.warnings
        ]
      }
    }
  }
})
const importDumpDialogCopy = computed(() => {
  const baseVersion = importDumpBaseVersionId.value
    ? versions.value.find(version => version.id === importDumpBaseVersionId.value) || null
    : null
  const baseLabel = baseVersion ? getVersionLabel(baseVersion) : 'the selected version'

  return {
    confirmLabel: 'Replace workspace with import',
    description: `Paste a text pg_dump or upload a text dump file. PGML will convert the dump into schema objects, replace the current workspace snapshot, and set the workspace to increment from ${baseLabel}.`,
    inputDescription: 'Choose exactly one input method. This replaces the current draft workspace but does not create a locked version until you checkpoint it.',
    title: 'Import pg_dump onto a version'
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
const restoreVersionCandidate = computed(() => {
  return restoreVersionId.value
    ? versions.value.find(version => version.id === restoreVersionId.value) || null
    : null
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
      appliedStudioLaunchKey.value = requestKey
      requestCanvasViewportReset()
      return
    }

    const didLoadRecentFile = await loadRecentComputerFileById(request.recentFileId)

    if (!didLoadRecentFile) {
      return
    }

    currentPersistenceSource.value = 'file'
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

const downloadCurrentSchema = () => {
  downloadSchemaText(activeSchemaName.value, buildSchemaText(includeLayoutInSchema.value))
  schemaDialogOpen.value = false
}
const saveCurrentSchema = async () => {
  if (currentPersistenceSource.value === 'file') {
    const didSave = await saveSchemaToComputerFile(includeLayoutInSchema.value)

    if (didSave) {
      schemaDialogOpen.value = false
      pushSaveSuccessToast(getSaveSuccessToastDescription())
    }

    return
  }

  const didSave = await saveSchemaToBrowser()

  if (!didSave) {
    return
  }

  pushSaveSuccessToast(getSaveSuccessToastDescription())
}
const openCheckpointDialog = () => {
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
const closeCheckpointDialog = () => {
  checkpointDialogOpen.value = false
  checkpointSuggestedCreatedAt.value = null
  checkpointNameIsSuggested.value = false
}
const closeRestoreVersionDialog = () => {
  restoreVersionDialogOpen.value = false
  restoreVersionId.value = null
}
const saveCheckpoint = () => {
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
    description: `${getVersionLabel(createdVersion)} is now locked as a ${createdVersion.role} version.`,
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
const syncImportDumpConflictError = () => {
  const hasFile = importDumpSelectedFile.value !== null
  const hasText = importDumpText.value.trim().length > 0

  if (hasFile && hasText) {
    importDumpError.value = importDumpConflictErrorMessage
    return false
  }

  if (importDumpError.value === importDumpConflictErrorMessage) {
    importDumpError.value = null
  }

  return true
}
const resetImportDumpDialog = () => {
  importDumpDialogOpen.value = false
  importDumpError.value = null
  importDumpSelectedFile.value = null
  importDumpText.value = ''
  importDumpBaseVersionId.value = null
}
const openImportDumpDialog = () => {
  if (versions.value.length === 0) {
    toast.add({
      title: 'Checkpoint required',
      description: 'Create a version checkpoint before importing a dump onto this document.',
      color: 'error',
      icon: 'i-lucide-circle-alert'
    })
    return
  }

  importDumpDialogOpen.value = true
  importDumpError.value = null
  importDumpSelectedFile.value = null
  importDumpText.value = ''
  importDumpBaseVersionId.value = versionHistoryItems.value.find(version => version.isWorkspaceBase)?.id
    || versions.value.at(-1)?.id
    || null
}
const closeImportDumpDialog = () => {
  if (isSubmittingImportDump.value) {
    return
  }

  resetImportDumpDialog()
}
const handleImportDumpDialogOpenChange = (nextOpen: boolean) => {
  if (nextOpen) {
    importDumpDialogOpen.value = true
    return
  }

  closeImportDumpDialog()
}
const setImportDumpText = (value: string) => {
  importDumpText.value = value
  syncImportDumpConflictError()
}
const setImportDumpFile = (files: FileList | null) => {
  importDumpSelectedFile.value = files?.[0] || null
  syncImportDumpConflictError()
}
const clearImportDumpFile = () => {
  importDumpSelectedFile.value = null
  syncImportDumpConflictError()
}
const submitImportDump = async () => {
  if (!importDumpBaseVersionId.value) {
    importDumpError.value = 'Choose the version this import should increment from.'
    return
  }

  if (!syncImportDumpConflictError()) {
    return
  }

  const selectedFile = importDumpSelectedFile.value
  const trimmedText = importDumpText.value.trim()

  if (!selectedFile && trimmedText.length === 0) {
    importDumpError.value = importDumpMissingInputErrorMessage
    return
  }

  isSubmittingImportDump.value = true

  try {
    const importedSql = selectedFile ? await selectedFile.text() : importDumpText.value
    const importedSchema = convertPgDumpToPgml({
      preferredName: selectedFile?.name,
      sql: importedSql
    })

    replaceWorkspaceFromImportedSnapshot({
      basedOnVersionId: importDumpBaseVersionId.value,
      includeLayout: true,
      source: importedSchema.pgml
    })
    requestCanvasViewportReset()
    resetImportDumpDialog()
    toast.add({
      title: 'Workspace replaced',
      description: 'The imported dump is now the current workspace draft. Create a checkpoint when you want to lock it.',
      color: 'success',
      icon: 'i-lucide-check'
    })
  } catch (error) {
    if (error instanceof Error && error.message.trim().length > 0) {
      importDumpError.value = error.message
    } else if (typeof error === 'string' && error.trim().length > 0) {
      importDumpError.value = error
    } else {
      importDumpError.value = 'Unable to import that pg_dump.'
    }
  } finally {
    isSubmittingImportDump.value = false
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
const confirmRestoreVersionToWorkspace = () => {
  if (!restoreVersionId.value) {
    return
  }

  const didRestore = replaceWorkspaceFromVersion(restoreVersionId.value)

  if (!didRestore) {
    return
  }

  requestCanvasViewportReset()
  closeRestoreVersionDialog()
  toast.add({
    title: 'Workspace restored',
    description: 'The selected version is now the active workspace draft.',
    color: 'success',
    icon: 'i-lucide-check'
  })
}
const updateVersionCompareBaseId = (value: string | null) => {
  setCompareTargets({
    baseId: value,
    targetId: versionCompareTargetId.value
  })
}
const updateVersionCompareTargetId = (value: string) => {
  setCompareTargets({
    baseId: versionCompareBaseId.value,
    targetId: value
  })
}
const updateVersionedEditorMode = (value: string) => {
  versionedEditorMode.value = value === 'document' ? 'document' : 'head'
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

  return [
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
            disabled: currentPersistenceSource.value === 'file' && !hasSelectedComputerFile.value,
            icon: 'i-lucide-save',
            onSelect: () => {
              openSchemaDialog('save')
            }
          },
          {
            label: currentPersistenceSource.value === 'file' ? 'Open file' : 'Load saved schema',
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
            label: 'Import pg_dump onto version',
            icon: 'i-lucide-file-up',
            onSelect: openImportDumpDialog
          }
        ]
      ],
      label: 'Schema'
    },
    {
      icon: 'i-lucide-image-down',
      id: 'export',
      items: [
        exportItems
      ],
      label: 'Export'
    }
  ]
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

const addTableDraftColumn = () => {
  if (!tableEditorDraft.value) {
    return
  }

  tableEditorDraft.value.columns.push({
    id: nanoid(),
    defaultValue: '',
    extraModifiers: [],
    name: '',
    note: '',
    notNull: false,
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

const saveTableEditor = () => {
  if (!isWorkspacePreview.value || !tableEditorDraft.value || tableEditorErrors.value.length > 0) {
    return
  }

  source.value = applyEditableTableDraftToSource(source.value, workspaceParsedModel.value, tableEditorDraft.value)
  closeTableEditor()
}

const saveGroupEditor = () => {
  if (!isWorkspacePreview.value || !groupEditorDraft.value || groupEditorErrors.value.length > 0) {
    return
  }

  source.value = applyEditableGroupDraftToSource(source.value, workspaceParsedModel.value, groupEditorDraft.value)
  closeGroupEditor()
}

const runExport = async (format: 'svg' | 'png', scaleFactor?: number) => {
  if (!canvasRef.value || isExporting.value) {
    return
  }

  isExporting.value = true

  try {
    await canvasRef.value.exportDiagram(format, scaleFactor)
  } catch (error) {
    console.error(error)
  } finally {
    isExporting.value = false
  }
}

const handleCanvasFocusSource = (sourceRange: PgmlSourceRange) => {
  if (versionedEditorMode.value === 'document') {
    versionedEditorMode.value = 'head'
  }

  if (isCompactStudioLayout.value) {
    mobileWorkspaceView.value = 'pgml'
  }

  focusEditorSourceRange(sourceRange)
}

const handleCanvasPanelTabChange = (nextTab: DiagramPanelTab) => {
  mobilePanelTab.value = nextTab
}

watchEffect(() => {
  setStudioHeaderActions({
    isLoading: isExporting.value,
    menus: actionMenus.value
  })
})

watchEffect(() => {
  const isWaitingToSave = activeHasPendingChanges.value && !activeIsSaving.value
  const hasSavedInSession = activeHasSavedInSession.value && activeIsSaved.value && !isWaitingToSave
  const showsManualMobileChromeSaveState = currentPersistenceSource.value === 'file'
    && !passiveComputerFileWritesSupported.value
    && activeHasPendingChanges.value
  const showSchemaStatus = activeSaveError.value !== null
    || isWaitingToSave
    || activeIsSaving.value
    || hasSavedInSession
  const persistenceLabel = currentPersistenceSource.value === 'file' ? 'file' : 'local storage'
  let detail = ''

  if (activeSaveError.value) {
    detail = activeSaveError.value
  } else if (activeIsSaving.value) {
    detail = `Saving to ${persistenceLabel}...`
  } else if (showsManualMobileChromeSaveState) {
    detail = 'Changes are pending. Use Save to write them to the selected file on mobile Chrome.'
  } else if (isWaitingToSave) {
    detail = `Waiting to save to ${persistenceLabel}...`
  } else if (hasSavedInSession && activeSchemaUpdatedAt.value) {
    detail = `Saved to ${persistenceLabel} at ${activeSavedAtFormatter.value(activeSchemaUpdatedAt.value)}`
  } else if (hasSavedInSession) {
    detail = `Saved to ${persistenceLabel}`
  }

  setStudioSchemaStatus({
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

onBeforeUnmount(() => {
  clearStudioHeaderActions()
  clearStudioSchemaStatus()
  studioSessionStore.resetStudioUiState()
})
</script>

<template>
  <div class="h-full min-h-0">
    <StudioMobileWorkspace
      v-if="isCompactStudioLayout"
      v-model:active-view="mobileWorkspaceView"
      v-model:active-panel-tab="mobilePanelTab"
    >
      <template #canvas>
        <PgmlDiagramCanvas
          ref="canvasRef"
          :can-create-checkpoint="canCheckpoint"
          :model="parsedModel"
          :export-base-name="exportBaseName"
          :export-preference-key="exportPreferenceKey"
          :layout-changed="compareDiff.summary.layoutChanged"
          :has-blocking-source-errors="hasBlockingSourceErrors"
          :migration-file-name="compareMigrationBundle.sql.migration.fileName"
          :migration-has-changes="compareMigrationBundle.meta.hasChanges"
          :migration-sql="compareMigrationBundle.sql.migration.content"
          :migration-warnings="compareMigrationBundle.sql.migration.warnings"
          :mobile-active-view="mobileCanvasView"
          :mobile-panel-tab="mobilePanelTab"
          :preview-target-id="previewTargetId"
          :version-compare-base-id="versionCompareBaseId"
          :version-compare-options="versionCompareOptions"
          :version-compare-target-id="versionCompareTargetId"
          :version-diff-sections="versionDiffSections"
          :version-items="versionPanelItems"
          :workspace-base-label="workspaceBaseLabel"
          :workspace-status="workspaceStatus"
          :viewport-reset-key="canvasViewportResetKey"
          @create-group="openGroupCreator"
          @focus-source="handleCanvasFocusSource"
          @panel-tab-change="handleCanvasPanelTabChange"
          @create-table="openTableCreator"
          @edit-group="openGroupEditor"
          @edit-table="openTableEditor"
          @node-properties-change="syncSourceWithNodeProperties"
          @restore-version="restoreVersionToWorkspace"
          @update-version-compare-base-id="updateVersionCompareBaseId"
          @update-version-compare-target-id="updateVersionCompareTargetId"
          @version-checkpoint="openCheckpointDialog"
          @version-import-dump="openImportDumpDialog"
          @view-version-target="viewVersionTarget"
        />
      </template>

      <template #pgml>
        <StudioEditorSurface
          v-model="editorDisplaySource"
          :editor-mode="versionedEditorMode"
          :editor-mode-items="versionedEditorModeItems"
          :editor-ref-setter="assignEditorRef"
          :focus-diagnostic="focusEditorDiagnostic"
          :mode-description="editorModeDescription"
          :read-only="isEditorReadOnly"
          :read-only-label="editorReadOnlyLabel"
          :source-diagnostics="sourceDiagnostics"
          :source-error-count="sourceErrorDiagnostics.length"
          :source-warning-count="sourceWarningDiagnostics.length"
          :visible-source-diagnostics="visibleSourceDiagnostics"
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
          :editor-mode="versionedEditorMode"
          :editor-mode-items="versionedEditorModeItems"
          :editor-ref-setter="assignEditorRef"
          :focus-diagnostic="focusEditorDiagnostic"
          :mode-description="editorModeDescription"
          :read-only="isEditorReadOnly"
          :read-only-label="editorReadOnlyLabel"
          :source-diagnostics="sourceDiagnostics"
          :source-error-count="sourceErrorDiagnostics.length"
          :source-warning-count="sourceWarningDiagnostics.length"
          :visible-source-diagnostics="visibleSourceDiagnostics"
          @update:editor-mode="updateVersionedEditorMode"
        />
      </template>

      <template #canvas>
        <PgmlDiagramCanvas
          ref="canvasRef"
          :can-create-checkpoint="canCheckpoint"
          :model="parsedModel"
          :export-base-name="exportBaseName"
          :export-preference-key="exportPreferenceKey"
          :layout-changed="compareDiff.summary.layoutChanged"
          :has-blocking-source-errors="hasBlockingSourceErrors"
          :migration-file-name="compareMigrationBundle.sql.migration.fileName"
          :migration-has-changes="compareMigrationBundle.meta.hasChanges"
          :migration-sql="compareMigrationBundle.sql.migration.content"
          :migration-warnings="compareMigrationBundle.sql.migration.warnings"
          :preview-target-id="previewTargetId"
          :version-compare-base-id="versionCompareBaseId"
          :version-compare-options="versionCompareOptions"
          :version-compare-target-id="versionCompareTargetId"
          :version-diff-sections="versionDiffSections"
          :version-items="versionPanelItems"
          :workspace-base-label="workspaceBaseLabel"
          :workspace-status="workspaceStatus"
          :viewport-reset-key="canvasViewportResetKey"
          @create-group="openGroupCreator"
          @focus-source="handleCanvasFocusSource"
          @panel-tab-change="handleCanvasPanelTabChange"
          @create-table="openTableCreator"
          @edit-group="openGroupEditor"
          @edit-table="openTableEditor"
          @node-properties-change="syncSourceWithNodeProperties"
          @restore-version="restoreVersionToWorkspace"
          @update-version-compare-base-id="updateVersionCompareBaseId"
          @update-version-compare-target-id="updateVersionCompareTargetId"
          @version-checkpoint="openCheckpointDialog"
          @version-import-dump="openImportDumpDialog"
          @view-version-target="viewVersionTarget"
        />
      </template>
    </StudioDesktopWorkspace>

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
              {{ checkpointBaseVersion ? `Branches from ${getVersionLabel(checkpointBaseVersion)}` : 'Creates the first locked version from the workspace draft' }}
            </div>
            <p class="mt-2 text-[0.72rem] leading-6 text-[color:var(--studio-shell-muted)]">
              {{
                checkpointRole === 'implementation'
                  ? 'Use an implementation checkpoint when the workspace reflects imported database state you want to preserve as a baseline.'
                  : 'Use a design checkpoint when the workspace captures the intended next PGML revision.'
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
                activeHasPendingChanges
                  ? 'The current workspace has unsaved changes. Restoring will replace the draft before the next checkpoint.'
                  : 'This will replace the current workspace draft and point future changes at the restored base version.'
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

      <AppPgDumpImportModal
        :open="importDumpDialogOpen"
        :title="importDumpDialogCopy.title"
        :description="importDumpDialogCopy.description"
        :confirm-label="importDumpDialogCopy.confirmLabel"
        :input-description="importDumpDialogCopy.inputDescription"
        :model-value="importDumpText"
        :selected-file-name="importDumpSelectedFileName"
        :error-message="importDumpError"
        :is-submitting="isSubmittingImportDump"
        @update:open="handleImportDumpDialogOpenChange"
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
          </div>
        </template>
      </AppPgDumpImportModal>

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
              v-else
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

            <USwitch
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
            v-else
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
            :disabled="currentPersistenceSource === 'file' && !hasSelectedComputerFile"
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
          v-else
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
    </ClientOnly>
  </div>
</template>
