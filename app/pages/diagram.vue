<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Ref } from 'vue'
import { nanoid } from 'nanoid'
import PgmlDiagramCanvas from '~/components/pgml/PgmlDiagramCanvas.vue'
import PgmlSourceCodeEditor from '~/components/pgml/PgmlSourceCodeEditor.vue'
import { usePgmlColumnDefaultSuggestions } from '~/composables/usePgmlColumnDefaultSuggestions'
import { slugifySchemaName, type SavedPgmlSchema } from '~/composables/usePgmlStudioSchemas'
import { useStudioHeaderActions } from '~/composables/useStudioHeaderActions'
import { useStudioSchemaStatus } from '~/composables/useStudioSchemaStatus'
import { analyzePgmlDocument } from '~/utils/pgml-language'
import {
  buildPgmlWithNodeProperties,
  parsePgml,
  pgmlExample,
  stripPgmlPropertiesBlocks,
  type PgmlNodeProperties
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
const tableEditorDraft: Ref<PgmlEditableTableDraft | null> = ref(null)
const tableEditorOpen: Ref<boolean> = ref(false)
const groupEditorDraft: Ref<PgmlEditableGroupDraft | null> = ref(null)
const groupEditorOpen: Ref<boolean> = ref(false)
const exportScales = [1, 2, 3, 4, 8]
const { clearStudioHeaderActions, setStudioHeaderActions } = useStudioHeaderActions()
const { clearStudioSchemaStatus, setStudioSchemaStatus } = useStudioSchemaStatus()
const { getColumnDefaultPlaceholder, getColumnDefaultSuggestions } = usePgmlColumnDefaultSuggestions()
const {
  editorRef,
  focusEditorSourceRange
} = usePgmlSourceEditor()
const {
  isEditorPanelVisible,
  isCompactStudioLayout,
  layoutShellRef,
  resizeEditorPanelBy,
  startEditorResize,
  studioLayoutStyle,
  toggleEditorPanelVisibility
} = useStudioEditorLayout()
const studioModalSurfaceStyle = {
  backgroundColor: 'var(--studio-modal-bg)',
  color: 'var(--studio-shell-text)',
  borderColor: 'var(--studio-shell-border)',
  boxShadow: 'var(--studio-floating-shadow)'
}
const studioFieldUi = {
  base: 'rounded-none border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]'
}
const studioSelectUi = {
  base: 'studio-select-trigger rounded-none border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]',
  value: 'text-[color:var(--studio-shell-text)]',
  placeholder: 'text-[color:var(--studio-shell-muted)]',
  trailingIcon: 'text-[color:var(--studio-shell-muted)]',
  content: 'rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] p-1 shadow-[var(--studio-floating-shadow)] backdrop-blur-sm',
  viewport: 'scroll-py-1 overflow-y-auto',
  item: 'studio-select-item rounded-none before:rounded-none text-[color:var(--studio-shell-text)]',
  itemLabel: 'truncate',
  itemDescription: 'whitespace-normal break-words text-[color:var(--studio-shell-muted)]',
  itemLeadingIcon: 'text-[color:var(--studio-shell-muted)]',
  itemTrailingIcon: 'text-[color:var(--studio-shell-label)]'
}
const studioInputMenuUi = {
  base: 'studio-select-trigger rounded-none border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]',
  value: 'text-[color:var(--studio-shell-text)]',
  placeholder: 'text-[color:var(--studio-shell-muted)]',
  trailingIcon: 'text-[color:var(--studio-shell-muted)]',
  content: 'rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] p-1 shadow-[var(--studio-floating-shadow)] backdrop-blur-sm',
  viewport: 'scroll-py-1 overflow-y-auto',
  item: 'studio-select-item rounded-none before:rounded-none text-[color:var(--studio-shell-text)]',
  itemLabel: 'truncate',
  itemDescription: 'whitespace-normal break-words text-[color:var(--studio-shell-muted)]',
  itemLeadingIcon: 'text-[color:var(--studio-shell-muted)]',
  itemTrailingIcon: 'text-[color:var(--studio-shell-label)]'
}
const studioDefaultInputMenuProps: Record<string, unknown> = {
  autocomplete: true,
  openOnClick: true,
  openOnFocus: true
}
const getStudioSelectMenuSearchInputProps = (placeholder: string) => {
  return {
    placeholder,
    variant: 'none' as const,
    ui: {
      base: 'text-[color:var(--studio-shell-text)] placeholder:text-[color:var(--studio-shell-muted)]',
      root: 'px-1',
      leadingIcon: 'text-[color:var(--studio-shell-muted)]'
    }
  }
}
const studioSwitchUi = {
  wrapper: 'gap-1',
  base: 'border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-rail)] data-[state=checked]:bg-[color:var(--studio-shell-label)]',
  thumb: 'bg-[color:var(--studio-modal-bg)]',
  label: 'text-[0.78rem] text-[color:var(--studio-shell-text)]',
  description: 'text-[0.7rem] text-[color:var(--studio-shell-muted)]'
}
const secondaryModalButtonClass = 'rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] text-[color:var(--studio-shell-text)] hover:bg-[color:var(--studio-shell-text)]/8'
const primaryModalButtonClass = 'rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)] hover:bg-[color:var(--studio-shell-text)]/8 disabled:opacity-100 disabled:border-[color:var(--studio-shell-border)] disabled:bg-[color:var(--studio-shell-text)]/10 disabled:text-[color:var(--studio-shell-muted)]'
const iconGhostButtonClass = 'rounded-none text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-shell-text)]/8 hover:text-[color:var(--studio-shell-text)]'
const overwriteTargetButtonClass = 'grid gap-1 border px-3 py-2 text-left transition-colors duration-150'
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
  downloadSchema,
  formatSavedAt,
  hasPendingLocalChanges,
  includeLayoutInSchema,
  isSavedToLocalStorage,
  isSavingToLocalStorage,
  localStorageSaveError,
  loadDialogOpen,
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
  schemaDialogMode,
  schemaDialogOpen
} = usePgmlStudioSchemas({
  buildSchemaText,
  canEmbedLayout,
  initialSource: pgmlExample,
  source
})

