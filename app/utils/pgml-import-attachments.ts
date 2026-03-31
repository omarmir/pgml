import type {
  PgmlAffects,
  PgmlDocumentation,
  PgmlMetadataEntry,
  PgmlRoutine,
  PgmlSchemaModel,
  PgmlSourceRange,
  PgmlTable
} from './pgml'
import {
  getPgmlSourceSelectionRange,
  getSequenceAttachedTableIds,
  parsePgml,
  replacePgmlExecutableMetadataInBlock,
  replacePgmlSourceRange
} from './pgml'

export type PgmlImportExecutableAttachmentCandidate = {
  id: string
  kind: 'Function' | 'Procedure' | 'Sequence'
  name: string
  selectedTableIds: string[]
  sourceRange: PgmlSourceRange
  subtitle: string
}

export type PgmlImportExecutableAttachmentTableOption = {
  label: string
  value: string
}

export type PreparedPgmlImportExecutableAttachments = {
  candidates: PgmlImportExecutableAttachmentCandidate[]
  pgml: string
  tableOptions: PgmlImportExecutableAttachmentTableOption[]
}

type PgmlExecutableAttachmentTarget = {
  affects: PgmlAffects | null
  docs: PgmlDocumentation | null
  id: string
  kind: 'Function' | 'Procedure' | 'Sequence'
  metadata: PgmlMetadataEntry[]
  name: string
  sourceRange?: PgmlSourceRange
  subtitle: string
}

type PgmlExecutableAttachmentSelection = {
  id: string
  tableIds: string[]
}

const importAttachmentMetadataKeys = new Set([
  'attach_to',
  'attach_to_table',
  'attach_to_tables',
  'owned_by',
  'parent_table',
  'parent_tables',
  'table',
  'table_id',
  'table_ids',
  'tables'
])

const attachmentCommentLabelPattern = /^(?:--|\/\/|#|\*+)?\s*(attach_to|attach_to_table|attach_to_tables|owned_by|parent_table|parent_tables|table|table_id|table_ids|tables)\s*:\s*(.+)$/i

const lower = (value: string) => value.toLowerCase()
const uniqueValues = <Value>(values: Value[]) => Array.from(new Set(values))
const sanitizeReferenceValue = (value: string) => {
  return value
    .trim()
    .replaceAll('"', '')
    .replaceAll('\'', '')
    .replace(/[(),;]/g, '')
}

const normalizeReferenceValue = (value: string) => lower(sanitizeReferenceValue(value))

const buildTableReferenceLookup = (tables: PgmlTable[]) => {
  const bareNameMatches = tables.reduce<Record<string, string[]>>((entries, table) => {
    const bareName = lower(table.name)

    if (!entries[bareName]) {
      entries[bareName] = []
    }

    entries[bareName]?.push(table.fullName)
    return entries
  }, {})
  const referenceLookup = new Map<string, string>()

  tables.forEach((table) => {
    referenceLookup.set(lower(table.fullName), table.fullName)

    if (table.schema === 'public') {
      referenceLookup.set(lower(table.name), table.fullName)
    }
  })

  Object.entries(bareNameMatches).forEach(([bareName, fullNames]) => {
    if (fullNames.length === 1) {
      referenceLookup.set(bareName, fullNames[0] || '')
    }
  })

  return referenceLookup
}

const resolveTableIdentifier = (
  tables: PgmlTable[],
  referenceLookup: Map<string, string>,
  value: string
) => {
  const normalized = normalizeReferenceValue(value)

  if (!normalized) {
    return null
  }

  const directMatch = referenceLookup.get(normalized)

  if (directMatch) {
    return directMatch
  }

  return tables.find(table => lower(table.name) === normalized)?.fullName || null
}

const resolveTableIdsFromValue = (
  tables: PgmlTable[],
  referenceLookup: Map<string, string>,
  value: string
) => {
  const normalizedValue = sanitizeReferenceValue(value)

  if (!normalizedValue) {
    return []
  }

  const parts = normalizedValue.split('.').filter(part => part.length > 0)

  if (parts.length >= 3) {
    const qualifiedTableId = resolveTableIdentifier(
      tables,
      referenceLookup,
      `${parts[0]}.${parts[1]}`
    )

    if (qualifiedTableId) {
      return [qualifiedTableId]
    }

    const tableWithoutColumnId = resolveTableIdentifier(
      tables,
      referenceLookup,
      parts.slice(0, -1).join('.')
    )

    if (tableWithoutColumnId) {
      return [tableWithoutColumnId]
    }
  }

  if (parts.length === 2) {
    const qualifiedTableId = resolveTableIdentifier(
      tables,
      referenceLookup,
      `${parts[0]}.${parts[1]}`
    )

    if (qualifiedTableId) {
      return [qualifiedTableId]
    }

    const matchingTable = tables.find((table) => {
      return lower(table.name) === lower(parts[0] || '')
    })

    if (matchingTable && matchingTable.columns.some(column => lower(column.name) === lower(parts[1] || ''))) {
      return [matchingTable.fullName]
    }
  }

  const directTableId = resolveTableIdentifier(tables, referenceLookup, normalizedValue)

  return directTableId ? [directTableId] : []
}

const resolveTableIdsFromValues = (tables: PgmlTable[], values: string[]) => {
  const referenceLookup = buildTableReferenceLookup(tables)

  return uniqueValues(values.flatMap(value => resolveTableIdsFromValue(tables, referenceLookup, value)))
}

const getMetadataValue = (metadata: PgmlMetadataEntry[], key: string) => {
  return metadata.find(entry => lower(entry.key) === lower(key))?.value || null
}

const getRoutineNameSearchKeys = (value: string) => {
  return uniqueValues([
    lower(value),
    lower(value.split('.').at(-1) || value)
  ]).filter(entry => entry.length > 0)
}

const splitAttachmentMetadataValues = (value: string) => {
  const trimmedValue = value.trim()

  if (trimmedValue.length === 0) {
    return []
  }

  const literalValue = trimmedValue.startsWith('[') && trimmedValue.endsWith(']')
    ? trimmedValue.slice(1, -1)
    : trimmedValue

  return literalValue
    .split(/[;,]/)
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)
}

