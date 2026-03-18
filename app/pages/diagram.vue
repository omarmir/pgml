<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Ref } from 'vue'
import { nanoid } from 'nanoid'
import PgmlDiagramCanvas from '~/components/pgml/PgmlDiagramCanvas.vue'
import { useStudioHeaderActions } from '~/composables/useStudioHeaderActions'
import {
  buildPgmlWithNodeProperties,
  parsePgml,
  pgmlExample,
  stripPgmlPropertiesBlocks,
  type PgmlNodeProperties
} from '~/utils/pgml'
import {
  applyEditableTableDraftToSource,
  cloneEditableTableDraft,
  commonPgmlColumnTypes,
  createEditableTableDraft,
  createEditableTableDraftForGroup,
  getEditableTableDraftErrors,
  type PgmlEditableTableDraft
} from '~/utils/pgml-table-editor'

type PgmlDiagramCanvasExposed = {
  exportDiagram: (format: 'svg' | 'png', scaleFactor?: number) => Promise<void>
  exportPng: (scaleFactor: number) => Promise<void>
  exportSvg: () => Promise<void>
  getNodeLayoutProperties: () => Record<string, PgmlNodeProperties>
}

const source: Ref<string> = ref(pgmlExample)
const canvasRef: Ref<PgmlDiagramCanvasExposed | null> = ref(null)
const isExporting: Ref<boolean> = ref(false)
const tableEditorDraft: Ref<PgmlEditableTableDraft | null> = ref(null)
const tableEditorOpen: Ref<boolean> = ref(false)
const exportScales = [1, 2, 3, 4, 8]
const { clearStudioHeaderActions, setStudioHeaderActions } = useStudioHeaderActions()
const {
  focusEditorSourceRange,
  lineNumberRef,
  lineNumbers,
  syncLineNumberScroll,
  textareaRef
} = usePgmlSourceEditor(source)
const {
  isCompactStudioLayout,
  layoutShellRef,
  resizeEditorPanelBy,
  startEditorResize,
  studioLayoutStyle
} = useStudioEditorLayout()
const studioModalSurfaceStyle = {
  backgroundColor: 'var(--studio-modal-bg)',
  color: 'var(--studio-shell-text)',
  borderColor: 'var(--studio-shell-border)',
  boxShadow: 'var(--studio-floating-shadow)'
}
const parsedState = computed(() => {
  try {
    return {
      model: parsePgml(source.value),
      error: null
    }
  } catch (error) {
    return {
      model: parsePgml(pgmlExample),
      error: error instanceof Error ? error.message : 'Unable to parse PGML.'
    }
  }
})

const parsedModel = computed(() => parsedState.value.model)
const parseError = computed(() => parsedState.value.error)
const canEmbedLayout = computed(() => !parseError.value)

const buildSchemaText = (includeLayout: boolean) => {
  const strippedSource = stripPgmlPropertiesBlocks(source.value)

  if (!includeLayout || !canEmbedLayout.value || !canvasRef.value) {
    return strippedSource
  }

  return buildPgmlWithNodeProperties(strippedSource, canvasRef.value.getNodeLayoutProperties())
}

