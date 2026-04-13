<script setup lang="ts">
import type { Ref } from 'vue'
import { computed, ref } from 'vue'
import { studioSelectUi } from '~/constants/ui'
import PgmlDiagramCompareEntryList from '~/components/pgml/PgmlDiagramCompareEntryList.vue'
import {
  buildPgmlCompareMarkdownExport,
  buildPgmlCompareHtmlExport,
  type PgmlCompareExportDetailViewMode,
  type PgmlCompareExportInput
} from '~/utils/pgml-compare-export'
import {
  getPgmlDiagramCompareChangeColor,
  type PgmlDiagramCompareEntityKind,
  type PgmlDiagramCompareEntry
} from '~/utils/pgml-diagram-compare'
import type {
  PgmlCompareNoiseFilters,
  PgmlSourceRange
} from '~/utils/pgml'
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
  compareNoiseFilters = {
    hideDefaults: true,
    hideMetadata: true,
    hideOrderOnly: true
  },
  compareOptions,
  compareTargetId,
  excludedLabels = [],
  excludedSummary = null,
  entries,
  hiddenExcludedLabelCount = 0,
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
  compareNoiseFilters?: PgmlCompareNoiseFilters
  compareOptions: Array<{
    label: string
    value: string
  }>
  compareTargetId: string
  excludedLabels?: string[]
  excludedSummary?: string | null
  entries: PgmlDiagramCompareEntry[]
  hiddenExcludedLabelCount?: number
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
  'select-entry': [entryId: string | null]
  'update:compareBaseId': [value: string | null]
  'update:compare-noise-filters': [value: PgmlCompareNoiseFilters]
  'update:compareTargetId': [value: string]
}>()

type PgmlCompareFilterKind = 'all' | 'added' | 'modified' | 'removed'
type PgmlCompareStatKind = Exclude<PgmlCompareFilterKind, 'all'>
type PgmlCompareNoiseFilterKey = keyof PgmlCompareNoiseFilters

type PgmlCompareFilterOption = {
  label: string
  value: PgmlCompareFilterKind
}

type PgmlCompareEntityFilterOption = {
  count: number
  label: string
  value: PgmlDiagramCompareEntityKind
}

type PgmlCompareDetailViewMode = 'both' | 'snapshot' | 'structured'

type PgmlCompareDetailViewOption = {
  label: string
  value: PgmlCompareDetailViewMode
}

type PgmlCompareNoiseFilterOption = {
  description: string
  key: PgmlCompareNoiseFilterKey
  label: string
}

const compareEntityKindOrder: PgmlDiagramCompareEntityKind[] = [
  'table',
  'group',
  'column',
  'index',
  'constraint',
  'reference',
  'custom-type',
  'function',
  'procedure',
  'trigger',
  'sequence',
  'layout'
]

const compareEntityFilterLabelByKind: Readonly<Record<PgmlDiagramCompareEntityKind, string>> = Object.freeze({
  'column': 'Columns',
  'constraint': 'Constraints',
  'custom-type': 'Types',
  'function': 'Functions',
  'group': 'Groups',
  'index': 'Indexes',
  'layout': 'Layout',
  'procedure': 'Procedures',
  'reference': 'References',
  'sequence': 'Sequences',
  'table': 'Tables',
  'trigger': 'Triggers'
})

