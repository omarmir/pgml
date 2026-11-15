import { onScopeDispose, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useStudioSourcesStore } from '~/stores/studio-sources'
import { formatSavedPgmlSchemaTime } from '~/utils/studio-browser-schemas'
import { useStudioSessionStore, type ApplyStudioLoadedText, type StudioLoadIntent } from '~/stores/studio-session'

const githubGistSaveErrorMessage = 'Unable to save to the connected GitHub Gist.'
const githubGistOpenErrorMessage = 'Unable to load that PGML file from the connected GitHub Gist.'

type UsePgmlStudioGistsOptions = {
  applyLoadedFileText?: ApplyStudioLoadedText
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
  const studioSessionStore = useStudioSessionStore()
  const session = studioSessionStore.getGistPersistence()
  const target = computed(() => session.selection.value.kind === 'selected' ? session.selection.value.target : null)
  const currentGistFileName = computed(() => target.value === null ? '' : target.value.filename)
  const currentGistFileUpdatedAt = computed(() => target.value === null ? null : target.value.updatedAt)
  const currentGistId = computed(() => target.value === null ? null : target.value.gistId)
  const gistFileSaveError = session.error
  const hasSavedGistFileInSession = session.hasSavedInSession
  const isSavingToGistFile = session.isSaving
  const lastPersistedSnapshot = session.persistedSnapshot
  let loadRequest = 0
  let activeLoadIntent: StudioLoadIntent | null = null
  onScopeDispose(() => {
    loadRequest += 1
    if (activeLoadIntent !== null) studioSessionStore.cancelWorkspaceLoad(activeLoadIntent)
  })

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
  }, intent: StudioLoadIntent = studioSessionStore.beginWorkspaceLoad('gist')) => {
    activeLoadIntent = intent
    const commitPersistence = () => {
      loadRequest += 1
      session.select({ filename: payload.filename, updatedAt: payload.updatedAt, gistId: payload.gistId }, getSnapshot(payload.text))
    }
    if (applyLoadedFileText) return applyLoadedFileText({ text: payload.text, intent, commitPersistence })
    return studioSessionStore.commitWorkspaceLoad(intent, () => {
      source.value = payload.text
      commitPersistence()
    })
  }

  const loadGistPgmlFileByName = async (filename: string, intent: StudioLoadIntent = studioSessionStore.beginWorkspaceLoad('gist')) => {
    activeLoadIntent = intent
    const requestId = ++loadRequest
    const loadId = session.beginLoad()
    session.clearError()
    const generation = session.generation.value
    const gistId = studioSourcesStore.githubGistConnection?.gistId
    let accepted = false
    try {
      const loadedFile = await studioSourcesStore.loadGithubGistPgmlFile(filename)
      if (!studioSessionStore.ownsWorkspaceLoad(intent) || !session.ownsLoad(loadId) || requestId !== loadRequest || generation !== session.generation.value || gistId !== studioSourcesStore.githubGistConnection?.gistId) return false
      if (!loadedFile) {
        session.fail(studioSourcesStore.githubGistError || githubGistOpenErrorMessage)
        return false
      }
      accepted = await syncLoadedGistFile(loadedFile, intent)
      return accepted && studioSessionStore.ownsWorkspaceLoad(intent)
    } catch {
      if (studioSessionStore.ownsWorkspaceLoad(intent)) session.fail(githubGistOpenErrorMessage)
      return false
    } finally {
      if (!accepted) studioSessionStore.cancelWorkspaceLoad(intent)
    }
  }

  watch(currentSnapshot, snapshot => session.observe(snapshot), { immediate: true, flush: 'sync' })
  const saveSchemaToGistFile = () => {
    const selected = target.value
    if (selected === null) {
      session.fail(githubGistSaveErrorMessage)
      return Promise.resolve(false)
    }
    return session.save({
      target: selected,
      snapshot: currentSnapshot.value,
      mode: 'manual',
      onError: () => githubGistSaveErrorMessage,
      write: async (capturedTarget, snapshot) => {
        const parsed: { text: string } = JSON.parse(snapshot)
        const savedFile = await studioSourcesStore.saveGithubGistPgmlFile({
          gistId: capturedTarget.gistId,
          filename: capturedTarget.filename,
          text: parsed.text
        })
        if (!savedFile) {
          return { ok: false, message: studioSourcesStore.githubGistError || githubGistSaveErrorMessage }
        }
        return { ok: true, target: { filename: savedFile.filename, gistId: savedFile.gistId, updatedAt: savedFile.updatedAt } }
      }
    })
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