const requestCanvasViewportReset = () => {
  canvasViewportResetKey.value += 1
}

const loadExample = () => {
  loadStudioExample()
  requestCanvasViewportReset()
}

const clearSchema = () => {
  clearStudioSchema()
  requestCanvasViewportReset()
}

const loadSavedSchema = (schema: SavedPgmlSchema) => {
  loadStudioSavedSchema(schema)
  requestCanvasViewportReset()
}

const exportBaseName = computed(() => slugifySchemaName(currentSchemaName.value))
const exportPreferenceKey = computed(() => `name:${slugifySchemaName(currentSchemaName.value)}`)

const actionMenuItems = computed<DropdownMenuItem[][]>(() => {
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
        icon: 'i-lucide-save',
        onSelect: () => {
          openSchemaDialog('save')
        }
      },
      {
        label: 'Load saved schema',
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
    exportItems
  ]
})

const tableEditorTitle = computed(() => {
  return tableEditorDraft.value?.mode === 'create' ? 'Add table' : 'Edit table'
})
const tableEditorActionLabel = computed(() => {
  return tableEditorDraft.value?.mode === 'create' ? 'Create table' : 'Save table'
})
const groupEditorTitle = computed(() => {
  return groupEditorDraft.value?.mode === 'create' ? 'Add table group' : 'Edit table group'
})
const groupEditorActionLabel = computed(() => {
  return groupEditorDraft.value?.mode === 'create' ? 'Create group' : 'Save group'
})
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
    referenceEnabled: false,
    referenceRelation: '>',
    referenceSchema: 'public',
    referenceTable: '',
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

watchEffect(() => {
  setStudioHeaderActions({
    isLoading: isExporting.value,
    items: actionMenuItems.value
  })
})

watchEffect(() => {
  const isWaitingToSave = hasPendingLocalChanges.value && !isSavingToLocalStorage.value
  const detail = localStorageSaveError.value
    ? localStorageSaveError.value
    : isSavingToLocalStorage.value
      ? 'Saving to local storage...'
      : isWaitingToSave
        ? 'Waiting to save to local storage...'
        : isSavedToLocalStorage.value && currentSchemaUpdatedAt.value
          ? `Saved to local storage at ${formatSavedAt(currentSchemaUpdatedAt.value)}`
          : 'Saved to local storage'

  setStudioSchemaStatus({
    detail,
    name: currentSchemaName.value,
    saveState: localStorageSaveError.value
      ? 'error'
      : isSavingToLocalStorage.value
        ? 'saving'
        : isWaitingToSave
          ? 'pending'
          : 'saved'
  })
})

