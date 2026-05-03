import type { ComputedRef, Ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { storeToRefs } from 'pinia'
import { useStudioSessionStore, type PgmlStudioSchemaDialogMode } from '~/stores/studio-session'
import { useStudioSourcesStore } from '~/stores/studio-sources'
import {
  downloadSchemaText,
  exampleSchemaName,
  formatSavedPgmlSchemaTime,
  normalizeSchemaName,
  orderSavedSchemas,
  type SavedPgmlSchema,
  untitledSchemaName
} from '~/utils/studio-browser-schemas'
import { useStudioWorkspaceBrowserSchemaState } from './useStudioWorkspaceState'

const schemaAutosaveDebounceMs = 5000
const localStorageSaveErrorMessage = 'Unable to save to local storage.'

type UsePgmlStudioSchemasOptions = {
  applyLoadedSchemaText?: (value: string) => void
  autosaveEnabled?: ComputedRef<boolean>
  browserPersistenceEnabled?: ComputedRef<boolean>
  buildSchemaText: (includeLayout: boolean) => string
  canEmbedLayout: ComputedRef<boolean>
  initialSource: string
  restoreLatestOnSetup?: boolean
  source: Ref<string>
}

type PersistSchemaOptions = {
  closeDialog: boolean
}

export const usePgmlStudioSchemas = ({
  applyLoadedSchemaText,
  autosaveEnabled,
  browserPersistenceEnabled,
  buildSchemaText,
  canEmbedLayout,
  initialSource,
  restoreLatestOnSetup = true,
  source
}: UsePgmlStudioSchemasOptions) => {
  const isAutosaveEnabled = autosaveEnabled ?? computed(() => true)
  const isBrowserPersistenceEnabled = browserPersistenceEnabled ?? computed(() => true)
  const studioSessionStore = useStudioSessionStore()
  const studioSourcesStore = useStudioSourcesStore()
  const { browserSchemas: savedSchemas } = storeToRefs(studioSourcesStore)
  const { includeLayoutInSchema, loadDialogOpen, schemaDialogMode, schemaDialogOpen } = storeToRefs(studioSessionStore)
  const {
    currentSchemaId,
    currentSchemaName,
    currentSchemaUpdatedAt,
    hasSavedSchemaInSession,
    isSavingToLocalStorage,
    lastPersistedSnapshot,
    localStorageSaveError,
    saveSchemaTargetId
  } = useStudioWorkspaceBrowserSchemaState({
    isSavingToLocalStorage: false,
    name: source.value.trim().length > 0 ? exampleSchemaName : untitledSchemaName
  })

  const schemaActionTitle = computed(() => schemaDialogMode.value === 'save' ? 'Save schema' : 'Download schema')
  const schemaActionDescription = computed(() => {
    if (schemaDialogMode.value === 'save') {
      return canEmbedLayout.value
        ? 'Save the current PGML to browser local storage. Browser saves always include the current canvas layout so autosave stays aligned with the saved schema.'
        : 'The current PGML has a parse error, so only the raw text can be saved right now.'
    }

    return canEmbedLayout.value
      ? 'Choose whether to embed the current canvas layout into the downloaded PGML text.'
      : 'The current PGML has a parse error, so only the raw text can be saved right now.'
  })
  const saveSchemaTarget = computed(() => {
    return orderedSavedSchemas.value.find(schema => schema.id === saveSchemaTargetId.value) || null
  })
  const saveSchemaActionLabel = computed(() => {
    return saveSchemaTarget.value ? 'Overwrite saved schema' : 'Save to browser'
  })
  const orderedSavedSchemas = computed(() => {
    return orderSavedSchemas(savedSchemas.value)
  })
  const getSnapshot = (name: string, text: string) => {
    return JSON.stringify({
      name,
      text
    })
  }
  const getAutosaveName = () => {
    return normalizeSchemaName(currentSchemaName.value)
  }
  const getPersistedText = () => {
    return buildSchemaText(true)
  }
  const getCurrentSnapshot = () => {
    return getSnapshot(getAutosaveName(), getPersistedText())
  }
  const parseSnapshot = (snapshot: string) => {
    return JSON.parse(snapshot) as {
      name: string
      text: string
    }
  }
  const currentSnapshot = computed(() => {
    return getCurrentSnapshot()
  })
  const syncSchemaSnapshot = (name: string, text: string) => {
    lastPersistedSnapshot.value = getSnapshot(name, text)
  }
  const syncCurrentSnapshot = () => {
    lastPersistedSnapshot.value = currentSnapshot.value
  }
  const clearPersistedSelection = () => {
    currentSchemaId.value = null
    currentSchemaUpdatedAt.value = null
    hasSavedSchemaInSession.value = false
    lastPersistedSnapshot.value = null
    saveSchemaTargetId.value = null
    localStorageSaveError.value = null
  }
  const applyUnsavedSchema = (nextSchema: { name: string, text: string }) => {
    if (applyLoadedSchemaText) {
      applyLoadedSchemaText(nextSchema.text)
    } else {
      source.value = nextSchema.text
    }

    currentSchemaName.value = nextSchema.name
    clearPersistedSelection()
    syncSchemaSnapshot(nextSchema.name, nextSchema.text)
  }
  const hasPendingLocalChanges = computed(() => {
    return lastPersistedSnapshot.value !== currentSnapshot.value
  })
  const isSavedToLocalStorage = computed(() => {
    return currentSchemaId.value !== null && !hasPendingLocalChanges.value
  })

  const loadExample = () => {
    applyUnsavedSchema({
      name: exampleSchemaName,
      text: initialSource
    })
  }

  const clearSchema = () => {
    applyUnsavedSchema({
      name: untitledSchemaName,
      text: ''
    })
  }

  const readSavedSchemas = () => {
    studioSourcesStore.refreshBrowserSchemas()
    localStorageSaveError.value = null
  }

  const persistSavedSchemas = (schemas: SavedPgmlSchema[]) => {
    return studioSourcesStore.persistBrowserSchemas(schemas)
  }
  const findMatchingSavedSchema = (name: string) => {
    const explicitSchemaId = saveSchemaTargetId.value || currentSchemaId.value

    if (explicitSchemaId) {
      return savedSchemas.value.find(entry => entry.id === explicitSchemaId)
    }

    return savedSchemas.value.find(entry => entry.name.toLowerCase() === name.toLowerCase())
  }
  const upsertSavedSchema = (schema: SavedPgmlSchema, existingSchemaId: string | null) => {
    if (!existingSchemaId) {
      return [schema, ...savedSchemas.value]
    }

    let didReplaceExistingSchema = false
    const nextSavedSchemas = savedSchemas.value.map((entry) => {
      if (entry.id !== existingSchemaId) {
        return entry
      }

      didReplaceExistingSchema = true

      return schema
    })

    return didReplaceExistingSchema ? nextSavedSchemas : [schema, ...nextSavedSchemas]
  }

  const syncPersistedState = (schema: SavedPgmlSchema) => {
    currentSchemaId.value = schema.id
    currentSchemaName.value = schema.name
    currentSchemaUpdatedAt.value = schema.updatedAt
    saveSchemaTargetId.value = schema.id
    syncSchemaSnapshot(schema.name, schema.text)
  }

  const openSchemaDialog = (mode: PgmlStudioSchemaDialogMode) => {
    saveSchemaTargetId.value = mode === 'save' ? currentSchemaId.value : null
    studioSessionStore.openSchemaDialog(mode)
  }

  const selectSaveSchemaTarget = (schema: SavedPgmlSchema) => {
    saveSchemaTargetId.value = schema.id
    currentSchemaName.value = schema.name
  }

  const clearSaveSchemaTarget = () => {
    saveSchemaTargetId.value = null
  }

  const persistSchemaToBrowser = (
    name: string,
    text: string,
    options: PersistSchemaOptions
  ) => {
    const updatedAt = new Date().toISOString()
    const matchingSchema = findMatchingSavedSchema(name)
    const existingSchemaId = matchingSchema?.id || saveSchemaTargetId.value || currentSchemaId.value || null
    const nextSchema: SavedPgmlSchema = matchingSchema
      ? {
          ...matchingSchema,
          name,
          text,
          updatedAt
        }
      : {
          id: existingSchemaId || nanoid(),
          name,
          text,
          updatedAt
        }
    const nextSavedSchemas = upsertSavedSchema(nextSchema, existingSchemaId)

    if (!persistSavedSchemas(nextSavedSchemas)) {
      localStorageSaveError.value = localStorageSaveErrorMessage
      return false
    }

    savedSchemas.value = nextSavedSchemas
    currentSchemaName.value = name
    hasSavedSchemaInSession.value = true
    localStorageSaveError.value = null
    syncPersistedState(nextSchema)

    if (options.closeDialog) {
      studioSessionStore.closeSchemaDialog()
    }

    return true
  }

  const persistSnapshotToBrowser = async (
    snapshot: string,
    options: PersistSchemaOptions
  ) => {
    if (!isBrowserPersistenceEnabled.value) {
      return false
    }

    const { name, text } = parseSnapshot(snapshot)
    isSavingToLocalStorage.value = true
    try {
      const didSave = persistSchemaToBrowser(name, text, options)

      await nextTick()

      return didSave
    } catch {
      localStorageSaveError.value = localStorageSaveErrorMessage

      return false
    } finally {
      isSavingToLocalStorage.value = false
    }
  }
  const persistCurrentSchemaToBrowser = async (options: PersistSchemaOptions) => {
    return persistSnapshotToBrowser(currentSnapshot.value, options)
  }
  const persistAutosaveSnapshotsToBrowser = async (snapshot: string) => {
    let nextSnapshot = snapshot

    while (nextSnapshot !== lastPersistedSnapshot.value) {
      const didSave = await persistSnapshotToBrowser(nextSnapshot, {
        closeDialog: false
      })

      if (!didSave || nextSnapshot === currentSnapshot.value) {
        return
      }

      nextSnapshot = currentSnapshot.value
    }
  }

  const saveSchemaToBrowser = async () => {
    if (!isBrowserPersistenceEnabled.value) {
      return false
    }

    return persistCurrentSchemaToBrowser({
      closeDialog: true
    })
  }

  const downloadSchema = () => {
    const name = normalizeSchemaName(currentSchemaName.value)
    const text = buildSchemaText(includeLayoutInSchema.value)

    currentSchemaName.value = name
    downloadSchemaText(name, text)
    studioSessionStore.closeSchemaDialog()
  }

  const loadSavedSchema = (schema: SavedPgmlSchema) => {
    if (applyLoadedSchemaText) {
      applyLoadedSchemaText(schema.text)
    } else {
      source.value = schema.text
    }

    hasSavedSchemaInSession.value = false
    syncPersistedState(schema)
    studioSessionStore.closeLoadDialog()
  }

  const deleteSavedSchema = (schemaId: string) => {
    if (!isBrowserPersistenceEnabled.value) {
      return
    }

    const nextSavedSchemas = savedSchemas.value.filter(entry => entry.id !== schemaId)

    if (!persistSavedSchemas(nextSavedSchemas)) {
      localStorageSaveError.value = localStorageSaveErrorMessage
      return
    }

    savedSchemas.value = nextSavedSchemas

    if (currentSchemaId.value === schemaId) {
      currentSchemaId.value = null
      currentSchemaUpdatedAt.value = null
      hasSavedSchemaInSession.value = false
      syncCurrentSnapshot()
    }

    if (saveSchemaTargetId.value === schemaId) {
      saveSchemaTargetId.value = null
    }

    localStorageSaveError.value = null
  }

  const formatSavedAt = (value: string) => formatSavedPgmlSchemaTime(value)

  if (import.meta.client) {
    readSavedSchemas()

    if (restoreLatestOnSetup) {
      const latestSavedSchema = orderSavedSchemas(savedSchemas.value)[0]

      if (latestSavedSchema) {
        if (applyLoadedSchemaText) {
          applyLoadedSchemaText(latestSavedSchema.text)
        } else {
          source.value = latestSavedSchema.text
        }

        syncPersistedState(latestSavedSchema)
      } else {
        syncCurrentSnapshot()
      }
    } else {
      syncCurrentSnapshot()
    }
  }

  watchDebounced(currentSnapshot, async (nextSnapshot) => {
    if (!import.meta.client || !isAutosaveEnabled.value) {
      return
    }

    if (nextSnapshot === lastPersistedSnapshot.value) {
      return
    }

    await persistAutosaveSnapshotsToBrowser(nextSnapshot)
  }, {
    debounce: schemaAutosaveDebounceMs,
    maxWait: schemaAutosaveDebounceMs
  })

  return {
    clearSchema,
    clearSaveSchemaTarget,
    currentSchemaId,
    currentSchemaName,
    currentSchemaUpdatedAt,
    deleteSavedSchema,
    downloadSchema,
    formatSavedAt,
    hasPendingLocalChanges,
    hasSavedSchemaInSession,
    includeLayoutInSchema,
    isSavedToLocalStorage,
    isSavingToLocalStorage,
    localStorageSaveError,
    loadDialogOpen,
    loadExample,
    loadSavedSchema,
    openSchemaDialog,
    orderedSavedSchemas,
    saveSchemaActionLabel,
    saveSchemaTarget,
    saveSchemaTargetId,
    saveSchemaToBrowser,
    selectSaveSchemaTarget,
    schemaActionDescription,
    schemaActionTitle,
    schemaDialogMode,
    schemaDialogOpen
  }
}
