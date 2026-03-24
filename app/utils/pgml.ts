import {
  hasStoredPgmlTableWidthScale,
  normalizePgmlTableWidthScale
} from './pgml-node-properties'

export type PgmlColumn = {
  name: string
  type: string
  modifiers: string[]
  note: string | null
  reference: PgmlReference | null
}

export type PgmlSourceRange = {
  startLine: number
  endLine: number
}

export type PgmlTable = {
  name: string
  schema: string
  fullName: string
  groupName: string | null
  note: string | null
  columns: PgmlColumn[]
  indexes: PgmlIndex[]
  constraints: PgmlConstraint[]
  sourceRange?: PgmlSourceRange
}

export type PgmlIndex = {
  name: string
  tableName: string
  columns: string[]
  type: string
  sourceRange?: PgmlSourceRange
}

export type PgmlConstraint = {
  name: string
  tableName: string
  expression: string
  sourceRange?: PgmlSourceRange
}

export type PgmlReference = {
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
  relation: '>' | '<' | '-'
  onDelete: string | null
  onUpdate: string | null
}

export type PgmlGroup = {
  name: string
  tableNames: string[]
  note: string | null
  sourceRange?: PgmlSourceRange
}

export type PgmlNodeProperties = {
  color?: string
  x?: number
  y?: number
  width?: number
  height?: number
  tableColumns?: number | null
  tableWidthScale?: number | null
  collapsed?: boolean
  visible?: boolean
  masonry?: boolean
}

export type PgmlMetadataEntry = {
  key: string
  value: string
}

export type PgmlDocumentationEntry = {
  key: string
  value: string
}

export type PgmlDocumentation = {
  summary: string | null
  entries: PgmlDocumentationEntry[]
}

export type PgmlAffectsExtraEntry = {
  key: string
  values: string[]
}

export type PgmlAffects = {
  writes: string[]
  sets: string[]
  dependsOn: string[]
  reads: string[]
  calls: string[]
  uses: string[]
  ownedBy: string[]
  extras: PgmlAffectsExtraEntry[]
}

export type PgmlRoutine = {
  name: string
  signature: string
  details: string[]
  metadata: PgmlMetadataEntry[]
  docs: PgmlDocumentation | null
  affects: PgmlAffects | null
  source: string | null
  sourceRange?: PgmlSourceRange
}

export type PgmlTrigger = {
  name: string
  tableName: string
  details: string[]
  metadata: PgmlMetadataEntry[]
  docs: PgmlDocumentation | null
  affects: PgmlAffects | null
  source: string | null
  sourceRange?: PgmlSourceRange
}

export type PgmlSequence = {
  name: string
  details: string[]
  metadata: PgmlMetadataEntry[]
  docs: PgmlDocumentation | null
  affects: PgmlAffects | null
  source: string | null
  sourceRange?: PgmlSourceRange
}

export type PgmlEnumType = {
  kind: 'Enum'
  name: string
  values: string[]
  details: string[]
  sourceRange?: PgmlSourceRange
}

export type PgmlDomainType = {
  kind: 'Domain'
  name: string
  baseType: string | null
  check: string | null
  details: string[]
  sourceRange?: PgmlSourceRange
}

export type PgmlCompositeField = {
  name: string
  type: string
}

export type PgmlCompositeType = {
  kind: 'Composite'
  name: string
  fields: PgmlCompositeField[]
  details: string[]
  sourceRange?: PgmlSourceRange
}

export type PgmlCustomType = PgmlEnumType
  | PgmlDomainType
  | PgmlCompositeType

type PgmlCustomTypeBase = {
  kind: 'Enum' | 'Domain' | 'Composite'
  name: string
  details: string[]
  sourceRange?: PgmlSourceRange
}

export type PgmlSchemaModel = {
  tables: PgmlTable[]
  groups: PgmlGroup[]
  references: PgmlReference[]
  functions: PgmlRoutine[]
  procedures: PgmlRoutine[]
  triggers: PgmlTrigger[]
  sequences: PgmlSequence[]
  customTypes: PgmlCustomType[]
  schemas: string[]
  nodeProperties: Record<string, PgmlNodeProperties>
}

type NamedBlock = {
  header: string
  body: string[]
  startLine: number
  endLine: number
  bodyStartLine: number
}

type ParsedExecutableBody = {
  metadata: PgmlMetadataEntry[]
  docs: PgmlDocumentation | null
  affects: PgmlAffects | null
  source: string | null
  details: string[]
}

type DerivedRoutineSource = {
  name: string | null
  signature: string | null
  metadata: PgmlMetadataEntry[]
}

type DerivedTriggerSource = {
  name: string | null
  tableName: string | null
  metadata: PgmlMetadataEntry[]
}

type DerivedSequenceSource = {
  name: string | null
  metadata: PgmlMetadataEntry[]
}

const cleanName = (value: string) => value.replaceAll('"', '').trim()
const cleanText = (value: string) => value.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
const readMatch = (value: string | undefined) => value || ''
const trimMultiline = (value: string) => value.replace(/^\n+|\n+$/g, '')
const normalizeEffectKey = (value: string) => cleanName(value).toLowerCase().replaceAll(/[^\w]+/g, '_')
const normalizeSource = (value: string) => value.replaceAll('\n', ' ').replace(/\s+/g, ' ').trim()
const lower = (value: string) => value.toLowerCase()
const getModifierValue = (modifiers: string[], key: string) => {
  const modifier = modifiers.find((entry) => {
    return entry.toLowerCase().startsWith(`${key}:`)
  })

  if (!modifier) {
    return null
  }

  return modifier.slice(modifier.indexOf(':') + 1).trim().toLowerCase()
}

const parseBracketParts = (value: string) => {
  return value
    .split(',')
    .map(part => part.trim())
    .filter(part => part.length > 0)
}

const parseListValue = (value: string) => {
  const trimmed = value.trim()
  const listMatch = trimmed.match(/^\[(.*)\]$/)

  if (listMatch) {
    return readMatch(listMatch[1])
      .split(',')
      .map(entry => cleanText(entry))
      .filter(entry => entry.length > 0)
  }

  return [cleanText(trimmed)]
}

const resolveGroupTableReferenceKey = (value: string) => lower(cleanName(value))

