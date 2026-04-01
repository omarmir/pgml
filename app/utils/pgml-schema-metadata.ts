import type { PgmlMetadataEntry, PgmlSchemaModel } from './pgml'

export type PgmlDocumentTableSchemaMetadata = {
  entries: PgmlMetadataEntry[]
  tableId: string
}

export type PgmlDocumentColumnSchemaMetadata = {
  columnName: string
  entries: PgmlMetadataEntry[]
  tableId: string
}

export type PgmlDocumentSchemaMetadata = {
  columns: PgmlDocumentColumnSchemaMetadata[]
  tables: PgmlDocumentTableSchemaMetadata[]
}

const trimMetadataValue = (value: string) => value.trim()

const normalizeMetadataEntries = (entries: PgmlMetadataEntry[]) => {
  return entries.map((entry) => {
    return {
      key: trimMetadataValue(entry.key),
      value: trimMetadataValue(entry.value)
    } satisfies PgmlMetadataEntry
  }).filter(entry => entry.key.length > 0)
}

const normalizeTableSchemaMetadataBlock = (
  entry: PgmlDocumentTableSchemaMetadata
): PgmlDocumentTableSchemaMetadata | null => {
  const normalizedTableId = trimMetadataValue(entry.tableId)
  const normalizedEntries = normalizeMetadataEntries(entry.entries)

  if (normalizedTableId.length === 0 || normalizedEntries.length === 0) {
    return null
  }

  return {
    entries: normalizedEntries,
    tableId: normalizedTableId
  }
}

const normalizeColumnSchemaMetadataBlock = (
  entry: PgmlDocumentColumnSchemaMetadata
): PgmlDocumentColumnSchemaMetadata | null => {
  const normalizedTableId = trimMetadataValue(entry.tableId)
  const normalizedColumnName = trimMetadataValue(entry.columnName)
  const normalizedEntries = normalizeMetadataEntries(entry.entries)

  if (
    normalizedTableId.length === 0
    || normalizedColumnName.length === 0
    || normalizedEntries.length === 0
  ) {
    return null
  }

  return {
    columnName: normalizedColumnName,
    entries: normalizedEntries,
    tableId: normalizedTableId
  }
}

const replaceMetadataBlock = <T>(
  entries: T[],
  nextEntry: T | null,
  matches: (entry: T) => boolean
) => {
  const remainingEntries = entries.filter(entry => !matches(entry))

  return nextEntry ? [...remainingEntries, nextEntry] : remainingEntries
}

const getTableMetadataEntries = (
  schemaMetadata: PgmlDocumentSchemaMetadata,
  tableId: string
) => {
  return schemaMetadata.tables.find(entry => entry.tableId === tableId)?.entries || []
}

const getColumnMetadataEntries = (
  schemaMetadata: PgmlDocumentSchemaMetadata,
  tableId: string,
  columnName: string
) => {
  return schemaMetadata.columns.find((entry) => {
    return entry.tableId === tableId && entry.columnName === columnName
  })?.entries || []
}

const sortTableMetadataBlocks = (
  left: PgmlDocumentTableSchemaMetadata,
  right: PgmlDocumentTableSchemaMetadata
) => {
  return left.tableId.localeCompare(right.tableId)
}

const sortColumnMetadataBlocks = (
  left: PgmlDocumentColumnSchemaMetadata,
  right: PgmlDocumentColumnSchemaMetadata
) => {
  if (left.tableId !== right.tableId) {
    return left.tableId.localeCompare(right.tableId)
  }

  return left.columnName.localeCompare(right.columnName)
}

export const createEmptyPgmlDocumentSchemaMetadata = (): PgmlDocumentSchemaMetadata => {
  return {
    columns: [],
    tables: []
  }
}

