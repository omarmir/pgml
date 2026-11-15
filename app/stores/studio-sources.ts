import { nanoid } from 'nanoid'
import { computed, ref, shallowRef, type Ref } from 'vue'
import { defineStore } from 'pinia'
import { useAsyncOperation } from '../composables/useAsyncOperation'
import { useStudioSessionStore } from './studio-session'
import type { PgmlRecentComputerFile } from '../utils/computer-files'
import {
  deleteRecentComputerPgmlFile,
  listRecentComputerPgmlFiles
} from '../utils/computer-files'
import {
  buildUniquePgmlGistFilename,
  createPgmlGistConnectionMetadata,
  loadPgmlGistFile,
  loadPgmlGistFiles,
  persistPgmlGistConnectionMetadata,
  readPgmlGistConnectionMetadata,
  savePgmlGistFile,
  type PgmlGistConnectionMetadata,
  type PgmlGistFile
} from '../utils/github-gists'
import {
  normalizeSchemaName,
  orderSavedSchemas,
  persistSavedPgmlSchemasToBrowserStorage,
  readSavedPgmlSchemasFromBrowserStorage,
  type SavedPgmlSchema
} from '../utils/studio-browser-schemas'

const browserSchemaRefreshErrorMessage = 'Unable to read saved schemas from local storage.'
const browserSchemaSaveErrorMessage = 'Unable to save to local storage.'
const recentComputerFileDeleteErrorMessage = 'Unable to remove the recent file.'
const recentComputerFilesRefreshErrorMessage = 'Unable to load recent computer files.'
const githubGistConnectErrorMessage = 'Unable to connect to that GitHub Gist.'
const githubGistMissingTokenErrorMessage = 'Connect the GitHub Gist before loading remote PGML files.'
const githubGistRefreshErrorMessage = 'Unable to load PGML files from the connected Gist.'
const githubGistSaveErrorMessage = 'Unable to save to the connected GitHub Gist.'

const getActionErrorMessage = (error: unknown, fallbackMessage: string) => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error
  }

  return fallbackMessage
}

const orderGithubGistFiles = (files: PgmlGistFile[]) => {
  return [...files].sort((left, right) => left.filename.localeCompare(right.filename))
}

type GistConnectionState = { kind: 'disconnected' } | { kind: 'remembered', metadata: PgmlGistConnectionMetadata } | { kind: 'connected', metadata: PgmlGistConnectionMetadata, token: string }
type SourceFeedback = { kind: 'idle' } | { kind: 'failed', message: string }

