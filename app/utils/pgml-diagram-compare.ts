import { getStoredGroupId, type DiagramGpuSelection } from './diagram-gpu-scene'
import {
  clonePgmlCompareExclusions,
  clonePgmlCompareNoiseFilters,
  type PgmlCompareExclusions,
  type PgmlCompareNoiseFilters,
  type PgmlCustomType,
  type PgmlRoutine,
  type PgmlSchemaModel,
  type PgmlSourceRange
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
  id: string
  label: string
}

export type PgmlDiagramCompareNoiseKind = 'defaults' | 'executable-name' | 'metadata' | 'order' | 'structural-name'

export type PgmlDiagramCompareScopeKind = 'group' | 'standalone' | 'table'

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
  noiseKinds: PgmlDiagramCompareNoiseKind[]
  rowKey: string | null
  scopeId: string
  scopeKind: PgmlDiagramCompareScopeKind
  scopeLabel: string
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

const compareGroupedScopeKindLabelByValue: Readonly<Record<'table', string>> = Object.freeze({
  table: 'Table scope'
})

const compareScopeEntityLabelByKind: Readonly<Record<PgmlDiagramCompareEntityKind, [string, string]>> = Object.freeze({
  'column': ['column change', 'column changes'],
  'constraint': ['constraint change', 'constraint changes'],
  'custom-type': ['type change', 'type changes'],
  'function': ['function change', 'function changes'],
  'group': ['group change', 'group changes'],
  'index': ['index change', 'index changes'],
  'layout': ['layout change', 'layout changes'],
  'procedure': ['procedure change', 'procedure changes'],
  'reference': ['reference change', 'reference changes'],
  'sequence': ['sequence change', 'sequence changes'],
  'table': ['table change', 'table changes'],
  'trigger': ['trigger change', 'trigger changes']
})

const compareScopeEntityKindOrder: PgmlDiagramCompareEntityKind[] = [
  'table',
  'column',
  'reference',
  'index',
  'constraint',
  'trigger',
  'function',
  'procedure',
  'sequence',
  'custom-type',
  'group',
  'layout'
]

