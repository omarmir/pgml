import type { ComputedRef, Ref } from 'vue'
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
  const schemaDialogOpen: Ref<boolean> = ref(false)
  const loadDialogOpen: Ref<boolean> = ref(false)
  const schemaDialogMode: Ref<PgmlStudioSchemaDialogMode> = ref('save')
  const includeLayoutInSchema: Ref<boolean> = ref(true)
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
    return [...savedSchemas.value].sort((left, right) => {
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
    })
  })

  const loadExample = () => {
    source.value = initialSource
    currentSchemaId.value = null
    currentSchemaName.value = exampleSchemaName
    saveSchemaTargetId.value = null
  }

  const clearSchema = () => {
    source.value = ''
    currentSchemaId.value = null
    currentSchemaName.value = untitledSchemaName
    saveSchemaTargetId.value = null
  }

  const readSavedSchemas = () => {
    savedSchemas.value = parseSavedPgmlSchemas(readBrowserStorageItem(savedSchemaStorageKey))
  }

  const persistSavedSchemas = () => {
    writeBrowserStorageItem(savedSchemaStorageKey, JSON.stringify(savedSchemas.value))
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

  const saveSchemaToBrowser = () => {
    const name = normalizeSchemaName(currentSchemaName.value)
    const text = buildSchemaText(includeLayoutInSchema.value)
    const updatedAt = new Date().toISOString()
    const matchingSchema = savedSchemas.value.find((entry) => {
      return entry.id === saveSchemaTargetId.value || (!saveSchemaTargetId.value && entry.name.toLowerCase() === name.toLowerCase())
    })

    if (matchingSchema) {
      matchingSchema.name = name
      matchingSchema.text = text
      matchingSchema.updatedAt = updatedAt
      currentSchemaId.value = matchingSchema.id
      saveSchemaTargetId.value = matchingSchema.id
    } else {
      const nextSchema: SavedPgmlSchema = {
        id: nanoid(),
        name,
        text,
        updatedAt
      }

      savedSchemas.value = [nextSchema, ...savedSchemas.value]
      currentSchemaId.value = nextSchema.id
      saveSchemaTargetId.value = nextSchema.id
    }

    currentSchemaName.value = name
    persistSavedSchemas()
    schemaDialogOpen.value = false
  }

  const downloadSchema = () => {
    const name = normalizeSchemaName(currentSchemaName.value)
    const text = buildSchemaText(includeLayoutInSchema.value)

    currentSchemaName.value = name
    downloadSchemaText(name, text)
    schemaDialogOpen.value = false
  }

  const loadSavedSchema = (schema: SavedPgmlSchema) => {
    currentSchemaId.value = schema.id
    currentSchemaName.value = schema.name
    saveSchemaTargetId.value = schema.id
    source.value = schema.text
    loadDialogOpen.value = false
  }

  const deleteSavedSchema = (schemaId: string) => {
    savedSchemas.value = savedSchemas.value.filter(entry => entry.id !== schemaId)

    if (currentSchemaId.value === schemaId) {
      currentSchemaId.value = null
    }

    if (saveSchemaTargetId.value === schemaId) {
      saveSchemaTargetId.value = null
    }

    persistSavedSchemas()
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

  onMounted(() => {
    readSavedSchemas()
  })

  return {
    clearSchema,
    currentSchemaId,
    currentSchemaName,
    deleteSavedSchema,
    downloadSchema,
    clearSaveSchemaTarget,
    formatSavedAt,
    includeLayoutInSchema,
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
