import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('Shared button theming source', () => {
  it('defines shared non-canvas button utilities with explicit focus treatment', () => {
    const file = readFileSync('/home/omar/Code/pgml/app/assets/css/main.css', 'utf8')

    expect(file).toContain('.studio-button {')
    expect(file).toContain('.studio-button:hover,')
    expect(file).toContain('.studio-button:focus-visible')
    expect(file).toContain('.studio-button--ghost')
    expect(file).toContain('.studio-choice-button')
    expect(file).toContain('.studio-toggle-chip')
  })

  it('uses the shared button classes in the app shell and diagram page controls', () => {
    const appFile = readFileSync('/home/omar/Code/pgml/app/app.vue', 'utf8')
    const canvasFile = readFileSync('/home/omar/Code/pgml/app/components/pgml/PgmlDiagramCanvas.vue', 'utf8')
    const tableRowsFile = readFileSync('/home/omar/Code/pgml/app/components/pgml/PgmlDiagramTableRows.vue', 'utf8')
    const diagramFile = readFileSync('/home/omar/Code/pgml/app/pages/diagram.vue', 'utf8')
    const indexFile = readFileSync('/home/omar/Code/pgml/app/pages/index.vue', 'utf8')
    const studioUiFile = readFileSync('/home/omar/Code/pgml/app/composables/useStudioUi.ts', 'utf8')

    expect(appFile).toContain('studio-button studio-button--primary')
    expect(appFile).toContain('studio-button studio-button--ghost studio-button--icon')
    expect(indexFile).toContain('class="studio-button"')
    expect(indexFile).toContain('class="studio-button studio-button--ghost"')
    expect(studioUiFile).toContain('const studioButtonClasses = Object.freeze({')
    expect(studioUiFile).toContain('export const useStudioUi = () => studioUi')
    expect(diagramFile).toContain('} = useStudioUi()')
    expect(diagramFile).toContain('const secondaryModalButtonClass = buttonClasses.secondary')
    expect(diagramFile).toContain('const primaryModalButtonClass = buttonClasses.primary')
    expect(diagramFile).toContain('const iconGhostButtonClass = buttonClasses.iconGhost')
    expect(diagramFile).toContain('const editorVisibilityButtonClass = \'studio-button absolute left-3 top-3 z-[4] px-2 py-1 font-mono text-[0.62rem] uppercase tracking-[0.08em]\'')
    expect(canvasFile).toContain('const sidePanelCloseButtonClass = `${buttonClasses.iconGhost} h-7 w-7 justify-center px-0`')
    expect(canvasFile).toContain('const panelToggleButtonClass = `${buttonClasses.secondary} px-2 py-1 font-mono text-[0.62rem] uppercase tracking-[0.08em]`')
    expect(canvasFile).toContain('const sidePanelActionButtonClass = `${buttonClasses.secondary} px-2 py-1 font-mono text-[0.62rem] uppercase tracking-[0.08em]`')
    expect(canvasFile).toContain('<PgmlDiagramTableRows')
    expect(tableRowsFile).toContain('columnModifierBadgeClass')
    expect(canvasFile).toContain('label="Add table"')
    expect(canvasFile).toContain('label="Add group"')
    expect(canvasFile).toContain(':label="isSidePanelOpen ? \'Hide panel\' : \'Show panel\'"')
  })
})
