import {
  createDefaultPgmlCompareNoteFilters,
  createDefaultPgmlCompareNoiseFilters,
  createEmptyPgmlCompareExclusions,
  type PgmlCompareExclusions,
  type PgmlCompareNoteFilters,
  type PgmlCompareNoiseFilters
} from '~/utils/pgml'
import {
  createInitialPgmlDocument,
  type PgmlDocumentEditorScope,
  type PgmlVersionSetDocument
} from '~/utils/pgml-document'
import type { PgmlVersionedDocumentEditorMode, PgmlVersionPreviewTarget } from './usePgmlStudioVersionHistory'

const studioWorkspaceStateKeys = Object.freeze({
  compareBaseId: 'studio-workspace-compare-base-id-v1',
  compareExclusions: 'studio-workspace-compare-exclusions-v1',
  compareNoteFilters: 'studio-workspace-compare-note-filters-v1',
  compareNoiseFilters: 'studio-workspace-compare-noise-filters-v1',
  compareTargetId: 'studio-workspace-compare-target-id-v1',
  computerFileId: 'studio-workspace-computer-file-id-v1',
  computerFileName: 'studio-workspace-computer-file-name-v1',
  computerFileSaveError: 'studio-workspace-computer-file-save-error-v1',
  computerFileSnapshot: 'studio-workspace-computer-file-snapshot-v1',
  computerFileUpdatedAt: 'studio-workspace-computer-file-updated-at-v1',
  documentEditorScope: 'studio-workspace-document-editor-scope-v1',
  editorMode: 'studio-workspace-editor-mode-v1',
  hasSavedComputerFileInSession: 'studio-workspace-has-saved-computer-file-in-session-v1',
  hasSavedSchemaInSession: 'studio-workspace-has-saved-schema-in-session-v1',
  isSavingToComputerFile: 'studio-workspace-is-saving-to-computer-file-v1',
  isSavingToLocalStorage: 'studio-workspace-is-saving-to-local-storage-v1',
  localStorageSaveError: 'studio-workspace-local-storage-save-error-v1',
  previewTargetId: 'studio-workspace-preview-target-id-v1',
  saveSchemaTargetId: 'studio-workspace-save-schema-target-id-v1',
  schemaId: 'studio-workspace-schema-id-v1',
  schemaName: 'studio-workspace-schema-name-v1',
  schemaSnapshot: 'studio-workspace-schema-snapshot-v1',
  schemaUpdatedAt: 'studio-workspace-schema-updated-at-v1',
  selectedComparisonId: 'studio-workspace-selected-comparison-id-v1',
  sessionInitialized: 'studio-workspace-session-initialized-v1',
  source: 'studio-workspace-source-v1',
  versionDocumentName: 'studio-workspace-version-document-name-v1',
  versionHistoryDocumentState: 'studio-workspace-version-history-document-state-v1'
})

const useStateWithDefault = <T>(key: string, getDefaultValue: () => T) => {
  const state = useState<T>(key, getDefaultValue)

  if (state.value === undefined) {
    state.value = getDefaultValue()
  }

  return state
}

export const useStudioWorkspaceSourceState = (initialSource: string) => {
  return useStateWithDefault<string>(studioWorkspaceStateKeys.source, () => initialSource)
}

export const useStudioWorkspaceDocumentNameState = (initialName: string) => {
  return useStateWithDefault<string>(studioWorkspaceStateKeys.versionDocumentName, () => initialName)
}

export const useStudioWorkspaceSessionInitializedState = () => {
  return useStateWithDefault<boolean>(studioWorkspaceStateKeys.sessionInitialized, () => false)
}