const buildGroupTableReferenceLookup = (tables: PgmlTable[]) => {
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

const cleanForSearch = (value: string) => lower(value).replaceAll(/[^\w.]+/g, ' ')
const sanitizeReferenceValue = (value: string) => {
  return value
    .trim()
    .replaceAll('"', '')
    .replaceAll('\'', '')
    .replace(/[(),;]/g, '')
}
const uniqueValues = <Value>(values: Value[]) => Array.from(new Set(values))
const resolveTableIdentifier = (
  tables: PgmlTable[],
  referenceLookup: Map<string, string>,
  value: string
) => {
  const normalized = sanitizeReferenceValue(value).toLowerCase()

  if (!normalized) {
    return null
  }

  const directMatch = referenceLookup.get(normalized)

  if (directMatch) {
    return directMatch
  }

  const byName = tables.find(table => lower(table.name) === normalized)

  return byName?.fullName || null
}
const resolveTableIdsFromValue = (
  tables: PgmlTable[],
  referenceLookup: Map<string, string>,
  value: string,
  defaultTableId: string | null = null
) => {
  const normalized = sanitizeReferenceValue(value)

  if (!normalized) {
    return []
  }

  const parts = normalized.split('.')

  if (
    parts.length === 2
    && defaultTableId
    && (lower(parts[0] || '') === 'new' || lower(parts[0] || '') === 'old')
  ) {
    return [defaultTableId]
  }

  if (parts.length === 3) {
    const tableId = resolveTableIdentifier(tables, referenceLookup, `${parts[0]}.${parts[1]}`)

    return tableId ? [tableId] : []
  }

  if (parts.length === 2) {
    const fullTableMatch = resolveTableIdentifier(tables, referenceLookup, `${parts[0]}.${parts[1]}`)

    if (fullTableMatch) {
      return [fullTableMatch]
    }

    const matchingTable = tables.find((table) => {
      return lower(table.name) === lower(parts[0] || '')
    })

    if (matchingTable && matchingTable.columns.some(column => lower(column.name) === lower(parts[1] || ''))) {
      return [matchingTable.fullName]
    }
  }

  const directTable = resolveTableIdentifier(tables, referenceLookup, normalized)

  if (directTable) {
    return [directTable]
  }

  if (defaultTableId) {
    const defaultTable = tables.find(table => table.fullName === defaultTableId)

    if (defaultTable?.columns.some(column => lower(column.name) === lower(normalized))) {
      return [defaultTableId]
    }
  }

  return []
}
const getTableIdsFromValues = (
  tables: PgmlTable[],
  referenceLookup: Map<string, string>,
  values: string[],
  defaultTableId: string | null = null
) => {
  return uniqueValues(values.flatMap(value => resolveTableIdsFromValue(tables, referenceLookup, value, defaultTableId)))
}
const inferSourceTableIds = (
  tables: PgmlTable[],
  referenceLookup: Map<string, string>,
  source: string,
  defaultTableId: string | null = null
) => {
  const values: string[] = []

  Array.from(source.matchAll(/\b(?:insert\s+into|update|delete\s+from|from|join|on|owned\s+by)\s+([a-zA-Z_"][\w."]*)/gi)).forEach((match) => {
    const identifier = match[1] || ''

    if (identifier.length > 0) {
      values.push(identifier)
    }
  })

  Array.from(source.matchAll(/\b(?:NEW|OLD)\.([a-zA-Z_]\w*)/g)).forEach((match) => {
    const columnName = match[1] || ''

    if (columnName.length > 0) {
      values.push(`NEW.${columnName}`)
    }
  })

  return getTableIdsFromValues(tables, referenceLookup, values, defaultTableId)
}
const inferRoutineTableIds = (tables: PgmlTable[], routine: PgmlRoutine) => {
  const haystack = cleanForSearch(`${routine.signature} ${routine.details.join(' ')}`)
  const tableIds: string[] = []

  for (const table of tables) {
    const fullName = cleanForSearch(table.fullName)
    const bareName = cleanForSearch(table.name)
    const singularName = bareName.endsWith('s') ? bareName.slice(0, -1) : bareName

    if (
      haystack.includes(fullName)
      || haystack.includes(bareName)
      || (singularName.length > 2 && haystack.includes(singularName))
    ) {
      tableIds.push(table.fullName)
    }
  }

  return uniqueValues(tableIds)
}
const getRoutinePrimaryTableIds = (
  tables: PgmlTable[],
  referenceLookup: Map<string, string>,
  routine: PgmlRoutine
) => {
  const candidateGroups = routine.affects
    ? [routine.affects.ownedBy, routine.affects.sets, routine.affects.writes]
    : []

  for (const values of candidateGroups) {
    const tableIds = getTableIdsFromValues(tables, referenceLookup, values)

    if (tableIds.length) {
      return tableIds
    }
  }

  const affectValues = routine.affects
    ? [
        ...routine.affects.writes,
        ...routine.affects.sets,
        ...routine.affects.dependsOn,
        ...routine.affects.reads,
        ...routine.affects.uses,
        ...routine.affects.ownedBy
      ]
    : []
  const sourceTableIds = routine.source
    ? inferSourceTableIds(tables, referenceLookup, routine.source)
    : []

  return uniqueValues([
    ...getTableIdsFromValues(tables, referenceLookup, affectValues),
    ...sourceTableIds,
    ...inferRoutineTableIds(tables, routine)
  ])
}
const getMetadataValue = (metadata: PgmlMetadataEntry[], key: string) => {
  return metadata.find(entry => normalizeEffectKey(entry.key) === normalizeEffectKey(key))?.value || null
}
const getRoutineNameSearchKeys = (value: string) => {
  return uniqueValues([
    cleanForSearch(value),
    cleanForSearch(value.split('.').at(-1) || value)
  ]).filter(entry => entry.length > 0)
}
const buildTriggerTableIdsByRoutineName = (
  model: PgmlSchemaModel,
  referenceLookup: Map<string, string>
) => {
  const mapping = new Map<string, string[]>()

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
const getSequenceOwnedTableIds = (
  tables: PgmlTable[],
  referenceLookup: Map<string, string>,
  sequence: PgmlSequence
) => {
  const metadataOwnedBy = getMetadataValue(sequence.metadata, 'owned_by')
  const explicitOwnedBy = sequence.affects?.ownedBy || []
  const values = metadataOwnedBy
    ? [metadataOwnedBy, ...explicitOwnedBy]
    : explicitOwnedBy

  return getTableIdsFromValues(tables, referenceLookup, values)
}
const getPersistableStandaloneObjectPropertyTargetIds = (model: PgmlSchemaModel) => {
  const referenceLookup = buildGroupTableReferenceLookup(model.tables)
  const triggerTableIdsByRoutineName = buildTriggerTableIdsByRoutineName(model, referenceLookup)
  const getStandaloneRoutineIds = (routines: PgmlRoutine[], prefix: 'function' | 'procedure') => {
    return routines
      .filter((routine) => {
        const triggerTableIds = uniqueValues(getRoutineNameSearchKeys(routine.name).flatMap((key) => {
          return triggerTableIdsByRoutineName.get(key) || []
        }))
        const tableIds = triggerTableIds.length
          ? triggerTableIds
          : getRoutinePrimaryTableIds(model.tables, referenceLookup, routine)

        return tableIds.length === 0
      })
      .map(routine => `${prefix}:${routine.name}`)
  }
  const standaloneTriggerIds = model.triggers
    .filter((trigger) => {
      return resolveTableIdentifier(model.tables, referenceLookup, trigger.tableName) === null
    })
    .map(trigger => `trigger:${trigger.name}`)
  const standaloneSequenceIds = model.sequences
    .filter((sequence) => {
      return getSequenceOwnedTableIds(model.tables, referenceLookup, sequence).length === 0
    })
    .map(sequence => `sequence:${sequence.name}`)

  return [
    ...model.customTypes.map(customType => `custom-type:${customType.kind}:${customType.name}`),
    ...getStandaloneRoutineIds(model.functions, 'function'),
    ...getStandaloneRoutineIds(model.procedures, 'procedure'),
    ...standaloneTriggerIds,
    ...standaloneSequenceIds
  ]
}

export const getOrderedGroupTables = (model: PgmlSchemaModel, groupName: string) => {
  const group = model.groups.find(entry => entry.name === groupName) || null
  const groupedTables = model.tables.filter(table => table.groupName === groupName)

  if (!group) {
    return groupedTables
  }

  const referenceLookup = buildGroupTableReferenceLookup(groupedTables)
  const tablesById = new Map(groupedTables.map(table => [table.fullName, table] as const))
  const orderedTables: PgmlTable[] = []
  const seenTableIds = new Set<string>()
  const pushTable = (tableId: string) => {
    if (seenTableIds.has(tableId)) {
      return
    }

    const table = tablesById.get(tableId)

    if (!table) {
      return
    }

    seenTableIds.add(tableId)
    orderedTables.push(table)
  }

  group.tableNames.forEach((tableName) => {
    const resolvedTableId = referenceLookup.get(resolveGroupTableReferenceKey(tableName))

    if (resolvedTableId) {
      pushTable(resolvedTableId)
    }
  })

  groupedTables.forEach((table) => {
    pushTable(table.fullName)
  })

  return orderedTables
}

const parseSqlArgumentList = (value: string) => {
  const entries: string[] = []
  let current = ''
  let quote: '"' | '\'' | null = null
  let depth = 0

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] || ''
    const previous = index > 0 ? value[index - 1] : ''

    if (quote) {
      current += character

      if (character === quote && previous !== '\\') {
        quote = null
      }

      continue
    }

    if (character === '\'' || character === '"') {
      quote = character
      current += character
      continue
    }

    if (character === '(') {
      depth += 1
      current += character
      continue
    }

    if (character === ')') {
      depth = Math.max(0, depth - 1)
      current += character
      continue
    }

    if (character === ',' && depth === 0) {
      const entry = current.trim()

      if (entry.length > 0) {
        entries.push(entry)
      }

      current = ''
      continue
    }

    current += character
  }

  const trailingEntry = current.trim()

  if (trailingEntry.length > 0) {
    entries.push(trailingEntry)
  }

  return entries
}

