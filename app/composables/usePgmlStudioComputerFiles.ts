import type { ComputedRef, Ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { useStudioSourcesStore } from '~/stores/studio-sources'
import {
  listRecentComputerPgmlFiles,
  loadRecentComputerPgmlFile,
  openComputerPgmlFile,
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

type ComputerFileOperations = {
  listRecentComputerFiles: typeof listRecentComputerPgmlFiles
  loadRecentComputerFile: typeof loadRecentComputerPgmlFile
  openComputerFile: typeof openComputerPgmlFile
  writeRecentComputerFile: typeof writeRecentComputerPgmlFile
}

type UsePgmlStudioComputerFilesOptions = {
  buildSchemaText: (includeLayout: boolean) => string
  enabled?: ComputedRef<boolean>
  fileOperations?: Partial<ComputerFileOperations>
  source: Ref<string>
}

type PersistCurrentComputerFileOptions = {
  interactive: boolean
}

export const usePgmlStudioComputerFiles = ({
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
  const isSavingToComputerFile: Ref<boolean> = ref(false)
  const computerFileSaveError: Ref<string | null> = ref(null)
  const lastPersistedSnapshot: Ref<string | null> = ref(null)
  const autosaveEnabled = enabled ?? computed(() => true)
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
  const getCurrentSnapshot = () => {
    return getSnapshot(source.value)
  }
  const hasPendingComputerFileChanges = computed(() => {
    return currentComputerFileId.value !== null && lastPersistedSnapshot.value !== getCurrentSnapshot()
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
    source.value = payload.text
    currentComputerFileId.value = payload.entry.id
    currentComputerFileName.value = payload.entry.name
    currentComputerFileUpdatedAt.value = payload.entry.updatedAt
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
    lastPersistedSnapshot.value = getSnapshot(text)
    computerFileSaveError.value = null
    await refreshRecentComputerFiles()

    return true
  }

  const saveSchemaToComputerFile = async (includeLayout: boolean) => {
    const text = buildSchemaText(includeLayout)

    isSavingToComputerFile.value = true
    const didSave = await persistCurrentComputerFile(text, {
      interactive: true
    })
    await nextTick()
    isSavingToComputerFile.value = false

    return didSave
  }

  const formatSavedAt = (value: string) => formatSavedPgmlSchemaTime(value)

  if (import.meta.client) {
    void refreshRecentComputerFiles()
  }

  watchDebounced(source, async () => {
    if (!autosaveEnabled.value || !currentComputerFileId.value) {
      return
    }

    const nextSnapshot = getCurrentSnapshot()

    if (nextSnapshot === lastPersistedSnapshot.value) {
      return
    }

    isSavingToComputerFile.value = true
    await persistCurrentComputerFile(source.value, {
      interactive: false
    })
    await nextTick()
    isSavingToComputerFile.value = false
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
    hasSelectedComputerFile,
    isSavedToComputerFile,
    isSavingToComputerFile,
    loadRecentComputerFileById,
    openComputerFileFromPicker,
    recentComputerFiles,
    refreshRecentComputerFiles,
    saveSchemaToComputerFile,
    syncLoadedComputerFile
  }
}