const compareEntryIdPrefixKindMap: Readonly<Record<string, PgmlDiagramCompareEntityKind>> = Object.freeze({
  'column': 'column',
  'constraint': 'constraint',
  'custom-type': 'custom-type',
  'function': 'function',
  'group': 'group',
  'index': 'index',
  'layout': 'layout',
  'procedure': 'procedure',
  'reference': 'reference',
  'sequence': 'sequence',
  'table': 'table',
  'trigger': 'trigger'
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

const compareFieldLabelByValue: Readonly<Record<string, string>> = Object.freeze({
  affects: 'affects',
  collapsed: 'collapsed state',
  columns: 'columns',
  expression: 'expression',
  fromColumn: 'source column',
  fromColumns: 'source columns',
  fromTable: 'source table',
  fullName: 'name',
  groupName: 'group',
  height: 'height',
  masonry: 'masonry layout',
  metadata: 'metadata',
  modifiers: 'modifiers',
  name: 'name',
  note: 'note',
  onDelete: 'delete action',
  onUpdate: 'update action',
  reference: 'reference',
  relation: 'relationship direction',
  signature: 'signature',
  source: 'source',
  tableColumns: 'visible columns',
  tableNames: 'tables',
  tableWidthScale: 'table width scale',
  toColumn: 'target column',
  toColumns: 'target columns',
  toTable: 'target table',
  type: 'type',
  visible: 'visibility',
  width: 'width',
  x: 'x position',
  y: 'y position'
})

const hasValue = <T>(value: T | null | undefined): value is T => {
  return value !== null && value !== undefined
}

const hasNodeId = (value: string | null | undefined): value is string => {
  return typeof value === 'string' && value.length > 0
}

const isTransientCompareFieldName = (fieldName: string) => {
  return fieldName === 'sourceRange'
}

const compareMetadataFieldNames = new Set(['affects', 'docs', 'metadata', 'note'])
const compareOrderNoiseDisallowedEntityKinds = new Set<PgmlDiagramCompareEntityKind>([
  'custom-type',
  'index',
  'reference'
])
const compareExecutableNameOnlyKinds = new Set<PgmlDiagramCompareEntityKind>([
  'function',
  'procedure',
  'sequence',
  'trigger'
])
const compareStructuralNameOnlyKinds = new Set<PgmlDiagramCompareEntityKind>([
  'constraint',
  'index'
])

const isEnumValueOrderOnlyChange = (
  entityKind: PgmlDiagramCompareEntityKind,
  beforeRecord: Record<string, unknown>,
  afterRecord: Record<string, unknown>,
  changedFields: string[]
) => {
  if (entityKind !== 'custom-type') {
    return false
  }

  if (changedFields.length === 0) {
    return false
  }

  const allowedFields = new Set(['details', 'values'])

  if (changedFields.some(fieldName => !allowedFields.has(fieldName))) {
    return false
  }

  if (beforeRecord.kind !== 'Enum' || afterRecord.kind !== 'Enum') {
    return false
  }

  return changedFields.every((fieldName) => {
    return areFieldValuesEqualIgnoringOrder(beforeRecord[fieldName], afterRecord[fieldName])
  })
}

const isExecutableNameOnlyChange = (
  entityKind: PgmlDiagramCompareEntityKind,
  changedFields: string[]
) => {
  if (!compareExecutableNameOnlyKinds.has(entityKind) || changedFields.length === 0) {
    return false
  }

  if (entityKind === 'function' || entityKind === 'procedure') {
    return changedFields.every(fieldName => fieldName === 'name' || fieldName === 'signature')
  }

  return changedFields.every(fieldName => fieldName === 'name')
}

const isStructuralNameOnlyChange = (
  entityKind: PgmlDiagramCompareEntityKind,
  changedFields: string[]
) => {
  if (!compareStructuralNameOnlyKinds.has(entityKind) || changedFields.length === 0) {
    return false
  }

  return changedFields.every(fieldName => fieldName === 'name')
}

const formatCompareFieldLabel = (fieldName: string) => {
  const explicitLabel = compareFieldLabelByValue[fieldName]

  if (explicitLabel) {
    return explicitLabel
  }

  return fieldName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .toLowerCase()
}

const buildFieldSummaryLabel = (changedFields: string[]) => {
  const labels = Array.from(new Set(changedFields.map(fieldName => formatCompareFieldLabel(fieldName))))

  if (labels.length === 0) {
    return null
  }

  if (labels.length === 1) {
    return labels[0] || null
  }

  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`
  }

  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`
}

const buildChangedFieldNames = (
  beforeValue: unknown,
  afterValue: unknown,
  changedFields: string[]
) => {
  return changedFields.length > 0
    ? changedFields.filter(fieldName => !isTransientCompareFieldName(fieldName))
    : Array.from(new Set([
        ...Object.keys((beforeValue as Record<string, unknown>) || {}),
        ...Object.keys((afterValue as Record<string, unknown>) || {})
      ]))
        .filter(fieldName => !isTransientCompareFieldName(fieldName))
        .sort((left, right) => left.localeCompare(right))
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

const areFieldValuesEqualIgnoringOrder = (
  beforeValue: unknown,
  afterValue: unknown
) => {
  if (!Array.isArray(beforeValue) || !Array.isArray(afterValue) || beforeValue.length !== afterValue.length) {
    return false
  }

  const normalizeArrayValues = (values: unknown[]) => {
    return values.map((entry) => {
      return typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean'
        ? JSON.stringify(entry)
        : JSON.stringify(buildStableSnapshotValue(entry))
    }).sort((left, right) => left.localeCompare(right))
  }

  return JSON.stringify(normalizeArrayValues(beforeValue)) === JSON.stringify(normalizeArrayValues(afterValue))
}

const buildCompareNoiseKinds = (
  entityKind: PgmlDiagramCompareEntityKind,
  beforeValue: unknown,
  afterValue: unknown,
  changedFields: string[]
): PgmlDiagramCompareNoiseKind[] => {
  if (changedFields.length === 0) {
    return []
  }

  const beforeRecord = beforeValue && typeof beforeValue === 'object'
    ? beforeValue as Record<string, unknown>
    : {}
  const afterRecord = afterValue && typeof afterValue === 'object'
    ? afterValue as Record<string, unknown>
    : {}
  const noiseKinds: PgmlDiagramCompareNoiseKind[] = []

  if (
    changedFields.length === 1
    && changedFields[0] === 'modifiers'
    && Array.isArray(beforeRecord.modifiers)
    && Array.isArray(afterRecord.modifiers)
  ) {
    const beforeModifiers = beforeRecord.modifiers as string[]
    const afterModifiers = afterRecord.modifiers as string[]
    const beforeNonDefaultModifiers = beforeModifiers
      .filter(modifier => typeof modifier === 'string' && !modifier.startsWith('default:'))
      .sort((left, right) => left.localeCompare(right))
    const afterNonDefaultModifiers = afterModifiers
      .filter(modifier => typeof modifier === 'string' && !modifier.startsWith('default:'))
      .sort((left, right) => left.localeCompare(right))
    const beforeDefault = beforeModifiers.find(modifier => typeof modifier === 'string' && modifier.startsWith('default:')) || null
    const afterDefault = afterModifiers.find(modifier => typeof modifier === 'string' && modifier.startsWith('default:')) || null

    if (
      JSON.stringify(beforeNonDefaultModifiers) === JSON.stringify(afterNonDefaultModifiers)
      && beforeDefault !== afterDefault
    ) {
      noiseKinds.push('defaults')
    }
  }

  if (changedFields.every(fieldName => compareMetadataFieldNames.has(fieldName))) {
    noiseKinds.push('metadata')
  }

  if (isExecutableNameOnlyChange(entityKind, changedFields)) {
    noiseKinds.push('executable-name')
  }

  if (isStructuralNameOnlyChange(entityKind, changedFields)) {
    noiseKinds.push('structural-name')
  }

  if (
    (
      !compareOrderNoiseDisallowedEntityKinds.has(entityKind)
      || isEnumValueOrderOnlyChange(entityKind, beforeRecord, afterRecord, changedFields)
    )
    && changedFields.every((fieldName) => {
      return areFieldValuesEqualIgnoringOrder(beforeRecord[fieldName], afterRecord[fieldName])
    })
  ) {
    noiseKinds.push('order')
  }

  return noiseKinds
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

const truncateInlineValue = (value: string, maxLength = 72) => {
  return value.length > maxLength
    ? `${value.slice(0, maxLength - 1)}…`
    : value
}

const formatReferenceSummaryValue = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const reference = value as Record<string, unknown>
  const relation = typeof reference.relation === 'string' ? reference.relation : null
  const toTable = typeof reference.toTable === 'string' ? reference.toTable : null
  const toColumn = typeof reference.toColumn === 'string' ? reference.toColumn : null
  const onDelete = typeof reference.onDelete === 'string' ? reference.onDelete : null
  const onUpdate = typeof reference.onUpdate === 'string' ? reference.onUpdate : null

  if (!relation || !toTable || !toColumn) {
    return null
  }

  const actions = [
    onDelete ? `delete=${onDelete}` : null,
    onUpdate ? `update=${onUpdate}` : null
  ].filter(hasValue)

  return truncateInlineValue([
    `${relation} ${toTable}.${toColumn}`,
    actions.length > 0 ? `(${actions.join(', ')})` : null
  ].filter(hasValue).join(' '))
}

const formatDescriptionFieldValue = (
  fieldName: string,
  value: unknown
) => {
  if (value === undefined || value === null) {
    return 'none'
  }

  if (fieldName === 'reference') {
    const referenceSummary = formatReferenceSummaryValue(value)

    if (referenceSummary) {
      return referenceSummary
    }
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return 'none'
    }

    const primitiveValues = value.every((entry) => {
      return typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean'
    })

    if (primitiveValues) {
      return truncateInlineValue(`[${value.join(', ')}]`)
    }

    return truncateInlineValue(JSON.stringify(buildStableSnapshotValue(value)))
  }

  if (typeof value === 'string') {
    return truncateInlineValue(value)
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return `${value}`
  }

  return truncateInlineValue(JSON.stringify(buildStableSnapshotValue(value)))
}

const buildFieldChangeSummary = (
  beforeValue: unknown,
  afterValue: unknown,
  changedFields: string[]
) => {
  const beforeRecord = beforeValue && typeof beforeValue === 'object'
    ? beforeValue as Record<string, unknown>
    : {}
  const afterRecord = afterValue && typeof afterValue === 'object'
    ? afterValue as Record<string, unknown>
    : {}
  const summaries = buildChangedFieldNames(beforeValue, afterValue, changedFields)
    .map((fieldName) => {
      const before = formatDescriptionFieldValue(fieldName, beforeRecord[fieldName])
      const after = formatDescriptionFieldValue(fieldName, afterRecord[fieldName])

      if (before === after) {
        return null
      }

      return `${formatCompareFieldLabel(fieldName)} ${before} -> ${after}`
    })
    .filter(hasValue)

  if (summaries.length === 0) {
    return null
  }

  if (summaries.length <= 2) {
    return summaries.join('; ')
  }

  return `${summaries.slice(0, 2).join('; ')}; +${summaries.length - 2} more`
}

const buildFieldRecords = (
  beforeValue: unknown,
  afterValue: unknown,
  changedFields: string[]
) => {
  const fieldNames = buildChangedFieldNames(beforeValue, afterValue, changedFields)

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
      id: fieldName,
      label: formatCompareFieldLabel(fieldName)
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
  label: string,
  beforeValue: unknown,
  afterValue: unknown,
  changedFields: string[]
) => {
  const baseDescription = `${compareChangeVerbByKind[changeKind]} ${compareEntityKindLabelByValue[entityKind].toLowerCase()} ${label}`

  if (changeKind !== 'modified') {
    return `${baseDescription}.`
  }

  const fieldSummary = buildFieldChangeSummary(beforeValue, afterValue, changedFields)

  if (!fieldSummary) {
    const fallbackFieldSummary = buildFieldSummaryLabel(changedFields)

    return fallbackFieldSummary
      ? `${baseDescription}: ${fallbackFieldSummary}.`
      : `${baseDescription}.`
  }

  return `${baseDescription}: ${fieldSummary}.`
}

const buildNodeIds = (...ids: Array<string | null | undefined>) => {
  return Array.from(new Set(ids.filter(hasNodeId)))
}

// Removed child entities still need a target-side visual anchor when the owning
// table survives into the compare target. Falling back to the rendered target
// table ids keeps deletes visible on the diagram even though the removed row or
// attachment no longer exists in the target snapshot.
const buildTargetTableNodeIds = (
  afterTableId: string | null | undefined,
  targetTable: { fullName: string } | null
) => {
  return buildNodeIds(afterTableId, targetTable?.fullName)
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
  buildEntry: (entry: PgmlDiffEntry<T>) => Omit<PgmlDiagramCompareEntry, 'noiseKinds'>
  entries: PgmlDiffEntry<T>[]
  getNoiseComparisonValues?: (entry: PgmlDiffEntry<T>) => {
    after: unknown
    before: unknown
  }
}) => {
  return input.entries.map((entry) => {
    const builtEntry = input.buildEntry(entry)
    const noiseComparisonValues = input.getNoiseComparisonValues
      ? input.getNoiseComparisonValues(entry)
      : {
          after: entry.after || null,
          before: entry.before || null
        }

    return {
      ...builtEntry,
      noiseKinds: buildCompareNoiseKinds(
        builtEntry.entityKind,
        noiseComparisonValues.before,
        noiseComparisonValues.after,
        entry.changes || []
      )
    } satisfies PgmlDiagramCompareEntry
  })
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
    description: buildEntryDescription(
      input.entry.kind,
      input.entityKind,
      input.entry.label,
      input.entry.before || null,
      input.entry.after || null,
      input.entry.changes || []
    ),
    entityKind: input.entityKind,
    fields: buildFieldRecords(input.entry.before || null, input.entry.after || null, input.entry.changes || []),
    id: `${input.idPrefix}:${input.entry.id}`,
    label: input.entry.label,
    rowKey: input.entry.after && input.buildRowKey ? input.buildRowKey(input.entry.after) : null,
    scopeId: `standalone:${input.idPrefix}:${input.entry.id}`,
    scopeKind: 'standalone',
    scopeLabel: input.entry.label,
    selectionCandidates: buildObjectSelectionCandidates(afterObjectId, Boolean(input.entry.after)),
    sourceRange: pickSourceRange(
      input.entry.after ? input.sourceRange(input.entry.after) : null,
      input.entry.before ? input.sourceRange(input.entry.before) : null
    ),
    targetNodeIds: buildNodeIds(afterObjectId)
  } satisfies Omit<PgmlDiagramCompareEntry, 'noiseKinds'>
}