const buildListLiteral = (values: string[]) => `[${values.join(', ')}]`
const formatPgmlNumber = (value: number) => {
  if (Number.isInteger(value)) {
    return `${value}`
  }

  return value.toFixed(2).replace(/\.?0+$/, '')
}

const mergeMetadataEntries = (metadata: PgmlMetadataEntry[], derived: PgmlMetadataEntry[]) => {
  const existingKeys = new Set(metadata.map(entry => normalizeEffectKey(entry.key)))

  return [
    ...metadata,
    ...derived.filter(entry => !existingKeys.has(normalizeEffectKey(entry.key)))
  ]
}

const extractRoutineSource = (keyword: 'Function' | 'Procedure', source: string | null): DerivedRoutineSource => {
  if (!source) {
    return {
      name: null,
      signature: null,
      metadata: []
    }
  }

  const normalized = normalizeSource(source)
  const derived: PgmlMetadataEntry[] = []
  const replaceMatch = normalized.match(new RegExp(`^create\\s+(or\\s+replace\\s+)?${keyword.toLowerCase()}\\s+`, 'i'))
  const nameMatch = normalized.match(new RegExp(`^create\\s+(?:or\\s+replace\\s+)?${keyword.toLowerCase()}\\s+([^\\s(]+)\\s*\\((.*?)\\)`, 'i'))
  const languageMatch = normalized.match(/\blanguage\s+([a-zA-Z_]\w*)\b/i)
  const volatilityMatch = normalized.match(/\b(immutable|stable|volatile)\b/i)
  const securityMatch = normalized.match(/\bsecurity\s+(definer|invoker)\b/i)
  let name: string | null = null
  let signature: string | null = null

  if (nameMatch) {
    const sourceName = cleanName(readMatch(nameMatch[1]))
    const parameters = readMatch(nameMatch[2]).trim()
    name = sourceName.split('.').at(-1) || sourceName

    if (keyword === 'Function') {
      const returnsMatch = normalized.match(/\breturns\s+(.+?)\s+as\s+\$(?:[A-Za-z0-9_]+)?\$/i)

      if (returnsMatch) {
        const replaceSuffix = replaceMatch?.[1] ? ' [replace]' : ''
        signature = `${name}(${parameters}) returns ${cleanText(readMatch(returnsMatch[1]))}${replaceSuffix}`
      }
    } else {
      const replaceSuffix = replaceMatch?.[1] ? ' [replace]' : ''
      signature = `${name}(${parameters})${replaceSuffix}`
    }
  }

  if (languageMatch) {
    derived.push({
      key: 'language',
      value: readMatch(languageMatch[1]).toLowerCase()
    })
  }

  if (volatilityMatch) {
    derived.push({
      key: 'volatility',
      value: readMatch(volatilityMatch[1]).toLowerCase()
    })
  }

  if (securityMatch) {
    derived.push({
      key: 'security',
      value: readMatch(securityMatch[1]).toLowerCase()
    })
  }

  return {
    name,
    signature,
    metadata: derived
  }
}

