<script setup lang="ts">
import {
  buildPgmlPreviewTargetLabel
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

const {
  canCreateCheckpoint = true,
  previewTargetId = 'workspace',
  versions,
  workspaceBaseLabel = 'No base version yet',
  workspaceStatus = 'Draft is ready to checkpoint.'
} = defineProps<{
  canCreateCheckpoint?: boolean
  previewTargetId?: string
  versions: PgmlVersionPanelItem[]
  workspaceBaseLabel?: string
  workspaceStatus?: string
}>()

const emit = defineEmits<{
  'create-checkpoint': []
  'import-dbml': []
  'import-dump': []
  'rename-version': [versionId: string]
  'restore-version': [versionId: string]
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
const hasVersions = computed(() => versions.length > 0)
const previewLabel = computed(() => {
  return buildPgmlPreviewTargetLabel({
    fallbackLabel: versions.find(version => version.id === previewTargetId)?.label || null,
    previewTargetId,
    workspaceLabel: 'Current workspace'
  })
})
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
          data-version-import-dbml="true"
          label="Import DBML"
          color="neutral"
          variant="outline"
          :class="secondaryButtonClass"
          :disabled="!hasVersions"
          @click="emit('import-dbml')"
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
        Choose which locked snapshot the diagram and raw PGML preview should show. Compare and migrations now live in their own dedicated tabs.
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
    </div>

    <div class="grid gap-2 border border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)] px-3 py-3">
      <div class="font-mono text-[0.6rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
        Version Switcher
      </div>
      <p :class="studioCompactBodyCopyClass">
        Pick the workspace or a locked checkpoint to change the diagram preview. Restore copies a locked snapshot back into the workspace draft.
      </p>

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
                Locked {{ version.role }} checkpoint · {{ version.createdAt }}
                <template v-if="version.parentVersionId">
                  · from {{ version.parentVersionId }}
                </template>
                <template v-else>
                  · starting point
                </template>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-1 sm:flex sm:flex-wrap">
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
                :data-version-rename="version.id"
                label="Rename"
                color="neutral"
                variant="outline"
                size="xs"
                :class="joinStudioClasses(secondaryButtonClass, stackedActionButtonClass)"
                @click="emit('rename-version', version.id)"
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
