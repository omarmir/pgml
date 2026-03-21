import { ref, type Ref } from 'vue'
import { defineStore } from 'pinia'
import type { PgmlRecentComputerFile } from '../utils/computer-files'
import { listRecentComputerPgmlFiles } from '../utils/computer-files'
import {
  orderSavedSchemas,
  persistSavedPgmlSchemasToBrowserStorage,
  readSavedPgmlSchemasFromBrowserStorage,
  type SavedPgmlSchema
} from '../utils/studio-browser-schemas'

const browserSchemaRefreshErrorMessage = 'Unable to read saved schemas from local storage.'
const browserSchemaSaveErrorMessage = 'Unable to save to local storage.'
const recentComputerFilesRefreshErrorMessage = 'Unable to load recent computer files.'

const getActionErrorMessage = (error: unknown, fallbackMessage: string) => {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message
  }

  if (typeof error === 'string' && error.trim().length > 0) {
    return error
  }

  return fallbackMessage
}

export const useStudioSourcesStore = defineStore('studio-sources', () => {
  const browserSchemas: Ref<SavedPgmlSchema[]> = ref([])
  const browserSchemasError: Ref<string | null> = ref(null)
  const isRefreshingBrowserSchemas: Ref<boolean> = ref(false)
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

  return {
    browserSchemas,
    browserSchemasError,
    deleteBrowserSchema,
    isRefreshingBrowserSchemas,
    isRefreshingRecentComputerFiles,
    persistBrowserSchemas,
    recentComputerFiles,
    recentComputerFilesError,
    refreshBrowserSchemas,
    refreshRecentComputerFiles
  }
})