const extractTriggerSource = (source: string | null): DerivedTriggerSource => {
  if (!source) {
    return {
      name: null,
      tableName: null,
      metadata: []
    }
  }

  const normalized = normalizeSource(source)
  const match = normalized.match(/create\s+trigger\s+([^\s]+)\s+(before|after|instead\s+of)\s+(.+?)\s+on\s+([^\s]+)\s+(?:for\s+each\s+(row|statement)\s+)?execute\s+(?:function|procedure)\s+([^(;\s]+)\s*(?:\((.*?)\))?\s*;/i)

  if (!match) {
    return {
      name: null,
      tableName: null,
      metadata: []
    }
  }

  const events = readMatch(match[3])
    .split(/\s+or\s+/i)
    .map(eventName => cleanText(eventName).toLowerCase())
    .filter(eventName => eventName.length > 0)
  const functionName = cleanName(readMatch(match[6])).split('.').at(-1) || cleanName(readMatch(match[6]))
  const argumentsValue = readMatch(match[7]).trim()
  const metadata: PgmlMetadataEntry[] = [
    {
      key: 'timing',
      value: cleanText(readMatch(match[2])).toLowerCase()
    },
    {
      key: 'events',
      value: buildListLiteral(events)
    },
    {
      key: 'function',
      value: functionName
    }
  ]

  if (readMatch(match[5]).length > 0) {
    metadata.push({
      key: 'level',
      value: readMatch(match[5]).toLowerCase()
    })
  }

  if (argumentsValue.length > 0) {
    metadata.push({
      key: 'arguments',
      value: buildListLiteral(parseSqlArgumentList(argumentsValue))
    })
  }

  return {
    name: cleanName(readMatch(match[1])),
    tableName: cleanName(readMatch(match[4])),
    metadata
  }
}

const extractSequenceSource = (source: string | null): DerivedSequenceSource => {
  if (!source) {
    return {
      name: null,
      metadata: []
    }
  }

  const normalized = normalizeSource(source)
  const metadata: PgmlMetadataEntry[] = []
  const nameMatch = normalized.match(/create\s+sequence\s+([^\s;]+)/i)
  const typeMatch = normalized.match(/\bas\s+([^\s;]+)/i)
  const startMatch = normalized.match(/\bstart\s+with\s+([^\s;]+)/i)
  const incrementMatch = normalized.match(/\bincrement\s+by\s+([^\s;]+)/i)
  const minMatch = normalized.match(/\bminvalue\s+([^\s;]+)/i)
  const maxMatch = normalized.match(/\bmaxvalue\s+([^\s;]+)/i)
  const cacheMatch = normalized.match(/\bcache\s+([^\s;]+)/i)
  const ownedByMatch = normalized.match(/\bowned\s+by\s+([^\s;]+)/i)

  if (typeMatch) {
    metadata.push({ key: 'as', value: cleanText(readMatch(typeMatch[1])) })
  }

  if (startMatch) {
    metadata.push({ key: 'start', value: cleanText(readMatch(startMatch[1])) })
  }

  if (incrementMatch) {
    metadata.push({ key: 'increment', value: cleanText(readMatch(incrementMatch[1])) })
  }

  if (minMatch) {
    metadata.push({ key: 'min', value: cleanText(readMatch(minMatch[1])) })
  }

  if (maxMatch) {
    metadata.push({ key: 'max', value: cleanText(readMatch(maxMatch[1])) })
  }

  if (cacheMatch) {
    metadata.push({ key: 'cache', value: cleanText(readMatch(cacheMatch[1])) })
  }

  if (/\bno\s+cycle\b/i.test(normalized)) {
    metadata.push({ key: 'cycle', value: 'false' })
  } else if (/\bcycle\b/i.test(normalized)) {
    metadata.push({ key: 'cycle', value: 'true' })
  }

  if (ownedByMatch) {
    metadata.push({ key: 'owned_by', value: cleanText(readMatch(ownedByMatch[1])) })
  }

  return {
    name: nameMatch ? cleanName(readMatch(nameMatch[1])) : null,
    metadata
  }
}

const parseTableName = (value: string) => {
  const sanitized = cleanName(value)
  const parts = sanitized.split('.')

  if (parts.length >= 2) {
    return {
      schema: readMatch(parts[0]),
      table: readMatch(parts[1])
    }
  }

  return {
    schema: 'public',
    table: sanitized
  }
}

const parseReferenceTarget = (value: string) => {
  const sanitized = cleanName(value)
  const parts = sanitized.split('.')

  if (parts.length === 3) {
    return {
      schema: readMatch(parts[0]),
      table: readMatch(parts[1]),
      column: readMatch(parts[2])
    }
  }

  if (parts.length === 2) {
    return {
      schema: 'public',
      table: readMatch(parts[0]),
      column: readMatch(parts[1])
    }
  }

  return {
    schema: 'public',
    table: sanitized,
    column: ''
  }
}

export const getPgmlSourceSelectionRange = (source: string, sourceRange: PgmlSourceRange) => {
  const lines = source.replaceAll('\r\n', '\n').split('\n')

  if (!lines.length) {
    return null
  }

  const startLine = Math.min(Math.max(Math.round(sourceRange.startLine), 1), lines.length)
  const endLine = Math.min(Math.max(Math.round(sourceRange.endLine), startLine), lines.length)
  const offsets: number[] = []
  let offset = 0

  lines.forEach((line, index) => {
    offsets[index] = offset
    offset += line.length + 1
  })

  const start = offsets[startLine - 1] || 0
  const end = (offsets[endLine - 1] || 0) + (lines[endLine - 1]?.length || 0)

  return {
    start,
    end: Math.max(start, end)
  }
}

export const getPgmlSourceScrollTop = (
  sourceRange: PgmlSourceRange,
  lineHeight: number,
  contextLines: number = 1
) => {
  const targetLine = Math.max(sourceRange.startLine - contextLines, 1)

  return Math.max(0, (targetLine - 1) * lineHeight)
}

const collectBlocks = (source: string) => {
  const lines = source
    .replaceAll('\r\n', '\n')
    .split('\n')

  const topLevel: string[] = []
  const blocks: NamedBlock[] = []

  let index = 0

  while (index < lines.length) {
    const rawLine = lines[index] || ''
    const line = rawLine.trim()

    if (line.length === 0 || line.startsWith('//')) {
      index += 1
      continue
    }

    if (line.endsWith('{')) {
      const header = line.slice(0, -1).trim()
      const body: string[] = []
      const startLine = index + 1
      let endLine = lines.length
      let depth = 1
      index += 1

      while (index < lines.length && depth > 0) {
        const nextLine = lines[index] || ''
        const nextTrimmed = nextLine.trim()

        if (nextTrimmed.endsWith('{')) {
          depth += 1
        }

        if (nextTrimmed === '}') {
          depth -= 1

          if (depth === 0) {
            endLine = index + 1
            index += 1
            break
          }
        }

        if (depth > 0) {
          body.push(nextLine)
        }

        index += 1
      }

      blocks.push({
        header,
        body,
        startLine,
        endLine,
        bodyStartLine: startLine + 1
      })
      continue
    }

    topLevel.push(line)
    index += 1
  }

  return {
    topLevel,
    blocks
  }
}

const parseMetadataEntryLine = (line: string) => {
  const match = line.trim().match(/^([^:]+):\s*(.+)$/)

  if (!match) {
    return null
  }

  return {
    key: cleanName(readMatch(match[1])),
    value: cleanText(readMatch(match[2]))
  } satisfies PgmlMetadataEntry
}

const collectNestedBlockBody = (lines: string[], startIndex: number) => {
  const body: string[] = []
  let index = startIndex + 1
  let depth = 1

  while (index < lines.length && depth > 0) {
    const nextLine = lines[index] || ''
    const nextTrimmed = nextLine.trim()

    if (nextTrimmed.endsWith('{')) {
      depth += 1
    }

    if (nextTrimmed === '}') {
      depth -= 1

      if (depth === 0) {
        index += 1
        break
      }
    }

    if (depth > 0) {
      body.push(nextLine)
    }

    index += 1
  }

  return {
    body,
    nextIndex: index
  }
}

const collectDollarQuotedSource = (lines: string[], startIndex: number) => {
  const firstLine = lines[startIndex] || ''
  const trimmed = firstLine.trim()
  const match = trimmed.match(/^(source|definition):\s*(\$(?:[A-Za-z0-9_]+)?\$)(.*)$/)

  if (!match) {
    return null
  }

  const chunks: string[] = []
  const delimiter = readMatch(match[2])
  const remainder = readMatch(match[3])
  const remainderEndIndex = remainder.indexOf(delimiter)

  if (remainderEndIndex >= 0) {
    chunks.push(remainder.slice(0, remainderEndIndex))

    return {
      source: trimMultiline(chunks.join('\n')),
      nextIndex: startIndex + 1
    }
  }

  if (remainder.length > 0) {
    chunks.push(remainder)
  }

  let index = startIndex + 1

  while (index < lines.length) {
    const nextLine = lines[index] || ''
    const endIndex = nextLine.indexOf(delimiter)

    if (endIndex >= 0) {
      chunks.push(nextLine.slice(0, endIndex))

      return {
        source: trimMultiline(chunks.join('\n')),
        nextIndex: index + 1
      }
    }

    chunks.push(nextLine)
    index += 1
  }

  return {
    source: trimMultiline(chunks.join('\n')),
    nextIndex: lines.length
  }
}

const parseDocumentationBlock = (lines: string[]) => {
  const entries: PgmlDocumentationEntry[] = []
  let summary: string | null = null

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.length === 0 || trimmed.startsWith('//')) {
      continue
    }

    const entry = parseMetadataEntryLine(trimmed)

    if (!entry) {
      continue
    }

    if (normalizeEffectKey(entry.key) === 'summary') {
      summary = entry.value
      continue
    }

    entries.push(entry)
  }

  if (!summary && !entries.length) {
    return null
  }

  return {
    summary,
    entries
  } satisfies PgmlDocumentation
}

const parseAffectsBlock = (lines: string[]) => {
  const affects: PgmlAffects = {
    writes: [],
    sets: [],
    dependsOn: [],
    reads: [],
    calls: [],
    uses: [],
    ownedBy: [],
    extras: []
  }

  for (const line of lines) {
    const trimmed = line.trim()

    if (trimmed.length === 0 || trimmed.startsWith('//')) {
      continue
    }

    const entry = parseMetadataEntryLine(trimmed)

    if (!entry) {
      continue
    }

    const key = normalizeEffectKey(entry.key)
    const values = parseListValue(entry.value)

    if (key === 'writes') {
      affects.writes.push(...values)
      continue
    }

    if (key === 'sets') {
      affects.sets.push(...values)
      continue
    }

    if (key === 'depends_on' || key === 'depends' || key === 'dependson') {
      affects.dependsOn.push(...values)
      continue
    }

    if (key === 'reads') {
      affects.reads.push(...values)
      continue
    }

    if (key === 'calls') {
      affects.calls.push(...values)
      continue
    }

    if (key === 'uses') {
      affects.uses.push(...values)
      continue
    }

    if (key === 'owned_by' || key === 'ownedby') {
      affects.ownedBy.push(...values)
      continue
    }

    affects.extras.push({
      key: entry.key,
      values
    })
  }

  const hasValues = (
    affects.writes.length
    || affects.sets.length
    || affects.dependsOn.length
    || affects.reads.length
    || affects.calls.length
    || affects.uses.length
    || affects.ownedBy.length
    || affects.extras.length
  )

  return hasValues ? affects : null
}

