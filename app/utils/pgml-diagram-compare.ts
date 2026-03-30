import { getStoredGroupId, type DiagramGpuSelection } from './diagram-gpu-scene'
import type {
  PgmlCustomType,
  PgmlRoutine,
  PgmlSchemaModel,
  PgmlSourceRange
} from './pgml'
import type {
  PgmlDiffChangeKind,
  PgmlDiffEntry,
  PgmlSchemaDiff
} from './pgml-diff'

export type PgmlDiagramCompareEntityKind
  = | 'column'
    | 'constraint'
    | 'custom-type'
    | 'function'
    | 'group'
    | 'index'
    | 'layout'
    | 'procedure'
    | 'reference'
    | 'sequence'
    | 'table'
    | 'trigger'

export type PgmlDiagramCompareField = {
  after: string | null
  before: string | null
  label: string
}

export type PgmlDiagramCompareEntry = {
  afterSnapshot: string | null
  baseNodeIds: string[]
  beforeSnapshot: string | null
  changeKind: PgmlDiffChangeKind
  changedFields: string[]
  description: string
  entityKind: PgmlDiagramCompareEntityKind
  fields: PgmlDiagramCompareField[]
  id: string
  label: string
  rowKey: string | null
  selectionCandidates: DiagramGpuSelection[]
  sourceRange: PgmlSourceRange | null
  targetNodeIds: string[]
}

const compareEntityKindLabelByValue: Readonly<Record<PgmlDiagramCompareEntityKind, string>> = Object.freeze({
  'column': 'Column',
  'constraint': 'Constraint',
  'custom-type': 'Type',
  'function': 'Function',
  'group': 'Group',
  'index': 'Index',
  'layout': 'Layout',
  'procedure': 'Procedure',
  'reference': 'Reference',
  'sequence': 'Sequence',
  'table': 'Table',
  'trigger': 'Trigger'
})

const compareChangeVerbByKind: Readonly<Record<PgmlDiffChangeKind, string>> = Object.freeze({
  added: 'Added',
  modified: 'Changed',
  removed: 'Removed'
})

const compareChangeColorByKind: Readonly<Record<PgmlDiffChangeKind, string>> = Object.freeze({
  added: '#22c55e',
  modified: '#f59e0b',
  removed: '#f43f5e'
})

const hasValue = <T>(value: T | null | undefined): value is T => {
  return value !== null && value !== undefined
}

const hasNodeId = (value: string | null | undefined): value is string => {
  return typeof value === 'string' && value.length > 0
}

// Snapshot text feeds the compare inspector, so it should stay stable across runs.
// We intentionally remove transient source-range metadata and sort object keys to
// keep the before/after payloads easy to diff in tests and in the UI.
const buildStableSnapshotValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(entry => buildStableSnapshotValue(entry))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.entries(value as Record<string, unknown>)
    .filter(([key, entry]) => key !== 'sourceRange' && entry !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .reduce<Record<string, unknown>>((entries, [key, entry]) => {
      entries[key] = buildStableSnapshotValue(entry)
      return entries
    }, {})
}

const formatCompareSnapshot = (value: unknown) => {
  if (value === null || value === undefined) {
    return null
  }

  return JSON.stringify(buildStableSnapshotValue(value), null, 2)
}

const formatFieldValue = (value: unknown) => {
  if (value === undefined || value === null) {
    return null
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return `${value}`
  }

  return JSON.stringify(buildStableSnapshotValue(value), null, 2)
}

const buildFieldRecords = (
  beforeValue: unknown,
  afterValue: unknown,
  changedFields: string[]
) => {
  const fieldNames = changedFields.length > 0
    ? changedFields
    : Array.from(new Set([
        ...Object.keys((beforeValue as Record<string, unknown>) || {}),
        ...Object.keys((afterValue as Record<string, unknown>) || {})
      ])).sort((left, right) => left.localeCompare(right))

  return fieldNames.map((fieldName) => {
    const beforeRecord = beforeValue && typeof beforeValue === 'object'
      ? beforeValue as Record<string, unknown>
      : {}
    const afterRecord = afterValue && typeof afterValue === 'object'
      ? afterValue as Record<string, unknown>
      : {}

    return {
      after: formatFieldValue(afterRecord[fieldName]),
      before: formatFieldValue(beforeRecord[fieldName]),
      label: fieldName
    } satisfies PgmlDiagramCompareField
  })
}

