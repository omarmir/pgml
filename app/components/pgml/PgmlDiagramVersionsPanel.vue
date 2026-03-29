<script setup lang="ts">
import type { Ref } from 'vue'
import {
  studioSelectUi
} from '~/constants/ui'
import {
  joinStudioClasses,
  studioButtonClasses,
  studioCompactBodyCopyClass,
  studioEmptyStateClass,
  studioPanelSurfaceClass
} from '~/utils/uiStyles'

type PgmlVersionPanelItem = {
  createdAt: string
  id: string
  isWorkspaceBase: boolean
  label: string
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
  compareBaseId = null,
  compareOptions,
  compareTargetId,
  diffSections,
  layoutChanged = 0,
  migrationFileName = 'pgml-version.migration.sql',
  migrationSql = '',
  migrationWarnings = [],
  previewTargetId = 'workspace',
  versions
} = defineProps<{
  compareBaseId?: string | null
  compareOptions: PgmlVersionCompareOption[]
  compareTargetId: string
  diffSections: PgmlVersionDiffSection[]
  layoutChanged?: number
  migrationFileName?: string
  migrationSql?: string
  migrationWarnings?: string[]
  previewTargetId?: string
  versions: PgmlVersionPanelItem[]
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
const hasMigrationSql = computed(() => migrationSql.trim().length > 0)
const hasVersions = computed(() => versions.length > 0)
const compareSummary = computed(() => {
  const baseLabel = compareBaseOption.value?.label || 'Empty schema'
  const targetLabel = compareTargetOption.value?.label || 'Current workspace'
  const changedSectionCount = diffSections.length + (layoutChanged > 0 ? 1 : 0)

  return {
    baseLabel,
    changedSectionCount,
    targetLabel
  }
})
const previewLabel = computed(() => {
  if (previewTargetId === 'workspace') {
    return 'Current workspace'
  }

  return versions.find(version => version.id === previewTargetId)?.label || 'Selected version'
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
</script>

<template>
  <div
    data-diagram-versions-panel="true"
    class="grid content-start gap-3 overflow-auto px-3 py-3"
  >
    <div class="flex flex-wrap gap-2">
      <UButton
        label="Create checkpoint"
        color="neutral"
        variant="soft"
        :class="primaryButtonClass"
        @click="emit('create-checkpoint')"
      />
      <UButton
        label="Import dump"
        color="neutral"
        variant="outline"
        :class="secondaryButtonClass"
        @click="emit('import-dump')"
      />
    </div>

    <div :class="joinStudioClasses(studioPanelSurfaceClass, 'px-3 py-3')">
      <p :class="studioCompactBodyCopyClass">
        Lock workspace checkpoints, compare snapshots, and export forward SQL from the selected base to the selected target.
      </p>
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
          {{
            compareSummary.changedSectionCount > 0
              ? `${compareSummary.changedSectionCount} changed area${compareSummary.changedSectionCount === 1 ? '' : 's'} in the selected comparison.`
              : 'No visible delta in the selected comparison.'
          }}
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
          v-for="version in versions"
          :key="version.id"
          class="grid gap-2 border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-3 py-3"
          :class="previewTargetId === version.id ? 'border-[color:var(--studio-ring)]' : ''"
        >
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <div class="truncate text-[0.8rem] font-semibold text-[color:var(--studio-shell-text)]">
                  {{ version.label }}
                </div>
                <span class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
                  {{ version.role }}
                </span>
                <span
                  v-if="version.parentVersionId === null"
                  class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]"
                >
                  Root
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
              </div>
            </div>

            <div class="flex flex-wrap gap-1">
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
        <div class="font-mono text-[0.6rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
          Migration SQL
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
        class="grid gap-1 border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-3 py-3 text-[0.68rem] text-[color:var(--studio-shell-muted)]"
      >
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
