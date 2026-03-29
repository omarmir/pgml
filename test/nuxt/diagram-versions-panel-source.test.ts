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
    expect(file).toContain('Branch root: {{ version.branchRootLabel }}')
    expect(file).toContain('Leaf')
    expect(file).toContain("{{ version.siblingCount }} sibling{{ version.siblingCount === 1 ? '' : 's' }}")
    expect(file).toContain("{{ version.descendantCount }} descendant{{ version.descendantCount === 1 ? '' : 's' }}")
    expect(file).toContain("{{ version.ancestorCount }} ancestor{{ version.ancestorCount === 1 ? '' : 's' }}")
    expect(file).toContain('Branch size {{ version.branchVersionCount }}')
    expect(file).toContain('Branch leaves {{ version.branchLeafCount }}')
    expect(file).toContain('Latest {{ version.role }}')
    expect(file).toContain('Latest impl to draft')
    expect(file).toContain('Latest design to draft')
  })
})