const findTableById = (model: PgmlSchemaModel, tableId: string | null) => {
  if (!tableId) {
    return null
  }

  return model.tables.find(table => table.fullName === tableId) || null
}

const findGroupByName = (model: PgmlSchemaModel, groupName: string | null) => {
  if (!groupName) {
    return null
  }

  return model.groups.find(group => group.name === groupName) || null
}

const buildRoutineObjectId = (
  kind: 'function' | 'procedure' | 'sequence' | 'trigger',
  name: string
) => {
  return `${kind}:${name}`
}

const buildCustomTypeObjectId = (customType: PgmlCustomType) => {
  return `custom-type:${customType.kind}:${customType.name}`
}

const pickSourceRange = (...ranges: Array<PgmlSourceRange | null | undefined>) => {
  return ranges.find(hasValue) || null
}

const buildEntryDescription = (
  changeKind: PgmlDiffChangeKind,
  entityKind: PgmlDiagramCompareEntityKind,
  label: string
) => {
  return `${compareChangeVerbByKind[changeKind]} ${compareEntityKindLabelByValue[entityKind].toLowerCase()} ${label}.`
}

const buildNodeIds = (...ids: Array<string | null | undefined>) => {
  return Array.from(new Set(ids.filter(hasNodeId)))
}

const buildSelectionCandidates = (
  entries: Array<DiagramGpuSelection | null | undefined>
) => {
  // Compare entries often have a preferred selection plus one or more safe
  // fallbacks. Normalizing that list in one place keeps the inspector and
  // diagram highlight behavior consistent across entity kinds.
  return entries.filter(hasValue)
}

// Child changes should still focus the owning table when the specific row or
// attachment is unavailable in the rendered diagram, so we always append the
// table-level fallback after any more specific selection.
const buildTableSelectionCandidates = (input: {
  childSelection?: DiagramGpuSelection | null
  extraSelections?: Array<DiagramGpuSelection | null | undefined>
  targetTable: { fullName: string } | null
}) => {
  return buildSelectionCandidates([
    input.childSelection || null,
    ...(input.extraSelections || []),
    input.targetTable
      ? {
          kind: 'table',
          tableId: input.targetTable.fullName
        }
      : null
  ])
}

const buildObjectSelectionCandidates = (objectId: string | null, isTargetObjectAvailable: boolean) => {
  return buildSelectionCandidates([
    objectId && isTargetObjectAvailable
      ? {
          id: objectId,
          kind: 'object'
        }
      : null
  ])
}

const buildLayoutSelectionCandidates = (
  nodeId: string,
  baseModel: PgmlSchemaModel,
  targetModel: PgmlSchemaModel
) => {
  // Layout-only changes can reference groups, tables, or standalone objects.
  // The target model drives selection because compare overlays should focus the
  // currently rendered node whenever that successor still exists.
  if (nodeId.startsWith('group:')) {
    const groupId = nodeId
    const groupName = groupId.replace(/^group:/, '')

    if (findGroupByName(targetModel, groupName)) {
      return buildSelectionCandidates([{
        id: groupId,
        kind: 'group'
      }])
    }

    return []
  }

  if (findTableById(targetModel, nodeId)) {
    return buildSelectionCandidates([{
      kind: 'table',
      tableId: nodeId
    }])
  }

  if (findTableById(baseModel, nodeId)) {
    return []
  }

  const targetHasObject = targetModel.functions.some(entry => buildRoutineObjectId('function', entry.name) === nodeId)
    || targetModel.procedures.some(entry => buildRoutineObjectId('procedure', entry.name) === nodeId)
    || targetModel.sequences.some(entry => buildRoutineObjectId('sequence', entry.name) === nodeId)
    || targetModel.triggers.some(entry => buildRoutineObjectId('trigger', entry.name) === nodeId)
    || targetModel.customTypes.some(entry => buildCustomTypeObjectId(entry) === nodeId)

  return targetHasObject
    ? buildSelectionCandidates([{
        id: nodeId,
        kind: 'object'
      }])
    : []
}

