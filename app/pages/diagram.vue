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
import type { PgmlSourceEditorHandle } from '~/composables/usePgmlSourceEditor'
import { useStudioHeaderActions } from '~/composables/useStudioHeaderActions'
import { useStudioSchemaStatus } from '~/composables/useStudioSchemaStatus'
import { useStudioSessionStore } from '~/stores/studio-session'
import { useStudioSourcesStore } from '~/stores/studio-sources'
import {
  downloadSchemaText,
  slugifySchemaName,
  type SavedPgmlSchema
} from '~/utils/studio-browser-schemas'
import {
  getStudioLaunchRequestKey,
  parseStudioLaunchQuery
} from '~/utils/studio-launch'
import { analyzePgmlDocument } from '~/utils/pgml-language'
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
  getStudioSelectMenuSearchInputProps,
  getStudioToggleChipClass,
  joinStudioClasses,
  studioButtonClasses,
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
const canvasRef: Ref<PgmlDiagramCanvasExposed | null> = ref(null)
const canvasViewportResetKey: Ref<number> = ref(0)
const isExporting: Ref<boolean> = ref(false)
const mobileWorkspaceView: Ref<StudioMobileWorkspaceView> = ref('diagram')
const mobilePanelTab: Ref<DiagramPanelTab> = ref(defaultStudioMobilePanelTab)
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
const sourceAnalysis = computed(() => analyzePgmlDocument(source.value))
const sourceDiagnostics = computed(() => sourceAnalysis.value.diagnostics)
const sourceErrorDiagnostics = computed(() => {
  return sourceDiagnostics.value.filter(diagnostic => diagnostic.severity === 'error')
})
const sourceWarningDiagnostics = computed(() => {
  return sourceDiagnostics.value.filter(diagnostic => diagnostic.severity === 'warning')
})
const visibleSourceDiagnostics = computed(() => sourceDiagnostics.value.slice(0, 6))
const hasBlockingSourceErrors = computed(() => sourceErrorDiagnostics.value.length > 0)
const parsedModel = computed(() => parsePgml(source.value))
const canEmbedLayout = computed(() => !hasBlockingSourceErrors.value)
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
  const strippedSource = stripPgmlPropertiesBlocks(source.value)

  if (!includeLayout || !canEmbedLayout.value || !canvasRef.value) {
    return strippedSource
  }

  return buildPgmlWithNodeProperties(strippedSource, canvasRef.value.getNodeLayoutProperties())
}