onBeforeUnmount(() => {
  clearStudioHeaderActions()
  clearStudioSchemaStatus()
})
</script>

<template>
  <div class="h-full min-h-0">
    <div
      ref="layoutShellRef"
      class="grid h-full min-h-0 w-full gap-0 overflow-hidden bg-[color:var(--studio-shell-bg)] text-[color:var(--studio-shell-text)] max-[1100px]:h-auto"
      :style="studioLayoutStyle"
    >
      <aside
        v-if="isEditorPanelVisible"
        data-editor-panel="true"
        class="min-h-0 overflow-hidden bg-[color:var(--studio-shell-bg)] pr-0"
      >
        <div class="flex h-full min-h-0 flex-col bg-[color:var(--studio-shell-bg)]">
          <div class="min-h-0 flex-1 overflow-hidden bg-[color:var(--studio-shell-bg)]">
            <PgmlSourceCodeEditor
              ref="editorRef"
              v-model="source"
              placeholder="Paste PGML here..."
            />
          </div>
        </div>

        <div
          v-if="sourceDiagnostics.length > 0"
          data-pgml-diagnostics="true"
          class="grid gap-2 border-t border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)] px-4 py-3 font-mono text-[0.72rem] leading-6"
        >
          <div class="flex flex-wrap items-center justify-between gap-3">
            <span class="uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
              Diagnostics
            </span>
            <span class="text-[color:var(--studio-shell-muted)]">
              {{ sourceErrorDiagnostics.length }} error<span v-if="sourceErrorDiagnostics.length !== 1">s</span>
              <template v-if="sourceWarningDiagnostics.length > 0">
                · {{ sourceWarningDiagnostics.length }} warning<span v-if="sourceWarningDiagnostics.length !== 1">s</span>
              </template>
            </span>
          </div>

          <ul class="grid gap-1.5">
            <li
              v-for="diagnostic in visibleSourceDiagnostics"
              :key="`${diagnostic.code}:${diagnostic.from}:${diagnostic.line}`"
              class="flex gap-2"
            >
              <span
                class="min-w-12 uppercase tracking-[0.08em]"
                :class="diagnostic.severity === 'error' ? 'text-[color:var(--studio-shell-error)]' : 'text-[color:var(--studio-shell-label)]'"
              >
                L{{ diagnostic.line }}
              </span>
              <span
                :class="diagnostic.severity === 'error' ? 'text-[color:var(--studio-shell-error)]' : 'text-[color:var(--studio-shell-muted)]'"
              >
                {{ diagnostic.message }}
              </span>
            </li>
          </ul>
        </div>
      </aside>

      <div
        v-if="isEditorPanelVisible && !isCompactStudioLayout"
        data-editor-resize-handle="true"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize PGML editor"
        tabindex="0"
        class="group relative z-10 hidden h-full overflow-visible cursor-ew-resize bg-transparent outline-none min-[1100px]:block"
        @pointerdown="startEditorResize"
        @keydown.left.prevent="resizeEditorPanelBy(-32)"
        @keydown.right.prevent="resizeEditorPanelBy(32)"
      >
        <div
          data-editor-resize-hit-area="true"
          class="absolute inset-y-0 left-1/2 w-5 -translate-x-1/2"
        />
        <div
          data-editor-resize-divider="true"
          class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[color:var(--studio-shell-border)] transition-colors duration-150 group-hover:bg-[color:var(--studio-ring)] group-focus-visible:bg-[color:var(--studio-ring)]"
        />
        <div
          data-editor-resize-grip="true"
          class="absolute left-1/2 top-1/2 flex h-10 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] text-[color:var(--studio-shell-muted)] transition-colors duration-150 group-hover:border-[color:var(--studio-ring)] group-hover:text-[color:var(--studio-shell-text)] group-focus-visible:border-[color:var(--studio-ring)] group-focus-visible:text-[color:var(--studio-shell-text)]"
        >
          <UIcon
            name="i-lucide-grip-vertical"
            class="h-3.5 w-3.5"
          />
        </div>
      </div>

      <section class="relative min-h-0 w-full overflow-hidden p-0">
        <UButton
          :label="isEditorPanelVisible ? 'Hide PGML' : 'Show PGML'"
          :icon="isEditorPanelVisible ? 'i-lucide-panel-left-close' : 'i-lucide-panel-left-open'"
          data-editor-visibility-toggle="true"
          color="neutral"
          variant="outline"
          size="xs"
          class="absolute left-3 top-3 z-[4] rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-2 py-1 font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-text)] hover:bg-[color:var(--studio-surface-hover)]"
          @click="toggleEditorPanelVisibility"
        />
        <PgmlDiagramCanvas
          ref="canvasRef"
          :model="parsedModel"
          :export-base-name="exportBaseName"
          :export-preference-key="exportPreferenceKey"
          :has-blocking-source-errors="hasBlockingSourceErrors"
          :viewport-reset-key="canvasViewportResetKey"
          @create-group="openGroupCreator"
          @focus-source="focusEditorSourceRange"
          @create-table="openTableCreator"
          @edit-group="openGroupEditor"
          @edit-table="openTableEditor"
          @node-properties-change="syncSourceWithNodeProperties"
        />
      </section>
    </div>

    <ClientOnly>
      <UModal
        v-model:open="schemaDialogOpen"
        :title="schemaActionTitle"
        :description="schemaActionDescription"
        :ui="{
          overlay: 'bg-black/60 backdrop-blur-[2px]',
          content: 'overflow-visible border-none bg-transparent p-0 shadow-none ring-0'
        }"
      >
        <template #content>
          <div
            data-studio-modal-surface="schema"
            class="flex w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden rounded-none border"
            :style="studioModalSurfaceStyle"
          >
            <div class="flex items-start justify-between gap-4 border-b border-[color:var(--studio-shell-border)] px-4 py-3">
              <div class="grid gap-1">
                <h2 class="text-[1rem] font-semibold leading-6 text-[color:var(--studio-shell-text)]">
                  {{ schemaActionTitle }}
                </h2>
                <p class="text-[0.8rem] leading-5 text-[color:var(--studio-shell-muted)]">
                  {{ schemaActionDescription }}
                </p>
              </div>

              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                :class="iconGhostButtonClass"
                aria-label="Close"
                @click="schemaDialogOpen = false"
              />
            </div>

            <div class="grid gap-4 px-4 py-3">
              <div class="grid gap-3 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
                <div class="grid gap-3">
                  <label class="grid gap-1">
                    <span class="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
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

                  <USwitch
                    v-model="includeLayoutInSchema"
                    color="neutral"
                    size="sm"
                    :disabled="!canEmbedLayout"
                    label="Include current layout"
                    description="Embed node positions, colors, and grouped table columns into the PGML text."
                    :ui="studioSwitchUi"
                  />
                </div>

                <div class="grid gap-2 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3">
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <div class="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
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
                      class="rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]"
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
                      :class="[
                        overwriteTargetButtonClass,
                        saveSchemaTarget?.id === schema.id
                          ? 'border-[color:var(--studio-shell-label)] bg-[color:var(--studio-shell-text)]/8'
                          : 'border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] hover:bg-[color:var(--studio-shell-text)]/8'
                      ]"
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
                    class="border border-dashed border-[color:var(--studio-shell-border)] px-3 py-4 text-[0.72rem] text-[color:var(--studio-shell-muted)]"
                  >
                    No saved schemas in this browser yet.
                  </div>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-end gap-2 border-t border-[color:var(--studio-shell-border)] px-4 py-3">
              <UButton
                label="Cancel"
                color="neutral"
                variant="outline"
                :class="secondaryModalButtonClass"
                @click="schemaDialogOpen = false"
              />
              <UButton
                v-if="schemaDialogMode === 'save'"
                :label="saveSchemaActionLabel"
                color="neutral"
                variant="soft"
                :class="primaryModalButtonClass"
                @click="saveSchemaToBrowser"
              />
              <UButton
                v-else
                label="Download .pgml"
                color="neutral"
                variant="soft"
                :class="primaryModalButtonClass"
                @click="downloadSchema"
              />
            </div>
          </div>
        </template>
      </UModal>

      <UModal
        v-model:open="loadDialogOpen"
        title="Load saved schema"
        description="Saved PGML files stored in this browser."
        :ui="{
          overlay: 'bg-black/60 backdrop-blur-[2px]',
          content: 'overflow-visible border-none bg-transparent p-0 shadow-none ring-0'
        }"
      >
        <template #content>
          <div
            data-studio-modal-surface="load"
            class="flex w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden rounded-none border"
            :style="studioModalSurfaceStyle"
          >
            <div class="flex items-start justify-between gap-4 border-b border-[color:var(--studio-shell-border)] px-4 py-3">
              <div class="grid gap-1">
                <h2 class="text-[1rem] font-semibold leading-6 text-[color:var(--studio-shell-text)]">
                  Load saved schema
                </h2>
                <p class="text-[0.8rem] leading-5 text-[color:var(--studio-shell-muted)]">
                  Saved PGML files stored in this browser.
                </p>
              </div>

              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                :class="iconGhostButtonClass"
                aria-label="Close"
                @click="loadDialogOpen = false"
              />
            </div>

            <div class="max-h-[min(60vh,36rem)] overflow-y-auto px-4 py-3">
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
                class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-4 text-[0.72rem] text-[color:var(--studio-shell-muted)]"
              >
                No saved schemas in this browser yet.
              </div>
            </div>

            <div class="flex justify-end border-t border-[color:var(--studio-shell-border)] px-4 py-3">
              <UButton
                label="Close"
                color="neutral"
                variant="outline"
                :class="secondaryModalButtonClass"
                @click="loadDialogOpen = false"
              />
            </div>
          </div>
        </template>
      </UModal>

      <UModal
        v-model:open="tableEditorOpen"
        :title="tableEditorTitle"
        :description="tableEditorDraft?.mode === 'create' ? 'Build a new table with structured inputs and choose whether it stays floating or belongs to a group.' : 'Adjust the selected table with structured fields so the generated PGML stays valid.'"
        :ui="{
          overlay: 'bg-black/60 backdrop-blur-[2px]',
          content: 'overflow-visible border-none bg-transparent p-0 shadow-none ring-0'
        }"
      >
        <template #content>
          <div
            v-if="tableEditorDraft"
            data-studio-modal-surface="table-editor"
            class="flex w-[calc(100vw-2rem)] max-w-5xl flex-col overflow-hidden rounded-none border"
            :style="studioModalSurfaceStyle"
          >
            <div class="flex items-start justify-between gap-4 border-b border-[color:var(--studio-shell-border)] px-4 py-3">
              <div class="grid gap-1">
                <h2 class="text-[1rem] font-semibold leading-6 text-[color:var(--studio-shell-text)]">
                  {{ tableEditorTitle }}
                </h2>
                <p class="text-[0.8rem] leading-5 text-[color:var(--studio-shell-muted)]">
                  {{ tableEditorDraft.mode === 'create' ? 'Create a new table block, leave it floating, or place it in a selected group.' : 'Update table metadata and column definitions from a structured editor.' }}
                </p>
              </div>

              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                :class="iconGhostButtonClass"
                aria-label="Close"
                @click="closeTableEditor"
              />
            </div>

            <div class="grid max-h-[min(74vh,52rem)] gap-5 overflow-y-auto px-4 py-4">
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
                  <span class="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Table name</span>
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
                  <span class="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Schema</span>
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
                  <span class="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Table group</span>
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
                <span class="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Table note</span>
                <textarea
                  v-model="tableEditorDraft.note"
                  rows="3"
                  class="min-h-[5rem] w-full resize-y border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] px-3 py-2 text-[0.8rem] text-[color:var(--studio-shell-text)] outline-none"
                />
              </label>

              <div class="grid gap-3">
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <div class="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
                      Columns
                    </div>
                    <p class="mt-1 text-[0.74rem] leading-5 text-[color:var(--studio-shell-muted)]">
                      Choose types and references from structured inputs where available, then refine the exact values if needed.
                    </p>
                  </div>

                  <UButton
                    label="Add column"
                    icon="i-lucide-plus"
                    color="neutral"
                    variant="soft"
                    size="sm"
                    class="rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]"
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
                      <div class="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
                        {{ column.name || 'New column' }}
                      </div>

                      <UButton
                        icon="i-lucide-trash-2"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        class="rounded-none text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
                        aria-label="Remove column"
                        :disabled="tableEditorDraft.columns.length <= 1"
                        @click="removeTableDraftColumn(column.id)"
                      />
                    </div>

                    <div class="grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                      <label class="grid gap-1">
                        <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Column name</span>
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
                        <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Column type</span>
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
                        <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Default</span>
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
                        <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Column note</span>
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
                        class="border px-2 py-1 font-mono text-[0.58rem] uppercase tracking-[0.08em] transition-colors duration-150"
                        :class="column.primaryKey ? 'border-[color:var(--studio-shell-label)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]' : 'border-[color:var(--studio-shell-border)] text-[color:var(--studio-shell-muted)]'"
                        @click="column.primaryKey = !column.primaryKey"
                      >
                        Primary key
                      </button>
                      <button
                        type="button"
                        class="border px-2 py-1 font-mono text-[0.58rem] uppercase tracking-[0.08em] transition-colors duration-150"
                        :class="column.notNull ? 'border-[color:var(--studio-shell-label)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]' : 'border-[color:var(--studio-shell-border)] text-[color:var(--studio-shell-muted)]'"
                        @click="column.notNull = !column.notNull"
                      >
                        Not null
                      </button>
                      <button
                        type="button"
                        class="border px-2 py-1 font-mono text-[0.58rem] uppercase tracking-[0.08em] transition-colors duration-150"
                        :class="column.unique ? 'border-[color:var(--studio-shell-label)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]' : 'border-[color:var(--studio-shell-border)] text-[color:var(--studio-shell-muted)]'"
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
                      class="grid gap-3 lg:grid-cols-[minmax(0,0.34fr)_minmax(0,0.4fr)_minmax(0,0.26fr)]"
                    >
                      <label class="grid gap-1">
                        <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Relationship direction</span>
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
                        <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Target table</span>
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
                        <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Target column</span>
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
                    </div>
                  </article>
                </div>
              </div>
            </div>

            <div class="flex items-center justify-end gap-2 border-t border-[color:var(--studio-shell-border)] px-4 py-3">
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
            </div>
          </div>
        </template>
      </UModal>

      <UModal
        v-model:open="groupEditorOpen"
        :title="groupEditorTitle"
        :description="groupEditorDraft?.mode === 'create' ? 'Create a table group block and choose which tables should belong to it.' : 'Rename the selected table group, choose its tables, and update its note.'"
        :ui="{
          overlay: 'bg-black/60 backdrop-blur-[2px]',
          content: 'overflow-visible border-none bg-transparent p-0 shadow-none ring-0'
        }"
      >
        <template #content>
          <div
            v-if="groupEditorDraft"
            data-studio-modal-surface="group-editor"
            class="flex w-[calc(100vw-2rem)] max-w-2xl flex-col overflow-hidden rounded-none border"
            :style="studioModalSurfaceStyle"
          >
            <div class="flex items-start justify-between gap-4 border-b border-[color:var(--studio-shell-border)] px-4 py-3">
              <div class="grid gap-1">
                <h2 class="text-[1rem] font-semibold leading-6 text-[color:var(--studio-shell-text)]">
                  {{ groupEditorTitle }}
                </h2>
                <p class="text-[0.8rem] leading-5 text-[color:var(--studio-shell-muted)]">
                  {{ groupEditorDraft.mode === 'create' ? 'Create a new table group and assign tables to it in one pass.' : 'Update the selected group metadata and its table membership without leaving the diagram.' }}
                </p>
              </div>

              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                :class="iconGhostButtonClass"
                aria-label="Close"
                @click="closeGroupEditor"
              />
            </div>

            <div class="grid max-h-[min(60vh,32rem)] gap-5 overflow-y-auto px-4 py-4">
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
                  <span class="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Group name</span>
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
                  <span class="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Tables in this group</span>
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
                <span class="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Group note</span>
                <textarea
                  v-model="groupEditorDraft.note"
                  data-group-editor-note="true"
                  rows="4"
                  class="min-h-[6rem] w-full resize-y border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] px-3 py-2 text-[0.8rem] text-[color:var(--studio-shell-text)] outline-none"
                />
              </label>
            </div>

            <div class="flex items-center justify-end gap-2 border-t border-[color:var(--studio-shell-border)] px-4 py-3">
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
            </div>
          </div>
        </template>
      </UModal>
    </ClientOnly>
  </div>
</template>
