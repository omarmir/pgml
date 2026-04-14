import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('Index page source', () => {
  it('defines the source-selection landing page, keeps the three intake lanes explicit, and wires the DBML and pg_dump modals', () => {
    const file = readSourceFile('app/pages/index.vue')

    expect(file).toContain('<AppSourceLaunchCard')
    expect(file).toContain('<AppDbmlImportModal')
    expect(file).toContain('<AppPgDumpImportModal')
    expect(file).toContain('Browser local storage')
    expect(file).toContain('Computer saved file')
    expect(file).toContain('Hosted database')
    expect(file).toContain('open-dbml-import')
    expect(file).toContain('open-pg-dump-import')
    expect(file).toContain('dbmlImportDialogOpen')
    expect(file).toContain('pgDumpImportDialogOpen')
    expect(file).toContain('submitDbmlImport')
    expect(file).toContain('submitPgDumpImport')
    expect(file).toContain('importActions: [')
    expect(file).toContain('cardId: \'browser-local-storage\'')
    expect(file).toContain('Start new')
    expect(file).toContain('Open bundled example')
    expect(file).toContain('Open existing')
    expect(file).toContain('data-spec-banner="true"')
    expect(file).toContain('Need the PGML spec before you open analysis, compare, and migrations?')
    expect(file).toContain('VersionSet')
    expect(file).toContain('history-aware SQL or Kysely migrations')
  })
})
