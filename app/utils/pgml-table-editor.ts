import { nanoid } from 'nanoid'
import {
  buildPgmlWithNodeProperties,
  parsePgml,
  type PgmlColumn,
  type PgmlGroup,
  type PgmlMetadataEntry,
  type PgmlNodeProperties,
  type PgmlSchemaModel,
  type PgmlSourceRange,
  type PgmlTable
} from './pgml'
import { hasStoredPgmlTableWidthScale } from './pgml-node-properties'

export type PgmlEditableColumnDraft = {
  id: string
  customMetadata: PgmlEditableMetadataEntryDraft[]
  defaultValue: string
  extraModifiers: string[]
  name: string
  note: string
  notNull: boolean
  originalName: string | null
  primaryKey: boolean
  referenceColumn: string
  referenceDeleteAction: string
  referenceEnabled: boolean
  referenceRelation: '>' | '<' | '-'
  referenceSchema: string
  referenceTable: string
  referenceUpdateAction: string
  type: string
  unique: boolean
}

export type PgmlEditableMetadataEntryDraft = {
  id: string
  key: string
  value: string
}

export type PgmlEditableTableDraft = {
  columns: PgmlEditableColumnDraft[]
  customMetadata: PgmlEditableMetadataEntryDraft[]
  groupName: string | null
  mode: 'create' | 'edit'
  name: string
  note: string
  originalFullName: string | null
  preservedConstraints: PgmlTable['constraints']
  preservedIndexes: PgmlTable['indexes']
  schema: string
}

export type PgmlEditableGroupDraft = {
  color: string
  mode: 'create' | 'edit'
  name: string
  note: string
  originalName: string | null
  tableNames: string[]
}

type SourceEdit = {
  endLine: number
  replacement: string
  startLine: number
}

const trimEditorValue = (value: string) => value.trim()
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const colorValuePattern = /^#(?:[\da-f]{3}|[\da-f]{6})$/i
const normalizeGroupName = (value: string | null | undefined) => {
  const normalized = trimEditorValue(value || '')

  return normalized.length > 0 ? normalized : null
}
const normalizeTableListEntry = (schema: string, tableName: string) => {
  const normalizedSchema = trimEditorValue(schema)
  const normalizedTableName = trimEditorValue(tableName)

  return `${normalizedSchema}.${normalizedTableName}`
}
const normalizeExistingGroupTableEntry = (tableName: string) => {
  const normalizedTableName = trimEditorValue(tableName)

  if (normalizedTableName.length === 0) {
    return normalizedTableName
  }

  return normalizedTableName.includes('.')
    ? normalizedTableName
    : `public.${normalizedTableName}`
}
const normalizeGroupTableNames = (tableNames: string[]) => {
  return tableNames
    .map(normalizeExistingGroupTableEntry)
    .filter(tableName => tableName.length > 0)
}
const getNormalizedSelectedGroupTableNames = (tableNames: string[]) => {
  return Array.from(new Set(normalizeGroupTableNames(tableNames)))
}
const getStoredGroupId = (groupName: string) => `group:${groupName}`
const serializeColumnReference = (column: PgmlEditableColumnDraft) => {
  if (
    !column.referenceEnabled
    || trimEditorValue(column.referenceTable).length === 0
    || trimEditorValue(column.referenceColumn).length === 0
  ) {
    return null
  }

  const referenceSchema = trimEditorValue(column.referenceSchema) || 'public'

  return `ref: ${column.referenceRelation} ${referenceSchema}.${trimEditorValue(column.referenceTable)}.${trimEditorValue(column.referenceColumn)}`
}
const serializeReferenceActionModifier = (keyword: 'delete' | 'update', value: string) => {
  const normalizedValue = trimEditorValue(value)

  if (normalizedValue.length === 0) {
    return null
  }

  return `${keyword}: ${normalizedValue.toLowerCase()}`
}
const extractDefaultModifier = (modifiers: string[]) => {
  return modifiers.find(modifier => modifier.startsWith('default:'))?.replace(/^default:\s*/, '') || ''
}
const extractColumnExtraModifiers = (column: PgmlColumn) => {
  return column.modifiers.filter((modifier) => {
    const normalizedModifier = modifier.toLowerCase()

    return (
      normalizedModifier !== 'pk'
      && normalizedModifier !== 'primary key'
      && normalizedModifier !== 'not null'
      && normalizedModifier !== 'unique'
      && !normalizedModifier.startsWith('default:')
      && !normalizedModifier.startsWith('note:')
      && !normalizedModifier.startsWith('ref:')
      && (!column.reference || !normalizedModifier.startsWith('delete:'))
      && (!column.reference || !normalizedModifier.startsWith('update:'))
    )
  })
}
export const createEditableMetadataEntryDraft = (
  entry?: PgmlMetadataEntry
): PgmlEditableMetadataEntryDraft => {
  return {
    id: nanoid(),
    key: entry?.key || '',
    value: entry?.value || ''
  }
}

