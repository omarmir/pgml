<script setup lang="ts">
import {
  studioSelectUi
} from '~/constants/ui'
import {
  buildPgmlCompareDeltaDescription,
  buildPgmlPreviewTargetLabel,
  buildPgmlVersionCompareSummary
} from '~/utils/pgml-version-summary'
import {
  joinStudioClasses,
  studioButtonClasses,
  studioCompactBodyCopyClass,
  studioEmptyStateClass
} from '~/utils/uiStyles'

type PgmlVersionPanelItem = {
  ancestorCount: number
  branchLeafCount: number
  branchMaxDepth: number
  branchVersionCount: number
  branchRootId: string | null
  branchRootLabel: string | null
  childCount: number
  createdAt: string
  descendantCount: number
  depth: number
  id: string
  isLeaf: boolean
  isLatestByRole: boolean
  isLatestOverall: boolean
  isRoot: boolean
  siblingCount: number
  isWorkspaceBase: boolean
  label: string
  lineageLabel: string
  parentVersionId: string | null
  role: 'design' | 'implementation'
}

type PgmlVersionCompareOption = {
  label: string
  value: string
}

type PgmlComparePresetButton = {
  baseId: string | null
  disabled: boolean
  label: string
  targetId: string
}

type PgmlVersionDiffSection = {
  count: number
  items: Array<{
    id: string
    kind: 'added' | 'modified' | 'removed'
    label: string
  }>
  label: string
}

type PgmlVersionStatCard = {
  label: string
  value: number
}

type PgmlVersionMetricBadge = {
  label: string
}

const {
  canCreateCheckpoint = true,
  compareBaseId = null,
  compareOptions,
  compareRelationshipSummary = '',
  compareTargetId,
  diffSections,
  layoutChanged = 0,
  latestVersionId = null,
  previewTargetId = 'workspace',
  versions,
  workspaceBaseLabel = 'No base version yet',
  workspaceStatus = 'Draft is ready to checkpoint.'
} = defineProps<{
  canCreateCheckpoint?: boolean
  compareBaseId?: string | null
  compareOptions: PgmlVersionCompareOption[]
  compareRelationshipSummary?: string
  compareTargetId: string
  diffSections: PgmlVersionDiffSection[]
  layoutChanged?: number
  latestVersionId?: string | null
  previewTargetId?: string
  versions: PgmlVersionPanelItem[]
  workspaceBaseLabel?: string
  workspaceStatus?: string
}>()

const emit = defineEmits<{
  'create-checkpoint': []
  'import-dump': []
  'open-comparator': []
  'open-migrations': []
  'restore-version': [versionId: string]
  'update:compareBaseId': [value: string | null]
  'update:compareTargetId': [value: string]
  'view-target': [targetId: string]
}>()

