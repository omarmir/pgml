import { computed, ref, shallowRef, type Ref } from 'vue'
import { defineStore } from 'pinia'
import { useStudioPersistenceSession, type ComputerPersistenceTarget, type GistPersistenceTarget, type BrowserPersistenceTarget } from '../composables/useStudioPersistenceSession'
import {
  authorizeStudioLaunchAccess as persistStudioLaunchAccess,
  clearStudioLaunchAccess as clearPersistedStudioLaunchAccess,
  consumePreloadedFileStudioLaunch as consumePersistedPreloadedFileStudioLaunch,
  hasStudioLaunchAccess as readStudioLaunchAccess,
  primePreloadedFileStudioLaunch as persistPreloadedFileStudioLaunch,
  type FileStudioLaunchRequest,
  type PreloadedFileStudioLaunchPayload
} from '../utils/studio-launch'

export type PgmlStudioSchemaDialogMode = 'save' | 'download'
export type StudioSourceKind = 'browser' | 'file' | 'gist'
export type StudioLoadIntent = { readonly revision: number, readonly source: StudioSourceKind }
export type StudioLoadedTextApplication = { text: string, intent: StudioLoadIntent, commitPersistence: () => void }
export type ApplyStudioLoadedText = (input: StudioLoadedTextApplication) => boolean | Promise<boolean>
type WorkspaceLoadState = { kind: 'idle', revision: number } | { kind: 'loading' | 'committing', intent: StudioLoadIntent }
type SchemaDialogDraft = { name: string, targetId: string | null }
type StudioDialogState = { kind: 'closed' } | { kind: 'load' } | { kind: 'schema', mode: PgmlStudioSchemaDialogMode, revision: number, draft: SchemaDialogDraft }

