import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram versions panel source', () => {
  it('keeps version history controls separate from the dedicated migrations tool', () => {
    const versionsFile = readSourceFile('app/components/pgml/PgmlDiagramVersionsPanel.vue')
    const migrationsFile = readSourceFile('app/components/pgml/PgmlDiagramMigrationsPanel.vue')
    const expectedMigrationStrings = [
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
      'return migrationSteps',
      'filter(artifact => artifact.hasChanges)',
      'return `Download ${activeMigrationLabel.value} files`',
      'activeMigrationDownloadArtifacts.value.forEach(downloadMigrationArtifactFile)',
      'const getMigrationArtifactForFormat = (format: PgmlMigrationFormat) => {',
      'const hasMigrationSql = computed(() => getMigrationArtifactForFormat(\'sql\').hasChanges)',
      'const hasMigrationKysely = computed(() => getMigrationArtifactForFormat(\'kysely\').hasChanges)',
      'const activeMigrationArtifact = computed(() => {',
      'const selectedMigrationScopeLabel = computed(() => {',
      'const displayedMigrationWarnings = computed(() => {',
      'label="Kysely"',
      'activeMigrationFormat = \'kysely\'',
      'return activeMigrationArtifact.value.label',
      'return activeMigrationArtifact.value.content',
      'return activeMigrationArtifact.value.hasChanges',
      'data-version-migration-scope="combined"',
      'v-for="step in migrationSteps"',
      ':data-version-migration-scope="`step:${step.index}`"',
      'Combined history sequence',
      'Validation issue:'
    ]
    const expectedVersionStrings = [
      'compareRelationshipSummary',
      '\'open-migrations\': []',
      'data-version-open-migrations="true"',
      'data-version-overview="true"',
      'Lock workspace checkpoints, choose compare pairs, and open the dedicated migrations tool for SQL or Kysely export.',
      'Path: {{ version.lineageLabel }}',
      'Branch root: {{ version.branchRootLabel }}',
      'Leaf',
      'const versionStatCards = computed(() => {',
      'label: \'Locked\'',
      'label: \'Design\'',
      'label: \'Impl\'',
      'v-for="stat in versionStatCards"',
      'const buildVersionMetricBadges = (version: PgmlVersionPanelItem) => {',
      'buildCountLabel(version.childCount, \'branch\', \'branches\')',
      'buildCountLabel(version.siblingCount, \'sibling\')',
      'buildCountLabel(version.descendantCount, \'descendant\')',
      'buildCountLabel(version.ancestorCount, \'ancestor\')',
      'appendMetricBadge(badges, `Branch size ${version.branchVersionCount}`)',
      'appendMetricBadge(badges, `Branch leaves ${version.branchLeafCount}`)',
      'appendMetricBadge(badges, `Branch depth ${version.branchMaxDepth}`)',
      'v-for="badge in buildVersionMetricBadges(version)"',
      'Latest overall',
      'Latest {{ version.role }}',
      'const comparePresetButtons = computed(() => {',
      'label: \'Workspace base to draft\'',
      'label: \'Latest to draft\'',
      'Latest impl to draft',
      'Latest design to draft',
      'v-for="preset in comparePresetButtons"',
      'const stackedActionButtonClass = \'w-full justify-center sm:w-auto\'',
      'max-w-full whitespace-normal text-center text-[0.65rem] leading-4',
      'grid grid-cols-1 gap-2 sm:flex sm:flex-wrap',
      'grid grid-cols-1 gap-2 text-[0.66rem] text-[color:var(--studio-shell-muted)] md:grid-cols-2',
      'break-words text-[color:var(--studio-shell-text)] [overflow-wrap:anywhere]',
      'md:grid-cols-[minmax(0,1fr)_auto]',
      ':disabled="previewTargetId === version.id"',
      'data-version-workspace-compare-base="true"',
      'data-version-workspace-compare-target="true"',
      ':data-version-compare-base="version.id"',
      ':data-version-compare-target="version.id"'
    ]

    expectedMigrationStrings.forEach((expectedString) => {
      expect(migrationsFile).toContain(expectedString)
    })
    expectedVersionStrings.forEach((expectedString) => {
      expect(versionsFile).toContain(expectedString)
    })
    expect(versionsFile).not.toContain('sticky top-0 z-[1]')
  })
})
