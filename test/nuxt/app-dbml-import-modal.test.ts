import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('DBML import modal source', () => {
  it('keeps the paste/upload flow inside a shared studio modal surface', () => {
    const file = readSourceFile('app/components/app/AppDbmlImportModal.vue')

    expect(file).toContain('<StudioModalFrame')
    expect(file).toContain('Comment parsing')
    expect(file).toContain('Upload a DBML file')
    expect(file).toContain('Paste DBML text')
    expect(file).toContain('<USwitch')
    expect(file).toContain('accept=".dbml,.dbdiagram,.txt"')
    expect(file).toContain('<slot name="before-inputs" />')
    expect(file).toContain('parseExecutableComments')
    expect(file).toContain('emit(\'update:parseExecutableComments\'')
    expect(file).toContain('emit(\'select-file\'')
    expect(file).toContain('emit(\'submit\'')
  })
})
