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

const schemaAutosaveDebounceMs = 5000
const localStorageSaveErrorMessage = 'Unable to save to local storage.'

type UsePgmlStudioSchemasOptions = {
  autosaveEnabled?: ComputedRef<boolean>
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
  autosaveEnabled,
  buildSchemaText,
  canEmbedLayout,
  initialSource,
  restoreLatestOnSetup = true,
  source
}: UsePgmlStudioSchemasOptions) => {
  const isAutosaveEnabled = autosaveEnabled ?? computed(() => true)
  const studioSessionStore = useStudioSessionStore()
  const studioSourcesStore = useStudioSourcesStore()
  const { browserSchemas: savedSchemas } = storeToRefs(studioSourcesStore)
  const { includeLayoutInSchema, loadDialogOpen, schemaDialogMode, schemaDialogOpen } = storeToRefs(studioSessionStore)
  const currentSchemaId: Ref<string | null> = ref(null)
  const currentSchemaName: Ref<string> = ref(exampleSchemaName)
  const currentSchemaUpdatedAt: Ref<string | null> = ref(null)
  const isSavingToLocalStorage: Ref<boolean> = ref(false)
  const localStorageSaveError: Ref<string | null> = ref(null)
  const lastPersistedSnapshot: Ref<string | null> = ref(null)
  const saveSchemaTargetId: Ref<string | null> = ref(null)

  const schemaActionTitle = computed(() => schemaDialogMode.value === 'save' ? 'Save schema' : 'Download schema')
  const schemaActionDescription = computed(() => {
    return canEmbedLayout.value
      ? 'Choose a name and decide whether to embed the current canvas layout into the PGML text.'
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
  const getAutosaveText = () => {
    return source.value
  }
  const getCurrentSnapshot = () => {
    return getSnapshot(getAutosaveName(), getAutosaveText())
  }
  const clearPersistedSelection = () => {
    currentSchemaId.value = null
    currentSchemaUpdatedAt.value = null
    lastPersistedSnapshot.value = null
    saveSchemaTargetId.value = null
    localStorageSaveError.value = null
  }
  const applyUnsavedSchema = (nextSchema: { name: string, text: string }) => {
    source.value = nextSchema.text
    currentSchemaName.value = nextSchema.name
    clearPersistedSelection()
  }
  const hasPendingLocalChanges = computed(() => {
    return lastPersistedSnapshot.value !== getCurrentSnapshot()
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
    lastPersistedSnapshot.value = getSnapshot(schema.name, schema.text)
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
    localStorageSaveError.value = null
    syncPersistedState(nextSchema)

    if (options.closeDialog) {
      studioSessionStore.closeSchemaDialog()
    }

    return true
  }

  const saveSchemaToBrowser = async () => {
    const name = normalizeSchemaName(currentSchemaName.value)
    const text = buildSchemaText(includeLayoutInSchema.value)

    isSavingToLocalStorage.value = true
    const didSave = persistSchemaToBrowser(name, text, {
      closeDialog: true
    })
    await nextTick()
    isSavingToLocalStorage.value = false

    return didSave
  }

  const downloadSchema = () => {
    const name = normalizeSchemaName(currentSchemaName.value)
    const text = buildSchemaText(includeLayoutInSchema.value)

    currentSchemaName.value = name
    downloadSchemaText(name, text)
    studioSessionStore.closeSchemaDialog()
  }

  const loadSavedSchema = (schema: SavedPgmlSchema) => {
    source.value = schema.text
    syncPersistedState(schema)
    studioSessionStore.closeLoadDialog()
  }

  const deleteSavedSchema = (schemaId: string) => {
    const nextSavedSchemas = savedSchemas.value.filter(entry => entry.id !== schemaId)

    if (!persistSavedSchemas(nextSavedSchemas)) {
      localStorageSaveError.value = localStorageSaveErrorMessage
      return
    }

    savedSchemas.value = nextSavedSchemas

    if (currentSchemaId.value === schemaId) {
      currentSchemaId.value = null
      currentSchemaUpdatedAt.value = null
      lastPersistedSnapshot.value = null
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
        source.value = latestSavedSchema.text
        syncPersistedState(latestSavedSchema)
      }
    }
  }

  watchDebounced([source, currentSchemaName], async () => {
    if (!import.meta.client || !isAutosaveEnabled.value) {
      return
    }

    const name = getAutosaveName()
    const text = getAutosaveText()
    const nextSnapshot = getSnapshot(name, text)

    if (nextSnapshot === lastPersistedSnapshot.value) {
      return
    }

    isSavingToLocalStorage.value = true
    persistSchemaToBrowser(name, text, {
      closeDialog: false
    })
    await nextTick()
    isSavingToLocalStorage.value = false
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
