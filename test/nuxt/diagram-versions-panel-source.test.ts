import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram versions panel source', () => {
  it('uses migration change metadata instead of raw SQL text length to enable export actions', () => {
    const file = readSourceFile('app/components/pgml/PgmlDiagramVersionsPanel.vue')
    const expectedMigrationStrings = [
      'migrationHasChanges = false',
      'type PgmlMigrationSelectionScope = \'combined\' | `step:${number}`',
      'type PgmlMigrationFormat = \'sql\' | \'kysely\'',
      'type PgmlVersionMigrationArtifact = {',
      'migrationSteps = []',
      'const activeMigrationFormat: Ref<PgmlMigrationFormat> = ref(\'sql\')',
      'const activeMigrationScope: Ref<PgmlMigrationSelectionScope> = ref(\'combined\')',
      'const combinedMigrationArtifacts = computed<Record<PgmlMigrationFormat, PgmlVersionMigrationArtifact>>(() => {',
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
      'return activeMigrationArtifact.value.mimeType',
      'data-version-migration-scope="combined"',
      'v-for="step in migrationSteps"',
      ':data-version-migration-scope="`step:${step.index}`"',
      'Combined history sequence',
      'Validation issue:',
      'No forward ${activeMigrationLabel.toLowerCase()} migration generated yet.'
    ]
    const expectedVersionStrings = [
      'compareRelationshipSummary',
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
      ':disabled="previewTargetId === version.id"'
    ]

    expectedMigrationStrings.forEach((expectedString) => {
      expect(file).toContain(expectedString)
    })
    expectedVersionStrings.forEach((expectedString) => {
      expect(file).toContain(expectedString)
    })
  })
})