export const useStudioSourcesStore = defineStore('studio-sources', () => {
  const studioSessionStore = useStudioSessionStore()
  const browserSchemas: Ref<SavedPgmlSchema[]> = ref([])
  const browserFeedback: Ref<SourceFeedback> = shallowRef({ kind: 'idle' })
  const browserSchemasError = computed(() => browserFeedback.value.kind === 'failed' ? browserFeedback.value.message : null)
  const rememberedConnection = readPgmlGistConnectionMetadata()
  const gistConnectionState: Ref<GistConnectionState> = shallowRef(rememberedConnection === null ? { kind: 'disconnected' } : { kind: 'remembered', metadata: rememberedConnection })
  const githubGistConnection = computed(() => gistConnectionState.value.kind === 'disconnected' ? null : gistConnectionState.value.metadata)
  const gistFeedback: Ref<SourceFeedback> = shallowRef({ kind: 'idle' })
  const githubGistError = computed(() => gistFeedback.value.kind === 'failed' ? gistFeedback.value.message : null)
  const setGistError = (message: string | null) => {
    gistFeedback.value = message === null ? { kind: 'idle' } : { kind: 'failed', message }
  }
  let gistActionRevision = 0
  let connectionRevision = 0
  const gistConnectOperation = useAsyncOperation()
  const gistLoadOperation = useAsyncOperation()
  const githubGistFiles: Ref<PgmlGistFile[]> = ref([])
  const githubGistToken = computed(() => gistConnectionState.value.kind === 'connected' ? gistConnectionState.value.token : null)
  const isRefreshingBrowserSchemas = computed(() => false)
  const gistRefreshOperation = useAsyncOperation()
  const isRefreshingGithubGistFiles = gistRefreshOperation.pending
  const recentFilesOperation = useAsyncOperation()
  const isRefreshingRecentComputerFiles = recentFilesOperation.pending
  const recentComputerFiles: Ref<PgmlRecentComputerFile[]> = ref([])
  const recentComputerFilesError = recentFilesOperation.error

  const refreshBrowserSchemas = () => {
    try {
      browserSchemas.value = readSavedPgmlSchemasFromBrowserStorage()
      browserFeedback.value = { kind: 'idle' }

      return browserSchemas.value
    } catch {
      browserFeedback.value = { kind: 'failed', message: browserSchemaRefreshErrorMessage }

      return browserSchemas.value
    }
  }

  const persistBrowserSchemas = (schemas: SavedPgmlSchema[]) => {
    if (studioSessionStore.currentSourceKind !== 'browser') {
      browserFeedback.value = { kind: 'failed', message: browserSchemaSaveErrorMessage }
      return false
    }

    const nextSchemas = orderSavedSchemas(schemas)

    if (!persistSavedPgmlSchemasToBrowserStorage(nextSchemas)) {
      browserFeedback.value = { kind: 'failed', message: browserSchemaSaveErrorMessage }
      return false
    }

    browserSchemas.value = nextSchemas
    browserFeedback.value = { kind: 'idle' }

    return true
  }

  const deleteBrowserSchema = (schemaId: string) => {
    return persistBrowserSchemas(browserSchemas.value.filter(schema => schema.id !== schemaId))
  }

  const createBrowserSchema = (input: {
    name: string
    text: string
  }) => {
    if (studioSessionStore.currentSourceKind !== 'browser') {
      browserFeedback.value = { kind: 'failed', message: browserSchemaSaveErrorMessage }
      return null
    }

    const nextSchema: SavedPgmlSchema = {
      id: nanoid(),
      name: normalizeSchemaName(input.name),
      text: input.text,
      updatedAt: new Date().toISOString()
    }

    if (!persistBrowserSchemas([nextSchema, ...browserSchemas.value])) {
      return null
    }

    return nextSchema
  }

  const refreshRecentComputerFiles = async () => {
    await recentFilesOperation.run({
      task: listRecentComputerPgmlFiles,
      apply: (files) => { recentComputerFiles.value = files },
      onError: error => getActionErrorMessage(error, recentComputerFilesRefreshErrorMessage)
    })
    return recentComputerFiles.value
  }

  const deleteRecentComputerFile = async (recentFileId: string) => {
    recentFilesOperation.invalidate()
    try {
      const didDelete = await deleteRecentComputerPgmlFile(recentFileId)

      if (!didDelete) {
        recentFilesOperation.fail(recentComputerFileDeleteErrorMessage)

        return false
      }

      recentComputerFiles.value = recentComputerFiles.value.filter((file) => {
        return file.id !== recentFileId
      })
      recentFilesOperation.invalidate()

      return true
    } catch (error) {
      recentFilesOperation.fail(getActionErrorMessage(error, recentComputerFileDeleteErrorMessage))

      return false
    }
  }

  const connectGithubGist = async (input: { gistId: string, token: string }) => {
    const actionId = ++gistActionRevision
    const result = await gistConnectOperation.run({
      task: () => loadPgmlGistFiles({ gistId: input.gistId, token: input.token }),
      apply: (files) => {
        const metadata = createPgmlGistConnectionMetadata({ gistId: input.gistId, selectedFilename: files[0]?.filename ?? null })
        if (!persistPgmlGistConnectionMetadata(metadata)) throw new Error(githubGistSaveErrorMessage)
        connectionRevision += 1
        gistRefreshOperation.invalidate()
        gistLoadOperation.invalidate()
        gistConnectionState.value = { kind: 'connected', metadata, token: input.token }
        githubGistFiles.value = files
      },
      onError: error => getActionErrorMessage(error, githubGistConnectErrorMessage)
    })
    if (actionId === gistActionRevision) {
      if (result.kind === 'applied') setGistError(null)
      if (result.kind === 'failed') setGistError(gistConnectOperation.error.value)
    }
    return result.kind === 'applied'
  }

  const refreshGithubGistFiles = async () => {
    const connection = githubGistConnection.value
    const token = githubGistToken.value
    if (connection === null || token === null || token.trim().length === 0) return githubGistFiles.value
    const actionId = ++gistActionRevision
    const result = await gistRefreshOperation.run({
      task: () => loadPgmlGistFiles({ gistId: connection.gistId, token }),
      apply: (files) => { githubGistFiles.value = files },
      onError: error => getActionErrorMessage(error, githubGistRefreshErrorMessage)
    })
    if (actionId === gistActionRevision) {
      if (result.kind === 'applied') setGistError(null)
      if (result.kind === 'failed') setGistError(gistRefreshOperation.error.value)
    }
    return githubGistFiles.value
  }

  const loadGithubGistPgmlFile = async (filename: string) => {
    const connection = gistConnectionState.value
    if (connection.kind !== 'connected') {
      setGistError(githubGistMissingTokenErrorMessage)
      return null
    }
    const actionId = ++gistActionRevision
    const result = await gistLoadOperation.run({
      task: () => loadPgmlGistFile({ filename, gistId: connection.metadata.gistId, token: connection.token }),
      apply: () => {},
      onError: error => getActionErrorMessage(error, githubGistRefreshErrorMessage)
    })
    if (actionId === gistActionRevision) {
      if (result.kind === 'applied') setGistError(null)
      if (result.kind === 'failed') setGistError(gistLoadOperation.error.value)
    }
    return result.kind === 'applied' ? result.value : null
  }

  const saveGithubGistPgmlFile = async (input: {
    gistId: string
    filename: string
    text: string
  }) => {
    const connection = githubGistConnection.value
    const token = githubGistToken.value
    if (connection === null || token === null || token.trim().length === 0 || connection.gistId !== input.gistId) {
      setGistError(githubGistMissingTokenErrorMessage)
      return null
    }

    const actionId = ++gistActionRevision
    const revision = connectionRevision
    try {
      const savedFile = await savePgmlGistFile({
        filename: input.filename,
        gistId: input.gistId,
        text: input.text,
        token
      })

      if (revision !== connectionRevision) return savedFile
      gistRefreshOperation.invalidate()
      githubGistFiles.value = orderGithubGistFiles([
        savedFile,
        ...githubGistFiles.value.filter(file => file.filename !== savedFile.filename)
      ])
      if (actionId === gistActionRevision) setGistError(null)

      return savedFile
    } catch (error) {
      if (actionId === gistActionRevision && revision === connectionRevision) setGistError(getActionErrorMessage(error, githubGistSaveErrorMessage))

      return null
    }
  }

  const createGithubGistPgmlFile = async (input: {
    name: string
    text: string
  }) => {
    const filename = buildUniquePgmlGistFilename({
      existingFilenames: githubGistFiles.value.map(file => file.filename),
      name: normalizeSchemaName(input.name)
    })

    if (githubGistConnection.value === null) {
      setGistError(githubGistMissingTokenErrorMessage)
      return null
    }
    return await saveGithubGistPgmlFile({
      gistId: githubGistConnection.value.gistId,
      filename,
      text: input.text
    })
  }

  return {
    browserSchemas,
    browserSchemasError,
    connectGithubGist,
    createBrowserSchema,
    createGithubGistPgmlFile,
    deleteBrowserSchema,
    deleteRecentComputerFile,
    githubGistConnection,
    githubGistError,
    githubGistFiles,
    githubGistToken,
    isRefreshingBrowserSchemas,
    isRefreshingGithubGistFiles,
    isRefreshingRecentComputerFiles,
    loadGithubGistPgmlFile,
    persistBrowserSchemas,
    recentComputerFiles,
    recentComputerFilesError,
    refreshBrowserSchemas,
    refreshGithubGistFiles,
    refreshRecentComputerFiles,
    saveGithubGistPgmlFile
  }
})