const primaryButtonClass = joinStudioClasses(
  studioButtonClasses.primary,
  'max-w-full whitespace-normal text-center text-[0.65rem] leading-4'
)
const secondaryButtonClass = joinStudioClasses(
  studioButtonClasses.secondary,
  'max-w-full whitespace-normal text-center text-[0.65rem] leading-4'
)
const stackedActionButtonClass = 'w-full justify-center sm:w-auto'
const mutedVersionBadgeClass = 'max-w-full break-words border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)] [overflow-wrap:anywhere]'
const getDiffKindClass = (kind: 'added' | 'modified' | 'removed') => {
  if (kind === 'added') {
    return 'border-[color:var(--studio-shell-label)] text-[color:var(--studio-shell-text)]'
  }

  if (kind === 'removed') {
    return 'border-[color:var(--studio-shell-error)]/50 text-[color:var(--studio-shell-error)]'
  }

  return 'border-[color:var(--studio-divider)] text-[color:var(--studio-shell-muted)]'
}
const buildCountLabel = (count: number, singularLabel: string, pluralLabel?: string) => {
  return `${count} ${count === 1 ? singularLabel : pluralLabel || `${singularLabel}s`}`
}
const appendMetricBadge = (badges: PgmlVersionMetricBadge[], label: string) => {
  badges.push({
    label
  })
}
const buildVersionMetricBadges = (version: PgmlVersionPanelItem) => {
  const badges: PgmlVersionMetricBadge[] = [{
    label: `Level ${version.depth}`
  }]

  if (version.childCount > 0) {
    appendMetricBadge(badges, buildCountLabel(version.childCount, 'branch', 'branches'))
  }

  if (version.siblingCount > 0) {
    appendMetricBadge(badges, buildCountLabel(version.siblingCount, 'sibling'))
  }

  if (version.descendantCount > 0) {
    appendMetricBadge(badges, buildCountLabel(version.descendantCount, 'descendant'))
  }

  if (version.ancestorCount > 0) {
    appendMetricBadge(badges, buildCountLabel(version.ancestorCount, 'ancestor'))
  }

  if (version.branchVersionCount > 1) {
    appendMetricBadge(badges, `Branch size ${version.branchVersionCount}`)
  }

  if (version.branchLeafCount > 0) {
    appendMetricBadge(badges, `Branch leaves ${version.branchLeafCount}`)
  }

  if (version.branchMaxDepth > version.depth) {
    appendMetricBadge(badges, `Branch depth ${version.branchMaxDepth}`)
  }

  return badges
}
const compareBaseOption = computed(() => {
  return compareBaseId ? compareOptions.find(option => option.value === compareBaseId) || null : null
})
const compareTargetOption = computed(() => {
  return compareOptions.find(option => option.value === compareTargetId) || null
})
const hasDiffSections = computed(() => diffSections.length > 0 || layoutChanged > 0)
const hasVersions = computed(() => versions.length > 0)
const designVersionCount = computed(() => {
  return versions.filter(version => version.role === 'design').length
})
const implementationVersionCount = computed(() => {
  return versions.filter(version => version.role === 'implementation').length
})
const versionStatCards = computed(() => {
  return [
    {
      label: 'Locked',
      value: versions.length
    },
    {
      label: 'Design',
      value: designVersionCount.value
    },
    {
      label: 'Impl',
      value: implementationVersionCount.value
    }
  ] satisfies PgmlVersionStatCard[]
})
const workspaceBaseVersionId = computed(() => {
  return versions.find(version => version.isWorkspaceBase)?.id || null
})
const latestImplementationVersionId = computed(() => {
  return versions.find(version => version.role === 'implementation' && version.isLatestByRole)?.id || null
})
const latestDesignVersionId = computed(() => {
  return versions.find(version => version.role === 'design' && version.isLatestByRole)?.id || null
})
// Presets all follow the same "known base to current target" rule, so keep the
// enablement logic in one place instead of repeating the active-state check.
const buildComparePresetButton = (input: {
  baseId: string | null
  label: string
  targetId: string
}) => {
  return {
    baseId: input.baseId,
    disabled: input.baseId === null || isComparePresetActive({
      baseId: input.baseId,
      targetId: input.targetId
    }),
    label: input.label,
    targetId: input.targetId
  } satisfies PgmlComparePresetButton
}
const comparePresetButtons = computed(() => {
  return [
    buildComparePresetButton({
      baseId: workspaceBaseVersionId.value,
      label: 'Workspace base to draft',
      targetId: 'workspace'
    }),
    buildComparePresetButton({
      baseId: latestVersionId,
      label: 'Latest to draft',
      targetId: 'workspace'
    }),
    buildComparePresetButton({
      baseId: latestImplementationVersionId.value,
      label: 'Latest impl to draft',
      targetId: 'workspace'
    }),
    buildComparePresetButton({
      baseId: latestDesignVersionId.value,
      label: 'Latest design to draft',
      targetId: 'workspace'
    })
  ] satisfies PgmlComparePresetButton[]
})
const compareSummary = computed(() => {
  return buildPgmlVersionCompareSummary({
    compareBaseLabel: compareBaseOption.value?.label || null,
    compareTargetLabel: compareTargetOption.value?.label || null,
    diffSections,
    layoutChanged
  })
})
const previewLabel = computed(() => {
  return buildPgmlPreviewTargetLabel({
    fallbackLabel: versions.find(version => version.id === previewTargetId)?.label || null,
    previewTargetId,
    workspaceLabel: 'Current workspace'
  })
})

const normalizeCompareSelectValue = (value: unknown) => {
  return typeof value === 'string' && value.length > 0 ? value : null
}

const updateCompareBaseId = (value: unknown) => {
  const nextValue = normalizeCompareSelectValue(value)

  if (nextValue === null) {
    emit('update:compareBaseId', null)
    return
  }

  emit('update:compareBaseId', nextValue)
}

const updateCompareTargetId = (value: unknown) => {
  const nextValue = normalizeCompareSelectValue(value)

  if (nextValue === null) {
    return
  }

  emit('update:compareTargetId', nextValue)
}

