import { onScopeDispose, type ComputedRef, type Ref } from 'vue'
import { useStudioAutosave } from './useStudioAutosave'
import { storeToRefs } from 'pinia'
import { useStudioSourcesStore } from '~/stores/studio-sources'
import {
  listRecentComputerPgmlFiles,
  loadRecentComputerPgmlFile,
  openComputerPgmlFile,
  supportsPassiveRecentComputerFileWrites,
  writeRecentComputerPgmlFile,
  type PgmlRecentComputerFile,
  type PgmlRecentComputerFileWriteResult
} from '~/utils/computer-files'
import { formatSavedPgmlSchemaTime } from '~/utils/studio-browser-schemas'
import { useStudioSessionStore, type ApplyStudioLoadedText, type StudioLoadIntent } from '~/stores/studio-session'

const computerFileSaveErrorMessage = 'Unable to save to the selected file.'
const computerFileOpenErrorMessage = 'Unable to open the selected file.'
const computerFileMissingErrorMessage = 'The selected file is no longer available.'
const computerFilePermissionRestoreMessage = 'File access needs to be restored before PGML can save again. Use Save to grant permission again.'
const computerFilePermissionDeniedMessage = 'PGML could not get permission to save to the selected file.'

const getComputerFileActionErrorMessage = (error: unknown, fallbackMessage: string) => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error
  }

  return fallbackMessage
}

type ComputerFileOperations = {
  listRecentComputerFiles: typeof listRecentComputerPgmlFiles
  loadRecentComputerFile: typeof loadRecentComputerPgmlFile
  openComputerFile: typeof openComputerPgmlFile
  writeRecentComputerFile: typeof writeRecentComputerPgmlFile
}

type UsePgmlStudioComputerFilesOptions = {
  applyLoadedFileText?: ApplyStudioLoadedText
  buildSchemaText: (includeLayout: boolean) => string
  enabled?: ComputedRef<boolean>
  fileOperations?: Partial<ComputerFileOperations>
  source: Ref<string>
}

type PersistCurrentComputerFileOptions = {
  interactive: boolean
}

