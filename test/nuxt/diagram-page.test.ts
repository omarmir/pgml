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
      'Add table group',
      'Columns',
      'Tables in this group',
      'Group color',
      'data-group-editor-color="true"',
      'v-bind="studioPersistentSelectMenuProps"',
      'Create checkpoint',
      'Versioned document',
      '<AppPgDumpImportModal',
      '@version-import-dump="openImportDumpDialog"',
      'buildPgmlCheckpointName(versionDocument.value',
      'checkpointNameIsSuggested',
      ':can-create-checkpoint="canCheckpoint"',
      ':latest-version-id="latestVersionId"',
      ':document-scope="documentEditorScope"',
      ':document-scope-items="documentEditorScopeItems"',
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