const buildExecutableDetails = (
  metadata: PgmlMetadataEntry[],
  docs: PgmlDocumentation | null,
  affects: PgmlAffects | null,
  source: string | null
) => {
  const details: string[] = []

  metadata.forEach((entry) => {
    details.push(`${entry.key}: ${entry.value}`)
  })

  if (docs?.summary) {
    details.push(`summary: ${docs.summary}`)
  }

  docs?.entries.forEach((entry) => {
    details.push(`${entry.key}: ${entry.value}`)
  })

  if (affects) {
    if (affects.writes.length) {
      details.push(`writes: ${affects.writes.join(', ')}`)
    }

    if (affects.sets.length) {
      details.push(`sets: ${affects.sets.join(', ')}`)
    }

    if (affects.dependsOn.length) {
      details.push(`depends_on: ${affects.dependsOn.join(', ')}`)
    }

    if (affects.reads.length) {
      details.push(`reads: ${affects.reads.join(', ')}`)
    }

    if (affects.calls.length) {
      details.push(`calls: ${affects.calls.join(', ')}`)
    }

    if (affects.uses.length) {
      details.push(`uses: ${affects.uses.join(', ')}`)
    }

    if (affects.ownedBy.length) {
      details.push(`owned_by: ${affects.ownedBy.join(', ')}`)
    }

    affects.extras.forEach((entry) => {
      details.push(`${entry.key}: ${entry.values.join(', ')}`)
    })
  }

  if (source) {
    details.push('source:')
    details.push(...source.split('\n'))
  }

  return details.filter(detail => detail.length > 0)
}

const parseExecutableBody = (lines: string[]) => {
  const metadata: PgmlMetadataEntry[] = []
  let docs: PgmlDocumentation | null = null
  let affects: PgmlAffects | null = null
  let source: string | null = null
  let index = 0

  while (index < lines.length) {
    const line = lines[index] || ''
    const trimmed = line.trim()

    if (trimmed.length === 0 || trimmed.startsWith('//')) {
      index += 1
      continue
    }

    if (trimmed === 'docs {' || trimmed.startsWith('docs {')) {
      const nestedBlock = collectNestedBlockBody(lines, index)
      docs = parseDocumentationBlock(nestedBlock.body)
      index = nestedBlock.nextIndex
      continue
    }

    if (trimmed === 'affects {' || trimmed.startsWith('affects {')) {
      const nestedBlock = collectNestedBlockBody(lines, index)
      affects = parseAffectsBlock(nestedBlock.body)
      index = nestedBlock.nextIndex
      continue
    }

    if (trimmed.startsWith('source:') || trimmed.startsWith('definition:')) {
      const sourceBlock = collectDollarQuotedSource(lines, index)

      if (sourceBlock) {
        source = sourceBlock.source
        index = sourceBlock.nextIndex
        continue
      }
    }

    const entry = parseMetadataEntryLine(trimmed)

    if (entry) {
      metadata.push(entry)
    }

    index += 1
  }

  return {
    metadata,
    docs,
    affects,
    source,
    details: buildExecutableDetails(metadata, docs, affects, source)
  } satisfies ParsedExecutableBody
}

const parseTable = (block: NamedBlock) => {
  const headerMatch = block.header.match(/^Table\s+([^\s]+)(?:\s+in\s+(.+))?$/)

  if (!headerMatch) {
    return null
  }

  const tableName = readMatch(headerMatch[1])
  const groupLabel = readMatch(headerMatch[2])
  const nameTarget = parseTableName(tableName)
  const groupName = groupLabel ? cleanName(groupLabel) : null
  const columns: PgmlColumn[] = []
  const indexes: PgmlIndex[] = []
  const constraints: PgmlConstraint[] = []
  let note: string | null = null

  block.body.forEach((line, lineIndex) => {
    const trimmed = line.trim()
    const sourceLine = block.bodyStartLine + lineIndex

    if (trimmed.length === 0 || trimmed.startsWith('//')) {
      return
    }

    if (trimmed.startsWith('Note:')) {
      note = trimmed.replace('Note:', '').trim()
      return
    }

    const indexMatch = trimmed.match(/^Index\s+([^\s(]+)\s*\(([^)]*)\)(?:\s*\[([^\]]+)\])?$/)

    if (indexMatch) {
      const indexName = readMatch(indexMatch[1])
      const indexColumns = readMatch(indexMatch[2])
      const indexOptions = readMatch(indexMatch[3])
      const parts = indexOptions ? parseBracketParts(indexOptions) : []
      const typePart = parts.find(part => part.startsWith('type:'))

      indexes.push({
        name: cleanName(indexName),
        tableName: `${nameTarget.schema}.${nameTarget.table}`,
        columns: indexColumns.split(',').map(value => cleanName(value)),
        type: typePart ? typePart.replace('type:', '').trim() : 'btree',
        sourceRange: {
          startLine: sourceLine,
          endLine: sourceLine
        }
      })
      return
    }

    const constraintMatch = trimmed.match(/^Constraint\s+([^:]+):\s*(.+)$/)

    if (constraintMatch) {
      const constraintName = readMatch(constraintMatch[1])
      const constraintExpression = readMatch(constraintMatch[2])

      constraints.push({
        name: cleanName(constraintName),
        tableName: `${nameTarget.schema}.${nameTarget.table}`,
        expression: constraintExpression.trim(),
        sourceRange: {
          startLine: sourceLine,
          endLine: sourceLine
        }
      })
      return
    }

    const columnMatch = trimmed.match(/^([^\s]+)\s+([^[\]]+?)(?:\s+\[([^\]]+)\])?$/)

    if (!columnMatch) {
      return
    }

    const columnName = readMatch(columnMatch[1])
    const columnType = readMatch(columnMatch[2])
    const columnOptions = readMatch(columnMatch[3])
    const modifiers = columnOptions ? parseBracketParts(columnOptions) : []
    const refPart = modifiers.find(part => part.startsWith('ref:'))
    const notePart = modifiers.find(part => part.startsWith('note:'))
    const onDelete = getModifierValue(modifiers, 'delete')
    const onUpdate = getModifierValue(modifiers, 'update')
    let reference: PgmlReference | null = null

    if (refPart) {
      const refMatch = refPart.match(/ref:\s*([<>-])\s*(.+)$/)

      if (refMatch) {
        const relation = readMatch(refMatch[1]) as '>' | '<' | '-'
        const refTarget = readMatch(refMatch[2])
        const target = parseReferenceTarget(refTarget)

        reference = {
          fromTable: `${nameTarget.schema}.${nameTarget.table}`,
          fromColumn: cleanName(columnName),
          onDelete,
          onUpdate,
          toTable: `${target.schema}.${target.table}`,
          toColumn: target.column,
          relation
        }
      }
    }

    columns.push({
      name: cleanName(columnName),
      type: columnType.trim(),
      modifiers,
      note: notePart ? notePart.replace('note:', '').trim() : null,
      reference
    })
  })

  return {
    name: nameTarget.table,
    schema: nameTarget.schema,
    fullName: `${nameTarget.schema}.${nameTarget.table}`,
    groupName,
    note,
    columns,
    indexes,
    constraints,
    sourceRange: {
      startLine: block.startLine,
      endLine: block.endLine
    }
  } satisfies PgmlTable
}

