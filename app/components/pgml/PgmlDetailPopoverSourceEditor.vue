<script setup lang="ts">
import PgmlSourceCodeEditor from '~/components/pgml/PgmlSourceCodeEditor.vue'
import { analyzePgmlDocument } from '~/utils/pgml-language'
import {
  joinStudioClasses,
  studioCompactBodyCopyClass,
  studioEmptyStateClass,
  studioPanelSurfaceClass
} from '~/utils/uiStyles'

const {
  description = '',
  languageMode = 'pgml',
  modelValue,
  originalValue,
  title = 'Editing PGML block',
  readOnly = false
} = defineProps<{
  description?: string
  languageMode?: 'pgml' | 'pgml-snippet' | 'sql'
  modelValue: string
  originalValue: string
  title?: string
  readOnly?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const diagnostics = computed(() => {
  return languageMode === 'pgml'
    ? analyzePgmlDocument(modelValue).diagnostics
    : []
})
const errorCount = computed(() => {
  return diagnostics.value.filter(diagnostic => diagnostic.severity === 'error').length
})
const warningCount = computed(() => {
  return diagnostics.value.filter(diagnostic => diagnostic.severity === 'warning').length
})
const hasChanges = computed(() => modelValue !== originalValue)
const visibleDiagnostics = computed(() => diagnostics.value.slice(0, 4))
const editorStateLabel = computed(() => {
  if (readOnly) {
    return 'Read only'
  }

  if (!hasChanges.value) {
    return 'No local changes yet'
  }

  if (errorCount.value > 0) {
    return `${errorCount.value} error${errorCount.value === 1 ? '' : 's'} in this block`
  }

  if (warningCount.value > 0) {
    return `${warningCount.value} warning${warningCount.value === 1 ? '' : 's'} in this block`
  }

  return 'Ready to apply'
})
const editorLanguageLabel = computed(() => {
  if (languageMode === 'sql') {
    return 'SQL source'
  }

  return languageMode === 'pgml-snippet' ? 'PGML snippet' : 'PGML block'
})
const helperDescription = computed(() => {
  if (description.trim().length > 0) {
    return description
  }

  return languageMode === 'sql'
    ? 'Edit the executable SQL directly with syntax highlighting, bracket pairing, and SQL-aware editing behaviors.'
    : languageMode === 'pgml-snippet'
      ? 'Edit the selected inline PGML snippet with syntax highlighting and completions without full-document validation.'
      : 'Edit the selected PGML block directly with the same editor engine used in the main source workspace.'
})
const editorPlaceholder = computed(() => {
  if (languageMode === 'sql') {
    return 'Edit the SQL source'
  }

  return languageMode === 'pgml-snippet' ? 'Edit the selected PGML snippet' : 'Edit the selected PGML block'
})
</script>

<template>
  <div
    data-detail-popover-source-editor="true"
    class="grid gap-2"
  >
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
          {{ title }}
        </div>
        <p :class="studioCompactBodyCopyClass">
          {{ helperDescription }}
        </p>
      </div>
      <div class="shrink-0 text-[0.62rem] text-[color:var(--studio-shell-muted)]">
        {{ editorStateLabel }}
      </div>
    </div>

    <div class="h-72 min-h-[16rem] overflow-hidden border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)]">
      <PgmlSourceCodeEditor
        :language-mode="languageMode"
        :model-value="modelValue"
        :placeholder="editorPlaceholder"
        :read-only="readOnly"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </div>

    <div class="flex flex-wrap gap-2 text-[0.58rem]">
      <span class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
        {{ editorLanguageLabel }}
      </span>
      <span class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
        {{ hasChanges ? 'Unsaved edits' : 'No edits' }}
      </span>
      <span class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
        {{ errorCount }} error{{ errorCount === 1 ? '' : 's' }}
      </span>
      <span class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
        {{ warningCount }} warning{{ warningCount === 1 ? '' : 's' }}
      </span>
    </div>

    <div
      v-if="languageMode === 'pgml' && visibleDiagnostics.length > 0"
      :class="joinStudioClasses(studioPanelSurfaceClass, 'grid gap-1 px-3 py-3')"
    >
      <div class="font-mono text-[0.56rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
        Diagnostics
      </div>
      <div
        v-for="diagnostic in visibleDiagnostics"
        :key="`${diagnostic.code}-${diagnostic.from}-${diagnostic.to}`"
        class="text-[0.64rem] leading-5 text-[color:var(--studio-shell-muted)]"
      >
        Line {{ diagnostic.line }}: {{ diagnostic.message }}
      </div>
    </div>

    <div
      v-else
      :class="studioEmptyStateClass"
    >
      {{
        languageMode === 'sql'
          ? 'SQL syntax highlighting is active for this source block.'
          : languageMode === 'pgml-snippet'
            ? 'PGML snippet highlighting is active without full-document validation.'
            : 'No diagnostics for this block.'
      }}
    </div>
  </div>
</template>
