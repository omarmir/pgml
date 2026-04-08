<script setup lang="ts">
import type { Ref } from 'vue'
import { computed, ref, watch } from 'vue'
import { studioSelectUi } from '~/constants/ui'
import {
  getPgmlDiagramCompareChangeColor,
  getPgmlDiagramCompareChangeVerb,
  getPgmlDiagramCompareEntityKindLabel,
  type PgmlDiagramCompareEntry
} from '~/utils/pgml-diagram-compare'
import type { PgmlSourceRange } from '~/utils/pgml'
import {
  joinStudioClasses,
  studioButtonClasses,
  studioCompactBodyCopyClass,
  studioCompactInputClass,
  studioEmptyStateClass
} from '~/utils/uiStyles'

const {
  baseLabel,
  comparisonItems = [],
  comparisonLabel = 'Current comparison',
  compareBaseId = null,
  compareOptions,
  compareTargetId,
  excludedGroupNames = [],
  excludedTableIds = [],
  entries,
  relationshipSummary = '',
  selectedComparisonId = null,
  selectedDiagramContextIds = [],
  selectedEntryId = null,
  targetLabel
} = defineProps<{
  baseLabel: string
  comparisonItems?: Array<{
    label: string
    value: string
  }>
  comparisonLabel?: string
  compareBaseId?: string | null
  compareOptions: Array<{
    label: string
    value: string
  }>
  compareTargetId: string
  excludedGroupNames?: string[]
  excludedTableIds?: string[]
  entries: PgmlDiagramCompareEntry[]
  relationshipSummary?: string
  selectedComparisonId?: string | null
  selectedDiagramContextIds?: string[]
  selectedEntryId?: string | null
  targetLabel: string
}>()

const emit = defineEmits<{
  'create-comparison': []
  'delete-comparison': []
  'edit-comparison-exclusions': []
  'focus-source': [sourceRange: PgmlSourceRange]
  'focus-target': [entryId: string]
  'rename-comparison': []
  'select-comparison': [comparisonId: string | null]
  'select-entry': [entryId: string]
  'update:compareBaseId': [value: string | null]
  'update:compareTargetId': [value: string]
}>()

type PgmlCompareFilterKind = 'all' | 'added' | 'modified' | 'removed'
type PgmlCompareStatKind = Exclude<PgmlCompareFilterKind, 'all'>

type PgmlCompareFilterOption = {
  label: string
  value: PgmlCompareFilterKind
}

const searchQuery: Ref<string> = ref('')
const filterKind: Ref<PgmlCompareFilterKind> = ref('all')
const filterButtonClass = joinStudioClasses(studioButtonClasses.secondary, 'text-[0.62rem]')
const activeFilterButtonClass = joinStudioClasses(studioButtonClasses.primary, 'text-[0.62rem]')
const compareStatLabelClass = 'font-mono text-[0.58rem] uppercase tracking-[0.08em]'
const compareOverviewSectionClass = 'grid min-w-0 gap-3 border-b border-[color:var(--studio-divider)] pb-3'
const compareDividerSectionClass = 'grid min-w-0 gap-3 border-t border-[color:var(--studio-divider)] pt-3'
const exclusionChipClass = 'border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]'
const currentComparisonOptionValue = '__current__'
const compareStatKinds: PgmlCompareStatKind[] = ['added', 'modified', 'removed']
const compareStatLabelByKind: Readonly<Record<PgmlCompareStatKind, string>> = Object.freeze({
  added: 'Added',
  modified: 'Modified',
  removed: 'Removed'
})
const compareFilterOptions: PgmlCompareFilterOption[] = [
  {
    label: 'All',
    value: 'all'
  },
  {
    label: 'Added',
    value: 'added'
  },
  {
    label: 'Modified',
    value: 'modified'
  },
  {
    label: 'Removed',
    value: 'removed'
  }
]
const hasExcludedEntities = computed(() => {
  return excludedGroupNames.length > 0 || excludedTableIds.length > 0
})
const exclusionSummary = computed(() => {
  return `${excludedGroupNames.length} excluded group${excludedGroupNames.length === 1 ? '' : 's'} · ${excludedTableIds.length} excluded table${excludedTableIds.length === 1 ? '' : 's'}`
})
const visibleExcludedLabels = computed(() => {
  return [
    ...excludedGroupNames.map(groupName => `Group ${groupName}`),
    ...excludedTableIds.map(tableId => `Table ${tableId}`)
  ].slice(0, 6)
})
const hiddenExcludedLabelCount = computed(() => {
  return excludedGroupNames.length + excludedTableIds.length - visibleExcludedLabels.value.length
})
const comparisonSelectOptions = computed(() => {
  return [
    {
      label: 'Current comparison',
      value: currentComparisonOptionValue
    },
    ...comparisonItems
  ]
})
const hasSavedComparison = computed(() => selectedComparisonId !== null)
const buildEntrySearchHaystack = (entry: PgmlDiagramCompareEntry) => {
  return [
    entry.label,
    entry.description,
    entry.entityKind,
    entry.changedFields.join(' '),
    entry.fields.map(field => `${field.label} ${field.before || ''} ${field.after || ''}`).join(' ')
  ].join(' ').toLowerCase()
}
const entryMatchesCurrentFilters = (
  entry: PgmlDiagramCompareEntry,
  normalizedQuery: string
) => {
  if (filterKind.value !== 'all' && entry.changeKind !== filterKind.value) {
    return false
  }

  if (normalizedQuery.length === 0) {
    return true
  }

  return buildEntrySearchHaystack(entry).includes(normalizedQuery)
}
const buildCompareStats = (items: PgmlDiagramCompareEntry[]) => {
  return {
    added: items.filter(entry => entry.changeKind === 'added').length,
    modified: items.filter(entry => entry.changeKind === 'modified').length,
    removed: items.filter(entry => entry.changeKind === 'removed').length
  }
}

