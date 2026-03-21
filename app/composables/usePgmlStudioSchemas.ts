import type { ComputedRef, Ref } from 'vue'
import { watchDebounced } from '@vueuse/core'
import { nanoid } from 'nanoid'
import { readBrowserStorageItem, writeBrowserStorageItem } from '../utils/browser-storage'

export type SavedPgmlSchema = {
  id: string
  name: string
  text: string
  updatedAt: string
}

export type PgmlStudioSchemaDialogMode = 'save' | 'download'

export const savedSchemaStorageKey = 'pgml-studio-schemas-v1'
export const exampleSchemaName = 'Example schema'
export const untitledSchemaName = 'Untitled schema'
const schemaAutosaveDebounceMs = 5000
const localStorageSaveErrorMessage = 'Unable to save to local storage.'

export const orderSavedSchemas = (schemas: SavedPgmlSchema[]) => {
  return [...schemas].sort((left, right) => {
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  })
}

const isSavedPgmlSchema = (value: unknown): value is SavedPgmlSchema => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<SavedPgmlSchema>

  return (
    typeof candidate.id === 'string'
    && typeof candidate.name === 'string'
    && typeof candidate.text === 'string'
    && typeof candidate.updatedAt === 'string'
  )
}

export const parseSavedPgmlSchemas = (rawValue: string | null) => {
  if (!rawValue) {
    return []
  }

  try {
    const parsedValue = JSON.parse(rawValue) as unknown

    if (!Array.isArray(parsedValue)) {
      return []
    }

    return parsedValue.filter(isSavedPgmlSchema)
  } catch {
    return []
  }
}

export const normalizeSchemaName = (value: string) => {
  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : untitledSchemaName
}

export const slugifySchemaName = (value: string) => {
  const slug = normalizeSchemaName(value)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')

  return slug.length > 0 ? slug : 'schema'
}

export const readSavedPgmlSchemasFromBrowserStorage = () => {
  return orderSavedSchemas(parseSavedPgmlSchemas(readBrowserStorageItem(savedSchemaStorageKey)))
}
export const persistSavedPgmlSchemasToBrowserStorage = (schemas: SavedPgmlSchema[]) => {
  return writeBrowserStorageItem(savedSchemaStorageKey, JSON.stringify(schemas))
}

export const formatSavedPgmlSchemaTime = (value: string) => {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return 'Unknown time'
  }

  return new Intl.DateTimeFormat('en-CA', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
}

export const downloadSchemaText = (name: string, text: string) => {
  if (!import.meta.client) {
    return
  }

  const blob = new Blob([text], {
    type: 'text/plain;charset=utf-8'
  })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = objectUrl
  anchor.download = `${slugifySchemaName(name)}.pgml`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
  }, 0)
}

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
  const currentSchemaId: Ref<string | null> = ref(null)
  const currentSchemaName: Ref<string> = ref(exampleSchemaName)
  const currentSchemaUpdatedAt: Ref<string | null> = ref(null)
  const schemaDialogOpen: Ref<boolean> = ref(false)
  const loadDialogOpen: Ref<boolean> = ref(false)
  const schemaDialogMode: Ref<PgmlStudioSchemaDialogMode> = ref('save')
  const includeLayoutInSchema: Ref<boolean> = ref(true)
  const isSavingToLocalStorage: Ref<boolean> = ref(false)
  const localStorageSaveError: Ref<string | null> = ref(null)
  const lastPersistedSnapshot: Ref<string | null> = ref(null)
  const savedSchemas: Ref<SavedPgmlSchema[]> = ref([])
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
    savedSchemas.value = readSavedPgmlSchemasFromBrowserStorage()
    localStorageSaveError.value = null
  }

  const persistSavedSchemas = (schemas: SavedPgmlSchema[]) => {
    return persistSavedPgmlSchemasToBrowserStorage(schemas)
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
    schemaDialogMode.value = mode
    saveSchemaTargetId.value = mode === 'save' ? currentSchemaId.value : null
    schemaDialogOpen.value = true
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
      schemaDialogOpen.value = false
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
    schemaDialogOpen.value = false
  }

  const loadSavedSchema = (schema: SavedPgmlSchema) => {
    source.value = schema.text
    syncPersistedState(schema)
    loadDialogOpen.value = false
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
    currentSchemaId,
    currentSchemaName,
    currentSchemaUpdatedAt,
    deleteSavedSchema,
    downloadSchema,
    clearSaveSchemaTarget,
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