const getAttachmentTableIdsFromMetadata = (tables: PgmlTable[], metadata: PgmlMetadataEntry[]) => {
  const values = metadata.flatMap((entry) => {
    return importAttachmentMetadataKeys.has(lower(entry.key))
      ? splitAttachmentMetadataValues(entry.value)
      : []
  })

  return resolveTableIdsFromValues(tables, values)
}

const getAttachmentTableIdsFromText = (tables: PgmlTable[], value: string | null | undefined) => {
  if (!value) {
    return []
  }

  const values = value
    .replaceAll('\r\n', '\n')
    .split('\n')
    .flatMap((line) => {
      const match = line.trim().match(attachmentCommentLabelPattern)

      return match ? splitAttachmentMetadataValues(match[2] || '') : []
    })

  return resolveTableIdsFromValues(tables, values)
}

const getTriggerTableIdsByRoutineName = (model: PgmlSchemaModel) => {
  const mapping = new Map<string, string[]>()
  const referenceLookup = buildTableReferenceLookup(model.tables)

  model.triggers.forEach((trigger) => {
    const routineName = getMetadataValue(trigger.metadata, 'function')

    if (!routineName) {
      return
    }

    const tableId = resolveTableIdentifier(model.tables, referenceLookup, trigger.tableName)

    if (!tableId) {
      return
    }

    getRoutineNameSearchKeys(routineName).forEach((key) => {
      mapping.set(key, uniqueValues([...(mapping.get(key) || []), tableId]))
    })
  })

  return mapping
}

const getRoutineAttachedTableIds = (
  model: PgmlSchemaModel,
  routine: PgmlRoutine,
  triggerTableIdsByRoutineName: Map<string, string[]>
) => {
  const affectValues = routine.affects
    ? [
        ...routine.affects.calls,
        ...routine.affects.dependsOn,
        ...routine.affects.ownedBy,
        ...routine.affects.reads,
        ...routine.affects.sets,
        ...routine.affects.uses,
        ...routine.affects.writes
      ]
    : []
  const triggerTableIds = uniqueValues(getRoutineNameSearchKeys(routine.name).flatMap((key) => {
    return triggerTableIdsByRoutineName.get(key) || []
  }))

  return uniqueValues([
    ...triggerTableIds,
    ...resolveTableIdsFromValues(model.tables, affectValues)
  ])
}