const filteredEntries = computed(() => {
  const normalizedQuery = searchQuery.value.trim().toLowerCase()

  return entries.filter(entry => entryMatchesCurrentFilters(entry, normalizedQuery))
})

const contextEntries = computed(() => {
  const selectedContextEntryIds = new Set(selectedDiagramContextIds)

  return entries.filter(entry => selectedContextEntryIds.has(entry.id))
})

const resolveSelectedEntry = (input: {
  contextEntries: PgmlDiagramCompareEntry[]
  entries: PgmlDiagramCompareEntry[]
  filteredEntries: PgmlDiagramCompareEntry[]
  selectedEntryId: string | null
}) => {
  if (input.selectedEntryId) {
    return input.entries.find(entry => entry.id === input.selectedEntryId) || null
  }

  if (input.contextEntries.length > 0) {
    return input.contextEntries[0] || null
  }

  return input.filteredEntries[0] || null
}

const selectedEntry = computed(() => {
  // Explicit inspector selection wins, then the currently selected diagram
  // context, then the first visible filtered entry as the empty-state fallback.
  return resolveSelectedEntry({
    contextEntries: contextEntries.value,
    entries,
    filteredEntries: filteredEntries.value,
    selectedEntryId
  })
})

const compareStats = computed(() => {
  return buildCompareStats(entries)
})

const normalizeCompareSelectValue = (value: unknown) => {
  return typeof value === 'string' && value.length > 0 ? value : null
}

const updateCompareBaseId = (value: unknown) => {
  emit('update:compareBaseId', normalizeCompareSelectValue(value))
}

const updateCompareTargetId = (value: unknown) => {
  const nextValue = normalizeCompareSelectValue(value)

  if (nextValue === null) {
    return
  }

  emit('update:compareTargetId', nextValue)
}

const updateSelectedComparisonId = (value: unknown) => {
  const nextValue = normalizeCompareSelectValue(value)

  emit('select-comparison', nextValue === currentComparisonOptionValue ? null : nextValue)
}

// Keep the active detail selection valid when filters or compare sources change.
watch(filteredEntries, (nextEntries) => {
  if (nextEntries.length === 0) {
    return
  }

  if (!selectedEntry.value) {
    emit('select-entry', nextEntries[0]!.id)
  }
}, {
  immediate: true
})

