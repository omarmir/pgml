import type { Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useStudioSourcesStore } from '~/stores/studio-sources'
import { formatSavedPgmlSchemaTime } from '~/utils/studio-browser-schemas'
import { useStudioWorkspaceGistFileState } from './useStudioWorkspaceState'

const githubGistSaveErrorMessage = 'Unable to save to the connected GitHub Gist.'
const githubGistOpenErrorMessage = 'Unable to load that PGML file from the connected GitHub Gist.'

type UsePgmlStudioGistsOptions = {
  applyLoadedFileText?: (value: string) => void
  buildSchemaText: (includeLayout: boolean) => string
  source: Ref<string>
}

export const usePgmlStudioGists = ({
  applyLoadedFileText,
  buildSchemaText,
  source
}: UsePgmlStudioGistsOptions) => {
  const studioSourcesStore = useStudioSourcesStore()
  const { githubGistFiles } = storeToRefs(studioSourcesStore)
  const {
    currentGistFileName,
    currentGistFileUpdatedAt,
    currentGistId,
    gistFileSaveError,
    hasSavedGistFileInSession,
    isSavingToGistFile,
    lastPersistedSnapshot
  } = useStudioWorkspaceGistFileState()

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
  const currentSnapshot = computed(() => {
    return getCurrentSnapshot()
  })
  const hasSelectedGistFile = computed(() => {
    return currentGistId.value !== null && currentGistFileName.value.trim().length > 0
  })
  const hasPendingGistFileChanges = computed(() => {
    return hasSelectedGistFile.value && lastPersistedSnapshot.value !== currentSnapshot.value
  })
  const isSavedToGistFile = computed(() => {
    return hasSelectedGistFile.value && !hasPendingGistFileChanges.value
  })

  const syncLoadedGistFile = (payload: {
    filename: string
    gistId: string
    text: string
    updatedAt: string
  }) => {
    if (applyLoadedFileText) {
      applyLoadedFileText(payload.text)
    } else {
      source.value = payload.text
    }

    currentGistFileName.value = payload.filename
    currentGistFileUpdatedAt.value = payload.updatedAt
    currentGistId.value = payload.gistId
    hasSavedGistFileInSession.value = false
    lastPersistedSnapshot.value = getSnapshot(payload.text)
    gistFileSaveError.value = null
  }

  const loadGistPgmlFileByName = async (filename: string) => {
    try {
      const loadedFile = await studioSourcesStore.loadGithubGistPgmlFile(filename)

      if (!loadedFile) {
        gistFileSaveError.value = studioSourcesStore.githubGistError || githubGistOpenErrorMessage
        return false
      }

      syncLoadedGistFile(loadedFile)

      return true
    } catch {
      gistFileSaveError.value = githubGistOpenErrorMessage

      return false
    }
  }

  const saveSchemaToGistFile = async () => {
    if (!hasSelectedGistFile.value) {
      gistFileSaveError.value = githubGistSaveErrorMessage
      return false
    }

    const text = getCurrentText()

    isSavingToGistFile.value = true

    try {
      const savedFile = await studioSourcesStore.saveGithubGistPgmlFile({
        filename: currentGistFileName.value,
        text
      })

      if (!savedFile) {
        gistFileSaveError.value = studioSourcesStore.githubGistError || githubGistSaveErrorMessage
        return false
      }

      currentGistFileName.value = savedFile.filename
      currentGistFileUpdatedAt.value = savedFile.updatedAt
      currentGistId.value = savedFile.gistId
      hasSavedGistFileInSession.value = true
      lastPersistedSnapshot.value = getSnapshot(text)
      gistFileSaveError.value = null

      return true
    } finally {
      await nextTick()
      isSavingToGistFile.value = false
    }
  }

  const formatSavedAt = (value: string) => formatSavedPgmlSchemaTime(value)

  return {
    currentGistFileName,
    currentGistFileUpdatedAt,
    currentGistId,
    formatSavedAt,
    gistFileSaveError,
    githubGistFiles,
    hasPendingGistFileChanges,
    hasSavedGistFileInSession,
    hasSelectedGistFile,
    isSavedToGistFile,
    isSavingToGistFile,
    loadGistPgmlFileByName,
    saveSchemaToGistFile,
    syncLoadedGistFile
  }
}
