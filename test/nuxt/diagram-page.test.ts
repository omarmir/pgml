import { describe, expect, it } from 'vitest'
import { readSourceFile } from './source-test-utils'

describe('diagram page source', () => {
  it('keeps the studio workspace shells and modal entry points in the page source', () => {
    const file = readSourceFile('app/pages/diagram.vue')
    const expectedStrings = [
      'middleware: \'require-studio-launch\'',
      '<StudioDesktopWorkspace',
      '<StudioMobileWorkspace',
      '<StudioEditorSurface',
      'v-model:active-view="mobileWorkspaceView"',
      '<StudioModalFrame',
      'Add table',
      'Table metadata',
      'Column metadata',
      'Add table group',
      'Columns',
      'Tables in this group',
      'Group color',
      'data-group-editor-color="true"',
      'v-bind="studioPersistentSelectMenuProps"',
      'Create checkpoint',
      'Versioned document',
      '<AppDbmlImportModal',
      '<AppPgDumpImportModal',
      'prepareImportedExecutableAttachments',
      'applyImportedExecutableAttachmentSelections',
      'data-import-executable-attachment-dialog="true"',
      'data-import-loading="true"',
      '@version-import-dbml="openImportDbmlDialog"',
      '@version-import-dump="openImportDumpDialog"',
      'Import DBML onto version',
      'importDbmlParseExecutableComments',
      'buildPgmlCheckpointName(versionDocument.value',
      'checkpointNameIsSuggested',
      ':can-create-checkpoint="canCheckpoint"',
      ':active-diagram-view-id="activeDiagramViewId"',
      ':can-delete-diagram-view="canDeleteDiagramView"',
      ':diagram-view-items="diagramViewItems"',
      ':diagram-view-settings="diagramViewSettings"',
      'const latestVersionId = computed(() => {',
      ':document-scope="documentEditorScope"',
      ':document-scope-items="documentEditorScopeItems"',
      'const editorActivateCompletionOnTyping = true',
      '@create-diagram-view="createActiveDiagramView"',
      '@delete-diagram-view="deleteSelectedDiagramView"',
      '@select-diagram-view="selectActiveDiagramView"',
      '@update-diagram-view-settings="updateDiagramViewSettings"',
      '@update:document-scope="updateDocumentEditorScope"',
      'The selected base version no longer exists.',
      'getPgmlVersionDisplayLabel',
      'latestImplementationVersion.value?.id'
    ]

    expectedStrings.forEach((expectedString) => {
      expect(file).toContain(expectedString)
    })
  })
})
