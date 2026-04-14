import type { ComputedRef, Ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
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

const computerFileAutosaveDebounceMs = 5000
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
  applyLoadedFileText?: (value: string) => void
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
  const currentComputerFileId: Ref<string | null> = ref(null)
  const currentComputerFileName: Ref<string> = ref('')
  const currentComputerFileUpdatedAt: Ref<string | null> = ref(null)
  const hasSavedComputerFileInSession: Ref<boolean> = ref(false)
  const isSavingToComputerFile: Ref<boolean> = ref(false)
  const computerFileSaveError: Ref<string | null> = ref(null)
  const lastPersistedSnapshot: Ref<string | null> = ref(null)
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
  }) => {
    if (applyLoadedFileText) {
      applyLoadedFileText(payload.text)
    } else {
      source.value = payload.text
    }

    currentComputerFileId.value = payload.entry.id
    currentComputerFileName.value = payload.entry.name
    currentComputerFileUpdatedAt.value = payload.entry.updatedAt
    hasSavedComputerFileInSession.value = false
    lastPersistedSnapshot.value = getSnapshot(payload.text)
    computerFileSaveError.value = null
  }

  const loadRecentComputerFileById = async (recentFileId: string) => {
    try {
      const loadedFile = await operations.loadRecentComputerFile(recentFileId)

      if (!loadedFile) {
        computerFileSaveError.value = computerFileOpenErrorMessage
        return false
      }

      syncLoadedComputerFile(loadedFile)
      await refreshRecentComputerFiles()

      return true
    } catch {
      computerFileSaveError.value = computerFileOpenErrorMessage
      return false
    }
  }

  const openComputerFileFromPicker = async () => {
    try {
      const loadedFile = await operations.openComputerFile()

      if (!loadedFile) {
        return false
      }

      syncLoadedComputerFile(loadedFile)
      await refreshRecentComputerFiles()

      return true
    } catch {
      computerFileSaveError.value = computerFileOpenErrorMessage
      return false
    }
  }

  const persistCurrentComputerFile = async (
    text: string,
    options: PersistCurrentComputerFileOptions
  ) => {
    try {
      if (!currentComputerFileId.value) {
        computerFileSaveError.value = computerFileSaveErrorMessage
        return false
      }

      const updatedFile = await operations.writeRecentComputerFile({
        recentFileId: currentComputerFileId.value,
        text
      }, {
        permissionMode: options.interactive ? 'interactive' : 'passive'
      })

      if (!updatedFile.ok) {
        computerFileSaveError.value = getComputerFileSaveFailureMessage(updatedFile, options)
        return false
      }

      currentComputerFileName.value = updatedFile.entry.name
      currentComputerFileUpdatedAt.value = updatedFile.entry.updatedAt
      hasSavedComputerFileInSession.value = true
      lastPersistedSnapshot.value = getSnapshot(text)
      computerFileSaveError.value = null
      await refreshRecentComputerFiles()

      return true
    } catch (error) {
      computerFileSaveError.value = getComputerFileActionErrorMessage(error, computerFileSaveErrorMessage)
      return false
    }
  }

  const saveSchemaToComputerFile = async () => {
    const text = getCurrentText()

    isSavingToComputerFile.value = true

    try {
      return await persistCurrentComputerFile(text, {
        interactive: true
      })
    } finally {
      await nextTick()
      isSavingToComputerFile.value = false
    }
  }

  const formatSavedAt = (value: string) => formatSavedPgmlSchemaTime(value)
  const persistAutosaveSnapshotsToCurrentComputerFile = async (snapshot: string) => {
    let nextSnapshot = snapshot

    while (nextSnapshot !== lastPersistedSnapshot.value) {
      const didSave = await persistCurrentComputerFile(parseSnapshot(nextSnapshot).text, {
        interactive: false
      })

      if (!didSave || nextSnapshot === currentSnapshot.value) {
        return
      }

      nextSnapshot = currentSnapshot.value
    }
  }

  if (import.meta.client) {
    void refreshRecentComputerFiles()
  }

  watchDebounced(currentSnapshot, async (nextSnapshot) => {
    if (
      !autosaveEnabled.value
      || !passiveComputerFileWritesSupported.value
      || !currentComputerFileId.value
    ) {
      return
    }
    if (nextSnapshot === lastPersistedSnapshot.value) {
      return
    }

    isSavingToComputerFile.value = true

    try {
      await persistAutosaveSnapshotsToCurrentComputerFile(nextSnapshot)
    } finally {
      await nextTick()
      isSavingToComputerFile.value = false
    }
  }, {
    debounce: computerFileAutosaveDebounceMs,
    maxWait: computerFileAutosaveDebounceMs
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
