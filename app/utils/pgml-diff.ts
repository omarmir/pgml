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
  normalizePgmlCompareRoutineValue,
  normalizePgmlCompareSequenceValue,
  normalizePgmlCompareSequenceMetadataEntries,
  normalizePgmlCompareTriggerValue
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

const normalizeRoutineValue = (routine: PgmlRoutine) => {
  return normalizePgmlCompareRoutineValue(routine)
}

const normalizeRoutineMaterialSignature = (signature: string) => {
  const parameterIndex = signature.indexOf('(')

  if (parameterIndex < 0) {
    return signature
  }

  return signature.slice(parameterIndex)
}

const normalizeRoutineMaterialValue = (routine: PgmlRoutine) => {
  const normalizedRoutine = normalizeRoutineValue(routine)

  return {
    ...normalizedRoutine,
    name: null,
    signature: normalizeRoutineMaterialSignature(normalizedRoutine.signature)
  }
}

const normalizeExecutableSourceName = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return value
  }

  return {
    ...(value as Record<string, unknown>),
    name: null
  }
}

const normalizeTriggerValue = (trigger: PgmlTrigger) => {
  const normalizedTrigger = normalizePgmlCompareTriggerValue(trigger)

  return {
    ...normalizedTrigger,
    source: normalizeExecutableSourceName(normalizedTrigger.source)
  }
}

const normalizeTriggerMaterialValue = (trigger: PgmlTrigger) => {
  const normalizedTrigger = normalizeTriggerValue(trigger)

  return {
    ...normalizedTrigger,
    name: null,
    source: normalizeExecutableSourceName(normalizedTrigger.source)
  }
}

const normalizeSequenceValue = (
  sequence: PgmlSequence,
  normalizeType: (value: string) => string
) => {
  const normalizedSequence = normalizePgmlCompareSequenceValue(sequence, normalizeType)

  return {
    ...normalizedSequence,
    source: normalizeExecutableSourceName(normalizedSequence.source)
  }
}