const buildExecutableMetadataSections = (
  target: PgmlExecutableAttachmentTarget,
  nextOwnedBy: string[]
) => {
  return {
    affects: {
      calls: target.affects?.calls || [],
      dependsOn: target.affects?.dependsOn || [],
      extras: target.affects?.extras || [],
      ownedBy: nextOwnedBy,
      reads: target.affects?.reads || [],
      sets: target.affects?.sets || [],
      uses: target.affects?.uses || [],
      writes: target.affects?.writes || []
    },
    docsEntries: target.docs?.entries || [],
    docsSummary: target.docs?.summary || '',
    metadata: target.metadata.filter((entry) => {
      return !importAttachmentMetadataKeys.has(lower(entry.key))
    })
  }
}

const replaceExecutableAttachmentSelections = (
  source: string,
  model: PgmlSchemaModel,
  selections: PgmlExecutableAttachmentSelection[]
) => {
  const executableById = new Map<string, PgmlExecutableAttachmentTarget>()

  model.functions.forEach((routine) => {
    executableById.set(`function:${routine.name}`, {
      affects: routine.affects,
      docs: routine.docs,
      id: `function:${routine.name}`,
      kind: 'Function',
      metadata: routine.metadata,
      name: routine.name,
      sourceRange: routine.sourceRange,
      subtitle: routine.signature
    })
  })

  model.procedures.forEach((routine) => {
    executableById.set(`procedure:${routine.name}`, {
      affects: routine.affects,
      docs: routine.docs,
      id: `procedure:${routine.name}`,
      kind: 'Procedure',
      metadata: routine.metadata,
      name: routine.name,
      sourceRange: routine.sourceRange,
      subtitle: routine.signature
    })
  })

  model.sequences.forEach((sequence) => {
    executableById.set(`sequence:${sequence.name}`, {
      affects: sequence.affects,
      docs: sequence.docs,
      id: `sequence:${sequence.name}`,
      kind: 'Sequence',
      metadata: sequence.metadata,
      name: sequence.name,
      sourceRange: sequence.sourceRange,
      subtitle: 'Sequence'
    })
  })

  const normalizedSelections = selections
    .map((selection) => {
      const executable = executableById.get(selection.id)
      const tableIds = uniqueValues(selection.tableIds)

      if (!executable?.sourceRange || tableIds.length === 0) {
        return null
      }

      const existingOwnedBy = executable.affects?.ownedBy || []
      const nextOwnedBy = uniqueValues([...existingOwnedBy, ...tableIds])

      if (existingOwnedBy.length === nextOwnedBy.length && existingOwnedBy.every(value => nextOwnedBy.includes(value))) {
        return null
      }

      return {
        executable,
        tableIds: nextOwnedBy
      }
    })
    .filter(entry => entry !== null)
    .sort((left, right) => {
      return (right.executable.sourceRange?.startLine || 0) - (left.executable.sourceRange?.startLine || 0)
    })

  return normalizedSelections.reduce((nextSource, entry) => {
    const sourceRange = entry.executable.sourceRange

    if (!sourceRange) {
      return nextSource
    }

    const selectionRange = getPgmlSourceSelectionRange(nextSource, sourceRange)

    if (!selectionRange) {
      throw new Error(`Unable to locate imported ${entry.executable.kind.toLowerCase()} block for ${entry.executable.name}.`)
    }

    const blockSource = nextSource.slice(selectionRange.start, selectionRange.end)
    const nextBlockSource = replacePgmlExecutableMetadataInBlock(
      blockSource,
      buildExecutableMetadataSections(entry.executable, entry.tableIds)
    )

    if (!nextBlockSource) {
      throw new Error(`Unable to rewrite imported ${entry.executable.kind.toLowerCase()} metadata for ${entry.executable.name}.`)
    }

    const replacedSource = replacePgmlSourceRange(nextSource, sourceRange, nextBlockSource)

    if (!replacedSource) {
      throw new Error(`Unable to store imported ${entry.executable.kind.toLowerCase()} metadata for ${entry.executable.name}.`)
    }

    return replacedSource
  }, source)
}

