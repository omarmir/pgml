<script setup lang="ts">
import type { Ref } from 'vue'
import { computed, ref } from 'vue'
import PgmlDiagramCompareEntryExpansion from '~/components/pgml/PgmlDiagramCompareEntryExpansion.vue'
import type { PgmlSourceRange } from '~/utils/pgml'
import {
  buildPgmlDiagramCompareScopeChangeCountLabel,
  buildPgmlDiagramCompareScopeSummary,
  getPgmlDiagramCompareChangeColor,
  getPgmlDiagramCompareChangeVerb,
  getPgmlDiagramCompareEntityKindLabel,
  getPgmlDiagramCompareGroupedScopeKindLabel,
  type PgmlDiagramCompareEntry
} from '~/utils/pgml-diagram-compare'

const {
  baseLabel,
  entries,
  section,
  selectedDiagramContextIds = [],
  selectedEntryId = null,
  showFieldDiffs = true,
  showSnapshotDiff = false,
  targetLabel
} = defineProps<{
  baseLabel: string
  entries: PgmlDiagramCompareEntry[]
  section: 'context' | 'results'
  selectedDiagramContextIds?: string[]
  selectedEntryId?: string | null
  showFieldDiffs?: boolean
  showSnapshotDiff?: boolean
  targetLabel: string
}>()

const emit = defineEmits<{
  'focus-source': [sourceRange: PgmlSourceRange]
  'focus-target': [entryId: string]
  'select-entry': [entryId: string | null]
}>()

type PgmlDiagramCompareEntryListItem = {
  entry: PgmlDiagramCompareEntry
  key: string
  kind: 'entry'
} | {
  entries: PgmlDiagramCompareEntry[]
  key: string
  kind: 'scope'
  scopeChangeCountLabel: string
  scopeKindLabel: string
  scopeId: string
  scopeLabel: string
  summary: string
}

const expandedScopeIds: Ref<string[]> = ref([])

const selectedDiagramContextIdSet = computed(() => {
  return new Set(selectedDiagramContextIds)
})

const buildEntryRowAttributes = (entryId: string) => {
  return section === 'context'
    ? {
        'data-compare-context-entry-row': entryId
      }
    : {
        'data-compare-entry-row': entryId
      }
}

const buildEntryButtonAttributes = (entryId: string) => {
  return section === 'context'
    ? {
        'data-compare-context-entry': entryId
      }
    : {
        'data-compare-entry': entryId
      }
}

