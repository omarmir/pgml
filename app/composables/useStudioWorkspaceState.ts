import { useStudioSessionStore } from '~/stores/studio-session'
import {
  createDefaultPgmlCompareEntityFilters,
  createDefaultPgmlCompareNoteFilters,
  createDefaultPgmlCompareNoiseFilters,
  createEmptyPgmlCompareExclusions,
  type PgmlCompareEntityFilters,
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
  compareEntityFilters: 'studio-workspace-compare-entity-filters-v1',
  compareNoteFilters: 'studio-workspace-compare-note-filters-v1',
  compareNoiseFilters: 'studio-workspace-compare-noise-filters-v1',
  compareTargetId: 'studio-workspace-compare-target-id-v1',
  documentEditorScope: 'studio-workspace-document-editor-scope-v1',
  editorMode: 'studio-workspace-editor-mode-v1',
  previewTargetId: 'studio-workspace-preview-target-id-v1',
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
  compareEntityFilters: PgmlCompareEntityFilters
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
    compareEntityFilters: useStateWithDefault<PgmlCompareEntityFilters>(studioWorkspaceStateKeys.compareEntityFilters, () => defaults.compareEntityFilters),
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

export const resetStudioWorkspaceState = () => {
  useStudioSessionStore().resetPersistence()
  useState<string | null>(studioWorkspaceStateKeys.compareBaseId, () => null).value = null
  useState<PgmlCompareExclusions>(studioWorkspaceStateKeys.compareExclusions, createEmptyPgmlCompareExclusions).value = createEmptyPgmlCompareExclusions()
  useState<PgmlCompareEntityFilters>(studioWorkspaceStateKeys.compareEntityFilters, createDefaultPgmlCompareEntityFilters).value = createDefaultPgmlCompareEntityFilters()
  useState<PgmlCompareNoteFilters>(studioWorkspaceStateKeys.compareNoteFilters, createDefaultPgmlCompareNoteFilters).value = createDefaultPgmlCompareNoteFilters()
  useState<PgmlCompareNoiseFilters>(studioWorkspaceStateKeys.compareNoiseFilters, createDefaultPgmlCompareNoiseFilters).value = createDefaultPgmlCompareNoiseFilters()
  useState<string>(studioWorkspaceStateKeys.compareTargetId, () => 'workspace').value = 'workspace'
  useState<PgmlDocumentEditorScope>(studioWorkspaceStateKeys.documentEditorScope, () => 'all').value = 'all'
  useState<PgmlVersionedDocumentEditorMode>(studioWorkspaceStateKeys.editorMode, () => 'head').value = 'head'
  useState<PgmlVersionPreviewTarget>(studioWorkspaceStateKeys.previewTargetId, () => 'workspace').value = 'workspace'
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
