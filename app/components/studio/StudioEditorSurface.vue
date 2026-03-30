<script setup lang="ts">
import type { PgmlLanguageDiagnostic } from '~/utils/pgml-language'
import PgmlSourceCodeEditor from '~/components/pgml/PgmlSourceCodeEditor.vue'
import { studioSelectUi } from '~/constants/ui'
import { groupPgmlDiagnostics } from '~/utils/pgml-diagnostics'

const source = defineModel<string>({
  required: true
})

const {
  activateCompletionOnTyping = true,
  commitDebounceMs = 0,
  diagnosticsDelayMs = 150,
  documentScope = 'all',
  documentScopeItems = [],
  editorMode,
  editorModeItems = [],
  editorRefSetter,
  focusDiagnostic,
  modeDescription = '',
  readOnly = false,
  readOnlyLabel = 'Read only',
  sourceDiagnostics,
  sourceErrorCount,
  sourceWarningCount
} = defineProps<{
  activateCompletionOnTyping?: boolean
  commitDebounceMs?: number
  diagnosticsDelayMs?: number
  documentScope?: string
  documentScopeItems?: Array<{
    label: string
    value: string
  }>
  editorMode?: string
  editorModeItems?: Array<{
    label: string
    value: string
  }>
  editorRefSetter: (value: unknown) => void
  focusDiagnostic: (diagnostic: PgmlLanguageDiagnostic) => void
  modeDescription?: string
  readOnly?: boolean
  readOnlyLabel?: string
  sourceDiagnostics: PgmlLanguageDiagnostic[]
  sourceErrorCount: number
  sourceWarningCount: number
}>()

const emit = defineEmits<{
  'update:documentScope': [value: string]
  'update:editorMode': [value: string]
}>()
const groupedSourceDiagnostics = computed(() => groupPgmlDiagnostics(sourceDiagnostics))

const diagnosticGroupCount = computed(() => groupedSourceDiagnostics.value.length)
const hasDiagnostics = computed(() => sourceDiagnostics.length > 0)
const showDocumentScopeSelect = computed(() => {
  return editorMode === 'document' && documentScopeItems.length > 0
})
const normalizeDocumentScopeValue = (value: unknown) => {
  return typeof value === 'string' && value.trim().length > 0 ? value : 'all'
}
const updateDocumentScope = (value: unknown) => {
  // The select can clear itself while items are being replaced, so clamp those
  // transient empty emissions back to the full document view.
  emit('update:documentScope', normalizeDocumentScopeValue(value))
}
</script>

<template>
  <aside
    data-editor-panel="true"
    class="flex h-full min-h-0 flex-col overflow-hidden bg-[color:var(--studio-shell-bg)] pr-0"
  >
    <div
      v-if="editorModeItems.length > 0"
      class="grid shrink-0 gap-2 border-b border-[color:var(--studio-shell-border)] px-3 py-2"
    >
      <div class="flex items-start justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <button
            v-for="item in editorModeItems"
            :key="item.value"
            type="button"
            class="border px-2.5 py-1 font-mono text-[0.6rem] uppercase tracking-[0.08em] transition-colors duration-150"
            :class="editorMode === item.value
              ? 'border-[color:var(--studio-ring)] bg-[color:var(--studio-input-bg)] text-[color:var(--studio-shell-text)]'
              : 'border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] text-[color:var(--studio-shell-muted)]'"
            @click="emit('update:editorMode', item.value)"
          >
            {{ item.label }}
          </button>
        </div>

        <div class="flex flex-col items-end gap-2">
          <USelect
            v-if="showDocumentScopeSelect"
            data-document-scope-select="true"
            class="min-w-[14rem]"
            :items="documentScopeItems"
            :model-value="documentScope"
            value-key="value"
            label-key="label"
            color="neutral"
            variant="outline"
            size="xs"
            :ui="studioSelectUi"
            @update:model-value="updateDocumentScope"
          />

          <span
            v-if="readOnly"
            class="border border-[color:var(--studio-shell-border)] px-2 py-1 font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]"
          >
            {{ readOnlyLabel }}
          </span>
        </div>
      </div>

      <p
        v-if="modeDescription.length > 0"
        class="text-[0.68rem] leading-5 text-[color:var(--studio-shell-muted)]"
      >
        {{ modeDescription }}
      </p>
    </div>

    <div class="min-h-0 flex-1 overflow-hidden bg-[color:var(--studio-shell-bg)]">
      <PgmlSourceCodeEditor
        :ref="editorRefSetter"
        v-model="source"
        :activate-completion-on-typing="activateCompletionOnTyping"
        :commit-debounce-ms="commitDebounceMs"
        :diagnostics-delay-ms="diagnosticsDelayMs"
        :external-diagnostics="sourceDiagnostics"
        placeholder="Paste PGML here..."
        :read-only="readOnly"
      />
    </div>

    <div
      v-if="hasDiagnostics"
      data-pgml-diagnostics="true"
      class="grid shrink-0 gap-2 border-t border-[color:var(--studio-shell-border)] bg-[color:var(--studio-shell-bg)] px-4 py-3 font-mono text-[0.72rem] leading-6"
    >
      <div class="flex flex-wrap items-center justify-between gap-3">
        <span class="uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
          Diagnostics
        </span>
        <span class="text-[color:var(--studio-shell-muted)]">
          {{ sourceErrorCount }} error<span v-if="sourceErrorCount !== 1">s</span>
          <template v-if="sourceWarningCount > 0">
            · {{ sourceWarningCount }} warning<span v-if="sourceWarningCount !== 1">s</span>
          </template>
          <template v-if="diagnosticGroupCount > 0">
            · {{ diagnosticGroupCount }} group<span v-if="diagnosticGroupCount !== 1">s</span>
          </template>
        </span>
      </div>

      <ul class="grid max-h-64 gap-2 overflow-y-auto pr-1">
        <li
          v-for="group in groupedSourceDiagnostics"
          :key="group.key"
          class="border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)]"
        >
          <details data-pgml-diagnostic-group="true">
            <summary
              data-pgml-diagnostic-group-summary="true"
              class="flex cursor-default list-none items-start justify-between gap-3 px-3 py-2 marker:hidden"
            >
              <span
                class="min-w-0 flex-1"
                :class="group.severity === 'error' ? 'text-[color:var(--studio-shell-error)]' : 'text-[color:var(--studio-shell-muted)]'"
              >
                {{ group.message }}
              </span>
              <span class="shrink-0 uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
                {{ group.lineEntries.length }} line<span v-if="group.lineEntries.length !== 1">s</span>
              </span>
            </summary>

            <div class="grid gap-2 border-t border-[color:var(--studio-shell-border)] px-3 py-2">
              <span class="uppercase tracking-[0.08em] text-[0.64rem] text-[color:var(--studio-shell-muted)]">
                Lines
              </span>

              <div class="flex flex-wrap gap-2">
                <button
                  v-for="entry in group.lineEntries"
                  :key="`${group.key}:${entry.line}`"
                  type="button"
                  class="cursor-pointer border border-[color:var(--studio-shell-border)] px-2 py-1 text-left uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)] underline-offset-2 hover:underline focus-visible:underline"
                  data-pgml-diagnostic-line="true"
                  @click="focusDiagnostic(entry.diagnostic)"
                >
                  L{{ entry.line }}
                </button>
              </div>
            </div>
          </details>
        </li>
      </ul>
    </div>

    <div
      v-else
      class="border-t border-[color:var(--studio-shell-border)] px-4 py-2 font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]"
    >
      No diagnostics
    </div>
  </aside>
</template>
