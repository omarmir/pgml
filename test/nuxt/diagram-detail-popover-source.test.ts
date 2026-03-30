import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram detail popover source', () => {
  it('keeps popover detail lines readable by clamping preserved tab width', () => {
    const file = readSourceFile('app/components/pgml/PgmlDiagramCanvasGpuShell.vue')

    expect(file).toContain('const detailPopoverDetailTextClass =')
    expect(file).toContain('[tab-size:2]')
    expect(file).toContain('data-detail-popover-detail="true"')
    expect(file).toContain(':class="detailPopoverDetailTextClass"')
  })

  it('wires the popup editor controls through the diagram shell', () => {
    const shellFile = readSourceFile('app/components/pgml/PgmlDiagramCanvasGpuShell.vue')
    const canvasFile = readSourceFile('app/components/pgml/PgmlDiagramCanvas.vue')
    const editorFile = readSourceFile('app/components/pgml/PgmlDetailPopoverSourceEditor.vue')

    expect(shellFile).toContain('import PgmlDetailPopoverSourceEditor from \'~/components/pgml/PgmlDetailPopoverSourceEditor.vue\'')
    expect(shellFile).toContain('data-detail-popover-edit-source="true"')
    expect(shellFile).toContain('data-detail-popover-cancel-source="true"')
    expect(shellFile).toContain('data-detail-popover-apply-source="true"')
    expect(shellFile).toContain('selectedDetailEditorSpec.value?.languageMode === \'sql\' ? \'Edit SQL\' : \'Edit block\'')
    expect(canvasFile).toContain('@replace-source-range="emit(\'replaceSourceRange\', $event)"')
    expect(editorFile).toContain('data-detail-popover-source-editor="true"')
    expect(editorFile).toContain('<PgmlSourceCodeEditor')
    expect(editorFile).toContain(':language-mode="languageMode"')
  })
})
