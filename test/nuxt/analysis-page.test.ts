import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('analysis page source', () => {
  it('reuses the shared studio workspace component in analysis mode', () => {
    const file = readSourceFile('app/pages/analysis.vue')

    expect(file).toContain('import StudioWorkspacePage from \'~/components/studio/StudioWorkspacePage.vue\'')
    expect(file).toContain('<StudioWorkspacePage workspace-mode="analysis" />')
    expect(file).toContain('middleware: \'require-studio-launch\'')
    expect(file).not.toContain('StudioAnalysisWorkspacePage')
  })

  it('opens compare source in a modal instead of focusing the editor in analysis mode', () => {
    const file = readSourceFile('app/components/studio/StudioWorkspacePage.vue')

    expect(file).toContain('source-action-label="View source"')
    expect(file).toContain('const compareSourceDialogOpen: Ref<boolean> = ref(false)')
    expect(file).toContain('const handleAnalysisCompareFocusSource = (sourceRange: PgmlSourceRange) => {')
    expect(file).toContain('compareSourceDialogRange.value = sourceRange')
    expect(file).toContain('surface-id="compare-source"')
    expect(file).toContain('data-compare-source-preview="true"')
    expect(file).toContain('getPgmlSourceSelectionRange(compareSourceDialogSource.value, compareSourceDialogRange.value)')
    expect(file).toContain('compareSourceDialogEntry.value?.changeKind === \'removed\'')
  })
})
