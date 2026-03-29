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

const toStableJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(entry => toStableJson(entry)).join(',')}]`
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
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
  ])).sort((left, right) => left.localeCompare(right))

  return fieldNames.filter((fieldName) => {
    return toStableJson(beforeRecord[fieldName]) !== toStableJson(afterRecord[fieldName])
  })
}

const normalizeReferenceKey = (reference: PgmlReference) => {
  return [
    reference.relation,
    reference.fromTable,
    reference.fromColumn,
    reference.toTable,
    reference.toColumn
  ].join('::')
}

const normalizeTableValue = (table: PgmlTable) => {
  return {
    fullName: table.fullName,
    groupName: table.groupName,
    note: table.note
  }
}

const normalizeGroupValue = (group: PgmlGroup) => {
  return {
    name: group.name,
    note: group.note,
    tableNames: [...group.tableNames]
  }
}

const normalizeMetadataEntries = (
  entries: Array<{
    key: string
    value: string
  }>
) => {
  return [...entries]
    .map((entry) => {
      return {
        key: entry.key,
        value: entry.value
      }
    })
    .sort((left, right) => {
      if (left.key !== right.key) {
        return left.key.localeCompare(right.key)
      }

      return left.value.localeCompare(right.value)
    })
}

const normalizeDocumentationValue = (
  documentation: PgmlRoutine['docs'] | PgmlTrigger['docs'] | PgmlSequence['docs']
) => {
  if (!documentation) {
    return null
  }

  return {
    entries: [...documentation.entries].sort((left, right) => {
      if (left.key !== right.key) {
        return left.key.localeCompare(right.key)
      }

      return left.value.localeCompare(right.value)
    }),
    summary: documentation.summary
  }
}

const normalizeAffectsValue = (affects: PgmlRoutine['affects'] | PgmlTrigger['affects'] | PgmlSequence['affects']) => {
  if (!affects) {
    return null
  }

  return {
    calls: [...affects.calls].sort((left, right) => left.localeCompare(right)),
    dependsOn: [...affects.dependsOn].sort((left, right) => left.localeCompare(right)),
    extras: [...affects.extras].map((entry) => {
      return {
        key: entry.key,
        values: [...entry.values].sort((left, right) => left.localeCompare(right))
      }
    }).sort((left, right) => left.key.localeCompare(right.key)),
    ownedBy: [...affects.ownedBy].sort((left, right) => left.localeCompare(right)),
    reads: [...affects.reads].sort((left, right) => left.localeCompare(right)),
    sets: [...affects.sets].sort((left, right) => left.localeCompare(right)),
    uses: [...affects.uses].sort((left, right) => left.localeCompare(right)),
    writes: [...affects.writes].sort((left, right) => left.localeCompare(right))
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

const normalizeSequenceValue = (sequence: PgmlSequence) => {
  return {
    affects: normalizeAffectsValue(sequence.affects),
    docs: normalizeDocumentationValue(sequence.docs),
    metadata: normalizeMetadataEntries(sequence.metadata),
    name: sequence.name,
    source: sequence.source?.trim() || null
  }
}

const normalizeCustomTypeValue = (customType: PgmlCustomType) => {
  return customType
}

const normalizeColumnValue = (column: PgmlTable['columns'][number]) => {
  return {
    modifiers: [...column.modifiers].sort((left, right) => left.localeCompare(right)),
    name: column.name,
    note: column.note,
    reference: column.reference,
    type: column.type
  }
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
    expression: constraint.expression,
    name: constraint.name
  }
}

const normalizeLayoutValue = (value: PgmlNodeProperties) => {
  return value
}

const buildDiffEntries = <T>(
  beforeValues: Map<string, T>,
  afterValues: Map<string, T>,
  buildLabel: (id: string, value: T) => string,
  normalizeValue: (value: T) => unknown
) => {
  const ids = Array.from(new Set([...beforeValues.keys(), ...afterValues.keys()])).sort((left, right) => {
    return left.localeCompare(right)
  })

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
  return new Map(tables.map(table => [table.fullName, table] as const))
}

const buildGroupMap = (groups: PgmlGroup[]) => {
  return new Map(groups.map(group => [group.name, group] as const))
}

const buildRoutineMap = (routines: PgmlRoutine[]) => {
  return new Map(routines.map(routine => [routine.name, routine] as const))
}

const buildTriggerMap = (triggers: PgmlTrigger[]) => {
  return new Map(triggers.map(trigger => [`${trigger.tableName}::${trigger.name}`, trigger] as const))
}

const buildSequenceMap = (sequences: PgmlSequence[]) => {
  return new Map(sequences.map(sequence => [sequence.name, sequence] as const))
}

const buildCustomTypeMap = (customTypes: PgmlCustomType[]) => {
  return new Map(customTypes.map(customType => [`${customType.kind}::${customType.name}`, customType] as const))
}

const buildReferenceMap = (references: PgmlReference[]) => {
  return new Map(references.map(reference => [normalizeReferenceKey(reference), reference] as const))
}

const buildColumnMap = (tables: PgmlTable[]) => {
  return new Map(tables.flatMap((table) => {
    return table.columns.map((column) => {
      return [`${table.fullName}::${column.name}`, {
        column,
        tableId: table.fullName
      }] as const
    })
  }))
}

const buildIndexMap = (tables: PgmlTable[]) => {
  return new Map(tables.flatMap((table) => {
    return table.indexes.map((index) => {
      return [`${table.fullName}::${index.name}`, {
        index,
        tableId: table.fullName
      }] as const
    })
  }))
}

const buildConstraintMap = (tables: PgmlTable[]) => {
  return new Map(tables.flatMap((table) => {
    return table.constraints.map((constraint) => {
      return [`${table.fullName}::${constraint.name}`, {
        constraint,
        tableId: table.fullName
      }] as const
    })
  }))
}

const buildLayoutMap = (properties: Record<string, PgmlNodeProperties>) => {
  return new Map(Object.entries(properties))
}

export const diffPgmlSchemaModels = (
  beforeModel: PgmlSchemaModel,
  afterModel: PgmlSchemaModel
): PgmlSchemaDiff => {
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
    normalizeSequenceValue
  )
  const customTypes = buildDiffEntries(
    buildCustomTypeMap(beforeModel.customTypes),
    buildCustomTypeMap(afterModel.customTypes),
    (id, value) => value.name || id,
    normalizeCustomTypeValue
  )
  const references = buildDiffEntries(
    buildReferenceMap(beforeModel.references),
    buildReferenceMap(afterModel.references),
    (_id, value) => `${value.fromTable}.${value.fromColumn} -> ${value.toTable}.${value.toColumn}`,
    value => value
  )
  const columns = buildDiffEntries(
    buildColumnMap(beforeModel.tables),
    buildColumnMap(afterModel.tables),
    (_id, value) => `${value.tableId}.${value.column.name}`,
    value => normalizeColumnValue(value.column)
  )
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
  const summary = [
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
  ].reduce<PgmlSchemaDiffSummary>((totals, entry) => {
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
    layoutChanged: layout.length,
    modified: 0,
    removed: 0
  })

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