const searchQuery: Ref<string> = ref('')
const filterKind: Ref<PgmlCompareFilterKind> = ref('all')
const selectedEntityKinds: Ref<PgmlDiagramCompareEntityKind[]> = ref([])
const detailViewMode: Ref<PgmlCompareDetailViewMode> = ref('structured')
const filterButtonClass = joinStudioClasses(studioButtonClasses.secondary, 'text-[0.62rem]')
const activeFilterButtonClass = joinStudioClasses(studioButtonClasses.primary, 'text-[0.62rem]')
const compareStatLabelClass = 'font-mono text-[0.58rem] uppercase tracking-[0.08em]'
const compareEntityFilterButtonClass = 'inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[0.56rem] uppercase tracking-[0.08em] transition-colors duration-150 cursor-default'
const compareEntityFilterCountClass = 'border px-1 py-0.5 text-[0.48rem] leading-none transition-colors duration-150'
const compareOverviewSectionClass = 'grid min-w-0 gap-3 border-b border-[color:var(--studio-divider)] pb-3'
const compareDividerSectionClass = 'grid min-w-0 gap-3 border-t border-[color:var(--studio-divider)] pt-3'
const exclusionChipClass = 'border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]'
const compareNoiseFilterButtonClass = 'inline-flex items-center gap-2 border px-2 py-1 font-mono text-[0.56rem] uppercase tracking-[0.08em] transition-colors duration-150 cursor-default'
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
const compareDetailViewOptions: PgmlCompareDetailViewOption[] = [
  {
    label: 'Structured',
    value: 'structured'
  },
  {
    label: 'Snapshot',
    value: 'snapshot'
  },
  {
    label: 'Both',
    value: 'both'
  }
]
const compareNoiseFilterOptions: PgmlCompareNoiseFilterOption[] = [
  {
    description: 'Hide changes where only the column default differs.',
    key: 'hideDefaults',
    label: 'Hide defaults'
  },
  {
    description: 'Hide docs, affects, and metadata-only changes.',
    key: 'hideMetadata',
    label: 'Hide metadata'
  },
  {
    description: 'Hide list-order-only changes that remain in compare results.',
    key: 'hideOrderOnly',
    label: 'Hide order only'
  }
]
const hasExcludedEntities = computed(() => {
  return excludedLabels.length > 0 || Boolean(excludedSummary)
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
const resolveCompareVersionLabel = (
  value: string | null | undefined,
  fallbackLabel: string
) => {
  if (!value) {
    return fallbackLabel
  }

  return compareOptions.find(option => option.value === value)?.label || fallbackLabel
}
const detailBaseLabel = computed(() => {
  return resolveCompareVersionLabel(compareBaseId, baseLabel)
})
const detailTargetLabel = computed(() => {
  return resolveCompareVersionLabel(compareTargetId, targetLabel)
})
const showFieldDiffs = computed(() => {
  return detailViewMode.value !== 'snapshot'
})
const showSnapshotDiff = computed(() => {
  return detailViewMode.value !== 'structured'
})
const buildEntrySearchHaystack = (entry: PgmlDiagramCompareEntry) => {
  return [
    entry.label,
    entry.description,
    entry.entityKind,
    entry.changedFields.join(' '),
    entry.fields.map(field => `${field.label} ${field.before || ''} ${field.after || ''}`).join(' ')
  ].join(' ').toLowerCase()
}
const normalizedSearchQuery = computed(() => {
  return searchQuery.value.trim().toLowerCase()
})
const hasEntityKindFilter = computed(() => selectedEntityKinds.value.length > 0)
const entriesMatchingChangeKind = computed(() => {
  return filterKind.value === 'all'
    ? entries
    : entries.filter(entry => entry.changeKind === filterKind.value)
})
const compareEntityFilterOptions = computed<PgmlCompareEntityFilterOption[]>(() => {
  const countsByKind = entriesMatchingChangeKind.value.reduce<Record<PgmlDiagramCompareEntityKind, number>>((counts, entry) => {
    counts[entry.entityKind] = (counts[entry.entityKind] || 0) + 1
    return counts
  }, {
    'column': 0,
    'constraint': 0,
    'custom-type': 0,
    'function': 0,
    'group': 0,
    'index': 0,
    'layout': 0,
    'procedure': 0,
    'reference': 0,
    'sequence': 0,
    'table': 0,
    'trigger': 0
  })

  return compareEntityKindOrder.flatMap((entityKind) => {
    const count = countsByKind[entityKind]

    if (count === 0 && !selectedEntityKinds.value.includes(entityKind)) {
      return []
    }

    return [{
      count,
      label: compareEntityFilterLabelByKind[entityKind],
      value: entityKind
    }]
  })
})
const isEntityKindFilterActive = (kind: PgmlDiagramCompareEntityKind) => {
  return selectedEntityKinds.value.includes(kind)
}
const hasActiveCompareFilters = computed(() => {
  return normalizedSearchQuery.value.length > 0 || filterKind.value !== 'all' || hasEntityKindFilter.value
})
const isCompareNoiseFilterActive = (key: PgmlCompareNoiseFilterKey) => {
  return compareNoiseFilters[key]
}
const entryMatchesCurrentFilters = (
  entry: PgmlDiagramCompareEntry,
  normalizedQuery: string
) => {
  if (filterKind.value !== 'all' && entry.changeKind !== filterKind.value) {
    return false
  }

  if (selectedEntityKinds.value.length > 0 && !selectedEntityKinds.value.includes(entry.entityKind)) {
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
  return entries.filter(entry => entryMatchesCurrentFilters(entry, normalizedSearchQuery.value))
})

const contextEntries = computed(() => {
  const selectedContextEntryIds = new Set(selectedDiagramContextIds)

  return entries.filter(entry => selectedContextEntryIds.has(entry.id))
})
const visibleContextEntries = computed(() => {
  return contextEntries.value.filter((entry) => {
    return entryMatchesCurrentFilters(entry, normalizedSearchQuery.value)
  })
})

const selectedEntry = computed(() => {
  if (!selectedEntryId) {
    return null
  }

  return filteredEntries.value.find(entry => entry.id === selectedEntryId) || null
})

const compareStats = computed(() => {
  return buildCompareStats(entries)
})
type PgmlCompareExportFormat = 'html' | 'md'

const buildCompareExportFileName = (format: PgmlCompareExportFormat) => {
  const slugifySegment = (value: string) => {
    const normalizedValue = value
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '-')
      .replaceAll(/^-+|-+$/g, '')

    return normalizedValue.length > 0 ? normalizedValue : 'compare'
  }
  const comparisonSegment = slugifySegment(comparisonLabel)
  const baseSegment = slugifySegment(detailBaseLabel.value)
  const targetSegment = slugifySegment(detailTargetLabel.value)

  return `pgml-compare-${comparisonSegment}-${baseSegment}-to-${targetSegment}.${format}`
}
const formatCompareExportTime = () => {
  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date())
}
const buildCompareExportInput = (): PgmlCompareExportInput => {
  return {
    baseLabel: detailBaseLabel.value,
    comparisonLabel,
    contextEntries: visibleContextEntries.value,
    detailViewMode: detailViewMode.value as PgmlCompareExportDetailViewMode,
    entityKindFilters: selectedEntityKinds.value,
    entries: filteredEntries.value,
    excludedLabels,
    excludedSummary,
    exportedAtLabel: formatCompareExportTime(),
    hiddenExcludedLabelCount,
    noiseFilters: compareNoiseFilters,
    relationshipSummary,
    searchQuery: searchQuery.value,
    targetLabel: detailTargetLabel.value,
    visibleChangeFilter: filterKind.value
  }
}
const downloadCompareExport = (content: string, format: PgmlCompareExportFormat, mimeType: string) => {
  const blob = new Blob([content], {
    type: mimeType
  })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = objectUrl
  anchor.download = buildCompareExportFileName(format)
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
  }, 0)
}
const downloadCompareExportHtml = () => {
  if (!import.meta.client) {
    return
  }

  downloadCompareExport(
    buildPgmlCompareHtmlExport(buildCompareExportInput()),
    'html',
    'text/html;charset=utf-8'
  )
}
const downloadCompareExportMarkdown = () => {
  if (!import.meta.client) {
    return
  }

  downloadCompareExport(
    buildPgmlCompareMarkdownExport(buildCompareExportInput()),
    'md',
    'text/markdown;charset=utf-8'
  )
}

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
  selectedEntityKinds.value = []
}

