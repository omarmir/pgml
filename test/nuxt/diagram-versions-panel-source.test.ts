import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram versions panel source', () => {
  it('uses migration change metadata instead of raw SQL text length to enable export actions', () => {
    const file = readSourceFile('app/components/pgml/PgmlDiagramVersionsPanel.vue')

    expect(file).toContain('migrationHasChanges = false')
    expect(file).toContain('const hasMigrationSql = computed(() => migrationHasChanges && migrationSql.trim().length > 0)')
    expect(file).toContain('Level {{ version.depth }}')
    expect(file).toContain("{{ version.childCount }} branch{{ version.childCount === 1 ? '' : 'es' }}")
    expect(file).toContain('compareRelationshipSummary')
    expect(file).toContain('Path: {{ version.lineageLabel }}')
  })
})