export const getPgmlDiagramCompareEntityKindLabel = (kind: PgmlDiagramCompareEntityKind) => {
  return compareEntityKindLabelByValue[kind]
}

export const getPgmlDiagramCompareGroupedScopeKindLabel = (kind: 'table') => {
  return compareGroupedScopeKindLabelByValue[kind]
}

export const buildPgmlDiagramCompareScopeChangeCountLabel = (count: number) => {
  return `${count} scoped ${count === 1 ? 'change' : 'changes'}`
}

const formatCompareCountSummary = (items: string[]) => {
  if (items.length === 0) {
    return null
  }

  if (items.length === 1) {
    return items[0] || null
  }

  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`
  }

  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

export const buildPgmlDiagramCompareScopeSummary = (scopeEntries: PgmlDiagramCompareEntry[]) => {
  const countsByKind = scopeEntries.reduce<Record<PgmlDiagramCompareEntityKind, number>>((counts, entry) => {
    counts[entry.entityKind] = (counts[entry.entityKind] || 0) + 1
    return counts
  }, {
    'column': 0,
    'constraint': 0,
    'custom-type': 0,
    'function': 0,
    'group': 0,
    'index': 0,
    'layout': 0,
    'procedure': 0,
    'reference': 0,
    'sequence': 0,
    'table': 0,
    'trigger': 0
  })

  const kindSummary = compareScopeEntityKindOrder.flatMap((entityKind) => {
    const count = countsByKind[entityKind]

    if (count === 0) {
      return []
    }

    const [singularLabel, pluralLabel] = compareScopeEntityLabelByKind[entityKind]
    const label = count === 1 ? singularLabel : pluralLabel

    return `${count} ${label}`
  })

  if (kindSummary.length === 0) {
    return `Includes ${buildPgmlDiagramCompareScopeChangeCountLabel(scopeEntries.length)}.`
  }

  const summary = formatCompareCountSummary(kindSummary)

  return summary
    ? `Includes ${summary}.`
    : `Includes ${buildPgmlDiagramCompareScopeChangeCountLabel(scopeEntries.length)}.`
}

export const getPgmlDiagramCompareEntityKindFromEntryId = (
  entryId: string
): PgmlDiagramCompareEntityKind | null => {
  const separatorIndex = entryId.indexOf(':')

  if (separatorIndex <= 0) {
    return null
  }

  return compareEntryIdPrefixKindMap[entryId.slice(0, separatorIndex)] || null
}

export const getPgmlDiagramCompareChangeVerb = (kind: PgmlDiffChangeKind) => {
  return compareChangeVerbByKind[kind]
}

export const getPgmlDiagramCompareChangeColor = (kind: PgmlDiffChangeKind) => {
  return compareChangeColorByKind[kind]
}

export const filterPgmlDiagramCompareEntriesForExclusions = (
  entries: PgmlDiagramCompareEntry[],
  exclusions?: Partial<PgmlCompareExclusions> | null
) => {
  const excludedEntityIds = new Set(clonePgmlCompareExclusions(exclusions).entityIds)

  if (excludedEntityIds.size === 0) {
    return entries
  }

  return entries.filter(entry => !excludedEntityIds.has(entry.id))
}

export const filterPgmlDiagramCompareEntriesForNoise = (
  entries: PgmlDiagramCompareEntry[],
  noiseFilters?: Partial<PgmlCompareNoiseFilters> | null
) => {
  const normalizedNoiseFilters = clonePgmlCompareNoiseFilters(noiseFilters)

  if (
    !normalizedNoiseFilters.hideDefaults
    && !normalizedNoiseFilters.hideExecutableNameOnly
    && !normalizedNoiseFilters.hideStructuralNameOnly
    && !normalizedNoiseFilters.hideMetadata
    && !normalizedNoiseFilters.hideOrderOnly
  ) {
    return entries
  }

  return entries.filter((entry) => {
    if (normalizedNoiseFilters.hideDefaults && entry.noiseKinds.includes('defaults')) {
      return false
    }

    if (normalizedNoiseFilters.hideExecutableNameOnly && entry.noiseKinds.includes('executable-name')) {
      return false
    }

    if (normalizedNoiseFilters.hideStructuralNameOnly && entry.noiseKinds.includes('structural-name')) {
      return false
    }

    if (normalizedNoiseFilters.hideMetadata && entry.noiseKinds.includes('metadata')) {
      return false
    }

    if (normalizedNoiseFilters.hideOrderOnly && entry.noiseKinds.includes('order')) {
      return false
    }

    return true
  })
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
        description: buildEntryDescription(entry.kind, 'table', entry.label, entry.before, entry.after, entry.changes || []),
        entityKind: 'table',
        fields: buildFieldRecords(entry.before, entry.after, entry.changes || []),
        id: `table:${entry.id}`,
        label: entry.label,
        rowKey: null,
        scopeId: `table:${entry.id}`,
        scopeKind: 'table',
        scopeLabel: entry.label,
        selectionCandidates: targetTable
          ? [{
              kind: 'table',
              tableId: targetTable.fullName
            }]
          : [],
        sourceRange: pickSourceRange(entry.after?.sourceRange, entry.before?.sourceRange),
        targetNodeIds: buildNodeIds(entry.after?.fullName)
      } satisfies Omit<PgmlDiagramCompareEntry, 'noiseKinds'>
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
        description: buildEntryDescription(entry.kind, 'group', entry.label, entry.before, entry.after, entry.changes || []),
        entityKind: 'group',
        fields: buildFieldRecords(entry.before, entry.after, entry.changes || []),
        id: `group:${entry.id}`,
        label: entry.label,
        rowKey: null,
        scopeId: `group:${entry.id}`,
        scopeKind: 'group',
        scopeLabel: entry.label,
        selectionCandidates: targetGroup && groupId
          ? [{
              id: groupId,
              kind: 'group'
            }]
          : [],
        sourceRange: pickSourceRange(entry.after?.sourceRange, entry.before?.sourceRange),
        targetNodeIds: buildNodeIds(groupId && targetGroup ? groupId : null)
      } satisfies Omit<PgmlDiagramCompareEntry, 'noiseKinds'>
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
        description: buildEntryDescription(
          entry.kind,
          'column',
          entry.label,
          entry.before?.column || null,
          entry.after?.column || null,
          entry.changes || []
        ),
        entityKind: 'column',
        fields: buildFieldRecords(entry.before?.column || null, entry.after?.column || null, entry.changes || []),
        id: `column:${entry.id}`,
        label: entry.label,
        rowKey: entry.after ? `${entry.after.tableId}.${entry.after.column.name}` : null,
        scopeId: tableId ? `table:${tableId}` : `standalone:column:${entry.id}`,
        scopeKind: tableId ? 'table' : 'standalone',
        scopeLabel: tableId || entry.label,
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
        targetNodeIds: buildTargetTableNodeIds(entry.after?.tableId, targetTable)
      } satisfies Omit<PgmlDiagramCompareEntry, 'noiseKinds'>
    },
    entries: diff.columns,
    getNoiseComparisonValues: entry => ({
      after: entry.after?.column || null,
      before: entry.before?.column || null
    })
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
        description: buildEntryDescription(
          entry.kind,
          'index',
          entry.label,
          entry.before?.index || null,
          entry.after?.index || null,
          entry.changes || []
        ),
        entityKind: 'index',
        fields: buildFieldRecords(entry.before?.index || null, entry.after?.index || null, entry.changes || []),
        id: `index:${entry.id}`,
        label: entry.label,
        rowKey: entry.after && attachmentId ? `index:${attachmentId}` : null,
        scopeId: tableId ? `table:${tableId}` : `standalone:index:${entry.id}`,
        scopeKind: tableId ? 'table' : 'standalone',
        scopeLabel: tableId || entry.label,
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
        targetNodeIds: buildTargetTableNodeIds(entry.after?.tableId, targetTable)
      } satisfies Omit<PgmlDiagramCompareEntry, 'noiseKinds'>
    },
    entries: diff.indexes,
    getNoiseComparisonValues: entry => ({
      after: entry.after?.index || null,
      before: entry.before?.index || null
    })
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
        description: buildEntryDescription(
          entry.kind,
          'constraint',
          entry.label,
          entry.before?.constraint || null,
          entry.after?.constraint || null,
          entry.changes || []
        ),
        entityKind: 'constraint',
        fields: buildFieldRecords(entry.before?.constraint || null, entry.after?.constraint || null, entry.changes || []),
        id: `constraint:${entry.id}`,
        label: entry.label,
        rowKey: entry.after && attachmentId ? `constraint:${attachmentId}` : null,
        scopeId: tableId ? `table:${tableId}` : `standalone:constraint:${entry.id}`,
        scopeKind: tableId ? 'table' : 'standalone',
        scopeLabel: tableId || entry.label,
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
        targetNodeIds: buildTargetTableNodeIds(entry.after?.tableId, targetTable)
      } satisfies Omit<PgmlDiagramCompareEntry, 'noiseKinds'>
    },
    entries: diff.constraints,
    getNoiseComparisonValues: entry => ({
      after: entry.after?.constraint || null,
      before: entry.before?.constraint || null
    })
  }))

  entries.push(...buildEntryFromDiff({
    buildEntry: (entry) => {
      const reference = entry.after || entry.before
      const baseFromTable = findTableById(baseModel, reference?.fromTable || null)
      const targetFromTable = findTableById(targetModel, reference?.fromTable || null)
      const targetToTable = findTableById(targetModel, reference?.toTable || null)
      const scopeTableId = reference?.fromTable || reference?.toTable || null

      return {
        afterSnapshot: formatCompareSnapshot(entry.after),
        baseNodeIds: buildNodeIds(entry.before?.fromTable, entry.before?.toTable),
        beforeSnapshot: formatCompareSnapshot(entry.before),
        changeKind: entry.kind,
        changedFields: entry.changes || [],
        description: buildEntryDescription(entry.kind, 'reference', entry.label, entry.before || null, entry.after || null, entry.changes || []),
        entityKind: 'reference',
        fields: buildFieldRecords(entry.before || null, entry.after || null, entry.changes || []),
        id: `reference:${entry.id}`,
        label: entry.label,
        rowKey: entry.after ? `${entry.after.fromTable}.${entry.after.fromColumn}` : null,
        scopeId: scopeTableId ? `table:${scopeTableId}` : `standalone:reference:${entry.id}`,
        scopeKind: scopeTableId ? 'table' : 'standalone',
        scopeLabel: scopeTableId || entry.label,
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
        targetNodeIds: buildNodeIds(
          entry.after?.fromTable,
          entry.after?.toTable,
          targetFromTable?.fullName,
          targetToTable?.fullName
        )
      } satisfies Omit<PgmlDiagramCompareEntry, 'noiseKinds'>
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
        description: buildEntryDescription(entry.kind, 'trigger', entry.label, entry.before || null, entry.after || null, entry.changes || []),
        entityKind: 'trigger',
        fields: buildFieldRecords(entry.before || null, entry.after || null, entry.changes || []),
        id: `trigger:${entry.id}`,
        label: entry.label,
        rowKey: entry.after && trigger ? buildRoutineObjectId('trigger', trigger.name) : null,
        scopeId: tableId ? `table:${tableId}` : `standalone:trigger:${entry.id}`,
        scopeKind: tableId ? 'table' : 'standalone',
        scopeLabel: tableId || entry.label,
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
        targetNodeIds: buildNodeIds(entry.after?.tableName, targetTable?.fullName, entry.after ? objectId : null)
      } satisfies Omit<PgmlDiagramCompareEntry, 'noiseKinds'>
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
      description: buildEntryDescription(entry.kind, 'layout', entry.label, entry.before || null, entry.after || null, entry.changes || []),
      entityKind: 'layout' as const,
      fields: buildFieldRecords(entry.before || null, entry.after || null, entry.changes || []),
      id: `layout:${entry.id}`,
      label: entry.label,
      noiseKinds: buildCompareNoiseKinds('layout', entry.before || null, entry.after || null, entry.changes || []),
      rowKey: null,
      scopeId: entry.id.startsWith('group:')
        ? `group:${entry.id.replace(/^group:/, '')}`
        : findTableById(targetModel, entry.id) || findTableById(baseModel, entry.id)
          ? `table:${entry.id}`
          : `standalone:layout:${entry.id}`,
      scopeKind: entry.id.startsWith('group:')
        ? 'group'
        : findTableById(targetModel, entry.id) || findTableById(baseModel, entry.id)
          ? 'table'
          : 'standalone',
      scopeLabel: entry.id.startsWith('group:')
        ? entry.id.replace(/^group:/, '')
        : entry.id,
      selectionCandidates: buildLayoutSelectionCandidates(entry.id, baseModel, targetModel),
      sourceRange: null,
      targetNodeIds: buildNodeIds(entry.after ? entry.id : null)
    } satisfies PgmlDiagramCompareEntry
  }))

  return entries
}
