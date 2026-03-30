<script setup lang="ts">
import JSZip from 'jszip'
import type { Ref } from 'vue'
import { computed, ref, watchEffect } from 'vue'
import type { PgmlVersionMigrationStepBundle } from '~/utils/pgml-version-migration'
import {
  joinStudioClasses,
  studioButtonClasses,
  studioCompactBodyCopyClass,
  studioEmptyStateClass,
  studioPanelSurfaceClass
} from '~/utils/uiStyles'

type PgmlMigrationFormat = 'sql' | 'kysely'
type PgmlMigrationSelectionScope = 'combined' | `step:${number}`

type PgmlVersionMigrationArtifact = {
  content: string
  fileName: string
  hasChanges: boolean
  label: string
  mimeType: string
  warnings: string[]
}

const {
  compareBaseLabel = 'Base',
  compareTargetLabel = 'Target',
  migrationFileName = 'pgml-version.migration.sql',
  migrationHasChanges = false,
  migrationKysely = '',
  migrationKyselyFileName = 'pgml-version.migration.ts',
  migrationSql = '',
  migrationSteps = [],
  migrationWarnings = []
} = defineProps<{
  compareBaseLabel?: string
  compareTargetLabel?: string
  migrationFileName?: string
  migrationHasChanges?: boolean
  migrationKysely?: string
  migrationKyselyFileName?: string
  migrationSql?: string
  migrationSteps?: PgmlVersionMigrationStepBundle[]
  migrationWarnings?: string[]
}>()

const copyState: Ref<'idle' | 'success' | 'error'> = ref('idle')
const activeMigrationFormat: Ref<PgmlMigrationFormat> = ref('sql')
const activeMigrationScope: Ref<PgmlMigrationSelectionScope> = ref('combined')
const copyButtonClass = joinStudioClasses(studioButtonClasses.secondary, 'text-[0.65rem]')
const primaryButtonClass = joinStudioClasses(studioButtonClasses.primary, 'text-[0.65rem]')
const secondaryButtonClass = joinStudioClasses(studioButtonClasses.secondary, 'text-[0.65rem]')

// The migrations panel surfaces the same lineage artifacts that drive export,
// copy, and preview. Keeping the metadata bundled avoids branching across the
// UI whenever the user switches format or version step.
const createVersionMigrationArtifact = (input: {
  content: string
  fileName: string
  hasChanges: boolean
  label: string
  mimeType: string
  warnings: string[]
}) => {
  return {
    content: input.content,
    fileName: input.fileName,
    hasChanges: input.hasChanges,
    label: input.label,
    mimeType: input.mimeType,
    warnings: input.warnings
  } satisfies PgmlVersionMigrationArtifact
}

const hasUsableMigrationArtifact = (content: string, hasChanges: boolean, warnings: string[]) => {
  return (hasChanges || warnings.length > 0) && content.trim().length > 0
}

const combinedMigrationArtifacts = computed<Record<PgmlMigrationFormat, PgmlVersionMigrationArtifact>>(() => {
  return {
    kysely: createVersionMigrationArtifact({
      content: migrationKysely,
      fileName: migrationKyselyFileName,
      hasChanges: hasUsableMigrationArtifact(migrationKysely, migrationHasChanges, migrationWarnings),
      label: 'Kysely',
      mimeType: 'text/plain;charset=utf-8',
      warnings: migrationWarnings
    }),
    sql: createVersionMigrationArtifact({
      content: migrationSql,
      fileName: migrationFileName,
      hasChanges: hasUsableMigrationArtifact(migrationSql, migrationHasChanges, migrationWarnings),
      label: 'SQL',
      mimeType: 'text/sql;charset=utf-8',
      warnings: migrationWarnings
    })
  }
})

const getMigrationScopeStepIndex = (scope: PgmlMigrationSelectionScope) => {
  if (scope === 'combined') {
    return null
  }

  return Number.parseInt(scope.replace('step:', ''), 10)
}

const buildMigrationScopeLabel = (step: PgmlVersionMigrationStepBundle | null) => {
  if (!step) {
    return 'Combined history sequence'
  }

  return `Step ${step.index + 1}: ${step.label}`
}

const buildMigrationFilePairLabel = (sqlFileName: string, kyselyFileName: string) => {
  return `${sqlFileName} · ${kyselyFileName}`
}

const buildMigrationStepStatsLabel = (step: PgmlVersionMigrationStepBundle) => {
  return `${step.meta.statementCount} statement${step.meta.statementCount === 1 ? '' : 's'} · ${step.meta.warningCount} warning${step.meta.warningCount === 1 ? '' : 's'}`
}