export const useStudioWorkspaceVersionHistoryState = (defaults: {
  compareBaseId: string | null
  compareExclusions: PgmlCompareExclusions
  compareNoteFilters: PgmlCompareNoteFilters
  compareNoiseFilters: PgmlCompareNoiseFilters
  compareTargetId: string
  document: PgmlVersionSetDocument
  documentEditorScope: PgmlDocumentEditorScope
  editorMode: PgmlVersionedDocumentEditorMode
  previewTargetId: PgmlVersionPreviewTarget
  selectedComparisonId: string | null
}) => {
  return {
    compareBaseId: useStateWithDefault<string | null>(studioWorkspaceStateKeys.compareBaseId, () => defaults.compareBaseId),
    compareExclusions: useStateWithDefault<PgmlCompareExclusions>(studioWorkspaceStateKeys.compareExclusions, () => defaults.compareExclusions),
    compareNoteFilters: useStateWithDefault<PgmlCompareNoteFilters>(studioWorkspaceStateKeys.compareNoteFilters, () => defaults.compareNoteFilters),
    compareNoiseFilters: useStateWithDefault<PgmlCompareNoiseFilters>(studioWorkspaceStateKeys.compareNoiseFilters, () => defaults.compareNoiseFilters),
    compareTargetId: useStateWithDefault<string>(studioWorkspaceStateKeys.compareTargetId, () => defaults.compareTargetId),
    document: useStateWithDefault<PgmlVersionSetDocument>(studioWorkspaceStateKeys.versionHistoryDocumentState, () => defaults.document),
    documentEditorScope: useStateWithDefault<PgmlDocumentEditorScope>(studioWorkspaceStateKeys.documentEditorScope, () => defaults.documentEditorScope),
    editorMode: useStateWithDefault<PgmlVersionedDocumentEditorMode>(studioWorkspaceStateKeys.editorMode, () => defaults.editorMode),
    previewTargetId: useStateWithDefault<PgmlVersionPreviewTarget>(studioWorkspaceStateKeys.previewTargetId, () => defaults.previewTargetId),
    selectedComparisonId: useStateWithDefault<string | null>(studioWorkspaceStateKeys.selectedComparisonId, () => defaults.selectedComparisonId)
  }
}

export const useStudioWorkspaceBrowserSchemaState = (defaults: {
  isSavingToLocalStorage: boolean
  name: string
}) => {
  return {
    currentSchemaId: useStateWithDefault<string | null>(studioWorkspaceStateKeys.schemaId, () => null),
    currentSchemaName: useStateWithDefault<string>(studioWorkspaceStateKeys.schemaName, () => defaults.name),
    currentSchemaUpdatedAt: useStateWithDefault<string | null>(studioWorkspaceStateKeys.schemaUpdatedAt, () => null),
    hasSavedSchemaInSession: useStateWithDefault<boolean>(studioWorkspaceStateKeys.hasSavedSchemaInSession, () => false),
    isSavingToLocalStorage: useStateWithDefault<boolean>(studioWorkspaceStateKeys.isSavingToLocalStorage, () => defaults.isSavingToLocalStorage),
    lastPersistedSnapshot: useStateWithDefault<string | null>(studioWorkspaceStateKeys.schemaSnapshot, () => null),
    localStorageSaveError: useStateWithDefault<string | null>(studioWorkspaceStateKeys.localStorageSaveError, () => null),
    saveSchemaTargetId: useStateWithDefault<string | null>(studioWorkspaceStateKeys.saveSchemaTargetId, () => null)
  }
}

export const useStudioWorkspaceComputerFileState = () => {
  return {
    computerFileSaveError: useStateWithDefault<string | null>(studioWorkspaceStateKeys.computerFileSaveError, () => null),
    currentComputerFileId: useStateWithDefault<string | null>(studioWorkspaceStateKeys.computerFileId, () => null),
    currentComputerFileName: useStateWithDefault<string>(studioWorkspaceStateKeys.computerFileName, () => ''),
    currentComputerFileUpdatedAt: useStateWithDefault<string | null>(studioWorkspaceStateKeys.computerFileUpdatedAt, () => null),
    hasSavedComputerFileInSession: useStateWithDefault<boolean>(studioWorkspaceStateKeys.hasSavedComputerFileInSession, () => false),
    isSavingToComputerFile: useStateWithDefault<boolean>(studioWorkspaceStateKeys.isSavingToComputerFile, () => false),
    lastPersistedSnapshot: useStateWithDefault<string | null>(studioWorkspaceStateKeys.computerFileSnapshot, () => null)
  }
}