const toggleCompareEntityKindFilter = (kind: PgmlDiagramCompareEntityKind) => {
  selectedEntityKinds.value = selectedEntityKinds.value.includes(kind)
    ? selectedEntityKinds.value.filter(value => value !== kind)
    : [...selectedEntityKinds.value, kind]
}

const getCompareEntityFilterButtonStyle = (kind: PgmlDiagramCompareEntityKind) => {
  const isActive = isEntityKindFilterActive(kind)
  const accent = 'var(--studio-ring)'

  return {
    backgroundColor: isActive
      ? `color-mix(in srgb, ${accent} 24%, var(--studio-input-bg) 76%)`
      : 'var(--studio-input-bg)',
    borderColor: isActive
      ? `color-mix(in srgb, ${accent} 74%, var(--studio-divider) 26%)`
      : 'var(--studio-divider)',
    boxShadow: isActive
      ? `inset 0 0 0 1px color-mix(in srgb, ${accent} 44%, transparent), 0 0 0 1px color-mix(in srgb, ${accent} 18%, transparent)`
      : 'none',
    color: isActive
      ? `color-mix(in srgb, ${accent} 78%, white 22%)`
      : 'var(--studio-shell-label)'
  }
}

const getCompareEntityFilterMarkerStyle = (kind: PgmlDiagramCompareEntityKind) => {
  const isActive = isEntityKindFilterActive(kind)

  return {
    backgroundColor: isActive
      ? 'var(--studio-ring)'
      : 'color-mix(in srgb, var(--studio-shell-muted) 56%, transparent)',
    opacity: isActive ? '1' : '0.72'
  }
}

