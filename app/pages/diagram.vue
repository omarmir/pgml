<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import PgmlDiagramCanvas from '~/components/pgml/PgmlDiagramCanvas.vue'
import {
  buildPgmlWithNodeProperties,
  parsePgml,
  pgmlExample,
  stripPgmlPropertiesBlocks,
  type PgmlNodeProperties
} from '~/utils/pgml'

type PgmlDiagramCanvasExposed = {
  exportDiagram: (format: 'svg' | 'png', scaleFactor?: number) => Promise<void>
  exportPng: (scaleFactor: number) => Promise<void>
  exportSvg: () => Promise<void>
  getNodeLayoutProperties: () => Record<string, PgmlNodeProperties>
}

const source: Ref<string> = ref(pgmlExample)
const canvasRef: Ref<PgmlDiagramCanvasExposed | null> = ref(null)
const isExporting: Ref<boolean> = ref(false)
const exportScales = [1, 2, 3, 4, 8]
const { studioThemeIcon, studioThemeLabel, toggleStudioTheme } = useStudioTheme()
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
const actionMenuContent = {
  align: 'end' as const,
  side: 'bottom' as const,
  sideOffset: 6
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
  deleteSavedSchema,
  downloadSchema,
  formatSavedAt,
  includeLayoutInSchema,
  loadDialogOpen,
  loadExample,
  loadSavedSchema,
  openSchemaDialog,
  orderedSavedSchemas,
  saveSchemaToBrowser,
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
    exportItems,
    [
      {
        label: studioThemeLabel.value,
        icon: studioThemeIcon.value,
        onSelect: toggleStudioTheme
      }
    ]
  ]
})

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
</script>

<template>
  <div>
    <div
      ref="layoutShellRef"
      class="grid h-screen min-h-0 w-full gap-0 overflow-hidden bg-[color:var(--studio-shell-bg)] text-[color:var(--studio-shell-text)] max-[1100px]:h-auto"
      :style="studioLayoutStyle"
    >
      <aside
        data-editor-panel="true"
        class="min-h-0 overflow-hidden border-r border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)] pr-0 max-[1100px]:border-r-0"
      >
        <div class="flex h-full min-h-0 flex-col bg-[color:var(--studio-shell-bg)]">
          <div class="flex items-center justify-between gap-2 border-b border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)] px-3 py-2">
            <div class="flex items-center gap-2">
              <UButton
                to="/"
                icon="i-lucide-arrow-left"
                color="neutral"
                variant="ghost"
                class="rounded-none text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
                aria-label="Back to home"
              />
              <span class="font-mono text-[0.72rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">PGML</span>
            </div>

            <ClientOnly>
              <UDropdownMenu
                :items="actionMenuItems"
                :content="actionMenuContent"
                :ui="{
                  content: 'min-w-[14rem] rounded-none border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] p-1 shadow-[var(--studio-floating-shadow)] backdrop-blur-sm',
                  group: 'p-0',
                  separator: 'my-1 bg-[color:var(--studio-shell-border)]',
                  item: 'rounded-none px-2 py-1.5 text-[0.78rem] text-[color:var(--studio-shell-text)] data-[highlighted]:bg-[color:var(--studio-surface-hover)] data-[highlighted]:text-[color:var(--studio-shell-text)]',
                  itemLeadingIcon: 'text-[color:var(--studio-shell-muted)]',
                  itemLabel: 'truncate'
                }"
              >
                <UButton
                  icon="i-lucide-ellipsis"
                  color="neutral"
                  variant="ghost"
                  class="rounded-none text-[color:var(--studio-shell-muted)] hover:bg-[color:var(--studio-surface-hover)] hover:text-[color:var(--studio-shell-text)]"
                  aria-label="Studio actions"
                  :loading="isExporting"
                />
              </UDropdownMenu>

              <template #fallback>
                <UButton
                  icon="i-lucide-ellipsis"
                  color="neutral"
                  variant="ghost"
                  class="rounded-none text-[color:var(--studio-shell-muted)]"
                  aria-label="Studio actions"
                  disabled
                />
              </template>
            </ClientOnly>
          </div>

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
            class="flex w-[calc(100vw-2rem)] max-w-lg flex-col overflow-hidden rounded-none border"
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
              <UInput
                v-model="currentSchemaName"
                placeholder="Schema name"
                color="neutral"
                variant="outline"
                size="sm"
                :ui="{
                  base: 'rounded-none bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]'
                }"
              />

              <USwitch
                v-model="includeLayoutInSchema"
                color="neutral"
                size="sm"
                :disabled="!canEmbedLayout"
                label="Include current layout"
                description="Embed canvas positions, floating object sizes, and table column settings into the PGML text."
                :ui="{
                  wrapper: 'gap-1',
                  label: 'text-[0.78rem] text-[color:var(--studio-shell-text)]',
                  description: 'text-[0.7rem] text-[color:var(--studio-shell-muted)]'
                }"
              />
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
                label="Save to browser"
                color="neutral"
                variant="outline"
                class="rounded-none"
                @click="saveSchemaToBrowser"
              />
              <UButton
                v-else
                label="Download .pgml"
                color="neutral"
                variant="outline"
                class="rounded-none"
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
    </ClientOnly>
  </div>
</template>