const collectAutoAttachmentSelections = (model: PgmlSchemaModel) => {
  const triggerTableIdsByRoutineName = getTriggerTableIdsByRoutineName(model)
  const selections: PgmlExecutableAttachmentSelection[] = []

  const collectRoutineSelections = (
    routines: PgmlRoutine[],
    prefix: 'function' | 'procedure'
  ) => {
    routines.forEach((routine) => {
      const metadataTableIds = getAttachmentTableIdsFromMetadata(model.tables, routine.metadata)
      const sourceTableIds = getAttachmentTableIdsFromText(model.tables, routine.source)
      const noteTableIds = routine.metadata.flatMap((entry) => {
        return lower(entry.key) === 'note'
          ? getAttachmentTableIdsFromText(model.tables, entry.value)
          : []
      })
      const triggerTableIds = uniqueValues(getRoutineNameSearchKeys(routine.name).flatMap((key) => {
        return triggerTableIdsByRoutineName.get(key) || []
      }))
      const tableIds = uniqueValues([
        ...triggerTableIds,
        ...metadataTableIds,
        ...sourceTableIds,
        ...noteTableIds
      ])

      if (tableIds.length > 0) {
        selections.push({
          id: `${prefix}:${routine.name}`,
          tableIds
        })
      }
    })
  }

  collectRoutineSelections(model.functions, 'function')
  collectRoutineSelections(model.procedures, 'procedure')

  model.sequences.forEach((sequence) => {
    const attachedTableIds = getSequenceAttachedTableIds(model.tables, sequence)

    if (attachedTableIds.length > 0) {
      return
    }

    const metadataTableIds = getAttachmentTableIdsFromMetadata(model.tables, sequence.metadata)
    const sourceTableIds = getAttachmentTableIdsFromText(model.tables, sequence.source)
    const noteTableIds = sequence.metadata.flatMap((entry) => {
      return lower(entry.key) === 'note'
        ? getAttachmentTableIdsFromText(model.tables, entry.value)
        : []
    })
    const tableIds = uniqueValues([
      ...metadataTableIds,
      ...sourceTableIds,
      ...noteTableIds
    ])

    if (tableIds.length > 0) {
      selections.push({
        id: `sequence:${sequence.name}`,
        tableIds
      })
    }
  })

  return selections
}

const collectManualAttachmentCandidates = (model: PgmlSchemaModel) => {
  const triggerTableIdsByRoutineName = getTriggerTableIdsByRoutineName(model)
  const candidates: PgmlImportExecutableAttachmentCandidate[] = []

  model.functions.forEach((routine) => {
    if (!routine.sourceRange || getRoutineAttachedTableIds(model, routine, triggerTableIdsByRoutineName).length > 0) {
      return
    }

    candidates.push({
      id: `function:${routine.name}`,
      kind: 'Function',
      name: routine.name,
      selectedTableIds: [],
      sourceRange: routine.sourceRange,
      subtitle: routine.signature
    })
  })

  model.procedures.forEach((routine) => {
    if (!routine.sourceRange || getRoutineAttachedTableIds(model, routine, triggerTableIdsByRoutineName).length > 0) {
      return
    }

    candidates.push({
      id: `procedure:${routine.name}`,
      kind: 'Procedure',
      name: routine.name,
      selectedTableIds: [],
      sourceRange: routine.sourceRange,
      subtitle: routine.signature
    })
  })

  model.sequences.forEach((sequence) => {
    if (!sequence.sourceRange || getSequenceAttachedTableIds(model.tables, sequence).length > 0) {
      return
    }

    candidates.push({
      id: `sequence:${sequence.name}`,
      kind: 'Sequence',
      name: sequence.name,
      selectedTableIds: [],
      sourceRange: sequence.sourceRange,
      subtitle: 'Sequence'
    })
  })

  return candidates
}

export const applyImportedExecutableAttachmentSelections = (
  source: string,
  candidates: PgmlImportExecutableAttachmentCandidate[]
) => {
  const selections = candidates
    .filter(candidate => candidate.selectedTableIds.length > 0)
    .map((candidate) => {
      return {
        id: candidate.id,
        tableIds: candidate.selectedTableIds
      }
    })

  if (selections.length === 0) {
    return source
  }

  const nextSource = replaceExecutableAttachmentSelections(source, parsePgml(source), selections)
  parsePgml(nextSource)

  return nextSource
}

export const prepareImportedExecutableAttachments = (
  source: string
): PreparedPgmlImportExecutableAttachments => {
  const initialModel = parsePgml(source)
  const autoSelections = collectAutoAttachmentSelections(initialModel)
  const preparedSource = autoSelections.length > 0
    ? replaceExecutableAttachmentSelections(source, initialModel, autoSelections)
    : source
  const preparedModel = parsePgml(preparedSource)

  return {
    candidates: collectManualAttachmentCandidates(preparedModel),
    pgml: preparedSource,
    tableOptions: preparedModel.tables
      .map((table) => {
        return {
          label: table.fullName,
          value: table.fullName
        }
      })
      .sort((left, right) => left.label.localeCompare(right.label))
  }
}
