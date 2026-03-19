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

const savedSchemaStorageKey = 'pgml-studio-schemas-v1'
const exampleSchemaName = 'Example schema'
const untitledSchemaName = 'Untitled schema'
const schemaAutosaveDebounceMs = 5000
const localStorageSaveErrorMessage = 'Unable to save to local storage.'

const orderSavedSchemas = (schemas: SavedPgmlSchema[]) => {
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

type UsePgmlStudioSchemasOptions = {
  buildSchemaText: (includeLayout: boolean) => string
  canEmbedLayout: ComputedRef<boolean>
  initialSource: string
  source: Ref<string>
}

export const usePgmlStudioSchemas = ({
  buildSchemaText,
  canEmbedLayout,
  initialSource,
  source
}: UsePgmlStudioSchemasOptions) => {
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
  const hasPendingLocalChanges = computed(() => {
    return lastPersistedSnapshot.value !== getCurrentSnapshot()
  })
  const isSavedToLocalStorage = computed(() => {
    return currentSchemaId.value !== null && !hasPendingLocalChanges.value
  })

  const loadExample = () => {
    source.value = initialSource
    currentSchemaId.value = null
    currentSchemaName.value = exampleSchemaName
    currentSchemaUpdatedAt.value = null
    localStorageSaveError.value = null
    lastPersistedSnapshot.value = null
    saveSchemaTargetId.value = null
  }

  const clearSchema = () => {
    source.value = ''
    currentSchemaId.value = null
    currentSchemaName.value = untitledSchemaName
    currentSchemaUpdatedAt.value = null
    localStorageSaveError.value = null
    lastPersistedSnapshot.value = null
    saveSchemaTargetId.value = null
  }

  const readSavedSchemas = () => {
    savedSchemas.value = parseSavedPgmlSchemas(readBrowserStorageItem(savedSchemaStorageKey))
    localStorageSaveError.value = null
  }

  const persistSavedSchemas = (schemas: SavedPgmlSchema[]) => {
    return writeBrowserStorageItem(savedSchemaStorageKey, JSON.stringify(schemas))
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

  const downloadSchemaText = (name: string, text: string) => {
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

  const persistSchemaToBrowser = (
    name: string,
    text: string,
    options: {
      closeDialog: boolean
    }
  ) => {
    const updatedAt = new Date().toISOString()
    const matchingSchema = savedSchemas.value.find((entry) => {
      return (
        entry.id === saveSchemaTargetId.value
        || entry.id === currentSchemaId.value
        || (
          !saveSchemaTargetId.value
          && !currentSchemaId.value
          && entry.name.toLowerCase() === name.toLowerCase()
        )
      )
    })
    let nextSchema: SavedPgmlSchema
    let nextSavedSchemas: SavedPgmlSchema[]

    if (matchingSchema) {
      nextSchema = {
        ...matchingSchema,
        name,
        text,
        updatedAt
      }
      nextSavedSchemas = savedSchemas.value.map((entry) => {
        return entry.id === nextSchema.id ? nextSchema : entry
      })
    } else {
      nextSchema = {
        id: nanoid(),
        name,
        text,
        updatedAt
      }
      nextSavedSchemas = [nextSchema, ...savedSchemas.value]
    }

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
    persistSchemaToBrowser(name, text, {
      closeDialog: true
    })
    await nextTick()
    isSavingToLocalStorage.value = false
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

  const formatSavedAt = (value: string) => {
    const date = new Date(value)

    if (Number.isNaN(date.getTime())) {
      return 'Unknown time'
    }

    return new Intl.DateTimeFormat('en-CA', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(date)
  }

  if (import.meta.client) {
    readSavedSchemas()
    const latestSavedSchema = orderSavedSchemas(savedSchemas.value)[0]

    if (latestSavedSchema) {
      source.value = latestSavedSchema.text
      syncPersistedState(latestSavedSchema)
    }
  }

  watchDebounced([source, currentSchemaName], async () => {
    if (!import.meta.client) {
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
