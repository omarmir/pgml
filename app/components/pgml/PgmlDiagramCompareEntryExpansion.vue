<script setup lang="ts">
import type { PgmlCompareNote, PgmlSourceRange } from '~/utils/pgml'
import {
  buildPgmlCompareDiffLines,
  type PgmlCompareDiffLine,
  type PgmlCompareDiffLineKind
} from '~/utils/pgml-compare-diff'
import type { PgmlDiagramCompareEntry } from '~/utils/pgml-diagram-compare'
import {
  joinStudioClasses,
  studioPanelActionButtonClass
} from '~/utils/uiStyles'

const {
  baseLabel,
  canEditNote = false,
  entry,
  note = null,
  showFieldDiffs = true,
  showSnapshotDiff = false,
  targetLabel
} = defineProps<{
  baseLabel: string
  canEditNote?: boolean
  entry: PgmlDiagramCompareEntry
  note?: PgmlCompareNote | null
  showFieldDiffs?: boolean
  showSnapshotDiff?: boolean
  targetLabel: string
}>()

const emit = defineEmits<{
  'edit-note': [entryId: string]
  'focus-source': [sourceRange: PgmlSourceRange]
  'focus-target': [entryId: string]
}>()

const actionButtonClass = joinStudioClasses(studioPanelActionButtonClass, 'justify-center')
const diffLineClassByKind: Readonly<Record<PgmlCompareDiffLineKind, string>> = Object.freeze({
  added: 'bg-emerald-500/10 text-emerald-200 sm:text-emerald-300',
  context: 'text-[color:var(--studio-shell-text)]',
  removed: 'bg-rose-500/10 text-rose-200 sm:text-rose-300'
})
const diffPrefixClassByKind: Readonly<Record<PgmlCompareDiffLineKind, string>> = Object.freeze({
  added: 'text-emerald-300 sm:text-emerald-400',
  context: 'text-[color:var(--studio-shell-muted)]',
  removed: 'text-rose-300 sm:text-rose-400'
})
const diffLegendBadgeClass = 'inline-flex items-center gap-2 border border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)] px-2 py-1 font-mono text-[0.56rem] uppercase tracking-[0.08em]'
const compareNoteFlagClassByValue: Readonly<Record<PgmlCompareNote['flag'], string>> = Object.freeze({
  blocked: 'border-rose-500/40 bg-rose-500/10 text-rose-200 sm:text-rose-300',
  fixed: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 sm:text-emerald-300',
  ignore: 'border-slate-500/40 bg-slate-500/10 text-slate-200 sm:text-slate-300',
  pending: 'border-amber-500/40 bg-amber-500/10 text-amber-200 sm:text-amber-300'
})
const compareNoteFlagLabelByValue: Readonly<Record<PgmlCompareNote['flag'], string>> = Object.freeze({
  blocked: 'Blocked',
  fixed: 'Fixed',
  ignore: 'Ignore',
  pending: 'Pending'
})

const getDiffValue = (
  value: string | null,
  versionLabel: string
) => {
  return value || `Not present in ${versionLabel}.`
}

const buildDiffLines = (
  beforeValue: string | null,
  afterValue: string | null
) => {
  return buildPgmlCompareDiffLines(
    getDiffValue(beforeValue, baseLabel),
    getDiffValue(afterValue, targetLabel)
  )
}

const getDiffLineClass = (line: PgmlCompareDiffLine) => {
  return diffLineClassByKind[line.kind]
}

const getDiffPrefixClass = (line: PgmlCompareDiffLine) => {
  return diffPrefixClassByKind[line.kind]
}

const getCompareNoteFlagClass = (flag: PgmlCompareNote['flag']) => {
  return compareNoteFlagClassByValue[flag]
}
</script>

