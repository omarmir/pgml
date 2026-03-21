import { ref, type Ref } from 'vue'
import { defineStore } from 'pinia'
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
export type StudioSourceKind = 'browser' | 'file' | 'hosted'

export const useStudioSessionStore = defineStore('studio-session', () => {
  const appliedLaunchKey: Ref<string | null> = ref(null)
  const currentSourceKind: Ref<StudioSourceKind> = ref('browser')
  const includeLayoutInSchema: Ref<boolean> = ref(true)
  const launchAuthorized: Ref<boolean> = ref(readStudioLaunchAccess())
  const loadDialogOpen: Ref<boolean> = ref(false)
  const schemaDialogMode: Ref<PgmlStudioSchemaDialogMode> = ref('save')
  const schemaDialogOpen: Ref<boolean> = ref(false)

  const syncLaunchAuthorized = () => {
    launchAuthorized.value = readStudioLaunchAccess()

    return launchAuthorized.value
  }

  const authorizeLaunchAccess = () => {
    const didAuthorize = persistStudioLaunchAccess()

    syncLaunchAuthorized()

    return didAuthorize
  }

  const clearLaunchAccess = () => {
    const didClear = clearPersistedStudioLaunchAccess()

    syncLaunchAuthorized()

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

  const openSchemaDialog = (mode: PgmlStudioSchemaDialogMode) => {
    schemaDialogMode.value = mode
    schemaDialogOpen.value = true
  }

  const closeSchemaDialog = () => {
    schemaDialogOpen.value = false
  }

  const openLoadDialog = () => {
    loadDialogOpen.value = true
  }

  const closeLoadDialog = () => {
    loadDialogOpen.value = false
  }

  const resetStudioUiState = () => {
    appliedLaunchKey.value = null
    currentSourceKind.value = 'browser'
    includeLayoutInSchema.value = true
    loadDialogOpen.value = false
    schemaDialogMode.value = 'save'
    schemaDialogOpen.value = false
  }

  return {
    appliedLaunchKey,
    authorizeLaunchAccess,
    clearLaunchAccess,
    closeLoadDialog,
    closeSchemaDialog,
    consumePreloadedFileLaunch,
    currentSourceKind,
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
