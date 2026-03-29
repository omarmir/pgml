import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram page source', () => {
  it('keeps the studio workspace shells and modal entry points in the page source', () => {
    const file = readSourceFile('app/pages/diagram.vue')

    expect(file).toContain('middleware: \'require-studio-launch\'')
    expect(file).toContain('<StudioDesktopWorkspace')
    expect(file).toContain('<StudioMobileWorkspace')
    expect(file).toContain('<StudioEditorSurface')
    expect(file).toContain('v-model:active-view="mobileWorkspaceView"')
    expect(file).toContain('<StudioModalFrame')
    expect(file).toContain('Add table')
    expect(file).toContain('Add table group')
    expect(file).toContain('Columns')
    expect(file).toContain('Tables in this group')
    expect(file).toContain('Group color')
    expect(file).toContain('data-group-editor-color="true"')
    expect(file).toContain('v-bind="studioPersistentSelectMenuProps"')
    expect(file).toContain('Create checkpoint')
    expect(file).toContain('Versioned document')
    expect(file).toContain('<AppPgDumpImportModal')
    expect(file).toContain('@version-import-dump="openImportDumpDialog"')
    expect(file).toContain('buildPgmlCheckpointName(versionDocument.value')
    expect(file).toContain('checkpointNameIsSuggested')
    expect(file).toContain(':can-create-checkpoint="canCheckpoint"')
  })
})