const isEmptyEditableMetadataEntryDraft = (entry: PgmlEditableMetadataEntryDraft) => {
  return trimEditorValue(entry.key).length === 0 && trimEditorValue(entry.value).length === 0
}

export const serializeEditableMetadataEntries = (
  entries: PgmlEditableMetadataEntryDraft[]
) => {
  return entries.reduce<PgmlMetadataEntry[]>((nextEntries, entry) => {
    if (isEmptyEditableMetadataEntryDraft(entry)) {
      return nextEntries
    }

    const key = trimEditorValue(entry.key)

    if (key.length === 0) {
      return nextEntries
    }

    nextEntries.push({
      key,
      value: trimEditorValue(entry.value)
    })

    return nextEntries
  }, [])
}

const toEditableColumnDraft = (column: PgmlColumn): PgmlEditableColumnDraft => {
  const referenceTableParts = column.reference?.toTable.split('.') || []

  return {
    customMetadata: column.customMetadata.map(entry => createEditableMetadataEntryDraft(entry)),
    id: nanoid(),
    defaultValue: extractDefaultModifier(column.modifiers),
    extraModifiers: extractColumnExtraModifiers(column),
    name: column.name,
    note: column.note || '',
    notNull: column.modifiers.some(modifier => modifier.toLowerCase() === 'not null'),
    originalName: column.name,
    primaryKey: column.modifiers.some((modifier) => {
      const normalizedModifier = modifier.toLowerCase()

      return normalizedModifier === 'pk' || normalizedModifier === 'primary key'
    }),
    referenceColumn: column.reference?.toColumn || '',
    referenceDeleteAction: column.reference?.onDelete || '',
    referenceEnabled: Boolean(column.reference),
    referenceRelation: column.reference?.relation || '>',
    referenceSchema: referenceTableParts.length >= 2 ? referenceTableParts[0] || 'public' : 'public',
    referenceTable: referenceTableParts.length >= 2
      ? referenceTableParts[1] || ''
      : (referenceTableParts[0] || ''),
    referenceUpdateAction: column.reference?.onUpdate || '',
    type: column.type,
    unique: column.modifiers.some(modifier => modifier.toLowerCase() === 'unique')
  }
}
const serializeColumn = (column: PgmlEditableColumnDraft) => {
  const modifiers: string[] = []

  if (column.primaryKey) {
    modifiers.push('pk')
  }

  if (column.notNull) {
    modifiers.push('not null')
  }

  if (column.unique) {
    modifiers.push('unique')
  }

  if (trimEditorValue(column.defaultValue).length > 0) {
    modifiers.push(`default: ${trimEditorValue(column.defaultValue)}`)
  }

  if (trimEditorValue(column.note).length > 0) {
    modifiers.push(`note: ${trimEditorValue(column.note)}`)
  }

  const referenceModifier = serializeColumnReference(column)

  if (referenceModifier) {
    modifiers.push(referenceModifier)

    const deleteModifier = serializeReferenceActionModifier('delete', column.referenceDeleteAction)
    const updateModifier = serializeReferenceActionModifier('update', column.referenceUpdateAction)

    if (deleteModifier) {
      modifiers.push(deleteModifier)
    }

    if (updateModifier) {
      modifiers.push(updateModifier)
    }
  }

  modifiers.push(...column.extraModifiers.filter(modifier => trimEditorValue(modifier).length > 0))

  const modifierSuffix = modifiers.length > 0 ? ` [${modifiers.join(', ')}]` : ''

  return `  ${trimEditorValue(column.name)} ${trimEditorValue(column.type)}${modifierSuffix}`
}
const serializeGroupBlock = (groupName: string, tableNames: string[], note: string | null) => {
  const lines = [
    `TableGroup ${groupName} {`,
    ...tableNames.map(tableName => `  ${tableName}`)
  ]

  if (note && trimEditorValue(note).length > 0) {
    lines.push(`  Note: ${trimEditorValue(note)}`)
  }

  lines.push('}')

  return lines.join('\n')
}
const serializeTableBlock = (draft: PgmlEditableTableDraft) => {
  const groupName = normalizeGroupName(draft.groupName)
  const lines = [
    `Table ${trimEditorValue(draft.schema)}.${trimEditorValue(draft.name)}${groupName ? ` in ${groupName}` : ''} {`
  ]

  if (trimEditorValue(draft.note).length > 0) {
    lines.push(`  Note: ${trimEditorValue(draft.note)}`)
  }

  draft.columns.forEach((column) => {
    lines.push(serializeColumn(column))
  })

  draft.preservedIndexes.forEach((index) => {
    const typeSuffix = index.type.length > 0 ? ` [type: ${index.type}]` : ''

    lines.push(`  Index ${index.name} (${index.columns.join(', ')})${typeSuffix}`)
  })

  draft.preservedConstraints.forEach((constraint) => {
    lines.push(`  Constraint ${constraint.name}: ${constraint.expression}`)
  })

  lines.push('}')

  return lines.join('\n')
}
const splitSourceLines = (source: string) => {
  return source.length > 0 ? source.replaceAll('\r\n', '\n').split('\n') : []
}
const applySourceEdits = (source: string, edits: SourceEdit[]) => {
  const lines = splitSourceLines(source)
  const sortedEdits = [...edits].sort((left, right) => right.startLine - left.startLine)

  sortedEdits.forEach((edit) => {
    const startIndex = Math.max(0, edit.startLine - 1)
    const deleteCount = Math.max(0, edit.endLine - edit.startLine + 1)
    const replacementLines = splitSourceLines(edit.replacement)

    lines.splice(startIndex, deleteCount, ...replacementLines)
  })

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
const updateGroupBlock = (
  group: PgmlGroup,
  options: {
    addEntry?: string | null
    removeEntry?: string | null
    replaceEntry?: {
      nextEntry: string
      previousEntry: string
    } | null
  }
) => {
  const nextTableNames = normalizeGroupTableNames(group.tableNames)

  if (options.removeEntry) {
    const removeEntry = options.removeEntry
    const removeIndex = nextTableNames.findIndex(entry => entry === removeEntry)

    if (removeIndex >= 0) {
      nextTableNames.splice(removeIndex, 1)
    }
  }

  if (options.replaceEntry) {
    const replaceIndex = nextTableNames.findIndex(entry => entry === options.replaceEntry?.previousEntry)

    if (replaceIndex >= 0 && options.replaceEntry) {
      nextTableNames.splice(replaceIndex, 1, options.replaceEntry.nextEntry)
    }
  }

  if (options.addEntry && !nextTableNames.includes(options.addEntry)) {
    nextTableNames.push(options.addEntry)
  }

  return serializeGroupBlock(group.name, nextTableNames, group.note)
}
const getRangeEndLine = (sourceRange: PgmlSourceRange | undefined) => {
  return sourceRange?.endLine || 0
}
const buildGroupMembershipEdits = (
  model: PgmlSchemaModel,
  currentTable: PgmlTable | null,
  draft: PgmlEditableTableDraft
) => {
  const edits: SourceEdit[] = []
  const previousGroupName = normalizeGroupName(currentTable?.groupName)
  const nextGroupName = normalizeGroupName(draft.groupName)
  const previousGroup = previousGroupName
    ? model.groups.find(group => group.name === previousGroupName)
    : null
  const nextGroup = nextGroupName
    ? model.groups.find(group => group.name === nextGroupName)
    : null
  const previousEntry = currentTable
    ? normalizeTableListEntry(currentTable.schema, currentTable.name)
    : null
  const nextEntry = normalizeTableListEntry(draft.schema, draft.name)

  if (previousGroup && previousGroup.sourceRange) {
    const replacement = previousGroupName === nextGroupName
      ? updateGroupBlock(previousGroup, {
          replaceEntry: previousEntry && previousEntry !== nextEntry
            ? {
                previousEntry,
                nextEntry
              }
            : null
        })
      : updateGroupBlock(previousGroup, {
          removeEntry: previousEntry
        })

    edits.push({
      endLine: previousGroup.sourceRange.endLine,
      replacement,
      startLine: previousGroup.sourceRange.startLine
    })
  }

  if (nextGroup && nextGroup.sourceRange && previousGroupName !== nextGroupName) {
    edits.push({
      endLine: nextGroup.sourceRange.endLine,
      replacement: updateGroupBlock(nextGroup, {
        addEntry: nextEntry
      }),
      startLine: nextGroup.sourceRange.startLine
    })
  }

  return edits
}
const getCreateTableInsertLine = (model: PgmlSchemaModel, groupName: string | null) => {
  const normalizedGroupName = normalizeGroupName(groupName)

  if (normalizedGroupName) {
    const groupedTables = model.tables
      .filter(table => normalizeGroupName(table.groupName) === normalizedGroupName)
      .sort((left, right) => getRangeEndLine(left.sourceRange) - getRangeEndLine(right.sourceRange))
    const lastGroupedTable = groupedTables.at(-1)

    if (lastGroupedTable?.sourceRange) {
      return lastGroupedTable.sourceRange.endLine + 1
    }

    const group = model.groups.find(candidate => candidate.name === normalizedGroupName)

    if (group?.sourceRange) {
      return group.sourceRange.endLine + 1
    }
  }

  const lastTable = [...model.tables].sort((left, right) => getRangeEndLine(left.sourceRange) - getRangeEndLine(right.sourceRange)).at(-1)

  if (lastTable?.sourceRange) {
    return lastTable.sourceRange.endLine + 1
  }

  const lastGroup = [...model.groups].sort((left, right) => getRangeEndLine(left.sourceRange) - getRangeEndLine(right.sourceRange)).at(-1)

  if (lastGroup?.sourceRange) {
    return lastGroup.sourceRange.endLine + 1
  }

  return 1
}
const buildCreateGroupInsertEdit = (source: string, groupName: string, tableEntry: string) => {
  const sourceLines = splitSourceLines(source)
  const prefix = source.trim().length > 0 ? '\n\n' : ''

  return {
    endLine: sourceLines.length,
    replacement: `${prefix}${serializeGroupBlock(groupName, [tableEntry], null)}`,
    startLine: sourceLines.length + 1
  } satisfies SourceEdit
}

const getCreateGroupInsertLine = (model: PgmlSchemaModel) => {
  const lastGroup = [...model.groups]
    .sort((left, right) => getRangeEndLine(left.sourceRange) - getRangeEndLine(right.sourceRange))
    .at(-1)

  if (lastGroup?.sourceRange) {
    return lastGroup.sourceRange.endLine + 1
  }

  const firstSourceRange = [
    ...model.customTypes.map(item => item.sourceRange),
    ...model.sequences.map(item => item.sourceRange),
    ...model.functions.map(item => item.sourceRange),
    ...model.procedures.map(item => item.sourceRange),
    ...model.triggers.map(item => item.sourceRange),
    ...model.tables.map(item => item.sourceRange)
  ]
    .filter((entry): entry is PgmlSourceRange => Boolean(entry))
    .sort((left, right) => left.startLine - right.startLine)
    .at(0)

  return firstSourceRange?.startLine || 1
}

const buildCreateEmptyGroupInsertEdit = (source: string, draft: PgmlEditableGroupDraft, insertLine: number) => {
  const sourceLines = splitSourceLines(source)
  const groupBlock = serializeGroupBlock(trimEditorValue(draft.name), [], trimEditorValue(draft.note))
  const replacement = insertLine > sourceLines.length
    ? `${source.trim().length > 0 ? '\n\n' : ''}${groupBlock}`
    : `${groupBlock}\n\n`

  return {
    endLine: insertLine - 1,
    replacement,
    startLine: insertLine
  } satisfies SourceEdit
}

export const commonPgmlColumnTypes = [
  'bigint',
  'bigserial',
  'boolean',
  'date',
  'integer',
  'jsonb',
  'numeric',
  'serial',
  'text',
  'time',
  'timestamp',
  'timestamptz',
  'tsvector',
  'uuid',
  'varchar'
]

export const createEditableTableDraft = (table: PgmlTable): PgmlEditableTableDraft => {
  return {
    columns: table.columns.map(toEditableColumnDraft),
    customMetadata: table.customMetadata.map(entry => createEditableMetadataEntryDraft(entry)),
    groupName: normalizeGroupName(table.groupName),
    mode: 'edit',
    name: table.name,
    note: table.note || '',
    originalFullName: table.fullName,
    preservedConstraints: table.constraints,
    preservedIndexes: table.indexes,
    schema: table.schema
  }
}

export const createEditableTableDraftForGroup = (groupName: string | null = null): PgmlEditableTableDraft => {
  return {
    columns: [
      {
        customMetadata: [],
        id: nanoid(),
        defaultValue: '',
        extraModifiers: [],
        name: 'id',
        note: '',
        notNull: true,
        originalName: null,
        primaryKey: true,
        referenceColumn: '',
        referenceDeleteAction: '',
        referenceEnabled: false,
        referenceRelation: '>',
        referenceSchema: 'public',
        referenceTable: '',
        referenceUpdateAction: '',
        type: 'uuid',
        unique: false
      }
    ],
    customMetadata: [],
    groupName: normalizeGroupName(groupName),
    mode: 'create',
    name: '',
    note: '',
    originalFullName: null,
    preservedConstraints: [],
    preservedIndexes: [],
    schema: 'public'
  }
}

export const createEditableGroupDraft = (
  group: PgmlGroup,
  model: PgmlSchemaModel | null = null
): PgmlEditableGroupDraft => {
  return {
    color: model?.nodeProperties[getStoredGroupId(group.name)]?.color || '',
    mode: 'edit',
    name: group.name,
    note: group.note || '',
    originalName: group.name,
    tableNames: normalizeGroupTableNames(group.tableNames)
  }
}

export const createEditableGroupDraftForCreate = (): PgmlEditableGroupDraft => {
  return {
    color: '',
    mode: 'create',
    name: '',
    note: '',
    originalName: null,
    tableNames: []
  }
}

export const cloneEditableTableDraft = (draft: PgmlEditableTableDraft): PgmlEditableTableDraft => {
  return {
    columns: draft.columns.map(column => ({
      ...column,
      customMetadata: column.customMetadata.map(entry => ({
        ...entry
      })),
      extraModifiers: [...column.extraModifiers]
    })),
    customMetadata: draft.customMetadata.map(entry => ({
      ...entry
    })),
    groupName: draft.groupName,
    mode: draft.mode,
    name: draft.name,
    note: draft.note,
    originalFullName: draft.originalFullName,
    preservedConstraints: [...draft.preservedConstraints],
    preservedIndexes: [...draft.preservedIndexes],
    schema: draft.schema
  }
}

export const cloneEditableGroupDraft = (draft: PgmlEditableGroupDraft): PgmlEditableGroupDraft => {
  return {
    color: draft.color,
    mode: draft.mode,
    name: draft.name,
    note: draft.note,
    originalName: draft.originalName,
    tableNames: [...draft.tableNames]
  }
}

export const getEditableTableDraftErrors = (draft: PgmlEditableTableDraft) => {
  const errors: string[] = []
  const normalizedName = trimEditorValue(draft.name)
  const normalizedSchema = trimEditorValue(draft.schema)
  const validateMetadataEntries = (
    entries: PgmlEditableMetadataEntryDraft[],
    contextLabel: string
  ) => {
    const keys = new Map<string, number[]>()

    entries.forEach((entry, index) => {
      if (isEmptyEditableMetadataEntryDraft(entry)) {
        return
      }

      const normalizedKey = trimEditorValue(entry.key)

      if (normalizedKey.length === 0) {
        errors.push(`${contextLabel} metadata field ${index + 1} needs a key.`)
        return
      }

      if (normalizedKey.includes(':')) {
        errors.push(`${contextLabel} metadata field \`${normalizedKey}\` cannot contain \`:\`.`)
        return
      }

      const duplicateIndexes = keys.get(normalizedKey.toLowerCase()) || []
      duplicateIndexes.push(index + 1)
      keys.set(normalizedKey.toLowerCase(), duplicateIndexes)
    })

    Array.from(keys.entries()).forEach(([key, indexes]) => {
      if (indexes.length > 1) {
        errors.push(`${contextLabel} metadata field \`${key}\` is duplicated.`)
      }
    })
  }

  if (normalizedName.length === 0) {
    errors.push('Table name is required.')
  }

  if (normalizedSchema.length === 0) {
    errors.push('Schema is required.')
  }

  if (!draft.columns.length) {
    errors.push('Add at least one column.')
  }

  validateMetadataEntries(draft.customMetadata, 'Table')

  draft.columns.forEach((column, index) => {
    if (trimEditorValue(column.name).length === 0) {
      errors.push(`Column ${index + 1} needs a name.`)
    }

    if (trimEditorValue(column.type).length === 0) {
      errors.push(`Column ${index + 1} needs a type.`)
    }

    if (column.referenceEnabled) {
      if (trimEditorValue(column.referenceTable).length === 0) {
        errors.push(`Column ${index + 1} needs a reference table.`)
      }

      if (trimEditorValue(column.referenceColumn).length === 0) {
        errors.push(`Column ${index + 1} needs a reference column.`)
      }
    }

    validateMetadataEntries(column.customMetadata, `Column ${index + 1}`)
  })

  return Array.from(new Set(errors))
}

export const getEditableGroupDraftErrors = (draft: PgmlEditableGroupDraft) => {
  const errors: string[] = []
  const normalizedColor = trimEditorValue(draft.color)

  if (trimEditorValue(draft.name).length === 0) {
    errors.push('Group name is required.')
  }

  if (normalizedColor.length > 0 && !colorValuePattern.test(normalizedColor)) {
    errors.push('Group color must use a 3- or 6-digit hex value.')
  }

  return errors
}

export const applyEditableTableDraftToSource = (
  source: string,
  model: PgmlSchemaModel,
  draft: PgmlEditableTableDraft
) => {
  const normalizedSource = source.replaceAll('\r\n', '\n')
  const currentTable = draft.originalFullName
    ? model.tables.find(table => table.fullName === draft.originalFullName) || null
    : null
  const tableBlock = serializeTableBlock(draft)
  const edits: SourceEdit[] = buildGroupMembershipEdits(model, currentTable, draft)

  if (draft.mode === 'edit' && currentTable?.sourceRange) {
    edits.push({
      endLine: currentTable.sourceRange.endLine,
      replacement: tableBlock,
      startLine: currentTable.sourceRange.startLine
    })

    return applySourceEdits(normalizedSource, edits)
  }

  const nextGroupName = normalizeGroupName(draft.groupName)
  const nextGroup = nextGroupName
    ? model.groups.find(group => group.name === nextGroupName) || null
    : null

  if (nextGroupName && !nextGroup) {
    edits.push(buildCreateGroupInsertEdit(normalizedSource, nextGroupName, normalizeTableListEntry(draft.schema, draft.name)))
  }

  const insertLine = getCreateTableInsertLine(model, nextGroupName)
  const prefix = normalizedSource.trim().length > 0 ? '\n\n' : ''

  edits.push({
    endLine: insertLine - 1,
    replacement: `${prefix}${tableBlock}`,
    startLine: insertLine
  })

  return applySourceEdits(normalizedSource, edits)
}

export const applyEditableGroupDraftToSource = (
  source: string,
  model: PgmlSchemaModel,
  draft: PgmlEditableGroupDraft
) => {
  const normalizedSource = source.replaceAll('\r\n', '\n')
  const normalizedColor = trimEditorValue(draft.color)
  const currentGroup = draft.originalName
    ? model.groups.find(group => group.name === draft.originalName) || null
    : null

  const applySelectedTableMemberships = (nextSource: string) => {
    const nextGroupName = trimEditorValue(draft.name)
    const selectedTableNames = new Set(getNormalizedSelectedGroupTableNames(draft.tableNames))
    const managedTableNames = new Set<string>(selectedTableNames)

    if (draft.originalName) {
      model.tables
        .filter(table => normalizeGroupName(table.groupName) === draft.originalName)
        .forEach((table) => {
          managedTableNames.add(table.fullName)
        })
    }

    let workingSource = nextSource
    let workingModel = parsePgml(workingSource)

    for (const tableName of managedTableNames) {
      const workingTable = workingModel.tables.find(table => table.fullName === tableName)

      if (!workingTable) {
        continue
      }

      const nextTableGroupName = selectedTableNames.has(tableName) ? nextGroupName : null

      if (normalizeGroupName(workingTable.groupName) === nextTableGroupName) {
        continue
      }

      const tableDraft = createEditableTableDraft(workingTable)
      tableDraft.groupName = nextTableGroupName
      workingSource = applyEditableTableDraftToSource(workingSource, workingModel, tableDraft)
      workingModel = parsePgml(workingSource)
    }

    return workingSource
  }
  const applyGroupColorProperties = (nextSource: string, groupName: string) => {
    const nextModel = parsePgml(nextSource)
    const nextNodeProperties = { ...nextModel.nodeProperties }
    const groupId = getStoredGroupId(groupName)
    const nextProperties: PgmlNodeProperties = {
      ...(nextNodeProperties[groupId] || {})
    }
    const hasPersistableProperties = [
      typeof nextProperties.x === 'number',
      typeof nextProperties.y === 'number',
      typeof nextProperties.collapsed === 'boolean',
      nextProperties.visible === false,
      typeof nextProperties.tableColumns === 'number',
      hasStoredPgmlTableWidthScale(nextProperties.tableWidthScale),
      nextProperties.masonry === true
    ].some(Boolean)

    if (normalizedColor.length > 0) {
      nextProperties.color = normalizedColor
      nextNodeProperties[groupId] = nextProperties

      return buildPgmlWithNodeProperties(nextSource, nextNodeProperties)
    }

    if (hasPersistableProperties) {
      const { color: _removedColor, ...remainingProperties } = nextProperties

      nextNodeProperties[groupId] = remainingProperties

      return buildPgmlWithNodeProperties(nextSource, nextNodeProperties)
    }

    const { [groupId]: _removedGroup, ...remainingNodeProperties } = nextNodeProperties

    return buildPgmlWithNodeProperties(nextSource, remainingNodeProperties)
  }

  if (draft.mode === 'create') {
    const insertLine = getCreateGroupInsertLine(model)

    return applyGroupColorProperties(applySelectedTableMemberships(applySourceEdits(normalizedSource, [
      buildCreateEmptyGroupInsertEdit(normalizedSource, draft, insertLine)
    ])), trimEditorValue(draft.name))
  }

  if (!currentGroup?.sourceRange) {
    return normalizedSource
  }

  const nextName = trimEditorValue(draft.name)
  const nextNote = trimEditorValue(draft.note)
  const edits: SourceEdit[] = [{
    endLine: currentGroup.sourceRange.endLine,
    replacement: serializeGroupBlock(nextName, normalizeGroupTableNames(currentGroup.tableNames), nextNote),
    startLine: currentGroup.sourceRange.startLine
  }]
  const sourceLines = splitSourceLines(normalizedSource)

  if (currentGroup.name !== nextName) {
    model.tables
      .filter(table => table.groupName === currentGroup.name && table.sourceRange)
      .forEach((table) => {
        const startLine = table.sourceRange?.startLine || 0
        const originalHeader = sourceLines[startLine - 1] || ''

        if (!originalHeader.includes(` in ${currentGroup.name}`)) {
          return
        }

        edits.push({
          endLine: startLine,
          replacement: originalHeader.replace(
            new RegExp(`\\sin\\s${escapeRegExp(currentGroup.name)}(?=\\s*\\{)`),
            ` in ${nextName}`
          ),
          startLine
        })
      })
  }

  const nextSource = applySourceEdits(normalizedSource, edits)

  if (currentGroup.name === nextName) {
    return applyGroupColorProperties(applySelectedTableMemberships(nextSource), nextName)
  }

  return applyGroupColorProperties(applySelectedTableMemberships(nextSource.replace(
    new RegExp(`Properties\\s+"group:${escapeRegExp(currentGroup.name)}"`, 'g'),
    `Properties "group:${nextName}"`
  )), nextName)
}