export const clonePgmlDocumentSchemaMetadata = (
  schemaMetadata: PgmlDocumentSchemaMetadata
): PgmlDocumentSchemaMetadata => {
  // SchemaMetadata sits outside the version graph, so every write path funnels
  // through the same normalization pass to keep serialization deterministic.
  return {
    columns: schemaMetadata.columns
      .map(normalizeColumnSchemaMetadataBlock)
      .filter((entry): entry is PgmlDocumentColumnSchemaMetadata => entry !== null)
      .sort(sortColumnMetadataBlocks),
    tables: schemaMetadata.tables
      .map(normalizeTableSchemaMetadataBlock)
      .filter((entry): entry is PgmlDocumentTableSchemaMetadata => entry !== null)
      .sort(sortTableMetadataBlocks)
  }
}

export const getPgmlTableSchemaMetadataEntries = (
  schemaMetadata: PgmlDocumentSchemaMetadata,
  tableId: string
) => {
  return normalizeMetadataEntries(getTableMetadataEntries(schemaMetadata, tableId))
}

export const getPgmlColumnSchemaMetadataEntries = (
  schemaMetadata: PgmlDocumentSchemaMetadata,
  tableId: string,
  columnName: string
) => {
  return normalizeMetadataEntries(getColumnMetadataEntries(schemaMetadata, tableId, columnName))
}

export const replacePgmlTableSchemaMetadataEntries = (
  schemaMetadata: PgmlDocumentSchemaMetadata,
  tableId: string,
  entries: PgmlMetadataEntry[]
) => {
  const normalizedTableId = trimMetadataValue(tableId)
  const nextEntry = normalizeTableSchemaMetadataBlock({
    entries,
    tableId: normalizedTableId
  })

  return clonePgmlDocumentSchemaMetadata({
    ...schemaMetadata,
    tables: replaceMetadataBlock(schemaMetadata.tables, nextEntry, entry => entry.tableId === normalizedTableId)
  })
}

export const replacePgmlColumnSchemaMetadataEntries = (
  schemaMetadata: PgmlDocumentSchemaMetadata,
  tableId: string,
  columnName: string,
  entries: PgmlMetadataEntry[]
) => {
  const normalizedTableId = trimMetadataValue(tableId)
  const normalizedColumnName = trimMetadataValue(columnName)
  const nextEntry = normalizeColumnSchemaMetadataBlock({
    columnName: normalizedColumnName,
    entries,
    tableId: normalizedTableId
  })

  return clonePgmlDocumentSchemaMetadata({
    ...schemaMetadata,
    columns: replaceMetadataBlock(schemaMetadata.columns, nextEntry, (entry) => {
      return entry.tableId === normalizedTableId && entry.columnName === normalizedColumnName
    })
  })
}

export const removePgmlSchemaMetadataForTable = (
  schemaMetadata: PgmlDocumentSchemaMetadata,
  tableId: string
) => {
  const normalizedTableId = trimMetadataValue(tableId)

  return clonePgmlDocumentSchemaMetadata({
    columns: schemaMetadata.columns.filter(entry => entry.tableId !== normalizedTableId),
    tables: schemaMetadata.tables.filter(entry => entry.tableId !== normalizedTableId)
  })
}

export const removePgmlColumnSchemaMetadataForTable = (
  schemaMetadata: PgmlDocumentSchemaMetadata,
  tableId: string
) => {
  const normalizedTableId = trimMetadataValue(tableId)

  return clonePgmlDocumentSchemaMetadata({
    ...schemaMetadata,
    columns: schemaMetadata.columns.filter(entry => entry.tableId !== normalizedTableId)
  })
}

export const applyPgmlDocumentSchemaMetadataToModel = (
  model: PgmlSchemaModel,
  schemaMetadata: PgmlDocumentSchemaMetadata
): PgmlSchemaModel => {
  // Metadata stays on the document root, but the editor and diagram interact
  // with hydrated table and column objects. This projection keeps those UIs
  // simple without duplicating persistence logic into every surface.
  return {
    ...model,
    tables: model.tables.map((table) => {
      return {
        ...table,
        columns: table.columns.map((column) => {
          return {
            ...column,
            customMetadata: getPgmlColumnSchemaMetadataEntries(
              schemaMetadata,
              table.fullName,
              column.name
            )
          }
        }),
        customMetadata: getPgmlTableSchemaMetadataEntries(schemaMetadata, table.fullName)
      }
    })
  }
}