const selectedMigrationStep = computed(() => {
  const selectedIndex = getMigrationScopeStepIndex(activeMigrationScope.value)

  if (selectedIndex === null) {
    return null
  }

  return migrationSteps.find(step => step.index === selectedIndex) || null
})

const getMigrationArtifactForFormat = (format: PgmlMigrationFormat) => {
  if (!selectedMigrationStep.value) {
    return combinedMigrationArtifacts.value[format]
  }

  const stepArtifact = format === 'sql'
    ? selectedMigrationStep.value.sql.migration
    : selectedMigrationStep.value.kysely.migration
  const hasArtifact = selectedMigrationStep.value.meta.hasChanges || selectedMigrationStep.value.meta.warningCount > 0

  return createVersionMigrationArtifact({
    content: stepArtifact.content,
    fileName: stepArtifact.fileName,
    hasChanges: hasUsableMigrationArtifact(
      stepArtifact.content,
      hasArtifact,
      stepArtifact.warnings
    ),
    label: stepArtifact.label,
    mimeType: format === 'sql'
      ? 'text/sql;charset=utf-8'
      : 'text/plain;charset=utf-8',
    warnings: stepArtifact.warnings
  })
}

const buildStepMigrationArtifact = (
  step: PgmlVersionMigrationStepBundle,
  format: PgmlMigrationFormat
) => {
  const stepArtifact = format === 'sql'
    ? step.sql.migration
    : step.kysely.migration

  return createVersionMigrationArtifact({
    content: stepArtifact.content,
    fileName: stepArtifact.fileName,
    hasChanges: hasUsableMigrationArtifact(
      stepArtifact.content,
      step.meta.hasChanges || step.meta.warningCount > 0,
      stepArtifact.warnings
    ),
    label: stepArtifact.label,
    mimeType: format === 'sql'
      ? 'text/sql;charset=utf-8'
      : 'text/plain;charset=utf-8',
    warnings: stepArtifact.warnings
  })
}

const hasStepMigrationFiles = computed(() => migrationSteps.length > 0)
const hasMigrationSql = computed(() => getMigrationArtifactForFormat('sql').hasChanges)
const hasMigrationKysely = computed(() => getMigrationArtifactForFormat('kysely').hasChanges)
const activeMigrationDownloadArtifacts = computed(() => {
  if (selectedMigrationStep.value) {
    return [getMigrationArtifactForFormat(activeMigrationFormat.value)]
  }

  if (migrationSteps.length > 0) {
    return migrationSteps
      .map(step => buildStepMigrationArtifact(step, activeMigrationFormat.value))
      .filter(artifact => artifact.hasChanges)
  }

  return [getMigrationArtifactForFormat(activeMigrationFormat.value)].filter(artifact => artifact.hasChanges)
})
const activeMigrationArtifact = computed(() => {
  return getMigrationArtifactForFormat(activeMigrationFormat.value)
})
const migrationLineCount = computed(() => {
  const migrationContent = activeMigrationArtifact.value.content

  return migrationContent.trim().length > 0
    ? migrationContent.trim().split('\n').length
    : 0
})
const activeMigrationLabel = computed(() => {
  return activeMigrationArtifact.value.label
})
const activeMigrationContent = computed(() => {
  return activeMigrationArtifact.value.content
})
const hasActiveMigration = computed(() => {
  return activeMigrationArtifact.value.hasChanges
})
const activeMigrationDownloadCount = computed(() => {
  return activeMigrationDownloadArtifacts.value.length
})
const hasMigrationArchive = computed(() => {
  return activeMigrationDownloadCount.value > 1
})
const selectedMigrationScopeLabel = computed(() => {
  return buildMigrationScopeLabel(selectedMigrationStep.value)
})
const displayedMigrationWarnings = computed(() => {
  return activeMigrationArtifact.value.warnings
})
const migrationOutputSummary = computed(() => {
  if (!hasActiveMigration.value) {
    return `No forward ${activeMigrationLabel.value.toLowerCase()} migration generated yet.`
  }

  const fileLabel = activeMigrationDownloadCount.value === 1 ? 'file' : 'files'
  const previewLineLabel = migrationLineCount.value === 1 ? 'line' : 'lines'

  if (hasMigrationArchive.value) {
    return `${selectedMigrationScopeLabel.value} · ${activeMigrationLabel.value} · ${migrationLineCount.value} ${previewLineLabel} in preview · ${activeMigrationDownloadCount.value} ordered ${fileLabel} in one archive`
  }

  return `${selectedMigrationScopeLabel.value} · ${activeMigrationLabel.value} · ${migrationLineCount.value} ${previewLineLabel} in preview · ${activeMigrationDownloadCount.value} downloadable ${fileLabel}`
})
const migrationDownloadLabel = computed(() => {
  if (hasMigrationArchive.value) {
    return `Download ${activeMigrationLabel.value} archive`
  }

  return `Download ${activeMigrationLabel.value}`
})

