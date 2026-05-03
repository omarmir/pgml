import { nanoid } from 'nanoid'
import { ref, type Ref } from 'vue'
import { defineStore } from 'pinia'
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

export const useStudioSourcesStore = defineStore('studio-sources', () => {
  const studioSessionStore = useStudioSessionStore()
  const browserSchemas: Ref<SavedPgmlSchema[]> = ref([])
  const browserSchemasError: Ref<string | null> = ref(null)
  const githubGistConnection: Ref<PgmlGistConnectionMetadata | null> = ref(readPgmlGistConnectionMetadata())
  const githubGistError: Ref<string | null> = ref(null)
  const githubGistFiles: Ref<PgmlGistFile[]> = ref([])
  const githubGistToken: Ref<string | null> = ref(null)
  const isRefreshingBrowserSchemas: Ref<boolean> = ref(false)
  const isRefreshingGithubGistFiles: Ref<boolean> = ref(false)
  const isRefreshingRecentComputerFiles: Ref<boolean> = ref(false)
  const recentComputerFiles: Ref<PgmlRecentComputerFile[]> = ref([])
  const recentComputerFilesError: Ref<string | null> = ref(null)

  const refreshBrowserSchemas = () => {
    isRefreshingBrowserSchemas.value = true

    try {
      browserSchemas.value = readSavedPgmlSchemasFromBrowserStorage()
      browserSchemasError.value = null

      return browserSchemas.value
    } catch {
      browserSchemasError.value = browserSchemaRefreshErrorMessage

      return browserSchemas.value
    } finally {
      isRefreshingBrowserSchemas.value = false
    }
  }

  const persistBrowserSchemas = (schemas: SavedPgmlSchema[]) => {
    if (studioSessionStore.currentSourceKind !== 'browser') {
      browserSchemasError.value = browserSchemaSaveErrorMessage
      return false
    }

    const nextSchemas = orderSavedSchemas(schemas)

    if (!persistSavedPgmlSchemasToBrowserStorage(nextSchemas)) {
      browserSchemasError.value = browserSchemaSaveErrorMessage
      return false
    }

    browserSchemas.value = nextSchemas
    browserSchemasError.value = null

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
      browserSchemasError.value = browserSchemaSaveErrorMessage
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
    isRefreshingRecentComputerFiles.value = true

    try {
      recentComputerFiles.value = await listRecentComputerPgmlFiles()
      recentComputerFilesError.value = null

      return recentComputerFiles.value
    } catch (error) {
      recentComputerFilesError.value = getActionErrorMessage(error, recentComputerFilesRefreshErrorMessage)

      return recentComputerFiles.value
    } finally {
      isRefreshingRecentComputerFiles.value = false
    }
  }

  const deleteRecentComputerFile = async (recentFileId: string) => {
    try {
      const didDelete = await deleteRecentComputerPgmlFile(recentFileId)

      if (!didDelete) {
        recentComputerFilesError.value = recentComputerFileDeleteErrorMessage

        return false
      }

      recentComputerFiles.value = recentComputerFiles.value.filter((file) => {
        return file.id !== recentFileId
      })
      recentComputerFilesError.value = null

      return true
    } catch (error) {
      recentComputerFilesError.value = getActionErrorMessage(error, recentComputerFileDeleteErrorMessage)

      return false
    }
  }

  const hasGithubGistToken = () => {
    return githubGistToken.value !== null && githubGistToken.value.trim().length > 0
  }

  const setGithubGistSelection = (filename: string | null) => {
    if (!githubGistConnection.value) {
      return false
    }

    const nextConnection: PgmlGistConnectionMetadata = {
      ...githubGistConnection.value,
      selectedFilename: filename
    }

    if (!persistPgmlGistConnectionMetadata(nextConnection)) {
      githubGistError.value = githubGistSaveErrorMessage
      return false
    }

    githubGistConnection.value = nextConnection
    githubGistError.value = null

    return true
  }

  const connectGithubGist = async (input: {
    accountLabel: string
    gistId: string
    token: string
  }) => {
    try {
      const files = await loadPgmlGistFiles({
        gistId: input.gistId,
        token: input.token
      })
      const metadata = createPgmlGistConnectionMetadata({
        accountLabel: input.accountLabel,
        gistId: input.gistId,
        selectedFilename: files[0]?.filename || null
      })

      if (!persistPgmlGistConnectionMetadata(metadata)) {
        githubGistError.value = githubGistSaveErrorMessage
        return false
      }

      githubGistConnection.value = metadata
      githubGistFiles.value = files
      githubGistToken.value = input.token
      githubGistError.value = null

      return true
    } catch (error) {
      githubGistError.value = getActionErrorMessage(error, githubGistConnectErrorMessage)

      return false
    }
  }

  const refreshGithubGistFiles = async () => {
    if (!githubGistConnection.value || !hasGithubGistToken()) {
      return githubGistFiles.value
    }

    isRefreshingGithubGistFiles.value = true

    try {
      githubGistFiles.value = await loadPgmlGistFiles({
        gistId: githubGistConnection.value.gistId,
        token: githubGistToken.value || ''
      })
      githubGistError.value = null

      return githubGistFiles.value
    } catch (error) {
      githubGistError.value = getActionErrorMessage(error, githubGistRefreshErrorMessage)

      return githubGistFiles.value
    } finally {
      isRefreshingGithubGistFiles.value = false
    }
  }

  const loadGithubGistPgmlFile = async (filename: string) => {
    if (!githubGistConnection.value || !hasGithubGistToken()) {
      githubGistError.value = githubGistMissingTokenErrorMessage
      return null
    }

    try {
      const loadedFile = await loadPgmlGistFile({
        filename,
        gistId: githubGistConnection.value.gistId,
        token: githubGistToken.value || ''
      })

      githubGistError.value = null

      return loadedFile
    } catch (error) {
      githubGistError.value = getActionErrorMessage(error, githubGistRefreshErrorMessage)

      return null
    }
  }

  const saveGithubGistPgmlFile = async (input: {
    filename: string
    text: string
  }) => {
    if (!githubGistConnection.value || !hasGithubGistToken()) {
      githubGistError.value = githubGistMissingTokenErrorMessage
      return null
    }

    try {
      const savedFile = await savePgmlGistFile({
        filename: input.filename,
        gistId: githubGistConnection.value.gistId,
        text: input.text,
        token: githubGistToken.value || ''
      })

      githubGistFiles.value = orderGithubGistFiles([
        savedFile,
        ...githubGistFiles.value.filter(file => file.filename !== savedFile.filename)
      ])
      githubGistError.value = null

      return savedFile
    } catch (error) {
      githubGistError.value = getActionErrorMessage(error, githubGistSaveErrorMessage)

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

    return await saveGithubGistPgmlFile({
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
    saveGithubGistPgmlFile,
    setGithubGistSelection
  }
})