export const usePgmlStudioComputerFiles = ({
  applyLoadedFileText,
  buildSchemaText,
  enabled,
  fileOperations,
  source
}: UsePgmlStudioComputerFilesOptions) => {
  const studioSourcesStore = useStudioSourcesStore()
  const { recentComputerFiles } = storeToRefs(studioSourcesStore)
  const studioSessionStore = useStudioSessionStore()
  const session = studioSessionStore.getComputerPersistence()
  const target = computed(() => session.selection.value.kind === 'selected' ? session.selection.value.target : null)
  const computerFileSaveError = session.error
  const currentComputerFileId = computed(() => target.value === null ? null : target.value.id)
  const currentComputerFileName = computed(() => target.value === null ? '' : target.value.name)
  const currentComputerFileUpdatedAt = computed(() => target.value === null ? null : target.value.updatedAt)
  const hasSavedComputerFileInSession = session.hasSavedInSession
  const isSavingToComputerFile = session.isSaving
  const lastPersistedSnapshot = session.persistedSnapshot
  let scopeActive = true
  let loadRequest = 0
  let activeLoadIntent: StudioLoadIntent | null = null
  onScopeDispose(() => {
    scopeActive = false
    loadRequest += 1
    if (activeLoadIntent !== null) studioSessionStore.cancelWorkspaceLoad(activeLoadIntent)
  })
  const autosaveEnabled = enabled ?? computed(() => true)
  const passiveComputerFileWritesSupported = computed(() => supportsPassiveRecentComputerFileWrites())
  const operations: ComputerFileOperations = {
    listRecentComputerFiles: fileOperations?.listRecentComputerFiles ?? listRecentComputerPgmlFiles,
    loadRecentComputerFile: fileOperations?.loadRecentComputerFile ?? loadRecentComputerPgmlFile,
    openComputerFile: fileOperations?.openComputerFile ?? openComputerPgmlFile,
    writeRecentComputerFile: fileOperations?.writeRecentComputerFile ?? writeRecentComputerPgmlFile
  }

  const getSnapshot = (text: string) => {
    return JSON.stringify({
      text
    })
  }
  const getCurrentText = () => {
    return buildSchemaText(true)
  }
  const getCurrentSnapshot = () => {
    return getSnapshot(getCurrentText())
  }
  const parseSnapshot = (snapshot: string) => {
    return JSON.parse(snapshot) as {
      text: string
    }
  }
  const currentSnapshot = computed(() => {
    return getCurrentSnapshot()
  })
  const hasPendingComputerFileChanges = computed(() => {
    return currentComputerFileId.value !== null && lastPersistedSnapshot.value !== currentSnapshot.value
  })
  const isSavedToComputerFile = computed(() => {
    return currentComputerFileId.value !== null && !hasPendingComputerFileChanges.value
  })
  const hasSelectedComputerFile = computed(() => {
    return currentComputerFileId.value !== null
  })

  const refreshRecentComputerFiles = async () => {
    if (fileOperations?.listRecentComputerFiles) {
      recentComputerFiles.value = await operations.listRecentComputerFiles()

      return recentComputerFiles.value
    }

    return await studioSourcesStore.refreshRecentComputerFiles()
  }

  const getComputerFileSaveFailureMessage = (
    result: Extract<PgmlRecentComputerFileWriteResult, { ok: false }>,
    options: PersistCurrentComputerFileOptions
  ) => {
    if (result.reason === 'not-found') {
      return computerFileMissingErrorMessage
    }

    if (result.reason === 'permission-denied') {
      return options.interactive
        ? computerFilePermissionDeniedMessage
        : computerFilePermissionRestoreMessage
    }

    return computerFileSaveErrorMessage
  }

  const syncLoadedComputerFile = (payload: {
    entry: PgmlRecentComputerFile
    text: string
  }, intent: StudioLoadIntent = studioSessionStore.beginWorkspaceLoad('file')) => {
    activeLoadIntent = intent
    const commitPersistence = () => {
      loadRequest += 1
      session.select(payload.entry, getSnapshot(payload.text))
    }
    if (applyLoadedFileText) {
      return applyLoadedFileText({ text: payload.text, intent, commitPersistence })
    }
    return studioSessionStore.commitWorkspaceLoad(intent, () => {
      source.value = payload.text
      commitPersistence()
    })
  }

  const loadComputerFile = async (
    read: () => Promise<{ entry: PgmlRecentComputerFile, text: string } | null>,
    intent: StudioLoadIntent
  ) => {
    activeLoadIntent = intent
    const requestId = ++loadRequest
    const loadId = session.beginLoad()
    session.clearError()
    const generation = session.generation.value
    let accepted = false
    try {
      const loadedFile = await read()
      if (!studioSessionStore.ownsWorkspaceLoad(intent) || !scopeActive || !session.ownsLoad(loadId) || requestId !== loadRequest || generation !== session.generation.value) return false
      if (!loadedFile) {
        session.fail(computerFileOpenErrorMessage)
        return false
      }
      accepted = await syncLoadedComputerFile(loadedFile, intent)
      if (accepted) void refreshRecentComputerFiles().catch(() => {})
      return accepted && studioSessionStore.ownsWorkspaceLoad(intent) && scopeActive
    } catch {
      if (studioSessionStore.ownsWorkspaceLoad(intent) && scopeActive) session.fail(computerFileOpenErrorMessage)
      return false
    } finally {
      if (!accepted) studioSessionStore.cancelWorkspaceLoad(intent)
    }
  }
  const loadRecentComputerFileById = (recentFileId: string, intent: StudioLoadIntent = studioSessionStore.beginWorkspaceLoad('file')) => {
    return loadComputerFile(() => operations.loadRecentComputerFile(recentFileId), intent)
  }
  const openComputerFileFromPicker = (intent: StudioLoadIntent = studioSessionStore.beginWorkspaceLoad('file')) => {
    return loadComputerFile(operations.openComputerFile, intent)
  }

  watch(currentSnapshot, snapshot => session.observe(snapshot), { immediate: true, flush: 'sync' })

  const isPassiveWriteEligible = () => scopeActive && autosaveEnabled.value && !studioSessionStore.isWorkspaceLoading && passiveComputerFileWritesSupported.value
  const persistCurrentComputerFile = (snapshot: string, options: PersistCurrentComputerFileOptions) => {
    const selected = target.value
    if (selected === null) {
      session.fail(computerFileSaveErrorMessage)
      return Promise.resolve(false)
    }
    return session.save({
      target: selected,
      snapshot,
      mode: options.interactive ? 'manual' : 'autosave',
      isAutosaveEligible: isPassiveWriteEligible,
      onError: error => getComputerFileActionErrorMessage(error, computerFileSaveErrorMessage),
      write: async (capturedTarget, capturedSnapshot) => {
        const updatedFile = await operations.writeRecentComputerFile({
          recentFileId: capturedTarget.id,
          text: parseSnapshot(capturedSnapshot).text
        }, { permissionMode: options.interactive ? 'interactive' : 'passive' })
        if (!updatedFile.ok) {
          return { ok: false, message: getComputerFileSaveFailureMessage(updatedFile, options) }
        }
        void refreshRecentComputerFiles().catch(() => {})
        return { ok: true, target: updatedFile.entry }
      }
    })
  }
  const saveSchemaToComputerFile = () => persistCurrentComputerFile(currentSnapshot.value, { interactive: true })

  const formatSavedAt = (value: string) => formatSavedPgmlSchemaTime(value)
  const persistAutosaveSnapshotsToCurrentComputerFile = async (snapshot: string) => {
    const generation = session.generation.value
    let nextSnapshot = snapshot

    while (isPassiveWriteEligible() && generation === session.generation.value && nextSnapshot !== lastPersistedSnapshot.value) {
      const didSave = await persistCurrentComputerFile(nextSnapshot, {
        interactive: false
      })

      if (!didSave || nextSnapshot === currentSnapshot.value) {
        return
      }

      nextSnapshot = currentSnapshot.value
    }
  }

  if (import.meta.client) {
    void refreshRecentComputerFiles().catch(() => {})
  }

  useStudioAutosave({
    snapshot: currentSnapshot,
    eligible: computed(() => isPassiveWriteEligible() && hasPendingComputerFileChanges.value),
    resumeOnSetup: hasPendingComputerFileChanges.value,
    save: persistAutosaveSnapshotsToCurrentComputerFile
  })

  return {
    computerFileSaveError,
    currentComputerFileId,
    currentComputerFileName,
    currentComputerFileUpdatedAt,
    formatSavedAt,
    hasPendingComputerFileChanges,
    hasSavedComputerFileInSession,
    hasSelectedComputerFile,
    isSavedToComputerFile,
    isSavingToComputerFile,
    passiveComputerFileWritesSupported,
    loadRecentComputerFileById,
    openComputerFileFromPicker,
    recentComputerFiles,
    refreshRecentComputerFiles,
    saveSchemaToComputerFile,
    syncLoadedComputerFile
  }
}
