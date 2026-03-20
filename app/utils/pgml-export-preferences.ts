import { readBrowserStorageItem, writeBrowserStorageItem } from './browser-storage'
import type { PgmlExportPreferences } from './pgml-export'
import { defaultPgmlExportPreferences } from './pgml-export'

const exportPreferencesStorageKey = 'pgml-export-preferences-v1'

const isExportFormat = (value: unknown): value is PgmlExportPreferences['format'] => {
  return value === 'sql' || value === 'kysely'
}

const isKyselyTypeStyle = (value: unknown): value is PgmlExportPreferences['kyselyTypeStyle'] => {
  return value === 'pragmatic' || value === 'strict' || value === 'loose'
}

const parseStoredExportPreferences = (value: string | null) => {
  if (!value) {
    return {}
  }

  try {
    const parsed = JSON.parse(value) as unknown

    if (!parsed || typeof parsed !== 'object') {
      return {}
    }

    return parsed as Record<string, Partial<PgmlExportPreferences>>
  } catch {
    return {}
  }
}

export const readPgmlExportPreferences = (schemaKey: string) => {
  const entries = parseStoredExportPreferences(readBrowserStorageItem(exportPreferencesStorageKey))
  const storedPreferences = entries[schemaKey]

  return {
    format: isExportFormat(storedPreferences?.format) ? storedPreferences.format : defaultPgmlExportPreferences.format,
    kyselyTypeStyle: isKyselyTypeStyle(storedPreferences?.kyselyTypeStyle)
      ? storedPreferences.kyselyTypeStyle
      : defaultPgmlExportPreferences.kyselyTypeStyle
  } satisfies PgmlExportPreferences
}

export const writePgmlExportPreferences = (schemaKey: string, preferences: PgmlExportPreferences) => {
  const entries = parseStoredExportPreferences(readBrowserStorageItem(exportPreferencesStorageKey))

  entries[schemaKey] = {
    format: preferences.format,
    kyselyTypeStyle: preferences.kyselyTypeStyle
  }

  return writeBrowserStorageItem(exportPreferencesStorageKey, JSON.stringify(entries))
}