export const resetStudioWorkspaceState = () => {
  useState<string | null>(studioWorkspaceStateKeys.compareBaseId, () => null).value = null
  useState<PgmlCompareExclusions>(studioWorkspaceStateKeys.compareExclusions, createEmptyPgmlCompareExclusions).value = createEmptyPgmlCompareExclusions()
  useState<PgmlCompareNoteFilters>(studioWorkspaceStateKeys.compareNoteFilters, createDefaultPgmlCompareNoteFilters).value = createDefaultPgmlCompareNoteFilters()
  useState<PgmlCompareNoiseFilters>(studioWorkspaceStateKeys.compareNoiseFilters, createDefaultPgmlCompareNoiseFilters).value = createDefaultPgmlCompareNoiseFilters()
  useState<string>(studioWorkspaceStateKeys.compareTargetId, () => 'workspace').value = 'workspace'
  useState<string | null>(studioWorkspaceStateKeys.computerFileId, () => null).value = null
  useState<string>(studioWorkspaceStateKeys.computerFileName, () => '').value = ''
  useState<string | null>(studioWorkspaceStateKeys.computerFileSaveError, () => null).value = null
  useState<string | null>(studioWorkspaceStateKeys.computerFileSnapshot, () => null).value = null
  useState<string | null>(studioWorkspaceStateKeys.computerFileUpdatedAt, () => null).value = null
  useState<PgmlDocumentEditorScope>(studioWorkspaceStateKeys.documentEditorScope, () => 'all').value = 'all'
  useState<PgmlVersionedDocumentEditorMode>(studioWorkspaceStateKeys.editorMode, () => 'head').value = 'head'
  useState<boolean>(studioWorkspaceStateKeys.hasSavedComputerFileInSession, () => false).value = false
  useState<boolean>(studioWorkspaceStateKeys.hasSavedSchemaInSession, () => false).value = false
  useState<boolean>(studioWorkspaceStateKeys.isSavingToComputerFile, () => false).value = false
  useState<boolean>(studioWorkspaceStateKeys.isSavingToLocalStorage, () => false).value = false
  useState<string | null>(studioWorkspaceStateKeys.localStorageSaveError, () => null).value = null
  useState<PgmlVersionPreviewTarget>(studioWorkspaceStateKeys.previewTargetId, () => 'workspace').value = 'workspace'
  useState<string | null>(studioWorkspaceStateKeys.saveSchemaTargetId, () => null).value = null
  useState<string | null>(studioWorkspaceStateKeys.schemaId, () => null).value = null
  useState<string>(studioWorkspaceStateKeys.schemaName, () => 'Untitled schema').value = 'Untitled schema'
  useState<string | null>(studioWorkspaceStateKeys.schemaSnapshot, () => null).value = null
  useState<string | null>(studioWorkspaceStateKeys.schemaUpdatedAt, () => null).value = null
  useState<string | null>(studioWorkspaceStateKeys.selectedComparisonId, () => null).value = null
  useState<boolean>(studioWorkspaceStateKeys.sessionInitialized, () => false).value = false
  useState<string>(studioWorkspaceStateKeys.source, () => '').value = ''
  useState<string>(studioWorkspaceStateKeys.versionDocumentName, () => 'Untitled schema').value = 'Untitled schema'
  useState<PgmlVersionSetDocument>(
    studioWorkspaceStateKeys.versionHistoryDocumentState,
    () => createInitialPgmlDocument({
      name: 'Untitled schema',
      workspaceSource: ''
    })
  ).value = createInitialPgmlDocument({
    name: 'Untitled schema',
    workspaceSource: ''
  })
}
