import type {
  PgmlConstraint,
  PgmlCustomType,
  PgmlGroup,
  PgmlIndex,
  PgmlNodeProperties,
  PgmlReference,
  PgmlRoutine,
  PgmlSchemaModel,
  PgmlSequence,
  PgmlTable,
  PgmlTrigger
} from './pgml'
import {
  buildPgmlImplicitSerialSequenceName,
  createPgmlCompareTypeExpressionNormalizer,
  normalizePgmlCompareColumnValue,
  normalizePgmlCompareConstraintExpression,
  normalizePgmlCompareCustomTypeName,
  normalizePgmlCompareSequenceValue,
  normalizePgmlCompareSequenceMetadataEntries
} from './pgml-compare-normalization'

export type PgmlDiffChangeKind = 'added' | 'modified' | 'removed'

export type PgmlDiffEntry<T> = {
  after: T | null
  before: T | null
  changes?: string[]
  id: string
  kind: PgmlDiffChangeKind
  label: string
}

export type PgmlLayoutDiffEntry = PgmlDiffEntry<PgmlNodeProperties>

export type PgmlSchemaDiffSummary = {
  added: number
  layoutChanged: number
  modified: number
  removed: number
}

export type PgmlSchemaDiff = {
  columns: PgmlDiffEntry<{
    column: PgmlTable['columns'][number]
    tableId: string
  }>[]
  constraints: PgmlDiffEntry<{
    constraint: PgmlConstraint
    tableId: string
  }>[]
  customTypes: PgmlDiffEntry<PgmlCustomType>[]
  functions: PgmlDiffEntry<PgmlRoutine>[]
  groups: PgmlDiffEntry<PgmlGroup>[]
  indexes: PgmlDiffEntry<{
    index: PgmlIndex
    tableId: string
  }>[]
  layout: PgmlLayoutDiffEntry[]
  procedures: PgmlDiffEntry<PgmlRoutine>[]
  references: PgmlDiffEntry<PgmlReference>[]
  sequences: PgmlDiffEntry<PgmlSequence>[]
  summary: PgmlSchemaDiffSummary
  tables: PgmlDiffEntry<PgmlTable>[]
  triggers: PgmlDiffEntry<PgmlTrigger>[]
}

// We compare normalized objects via stable JSON so different field ordering does
// not create false-positive diffs. That keeps formatting noise out of compare
// views and migration planning.
const isTransientDiffMetadataKey = (key: string) => {
  return key === 'sourceRange'
}

const toStableJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(entry => toStableJson(entry)).join(',')}]`
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key, entry]) => !isTransientDiffMetadataKey(key) && entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `"${key}":${toStableJson(entry)}`)

    return `{${entries.join(',')}}`
  }

  return JSON.stringify(value)
}

const sortStringValues = (values: string[]) => {
  return [...values].sort((left, right) => left.localeCompare(right))
}

const sortKeyValueEntries = (
  entries: Array<{
    key: string
    value: string
  }>
) => {
  return [...entries].sort((left, right) => {
    if (left.key !== right.key) {
      return left.key.localeCompare(right.key)
    }

    return left.value.localeCompare(right.value)
  })
}

const buildChangedFields = (beforeValue: unknown, afterValue: unknown) => {
  if (
    beforeValue === null
    || afterValue === null
    || Array.isArray(beforeValue)
    || Array.isArray(afterValue)
    || typeof beforeValue !== 'object'
    || typeof afterValue !== 'object'
  ) {
    return []
  }

  const beforeRecord = beforeValue as Record<string, unknown>
  const afterRecord = afterValue as Record<string, unknown>
  const fieldNames = Array.from(new Set([
    ...Object.keys(beforeRecord),
    ...Object.keys(afterRecord)
  ]))
    .filter(fieldName => !isTransientDiffMetadataKey(fieldName))
    .sort((left, right) => left.localeCompare(right))

  return fieldNames.filter((fieldName) => {
    return toStableJson(beforeRecord[fieldName]) !== toStableJson(afterRecord[fieldName])
  })
}

const buildSortedDiffIds = <T>(
  beforeValues: Map<string, T>,
  afterValues: Map<string, T>
) => {
  return Array.from(new Set([...beforeValues.keys(), ...afterValues.keys()])).sort((left, right) => {
    return left.localeCompare(right)
  })
}

const normalizeReferenceKey = (reference: PgmlReference) => {
  return [
    reference.relation,
    reference.fromTable,
    (reference.fromColumns && reference.fromColumns.length > 0 ? reference.fromColumns : [reference.fromColumn]).join(','),
    reference.toTable,
    (reference.toColumns && reference.toColumns.length > 0 ? reference.toColumns : [reference.toColumn]).join(',')
  ].join('::')
}

const normalizeTableValue = (table: PgmlTable) => {
  return {
    fullName: table.fullName,
    groupName: table.groupName,
    note: table.note
  }
}

const normalizeGroupTableName = (value: string) => {
  const cleanedValue = value.replaceAll('"', '').trim()

  if (cleanedValue.includes('.')) {
    return cleanedValue
  }

  return `public.${cleanedValue}`
}

const normalizeGroupValue = (group: PgmlGroup) => {
  return {
    name: group.name,
    note: group.note,
    tableNames: group.tableNames.map(normalizeGroupTableName).sort((left, right) => left.localeCompare(right))
  }
}

const normalizeMetadataEntries = (
  entries: Array<{
    key: string
    value: string
  }>
) => {
  return sortKeyValueEntries(entries.map((entry) => {
    return {
      key: entry.key,
      value: entry.value
    }
  }))
}

const normalizeDocumentationValue = (
  documentation: PgmlRoutine['docs'] | PgmlTrigger['docs'] | PgmlSequence['docs']
) => {
  if (!documentation) {
    return null
  }

  return {
    entries: sortKeyValueEntries(documentation.entries),
    summary: documentation.summary
  }
}

const normalizeAffectsValue = (affects: PgmlRoutine['affects'] | PgmlTrigger['affects'] | PgmlSequence['affects']) => {
  if (!affects) {
    return null
  }

  return {
    calls: sortStringValues(affects.calls),
    dependsOn: sortStringValues(affects.dependsOn),
    extras: [...affects.extras].map((entry) => {
      return {
        key: entry.key,
        values: sortStringValues(entry.values)
      }
    }).sort((left, right) => left.key.localeCompare(right.key)),
    ownedBy: sortStringValues(affects.ownedBy),
    reads: sortStringValues(affects.reads),
    sets: sortStringValues(affects.sets),
    uses: sortStringValues(affects.uses),
    writes: sortStringValues(affects.writes)
  }
}

const normalizeRoutineValue = (routine: PgmlRoutine) => {
  return {
    affects: normalizeAffectsValue(routine.affects),
    docs: normalizeDocumentationValue(routine.docs),
    metadata: normalizeMetadataEntries(routine.metadata),
    name: routine.name,
    signature: routine.signature,
    source: routine.source?.trim() || null
  }
}

const normalizeTriggerValue = (trigger: PgmlTrigger) => {
  return {
    affects: normalizeAffectsValue(trigger.affects),
    docs: normalizeDocumentationValue(trigger.docs),
    metadata: normalizeMetadataEntries(trigger.metadata),
    name: trigger.name,
    source: trigger.source?.trim() || null,
    tableName: trigger.tableName
  }
}

const normalizeSequenceValue = (
  sequence: PgmlSequence,
  normalizeType: (value: string) => string
) => {
  return normalizePgmlCompareSequenceValue(sequence, normalizeType)
}

const normalizeCustomTypeValue = (
  customType: PgmlCustomType,
  normalizeType: (value: string) => string
) => {
  if (customType.kind === 'Domain') {
    return {
      ...customType,
      baseType: customType.baseType ? normalizeType(customType.baseType) : null,
      name: normalizePgmlCompareCustomTypeName(customType.name, normalizeType)
    }
  }

  if (customType.kind === 'Composite') {
    return {
      ...customType,
      fields: customType.fields.map((field) => {
        return {
          ...field,
          type: normalizeType(field.type)
        }
      }),
      name: normalizePgmlCompareCustomTypeName(customType.name, normalizeType)
    }
  }

  return {
    ...customType,
    name: normalizePgmlCompareCustomTypeName(customType.name, normalizeType)
  }
}

const normalizeColumnValue = (
  value: {
    column: PgmlTable['columns'][number]
    tableId: string
  },
  normalizeType: (value: string) => string
) => {
  return normalizePgmlCompareColumnValue({
    column: value.column,
    normalizeType,
    tableId: value.tableId
  })
}

const isReferenceProjectionModifier = (modifier: string) => {
  return modifier.startsWith('ref:') || modifier.startsWith('delete:') || modifier.startsWith('update:')
}

const normalizeColumnValueWithoutReferenceProjection = (
  value: {
    column: PgmlTable['columns'][number]
    tableId: string
  },
  normalizeType: (value: string) => string
) => {
  return {
    ...normalizeColumnValue(value, normalizeType),
    modifiers: normalizeColumnValue(value, normalizeType).modifiers.filter(modifier => !isReferenceProjectionModifier(modifier)),
    reference: null
  }
}

const isReferenceOnlyColumnDiff = (
  entry: PgmlDiffEntry<{
    column: PgmlTable['columns'][number]
    tableId: string
  }>,
  normalizeType: (value: string) => string
) => {
  if (entry.kind !== 'modified' || !entry.before || !entry.after) {
    return false
  }

  return toStableJson(normalizeColumnValueWithoutReferenceProjection(entry.before, normalizeType))
    === toStableJson(normalizeColumnValueWithoutReferenceProjection(entry.after, normalizeType))
}

const normalizeIndexValue = (index: PgmlIndex) => {
  return {
    columns: [...index.columns],
    name: index.name,
    type: index.type
  }
}

const normalizeConstraintValue = (constraint: PgmlConstraint) => {
  return {
    expression: normalizePgmlCompareConstraintExpression(constraint.expression),
    name: constraint.name
  }
}

const normalizeReferenceValue = (reference: PgmlReference) => {
  return {
    fromColumn: reference.fromColumn,
    fromColumns: reference.fromColumns && reference.fromColumns.length > 0
      ? [...reference.fromColumns]
      : [reference.fromColumn],
    fromTable: reference.fromTable,
    onDelete: reference.onDelete,
    onUpdate: reference.onUpdate,
    relation: reference.relation,
    toColumn: reference.toColumn,
    toColumns: reference.toColumns && reference.toColumns.length > 0
      ? [...reference.toColumns]
      : [reference.toColumn],
    toTable: reference.toTable
  }
}

const normalizeLayoutValue = (value: PgmlNodeProperties) => {
  return value
}

// Diffing is only as stable as the identity keys that feed it. These helpers
// centralize how top-level schema entities are keyed so compare views and
// migration planning stay aligned.
const buildEntityMap = <T>(
  values: T[],
  getId: (value: T) => string
) => {
  return new Map(values.map(value => [getId(value), value] as const))
}

const buildDiffEntries = <T>(
  beforeValues: Map<string, T>,
  afterValues: Map<string, T>,
  buildLabel: (id: string, value: T) => string,
  normalizeValue: (value: T) => unknown
) => {
  const ids = buildSortedDiffIds(beforeValues, afterValues)

  return ids.reduce<PgmlDiffEntry<T>[]>((entries, id) => {
    const beforeValue = beforeValues.get(id) || null
    const afterValue = afterValues.get(id) || null

    if (beforeValue && !afterValue) {
      entries.push({
        after: null,
        before: beforeValue,
        id,
        kind: 'removed',
        label: buildLabel(id, beforeValue)
      })

      return entries
    }

    if (!beforeValue && afterValue) {
      entries.push({
        after: afterValue,
        before: null,
        id,
        kind: 'added',
        label: buildLabel(id, afterValue)
      })

      return entries
    }

    if (!beforeValue || !afterValue) {
      return entries
    }

    const normalizedBeforeValue = normalizeValue(beforeValue)
    const normalizedAfterValue = normalizeValue(afterValue)

    if (toStableJson(normalizedBeforeValue) !== toStableJson(normalizedAfterValue)) {
      entries.push({
        after: afterValue,
        before: beforeValue,
        changes: buildChangedFields(normalizedBeforeValue, normalizedAfterValue),
        id,
        kind: 'modified',
        label: buildLabel(id, afterValue)
      })
    }

    return entries
  }, [])
}

const buildTableMap = (tables: PgmlTable[]) => {
  return buildEntityMap(tables, table => table.fullName)
}

const buildGroupMap = (groups: PgmlGroup[]) => {
  return buildEntityMap(groups, group => group.name)
}

const buildRoutineMap = (routines: PgmlRoutine[]) => {
  return buildEntityMap(routines, routine => routine.name)
}

const buildTriggerMap = (triggers: PgmlTrigger[]) => {
  return buildEntityMap(triggers, trigger => `${trigger.tableName}::${trigger.name}`)
}

const buildSequenceMap = (sequences: PgmlSequence[]) => {
  return buildEntityMap(sequences, sequence => sequence.name)
}

const buildCustomTypeMap = (
  customTypes: PgmlCustomType[],
  normalizeType: (value: string) => string
) => {
  return buildEntityMap(customTypes, (customType) => {
    return `${customType.kind}::${normalizePgmlCompareCustomTypeName(customType.name, normalizeType)}`
  })
}

const buildReferenceMap = (references: PgmlReference[]) => {
  return buildEntityMap(references, normalizeReferenceKey)
}

const buildTableChildMap = <T, TEntry>(
  tables: PgmlTable[],
  getValues: (table: PgmlTable) => T[],
  getId: (table: PgmlTable, value: T) => string,
  buildEntry: (table: PgmlTable, value: T) => TEntry
) => {
  return new Map(tables.flatMap((table) => {
    return getValues(table).map((value) => {
      return [getId(table, value), buildEntry(table, value)] as const
    })
  }))
}

const buildColumnMap = (tables: PgmlTable[]) => {
  return buildTableChildMap(
    tables,
    table => table.columns,
    (table, column) => `${table.fullName}::${column.name}`,
    (table, column) => ({
      column,
      tableId: table.fullName
    })
  )
}

const buildIndexMap = (tables: PgmlTable[]) => {
  return buildTableChildMap(
    tables,
    table => table.indexes,
    (table, index) => `${table.fullName}::${index.name}`,
    (table, index) => ({
      index,
      tableId: table.fullName
    })
  )
}

const buildConstraintMap = (tables: PgmlTable[]) => {
  return buildTableChildMap(
    tables,
    table => table.constraints,
    (table, constraint) => `${table.fullName}::${constraint.name}`,
    (table, constraint) => ({
      constraint,
      tableId: table.fullName
    })
  )
}

const buildLayoutMap = (properties: Record<string, PgmlNodeProperties>) => {
  return new Map(Object.entries(properties))
}

const buildOwnedByColumnId = (value: string) => {
  const separatorIndex = value.lastIndexOf('.')

  if (separatorIndex < 0) {
    return null
  }

  return {
    columnName: value.slice(separatorIndex + 1),
    tableId: value.slice(0, separatorIndex)
  }
}

const isImplicitSerialSequenceValue = (input: {
  column: {
    column: PgmlTable['columns'][number]
    tableId: string
  }
  normalizeType: (value: string) => string
  sequence: PgmlSequence
}) => {
  if (
    input.sequence.docs
    || input.sequence.affects
    || (input.sequence.source?.trim().length || 0) > 0
  ) {
    return false
  }

  const expectedSequenceName = buildPgmlImplicitSerialSequenceName(
    input.column.tableId,
    input.column.column.name
  )

  if (input.sequence.name !== expectedSequenceName) {
    return false
  }

  const normalizedSequenceMetadata = normalizePgmlCompareSequenceMetadataEntries(
    input.sequence.metadata,
    input.normalizeType
  )
  const normalizedColumn = normalizeColumnValue(input.column, input.normalizeType)
  const normalizedDefault = normalizedColumn.modifiers.find(modifier => modifier.startsWith('default:'))
    ?.replace(/^default:\s*/u, '')
    .trim()

  if (normalizedDefault !== `nextval('${expectedSequenceName}')`) {
    return false
  }

  const expectedMetadata = normalizePgmlCompareSequenceMetadataEntries([
    {
      key: 'as',
      value: normalizedColumn.type
    },
    {
      key: 'owned_by',
      value: `${input.column.tableId}.${input.column.column.name}`
    }
  ], input.normalizeType)

  return toStableJson(normalizedSequenceMetadata) === toStableJson(expectedMetadata)
}

const isImplicitSerialSequenceOnlyDiff = (input: {
  afterColumns: Map<string, {
    column: PgmlTable['columns'][number]
    tableId: string
  }>
  beforeColumns: Map<string, {
    column: PgmlTable['columns'][number]
    tableId: string
  }>
  entry: PgmlDiffEntry<PgmlSequence>
  normalizeType: (value: string) => string
}) => {
  const sequence = input.entry.after || input.entry.before

  if (!sequence || input.entry.kind === 'modified') {
    return false
  }

  const normalizedMetadata = normalizePgmlCompareSequenceMetadataEntries(sequence.metadata, input.normalizeType)
  const ownedBy = normalizedMetadata.find(entry => entry.key === 'owned_by')?.value || null

  if (!ownedBy) {
    return false
  }

  const ownedByColumn = buildOwnedByColumnId(ownedBy)

  if (!ownedByColumn) {
    return false
  }

  const columnId = `${ownedByColumn.tableId}::${ownedByColumn.columnName}`
  const beforeColumn = input.beforeColumns.get(columnId) || null
  const afterColumn = input.afterColumns.get(columnId) || null

  if (!beforeColumn || !afterColumn) {
    return false
  }

  if (
    toStableJson(normalizeColumnValue(beforeColumn, input.normalizeType))
    !== toStableJson(normalizeColumnValue(afterColumn, input.normalizeType))
  ) {
    return false
  }

  const candidateColumn = input.entry.kind === 'added' ? afterColumn : beforeColumn
  const oppositeColumn = input.entry.kind === 'added' ? beforeColumn : afterColumn

  if (!getSerialBaseType(oppositeColumn.column.type)) {
    return false
  }

  return isImplicitSerialSequenceValue({
    column: candidateColumn,
    normalizeType: input.normalizeType,
    sequence
  })
}

const getSerialBaseType = (value: string) => {
  const normalizedValue = value.trim().toLowerCase()

  if (normalizedValue === 'bigserial' || normalizedValue === 'serial8') {
    return 'bigint'
  }

  if (normalizedValue === 'serial' || normalizedValue === 'serial4') {
    return 'integer'
  }

  if (normalizedValue === 'smallserial' || normalizedValue === 'serial2') {
    return 'smallint'
  }

  return null
}

const buildDiffSummary = (
  entries: PgmlDiffEntry<unknown>[],
  layoutEntries: PgmlLayoutDiffEntry[]
): PgmlSchemaDiffSummary => {
  return entries.reduce<PgmlSchemaDiffSummary>((totals, entry) => {
    if (entry.kind === 'added') {
      totals.added += 1
    } else if (entry.kind === 'removed') {
      totals.removed += 1
    } else {
      totals.modified += 1
    }

    return totals
  }, {
    added: 0,
    layoutChanged: layoutEntries.length,
    modified: 0,
    removed: 0
  })
}

export const diffPgmlSchemaModels = (
  beforeModel: PgmlSchemaModel,
  afterModel: PgmlSchemaModel
): PgmlSchemaDiff => {
  const normalizeCompareTypeExpression = createPgmlCompareTypeExpressionNormalizer([
    beforeModel,
    afterModel
  ])
  const beforeColumns = buildColumnMap(beforeModel.tables)
  const afterColumns = buildColumnMap(afterModel.tables)
  const tables = buildDiffEntries(
    buildTableMap(beforeModel.tables),
    buildTableMap(afterModel.tables),
    (id, value) => value.fullName || id,
    normalizeTableValue
  )
  const groups = buildDiffEntries(
    buildGroupMap(beforeModel.groups),
    buildGroupMap(afterModel.groups),
    (id, value) => value.name || id,
    normalizeGroupValue
  )
  const functions = buildDiffEntries(
    buildRoutineMap(beforeModel.functions),
    buildRoutineMap(afterModel.functions),
    (id, value) => value.name || id,
    normalizeRoutineValue
  )
  const procedures = buildDiffEntries(
    buildRoutineMap(beforeModel.procedures),
    buildRoutineMap(afterModel.procedures),
    (id, value) => value.name || id,
    normalizeRoutineValue
  )
  const triggers = buildDiffEntries(
    buildTriggerMap(beforeModel.triggers),
    buildTriggerMap(afterModel.triggers),
    (_id, value) => `${value.tableName} :: ${value.name}`,
    normalizeTriggerValue
  )
  const sequences = buildDiffEntries(
    buildSequenceMap(beforeModel.sequences),
    buildSequenceMap(afterModel.sequences),
    (id, value) => value.name || id,
    value => normalizeSequenceValue(value, normalizeCompareTypeExpression)
  ).filter((entry) => {
    return !isImplicitSerialSequenceOnlyDiff({
      afterColumns,
      beforeColumns,
      entry,
      normalizeType: normalizeCompareTypeExpression
    })
  })
  const customTypes = buildDiffEntries(
    buildCustomTypeMap(beforeModel.customTypes, normalizeCompareTypeExpression),
    buildCustomTypeMap(afterModel.customTypes, normalizeCompareTypeExpression),
    (id, value) => value.name || id,
    value => normalizeCustomTypeValue(value, normalizeCompareTypeExpression)
  )
  const references = buildDiffEntries(
    buildReferenceMap(beforeModel.references),
    buildReferenceMap(afterModel.references),
    (_id, value) => `${value.fromTable}.${value.fromColumn} -> ${value.toTable}.${value.toColumn}`,
    normalizeReferenceValue
  )
  const columns = buildDiffEntries(
    beforeColumns,
    afterColumns,
    (_id, value) => `${value.tableId}.${value.column.name}`,
    value => normalizeColumnValue(value, normalizeCompareTypeExpression)
  ).filter(entry => !isReferenceOnlyColumnDiff(entry, normalizeCompareTypeExpression))
  const indexes = buildDiffEntries(
    buildIndexMap(beforeModel.tables),
    buildIndexMap(afterModel.tables),
    (_id, value) => `${value.tableId}.${value.index.name}`,
    value => normalizeIndexValue(value.index)
  )
  const constraints = buildDiffEntries(
    buildConstraintMap(beforeModel.tables),
    buildConstraintMap(afterModel.tables),
    (_id, value) => `${value.tableId}.${value.constraint.name}`,
    value => normalizeConstraintValue(value.constraint)
  )
  const layout = buildDiffEntries(
    buildLayoutMap(beforeModel.nodeProperties),
    buildLayoutMap(afterModel.nodeProperties),
    id => id,
    normalizeLayoutValue
  )
  const schemaEntries = [
    ...tables,
    ...groups,
    ...functions,
    ...procedures,
    ...triggers,
    ...sequences,
    ...customTypes,
    ...references,
    ...columns,
    ...indexes,
    ...constraints
  ]
  const summary = buildDiffSummary(schemaEntries, layout)

  return {
    columns,
    constraints,
    customTypes,
    functions,
    groups,
    indexes,
    layout,
    procedures,
    references,
    sequences,
    summary,
    tables,
    triggers
  }
}
