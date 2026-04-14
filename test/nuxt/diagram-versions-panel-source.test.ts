import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram versions panel source', () => {
  it('keeps version history controls separate from the dedicated migrations tool', () => {
    const versionsFile = readSourceFile('app/components/pgml/PgmlDiagramVersionsPanel.vue')
    const migrationsFile = readSourceFile('app/components/pgml/PgmlDiagramMigrationsPanel.vue')
    const expectedMigrationStrings = [
      'import JSZip from \'jszip\'',
      'compareBaseLabel = \'Base\'',
      'compareTargetLabel = \'Target\'',
      'migrationHasChanges = false',
      'type PgmlMigrationSelectionScope = \'combined\' | `step:${number}`',
      'type PgmlMigrationFormat = \'sql\' | \'kysely\'',
      'type PgmlVersionMigrationArtifact = {',
      'migrationSteps = []',
      'const activeMigrationFormat: Ref<PgmlMigrationFormat> = ref(\'sql\')',
      'const activeMigrationScope: Ref<PgmlMigrationSelectionScope> = ref(\'combined\')',
      'const combinedMigrationArtifacts = computed<Record<PgmlMigrationFormat, PgmlVersionMigrationArtifact>>(() => {',
      'const activeMigrationDownloadArtifacts = computed(() => {',
      'const hasMigrationArchive = computed(() => {',
      'return migrationSteps',
      'filter(artifact => artifact.hasChanges)',
      'return `${selectedMigrationScopeLabel.value} · ${activeMigrationLabel.value} · ${migrationLineCount.value} ${previewLineLabel} in preview · ${activeMigrationDownloadCount.value} ordered ${fileLabel} in one archive`',
      'return `Download ${activeMigrationLabel.value} archive`',
      'const buildMigrationArchiveFileName = (format: PgmlMigrationFormat) => {',
      'const downloadMigrationArtifactArchive = async (',
      'const archive = new JSZip()',
      'archive.file(artifact.fileName, artifact.content)',
      'await archive.generateAsync({',
      'downloadMigrationBlob(blob, buildMigrationArchiveFileName(format))',
      'const getMigrationArtifactForFormat = (format: PgmlMigrationFormat) => {',
      'const hasMigrationSql = computed(() => getMigrationArtifactForFormat(\'sql\').hasChanges)',
      'const hasMigrationKysely = computed(() => getMigrationArtifactForFormat(\'kysely\').hasChanges)',
      'const activeMigrationArtifact = computed(() => {',
      'const selectedMigrationScopeLabel = computed(() => {',
      'const displayedMigrationWarnings = computed(() => {',
      'activeMigrationFormat = \'kysely\'',
      'return activeMigrationArtifact.value.label',
      'return activeMigrationArtifact.value.content',
      'return activeMigrationArtifact.value.hasChanges',
      'data-version-migration-format="kysely"',
      'data-version-migration-scope="combined"',
      'v-for="step in migrationSteps"',
      ':data-version-migration-scope="`step:${step.index}`"',
      'Combined history sequence',
      'Preview the whole lineage at once, then download the numbered step files together as one archive.',
      'Validation issue:',
      'Use the Compare tool to change the base or target snapshot.',
      'const migrationActionButtonClass = joinStudioClasses(studioPanelActionButtonClass, \'justify-center\')',
      'const getMigrationFormatButtonClass = (format: PgmlMigrationFormat) => {',
      'getStudioPanelToggleChipClass({',
      ':class="getMigrationFormatButtonClass(\'sql\')"',
      ':class="migrationActionButtonClass"'
    ]
    const expectedVersionStrings = [
      'data-version-overview="true"',
      'Choose which locked snapshot the diagram and raw PGML preview should show. Compare and migrations now live in their own dedicated tabs.',
      'Version Switcher',
      'data-version-import-dbml="true"',
      'label="Import DBML"',
      'Pick the workspace or a locked checkpoint to change the diagram preview. Restore copies a locked snapshot back into the workspace draft.',
      '<div class="grid gap-2">',
      'Locked {{ version.role }} checkpoint',
      'Leaf',
      'Latest overall',
      'Latest {{ version.role }}',
      'const stackedActionButtonClass = \'w-full min-w-[5.5rem] justify-center sm:w-auto\'',
      'studioPanelActionButtonClass',
      'md:grid-cols-[minmax(0,1fr)_auto]',
      'icon="i-lucide-bookmark-plus"',
      'icon="i-lucide-file-up"',
      'icon="i-lucide-database-zap"',
      'icon="i-lucide-eye"',
      'icon="i-lucide-pencil"',
      'icon="i-lucide-rotate-ccw"',
      'icon="i-lucide-trash-2"',
      'size="sm"',
      'variant="outline"',
      ':disabled="previewTargetId === version.id"',
      ':disabled="!version.canDelete"',
      ':data-version-view="version.id"',
      ':data-version-delete="version.id"',
      ':data-version-delete-blocked="version.id"',
      ':data-version-rename="version.id"',
      ':data-version-restore="version.id"',
      'label="Delete"',
      'Delete stays locked while {{ version.deleteBlockedReason }}.',
      'label="Rename"',
      'Preview target: {{ previewLabel }}.'
    ]

    expectedMigrationStrings.forEach((expectedString) => {
      expect(migrationsFile).toContain(expectedString)
    })
    expectedVersionStrings.forEach((expectedString) => {
      expect(versionsFile).toContain(expectedString)
    })
    expect(versionsFile).not.toContain('data-version-open-comparator="true"')
    expect(versionsFile).not.toContain('data-version-open-migrations="true"')
    expect(versionsFile).not.toContain('data-version-workspace-compare-base="true"')
    expect(versionsFile).not.toContain('data-version-workspace-compare-target="true"')
    expect(versionsFile).not.toContain(':data-version-compare-base="version.id"')
    expect(versionsFile).not.toContain(':data-version-compare-target="version.id"')
    expect(versionsFile).not.toContain('sticky top-0 z-[1]')
    expect(versionsFile).not.toContain('class="grid gap-2 border border-[color:var(--studio-divider)] bg-[color:var(--studio-control-bg)] px-3 py-3"')
  })
})
