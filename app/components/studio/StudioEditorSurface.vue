<script setup lang="ts">
import type { PgmlLanguageDiagnostic } from '~/utils/pgml-language'
import PgmlSourceCodeEditor from '~/components/pgml/PgmlSourceCodeEditor.vue'

const source = defineModel<string>({
  required: true
})

const {
  editorMode,
  editorModeItems = [],
  editorRefSetter,
  focusDiagnostic,
  modeDescription = '',
  readOnly = false,
  readOnlyLabel = 'Read only',
  sourceDiagnostics,
  sourceErrorCount,
  sourceWarningCount,
  visibleSourceDiagnostics
} = defineProps<{
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
  visibleSourceDiagnostics: PgmlLanguageDiagnostic[]
}>()

const emit = defineEmits<{
  'update:editorMode': [value: string]
}>()
const formatDiagnosticLineLabel = (diagnostic: PgmlLanguageDiagnostic) => {
  const lines = diagnostic.lines && diagnostic.lines.length > 0
    ? diagnostic.lines
    : [diagnostic.line]

  return lines.map(line => `L${line}`).join(', ')
}
const hiddenDiagnosticCount = computed(() => {
  return Math.max(0, sourceDiagnostics.length - visibleSourceDiagnostics.length)
})
const hasDiagnostics = computed(() => sourceDiagnostics.length > 0)
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

        <span
          v-if="readOnly"
          class="border border-[color:var(--studio-shell-border)] px-2 py-1 font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]"
        >
          {{ readOnlyLabel }}
        </span>
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
        </span>
      </div>

      <ul class="grid gap-1.5">
        <li
          v-for="diagnostic in visibleSourceDiagnostics"
          :key="`${diagnostic.code}:${diagnostic.from}:${diagnostic.line}`"
          class="flex gap-2"
        >
          <button
            type="button"
            class="min-w-12 cursor-pointer text-left uppercase tracking-[0.08em] underline-offset-2 hover:underline focus-visible:underline"
            data-pgml-diagnostic-line="true"
            :class="diagnostic.severity === 'error' ? 'text-[color:var(--studio-shell-error)]' : 'text-[color:var(--studio-shell-label)]'"
            @click="focusDiagnostic(diagnostic)"
          >
            {{ formatDiagnosticLineLabel(diagnostic) }}
          </button>
          <span
            :class="diagnostic.severity === 'error' ? 'text-[color:var(--studio-shell-error)]' : 'text-[color:var(--studio-shell-muted)]'"
          >
            {{ diagnostic.message }}
          </span>
        </li>
      </ul>

      <div
        v-if="hiddenDiagnosticCount > 0"
        data-pgml-diagnostics-overflow="true"
        class="border-t border-[color:var(--studio-shell-border)] pt-2 text-[0.66rem] leading-5 text-[color:var(--studio-shell-muted)]"
      >
        Showing first {{ visibleSourceDiagnostics.length }} of {{ sourceDiagnostics.length }} diagnostics.
      </div>
    </div>

    <div
      v-else
      class="border-t border-[color:var(--studio-shell-border)] px-4 py-2 font-mono text-[0.62rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]"
    >
      No diagnostics
    </div>
  </aside>
</template>