const parseGroup = (block: NamedBlock) => {
  const headerMatch = block.header.match(/^TableGroup\s+(.+)$/)

  if (!headerMatch) {
    return null
  }

  const groupName = cleanName(readMatch(headerMatch[1]))
  const tableNames: string[] = []
  let note: string | null = null

  for (const line of block.body) {
    const trimmed = line.trim()

    if (trimmed.length === 0 || trimmed.startsWith('//')) {
      continue
    }

    if (trimmed.startsWith('tables:')) {
      const listMatch = trimmed.match(/\[(.+)\]/)
      const list = listMatch ? readMatch(listMatch[1]).split(',') : []

      for (const entry of list) {
        tableNames.push(cleanName(entry))
      }

      continue
    }

    if (trimmed.startsWith('Note:')) {
      note = trimmed.replace('Note:', '').trim()
      continue
    }

    if (!trimmed.includes(':')) {
      tableNames.push(cleanName(trimmed.replace(/,$/, '')))
    }
  }

  return {
    name: groupName,
    tableNames,
    note,
    sourceRange: {
      startLine: block.startLine,
      endLine: block.endLine
    }
  } satisfies PgmlGroup
}

const parseRoutine = (block: NamedBlock, keyword: 'Function' | 'Procedure') => {
  const headerMatch = block.header.match(new RegExp(`^${keyword}\\s+(.+)$`))

  if (!headerMatch) {
    return null
  }

  const signature = readMatch(headerMatch[1]).trim()
  const executable = parseExecutableBody(block.body)
  const derived = extractRoutineSource(keyword, executable.source)
  const mergedMetadata = mergeMetadataEntries(executable.metadata, derived.metadata)
  const normalizedSignature = signature.includes('returns') || keyword === 'Procedure'
    ? signature
    : (derived.signature || signature)
  const routineName = cleanName(readMatch(normalizedSignature.split('(')[0] || derived.name || ''))

  return {
    name: routineName,
    signature: normalizedSignature,
    details: buildExecutableDetails(mergedMetadata, executable.docs, executable.affects, executable.source),
    metadata: mergedMetadata,
    docs: executable.docs,
    affects: executable.affects,
    source: executable.source,
    sourceRange: {
      startLine: block.startLine,
      endLine: block.endLine
    }
  } satisfies PgmlRoutine
}

const parseTrigger = (block: NamedBlock) => {
  const headerMatch = block.header.match(/^Trigger\s+([^\s]+)(?:\s+on\s+([^\s]+))?$/)

  if (!headerMatch) {
    return null
  }

  const executable = parseExecutableBody(block.body)
  const derived = extractTriggerSource(executable.source)
  const tableName = cleanName(readMatch(headerMatch[2]) || derived.tableName || '')

  if (tableName.length === 0) {
    return null
  }

  const mergedMetadata = mergeMetadataEntries(executable.metadata, derived.metadata)

  return {
    name: cleanName(readMatch(headerMatch[1]) || derived.name || ''),
    tableName,
    details: buildExecutableDetails(mergedMetadata, executable.docs, executable.affects, executable.source),
    metadata: mergedMetadata,
    docs: executable.docs,
    affects: executable.affects,
    source: executable.source,
    sourceRange: {
      startLine: block.startLine,
      endLine: block.endLine
    }
  } satisfies PgmlTrigger
}

const parseSequence = (block: NamedBlock) => {
  const headerMatch = block.header.match(/^Sequence\s+(.+)$/)

  if (!headerMatch) {
    return null
  }

  const executable = parseExecutableBody(block.body)
  const derived = extractSequenceSource(executable.source)
  const mergedMetadata = mergeMetadataEntries(executable.metadata, derived.metadata)

  return {
    name: cleanName(readMatch(headerMatch[1]) || derived.name || ''),
    details: buildExecutableDetails(mergedMetadata, executable.docs, executable.affects, executable.source),
    metadata: mergedMetadata,
    docs: executable.docs,
    affects: executable.affects,
    source: executable.source,
    sourceRange: {
      startLine: block.startLine,
      endLine: block.endLine
    }
  } satisfies PgmlSequence
}

const parseCustomType = (block: NamedBlock) => {
  const headerMatch = block.header.match(/^(Enum|Domain|Composite)\s+(.+)$/)

  if (!headerMatch) {
    return null
  }

  const kind = readMatch(headerMatch[1]) as PgmlCustomTypeBase['kind']
  const name = cleanName(readMatch(headerMatch[2]))
  const details = block.body
    .map(line => line.trim())
    .filter(line => line.length > 0)
  const sourceRange = {
    startLine: block.startLine,
    endLine: block.endLine
  }

  if (kind === 'Enum') {
    return {
      kind,
      name,
      values: details
        .filter(line => !line.includes(':'))
        .map(line => cleanName(line.replace(/,$/, ''))),
      details,
      sourceRange
    } satisfies PgmlEnumType
  }

  if (kind === 'Domain') {
    const baseEntry = details.find(line => line.startsWith('base:'))
    const checkEntry = details.find(line => line.startsWith('check:'))

    return {
      kind,
      name,
      baseType: baseEntry ? baseEntry.replace('base:', '').trim() : null,
      check: checkEntry ? checkEntry.replace('check:', '').trim() : null,
      details,
      sourceRange
    } satisfies PgmlDomainType
  }

  return {
    kind,
    name,
    fields: details.reduce<PgmlCompositeField[]>((entries, line) => {
      if (line.includes(':')) {
        return entries
      }

      const fieldMatch = line.match(/^([^\s]+)\s+(.+)$/)

      if (!fieldMatch) {
        return entries
      }

      entries.push({
        name: cleanName(readMatch(fieldMatch[1])),
        type: readMatch(fieldMatch[2]).trim()
      })
      return entries
    }, []),
    details,
    sourceRange
  } satisfies PgmlCompositeType
}

const parseTopLevelReference = (line: string) => {
  const match = line.match(/^Ref:\s+([^\s]+)\s*([<>-])\s*([^\s]+)$/)

  if (!match) {
    return null
  }

  const fromTarget = parseReferenceTarget(readMatch(match[1]))
  const relation = readMatch(match[2]) as '>' | '<' | '-'
  const toTarget = parseReferenceTarget(readMatch(match[3]))

  return {
    fromTable: `${fromTarget.schema}.${fromTarget.table}`,
    fromColumn: readMatch(fromTarget.column),
    onDelete: null,
    onUpdate: null,
    toTable: `${toTarget.schema}.${toTarget.table}`,
    toColumn: readMatch(toTarget.column),
    relation
  } satisfies PgmlReference
}

