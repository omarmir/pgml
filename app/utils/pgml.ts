export type PgmlColumn = {
  name: string
  type: string
  modifiers: string[]
  note: string | null
  reference: PgmlReference | null
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
}

export type PgmlIndex = {
  name: string
  tableName: string
  columns: string[]
  type: string
}

export type PgmlConstraint = {
  name: string
  tableName: string
  expression: string
}

export type PgmlReference = {
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
  relation: '>' | '<' | '-'
}

export type PgmlGroup = {
  name: string
  tableNames: string[]
  note: string | null
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
}

export type PgmlTrigger = {
  name: string
  tableName: string
  details: string[]
  metadata: PgmlMetadataEntry[]
  docs: PgmlDocumentation | null
  affects: PgmlAffects | null
  source: string | null
}

export type PgmlSequence = {
  name: string
  details: string[]
  metadata: PgmlMetadataEntry[]
  docs: PgmlDocumentation | null
  affects: PgmlAffects | null
  source: string | null
}

export type PgmlCustomType = {
  kind: 'Enum' | 'Domain' | 'Composite'
  name: string
  details: string[]
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
}

type NamedBlock = {
  header: string
  body: string[]
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
        body
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

  for (const line of block.body) {
    const trimmed = line.trim()

    if (trimmed.length === 0 || trimmed.startsWith('//')) {
      continue
    }

    if (trimmed.startsWith('Note:')) {
      note = trimmed.replace('Note:', '').trim()
      continue
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
        type: typePart ? typePart.replace('type:', '').trim() : 'btree'
      })
      continue
    }

    const constraintMatch = trimmed.match(/^Constraint\s+([^:]+):\s*(.+)$/)

    if (constraintMatch) {
      const constraintName = readMatch(constraintMatch[1])
      const constraintExpression = readMatch(constraintMatch[2])

      constraints.push({
        name: cleanName(constraintName),
        tableName: `${nameTarget.schema}.${nameTarget.table}`,
        expression: constraintExpression.trim()
      })
      continue
    }

    const columnMatch = trimmed.match(/^([^\s]+)\s+([^[\]]+?)(?:\s+\[([^\]]+)\])?$/)

    if (!columnMatch) {
      continue
    }

    const columnName = readMatch(columnMatch[1])
    const columnType = readMatch(columnMatch[2])
    const columnOptions = readMatch(columnMatch[3])
    const modifiers = columnOptions ? parseBracketParts(columnOptions) : []
    const refPart = modifiers.find(part => part.startsWith('ref:'))
    const notePart = modifiers.find(part => part.startsWith('note:'))
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
  }

  return {
    name: nameTarget.table,
    schema: nameTarget.schema,
    fullName: `${nameTarget.schema}.${nameTarget.table}`,
    groupName,
    note,
    columns,
    indexes,
    constraints
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
    note
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
    source: executable.source
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
    source: executable.source
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
    source: executable.source
  } satisfies PgmlSequence
}

const parseCustomType = (block: NamedBlock) => {
  const headerMatch = block.header.match(/^(Enum|Domain|Composite)\s+(.+)$/)

  if (!headerMatch) {
    return null
  }

  return {
    kind: readMatch(headerMatch[1]) as 'Enum' | 'Domain' | 'Composite',
    name: cleanName(readMatch(headerMatch[2])),
    details: block.body
      .map(line => line.trim())
      .filter(line => line.length > 0)
  } satisfies PgmlCustomType
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
    toTable: `${toTarget.schema}.${toTarget.table}`,
    toColumn: readMatch(toTarget.column),
    relation
  } satisfies PgmlReference
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
    schemas: Array.from(schemaSet)
  } satisfies PgmlSchemaModel
}

export const pgmlExample = `TableGroup Core {
  tenants
  users
  roles
  Note: Shared identity and account ownership
}

TableGroup Commerce {
  products
  orders
  order_items
  Note: Buying flow and inventory edges
}

TableGroup Programs {
  common_entity
  funding_opportunity_profile
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

Procedure archive_orders(retention_days integer) {
  language: plpgsql
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

Ref: public.orders.customer_id > public.users.id
`