const applyComparePreset = (input: {
  baseId: string | null
  targetId: string
}) => {
  emit('update:compareBaseId', input.baseId)
  emit('update:compareTargetId', input.targetId)
}

const openComparatorWithPreset = (input: {
  baseId: string | null
  targetId: string
}) => {
  applyComparePreset(input)
  emit('open-comparator')
}

const setCompareBase = (baseId: string) => {
  emit('update:compareBaseId', baseId)
}

const setCompareTarget = (targetId: string) => {
  emit('update:compareTargetId', targetId)
}

const isComparePresetActive = (input: {
  baseId: string | null
  targetId: string
}) => {
  return compareBaseId === input.baseId && compareTargetId === input.targetId
}

const swapComparePair = () => {
  if (compareBaseId === null) {
    return
  }

  applyComparePreset({
    baseId: compareTargetId,
    targetId: compareBaseId
  })
}
</script>

<template>
  <div
    data-diagram-versions-panel="true"
    class="grid content-start gap-3 overflow-auto px-3 py-3"
  >
    <div
      data-version-overview="true"
      class="grid gap-3 border-b border-[color:var(--studio-divider)] pb-3"
    >
      <div class="flex flex-wrap gap-2">
        <UButton
          data-version-create-checkpoint="true"
          label="Create checkpoint"
          color="neutral"
          variant="soft"
          :class="primaryButtonClass"
          :disabled="!canCreateCheckpoint"
          @click="emit('create-checkpoint')"
        />
        <UButton
          data-version-import-dump="true"
          label="Import dump"
          color="neutral"
          variant="outline"
          :class="secondaryButtonClass"
          :disabled="!hasVersions"
          @click="emit('import-dump')"
        />
      </div>

      <p :class="studioCompactBodyCopyClass">
        Lock workspace checkpoints, choose compare pairs, and open the dedicated migrations tool for SQL or Kysely export.
      </p>
      <p
        v-if="!canCreateCheckpoint"
        class="text-[0.66rem] text-[color:var(--studio-shell-muted)]"
      >
        The current workspace still matches its base version, so there is no new checkpoint to lock yet.
      </p>
      <p
        v-if="!hasVersions"
        class="text-[0.66rem] text-[color:var(--studio-shell-muted)]"
      >
        Import stays locked until you create the first checkpointed base version.
      </p>

      <div class="grid grid-cols-1 gap-2 text-[0.66rem] text-[color:var(--studio-shell-muted)] sm:grid-cols-3">
        <div
          v-for="stat in versionStatCards"
          :key="stat.label"
          class="border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-3 py-3"
        >
          <div class="font-mono uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
            {{ stat.label }}
          </div>
          <div class="mt-1 text-[0.9rem] font-semibold text-[color:var(--studio-shell-text)]">
            {{ stat.value }}
          </div>
        </div>
      </div>
    </div>

    <div class="grid gap-2 border border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)] px-3 py-3">
      <div class="font-mono text-[0.6rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
        Compare
      </div>

      <div class="grid gap-2 border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-3 py-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="max-w-full break-words border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)] [overflow-wrap:anywhere]">
            {{ compareSummary.baseLabel }}
          </span>
          <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
            to
          </span>
          <span class="max-w-full break-words border border-[color:var(--studio-ring)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-text)] [overflow-wrap:anywhere]">
            {{ compareSummary.targetLabel }}
          </span>
        </div>
        <p :class="studioCompactBodyCopyClass">
          {{ buildPgmlCompareDeltaDescription(compareSummary.changedSectionCount) }}
        </p>
        <p
          v-if="compareRelationshipSummary.length > 0"
          class="text-[0.66rem] text-[color:var(--studio-shell-muted)]"
        >
          {{ compareRelationshipSummary }}
        </p>
      </div>

      <label class="grid gap-1">
        <span class="text-[0.68rem] text-[color:var(--studio-shell-muted)]">Base version</span>
        <USelect
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

      <div class="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
        <UButton
          data-version-open-comparator="true"
          label="Open comparator"
          color="neutral"
          variant="soft"
          size="xs"
          :class="joinStudioClasses(primaryButtonClass, stackedActionButtonClass)"
          @click="emit('open-comparator')"
        />
        <UButton
          data-version-open-migrations="true"
          label="Open migrations"
          color="neutral"
          variant="outline"
          size="xs"
          :class="joinStudioClasses(secondaryButtonClass, stackedActionButtonClass)"
          @click="emit('open-migrations')"
        />
        <UButton
          v-for="preset in comparePresetButtons"
          :key="preset.label"
          :label="preset.label"
          color="neutral"
          variant="outline"
          size="xs"
          :class="joinStudioClasses(secondaryButtonClass, stackedActionButtonClass)"
          :disabled="preset.disabled"
          @click="openComparatorWithPreset({ baseId: preset.baseId, targetId: preset.targetId })"
        />
        <UButton
          label="Swap"
          color="neutral"
          variant="outline"
          size="xs"
          :class="joinStudioClasses(secondaryButtonClass, stackedActionButtonClass)"
          :disabled="compareBaseId === null"
          @click="swapComparePair"
        />
      </div>

      <div class="flex flex-wrap gap-2 text-[0.58rem]">
        <span class="border border-[color:var(--studio-shell-label)] px-1.5 py-0.5 font-mono uppercase tracking-[0.08em] text-[color:var(--studio-shell-text)]">
          Added
        </span>
        <span class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
          Modified
        </span>
        <span class="border border-[color:var(--studio-shell-error)]/50 px-1.5 py-0.5 font-mono uppercase tracking-[0.08em] text-[color:var(--studio-shell-error)]">
          Removed
        </span>
      </div>

      <div
        v-if="hasDiffSections"
        class="grid grid-cols-1 gap-2 text-[0.66rem] text-[color:var(--studio-shell-muted)] md:grid-cols-2"
      >
        <div
          v-for="section in diffSections"
          :key="section.label"
          class="min-w-0 border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-2 py-2"
        >
          <div class="font-mono uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
            {{ section.label }}
          </div>
          <div class="mt-1 text-[0.8rem] font-semibold text-[color:var(--studio-shell-text)]">
            {{ section.count }}
          </div>
          <div class="mt-2 grid gap-1">
            <div
              v-for="item in section.items.slice(0, 3)"
              :key="item.id"
              class="flex items-start justify-between gap-2 text-[0.62rem]"
            >
              <span class="min-w-0 break-words text-[color:var(--studio-shell-text)] [overflow-wrap:anywhere]">
                {{ item.label }}
              </span>
              <span
                class="shrink-0 border px-1 py-0.5 font-mono uppercase tracking-[0.08em]"
                :class="getDiffKindClass(item.kind)"
              >
                {{ item.kind }}
              </span>
            </div>
            <div
              v-if="section.items.length > 3"
              class="text-[0.6rem] text-[color:var(--studio-shell-muted)]"
            >
              +{{ section.items.length - 3 }} more
            </div>
          </div>
        </div>
        <div class="min-w-0 border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-2 py-2">
          <div class="font-mono uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
            Layout
          </div>
          <div class="mt-1 text-[0.8rem] font-semibold text-[color:var(--studio-shell-text)]">
            {{ layoutChanged }}
          </div>
        </div>
      </div>

      <div
        v-else
        :class="studioEmptyStateClass"
      >
        No schema or layout changes are visible for the selected compare pair.
      </div>
    </div>

    <div class="grid gap-2 border border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)] px-3 py-3">
      <div class="font-mono text-[0.6rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
        Versions
      </div>

      <div class="grid gap-2">
        <button
          type="button"
          data-version-card="workspace"
          class="grid gap-1 border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-3 py-2 text-left"
          :class="previewTargetId === 'workspace' ? 'border-[color:var(--studio-ring)]' : ''"
          @click="emit('view-target', 'workspace')"
        >
          <span class="text-[0.78rem] font-semibold text-[color:var(--studio-shell-text)]">
            Current workspace
          </span>
          <span class="text-[0.66rem] text-[color:var(--studio-shell-muted)]">
            Editable working draft
          </span>
          <span class="text-[0.62rem] text-[color:var(--studio-shell-muted)]">
            {{ workspaceBaseLabel }}
          </span>
          <span class="text-[0.62rem] text-[color:var(--studio-shell-muted)]">
            {{ workspaceStatus }}
          </span>
          <span
            v-if="previewTargetId === 'workspace'"
            class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]"
          >
            Previewing now
          </span>
        </button>

        <div class="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <UButton
            data-version-workspace-compare-base="true"
            label="Base"
            color="neutral"
            variant="outline"
            size="xs"
            :class="joinStudioClasses(secondaryButtonClass, stackedActionButtonClass)"
            :disabled="compareBaseId === 'workspace'"
            @click="setCompareBase('workspace')"
          />
          <UButton
            data-version-workspace-compare-target="true"
            label="Target"
            color="neutral"
            variant="outline"
            size="xs"
            :class="joinStudioClasses(secondaryButtonClass, stackedActionButtonClass)"
            :disabled="compareTargetId === 'workspace'"
            @click="setCompareTarget('workspace')"
          />
        </div>

        <div
          v-if="!hasVersions"
          :class="studioEmptyStateClass"
        >
          Create the first checkpoint to lock a baseline before you compare or restore history.
        </div>

        <div
          v-for="(version, versionIndex) in versions"
          :key="version.id"
          :data-version-card="version.id"
          class="grid gap-2 border-l-2 border-[color:var(--studio-divider)] border-y border-r bg-[color:var(--studio-input-bg)] px-3 py-3"
          :class="previewTargetId === version.id ? 'border-[color:var(--studio-ring)]' : ''"
        >
          <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
                  {{ versionIndex + 1 }}
                </span>
                <div
                  data-version-label="true"
                  class="min-w-0 break-words text-[0.8rem] font-semibold text-[color:var(--studio-shell-text)] [overflow-wrap:anywhere]"
                >
                  {{ version.label }}
                </div>
                <span class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
                  {{ version.role }}
                </span>
                <span
                  v-if="version.isLatestByRole"
                  class="border border-[color:var(--studio-shell-label)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-text)]"
                >
                  Latest {{ version.role }}
                </span>
                <span
                  v-if="version.isLatestOverall"
                  class="border border-[color:var(--studio-shell-label)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-text)]"
                >
                  Latest overall
                </span>
                <span
                  v-if="version.isRoot"
                  class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]"
                >
                  Root
                </span>
                <span
                  v-if="version.isLeaf"
                  class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]"
                >
                  Leaf
                </span>
                <span
                  v-for="badge in buildVersionMetricBadges(version)"
                  :key="badge.label"
                  :class="mutedVersionBadgeClass"
                >
                  {{ badge.label }}
                </span>
                <span
                  v-if="version.isWorkspaceBase"
                  class="border border-[color:var(--studio-ring)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-text)]"
                >
                  Workspace base
                </span>
                <span
                  v-if="previewTargetId === version.id"
                  class="border border-[color:var(--studio-shell-label)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-text)]"
                >
                  Previewing now
                </span>
              </div>
              <div class="mt-1 break-words text-[0.66rem] text-[color:var(--studio-shell-muted)] [overflow-wrap:anywhere]">
                {{ version.createdAt }}
                <template v-if="version.parentVersionId">
                  · branches from {{ version.parentVersionId }}
                </template>
                <template v-else>
                  · starting point
                </template>
              </div>
              <div class="mt-1 break-words text-[0.62rem] text-[color:var(--studio-shell-muted)] [overflow-wrap:anywhere]">
                Path: {{ version.lineageLabel }}
              </div>
              <div
                v-if="version.branchRootLabel"
                class="mt-1 break-words text-[0.62rem] text-[color:var(--studio-shell-muted)] [overflow-wrap:anywhere]"
              >
                Branch root: {{ version.branchRootLabel }}
              </div>
            </div>

            <div class="grid grid-cols-2 gap-1 sm:flex sm:flex-wrap">
              <UButton
                :data-version-compare-base="version.id"
                label="Base"
                color="neutral"
                variant="outline"
                size="xs"
                :class="joinStudioClasses(secondaryButtonClass, stackedActionButtonClass)"
                :disabled="compareBaseId === version.id"
                @click="setCompareBase(version.id)"
              />
              <UButton
                :data-version-compare-target="version.id"
                label="Target"
                color="neutral"
                variant="outline"
                size="xs"
                :class="joinStudioClasses(secondaryButtonClass, stackedActionButtonClass)"
                :disabled="compareTargetId === version.id"
                @click="setCompareTarget(version.id)"
              />
              <UButton
                :data-version-view="version.id"
                label="View"
                color="neutral"
                variant="outline"
                size="xs"
                :class="joinStudioClasses(secondaryButtonClass, stackedActionButtonClass)"
                :disabled="previewTargetId === version.id"
                @click="emit('view-target', version.id)"
              />
              <UButton
                :data-version-restore="version.id"
                label="Restore"
                color="neutral"
                variant="soft"
                size="xs"
                :class="joinStudioClasses(primaryButtonClass, stackedActionButtonClass)"
                @click="emit('restore-version', version.id)"
              />
            </div>
          </div>
        </div>
      </div>

      <p :class="studioCompactBodyCopyClass">
        Preview target: {{ previewLabel }}.
      </p>
    </div>
  </div>
</template>
