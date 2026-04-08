import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('DBML import modal source', () => {
  it('keeps the paste/upload flow inside a shared studio modal surface', () => {
    const file = readSourceFile('app/components/app/AppDbmlImportModal.vue')

    expect(file).toContain('<StudioModalFrame')
    expect(file).toContain('Comment parsing')
    expect(file).toContain('const importRulesClass = \'grid gap-1.5\'')
    expect(file).toContain('const importRulesSummaryClass = \'border-t border-[color:var(--studio-divider)] pt-2 text-[0.68rem] leading-6 text-[color:var(--studio-shell-muted)]\'')
    expect(file).toContain('const settingsPanelClass = \'grid gap-2 border border-[color:var(--studio-shell-border)] bg-[color:var(--studio-control-bg)] px-3 py-3\'')
    expect(file).toContain('Upload a DBML file')
    expect(file).toContain('Paste DBML text')
    expect(file).toContain('<USwitch')
    expect(file).toContain('accept=".dbml,.dbdiagram,.txt"')
    expect(file).toContain('placeholder="No file selected"')
    expect(file).toContain('size="md"')
    expect(file).toContain('<slot name="before-inputs" />')
    expect(file).toContain('parseExecutableComments')
    expect(file).toContain('emit(\'update:parseExecutableComments\'')
    expect(file).toContain('emit(\'select-file\'')
    expect(file).toContain('emit(\'submit\'')
    expect(file).not.toContain('const fileSelectionPanelClass')
  })
})