const syncSourceWithNodeProperties = (nodeProperties: Record<string, PgmlNodeProperties>) => {
  if (hasBlockingSourceErrors.value) {
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
  autosaveEnabled: computed(() => currentPersistenceSource.value === 'browser'),
  buildSchemaText,
  canEmbedLayout,
  initialSource: pgmlExample,
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

watch(studioLaunchRequest, async (request) => {
  if (!request) {
    return
  }

  const requestKey = getStudioLaunchRequestKey(request)

  if (requestKey === appliedStudioLaunchKey.value) {
    return
  }

  appliedStudioLaunchKey.value = requestKey

  if (request.source === 'file') {
    const preloadedFileLaunch = studioSessionStore.consumePreloadedFileLaunch(request)

    if (preloadedFileLaunch) {
      syncLoadedComputerFile(preloadedFileLaunch)
      await refreshRecentComputerFiles()
      currentPersistenceSource.value = 'file'
      requestCanvasViewportReset()
      return
    }

    await loadRecentComputerFile(request.recentFileId)
    return
  }

  currentPersistenceSource.value = 'browser'

  if (request.launch === 'example') {
    loadExample()
    return
  }

  if (request.launch === 'new') {
    clearSchema()
    return
  }

  const savedSchema = orderedSavedSchemas.value.find((schema) => {
    return schema.id === request.schemaId
  })

  if (savedSchema) {
    loadSavedSchema(savedSchema)
  }
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
    ...parsedModel.value.groups
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
  return Array.from(new Set(['public', ...parsedModel.value.schemas])).sort((left, right) => left.localeCompare(right))
})
const tableTypeItems = computed<ReferenceTargetItem[]>(() => {
  const dynamicTypes = Array.from(new Set([
    ...parsedModel.value.customTypes.map(customType => customType.name),
    ...parsedModel.value.tables.flatMap(table => table.columns.map(column => column.type)),
    ...(tableEditorDraft.value?.columns.map(column => column.type) || [])
  ].filter(type => type.trim().length > 0))).sort((left, right) => left.localeCompare(right))
  const orderedTypes = Array.from(new Set([
    ...commonPgmlColumnTypes,
    ...dynamicTypes
  ]))
  const customTypeKinds = new Map(parsedModel.value.customTypes.map(customType => [customType.name, customType.kind]))

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
    value: '',
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
  return parsedModel.value.tables
    .map(table => ({
      label: table.fullName,
      value: table.fullName,
      description: `${table.columns.length} column${table.columns.length === 1 ? '' : 's'}`
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
})
const groupTableItems = computed<ReferenceTargetItem[]>(() => {
  return parsedModel.value.tables
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
  const referenceTable = parsedModel.value.tables.find(table => table.fullName === tableFullName)

  return referenceTable?.columns.map(column => ({
    label: column.name,
    value: column.name,
    description: column.type
  })) || []
}

const openTableEditor = (tableId: string) => {
  if (hasBlockingSourceErrors.value) {
    return
  }

  const table = parsedModel.value.tables.find(candidate => candidate.fullName === tableId)

  if (!table) {
    return
  }

  tableEditorDraft.value = cloneEditableTableDraft(createEditableTableDraft(table))
  tableEditorOpen.value = true
}

const openTableCreator = (groupName: string | null) => {
  if (hasBlockingSourceErrors.value) {
    return
  }

  tableEditorDraft.value = createEditableTableDraftForGroup(groupName)
  tableEditorOpen.value = true
}

const openGroupEditor = (groupName: string) => {
  if (hasBlockingSourceErrors.value) {
    return
  }

  const group = parsedModel.value.groups.find(candidate => candidate.name === groupName)

  if (!group) {
    return
  }

  groupEditorDraft.value = cloneEditableGroupDraft(createEditableGroupDraft(group))
  groupEditorOpen.value = true
}

const openGroupCreator = () => {
  if (hasBlockingSourceErrors.value) {
    return
  }

  groupEditorDraft.value = createEditableGroupDraftForCreate()
  groupEditorOpen.value = true
}

const closeTableEditor = () => {
  tableEditorDraft.value = null
  tableEditorOpen.value = false
}

const closeGroupEditor = () => {
  groupEditorDraft.value = null
  groupEditorOpen.value = false
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

const saveTableEditor = () => {
  if (!tableEditorDraft.value || tableEditorErrors.value.length > 0) {
    return
  }

  source.value = applyEditableTableDraftToSource(source.value, parsedModel.value, tableEditorDraft.value)
  closeTableEditor()
}

const saveGroupEditor = () => {
  if (!groupEditorDraft.value || groupEditorErrors.value.length > 0) {
    return
  }

  source.value = applyEditableGroupDraftToSource(source.value, parsedModel.value, groupEditorDraft.value)
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
          :model="parsedModel"
          :export-base-name="exportBaseName"
          :export-preference-key="exportPreferenceKey"
          :has-blocking-source-errors="hasBlockingSourceErrors"
          :mobile-active-view="mobileCanvasView"
          :mobile-panel-tab="mobilePanelTab"
          :viewport-reset-key="canvasViewportResetKey"
          @create-group="openGroupCreator"
          @focus-source="handleCanvasFocusSource"
          @panel-tab-change="handleCanvasPanelTabChange"
          @create-table="openTableCreator"
          @edit-group="openGroupEditor"
          @edit-table="openTableEditor"
          @node-properties-change="syncSourceWithNodeProperties"
        />
      </template>

      <template #pgml>
        <StudioEditorSurface
          v-model="source"
          :editor-ref-setter="assignEditorRef"
          :focus-diagnostic="focusEditorDiagnostic"
          :source-diagnostics="sourceDiagnostics"
          :source-error-count="sourceErrorDiagnostics.length"
          :source-warning-count="sourceWarningDiagnostics.length"
          :visible-source-diagnostics="visibleSourceDiagnostics"
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
          v-model="source"
          :editor-ref-setter="assignEditorRef"
          :focus-diagnostic="focusEditorDiagnostic"
          :source-diagnostics="sourceDiagnostics"
          :source-error-count="sourceErrorDiagnostics.length"
          :source-warning-count="sourceWarningDiagnostics.length"
          :visible-source-diagnostics="visibleSourceDiagnostics"
        />
      </template>

      <template #canvas>
        <PgmlDiagramCanvas
          ref="canvasRef"
          :model="parsedModel"
          :export-base-name="exportBaseName"
          :export-preference-key="exportPreferenceKey"
          :has-blocking-source-errors="hasBlockingSourceErrors"
          :viewport-reset-key="canvasViewportResetKey"
          @create-group="openGroupCreator"
          @focus-source="handleCanvasFocusSource"
          @panel-tab-change="handleCanvasPanelTabChange"
          @create-table="openTableCreator"
          @edit-group="openGroupEditor"
          @edit-table="openTableEditor"
          @node-properties-change="syncSourceWithNodeProperties"
        />
      </template>
    </StudioDesktopWorkspace>

    <ClientOnly>
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
                      v-model="column.referenceDeleteAction"
                      aria-label="Reference on delete action"
                      :items="referenceActionItems"
                      value-key="value"
                      label-key="label"
                      description-key="description"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      :ui="studioSelectUi"
                    />
                  </label>

                  <label class="grid gap-1">
                    <span :class="studioCompactFieldKickerClass">On update</span>
                    <USelect
                      v-model="column.referenceUpdateAction"
                      aria-label="Reference on update action"
                      :items="referenceActionItems"
                      value-key="value"
                      label-key="label"
                      description-key="description"
                      color="neutral"
                      variant="outline"
                      size="sm"
                      :ui="studioSelectUi"
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

            <div class="grid gap-1">
              <span :class="studioFieldKickerClass">Tables in this group</span>
              <USelectMenu
                aria-label="Group tables"
                :items="groupTableItems"
                :model-value="groupEditorDraft.tableNames"
                :multiple="true"
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