const getChangeBadgeStyle = (entry: PgmlDiagramCompareEntry) => {
  const color = getPgmlDiagramCompareChangeColor(entry.changeKind)

  return {
    backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} 58%, var(--studio-divider) 42%)`,
    color: `color-mix(in srgb, ${color} 80%, var(--studio-shell-text) 20%)`
  }
}

const listItems = computed<PgmlDiagramCompareEntryListItem[]>(() => {
  const entriesByScopeId = entries.reduce<Map<string, PgmlDiagramCompareEntry[]>>((scopes, entry) => {
    const existingEntries = scopes.get(entry.scopeId)

    if (existingEntries) {
      existingEntries.push(entry)
      return scopes
    }

    scopes.set(entry.scopeId, [entry])
    return scopes
  }, new Map())
  const seenScopeIds = new Set<string>()

  return entries.reduce<PgmlDiagramCompareEntryListItem[]>((items, entry) => {
    const scopeEntries = entriesByScopeId.get(entry.scopeId) || []
    const shouldGroupScope = entry.scopeKind === 'table' && scopeEntries.length > 1

    if (!shouldGroupScope) {
      items.push({
        entry,
        key: entry.id,
        kind: 'entry'
      })
      return items
    }

    if (seenScopeIds.has(entry.scopeId)) {
      return items
    }

    seenScopeIds.add(entry.scopeId)

    items.push({
      entries: scopeEntries,
      key: entry.scopeId,
      kind: 'scope',
      scopeChangeCountLabel: buildPgmlDiagramCompareScopeChangeCountLabel(scopeEntries.length),
      scopeKindLabel: getPgmlDiagramCompareGroupedScopeKindLabel('table'),
      scopeId: entry.scopeId,
      scopeLabel: scopeEntries.find(scopeEntry => scopeEntry.entityKind === 'table')?.label || entry.scopeLabel,
      summary: buildPgmlDiagramCompareScopeSummary(scopeEntries)
    })

    return items
  }, [])
})

const isEntrySelected = (entryId: string) => {
  return selectedEntryId === entryId
}

const isEntryExpanded = (entryId: string) => {
  return selectedEntryId === entryId
}

const isEntryOnDiagram = (entryId: string) => {
  return selectedDiagramContextIdSet.value.has(entryId)
}

const isScopeExpanded = (
  scopeId: string,
  scopeEntries: PgmlDiagramCompareEntry[]
) => {
  return expandedScopeIds.value.includes(scopeId) || scopeEntries.some(entry => entry.id === selectedEntryId)
}

const isScopeSelected = (scopeEntries: PgmlDiagramCompareEntry[]) => {
  return scopeEntries.some(entry => entry.id === selectedEntryId)
}

const isScopeOnDiagram = (scopeEntries: PgmlDiagramCompareEntry[]) => {
  return scopeEntries.some(entry => selectedDiagramContextIdSet.value.has(entry.id))
}

const toggleEntrySelection = (entryId: string) => {
  emit('select-entry', selectedEntryId === entryId ? null : entryId)
}

const toggleScopeExpansion = (
  scopeId: string,
  scopeEntries: PgmlDiagramCompareEntry[]
) => {
  const nextExpanded = isScopeExpanded(scopeId, scopeEntries)
    ? expandedScopeIds.value.filter(value => value !== scopeId)
    : [...expandedScopeIds.value, scopeId]

  if (scopeEntries.some(entry => entry.id === selectedEntryId)) {
    emit('select-entry', null)
  }

  expandedScopeIds.value = nextExpanded
}
</script>

<template>
  <div class="grid min-w-0 gap-2">
    <template
      v-for="item in listItems"
      :key="item.key"
    >
      <div
        v-if="item.kind === 'entry'"
        v-bind="buildEntryRowAttributes(item.entry.id)"
        class="overflow-hidden border transition-colors duration-150"
        :class="isEntrySelected(item.entry.id) ? 'border-[color:var(--studio-ring)] bg-[color:var(--studio-input-bg)]' : 'border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)]'"
      >
        <button
          v-bind="buildEntryButtonAttributes(item.entry.id)"
          type="button"
          class="grid min-w-0 w-full gap-1 px-3 py-2 text-left transition-colors duration-150 cursor-default"
          :class="isEntrySelected(item.entry.id) ? 'bg-transparent' : 'hover:bg-[color:var(--studio-surface-hover)]'"
          :aria-expanded="isEntryExpanded(item.entry.id)"
          @click="toggleEntrySelection(item.entry.id)"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="border px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.08em]"
              :style="getChangeBadgeStyle(item.entry)"
            >
              {{ getPgmlDiagramCompareChangeVerb(item.entry.changeKind) }}
            </span>
            <span class="font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
              {{ getPgmlDiagramCompareEntityKindLabel(item.entry.entityKind) }}
            </span>
            <span
              v-if="isEntryOnDiagram(item.entry.id)"
              class="border border-[color:var(--studio-ring)] px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-text)]"
            >
              On diagram
            </span>
          </div>
          <div class="min-w-0 break-words text-[0.76rem] font-semibold text-[color:var(--studio-shell-text)] [overflow-wrap:anywhere]">
            {{ item.entry.label }}
          </div>
          <div class="min-w-0 break-words text-[0.66rem] leading-5 text-[color:var(--studio-shell-muted)] [overflow-wrap:anywhere]">
            {{ item.entry.description }}
          </div>
        </button>

        <PgmlDiagramCompareEntryExpansion
          v-if="isEntryExpanded(item.entry.id)"
          :base-label="baseLabel"
          :entry="item.entry"
          :show-field-diffs="showFieldDiffs"
          :show-snapshot-diff="showSnapshotDiff"
          :target-label="targetLabel"
          @focus-source="emit('focus-source', $event)"
          @focus-target="emit('focus-target', $event)"
        />
      </div>

      <div
        v-else
        :data-compare-scope-row="item.scopeId"
        class="overflow-hidden border transition-colors duration-150"
        :class="isScopeSelected(item.entries) ? 'border-[color:var(--studio-ring)] bg-[color:var(--studio-input-bg)]' : 'border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)]'"
      >
        <button
          type="button"
          :data-compare-scope-entry="item.scopeId"
          class="grid min-w-0 w-full gap-1 px-3 py-2 text-left transition-colors duration-150 cursor-default"
          :class="isScopeSelected(item.entries) ? 'bg-transparent' : 'hover:bg-[color:var(--studio-surface-hover)]'"
          :aria-expanded="isScopeExpanded(item.scopeId, item.entries)"
          @click="toggleScopeExpansion(item.scopeId, item.entries)"
        >
          <div class="flex flex-wrap items-center gap-2">
            <span class="font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
              {{ item.scopeKindLabel }}
            </span>
            <span class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
              {{ item.scopeChangeCountLabel }}
            </span>
            <span
              v-if="isScopeOnDiagram(item.entries)"
              class="border border-[color:var(--studio-ring)] px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-text)]"
            >
              On diagram
            </span>
          </div>
          <div class="min-w-0 break-words text-[0.76rem] font-semibold text-[color:var(--studio-shell-text)] [overflow-wrap:anywhere]">
            {{ item.scopeLabel }}
          </div>
          <div class="min-w-0 break-words text-[0.66rem] leading-5 text-[color:var(--studio-shell-muted)] [overflow-wrap:anywhere]">
            {{ item.summary }}
          </div>
        </button>

        <div
          v-if="isScopeExpanded(item.scopeId, item.entries)"
          class="grid border-t border-[color:var(--studio-divider)]"
        >
          <div
            v-for="entry in item.entries"
            :key="entry.id"
            v-bind="buildEntryRowAttributes(entry.id)"
            class="grid min-w-0 border-t border-[color:var(--studio-divider)] first:border-t-0"
            :class="isEntrySelected(entry.id) ? 'bg-[color:var(--studio-input-bg)]/65' : 'bg-transparent'"
          >
            <button
              v-bind="buildEntryButtonAttributes(entry.id)"
              type="button"
              class="grid min-w-0 w-full gap-1 px-4 py-2 text-left transition-colors duration-150 cursor-default"
              :class="isEntrySelected(entry.id) ? 'bg-transparent' : 'hover:bg-[color:var(--studio-surface-hover)]'"
              :aria-expanded="isEntryExpanded(entry.id)"
              @click="toggleEntrySelection(entry.id)"
            >
              <div class="flex flex-wrap items-center gap-2">
                <span
                  class="border px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.08em]"
                  :style="getChangeBadgeStyle(entry)"
                >
                  {{ getPgmlDiagramCompareChangeVerb(entry.changeKind) }}
                </span>
                <span class="font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
                  {{ getPgmlDiagramCompareEntityKindLabel(entry.entityKind) }}
                </span>
                <span
                  v-if="isEntryOnDiagram(entry.id)"
                  class="border border-[color:var(--studio-ring)] px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-text)]"
                >
                  On diagram
                </span>
              </div>
              <div class="min-w-0 break-words text-[0.76rem] font-semibold text-[color:var(--studio-shell-text)] [overflow-wrap:anywhere]">
                {{ entry.label }}
              </div>
              <div class="min-w-0 break-words text-[0.66rem] leading-5 text-[color:var(--studio-shell-muted)] [overflow-wrap:anywhere]">
                {{ entry.description }}
              </div>
            </button>

            <PgmlDiagramCompareEntryExpansion
              v-if="isEntryExpanded(entry.id)"
              :base-label="baseLabel"
              :entry="entry"
              :show-field-diffs="showFieldDiffs"
              :show-snapshot-diff="showSnapshotDiff"
              :target-label="targetLabel"
              @focus-source="emit('focus-source', $event)"
              @focus-target="emit('focus-target', $event)"
            />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