const parseNodePropertiesBlock = (block: NamedBlock): { id: string, properties: PgmlNodeProperties } | null => {
  const headerMatch = block.header.match(/^Properties\s+(.+)$/)

  if (!headerMatch) {
    return null
  }

  const id = cleanName(readMatch(headerMatch[1]))

  if (id.length === 0) {
    return null
  }

  const entries: Partial<PgmlNodeProperties> = {}

  for (const line of block.body) {
    const trimmed = line.trim()

    if (trimmed.length === 0 || trimmed.startsWith('//')) {
      continue
    }

    const entry = parseMetadataEntryLine(trimmed)

    if (!entry) {
      continue
    }

    const key = normalizeEffectKey(entry.key)

    if (key === 'collapsed') {
      if (entry.value.trim() === 'true') {
        entries.collapsed = true
      }

      if (entry.value.trim() === 'false') {
        entries.collapsed = false
      }

      continue
    }

    if (key === 'visible') {
      if (entry.value.trim() === 'true') {
        entries.visible = true
      }

      if (entry.value.trim() === 'false') {
        entries.visible = false
      }

      continue
    }

    if (key === 'masonry') {
      if (entry.value.trim() === 'true') {
        entries.masonry = true
      }

      if (entry.value.trim() === 'false') {
        entries.masonry = false
      }

      continue
    }

    if (key === 'color') {
      if (/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(entry.value.trim())) {
        entries.color = entry.value.trim()
      }

      continue
    }

    const numericValue = Number.parseFloat(entry.value)

    if (!Number.isFinite(numericValue)) {
      continue
    }

    if (key === 'x') {
      entries.x = numericValue
      continue
    }

    if (key === 'y') {
      entries.y = numericValue
      continue
    }

    if (key === 'width') {
      entries.width = numericValue
      continue
    }

    if (key === 'height') {
      entries.height = numericValue
      continue
    }

    if (key === 'table_columns' || key === 'tablecolumns' || key === 'columns') {
      entries.tableColumns = numericValue
      continue
    }

    if (key === 'table_width_scale' || key === 'tablewidthscale' || key === 'table_width' || key === 'tablewidth') {
      entries.tableWidthScale = numericValue
    }
  }

  const x = entries.x
  const y = entries.y
  if (
    x === undefined
    && y === undefined
    && typeof entries.color !== 'string'
    && entries.visible === undefined
    && entries.collapsed === undefined
    && entries.masonry === undefined
    && !Number.isFinite(entries.width)
    && !Number.isFinite(entries.height)
    && !Number.isFinite(entries.tableColumns)
    && !Number.isFinite(entries.tableWidthScale)
  ) {
    return null
  }

  const properties: PgmlNodeProperties = {}

  if (x !== undefined) {
    properties.x = x
  }

  if (y !== undefined) {
    properties.y = y
  }

  if (typeof entries.color === 'string') {
    properties.color = entries.color
  }

  if (typeof entries.collapsed === 'boolean') {
    properties.collapsed = entries.collapsed
  }

  if (typeof entries.visible === 'boolean') {
    properties.visible = entries.visible
  }

  if (typeof entries.masonry === 'boolean') {
    properties.masonry = entries.masonry
  }

  if (Number.isFinite(entries.width)) {
    properties.width = entries.width
  }

  if (Number.isFinite(entries.height)) {
    properties.height = entries.height
  }

  if (Number.isFinite(entries.tableColumns)) {
    properties.tableColumns = Math.max(1, Math.round(entries.tableColumns || 1))
  }

  if (hasStoredPgmlTableWidthScale(entries.tableWidthScale)) {
    properties.tableWidthScale = normalizePgmlTableWidthScale(entries.tableWidthScale)
  }

  return {
    id,
    properties
  }
}

export const stripPgmlPropertiesBlocks = (source: string) => {
  const lines = source.split('\n')
  const keptLines: string[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index] || ''
    const trimmed = line.trim()

    if (trimmed.startsWith('Properties ') && trimmed.endsWith('{')) {
      let depth = 1
      index += 1

      while (index < lines.length && depth > 0) {
        const nextLine = lines[index] || ''
        const nextTrimmed = nextLine.trim()

        if (nextTrimmed.endsWith('{')) {
          depth += 1
        }

        if (nextTrimmed === '}') {
          depth -= 1
        }

        index += 1
      }

      continue
    }

    keptLines.push(line)
    index += 1
  }

  return keptLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

export const buildPgmlWithNodeProperties = (
  source: string,
  nodeProperties: Record<string, PgmlNodeProperties>
) => {
  const strippedSource = stripPgmlPropertiesBlocks(source)
  const parsedModel = parsePgml(strippedSource)
  const persistablePropertyTargetIds = new Set<string>([
    ...parsedModel.tables.map(table => table.fullName),
    ...parsedModel.groups.map(group => `group:${group.name}`),
    ...getPersistableStandaloneObjectPropertyTargetIds(parsedModel)
  ])
  const propertyBlocks = Object.entries(nodeProperties)
    .filter(([id]) => {
      return persistablePropertyTargetIds.has(id)
    })
    .filter(([, properties]) => {
      return [
        typeof properties.x === 'number',
        typeof properties.y === 'number',
        typeof properties.color === 'string' && properties.color.length > 0,
        typeof properties.collapsed === 'boolean',
        properties.visible === false,
        typeof properties.tableColumns === 'number',
        hasStoredPgmlTableWidthScale(properties.tableWidthScale),
        properties.masonry === true
      ].some(Boolean)
    })
    .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
    .map(([id, properties]) => {
      const lines = [`Properties "${id}" {`]

      if (typeof properties.x === 'number') {
        lines.push(`  x: ${formatPgmlNumber(properties.x)}`)
      }

      if (typeof properties.y === 'number') {
        lines.push(`  y: ${formatPgmlNumber(properties.y)}`)
      }

      if (typeof properties.color === 'string' && properties.color.length > 0) {
        lines.push(`  color: ${properties.color}`)
      }

      if (typeof properties.collapsed === 'boolean') {
        lines.push(`  collapsed: ${properties.collapsed}`)
      }

      if (properties.visible === false) {
        lines.push('  visible: false')
      }

      if (properties.masonry === true) {
        lines.push('  masonry: true')
      }

      if (typeof properties.tableColumns === 'number') {
        lines.push(`  table_columns: ${Math.max(1, Math.round(properties.tableColumns))}`)
      }

      if (hasStoredPgmlTableWidthScale(properties.tableWidthScale)) {
        lines.push(`  table_width_scale: ${normalizePgmlTableWidthScale(properties.tableWidthScale)}`)
      }

      lines.push('}')

      return lines.join('\n')
    })

  if (!propertyBlocks.length) {
    return strippedSource
  }

  if (!strippedSource) {
    return propertyBlocks.join('\n\n')
  }

  return `${strippedSource}\n\n${propertyBlocks.join('\n\n')}`
}

export const parsePgml = (source: string) => {
  const { topLevel, blocks } = collectBlocks(source)
  const tables: PgmlTable[] = []
  const groups: PgmlGroup[] = []
  const functions: PgmlRoutine[] = []
  const procedures: PgmlRoutine[] = []
  const triggers: PgmlTrigger[] = []
  const sequences: PgmlSequence[] = []
  const customTypes: PgmlCustomType[] = []
  const references: PgmlReference[] = []
  const nodeProperties: Record<string, PgmlNodeProperties> = {}

  for (const line of topLevel) {
    const reference = parseTopLevelReference(line)

    if (reference) {
      references.push(reference)
    }
  }

  for (const block of blocks) {
    const table = parseTable(block)

    if (table) {
      tables.push(table)
      continue
    }

    const group = parseGroup(block)

    if (group) {
      groups.push(group)
      continue
    }

    const parsedNodeProperties = parseNodePropertiesBlock(block)

    if (parsedNodeProperties) {
      nodeProperties[parsedNodeProperties.id] = parsedNodeProperties.properties
      continue
    }

    const pgFunction = parseRoutine(block, 'Function')

    if (pgFunction) {
      functions.push(pgFunction)
      continue
    }

    const procedure = parseRoutine(block, 'Procedure')

    if (procedure) {
      procedures.push(procedure)
      continue
    }

    const trigger = parseTrigger(block)

    if (trigger) {
      triggers.push(trigger)
      continue
    }

    const sequence = parseSequence(block)

    if (sequence) {
      sequences.push(sequence)
      continue
    }

    const customType = parseCustomType(block)

    if (customType) {
      customTypes.push(customType)
    }
  }

  for (const table of tables) {
    for (const column of table.columns) {
      if (column.reference) {
        references.push(column.reference)
      }
    }
  }

  const groupByTableName = new Map<string, string>()

  for (const group of groups) {
    for (const name of group.tableNames) {
      groupByTableName.set(name, group.name)
      groupByTableName.set(`public.${name}`, group.name)
    }
  }

  const normalizedTables = tables.map((table) => {
    const tableGroupName = table.groupName
      || groupByTableName.get(table.name)
      || groupByTableName.get(table.fullName)
      || null

    return {
      ...table,
      groupName: tableGroupName
    }
  })

  const schemaSet = new Set<string>()

  for (const table of normalizedTables) {
    schemaSet.add(table.schema)
  }

  return {
    tables: normalizedTables,
    groups,
    references,
    functions,
    procedures,
    triggers,
    sequences,
    customTypes,
    schemas: Array.from(schemaSet),
    nodeProperties
  } satisfies PgmlSchemaModel
}

