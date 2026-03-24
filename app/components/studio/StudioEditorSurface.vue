<script setup lang="ts">
import type { PgmlLanguageDiagnostic } from '~/utils/pgml-language'
import PgmlSourceCodeEditor from '~/components/pgml/PgmlSourceCodeEditor.vue'

const source = defineModel<string>({
  required: true
})

const {
  editorRefSetter,
  focusDiagnostic,
  sourceDiagnostics,
  sourceErrorCount,
  sourceWarningCount,
  visibleSourceDiagnostics
} = defineProps<{
  editorRefSetter: (value: unknown) => void
  focusDiagnostic: (diagnostic: PgmlLanguageDiagnostic) => void
  sourceDiagnostics: PgmlLanguageDiagnostic[]
  sourceErrorCount: number
  sourceWarningCount: number
  visibleSourceDiagnostics: PgmlLanguageDiagnostic[]
}>()
</script>

<template>
  <aside
    data-editor-panel="true"
    class="flex h-full min-h-0 flex-col overflow-hidden bg-[color:var(--studio-shell-bg)] pr-0"
  >
    <div class="min-h-0 flex-1 overflow-hidden bg-[color:var(--studio-shell-bg)]">
      <PgmlSourceCodeEditor
        :ref="editorRefSetter"
        v-model="source"
        placeholder="Paste PGML here..."
      />
    </div>

    <div
      v-if="sourceDiagnostics.length > 0"
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
            L{{ diagnostic.line }}
          </button>
          <span
            :class="diagnostic.severity === 'error' ? 'text-[color:var(--studio-shell-error)]' : 'text-[color:var(--studio-shell-muted)]'"
          >
            {{ diagnostic.message }}
          </span>
        </li>
      </ul>
    </div>
  </aside>
</template>