const isMigrationScopeActive = (scope: PgmlMigrationSelectionScope) => {
  return activeMigrationScope.value === scope
}

const selectMigrationScope = (scope: PgmlMigrationSelectionScope) => {
  activeMigrationScope.value = scope
}

const downloadMigrationBlob = (blob: Blob, fileName: string) => {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = objectUrl
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(objectUrl)
}

const downloadMigrationArtifactFile = (artifact: PgmlVersionMigrationArtifact) => {
  const blob = new Blob([artifact.content], {
    type: artifact.mimeType
  })

  downloadMigrationBlob(blob, artifact.fileName)
}

const buildMigrationArchiveFileName = (format: PgmlMigrationFormat) => {
  return `${combinedMigrationArtifacts.value[format].fileName}.zip`
}

const downloadMigrationArtifactArchive = async (
  artifacts: PgmlVersionMigrationArtifact[],
  format: PgmlMigrationFormat
) => {
  // Combined history downloads need to preserve the on-disk migration order
  // while still giving the user one transferable artifact. The zip keeps the
  // numbered step files intact so replay-by-filename still works after extract.
  const archive = new JSZip()

  artifacts.forEach((artifact) => {
    archive.file(artifact.fileName, artifact.content)
  })

  const blob = await archive.generateAsync({
    type: 'blob'
  })

  downloadMigrationBlob(blob, buildMigrationArchiveFileName(format))
}

const handleCopyMigration = async () => {
  if (activeMigrationContent.value.trim().length === 0) {
    return
  }

  try {
    await navigator.clipboard.writeText(activeMigrationContent.value)
    copyState.value = 'success'
  } catch {
    copyState.value = 'error'
  }

  window.setTimeout(() => {
    copyState.value = 'idle'
  }, 1600)
}

const handleDownloadMigration = async () => {
  if (activeMigrationDownloadArtifacts.value.length === 0) {
    return
  }

  if (hasMigrationArchive.value) {
    await downloadMigrationArtifactArchive(
      activeMigrationDownloadArtifacts.value,
      activeMigrationFormat.value
    )
    return
  }

  downloadMigrationArtifactFile(activeMigrationDownloadArtifacts.value[0]!)
}

watchEffect(() => {
  if (activeMigrationScope.value === 'combined') {
    return
  }

  if (!selectedMigrationStep.value) {
    activeMigrationScope.value = 'combined'
  }
})
</script>