export const pgmlExample = `TableGroup Core {
  public.tenants
  public.users
  public.roles
  Note: Shared identity and account ownership
}

TableGroup Commerce {
  public.products
  public.orders
  public.order_items
  Note: Buying flow and inventory edges
}

TableGroup Programs {
  public.common_entity
  public.funding_opportunity_profile
  Note: Shared entity registration hooks for programs
}

Enum role_kind {
  owner
  analyst
  operator
}

Enum entity_type {
  fundingopportunity
  order
  user
}

Domain email_address {
  base: text
  check: VALUE ~* '^[^@]+@[^@]+\\\\.[^@]+$'
}

Sequence order_number_seq {
  docs {
    summary: "Allocates friendly order numbers for the commerce workflow."
    purpose: "Keeps user-facing order numbers separate from internal ids."
  }

  source: $sql$
    CREATE SEQUENCE public.order_number_seq
      AS bigint
      START WITH 1200
      INCREMENT BY 1
      MINVALUE 1200
      CACHE 20
      OWNED BY public.orders.order_number;
  $sql$
}

Sequence common_entity_id_seq {
  docs {
    summary: "Primary allocator for rows in Common_Entity."
    purpose: "Supports entity-backed trigger functions shared across domains."
  }

  source: $sql$
    CREATE SEQUENCE public.common_entity_id_seq
      AS bigint
      START WITH 1000
      INCREMENT BY 1
      CACHE 25
      OWNED BY public.common_entity.id;
  $sql$
}

Table public.tenants {
  id uuid [pk]
  name text [not null]
  slug text [unique, not null]
  created_at timestamptz [default: now()]
  Index idx_tenants_slug (slug) [type: btree]
}

Table public.roles {
  id uuid [pk]
  key role_kind [unique, not null]
  label text [not null]
}

Table public.users {
  id uuid [pk]
  tenant_id uuid [not null, ref: > public.tenants.id]
  role_id uuid [not null, ref: > public.roles.id]
  email email_address [unique, not null]
  display_name text [not null]
  created_at timestamptz [default: now()]
  Constraint chk_users_email: email <> ''
}

Table public.products {
  id uuid [pk]
  tenant_id uuid [not null, ref: > public.tenants.id]
  sku text [unique, not null]
  title text [not null]
  search tsvector [note: generated for full text search]
  price_cents integer [not null]
  Index idx_products_search (search) [type: gin]
}

Table public.orders {
  id uuid [pk]
  tenant_id uuid [not null, ref: > public.tenants.id]
  order_number bigint [not null, unique, default: nextval('order_number_seq')]
  customer_id uuid [ref: > public.users.id]
  status text [not null]
  submitted_at timestamptz
  total_cents integer [not null]
  Constraint chk_orders_total: total_cents >= 0
}

Table public.order_items {
  id uuid [pk]
  order_id uuid [not null, ref: > public.orders.id]
  product_id uuid [not null, ref: > public.products.id]
  quantity integer [not null]
  unit_price_cents integer [not null]
}

Table public.common_entity {
  id bigint [pk, default: nextval('common_entity_id_seq')]
  entity_type entity_type [not null]
  created_at timestamptz [default: now()]
}

Table public.funding_opportunity_profile {
  id bigint [pk]
  tenant_id uuid [not null, ref: > public.tenants.id]
  owner_id uuid [ref: > public.users.id]
  title text [not null]
  status text [not null]
  published_at timestamptz
}

Function recalc_order_total(order_uuid uuid) returns void [replace] {
  docs {
    summary: "Recomputes total_cents from the current order_items rows."
    purpose: "Keeps order totals synchronized with line item changes."
  }

  affects {
    reads: [public.order_items.quantity, public.order_items.unit_price_cents]
    writes: [public.orders.total_cents]
    depends_on: [public.orders, public.order_items]
  }

  source: $sql$
    CREATE OR REPLACE FUNCTION public.recalc_order_total(order_uuid uuid)
    RETURNS void AS $$
    BEGIN
      UPDATE public.orders
      SET total_cents = (
        SELECT COALESCE(SUM(quantity * unit_price_cents), 0)
        FROM public.order_items
        WHERE order_id = order_uuid
      )
      WHERE id = order_uuid;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}

Function sync_order_total() returns trigger [replace] {
  docs {
    summary: "Trigger wrapper that delegates order total recomputation."
  }

  affects {
    reads: [public.order_items.order_id]
    writes: [public.orders.total_cents]
    calls: [recalc_order_total]
    depends_on: [public.order_items, public.orders]
  }

  source: $sql$
    CREATE OR REPLACE FUNCTION public.sync_order_total()
    RETURNS trigger AS $$
    BEGIN
      PERFORM public.recalc_order_total(COALESCE(NEW.order_id, OLD.order_id));
      RETURN COALESCE(NEW, OLD);
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}

Function register_entity(entity_kind text) returns trigger [replace] {
  docs {
    summary: "Allocates a Common_Entity row and assigns the generated id to NEW.id."
    purpose: "Used by BEFORE INSERT triggers on entity-backed program tables."
  }

  affects {
    writes: [public.common_entity]
    sets: [public.funding_opportunity_profile.id]
    depends_on: [entity_type, common_entity_id_seq]
  }

  source: $sql$
    CREATE OR REPLACE FUNCTION public.register_entity(entity_kind text)
    RETURNS trigger AS $$
    DECLARE
      allocated_id bigint;
    BEGIN
      INSERT INTO public.common_entity (entity_type)
      VALUES (entity_kind::entity_type)
      RETURNING id INTO allocated_id;

      NEW.id := allocated_id;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  $sql$
}

Procedure archive_orders(retention_days integer) [replace] {
  docs {
    summary: "Moves stale orders into an archive store and records the archived timestamp."
    purpose: "Supports monthly retention jobs for the commerce domain."
  }

  affects {
    reads: [public.orders.status, public.orders.submitted_at, public.order_items.order_id]
    writes: [public.orders_archive, public.order_item_archive]
    depends_on: [public.orders, public.order_items]
  }

  source: $sql$
    CREATE OR REPLACE PROCEDURE public.archive_orders(retention_days integer)
    LANGUAGE plpgsql
    AS $$
    BEGIN
      INSERT INTO public.orders_archive
      SELECT *
      FROM public.orders
      WHERE status = 'submitted'
        AND submitted_at < now() - make_interval(days => retention_days);

      INSERT INTO public.order_item_archive
      SELECT items.*
      FROM public.order_items AS items
      INNER JOIN public.orders AS orders
        ON orders.id = items.order_id
      WHERE orders.status = 'submitted'
        AND orders.submitted_at < now() - make_interval(days => retention_days);
    END;
    $$;
  $sql$
}

Trigger trg_order_items_total_sync on public.order_items {
  docs {
    summary: "Recalculates the parent order total whenever line items change."
  }

  affects {
    writes: [public.orders.total_cents]
    depends_on: [sync_order_total, recalc_order_total, public.order_items]
  }

  source: $sql$
    CREATE TRIGGER trg_order_items_total_sync
      AFTER INSERT OR UPDATE OR DELETE ON public.order_items
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_order_total();
  $sql$
}

Trigger trg_register_fundingopportunity on public.funding_opportunity_profile {
  docs {
    summary: "Registers a Common_Entity id before a funding opportunity is inserted."
    purpose: "Ensures the Programs domain participates in the shared entity registry."
  }

  affects {
    writes: [public.common_entity]
    sets: [public.funding_opportunity_profile.id]
    depends_on: [register_entity]
  }

  source: $sql$
    CREATE TRIGGER trg_register_fundingopportunity
      BEFORE INSERT ON public.funding_opportunity_profile
      FOR EACH ROW
      EXECUTE FUNCTION public.register_entity('fundingopportunity');
  $sql$
}
`
