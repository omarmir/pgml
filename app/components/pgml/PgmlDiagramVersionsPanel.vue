<script setup lang="ts">
import type { Ref } from 'vue'
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
  studioEmptyStateClass,
  studioPanelSurfaceClass
} from '~/utils/uiStyles'

type PgmlVersionPanelItem = {
  branchRootId: string | null
  branchRootLabel: string | null
  childCount: number
  createdAt: string
  descendantCount: number
  depth: number
  id: string
  isLeaf: boolean
  isLatestByRole: boolean
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

type PgmlVersionDiffSection = {
  count: number
  items: Array<{
    id: string
    kind: 'added' | 'modified' | 'removed'
    label: string
  }>
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
  migrationFileName = 'pgml-version.migration.sql',
  migrationHasChanges = false,
  migrationSql = '',
  migrationWarnings = [],
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
  migrationFileName?: string
  migrationHasChanges?: boolean
  migrationSql?: string
  migrationWarnings?: string[]
  previewTargetId?: string
  versions: PgmlVersionPanelItem[]
  workspaceBaseLabel?: string
  workspaceStatus?: string
}>()

const emit = defineEmits<{
  'create-checkpoint': []
  'import-dump': []
  'restore-version': [versionId: string]
  'update:compareBaseId': [value: string | null]
  'update:compareTargetId': [value: string]
  'view-target': [targetId: string]
}>()

const copyState: Ref<'idle' | 'success' | 'error'> = ref('idle')
const copyButtonClass = joinStudioClasses(studioButtonClasses.secondary, 'text-[0.65rem]')
const primaryButtonClass = joinStudioClasses(studioButtonClasses.primary, 'text-[0.65rem]')
const secondaryButtonClass = joinStudioClasses(studioButtonClasses.secondary, 'text-[0.65rem]')
const getDiffKindClass = (kind: 'added' | 'modified' | 'removed') => {
  if (kind === 'added') {
    return 'border-[color:var(--studio-shell-label)] text-[color:var(--studio-shell-text)]'
  }

  if (kind === 'removed') {
    return 'border-[color:var(--studio-shell-error)]/50 text-[color:var(--studio-shell-error)]'
  }

  return 'border-[color:var(--studio-divider)] text-[color:var(--studio-shell-muted)]'
}
const compareBaseOption = computed(() => {
  return compareBaseId ? compareOptions.find(option => option.value === compareBaseId) || null : null
})
const compareTargetOption = computed(() => {
  return compareOptions.find(option => option.value === compareTargetId) || null
})
const hasDiffSections = computed(() => diffSections.length > 0 || layoutChanged > 0)
const hasMigrationSql = computed(() => migrationHasChanges && migrationSql.trim().length > 0)
const hasVersions = computed(() => versions.length > 0)
const designVersionCount = computed(() => {
  return versions.filter(version => version.role === 'design').length
})
const implementationVersionCount = computed(() => {
  return versions.filter(version => version.role === 'implementation').length
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
const migrationLineCount = computed(() => {
  return hasMigrationSql.value ? migrationSql.trim().split('\n').length : 0
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

const handleCopyMigration = async () => {
  if (migrationSql.trim().length === 0) {
    return
  }

  try {
    await navigator.clipboard.writeText(migrationSql)
    copyState.value = 'success'
  } catch {
    copyState.value = 'error'
  }

  window.setTimeout(() => {
    copyState.value = 'idle'
  }, 1600)
}

const handleDownloadMigration = () => {
  if (migrationSql.trim().length === 0) {
    return
  }

  const blob = new Blob([migrationSql], {
    type: 'text/sql;charset=utf-8'
  })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = objectUrl
  anchor.download = migrationFileName
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}

const updateCompareBaseId = (value: unknown) => {
  if (typeof value !== 'string' || value.length === 0) {
    emit('update:compareBaseId', null)
    return
  }

  emit('update:compareBaseId', value)
}

const updateCompareTargetId = (value: unknown) => {
  if (typeof value !== 'string' || value.length === 0) {
    return
  }

  emit('update:compareTargetId', value)
}

const applyComparePreset = (input: {
  baseId: string | null
  targetId: string
}) => {
  emit('update:compareBaseId', input.baseId)
  emit('update:compareTargetId', input.targetId)
}

const swapComparePair = () => {
  if (compareBaseId === null) {
    return
  }

  applyComparePreset({
    baseId: compareTargetId === 'workspace' ? null : compareTargetId,
    targetId: compareBaseId
  })
}
</script>

<template>
  <div
    data-diagram-versions-panel="true"
    class="grid content-start gap-3 overflow-auto px-3 py-3"
  >
    <div class="sticky top-0 z-[1] grid gap-3 bg-[color:var(--studio-shell-bg)] pb-1">
      <div class="flex flex-wrap gap-2">
        <UButton
          label="Create checkpoint"
          color="neutral"
          variant="soft"
          :class="primaryButtonClass"
          :disabled="!canCreateCheckpoint"
          @click="emit('create-checkpoint')"
        />
        <UButton
          label="Import dump"
          color="neutral"
          variant="outline"
          :class="secondaryButtonClass"
          :disabled="!hasVersions"
          @click="emit('import-dump')"
        />
      </div>

      <div :class="joinStudioClasses(studioPanelSurfaceClass, 'px-3 py-3')">
        <p :class="studioCompactBodyCopyClass">
          Lock workspace checkpoints, compare snapshots, and export forward SQL from the selected base to the selected target.
        </p>
        <p
          v-if="!canCreateCheckpoint"
          class="mt-2 text-[0.66rem] text-[color:var(--studio-shell-muted)]"
        >
          The current workspace still matches its base version, so there is no new checkpoint to lock yet.
        </p>
        <p
          v-if="!hasVersions"
          class="mt-2 text-[0.66rem] text-[color:var(--studio-shell-muted)]"
        >
          Import stays locked until you create the first checkpointed base version.
        </p>
      </div>

      <div class="grid grid-cols-3 gap-2 text-[0.66rem] text-[color:var(--studio-shell-muted)]">
        <div class="border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-3 py-3">
          <div class="font-mono uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
            Locked
          </div>
          <div class="mt-1 text-[0.9rem] font-semibold text-[color:var(--studio-shell-text)]">
            {{ versions.length }}
          </div>
        </div>
        <div class="border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-3 py-3">
          <div class="font-mono uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
            Design
          </div>
          <div class="mt-1 text-[0.9rem] font-semibold text-[color:var(--studio-shell-text)]">
            {{ designVersionCount }}
          </div>
        </div>
        <div class="border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-3 py-3">
          <div class="font-mono uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
            Impl
          </div>
          <div class="mt-1 text-[0.9rem] font-semibold text-[color:var(--studio-shell-text)]">
            {{ implementationVersionCount }}
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
          <span class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
            {{ compareSummary.baseLabel }}
          </span>
          <span class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
            to
          </span>
          <span class="border border-[color:var(--studio-ring)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-text)]">
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

      <div class="flex flex-wrap gap-2">
        <UButton
          label="Workspace base to draft"
          color="neutral"
          variant="outline"
          size="xs"
          :class="secondaryButtonClass"
          :disabled="workspaceBaseVersionId === null"
          @click="applyComparePreset({ baseId: workspaceBaseVersionId, targetId: 'workspace' })"
        />
        <UButton
          label="Latest to draft"
          color="neutral"
          variant="outline"
          size="xs"
          :class="secondaryButtonClass"
          :disabled="latestVersionId === null"
          @click="applyComparePreset({ baseId: latestVersionId, targetId: 'workspace' })"
        />
        <UButton
          label="Latest impl to draft"
          color="neutral"
          variant="outline"
          size="xs"
          :class="secondaryButtonClass"
          :disabled="latestImplementationVersionId === null"
          @click="applyComparePreset({ baseId: latestImplementationVersionId, targetId: 'workspace' })"
        />
        <UButton
          label="Latest design to draft"
          color="neutral"
          variant="outline"
          size="xs"
          :class="secondaryButtonClass"
          :disabled="latestDesignVersionId === null"
          @click="applyComparePreset({ baseId: latestDesignVersionId, targetId: 'workspace' })"
        />
        <UButton
          label="Swap"
          color="neutral"
          variant="outline"
          size="xs"
          :class="secondaryButtonClass"
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
        class="grid grid-cols-2 gap-2 text-[0.66rem] text-[color:var(--studio-shell-muted)]"
      >
        <div
          v-for="section in diffSections"
          :key="section.label"
          class="border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-2 py-2"
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
              <span class="min-w-0 truncate text-[color:var(--studio-shell-text)]">
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
        <div class="border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-2 py-2">
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

        <div
          v-if="!hasVersions"
          :class="studioEmptyStateClass"
        >
          Create the first checkpoint to lock a baseline before you compare or restore history.
        </div>

        <div
          v-for="(version, versionIndex) in versions"
          :key="version.id"
          class="grid gap-2 border-l-2 border-[color:var(--studio-divider)] border-y border-r bg-[color:var(--studio-input-bg)] px-3 py-3"
          :class="previewTargetId === version.id ? 'border-[color:var(--studio-ring)]' : ''"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
                  {{ versionIndex + 1 }}
                </span>
                <div class="truncate text-[0.8rem] font-semibold text-[color:var(--studio-shell-text)]">
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
                <span class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
                  Level {{ version.depth }}
                </span>
                <span
                  v-if="version.childCount > 0"
                  class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]"
                >
                  {{ version.childCount }} branch{{ version.childCount === 1 ? '' : 'es' }}
                </span>
                <span
                  v-if="version.siblingCount > 0"
                  class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]"
                >
                  {{ version.siblingCount }} sibling{{ version.siblingCount === 1 ? '' : 's' }}
                </span>
                <span
                  v-if="version.descendantCount > 0"
                  class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]"
                >
                  {{ version.descendantCount }} descendant{{ version.descendantCount === 1 ? '' : 's' }}
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
              <div class="mt-1 text-[0.66rem] text-[color:var(--studio-shell-muted)]">
                {{ version.createdAt }}
                <template v-if="version.parentVersionId">
                  · branches from {{ version.parentVersionId }}
                </template>
                <template v-else>
                  · starting point
                </template>
              </div>
              <div class="mt-1 text-[0.62rem] text-[color:var(--studio-shell-muted)]">
                Path: {{ version.lineageLabel }}
              </div>
              <div
                v-if="version.branchRootLabel"
                class="mt-1 text-[0.62rem] text-[color:var(--studio-shell-muted)]"
              >
                Branch root: {{ version.branchRootLabel }}
              </div>
            </div>

            <div class="flex flex-wrap gap-1">
              <UButton
                label="Compare"
                color="neutral"
                variant="outline"
                size="xs"
                :class="secondaryButtonClass"
                @click="applyComparePreset({ baseId: version.id, targetId: 'workspace' })"
              />
              <UButton
                label="View"
                color="neutral"
                variant="outline"
                size="xs"
                :class="secondaryButtonClass"
                @click="emit('view-target', version.id)"
              />
              <UButton
                label="Restore"
                color="neutral"
                variant="soft"
                size="xs"
                :class="primaryButtonClass"
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

    <div class="grid gap-2 border border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)] px-3 py-3">
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="font-mono text-[0.6rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
            Migration SQL
          </div>
          <div class="mt-1 text-[0.66rem] text-[color:var(--studio-shell-muted)]">
            {{ hasMigrationSql ? `${migrationLineCount} line${migrationLineCount === 1 ? '' : 's'} ready · ${migrationFileName}` : 'No forward migration generated yet.' }}
          </div>
        </div>
        <div class="flex flex-wrap gap-1">
          <UButton
            :label="copyState === 'success' ? 'Copied' : (copyState === 'error' ? 'Copy failed' : 'Copy')"
            color="neutral"
            variant="outline"
            size="xs"
            :class="copyButtonClass"
            :disabled="!hasMigrationSql"
            @click="handleCopyMigration"
          />
          <UButton
            label="Download"
            color="neutral"
            variant="soft"
            size="xs"
            :class="primaryButtonClass"
            :disabled="!hasMigrationSql"
            @click="handleDownloadMigration"
          />
        </div>
      </div>

      <div
        v-if="migrationWarnings.length > 0"
        class="grid gap-1 border border-[color:var(--studio-shell-error)]/30 bg-[color:var(--studio-shell-error)]/8 px-3 py-3 text-[0.68rem] text-[color:var(--studio-shell-text)]"
      >
        <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-error)]">
          Warnings
        </div>
        <div
          v-for="warning in migrationWarnings"
          :key="warning"
        >
          {{ warning }}
        </div>
      </div>

      <pre
        v-if="hasMigrationSql"
        class="max-h-96 overflow-auto border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-3 py-3 text-[0.68rem] leading-6 text-[color:var(--studio-shell-text)]"
      >{{ migrationSql }}</pre>

      <div
        v-else
        :class="studioEmptyStateClass"
      >
        Choose a compare pair with schema changes to preview the forward migration SQL here.
      </div>
    </div>
  </div>
</template>