const buildEntryFromDiff = <T>(input: {
  buildEntry: (entry: PgmlDiffEntry<T>) => PgmlDiagramCompareEntry
  entries: PgmlDiffEntry<T>[]
}) => {
  return input.entries.map(entry => input.buildEntry(entry))
}

const buildStandaloneObjectEntry = <T>(input: {
  buildObjectId: (value: T) => string
  buildRowKey?: (value: T) => string | null
  entry: PgmlDiffEntry<T>
  entityKind: 'custom-type' | 'function' | 'procedure' | 'sequence'
  idPrefix: string
  sourceRange: (value: T) => PgmlSourceRange | null | undefined
}) => {
  // Standalone compare objects share the same delta shape: they render as
  // inspector entries plus optional diagram object selection when the target
  // side still exists. Keep that mapping centralized so the object families do
  // not drift apart over time.
  const afterObjectId = input.entry.after ? input.buildObjectId(input.entry.after) : null
  const beforeObjectId = input.entry.before ? input.buildObjectId(input.entry.before) : null

  return {
    afterSnapshot: formatCompareSnapshot(input.entry.after),
    baseNodeIds: buildNodeIds(beforeObjectId),
    beforeSnapshot: formatCompareSnapshot(input.entry.before),
    changeKind: input.entry.kind,
    changedFields: input.entry.changes || [],
    description: buildEntryDescription(input.entry.kind, input.entityKind, input.entry.label),
    entityKind: input.entityKind,
    fields: buildFieldRecords(input.entry.before || null, input.entry.after || null, input.entry.changes || []),
    id: `${input.idPrefix}:${input.entry.id}`,
    label: input.entry.label,
    rowKey: input.entry.after && input.buildRowKey ? input.buildRowKey(input.entry.after) : null,
    selectionCandidates: buildObjectSelectionCandidates(afterObjectId, Boolean(input.entry.after)),
    sourceRange: pickSourceRange(
      input.entry.after ? input.sourceRange(input.entry.after) : null,
      input.entry.before ? input.sourceRange(input.entry.before) : null
    ),
    targetNodeIds: buildNodeIds(afterObjectId)
  } satisfies PgmlDiagramCompareEntry
}

export const getPgmlDiagramCompareEntityKindLabel = (kind: PgmlDiagramCompareEntityKind) => {
  return compareEntityKindLabelByValue[kind]
}

export const getPgmlDiagramCompareChangeVerb = (kind: PgmlDiffChangeKind) => {
  return compareChangeVerbByKind[kind]
}

export const getPgmlDiagramCompareChangeColor = (kind: PgmlDiffChangeKind) => {
  return compareChangeColorByKind[kind]
}