const {
  clearSchema,
  currentSchemaName,
  clearSaveSchemaTarget,
  deleteSavedSchema,
  downloadSchema,
  formatSavedAt,
  includeLayoutInSchema,
  loadDialogOpen,
  loadExample,
  loadSavedSchema,
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
const groupSelectItems = computed(() => {
  return ['Ungrouped', ...parsedModel.value.groups.map(group => group.name)]
})
const schemaSelectItems = computed(() => {
  return Array.from(new Set(['public', ...parsedModel.value.schemas])).sort((left, right) => left.localeCompare(right))
})
const tableTypeItems = computed(() => {
  return Array.from(new Set([
    ...commonPgmlColumnTypes,
    ...parsedModel.value.customTypes.map(customType => customType.name),
    ...parsedModel.value.tables.flatMap(table => table.columns.map(column => column.type)),
    ...(tableEditorDraft.value?.columns.map(column => column.type) || [])
  ])).sort((left, right) => left.localeCompare(right))
})
const tableTargetItems = computed(() => {
  return parsedModel.value.tables
    .map(table => ({
      label: table.fullName,
      value: table.fullName
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
})
const tableEditorErrors = computed(() => {
  return tableEditorDraft.value ? getEditableTableDraftErrors(tableEditorDraft.value) : []
})

const getReferenceColumnItems = (tableFullName: string) => {
  const referenceTable = parsedModel.value.tables.find(table => table.fullName === tableFullName)

  return referenceTable?.columns.map(column => column.name) || []
}

const openTableEditor = (tableId: string) => {
  if (parseError.value) {
    return
  }

  const table = parsedModel.value.tables.find(candidate => candidate.fullName === tableId)

  if (!table) {
    return
  }

  tableEditorDraft.value = cloneEditableTableDraft(createEditableTableDraft(table))
  tableEditorOpen.value = true
}

const openTableCreator = (groupName: string) => {
  if (parseError.value) {
    return
  }

  tableEditorDraft.value = createEditableTableDraftForGroup(groupName)
  tableEditorOpen.value = true
}

const closeTableEditor = () => {
  tableEditorDraft.value = null
  tableEditorOpen.value = false
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

const saveTableEditor = () => {
  if (!tableEditorDraft.value || tableEditorErrors.value.length > 0) {
    return
  }

  source.value = applyEditableTableDraftToSource(source.value, parsedModel.value, tableEditorDraft.value)
  closeTableEditor()
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

onBeforeUnmount(() => {
  clearStudioHeaderActions()
})
</script>

<template>
  <div>
    <div
      ref="layoutShellRef"
      class="grid h-full min-h-0 w-full gap-0 overflow-hidden bg-[color:var(--studio-shell-bg)] text-[color:var(--studio-shell-text)] max-[1100px]:h-auto"
      :style="studioLayoutStyle"
    >
      <aside
        data-editor-panel="true"
        class="min-h-0 overflow-hidden border-r border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)] pr-0 max-[1100px]:border-r-0"
      >
        <div class="flex h-full min-h-0 flex-col bg-[color:var(--studio-shell-bg)]">
          <div class="grid min-h-0 flex-1 grid-cols-[48px_minmax(0,1fr)] overflow-hidden bg-[color:var(--studio-shell-bg)]">
            <div
              ref="lineNumberRef"
              class="min-h-0 overflow-hidden border-r border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)] py-3 text-center font-mono text-[0.84rem] leading-[1.9] text-[color:var(--studio-shell-muted)]"
            >
              <span
                v-for="line in lineNumbers"
                :key="line"
                class="block"
              >
                {{ line }}
              </span>
            </div>

            <textarea
              ref="textareaRef"
              v-model="source"
              data-pgml-editor="true"
              wrap="off"
              class="h-full min-h-0 w-full resize-none overflow-x-auto overflow-y-auto border-none bg-[color:var(--studio-shell-bg)] px-3.5 py-3 font-mono text-[0.84rem] leading-[1.9] text-[color:var(--studio-shell-text)] caret-[color:var(--studio-shell-label)] outline-none placeholder:text-[color:var(--studio-shell-muted)]"
              spellcheck="false"
              placeholder="Paste PGML here..."
              @scroll="syncLineNumberScroll"
            />
          </div>
        </div>

        <div
          v-if="parseError"
          class="border-t border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)] px-4 py-2 font-mono text-[0.72rem] leading-6 text-[color:var(--studio-shell-error)]"
        >
          {{ parseError }}
        </div>
      </aside>

      <div
        v-if="!isCompactStudioLayout"
        data-editor-resize-handle="true"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize PGML editor"
        tabindex="0"
        class="group relative hidden h-full cursor-ew-resize bg-[color:var(--studio-shell-bg)] outline-none min-[1100px]:block"
        @pointerdown="startEditorResize"
        @keydown.left.prevent="resizeEditorPanelBy(-32)"
        @keydown.right.prevent="resizeEditorPanelBy(32)"
      >
        <div class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[color:var(--studio-shell-border)] transition-colors duration-150 group-hover:bg-[color:var(--studio-ring)] group-focus-visible:bg-[color:var(--studio-ring)]" />
        <div class="absolute left-1/2 top-1/2 flex h-14 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] text-[color:var(--studio-shell-muted)] shadow-[var(--studio-floating-shadow)] transition-colors duration-150 group-hover:border-[color:var(--studio-ring)] group-focus-visible:border-[color:var(--studio-ring)]">
          <span class="h-7 w-px bg-[color:var(--studio-shell-border)]" />
        </div>
      </div>

      <section class="min-h-0 w-full overflow-hidden p-0">
        <PgmlDiagramCanvas
          ref="canvasRef"
          :model="parsedModel"
          @focus-source="focusEditorSourceRange"
          @create-table="openTableCreator"
          @edit-table="openTableEditor"
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
                class="rounded-none text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
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
                      :ui="{
                        base: 'rounded-none border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]'
                      }"
                    />
                  </label>

                  <USwitch
                    v-model="includeLayoutInSchema"
                    color="neutral"
                    size="sm"
                    :disabled="!canEmbedLayout"
                    label="Include current layout"
                    description="Embed node positions, colors, and grouped table columns into the PGML text."
                    :ui="{
                      wrapper: 'gap-1',
                      base: 'border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-rail)] data-[state=checked]:bg-[color:var(--studio-shell-label)]',
                      thumb: 'bg-[color:var(--studio-modal-bg)]',
                      label: 'text-[0.78rem] text-[color:var(--studio-shell-text)]',
                      description: 'text-[0.7rem] text-[color:var(--studio-shell-muted)]'
                    }"
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
                      class="grid gap-1 border px-3 py-2 text-left transition-colors duration-150"
                      :class="saveSchemaTarget?.id === schema.id ? 'border-[color:var(--studio-shell-label)] bg-[color:var(--studio-input-bg)]' : 'border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] hover:bg-[color:var(--studio-surface-hover)]'"
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
                variant="ghost"
                class="rounded-none"
                @click="schemaDialogOpen = false"
              />
              <UButton
                v-if="schemaDialogMode === 'save'"
                :label="saveSchemaActionLabel"
                color="neutral"
                variant="soft"
                class="rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]"
                @click="saveSchemaToBrowser"
              />
              <UButton
                v-else
                label="Download .pgml"
                color="neutral"
                variant="soft"
                class="rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]"
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
                class="rounded-none text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
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
                        variant="ghost"
                        size="xs"
                        class="rounded-none"
                        @click="loadSavedSchema(schema)"
                      />
                      <UButton
                        icon="i-lucide-trash-2"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        class="rounded-none"
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
                variant="ghost"
                class="rounded-none"
                @click="loadDialogOpen = false"
              />
            </div>
          </div>
        </template>
      </UModal>

      <UModal
        v-model:open="tableEditorOpen"
        :title="tableEditorTitle"
        :description="tableEditorDraft?.mode === 'create' ? 'Build a new table with structured inputs and add it to the selected group.' : 'Adjust the selected table with structured fields so the generated PGML stays valid.'"
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
                  {{ tableEditorDraft.mode === 'create' ? 'Create a new table block and place it in the chosen group.' : 'Update table metadata and column definitions from a structured editor.' }}
                </p>
              </div>

              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                class="rounded-none text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
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
                    :ui="{ base: 'rounded-none border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]' }"
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
                    :ui="{ base: 'rounded-none border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]' }"
                  />
                </label>

                <label class="grid gap-1">
                  <span class="font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Table group</span>
                  <USelect
                    aria-label="Table group"
                    :model-value="tableEditorDraft.groupName || 'Ungrouped'"
                    :items="groupSelectItems"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    :ui="{ base: 'rounded-none border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]' }"
                    @update:model-value="updateTableDraftGroup(String($event))"
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
                          :ui="{ base: 'rounded-none border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]' }"
                        />
                      </label>

                      <div class="grid gap-2">
                        <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Column type</span>
                        <div class="grid gap-2 lg:grid-cols-[minmax(0,0.56fr)_minmax(0,0.44fr)]">
                          <USelect
                            v-model="column.type"
                            aria-label="Column type preset"
                            :items="tableTypeItems"
                            color="neutral"
                            variant="outline"
                            size="sm"
                            :ui="{ base: 'rounded-none border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]' }"
                          />
                          <UInput
                            v-model="column.type"
                            aria-label="Column type"
                            placeholder="Exact type"
                            color="neutral"
                            variant="outline"
                            size="sm"
                            :ui="{ base: 'rounded-none border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]' }"
                          />
                        </div>
                      </div>
                    </div>

                    <div class="grid gap-3 lg:grid-cols-3">
                      <label class="grid gap-1">
                        <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Default</span>
                        <UInput
                          v-model="column.defaultValue"
                          aria-label="Column default"
                          placeholder="now()"
                          color="neutral"
                          variant="outline"
                          size="sm"
                          :ui="{ base: 'rounded-none border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]' }"
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
                          :ui="{ base: 'rounded-none border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]' }"
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
                      :ui="{
                        wrapper: 'gap-1',
                        base: 'border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-rail)] data-[state=checked]:bg-[color:var(--studio-shell-label)]',
                        thumb: 'bg-[color:var(--studio-modal-bg)]',
                        label: 'text-[0.78rem] text-[color:var(--studio-shell-text)]',
                        description: 'text-[0.7rem] text-[color:var(--studio-shell-muted)]'
                      }"
                    />

                    <div
                      v-if="column.referenceEnabled"
                      class="grid gap-3 lg:grid-cols-[84px_minmax(0,0.58fr)_minmax(0,0.42fr)]"
                    >
                      <label class="grid gap-1">
                        <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Relation</span>
                        <USelect
                          v-model="column.referenceRelation"
                          aria-label="Reference relation"
                          :items="['>', '<', '-']"
                          color="neutral"
                          variant="outline"
                          size="sm"
                          :ui="{ base: 'rounded-none border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]' }"
                        />
                      </label>

                      <label class="grid gap-1">
                        <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Target table</span>
                        <USelect
                          aria-label="Reference target table"
                          :model-value="`${column.referenceSchema}.${column.referenceTable}`"
                          :items="tableTargetItems"
                          value-key="value"
                          label-key="label"
                          color="neutral"
                          variant="outline"
                          size="sm"
                          :ui="{ base: 'rounded-none border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]' }"
                          @update:model-value="updateTableDraftReferenceTarget(column.id, String($event))"
                        />
                      </label>

                      <label class="grid gap-1">
                        <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">Target column</span>
                        <USelect
                          v-model="column.referenceColumn"
                          aria-label="Reference target column"
                          :items="getReferenceColumnItems(`${column.referenceSchema}.${column.referenceTable}`)"
                          color="neutral"
                          variant="outline"
                          size="sm"
                          :ui="{ base: 'rounded-none border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]' }"
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
                variant="ghost"
                class="rounded-none"
                @click="closeTableEditor"
              />
              <UButton
                :label="tableEditorActionLabel"
                data-table-editor-save="true"
                color="neutral"
                variant="soft"
                class="rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]"
                :disabled="tableEditorErrors.length > 0"
                @click="saveTableEditor"
              />
            </div>
          </div>
        </template>
      </UModal>
    </ClientOnly>
  </div>
</template>
