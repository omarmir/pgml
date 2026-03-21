import { readBrowserStorageItem, writeBrowserStorageItem } from './browser-storage'

export type SavedPgmlSchema = {
  id: string
  name: string
  text: string
  updatedAt: string
}

export const savedSchemaStorageKey = 'pgml-studio-schemas-v1'
export const exampleSchemaName = 'Example schema'
export const untitledSchemaName = 'Untitled schema'

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