const getCompareEntityFilterCountStyle = (kind: PgmlDiagramCompareEntityKind) => {
  const isActive = isEntityKindFilterActive(kind)

  return {
    backgroundColor: isActive
      ? 'color-mix(in srgb, var(--studio-ring) 18%, transparent)'
      : 'transparent',
    borderColor: isActive
      ? 'color-mix(in srgb, var(--studio-ring) 64%, var(--studio-divider) 36%)'
      : 'var(--studio-divider)',
    color: isActive
      ? 'color-mix(in srgb, var(--studio-ring) 74%, white 26%)'
      : 'var(--studio-shell-label)'
  }
}

const getCompareNoiseFilterButtonStyle = (key: PgmlCompareNoiseFilterKey) => {
  const isActive = isCompareNoiseFilterActive(key)
  const accent = 'var(--studio-shell-label)'

  return {
    backgroundColor: isActive
      ? `color-mix(in srgb, ${accent} 16%, var(--studio-input-bg) 84%)`
      : 'var(--studio-input-bg)',
    borderColor: isActive
      ? `color-mix(in srgb, ${accent} 52%, var(--studio-divider) 48%)`
      : 'var(--studio-divider)',
    color: isActive
      ? 'var(--studio-shell-text)'
      : 'var(--studio-shell-muted)'
  }
}

const isDetailViewModeActive = (mode: PgmlCompareDetailViewMode) => {
  return detailViewMode.value === mode
}

