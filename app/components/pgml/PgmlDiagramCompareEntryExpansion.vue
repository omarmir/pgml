<script setup lang="ts">
import type { PgmlSourceRange } from '~/utils/pgml'
import type { PgmlDiagramCompareEntry } from '~/utils/pgml-diagram-compare'
import {
  joinStudioClasses,
  studioButtonClasses
} from '~/utils/uiStyles'

const {
  baseLabel,
  entry,
  targetLabel
} = defineProps<{
  baseLabel: string
  entry: PgmlDiagramCompareEntry
  targetLabel: string
}>()

const emit = defineEmits<{
  'focus-source': [sourceRange: PgmlSourceRange]
  'focus-target': [entryId: string]
}>()

const secondaryButtonClass = joinStudioClasses(studioButtonClasses.secondary, 'text-[0.62rem]')
const primaryButtonClass = joinStudioClasses(studioButtonClasses.primary, 'text-[0.62rem]')

const getFieldValue = (
  value: string | null,
  versionLabel: string
) => {
  return value || `Not present in ${versionLabel}.`
}

const getSnapshotValue = (
  value: string | null,
  versionLabel: string
) => {
  return value || `Not present in ${versionLabel}.`
}
</script>

<template>
  <div
    data-compare-entry-detail="true"
    class="grid gap-3 border-t border-[color:var(--studio-divider)] px-3 py-3"
  >
    <div class="flex flex-wrap items-center justify-end gap-2">
      <UButton
        label="Show on diagram"
        color="neutral"
        variant="soft"
        size="xs"
        :class="primaryButtonClass"
        @click="emit('focus-target', entry.id)"
      />
      <UButton
        v-if="entry.sourceRange"
        label="Focus source"
        color="neutral"
        variant="outline"
        size="xs"
        :class="secondaryButtonClass"
        @click="emit('focus-source', entry.sourceRange)"
      />
    </div>

    <div
      v-if="entry.fields.length > 0"
      class="grid gap-2"
    >
      <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
        Changed fields
      </div>

      <div class="grid gap-2">
        <div
          v-for="field in entry.fields"
          :key="field.id"
          class="grid gap-2 border border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)] px-3 py-3"
        >
          <div class="font-mono text-[0.56rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
            {{ field.label }}
          </div>
          <div class="grid gap-2 text-[0.66rem] text-[color:var(--studio-shell-muted)] sm:grid-cols-2">
            <div class="min-w-0">
              <div class="font-mono uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
                {{ baseLabel }}
              </div>
              <pre class="mt-1 min-w-0 whitespace-pre-wrap break-words font-mono text-[0.62rem] leading-5 text-[color:var(--studio-shell-text)] [overflow-wrap:anywhere]">{{ getFieldValue(field.before, baseLabel) }}</pre>
            </div>
            <div class="min-w-0">
              <div class="font-mono uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
                {{ targetLabel }}
              </div>
              <pre class="mt-1 min-w-0 whitespace-pre-wrap break-words font-mono text-[0.62rem] leading-5 text-[color:var(--studio-shell-text)] [overflow-wrap:anywhere]">{{ getFieldValue(field.after, targetLabel) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="grid min-w-0 gap-2 md:grid-cols-2">
      <div class="grid min-w-0 gap-1">
        <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
          {{ baseLabel }}
        </div>
        <pre class="max-h-64 min-w-0 overflow-auto whitespace-pre-wrap break-words border border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)] px-3 py-3 text-[0.62rem] leading-5 text-[color:var(--studio-shell-text)] [overflow-wrap:anywhere]">{{ getSnapshotValue(entry.beforeSnapshot, baseLabel) }}</pre>
      </div>
      <div class="grid min-w-0 gap-1">
        <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
          {{ targetLabel }}
        </div>
        <pre class="max-h-64 min-w-0 overflow-auto whitespace-pre-wrap break-words border border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)] px-3 py-3 text-[0.62rem] leading-5 text-[color:var(--studio-shell-text)] [overflow-wrap:anywhere]">{{ getSnapshotValue(entry.afterSnapshot, targetLabel) }}</pre>
      </div>
    </div>
  </div>
</template>
