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
      'retainPgmlTableGroupsFromBaseSource',
      'const importDumpRetainMatchingTableGroups: Ref<boolean> = ref(true)',
      'Retain matching table groups from base version',
      'Keep TableGroup assignments from the selected base when the imported dump contains the same tables.',
      'data-import-executable-attachment-dialog="true"',
      'data-import-loading="true"',
      'const deleteVersionDialogOpen: Ref<boolean> = ref(false)',
      'const deleteVersionId: Ref<string | null> = ref(null)',
      '@version-import-dbml="openImportDbmlDialog"',
      '@version-import-dump="openImportDumpDialog"',
      '@delete-version="openDeleteVersionDialog"',
      'Import DBML onto version',
      'importDbmlFoldIdentifiersToLowercase',
      'importDbmlParseExecutableComments',
      'importDumpFoldIdentifiersToLowercase',
      'Keep standalone',
      'active: candidate.selectedTableIds.length === 0',
      'extraClass: \'px-2 py-1 font-mono text-[0.58rem] uppercase tracking-[0.08em]\'',
      'buildPgmlCheckpointName(versionDocument.value',
      'checkpointNameIsSuggested',
      ':can-create-checkpoint="canCheckpoint"',
      ':active-diagram-view-id="activeDiagramViewId"',
      ':can-delete-diagram-view="canDeleteDiagramView"',
      ':diagram-view-items="diagramViewItems"',
      ':diagram-view-settings="diagramViewSettings"',
      'const diagramViewDialogOpen: Ref<boolean> = ref(false)',
      'const diagramViewDialogMode: Ref<DiagramViewDialogMode> = ref(\'create\')',
      'const diagramViewNameError = computed(() => {',
      'data-diagram-view-name-input="true"',
      'data-diagram-view-save="true"',
      'const latestVersionId = computed(() => {',
      ':document-scope="documentEditorScope"',
      ':document-scope-items="documentEditorScopeItems"',
      'const editorActivateCompletionOnTyping = true',
      'const previewTargetDocumentSource = computed(() => {',
      'return isWorkspacePreview.value ? previewSource.value : previewTargetDocumentSource.value',
      'const revealPreviewTargetDocumentSource = () => {',
      '@create-diagram-view="createActiveDiagramView"',
      '@delete-diagram-view="deleteSelectedDiagramView"',
      '@rename-diagram-view="renameSelectedDiagramView"',
      '@select-diagram-view="selectActiveDiagramView"',
      '@update-diagram-view-settings="updateDiagramViewSettings"',
      '@update:document-scope="updateDocumentEditorScope"',
      'buildPgmlDeleteVersionDescription',
      'buildPgmlDeleteVersionSuccessDescription',
      'data-delete-version-confirm="true"',
      'The selected base version no longer exists.',
      'getPgmlVersionDisplayLabel',
      'latestImplementationVersion.value?.id'
    ]

    expectedStrings.forEach((expectedString) => {
      expect(file).toContain(expectedString)
    })
  })

  it('serializes layout whenever the PGML can embed it instead of checking canvas mount state', () => {
    const file = readSourceFile('app/pages/diagram.vue')

    expect(file).toContain('const shouldIncludeLayout = includeLayout && canEmbedLayout.value')
    expect(file).not.toContain('const shouldIncludeLayout = includeLayout && canEmbedLayout.value && canvasRef.value !== null')
  })

  it('prefers the reactive workspace source unless the editor has uncommitted local edits', () => {
    const file = readSourceFile('app/pages/diagram.vue')

    expect(file).toContain('if (!editorRef.value?.hasPendingChanges()) {')
    expect(file).toContain('const editorValue = editorRef.value.getValue()')
    expect(file).toContain('return editorValue === source.value ? source.value : editorValue')
  })
})