const toggleCompareNoiseFilter = (key: PgmlCompareNoiseFilterKey) => {
  emit('update:compare-noise-filters', {
    ...compareNoiseFilters,
    [key]: !compareNoiseFilters[key]
  })
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

        <div class="flex flex-wrap items-center gap-2">
          <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
            Detail view
          </span>
          <UButton
            v-for="option in compareDetailViewOptions"
            :key="option.value"
            :label="option.label"
            :data-compare-detail-view="option.value"
            color="neutral"
            :variant="isDetailViewModeActive(option.value) ? 'soft' : 'outline'"
            size="xs"
            :class="isDetailViewModeActive(option.value) ? activeFilterButtonClass : filterButtonClass"
            @click="detailViewMode = option.value"
          />
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
            <div class="flex flex-wrap items-center gap-2">
              <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
                Noise filters
              </div>
              <button
                v-for="option in compareNoiseFilterOptions"
                :key="option.key"
                type="button"
                :data-compare-noise-filter="option.key"
                :class="compareNoiseFilterButtonClass"
                :aria-pressed="isCompareNoiseFilterActive(option.key)"
                :style="getCompareNoiseFilterButtonStyle(option.key)"
                :title="option.description"
                @click="toggleCompareNoiseFilter(option.key)"
              >
                {{ option.label }}
              </button>
            </div>

            <div class="flex flex-wrap items-center gap-2">
              <UButton
                label="Export HTML"
                data-compare-export-html="true"
                color="neutral"
                variant="outline"
                size="xs"
                :class="filterButtonClass"
                @click="downloadCompareExportHtml"
              />
              <UButton
                label="Export MD"
                data-compare-export-md="true"
                color="neutral"
                variant="outline"
                size="xs"
                :class="filterButtonClass"
                @click="downloadCompareExportMarkdown"
              />
            </div>
          </div>

          <p class="text-[0.68rem] leading-5 text-[color:var(--studio-shell-muted)]">
            Export the currently visible compare results as standalone HTML or Markdown for saving, sharing, or review.
          </p>

          <div class="flex flex-wrap items-center gap-2">
            <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
              Active export state
            </div>
            <span :class="exclusionChipClass">
              {{ filteredEntries.length }} visible
            </span>
            <span :class="exclusionChipClass">
              {{ compareFilterOptions.find(option => option.value === filterKind)?.label || 'All' }}
            </span>
            <span
              v-if="selectedEntityKinds.length > 0"
              :class="exclusionChipClass"
            >
              {{ selectedEntityKinds.length }} entity filter{{ selectedEntityKinds.length === 1 ? '' : 's' }}
            </span>
            <span
              v-if="normalizedSearchQuery.length > 0"
              :class="exclusionChipClass"
            >
              Search active
            </span>
          </div>
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
                    ? `${excludedSummary}. Current compare results use the exclusions stored on ${comparisonLabel}.`
                    : `No compare exclusions are stored for ${comparisonLabel}.`
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
              v-for="label in excludedLabels"
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
        v-if="visibleContextEntries.length > 0"
        :class="compareDividerSectionClass"
      >
        <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
          Selected On Diagram
        </div>

        <PgmlDiagramCompareEntryList
          :base-label="detailBaseLabel"
          :entries="visibleContextEntries"
          section="context"
          :selected-diagram-context-ids="selectedDiagramContextIds"
          :selected-entry-id="selectedEntryId"
          :show-field-diffs="showFieldDiffs"
          :show-snapshot-diff="showSnapshotDiff"
          :target-label="detailTargetLabel"
          @focus-source="emit('focus-source', $event)"
          @focus-target="emit('focus-target', $event)"
          @select-entry="emit('select-entry', $event)"
        />
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
          <UButton
            v-if="hasActiveCompareFilters"
            label="Clear filters"
            color="neutral"
            variant="outline"
            size="xs"
            :class="filterButtonClass"
            @click="clearFilters"
          />
        </div>

        <div
          v-if="compareEntityFilterOptions.length > 0"
          class="grid gap-2"
        >
          <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
            Entity kinds
          </div>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="option in compareEntityFilterOptions"
              :key="option.value"
              type="button"
              :data-compare-entity-filter="option.value"
              :class="compareEntityFilterButtonClass"
              :aria-pressed="isEntityKindFilterActive(option.value)"
              :style="getCompareEntityFilterButtonStyle(option.value)"
              @click="toggleCompareEntityKindFilter(option.value)"
            >
              <span
                :data-compare-entity-filter-marker="option.value"
                class="h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-150"
                :style="getCompareEntityFilterMarkerStyle(option.value)"
              />
              <span>{{ option.label }}</span>
              <span
                :data-compare-entity-filter-count="option.value"
                :class="compareEntityFilterCountClass"
                :style="getCompareEntityFilterCountStyle(option.value)"
              >
                {{ option.count }}
              </span>
            </button>
          </div>
        </div>

        <PgmlDiagramCompareEntryList
          v-if="filteredEntries.length > 0"
          :base-label="detailBaseLabel"
          :entries="filteredEntries"
          section="results"
          :selected-diagram-context-ids="selectedDiagramContextIds"
          :selected-entry-id="selectedEntryId"
          :show-field-diffs="showFieldDiffs"
          :show-snapshot-diff="showSnapshotDiff"
          :target-label="detailTargetLabel"
          @focus-source="emit('focus-source', $event)"
          @focus-target="emit('focus-target', $event)"
          @select-entry="emit('select-entry', $event)"
        />

        <div
          v-else
          :class="studioEmptyStateClass"
        >
          <p>No diff entries match the current filter.</p>
          <UButton
            v-if="hasActiveCompareFilters"
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
        v-if="filteredEntries.length > 0 && !selectedEntry"
        :class="studioEmptyStateClass"
      >
        Click a changed entity to expand its detailed compare view inline.
      </div>
    </div>
  </div>
</template>