export const useStudioSessionStore = defineStore('studio-session', () => {
  const browserPersistence = useStudioPersistenceSession<BrowserPersistenceTarget>()
  const getBrowserPersistence = () => browserPersistence
  const computerPersistence = useStudioPersistenceSession<ComputerPersistenceTarget>()
  const gistPersistence = useStudioPersistenceSession<GistPersistenceTarget>()
  const getGistPersistence = () => gistPersistence
  const getComputerPersistence = () => computerPersistence
  const resetPersistence = () => {
    documentRevision.value += 1
    workspaceLoad.value = { kind: 'idle', revision: workspaceLoadRevision.value + 1 }
    browserPersistence.clear()
    computerPersistence.clear()
    gistPersistence.clear()
  }
  const documentRevision: Ref<number> = ref(0)
  const workspaceLoad: Ref<WorkspaceLoadState> = shallowRef({ kind: 'idle', revision: 0 })
  const workspaceLoadRevision = computed(() => workspaceLoad.value.kind !== 'idle' ? workspaceLoad.value.intent.revision : workspaceLoad.value.revision)
  const isWorkspaceLoading = computed(() => workspaceLoad.value.kind !== 'idle')
  const beginWorkspaceLoad = (source: StudioSourceKind): StudioLoadIntent => {
    const intent = { revision: workspaceLoadRevision.value + 1, source }
    workspaceLoad.value = { kind: 'loading', intent }
    return intent
  }
  const ownsWorkspaceLoad = (intent: StudioLoadIntent) => workspaceLoadRevision.value === intent.revision
  const cancelWorkspaceLoad = (intent: StudioLoadIntent) => {
    if (ownsWorkspaceLoad(intent)) workspaceLoad.value = { kind: 'idle', revision: intent.revision + 1 }
  }
  const supersedeWorkspaceDocument = () => {
    if (workspaceLoad.value.kind !== 'committing') {
      documentRevision.value += 1
      workspaceLoad.value = { kind: 'idle', revision: workspaceLoadRevision.value + 1 }
    }
  }
  const commitWorkspaceLoad = (intent: StudioLoadIntent, commit: () => void) => {
    if (workspaceLoad.value.kind !== 'loading' || !ownsWorkspaceLoad(intent)) return false
    workspaceLoad.value = { kind: 'committing', intent }
    try {
      commit()
      currentSourceKind.value = intent.source
      documentRevision.value += 1
      return true
    } finally {
      if (ownsWorkspaceLoad(intent)) workspaceLoad.value = { kind: 'idle', revision: intent.revision }
    }
  }
  const appliedLaunchKey: Ref<string | null> = ref(null)
  const currentSourceKind: Ref<StudioSourceKind> = ref('browser')
  const includeLayoutInSchema: Ref<boolean> = ref(true)
  const launchAuthority: Ref<'authorized' | 'unauthorized'> = ref(readStudioLaunchAccess() ? 'authorized' : 'unauthorized')
  const launchAuthorized = computed(() => launchAuthority.value === 'authorized')
  const dialogState: Ref<StudioDialogState> = shallowRef({ kind: 'closed' })
  let dialogSequence = 0
  const loadDialogOpen = computed(() => dialogState.value.kind === 'load')
  const schemaDialogOpen = computed(() => dialogState.value.kind === 'schema')
  const schemaDialogMode = computed(() => dialogState.value.kind === 'schema' ? dialogState.value.mode : 'save')
  const schemaDialogRevision = computed(() => dialogState.value.kind === 'schema' ? dialogState.value.revision : null)
  const schemaDialogName = computed(() => dialogState.value.kind === 'schema' ? dialogState.value.draft.name : null)
  const saveSchemaTargetId = computed(() => {
    if (dialogState.value.kind === 'schema') return dialogState.value.draft.targetId
    const selection = browserPersistence.selection.value
    return selection.kind === 'selected' && selection.target.kind === 'saved' ? selection.target.id : null
  })

  const syncLaunchAuthorized = () => {
    return launchAuthorized.value
  }

  const authorizeLaunchAccess = () => {
    launchAuthority.value = 'authorized'
    const didAuthorize = persistStudioLaunchAccess()

    return didAuthorize
  }

  const clearLaunchAccess = () => {
    launchAuthority.value = 'unauthorized'
    const didClear = clearPersistedStudioLaunchAccess()

    return didClear
  }

  const hasLaunchAccess = () => {
    return syncLaunchAuthorized()
  }

  const primePreloadedFileLaunch = (
    request: FileStudioLaunchRequest,
    payload: PreloadedFileStudioLaunchPayload
  ) => {
    persistPreloadedFileStudioLaunch(request, payload)
  }

  const consumePreloadedFileLaunch = (request: FileStudioLaunchRequest) => {
    return consumePersistedPreloadedFileStudioLaunch(request)
  }

  const openSchemaDialog = (mode: PgmlStudioSchemaDialogMode, draft: SchemaDialogDraft) => {
    dialogState.value = { kind: 'schema', mode, draft, revision: ++dialogSequence }
  }
  const updateSchemaDialogDraft = (patch: Partial<SchemaDialogDraft>) => {
    if (dialogState.value.kind === 'schema') {
      dialogState.value = { ...dialogState.value, draft: { ...dialogState.value.draft, ...patch } }
    }
  }
  const closeSchemaDialog = (revision: number | null = schemaDialogRevision.value) => {
    if (dialogState.value.kind === 'schema' && dialogState.value.revision === revision) {
      dialogState.value = { kind: 'closed' }
    }
  }
  const updateSchemaDialogOpen = (open: boolean) => {
    if (!open) closeSchemaDialog()
  }
  const openLoadDialog = () => {
    dialogState.value = { kind: 'load' }
  }
  const closeLoadDialog = () => {
    if (dialogState.value.kind === 'load') dialogState.value = { kind: 'closed' }
  }
  const updateLoadDialogOpen = (open: boolean) => {
    if (!open) closeLoadDialog()
  }

  const resetStudioUiState = () => {
    workspaceLoad.value = { kind: 'idle', revision: workspaceLoadRevision.value + 1 }
    appliedLaunchKey.value = null
    currentSourceKind.value = 'browser'
    includeLayoutInSchema.value = true
    dialogState.value = { kind: 'closed' }
  }

  return {
    workspaceDocumentRevision: computed(() => documentRevision.value),
    workspaceLoadRevision, isWorkspaceLoading, supersedeWorkspaceDocument, beginWorkspaceLoad, ownsWorkspaceLoad, cancelWorkspaceLoad, commitWorkspaceLoad,
    browserPersistenceState: browserPersistence.state,
    getBrowserPersistence,
    saveSchemaTargetId,
    schemaDialogName,
    schemaDialogRevision,
    updateSchemaDialogDraft,
    updateSchemaDialogOpen,
    updateLoadDialogOpen,
    gistPersistenceState: gistPersistence.state,
    getGistPersistence,
    computerPersistenceState: computerPersistence.state,
    getComputerPersistence,
    resetPersistence,
    appliedLaunchKey,
    authorizeLaunchAccess,
    clearLaunchAccess,
    closeLoadDialog,
    closeSchemaDialog,
    consumePreloadedFileLaunch,
    currentSourceKind: computed(() => currentSourceKind.value),
    hasLaunchAccess,
    includeLayoutInSchema,
    launchAuthorized,
    loadDialogOpen,
    openLoadDialog,
    openSchemaDialog,
    primePreloadedFileLaunch,
    resetStudioUiState,
    schemaDialogMode,
    schemaDialogOpen,
    syncLaunchAuthorized
  }
})
