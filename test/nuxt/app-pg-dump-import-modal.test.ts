import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('pg_dump import modal source', () => {
  it('keeps the paste/upload flow inside a shared studio modal surface', () => {
    const file = readSourceFile('app/components/app/AppPgDumpImportModal.vue')

    expect(file).toContain('<StudioModalFrame')
    expect(file).toContain('Upload a text pg_dump file')
    expect(file).toContain('Paste pg_dump text')
    expect(file).toContain('accept=".dump,.pgdump,.pgsql,.sql,.txt"')
    expect(file).toContain('emit(\'select-file\'')
    expect(file).toContain('emit(\'submit\'')
  })
})