const normalizeSequenceMaterialValue = (
  sequence: PgmlSequence,
  normalizeType: (value: string) => string
) => {
  const normalizedSequence = normalizeSequenceValue(sequence, normalizeType)

  return {
    ...normalizedSequence,
    name: null,
    source: normalizeExecutableSourceName(normalizedSequence.source)
  }
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

const normalizeIndexMaterialValue = (value: {
  index: PgmlIndex
  tableId: string
}) => {
  const normalizedIndex = normalizeIndexValue(value.index)

  return {
    ...normalizedIndex,
    name: null,
    tableId: value.tableId
  }
}

const normalizeConstraintValue = (constraint: PgmlConstraint) => {
  return {
    expression: normalizePgmlCompareConstraintExpression(constraint.expression),
    name: constraint.name
  }
}

const normalizeConstraintMaterialValue = (value: {
  constraint: PgmlConstraint
  tableId: string
}) => {
  const normalizedConstraint = normalizeConstraintValue(value.constraint)

  return {
    ...normalizedConstraint,
    name: null,
    tableId: value.tableId
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

const normalizeReferenceValueForSuppression = (reference: PgmlReference) => {
  const normalizedReference = normalizeReferenceValue(reference)

  return {
    ...normalizedReference,
    fromColumn: normalizedReference.fromColumn.toLowerCase(),
    fromColumns: normalizedReference.fromColumns.map(columnName => columnName.toLowerCase()),
    fromTable: normalizeQualifiedEntityName(normalizedReference.fromTable),
    toColumn: normalizedReference.toColumn.toLowerCase(),
    toColumns: normalizedReference.toColumns.map(columnName => columnName.toLowerCase()),
    toTable: normalizeQualifiedEntityName(normalizedReference.toTable)
  }
}

const normalizeQualifiedEntityName = (value: string) => {
  const normalizedValue = value.replaceAll('"', '').trim().toLowerCase()

  if (normalizedValue.length === 0) {
    return normalizedValue
  }

  return normalizedValue.includes('.') ? normalizedValue : `public.${normalizedValue}`
}

const parseForeignKeyReferenceAction = (
  value: string,
  action: 'delete' | 'update'
) => {
  const normalizedValue = value.trim()
  const actionPattern = action === 'delete'
    ? /\bon\s+delete\s+(.+?)(?=\s+on\s+update\b|$)/iu
    : /\bon\s+update\s+(.+?)(?=\s+on\s+delete\b|$)/iu
  const matched = normalizedValue.match(actionPattern)

  if (!matched?.[1]) {
    return null
  }

  return matched[1].trim().toLowerCase()
}

const normalizeForeignKeyConstraintAsReferenceValue = (value: {
  constraint: PgmlConstraint
  tableId: string
}) => {
  const normalizedExpression = normalizeConstraintValue(value.constraint).expression
  const matched = normalizedExpression.match(/^foreign key\s*\((.+)\)\s+references\s+([^\s(]+)\s*\((.+)\)(.*)$/iu)

  if (!matched) {
    return null
  }

  const fromColumns = matched[1]
    .split(',')
    .map(columnName => columnName.replaceAll('"', '').trim().toLowerCase())
    .filter(columnName => columnName.length > 0)
  const toColumns = matched[3]
    .split(',')
    .map(columnName => columnName.replaceAll('"', '').trim().toLowerCase())
    .filter(columnName => columnName.length > 0)

  if (fromColumns.length === 0 || toColumns.length === 0) {
    return null
  }

  return normalizeReferenceValueForSuppression({
    fromColumn: fromColumns[0] || '',
    fromColumns,
    fromTable: normalizeQualifiedEntityName(value.tableId),
    name: value.constraint.name,
    onDelete: parseForeignKeyReferenceAction(matched[4] || '', 'delete'),
    onUpdate: parseForeignKeyReferenceAction(matched[4] || '', 'update'),
    relation: '>',
    sourceRange: undefined,
    toColumn: toColumns[0] || '',
    toColumns,
    toTable: normalizeQualifiedEntityName(matched[2] || '')
  })
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

const pairDiffEntriesByMaterial = <T>(input: {
  buildLabel: (id: string, value: T) => string
  entries: PgmlDiffEntry<T>[]
  normalizeMaterialValue: (value: T) => unknown
  normalizeValue: (value: T) => unknown
}) => {
  const removedIndexesByMaterial = new Map<string, number[]>()
  const addedIndexesByMaterial = new Map<string, number[]>()

  input.entries.forEach((entry, index) => {
    if (entry.kind === 'removed' && entry.before) {
      const materialKey = toStableJson(input.normalizeMaterialValue(entry.before))
      const indexes = removedIndexesByMaterial.get(materialKey) || []
      indexes.push(index)
      removedIndexesByMaterial.set(materialKey, indexes)
    }

    if (entry.kind === 'added' && entry.after) {
      const materialKey = toStableJson(input.normalizeMaterialValue(entry.after))
      const indexes = addedIndexesByMaterial.get(materialKey) || []
      indexes.push(index)
      addedIndexesByMaterial.set(materialKey, indexes)
    }
  })

  const replacementEntries = new Map<number, PgmlDiffEntry<T>>()
  const consumedIndexes = new Set<number>()

  removedIndexesByMaterial.forEach((removedIndexes, materialKey) => {
    const addedIndexes = addedIndexesByMaterial.get(materialKey) || []

    if (removedIndexes.length !== 1 || addedIndexes.length !== 1) {
      return
    }

    const removedIndex = removedIndexes[0]
    const addedIndex = addedIndexes[0]

    if (removedIndex === undefined || addedIndex === undefined) {
      return
    }

    const removedEntry = input.entries[removedIndex]
    const addedEntry = input.entries[addedIndex]

    if (
      !removedEntry
      || !addedEntry
      || removedEntry.kind !== 'removed'
      || addedEntry.kind !== 'added'
      || !removedEntry.before
      || !addedEntry.after
    ) {
      return
    }

    const normalizedBeforeValue = input.normalizeValue(removedEntry.before)
    const normalizedAfterValue = input.normalizeValue(addedEntry.after)
    const replacementIndex = Math.min(removedIndex, addedIndex)

    replacementEntries.set(replacementIndex, {
      after: addedEntry.after,
      before: removedEntry.before,
      changes: buildChangedFields(normalizedBeforeValue, normalizedAfterValue),
      id: addedEntry.id,
      kind: 'modified',
      label: input.buildLabel(addedEntry.id, addedEntry.after)
    })
    consumedIndexes.add(removedIndex)
    consumedIndexes.add(addedIndex)
  })

  return input.entries.reduce<PgmlDiffEntry<T>[]>((entries, entry, index) => {
    const replacementEntry = replacementEntries.get(index)

    if (replacementEntry) {
      entries.push(replacementEntry)
      return entries
    }

    if (consumedIndexes.has(index)) {
      return entries
    }

    entries.push(entry)
    return entries
  }, [])
}

const suppressEquivalentReferenceConstraintNoise = (input: {
  constraints: PgmlDiffEntry<{
    constraint: PgmlConstraint
    tableId: string
  }>[]
  references: PgmlDiffEntry<PgmlReference>[]
}) => {
  const removableReferenceIndexes = new Set<number>()
  const removableConstraintIndexes = new Set<number>()
  const referenceIndexesByKindAndValue = new Map<string, number[]>()
  const constraintIndexesByKindAndValue = new Map<string, number[]>()

  input.references.forEach((entry, index) => {
    const referenceValue = entry.kind === 'removed'
      ? entry.before
      : entry.kind === 'added'
        ? entry.after
        : null

    if (!referenceValue) {
      return
    }

    const key = `${entry.kind}::${toStableJson(normalizeReferenceValueForSuppression(referenceValue))}`
    const indexes = referenceIndexesByKindAndValue.get(key) || []
    indexes.push(index)
    referenceIndexesByKindAndValue.set(key, indexes)
  })

  input.constraints.forEach((entry, index) => {
    const constraintValue = entry.kind === 'removed'
      ? entry.before
      : entry.kind === 'added'
        ? entry.after
        : null
    const normalizedReferenceValue = constraintValue
      ? normalizeForeignKeyConstraintAsReferenceValue(constraintValue)
      : null

    if (!normalizedReferenceValue) {
      return
    }

    const oppositeKind = entry.kind === 'added'
      ? 'removed'
      : entry.kind === 'removed'
        ? 'added'
        : null

    if (!oppositeKind) {
      return
    }

    const key = `${oppositeKind}::${toStableJson(normalizedReferenceValue)}`
    const indexes = constraintIndexesByKindAndValue.get(key) || []
    indexes.push(index)
    constraintIndexesByKindAndValue.set(key, indexes)
  })

  referenceIndexesByKindAndValue.forEach((referenceIndexes, key) => {
    const constraintIndexes = constraintIndexesByKindAndValue.get(key) || []

    if (referenceIndexes.length !== 1 || constraintIndexes.length !== 1) {
      return
    }

    const referenceIndex = referenceIndexes[0]
    const constraintIndex = constraintIndexes[0]

    if (referenceIndex === undefined || constraintIndex === undefined) {
      return
    }

    removableReferenceIndexes.add(referenceIndex)
    removableConstraintIndexes.add(constraintIndex)
  })

  return {
    constraints: input.constraints.filter((_entry, index) => !removableConstraintIndexes.has(index)),
    references: input.references.filter((_entry, index) => !removableReferenceIndexes.has(index))
  }
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
  const pairedFunctions = pairDiffEntriesByMaterial({
    buildLabel: (id, value) => value.name || id,
    entries: functions,
    normalizeMaterialValue: normalizeRoutineMaterialValue,
    normalizeValue: normalizeRoutineValue
  })
  const procedures = buildDiffEntries(
    buildRoutineMap(beforeModel.procedures),
    buildRoutineMap(afterModel.procedures),
    (id, value) => value.name || id,
    normalizeRoutineValue
  )
  const pairedProcedures = pairDiffEntriesByMaterial({
    buildLabel: (id, value) => value.name || id,
    entries: procedures,
    normalizeMaterialValue: normalizeRoutineMaterialValue,
    normalizeValue: normalizeRoutineValue
  })
  const triggers = buildDiffEntries(
    buildTriggerMap(beforeModel.triggers),
    buildTriggerMap(afterModel.triggers),
    (_id, value) => `${value.tableName} :: ${value.name}`,
    normalizeTriggerValue
  )
  const pairedTriggers = pairDiffEntriesByMaterial({
    buildLabel: (_id, value) => `${value.tableName} :: ${value.name}`,
    entries: triggers,
    normalizeMaterialValue: normalizeTriggerMaterialValue,
    normalizeValue: normalizeTriggerValue
  })
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
  const pairedSequences = pairDiffEntriesByMaterial({
    buildLabel: (id, value) => value.name || id,
    entries: sequences,
    normalizeMaterialValue: value => normalizeSequenceMaterialValue(value, normalizeCompareTypeExpression),
    normalizeValue: value => normalizeSequenceValue(value, normalizeCompareTypeExpression)
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
  const pairedIndexes = pairDiffEntriesByMaterial({
    buildLabel: (_id, value) => `${value.tableId}.${value.index.name}`,
    entries: indexes,
    normalizeMaterialValue: normalizeIndexMaterialValue,
    normalizeValue: value => normalizeIndexValue(value.index)
  })
  const constraints = buildDiffEntries(
    buildConstraintMap(beforeModel.tables),
    buildConstraintMap(afterModel.tables),
    (_id, value) => `${value.tableId}.${value.constraint.name}`,
    value => normalizeConstraintValue(value.constraint)
  )
  const pairedConstraints = pairDiffEntriesByMaterial({
    buildLabel: (_id, value) => `${value.tableId}.${value.constraint.name}`,
    entries: constraints,
    normalizeMaterialValue: normalizeConstraintMaterialValue,
    normalizeValue: value => normalizeConstraintValue(value.constraint)
  })
  const compareEntriesWithoutReferenceConstraintNoise = suppressEquivalentReferenceConstraintNoise({
    constraints: pairedConstraints,
    references
  })
  const layout = buildDiffEntries(
    buildLayoutMap(beforeModel.nodeProperties),
    buildLayoutMap(afterModel.nodeProperties),
    id => id,
    normalizeLayoutValue
  )
  const schemaEntries = [
    ...tables,
    ...groups,
    ...pairedFunctions,
    ...pairedProcedures,
    ...pairedTriggers,
    ...pairedSequences,
    ...customTypes,
    ...compareEntriesWithoutReferenceConstraintNoise.references,
    ...columns,
    ...pairedIndexes,
    ...compareEntriesWithoutReferenceConstraintNoise.constraints
  ]
  const summary = buildDiffSummary(schemaEntries, layout)

  return {
    columns,
    constraints: compareEntriesWithoutReferenceConstraintNoise.constraints,
    customTypes,
    functions: pairedFunctions,
    groups,
    indexes: pairedIndexes,
    layout,
    procedures: pairedProcedures,
    references: compareEntriesWithoutReferenceConstraintNoise.references,
    sequences: pairedSequences,
    summary,
    tables,
    triggers: pairedTriggers
  }
}