const getChangeBadgeStyle = (entry: PgmlDiagramCompareEntry) => {
  const color = getPgmlDiagramCompareChangeColor(entry.changeKind)

  return {
    backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} 58%, var(--studio-divider) 42%)`,
    color: `color-mix(in srgb, ${color} 80%, var(--studio-shell-text) 20%)`
  }
}

const isCompareFilterActive = (kind: PgmlCompareStatKind) => {
  return filterKind.value === kind
}

const toggleCompareStatFilter = (kind: PgmlCompareStatKind) => {
  filterKind.value = filterKind.value === kind ? 'all' : kind
}

const getCompareStatButtonStyle = (kind: PgmlCompareStatKind) => {
  const color = getPgmlDiagramCompareChangeColor(kind)
  const isActive = isCompareFilterActive(kind)

  return {
    backgroundColor: isActive
      ? `color-mix(in srgb, ${color} 12%, var(--studio-input-bg) 88%)`
      : 'var(--studio-input-bg)',
    borderColor: isActive
      ? `color-mix(in srgb, ${color} 58%, var(--studio-divider) 42%)`
      : 'var(--studio-divider)',
    color: isActive
      ? `color-mix(in srgb, ${color} 84%, var(--studio-shell-text) 16%)`
      : 'var(--studio-shell-muted)'
  }
}

const clearSearch = () => {
  searchQuery.value = ''
}

const clearFilters = () => {
  clearSearch()
  filterKind.value = 'all'
}
</script>

<template>
  <div
    data-diagram-compare-panel="true"
    class="flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
  >
    <div
      data-studio-scrollable="true"
      class="grid min-h-0 min-w-0 content-start gap-3 overflow-y-auto overflow-x-hidden px-3 py-3"
    >
      <div :class="compareOverviewSectionClass">
        <div class="flex flex-wrap items-center gap-2">
          <span class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
            {{ baseLabel }}
          </span>
          <span class="font-mono text-[0.56rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
            to
          </span>
          <span class="border border-[color:var(--studio-ring)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-text)]">
            {{ targetLabel }}
          </span>
        </div>

        <p :class="studioCompactBodyCopyClass">
          Changed entities are highlighted directly on the diagram. Click a highlighted node or row to inspect its delta here.
        </p>

        <p
          v-if="relationshipSummary.length > 0"
          class="text-[0.66rem] leading-5 text-[color:var(--studio-shell-muted)]"
        >
          {{ relationshipSummary }}
        </p>

        <div class="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-end">
          <label class="grid gap-1 lg:min-w-0">
            <span class="text-[0.68rem] text-[color:var(--studio-shell-muted)]">Saved comparison</span>
            <USelect
              data-compare-comparison-select="true"
              :items="comparisonSelectOptions"
              :model-value="selectedComparisonId || currentComparisonOptionValue"
              value-key="value"
              label-key="label"
              color="neutral"
              variant="outline"
              size="sm"
              :ui="studioSelectUi"
              @update:model-value="updateSelectedComparisonId"
            />
          </label>

          <UButton
            label="New"
            data-compare-create-comparison="true"
            color="neutral"
            variant="outline"
            size="sm"
            :class="filterButtonClass"
            @click="emit('create-comparison')"
          />

          <UButton
            label="Rename"
            data-compare-rename-comparison="true"
            color="neutral"
            variant="outline"
            size="sm"
            :class="filterButtonClass"
            :disabled="!hasSavedComparison"
            @click="emit('rename-comparison')"
          />

          <UButton
            label="Delete"
            data-compare-delete-comparison="true"
            color="neutral"
            variant="outline"
            size="sm"
            :class="filterButtonClass"
            :disabled="!hasSavedComparison"
            @click="emit('delete-comparison')"
          />
        </div>

        <div class="grid gap-2 md:grid-cols-2">
          <label class="grid gap-1">
            <span class="text-[0.68rem] text-[color:var(--studio-shell-muted)]">Base version</span>
            <USelect
              data-compare-base-select="true"
              :items="compareOptions"
              :model-value="compareBaseId || undefined"
              value-key="value"
              label-key="label"
              color="neutral"
              variant="outline"
              size="sm"
              :ui="studioSelectUi"
              @update:model-value="updateCompareBaseId"
            />
          </label>

          <label class="grid gap-1">
            <span class="text-[0.68rem] text-[color:var(--studio-shell-muted)]">Target</span>
            <USelect
              data-compare-target-select="true"
              :items="compareOptions"
              :model-value="compareTargetId"
              value-key="value"
              label-key="label"
              color="neutral"
              variant="outline"
              size="sm"
              :ui="studioSelectUi"
              @update:model-value="updateCompareTargetId"
            />
          </label>
        </div>

        <div class="grid min-w-0 gap-2 sm:grid-cols-3">
          <button
            v-for="statKind in compareStatKinds"
            :key="statKind"
            type="button"
            :data-compare-stat-filter="statKind"
            class="grid min-w-0 gap-1 border px-3 py-2.5 text-left transition-colors duration-150 cursor-default"
            :aria-pressed="isCompareFilterActive(statKind)"
            :style="getCompareStatButtonStyle(statKind)"
            @click="toggleCompareStatFilter(statKind)"
          >
            <div
              :class="[
                compareStatLabelClass,
                isCompareFilterActive(statKind) ? 'text-[color:var(--studio-shell-text)]' : 'text-[color:var(--studio-shell-label)]'
              ]"
            >
              {{ compareStatLabelByKind[statKind] }}
            </div>
            <div class="mt-1 text-[0.84rem] font-semibold text-[color:var(--studio-shell-text)]">
              {{ compareStats[statKind] }}
            </div>
          </button>
        </div>

        <div class="grid gap-2 border-t border-[color:var(--studio-divider)] pt-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="grid gap-1">
              <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
                Compare exclusions
              </div>
              <div class="text-[0.68rem] leading-5 text-[color:var(--studio-shell-muted)]">
                {{
                  hasExcludedEntities
                    ? `${exclusionSummary}. Current compare results use the exclusions stored on ${comparisonLabel}.`
                    : `No groups or tables are excluded for ${comparisonLabel}.`
                }}
              </div>
            </div>

            <UButton
              label="Manage exclusions"
              data-compare-edit-exclusions="true"
              color="neutral"
              variant="outline"
              size="xs"
              :class="filterButtonClass"
              @click="emit('edit-comparison-exclusions')"
            />
          </div>

          <div
            v-if="hasExcludedEntities"
            class="flex flex-wrap gap-2"
          >
            <span
              v-for="label in visibleExcludedLabels"
              :key="label"
              :class="exclusionChipClass"
            >
              {{ label }}
            </span>
            <span
              v-if="hiddenExcludedLabelCount > 0"
              :class="exclusionChipClass"
            >
              +{{ hiddenExcludedLabelCount }} more
            </span>
          </div>
        </div>
      </div>

      <div
        v-if="contextEntries.length > 0"
        :class="compareDividerSectionClass"
      >
        <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
          Selected On Diagram
        </div>

        <div class="grid min-w-0 gap-2">
          <button
            v-for="entry in contextEntries"
            :key="entry.id"
            type="button"
            :data-compare-context-entry="entry.id"
            class="grid min-w-0 gap-1 border px-3 py-2 text-left transition-colors duration-150"
            :class="selectedEntry?.id === entry.id ? 'border-[color:var(--studio-ring)] bg-[color:var(--studio-input-bg)]' : 'border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)]'"
            @click="emit('select-entry', entry.id)"
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
            </div>
            <div class="min-w-0 break-words text-[0.76rem] font-semibold text-[color:var(--studio-shell-text)] [overflow-wrap:anywhere]">
              {{ entry.label }}
            </div>
            <div class="min-w-0 break-words text-[0.66rem] leading-5 text-[color:var(--studio-shell-muted)] [overflow-wrap:anywhere]">
              {{ entry.description }}
            </div>
          </button>
        </div>
      </div>

      <div :class="compareDividerSectionClass">
        <div class="flex flex-wrap items-center gap-2">
          <input
            v-model="searchQuery"
            data-compare-search="true"
            type="search"
            placeholder="Filter changed entities"
            :class="joinStudioClasses(studioCompactInputClass, 'min-w-[12rem] flex-1')"
          >
          <UButton
            v-for="option in compareFilterOptions"
            :key="option.value"
            :label="option.label"
            color="neutral"
            :variant="filterKind === option.value ? 'soft' : 'outline'"
            size="xs"
            :class="filterKind === option.value ? activeFilterButtonClass : filterButtonClass"
            @click="filterKind = option.value"
          />
        </div>

        <div
          v-if="filteredEntries.length > 0"
          class="grid min-w-0 gap-2"
        >
          <button
            v-for="entry in filteredEntries"
            :key="entry.id"
            type="button"
            :data-compare-entry="entry.id"
            class="grid min-w-0 gap-1 border px-3 py-2 text-left transition-colors duration-150"
            :class="selectedEntry?.id === entry.id ? 'border-[color:var(--studio-ring)] bg-[color:var(--studio-input-bg)]' : 'border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)]'"
            @click="emit('select-entry', entry.id)"
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
                v-if="selectedDiagramContextIds.includes(entry.id)"
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
        </div>

        <div
          v-else
          :class="studioEmptyStateClass"
        >
          <p>No diff entries match the current filter.</p>
          <UButton
            v-if="searchQuery.trim().length > 0 || filterKind !== 'all'"
            label="Clear filters"
            color="neutral"
            variant="outline"
            size="xs"
            :class="filterButtonClass"
            @click="clearFilters"
          />
        </div>
      </div>

      <div
        v-if="selectedEntry"
        data-compare-entry-detail="true"
        :class="compareDividerSectionClass"
      >
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class="border px-1.5 py-0.5 font-mono text-[0.5rem] uppercase tracking-[0.08em]"
                :style="getChangeBadgeStyle(selectedEntry)"
              >
                {{ getPgmlDiagramCompareChangeVerb(selectedEntry.changeKind) }}
              </span>
              <span class="font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
                {{ getPgmlDiagramCompareEntityKindLabel(selectedEntry.entityKind) }}
              </span>
            </div>
            <h4 class="mt-2 min-w-0 break-words text-[0.84rem] font-semibold text-[color:var(--studio-shell-text)] [overflow-wrap:anywhere]">
              {{ selectedEntry.label }}
            </h4>
            <p class="mt-1 min-w-0 break-words text-[0.68rem] leading-5 text-[color:var(--studio-shell-muted)] [overflow-wrap:anywhere]">
              {{ selectedEntry.description }}
            </p>
          </div>

          <div class="flex shrink-0 flex-wrap gap-2">
            <UButton
              label="Show on diagram"
              color="neutral"
              variant="soft"
              size="xs"
              :class="activeFilterButtonClass"
              @click="emit('focus-target', selectedEntry.id)"
            />
            <UButton
              v-if="selectedEntry.sourceRange"
              label="Focus source"
              color="neutral"
              variant="outline"
              size="xs"
              :class="filterButtonClass"
              @click="emit('focus-source', selectedEntry.sourceRange)"
            />
          </div>
        </div>

        <div
          v-if="selectedEntry.fields.length > 0"
          class="grid gap-2"
        >
          <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
            Changed Fields
          </div>

          <div class="grid gap-2">
            <div
              v-for="field in selectedEntry.fields"
              :key="field.id"
              class="grid gap-2 border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-3 py-3"
            >
              <div class="font-mono text-[0.56rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
                {{ field.label }}
              </div>
              <div class="grid gap-2 text-[0.66rem] text-[color:var(--studio-shell-muted)] sm:grid-cols-2">
                <div class="min-w-0">
                  <div class="font-mono uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
                    Before
                  </div>
                  <pre class="mt-1 min-w-0 whitespace-pre-wrap break-words font-mono text-[0.62rem] leading-5 text-[color:var(--studio-shell-text)] [overflow-wrap:anywhere]">{{ field.before || 'Not present' }}</pre>
                </div>
                <div class="min-w-0">
                  <div class="font-mono uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
                    After
                  </div>
                  <pre class="mt-1 min-w-0 whitespace-pre-wrap break-words font-mono text-[0.62rem] leading-5 text-[color:var(--studio-shell-text)] [overflow-wrap:anywhere]">{{ field.after || 'Not present' }}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="grid min-w-0 gap-2 md:grid-cols-2">
          <div class="grid min-w-0 gap-1">
            <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
              Before snapshot
            </div>
            <pre class="max-h-64 min-w-0 overflow-auto whitespace-pre-wrap break-words border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-3 py-3 text-[0.62rem] leading-5 text-[color:var(--studio-shell-text)] [overflow-wrap:anywhere]">{{ selectedEntry.beforeSnapshot || 'Not present in base snapshot.' }}</pre>
          </div>
          <div class="grid min-w-0 gap-1">
            <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
              After snapshot
            </div>
            <pre class="max-h-64 min-w-0 overflow-auto whitespace-pre-wrap break-words border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-3 py-3 text-[0.62rem] leading-5 text-[color:var(--studio-shell-text)] [overflow-wrap:anywhere]">{{ selectedEntry.afterSnapshot || 'Not present in target snapshot.' }}</pre>
          </div>
        </div>
      </div>

      <div
        v-else
        :class="studioEmptyStateClass"
      >
        Pick a changed entity from the list or click a highlighted entity in the diagram to inspect its delta.
      </div>
    </div>
  </div>
</template>
