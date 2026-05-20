import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('PGML import modal source', () => {
  it('supports file and pasted PGML inputs for version history imports', () => {
    const file = readSourceFile('app/components/app/AppPgmlImportModal.vue')

    expect(file).toContain('surface-id="pgml-import"')
    expect(file).toContain('Option A · Upload a PGML file')
    expect(file).toContain('Option B · Paste PGML text')
    expect(file).toContain('accept=".pgml,.txt"')
    expect(file).toContain('Append PGML')
    expect(file).toContain('This appends the imported PGML history and makes the imported workspace the current draft.')
  })
})