export const buildPgmlDiagramCompareEntries = (
  diff: PgmlSchemaDiff,
  baseModel: PgmlSchemaModel,
  targetModel: PgmlSchemaModel
) => {
  // The compare panel works from one flattened list so diagram clicks, search,
  // and inspector details can all talk about the same change identity.
  const entries: PgmlDiagramCompareEntry[] = []

  entries.push(...buildEntryFromDiff({
    buildEntry: (entry) => {
      const tableId = entry.after?.fullName || entry.before?.fullName || null
      const targetTable = findTableById(targetModel, tableId)

      return {
        afterSnapshot: formatCompareSnapshot(entry.after),
        baseNodeIds: buildNodeIds(entry.before?.fullName),
        beforeSnapshot: formatCompareSnapshot(entry.before),
        changeKind: entry.kind,
        changedFields: entry.changes || [],
        description: buildEntryDescription(entry.kind, 'table', entry.label),
        entityKind: 'table',
        fields: buildFieldRecords(entry.before, entry.after, entry.changes || []),
        id: `table:${entry.id}`,
        label: entry.label,
        rowKey: null,
        selectionCandidates: targetTable
          ? [{
              kind: 'table',
              tableId: targetTable.fullName
            }]
          : [],
        sourceRange: pickSourceRange(entry.after?.sourceRange, entry.before?.sourceRange),
        targetNodeIds: buildNodeIds(entry.after?.fullName)
      } satisfies PgmlDiagramCompareEntry
    },
    entries: diff.tables
  }))

  entries.push(...buildEntryFromDiff({
    buildEntry: (entry) => {
      const groupName = entry.after?.name || entry.before?.name || null
      const groupId = groupName ? getStoredGroupId(groupName) : null
      const targetGroup = findGroupByName(targetModel, groupName)

      return {
        afterSnapshot: formatCompareSnapshot(entry.after),
        baseNodeIds: buildNodeIds(entry.before?.name ? getStoredGroupId(entry.before.name) : null),
        beforeSnapshot: formatCompareSnapshot(entry.before),
        changeKind: entry.kind,
        changedFields: entry.changes || [],
        description: buildEntryDescription(entry.kind, 'group', entry.label),
        entityKind: 'group',
        fields: buildFieldRecords(entry.before, entry.after, entry.changes || []),
        id: `group:${entry.id}`,
        label: entry.label,
        rowKey: null,
        selectionCandidates: targetGroup && groupId
          ? [{
              id: groupId,
              kind: 'group'
            }]
          : [],
        sourceRange: pickSourceRange(entry.after?.sourceRange, entry.before?.sourceRange),
        targetNodeIds: buildNodeIds(groupId && targetGroup ? groupId : null)
      } satisfies PgmlDiagramCompareEntry
    },
    entries: diff.groups
  }))

  entries.push(...buildEntryFromDiff({
    buildEntry: (entry) => {
      const tableId = entry.after?.tableId || entry.before?.tableId || null
      const columnName = entry.after?.column.name || entry.before?.column.name || null
      const targetTable = findTableById(targetModel, tableId)

      return {
        afterSnapshot: formatCompareSnapshot(entry.after?.column),
        baseNodeIds: buildNodeIds(entry.before?.tableId),
        beforeSnapshot: formatCompareSnapshot(entry.before?.column),
        changeKind: entry.kind,
        changedFields: entry.changes || [],
        description: buildEntryDescription(entry.kind, 'column', entry.label),
        entityKind: 'column',
        fields: buildFieldRecords(entry.before?.column || null, entry.after?.column || null, entry.changes || []),
        id: `column:${entry.id}`,
        label: entry.label,
        rowKey: entry.after ? `${entry.after.tableId}.${entry.after.column.name}` : null,
        selectionCandidates: buildTableSelectionCandidates({
          childSelection: targetTable && columnName && entry.after
            ? {
                columnName,
                kind: 'column',
                tableId: targetTable.fullName
              }
            : null,
          targetTable
        }),
        sourceRange: pickSourceRange(targetTable?.sourceRange, findTableById(baseModel, tableId)?.sourceRange),
        targetNodeIds: buildNodeIds(entry.after?.tableId, targetTable?.fullName)
      } satisfies PgmlDiagramCompareEntry
    },
    entries: diff.columns
  }))

  entries.push(...buildEntryFromDiff({
    buildEntry: (entry) => {
      const tableId = entry.after?.tableId || entry.before?.tableId || null
      const attachmentId = entry.after?.index.name || entry.before?.index.name || null
      const targetTable = findTableById(targetModel, tableId)

      return {
        afterSnapshot: formatCompareSnapshot(entry.after?.index),
        baseNodeIds: buildNodeIds(entry.before?.tableId),
        beforeSnapshot: formatCompareSnapshot(entry.before?.index),
        changeKind: entry.kind,
        changedFields: entry.changes || [],
        description: buildEntryDescription(entry.kind, 'index', entry.label),
        entityKind: 'index',
        fields: buildFieldRecords(entry.before?.index || null, entry.after?.index || null, entry.changes || []),
        id: `index:${entry.id}`,
        label: entry.label,
        rowKey: entry.after && attachmentId ? `index:${attachmentId}` : null,
        selectionCandidates: buildTableSelectionCandidates({
          childSelection: targetTable && attachmentId && entry.after
            ? {
                attachmentId: `index:${attachmentId}`,
                kind: 'attachment',
                tableId: targetTable.fullName
              }
            : null,
          targetTable
        }),
        sourceRange: pickSourceRange(entry.after?.index.sourceRange, entry.before?.index.sourceRange, targetTable?.sourceRange),
        targetNodeIds: buildNodeIds(entry.after?.tableId)
      } satisfies PgmlDiagramCompareEntry
    },
    entries: diff.indexes
  }))

  entries.push(...buildEntryFromDiff({
    buildEntry: (entry) => {
      const tableId = entry.after?.tableId || entry.before?.tableId || null
      const attachmentId = entry.after?.constraint.name || entry.before?.constraint.name || null
      const targetTable = findTableById(targetModel, tableId)

      return {
        afterSnapshot: formatCompareSnapshot(entry.after?.constraint),
        baseNodeIds: buildNodeIds(entry.before?.tableId),
        beforeSnapshot: formatCompareSnapshot(entry.before?.constraint),
        changeKind: entry.kind,
        changedFields: entry.changes || [],
        description: buildEntryDescription(entry.kind, 'constraint', entry.label),
        entityKind: 'constraint',
        fields: buildFieldRecords(entry.before?.constraint || null, entry.after?.constraint || null, entry.changes || []),
        id: `constraint:${entry.id}`,
        label: entry.label,
        rowKey: entry.after && attachmentId ? `constraint:${attachmentId}` : null,
        selectionCandidates: buildTableSelectionCandidates({
          childSelection: targetTable && attachmentId && entry.after
            ? {
                attachmentId: `constraint:${attachmentId}`,
                kind: 'attachment',
                tableId: targetTable.fullName
              }
            : null,
          targetTable
        }),
        sourceRange: pickSourceRange(entry.after?.constraint.sourceRange, entry.before?.constraint.sourceRange, targetTable?.sourceRange),
        targetNodeIds: buildNodeIds(entry.after?.tableId)
      } satisfies PgmlDiagramCompareEntry
    },
    entries: diff.constraints
  }))

  entries.push(...buildEntryFromDiff({
    buildEntry: (entry) => {
      const reference = entry.after || entry.before
      const baseFromTable = findTableById(baseModel, reference?.fromTable || null)
      const targetFromTable = findTableById(targetModel, reference?.fromTable || null)
      const targetToTable = findTableById(targetModel, reference?.toTable || null)

      return {
        afterSnapshot: formatCompareSnapshot(entry.after),
        baseNodeIds: buildNodeIds(entry.before?.fromTable, entry.before?.toTable),
        beforeSnapshot: formatCompareSnapshot(entry.before),
        changeKind: entry.kind,
        changedFields: entry.changes || [],
        description: buildEntryDescription(entry.kind, 'reference', entry.label),
        entityKind: 'reference',
        fields: buildFieldRecords(entry.before || null, entry.after || null, entry.changes || []),
        id: `reference:${entry.id}`,
        label: entry.label,
        rowKey: entry.after ? `${entry.after.fromTable}.${entry.after.fromColumn}` : null,
        selectionCandidates: buildTableSelectionCandidates({
          childSelection: targetFromTable && entry.after
            ? {
                columnName: entry.after.fromColumn,
                kind: 'column',
                tableId: targetFromTable.fullName
              }
            : null,
          extraSelections: [
            targetToTable
              ? {
                  kind: 'table',
                  tableId: targetToTable.fullName
                }
              : null
          ],
          targetTable: targetFromTable
        }),
        sourceRange: pickSourceRange(targetFromTable?.sourceRange, baseFromTable?.sourceRange),
        targetNodeIds: buildNodeIds(entry.after?.fromTable, entry.after?.toTable)
      } satisfies PgmlDiagramCompareEntry
    },
    entries: diff.references
  }))

  const buildRoutineEntry = (
    kind: 'function' | 'procedure',
    entityKind: 'function' | 'procedure',
    entry: PgmlDiffEntry<PgmlRoutine>
  ) => {
    return buildStandaloneObjectEntry({
      buildObjectId: value => buildRoutineObjectId(kind, value.name),
      buildRowKey: value => buildRoutineObjectId(kind, value.name),
      entry,
      entityKind,
      idPrefix: entityKind,
      sourceRange: value => value.sourceRange
    })
  }

  entries.push(...buildEntryFromDiff({
    buildEntry: entry => buildRoutineEntry('function', 'function', entry),
    entries: diff.functions
  }))

  entries.push(...buildEntryFromDiff({
    buildEntry: entry => buildRoutineEntry('procedure', 'procedure', entry),
    entries: diff.procedures
  }))

  entries.push(...buildEntryFromDiff({
    buildEntry: (entry) => {
      const trigger = entry.after || entry.before
      const objectId = trigger ? buildRoutineObjectId('trigger', trigger.name) : null
      const tableId = entry.after?.tableName || entry.before?.tableName || null
      const targetTable = findTableById(targetModel, tableId)

      return {
        afterSnapshot: formatCompareSnapshot(entry.after),
        baseNodeIds: buildNodeIds(entry.before?.tableName, entry.before ? buildRoutineObjectId('trigger', entry.before.name) : null),
        beforeSnapshot: formatCompareSnapshot(entry.before),
        changeKind: entry.kind,
        changedFields: entry.changes || [],
        description: buildEntryDescription(entry.kind, 'trigger', entry.label),
        entityKind: 'trigger',
        fields: buildFieldRecords(entry.before || null, entry.after || null, entry.changes || []),
        id: `trigger:${entry.id}`,
        label: entry.label,
        rowKey: entry.after && trigger ? buildRoutineObjectId('trigger', trigger.name) : null,
        selectionCandidates: buildTableSelectionCandidates({
          childSelection: targetTable && trigger && entry.after
            ? {
                attachmentId: buildRoutineObjectId('trigger', trigger.name),
                kind: 'attachment',
                tableId: targetTable.fullName
              }
            : null,
          extraSelections: buildObjectSelectionCandidates(objectId, Boolean(entry.after)),
          targetTable
        }),
        sourceRange: pickSourceRange(entry.after?.sourceRange, entry.before?.sourceRange, targetTable?.sourceRange),
        targetNodeIds: buildNodeIds(entry.after?.tableName, entry.after ? objectId : null)
      } satisfies PgmlDiagramCompareEntry
    },
    entries: diff.triggers
  }))

  entries.push(...buildEntryFromDiff({
    buildEntry: (entry) => {
      return buildStandaloneObjectEntry({
        buildObjectId: value => buildRoutineObjectId('sequence', value.name),
        buildRowKey: value => buildRoutineObjectId('sequence', value.name),
        entry,
        entityKind: 'sequence',
        idPrefix: 'sequence',
        sourceRange: value => value.sourceRange
      })
    },
    entries: diff.sequences
  }))

  entries.push(...buildEntryFromDiff({
    buildEntry: (entry) => {
      return buildStandaloneObjectEntry({
        buildObjectId: buildCustomTypeObjectId,
        entry,
        entityKind: 'custom-type',
        idPrefix: 'custom-type',
        sourceRange: value => value.sourceRange
      })
    },
    entries: diff.customTypes
  }))

  entries.push(...diff.layout.map((entry) => {
    return {
      afterSnapshot: formatCompareSnapshot(entry.after),
      baseNodeIds: buildNodeIds(entry.before ? entry.id : null),
      beforeSnapshot: formatCompareSnapshot(entry.before),
      changeKind: entry.kind,
      changedFields: entry.changes || [],
      description: buildEntryDescription(entry.kind, 'layout', entry.label),
      entityKind: 'layout' as const,
      fields: buildFieldRecords(entry.before || null, entry.after || null, entry.changes || []),
      id: `layout:${entry.id}`,
      label: entry.label,
      rowKey: null,
      selectionCandidates: buildLayoutSelectionCandidates(entry.id, baseModel, targetModel),
      sourceRange: null,
      targetNodeIds: buildNodeIds(entry.after ? entry.id : null)
    } satisfies PgmlDiagramCompareEntry
  }))

  return entries
}