<template>
  <div
    data-compare-entry-detail="true"
    class="grid gap-3 border-t border-[color:var(--studio-divider)] px-3 py-3"
  >
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <span
          data-compare-diff-legend="removed"
          :class="joinStudioClasses(diffLegendBadgeClass, 'text-rose-300 sm:text-rose-400')"
        >
          <span>-</span>
          <span>Only in {{ baseLabel }}</span>
        </span>
        <span
          data-compare-diff-legend="added"
          :class="joinStudioClasses(diffLegendBadgeClass, 'text-emerald-300 sm:text-emerald-400')"
        >
          <span>+</span>
          <span>Only in {{ targetLabel }}</span>
        </span>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-2">
        <UButton
          :label="note ? 'Edit note' : 'Add note'"
          color="neutral"
          variant="outline"
          size="sm"
          :class="actionButtonClass"
          :disabled="!canEditNote"
          @click="emit('edit-note', entry.id)"
        />
        <UButton
          label="Show on diagram"
          color="neutral"
          variant="outline"
          size="sm"
          :class="actionButtonClass"
          @click="emit('focus-target', entry.id)"
        />
        <UButton
          v-if="entry.sourceRange"
          label="Focus source"
          color="neutral"
          variant="outline"
          size="sm"
          :class="actionButtonClass"
          @click="emit('focus-source', entry.sourceRange)"
        />
      </div>
    </div>

    <div
      v-if="note"
      class="grid gap-2 border border-[color:var(--studio-divider)] bg-[color:var(--studio-shell-bg)]/40 px-3 py-3"
    >
      <div class="flex flex-wrap items-center gap-2">
        <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
          Compare note
        </div>
        <span
          class="inline-flex items-center border px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em]"
          :class="getCompareNoteFlagClass(note.flag)"
        >
          {{ compareNoteFlagLabelByValue[note.flag] }}
        </span>
      </div>
      <div class="whitespace-pre-wrap text-[0.7rem] leading-6 text-[color:var(--studio-shell-text)] [overflow-wrap:anywhere]">
        {{ note.note }}
      </div>
    </div>

    <div
      v-if="showFieldDiffs && entry.fields.length > 0"
      class="grid gap-2"
    >
      <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
        Structured diff
      </div>

      <div class="grid gap-0 border-t border-[color:var(--studio-divider)]">
        <div
          v-for="field in entry.fields"
          :key="field.id"
          class="grid gap-1.5 border-b border-[color:var(--studio-divider)] py-2 last:border-b-0"
        >
          <div class="font-mono text-[0.56rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
            {{ field.label }}
          </div>
          <div
            data-compare-diff-block="true"
            class="grid overflow-hidden border border-[color:var(--studio-divider)] bg-[color:var(--studio-shell-bg)]/40"
          >
            <div
              v-for="line in buildDiffLines(field.before, field.after)"
              :key="line.key"
              :data-compare-diff-kind="line.kind"
              class="grid min-w-0 grid-cols-[1.1rem_minmax(0,1fr)] gap-2 px-3 py-1.5 font-mono text-[0.62rem] leading-5 [overflow-wrap:anywhere]"
              :class="getDiffLineClass(line)"
            >
              <span :class="getDiffPrefixClass(line)">
                {{ line.prefix }}
              </span>
              <span class="min-w-0 whitespace-pre-wrap break-words">{{ line.content || ' ' }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="showSnapshotDiff"
      class="grid gap-2"
    >
      <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
        Snapshot diff
      </div>
      <div
        data-compare-diff-block="true"
        class="grid max-h-80 overflow-auto border border-[color:var(--studio-divider)] bg-[color:var(--studio-shell-bg)]/45"
      >
        <div
          v-for="line in buildDiffLines(entry.beforeSnapshot, entry.afterSnapshot)"
          :key="`snapshot:${line.key}`"
          :data-compare-diff-kind="line.kind"
          class="grid min-w-0 grid-cols-[1.1rem_minmax(0,1fr)] gap-2 px-3 py-1.5 font-mono text-[0.62rem] leading-5 [overflow-wrap:anywhere]"
          :class="getDiffLineClass(line)"
        >
          <span :class="getDiffPrefixClass(line)">
            {{ line.prefix }}
          </span>
          <span class="min-w-0 whitespace-pre-wrap break-words">{{ line.content || ' ' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