<template>
  <div
    data-diagram-migrations-panel="true"
    class="grid content-start gap-3 overflow-auto px-3 py-3"
  >
    <div :class="joinStudioClasses(studioPanelSurfaceClass, 'grid gap-3 px-3 py-3')">
      <div class="flex flex-wrap items-center gap-2">
        <span class="border border-[color:var(--studio-divider)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
          {{ compareBaseLabel }}
        </span>
        <span class="font-mono text-[0.56rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-muted)]">
          to
        </span>
        <span class="border border-[color:var(--studio-ring)] px-1.5 py-0.5 font-mono text-[0.52rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-text)]">
          {{ compareTargetLabel }}
        </span>
      </div>

      <p :class="studioCompactBodyCopyClass">
        Export SQL or Kysely forward migrations for the active compare pair. Use the Compare tool to change the base or target snapshot.
      </p>
    </div>

    <div class="grid gap-2 border border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)] px-3 py-3">
      <div class="font-mono text-[0.6rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
        Migration Output
      </div>
      <div class="text-[0.68rem] leading-5 text-[color:var(--studio-shell-muted)]">
        {{ migrationOutputSummary }}
      </div>

      <div class="flex flex-wrap gap-2">
        <UButton
          data-version-migration-format="sql"
          label="SQL"
          color="neutral"
          :variant="activeMigrationFormat === 'sql' ? 'soft' : 'outline'"
          size="xs"
          :class="activeMigrationFormat === 'sql' ? primaryButtonClass : secondaryButtonClass"
          :disabled="!hasMigrationSql && activeMigrationFormat !== 'sql'"
          @click="activeMigrationFormat = 'sql'"
        />
        <UButton
          data-version-migration-format="kysely"
          label="Kysely"
          color="neutral"
          :variant="activeMigrationFormat === 'kysely' ? 'soft' : 'outline'"
          size="xs"
          :class="activeMigrationFormat === 'kysely' ? primaryButtonClass : secondaryButtonClass"
          :disabled="!hasMigrationKysely && activeMigrationFormat !== 'kysely'"
          @click="activeMigrationFormat = 'kysely'"
        />
        <UButton
          :data-version-migration-copy="activeMigrationFormat"
          :label="copyState === 'success' ? 'Copied' : (copyState === 'error' ? 'Copy failed' : `Copy ${activeMigrationLabel}`)"
          color="neutral"
          variant="outline"
          size="xs"
          :class="copyButtonClass"
          :disabled="!hasActiveMigration"
          @click="handleCopyMigration"
        />
        <UButton
          :data-version-migration-download="activeMigrationFormat"
          :label="migrationDownloadLabel"
          color="neutral"
          variant="outline"
          size="xs"
          :class="secondaryButtonClass"
          :disabled="!hasActiveMigration"
          @click="handleDownloadMigration"
        />
      </div>

      <div
        v-if="hasStepMigrationFiles"
        class="grid gap-2"
      >
        <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-label)]">
          Version files
        </div>

        <button
          type="button"
          data-version-migration-scope="combined"
          class="grid gap-1 border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-3 py-2 text-left"
          :class="isMigrationScopeActive('combined') ? 'border-[color:var(--studio-ring)]' : ''"
          @click="selectMigrationScope('combined')"
        >
          <span class="text-[0.74rem] font-semibold text-[color:var(--studio-shell-text)]">
            Combined history sequence
          </span>
          <span class="text-[0.62rem] text-[color:var(--studio-shell-muted)]">
            Preview the whole lineage at once, then download the numbered step files together as one archive.
          </span>
          <span class="text-[0.6rem] text-[color:var(--studio-shell-muted)]">
            {{ buildMigrationFilePairLabel(migrationFileName, migrationKyselyFileName) }}
          </span>
        </button>

        <button
          v-for="step in migrationSteps"
          :key="step.sql.migration.fileName"
          type="button"
          :data-version-migration-scope="`step:${step.index}`"
          class="grid gap-1 border border-[color:var(--studio-divider)] bg-[color:var(--studio-input-bg)] px-3 py-2 text-left"
          :class="isMigrationScopeActive(`step:${step.index}`) ? 'border-[color:var(--studio-ring)]' : ''"
          @click="selectMigrationScope(`step:${step.index}`)"
        >
          <span class="text-[0.74rem] font-semibold text-[color:var(--studio-shell-text)]">
            {{ buildMigrationScopeLabel(step) }}
          </span>
          <span class="text-[0.62rem] text-[color:var(--studio-shell-muted)]">
            {{ buildMigrationStepStatsLabel(step) }}
          </span>
          <span class="text-[0.6rem] text-[color:var(--studio-shell-muted)]">
            {{ buildMigrationFilePairLabel(step.sql.migration.fileName, step.kysely.migration.fileName) }}
          </span>
        </button>
      </div>

      <div
        v-if="displayedMigrationWarnings.length > 0"
        data-version-migration-warnings="true"
        class="grid gap-2 border border-[color:var(--studio-shell-error)]/40 bg-[color:var(--studio-input-bg)] px-3 py-3"
      >
        <div class="font-mono text-[0.58rem] uppercase tracking-[0.08em] text-[color:var(--studio-shell-error)]">
          Validation issue:
        </div>
        <div
          v-for="warning in displayedMigrationWarnings"
          :key="warning"
          class="text-[0.66rem] leading-5 text-[color:var(--studio-shell-muted)]"
        >
          {{ warning }}
        </div>
      </div>

      <pre
        v-if="hasActiveMigration"
        data-version-migration-artifact="true"
        :data-version-migration-format-active="activeMigrationFormat"
        :class="joinStudioClasses(studioPanelSurfaceClass, 'max-h-[28rem] overflow-auto px-3 py-3 font-mono text-[0.68rem] leading-6 text-[color:var(--studio-shell-text)]')"
      >{{ activeMigrationContent }}</pre>

      <div
        v-else
        :class="studioEmptyStateClass"
      >
        Choose a compare pair with schema changes to preview the forward migration output here.
      </div>
    </div>
  </div>
</template>
