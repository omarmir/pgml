import { commonPgmlColumnTypes } from './pgml-table-editor'

export type PgmlLanguageDiagnosticSeverity = 'error' | 'warning'

export type PgmlLanguageDiagnostic = {
  code: string
  severity: PgmlLanguageDiagnosticSeverity
  message: string
  from: number
  to: number
  line: number
  lines?: number[]
}

export type PgmlLanguageCompletionKind = 'keyword' | 'property' | 'symbol' | 'type' | 'value'

export type PgmlLanguageCompletionItem = {
  label: string
  kind: PgmlLanguageCompletionKind
  detail: string
  apply: string
  from: number
  to: number
}

type PgmlLineInfo = {
  number: number
  text: string
  trimmed: string
  from: number
  to: number
}

type PgmlBlockKind = 'Table'
  | 'TableGroup'
  | 'Enum'
  | 'Domain'
  | 'Composite'
  | 'Function'
  | 'Procedure'
  | 'Trigger'
  | 'Sequence'
  | 'Properties'
  | 'Unknown'

type PgmlRawBlock = {
  kind: PgmlBlockKind
  keyword: string
  header: string
  headerLine: PgmlLineInfo
  body: PgmlLineInfo[]
  startLine: number
  endLine: number
  from: number
  to: number
}

type PgmlContextKind = 'top-level'
  | 'table'
  | 'group'
  | 'custom-type'
  | 'routine'
  | 'trigger'
  | 'sequence'
  | 'properties'
  | 'docs'
  | 'affects'
  | 'source'

type PgmlContextRange = {
  kind: PgmlContextKind
  blockKind: PgmlBlockKind
  from: number
  to: number
  startLine: number
  endLine: number
}

type PgmlNamedRange = {
  name: string
  from: number
  to: number
  line: number
}

type PgmlColumnSymbol = PgmlNamedRange & {
  tableName: string
}

type PgmlTableSymbol = PgmlNamedRange & {
  fullName: string
  groupName: string | null
  columns: PgmlColumnSymbol[]
}

type PgmlGroupEntry = {
  tableName: string
  from: number
  to: number
  line: number
}

type PgmlGroupSymbol = PgmlNamedRange & {
  entries: PgmlGroupEntry[]
}

type PgmlCustomTypeSymbol = PgmlNamedRange & {
  kind: 'Enum' | 'Domain' | 'Composite'
}

type PgmlReferenceSymbol = {
  kind: 'inline' | 'top-level'
  relation: '>' | '<' | '-'
  fromTable: string
  fromColumn: string
  toTable: string
  toColumn: string
  from: number
  to: number
  line: number
}

type PgmlPropertyTarget = PgmlNamedRange & {
  id: string
}

type PgmlAnalysisCache = {
  analysis: PgmlDocumentAnalysis
  source: string
}

export type PgmlDocumentAnalysis = {
  source: string
  diagnostics: PgmlLanguageDiagnostic[]
  blocks: PgmlRawBlock[]
  contexts: PgmlContextRange[]
  lines: PgmlLineInfo[]
  tables: PgmlTableSymbol[]
  groups: PgmlGroupSymbol[]
  customTypes: PgmlCustomTypeSymbol[]
  sequences: PgmlNamedRange[]
  references: PgmlReferenceSymbol[]
  propertyTargets: PgmlPropertyTarget[]
}

type DuplicateEntry<T> = {
  key: string
  values: T[]
}

const topLevelKeywordTemplates = [
  { label: 'Table', detail: 'Start a table block.', apply: 'Table ' },
  { label: 'TableGroup', detail: 'Start a table group block.', apply: 'TableGroup ' },
  { label: 'Enum', detail: 'Start an enum block.', apply: 'Enum ' },
  { label: 'Domain', detail: 'Start a domain block.', apply: 'Domain ' },
  { label: 'Composite', detail: 'Start a composite type block.', apply: 'Composite ' },
  { label: 'Function', detail: 'Start a function block.', apply: 'Function ' },
  { label: 'Procedure', detail: 'Start a procedure block.', apply: 'Procedure ' },
  { label: 'Trigger', detail: 'Start a trigger block.', apply: 'Trigger ' },
  { label: 'Sequence', detail: 'Start a sequence block.', apply: 'Sequence ' },
  { label: 'Ref:', detail: 'Create a top-level relationship.', apply: 'Ref: ' },
  { label: 'Properties', detail: 'Attach persisted layout properties.', apply: 'Properties "' }
] as const

const tableBodyKeywordTemplates = [
  { label: 'Note:', detail: 'Add a table note.', apply: 'Note: ' },
  { label: 'Index', detail: 'Add an index definition.', apply: 'Index ' },
  { label: 'Constraint', detail: 'Add a constraint definition.', apply: 'Constraint ' }
] as const

const executableKeywordTemplates = [
  { label: 'docs', detail: 'Start a docs block.', apply: 'docs {' },
  { label: 'affects', detail: 'Start an affects block.', apply: 'affects {' },
  { label: 'source', detail: 'Start a dollar-quoted source block.', apply: 'source: $sql$' },
  { label: 'definition', detail: 'Alias for a source block.', apply: 'definition: $sql$' },
  { label: 'language', detail: 'Set the routine language.', apply: 'language: ' },
  { label: 'volatility', detail: 'Set function volatility.', apply: 'volatility: ' },
  { label: 'security', detail: 'Set routine security mode.', apply: 'security: ' },
  { label: 'timing', detail: 'Set trigger timing.', apply: 'timing: ' },
  { label: 'events', detail: 'Set trigger events.', apply: 'events: []' },
  { label: 'level', detail: 'Set trigger level.', apply: 'level: ' },
  { label: 'function', detail: 'Reference a trigger routine.', apply: 'function: ' },
  { label: 'arguments', detail: 'Set trigger arguments.', apply: 'arguments: []' },
  { label: 'as', detail: 'Set sequence numeric type.', apply: 'as: ' },
  { label: 'start', detail: 'Set sequence start value.', apply: 'start: ' },
  { label: 'increment', detail: 'Set sequence increment.', apply: 'increment: ' },
  { label: 'min', detail: 'Set sequence minimum.', apply: 'min: ' },
  { label: 'max', detail: 'Set sequence maximum.', apply: 'max: ' },
  { label: 'cache', detail: 'Set sequence cache size.', apply: 'cache: ' },
  { label: 'cycle', detail: 'Set sequence cycling.', apply: 'cycle: ' },
  { label: 'owned_by', detail: 'Set sequence ownership.', apply: 'owned_by: ' }
] as const

const docsKeywordTemplates = [
  { label: 'summary', detail: 'Document the object summary.', apply: 'summary: ' }
] as const

const affectsKeywordTemplates = [
  { label: 'writes', detail: 'List written tables.', apply: 'writes: []' },
  { label: 'sets', detail: 'List written columns.', apply: 'sets: []' },
  { label: 'depends_on', detail: 'List dependencies.', apply: 'depends_on: []' },
  { label: 'reads', detail: 'List read tables.', apply: 'reads: []' },
  { label: 'calls', detail: 'List called routines.', apply: 'calls: []' },
  { label: 'uses', detail: 'List used types or objects.', apply: 'uses: []' },
  { label: 'owned_by', detail: 'List owner targets.', apply: 'owned_by: []' }
] as const

const propertyKeywordTemplates = [
  { label: 'x', detail: 'Set stored x position.', apply: 'x: ' },
  { label: 'y', detail: 'Set stored y position.', apply: 'y: ' },
  { label: 'width', detail: 'Set stored width.', apply: 'width: ' },
  { label: 'height', detail: 'Set stored height.', apply: 'height: ' },
  { label: 'color', detail: 'Set node accent color.', apply: 'color: #' },
  { label: 'collapsed', detail: 'Set collapsed state.', apply: 'collapsed: false' },
  { label: 'visible', detail: 'Set visibility state.', apply: 'visible: false' },
  { label: 'masonry', detail: 'Pack grouped tables to reduce whitespace.', apply: 'masonry: true' },
  { label: 'table_columns', detail: 'Set group table column count.', apply: 'table_columns: 2' }
] as const

const modifierKeywordTemplates = [
  { label: 'pk', detail: 'Mark the column as a primary key.', apply: 'pk' },
  { label: 'unique', detail: 'Mark the column as unique.', apply: 'unique' },
  { label: 'not null', detail: 'Prevent null values.', apply: 'not null' },
  { label: 'default:', detail: 'Set a default expression.', apply: 'default: ' },
  { label: 'note:', detail: 'Add a note to the column.', apply: 'note: ' },
  { label: 'ref:', detail: 'Add a relationship modifier.', apply: 'ref: > ' },
  { label: 'delete:', detail: 'Set the ON DELETE action for a reference.', apply: 'delete: cascade' },
  { label: 'update:', detail: 'Set the ON UPDATE action for a reference.', apply: 'update: cascade' }
] as const

const propertyKeySet = new Set(['x', 'y', 'width', 'height', 'color', 'collapsed', 'visible', 'masonry', 'table_columns', 'tablecolumns', 'columns'])
const booleanPropertyKeys = new Set(['collapsed', 'visible', 'masonry'])
const numericPropertyKeys = new Set(['x', 'y', 'width', 'height', 'table_columns', 'tablecolumns', 'columns'])
const validColorPattern = /^#(?:[\da-f]{3}|[\da-f]{6})$/i
let analysisCache: PgmlAnalysisCache | null = null

const normalizeLineEndings = (source: string) => source.replaceAll('\r\n', '\n')
const cleanName = (value: string) => value.replaceAll('"', '').trim()
const cleanText = (value: string) => value.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
const lower = (value: string) => value.toLowerCase()
const getDuplicateLineNumbers = <T extends { line: number }>(values: T[]) => {
  return Array.from(new Set(values.map(value => value.line))).sort((left, right) => left - right)
}
const formatDuplicateLineSummary = (lines: number[]) => {
  return `Lines ${lines.join(', ')}.`
}

const parseTableName = (value: string) => {
  const cleanedValue = cleanName(value)
  const parts = cleanedValue.split('.')

  if (parts.length >= 2) {
    return {
      schema: parts[0] ? parts[0].trim() : 'public',
      table: parts[1] ? parts[1].trim() : ''
    }
  }

  return {
    schema: 'public',
    table: cleanedValue
  }
}

const parseReferenceTarget = (value: string) => {
  const cleanedValue = cleanName(value)
  const parts = cleanedValue.split('.')

  if (parts.length >= 3) {
    return {
      schema: parts[0] ? parts[0].trim() : 'public',
      table: parts[1] ? parts[1].trim() : '',
      column: parts[2] ? parts[2].trim() : ''
    }
  }

  if (parts.length === 2) {
    return {
      schema: 'public',
      table: parts[0] ? parts[0].trim() : '',
      column: parts[1] ? parts[1].trim() : ''
    }
  }

  return {
    schema: 'public',
    table: cleanedValue,
    column: ''
  }
}

const createLineInfo = (source: string) => {
  const normalizedSource = normalizeLineEndings(source)
  const rawLines = normalizedSource.split('\n')
  const lines: PgmlLineInfo[] = []
  let offset = 0

  rawLines.forEach((text, index) => {
    const from = offset
    const to = from + text.length

    lines.push({
      number: index + 1,
      text,
      trimmed: text.trim(),
      from,
      to
    })

    offset = to + 1
  })

  return {
    lines,
    normalizedSource
  }
}

const findSourceDelimiter = (trimmedLine: string) => {
  const match = trimmedLine.match(/^(source|definition):\s*(\$(?:[A-Za-z0-9_]+)?\$)(.*)$/)

  if (!match) {
    return null
  }

  const delimiter = match[2]
  const remainder = match[3]

  if (!delimiter) {
    return null
  }

  if (typeof remainder === 'string' && remainder.includes(delimiter)) {
    return ''
  }

  return delimiter
}

const parseBlockKind = (header: string): { kind: PgmlBlockKind, keyword: string } => {
  const keyword = header.split(/\s+/)[0] || ''

  if (keyword === 'Table') {
    return { kind: 'Table', keyword }
  }

  if (keyword === 'TableGroup') {
    return { kind: 'TableGroup', keyword }
  }

  if (keyword === 'Enum') {
    return { kind: 'Enum', keyword }
  }

  if (keyword === 'Domain') {
    return { kind: 'Domain', keyword }
  }

  if (keyword === 'Composite') {
    return { kind: 'Composite', keyword }
  }

  if (keyword === 'Function') {
    return { kind: 'Function', keyword }
  }

  if (keyword === 'Procedure') {
    return { kind: 'Procedure', keyword }
  }

  if (keyword === 'Trigger') {
    return { kind: 'Trigger', keyword }
  }

  if (keyword === 'Sequence') {
    return { kind: 'Sequence', keyword }
  }

  if (keyword === 'Properties') {
    return { kind: 'Properties', keyword }
  }

  return {
    kind: 'Unknown',
    keyword
  }
}

const createDiagnostic = (
  diagnostics: PgmlLanguageDiagnostic[],
  code: string,
  severity: PgmlLanguageDiagnosticSeverity,
  message: string,
  line: PgmlLineInfo,
  from: number = line.from,
  to: number = line.to
) => {
  diagnostics.push({
    code,
    severity,
    message,
    from,
    to: Math.max(from + 1, to),
    line: line.number
  })
}

const collectRawBlocks = (
  lines: PgmlLineInfo[],
  diagnostics: PgmlLanguageDiagnostic[],
  contexts: PgmlContextRange[]
) => {
  const blocks: PgmlRawBlock[] = []
  const topLevelLines: PgmlLineInfo[] = []
  let index = 0

  contexts.push({
    kind: 'top-level',
    blockKind: 'Unknown',
    from: lines[0] ? lines[0].from : 0,
    to: lines.length > 0 ? lines[lines.length - 1]!.to : 0,
    startLine: lines[0] ? lines[0].number : 1,
    endLine: lines.length > 0 ? lines[lines.length - 1]!.number : 1
  })

  while (index < lines.length) {
    const line = lines[index]

    if (!line) {
      break
    }

    if (line.trimmed.length === 0 || line.trimmed.startsWith('//')) {
      index += 1
      continue
    }

    if (!line.trimmed.endsWith('{')) {
      topLevelLines.push(line)
      index += 1
      continue
    }

    const { kind, keyword } = parseBlockKind(line.trimmed.slice(0, -1).trim())
    const body: PgmlLineInfo[] = []
    let depth = 1
    let blockEndLine = line
    let bodyIndex = index + 1
    let sourceDelimiter: string | null = null
    let sourceStartLine: PgmlLineInfo | null = null

    while (bodyIndex < lines.length && depth > 0) {
      const bodyLine = lines[bodyIndex]

      if (!bodyLine) {
        break
      }

      if (sourceDelimiter) {
        body.push(bodyLine)

        if (bodyLine.text.includes(sourceDelimiter)) {
          contexts.push({
            kind: 'source',
            blockKind: kind,
            from: sourceStartLine ? sourceStartLine.from : bodyLine.from,
            to: bodyLine.to,
            startLine: sourceStartLine ? sourceStartLine.number : bodyLine.number,
            endLine: bodyLine.number
          })
          sourceDelimiter = null
          sourceStartLine = null
        }

        blockEndLine = bodyLine
        bodyIndex += 1
        continue
      }

      const detectedDelimiter = findSourceDelimiter(bodyLine.trimmed)

      if (detectedDelimiter !== null && detectedDelimiter.length > 0) {
        sourceDelimiter = detectedDelimiter
        sourceStartLine = bodyLine
      }

      if (bodyLine.trimmed.endsWith('{')) {
        depth += 1
      }

      if (bodyLine.trimmed === '}') {
        depth -= 1

        if (depth === 0) {
          blockEndLine = bodyLine
          bodyIndex += 1
          break
        }
      }

      if (depth > 0) {
        body.push(bodyLine)
      }

      blockEndLine = bodyLine
      bodyIndex += 1
    }

    if (sourceDelimiter) {
      createDiagnostic(
        diagnostics,
        'pgml/source-unclosed',
        'error',
        'Dollar-quoted source block is not closed.',
        sourceStartLine ? sourceStartLine : line
      )
    }

    if (depth !== 0) {
      createDiagnostic(
        diagnostics,
        'pgml/block-unclosed',
        'error',
        'Block is not closed with a matching `}`.',
        line
      )
    }

    const block: PgmlRawBlock = {
      kind,
      keyword,
      header: line.trimmed.slice(0, -1).trim(),
      headerLine: line,
      body,
      startLine: line.number,
      endLine: blockEndLine.number,
      from: line.from,
      to: blockEndLine.to
    }

    blocks.push(block)
    index = bodyIndex
  }

  return {
    blocks,
    topLevelLines
  }
}

const collectNestedBlock = (
  lines: PgmlLineInfo[],
  startIndex: number,
  diagnostics: PgmlLanguageDiagnostic[]
) => {
  const body: PgmlLineInfo[] = []
  const startLine = lines[startIndex]
  let depth = 1
  let index = startIndex + 1
  let endLine = startLine ? startLine.number : 1

  while (index < lines.length && depth > 0) {
    const line = lines[index]

    if (!line) {
      break
    }

    if (line.trimmed.endsWith('{')) {
      depth += 1
    }

    if (line.trimmed === '}') {
      depth -= 1

      if (depth === 0) {
        endLine = line.number
        index += 1
        break
      }
    }

    if (depth > 0) {
      body.push(line)
    }

    endLine = line.number
    index += 1
  }

  if (depth !== 0 && startLine) {
    createDiagnostic(
      diagnostics,
      'pgml/nested-block-unclosed',
      'error',
      'Nested block is not closed with a matching `}`.',
      startLine
    )
  }

  return {
    body,
    endLine,
    nextIndex: index
  }
}

const createNamedRange = (name: string, line: PgmlLineInfo, rawValue?: string): PgmlNamedRange => {
  const searchValue = rawValue ? rawValue : name
  const start = line.text.indexOf(searchValue)
  const from = start >= 0 ? line.from + start : line.from

  return {
    name,
    from,
    to: from + searchValue.length,
    line: line.number
  }
}

const normalizeGroupEntry = (value: string) => {
  const cleanedValue = cleanName(value.replace(/,$/, ''))

  if (!cleanedValue.includes('.')) {
    return cleanedValue
  }

  return cleanedValue
}

const parseMetadataEntry = (trimmedLine: string) => {
  const match = trimmedLine.match(/^([^:]+):\s*(.+)$/)

  if (!match) {
    return null
  }

  return {
    key: cleanName(match[1] || ''),
    value: cleanText(match[2] || '')
  }
}

const collectTableBody = (
  block: PgmlRawBlock,
  diagnostics: PgmlLanguageDiagnostic[],
  tables: PgmlTableSymbol[],
  references: PgmlReferenceSymbol[]
) => {
  const headerMatch = block.header.match(/^Table\s+([^\s]+)(?:\s+in\s+(.+))?$/)

  if (!headerMatch) {
    createDiagnostic(
      diagnostics,
      'pgml/table-header',
      'error',
      'Table header must use `Table name {` or `Table name in Group {`.',
      block.headerLine
    )
    return
  }

  const rawTableName = headerMatch[1] ? headerMatch[1].trim() : ''
  const rawGroupName = headerMatch[2] ? cleanName(headerMatch[2]) : null
  const parsedName = parseTableName(rawTableName)
  const fullName = `${parsedName.schema}.${parsedName.table}`
  const tableRange = createNamedRange(fullName, block.headerLine, rawTableName)
  const tableSymbol: PgmlTableSymbol = {
    ...tableRange,
    fullName,
    groupName: rawGroupName,
    columns: []
  }

  block.body.forEach((line) => {
    if (line.trimmed.length === 0 || line.trimmed.startsWith('//')) {
      return
    }

    if (line.trimmed.startsWith('Note:')) {
      return
    }

    const indexMatch = line.trimmed.match(/^Index\s+([^\s(]+)\s*\(([^)]*)\)(?:\s*\[([^\]]+)\])?$/)

    if (indexMatch) {
      return
    }

    const constraintMatch = line.trimmed.match(/^Constraint\s+([^:]+):\s*(.+)$/)

    if (constraintMatch) {
      return
    }

    const columnMatch = line.trimmed.match(/^([^\s]+)\s+([^[\]]+?)(?:\s+\[([^\]]+)\])?$/)

    if (!columnMatch) {
      createDiagnostic(
        diagnostics,
        'pgml/table-entry',
        'error',
        'Table entries must be columns, `Index`, `Constraint`, or `Note:` lines.',
        line
      )
      return
    }

    const columnName = cleanName(columnMatch[1] || '')
    const columnRange = createNamedRange(columnName, line, columnMatch[1] || columnName)
    tableSymbol.columns.push({
      ...columnRange,
      tableName: fullName
    })

    const modifierGroup = columnMatch[3] ? columnMatch[3].trim() : ''

    if (modifierGroup.length > 0) {
      modifierGroup
        .split(',')
        .map(part => part.trim())
        .filter(part => part.length > 0)
        .forEach((modifier) => {
          if (!modifier.startsWith('ref:')) {
            return
          }

          const refMatch = modifier.match(/^ref:\s*([<>-])\s*(.+)$/)

          if (!refMatch) {
            createDiagnostic(
              diagnostics,
              'pgml/ref-inline-shape',
              'error',
              'Inline ref modifiers must use `ref: > schema.table.column`.',
              line
            )
            return
          }

          const relation = refMatch[1] as '>' | '<' | '-'
          const target = parseReferenceTarget(refMatch[2] || '')

          references.push({
            kind: 'inline',
            relation,
            fromTable: fullName,
            fromColumn: columnName,
            toTable: `${target.schema}.${target.table}`,
            toColumn: target.column,
            from: line.from,
            to: line.to,
            line: line.number
          })
        })
    }
  })

  tables.push(tableSymbol)
}

const collectGroupBody = (
  block: PgmlRawBlock,
  diagnostics: PgmlLanguageDiagnostic[],
  groups: PgmlGroupSymbol[]
) => {
  const headerMatch = block.header.match(/^TableGroup\s+(.+)$/)

  if (!headerMatch) {
    createDiagnostic(
      diagnostics,
      'pgml/group-header',
      'error',
      'TableGroup header must use `TableGroup Name {`.',
      block.headerLine
    )
    return
  }

  const groupName = cleanName(headerMatch[1] || '')
  const groupEntries: PgmlGroupEntry[] = []

  block.body.forEach((line) => {
    if (line.trimmed.length === 0 || line.trimmed.startsWith('//')) {
      return
    }

    if (line.trimmed.startsWith('Note:')) {
      return
    }

    if (line.trimmed.startsWith('tables:')) {
      const listMatch = line.trimmed.match(/^tables:\s*\[(.*)\]$/)

      if (!listMatch) {
        createDiagnostic(
          diagnostics,
          'pgml/group-tables-shape',
          'error',
          'Group table lists must use `tables: [a, b, c]`.',
          line
        )
        return
      }

      const rawEntries = (listMatch[1] || '')
        .split(',')
        .map(entry => normalizeGroupEntry(entry))
        .filter(entry => entry.length > 0)

      rawEntries.forEach((tableName) => {
        groupEntries.push({
          tableName,
          from: line.from,
          to: line.to,
          line: line.number
        })
      })
      return
    }

    if (!line.trimmed.includes(':')) {
      const tableName = normalizeGroupEntry(line.trimmed)

      groupEntries.push({
        tableName,
        from: line.from,
        to: line.to,
        line: line.number
      })
      return
    }

    createDiagnostic(
      diagnostics,
      'pgml/group-entry',
      'error',
      'Group entries must be table names, a `tables:` list, or `Note:`.',
      line
    )
  })

  groups.push({
    ...createNamedRange(groupName, block.headerLine, headerMatch[1] || groupName),
    entries: groupEntries
  })
}

const collectCustomTypeBody = (
  block: PgmlRawBlock,
  diagnostics: PgmlLanguageDiagnostic[],
  customTypes: PgmlCustomTypeSymbol[]
) => {
  const headerMatch = block.header.match(/^(Enum|Domain|Composite)\s+(.+)$/)

  if (!headerMatch) {
    createDiagnostic(
      diagnostics,
      'pgml/custom-type-header',
      'error',
      'Custom type headers must use `Enum`, `Domain`, or `Composite`.',
      block.headerLine
    )
    return
  }

  const kind = headerMatch[1] as 'Enum' | 'Domain' | 'Composite'
  const name = cleanName(headerMatch[2] || '')

  customTypes.push({
    ...createNamedRange(name, block.headerLine, headerMatch[2] || name),
    kind
  })
}

const collectTopLevelReference = (
  line: PgmlLineInfo,
  diagnostics: PgmlLanguageDiagnostic[],
  references: PgmlReferenceSymbol[]
) => {
  const match = line.trimmed.match(/^Ref:\s+([^\s]+)\s*([<>-])\s*([^\s]+)$/)

  if (!match) {
    createDiagnostic(
      diagnostics,
      'pgml/ref-top-level',
      'error',
      'Top-level refs must use `Ref: schema.table.column > schema.table.column`.',
      line
    )
    return
  }

  const fromTarget = parseReferenceTarget(match[1] || '')
  const relation = (match[2] || '>') as '>' | '<' | '-'
  const toTarget = parseReferenceTarget(match[3] || '')

  references.push({
    kind: 'top-level',
    relation,
    fromTable: `${fromTarget.schema}.${fromTarget.table}`,
    fromColumn: fromTarget.column,
    toTable: `${toTarget.schema}.${toTarget.table}`,
    toColumn: toTarget.column,
    from: line.from,
    to: line.to,
    line: line.number
  })
}

const collectExecutableBody = (
  block: PgmlRawBlock,
  diagnostics: PgmlLanguageDiagnostic[],
  contexts: PgmlContextRange[]
) => {
  let index = 0

  while (index < block.body.length) {
    const line = block.body[index]

    if (!line) {
      break
    }

    if (line.trimmed.length === 0 || line.trimmed.startsWith('//')) {
      index += 1
      continue
    }

    if (line.trimmed === 'docs {' || line.trimmed.startsWith('docs {')) {
      const nested = collectNestedBlock(block.body, index, diagnostics)

      contexts.push({
        kind: 'docs',
        blockKind: block.kind,
        from: line.from,
        to: nested.body.length > 0 ? nested.body[nested.body.length - 1]!.to : line.to,
        startLine: line.number,
        endLine: nested.endLine
      })

      nested.body.forEach((nestedLine) => {
        if (nestedLine.trimmed.length === 0 || nestedLine.trimmed.startsWith('//')) {
          return
        }

        if (!parseMetadataEntry(nestedLine.trimmed)) {
          createDiagnostic(
            diagnostics,
            'pgml/docs-entry',
            'error',
            'Docs entries must use `key: value` syntax.',
            nestedLine
          )
        }
      })

      index = nested.nextIndex
      continue
    }

    if (line.trimmed === 'affects {' || line.trimmed.startsWith('affects {')) {
      const nested = collectNestedBlock(block.body, index, diagnostics)

      contexts.push({
        kind: 'affects',
        blockKind: block.kind,
        from: line.from,
        to: nested.body.length > 0 ? nested.body[nested.body.length - 1]!.to : line.to,
        startLine: line.number,
        endLine: nested.endLine
      })

      nested.body.forEach((nestedLine) => {
        if (nestedLine.trimmed.length === 0 || nestedLine.trimmed.startsWith('//')) {
          return
        }

        if (!parseMetadataEntry(nestedLine.trimmed)) {
          createDiagnostic(
            diagnostics,
            'pgml/affects-entry',
            'error',
            'Affects entries must use `key: value` syntax.',
            nestedLine
          )
        }
      })

      index = nested.nextIndex
      continue
    }

    if (line.trimmed.startsWith('source:') || line.trimmed.startsWith('definition:')) {
      const detectedDelimiter = findSourceDelimiter(line.trimmed)

      if (detectedDelimiter === null) {
        createDiagnostic(
          diagnostics,
          'pgml/source-shape',
          'error',
          'Source blocks must use a dollar-quoted delimiter.',
          line
        )
      }

      index += 1

      if (detectedDelimiter === null || detectedDelimiter.length === 0) {
        continue
      }

      while (index < block.body.length) {
        const sourceLine = block.body[index]

        if (!sourceLine) {
          break
        }

        if (sourceLine.text.includes(detectedDelimiter)) {
          break
        }

        index += 1
      }

      index += 1
      continue
    }

    if (!parseMetadataEntry(line.trimmed)) {
      createDiagnostic(
        diagnostics,
        'pgml/executable-entry',
        'error',
        'Executable blocks may contain metadata lines, `docs`, `affects`, or `source`.',
        line
      )
    }

    index += 1
  }
}

const collectPropertiesBody = (
  block: PgmlRawBlock,
  diagnostics: PgmlLanguageDiagnostic[],
  propertyTargets: PgmlPropertyTarget[]
) => {
  const headerMatch = block.header.match(/^Properties\s+(.+)$/)

  if (!headerMatch) {
    createDiagnostic(
      diagnostics,
      'pgml/properties-header',
      'error',
      'Properties blocks must use `Properties "target" {`.',
      block.headerLine
    )
    return
  }

  const rawTarget = headerMatch[1] || ''
  const targetId = cleanName(rawTarget)

  propertyTargets.push({
    ...createNamedRange(targetId, block.headerLine, rawTarget),
    id: targetId
  })

  block.body.forEach((line) => {
    if (line.trimmed.length === 0 || line.trimmed.startsWith('//')) {
      return
    }

    const entry = parseMetadataEntry(line.trimmed)

    if (!entry) {
      createDiagnostic(
        diagnostics,
        'pgml/properties-entry',
        'error',
        'Properties entries must use `key: value` syntax.',
        line
      )
      return
    }

    const normalizedKey = lower(entry.key).replaceAll(/[^\w]+/g, '_')

    if (!propertyKeySet.has(normalizedKey)) {
      createDiagnostic(
        diagnostics,
        'pgml/properties-key',
        'error',
        'Unsupported properties key.',
        line
      )
      return
    }

    if (booleanPropertyKeys.has(normalizedKey)) {
      if (entry.value !== 'true' && entry.value !== 'false') {
        createDiagnostic(
          diagnostics,
          'pgml/properties-boolean',
          'error',
          'Boolean properties must use `true` or `false`.',
          line
        )
      }
      return
    }

    if (normalizedKey === 'color') {
      if (!validColorPattern.test(entry.value)) {
        createDiagnostic(
          diagnostics,
          'pgml/properties-color',
          'error',
          'Color properties must use a 3- or 6-digit hex value.',
          line
        )
      }
      return
    }

    if (numericPropertyKeys.has(normalizedKey) && !Number.isFinite(Number.parseFloat(entry.value))) {
      createDiagnostic(
        diagnostics,
        'pgml/properties-number',
        'error',
        'Numeric properties must use a valid number.',
        line
      )
    }
  })
}

const detectDuplicates = <T>(values: T[], getKey: (value: T) => string) => {
  const entries = new Map<string, T[]>()

  values.forEach((value) => {
    const key = getKey(value)

    if (!entries.has(key)) {
      entries.set(key, [])
    }

    entries.get(key)!.push(value)
  })

  const duplicates: Array<DuplicateEntry<T>> = []

  entries.forEach((entryValues, key) => {
    if (entryValues.length > 1) {
      duplicates.push({
        key,
        values: entryValues
      })
    }
  })

  return duplicates
}

const createPropertyTargets = (
  groups: PgmlGroupSymbol[],
  tables: PgmlTableSymbol[],
  customTypes: PgmlCustomTypeSymbol[],
  sequences: PgmlNamedRange[]
) => {
  const propertyTargets: Set<string> = new Set()

  groups.forEach((group) => {
    propertyTargets.add(`group:${group.name}`)
  })

  tables.forEach((table) => {
    propertyTargets.add(table.fullName)
  })

  customTypes.forEach((customType) => {
    propertyTargets.add(`custom-type:${customType.kind}:${customType.name}`)
  })

  sequences.forEach((sequence) => {
    propertyTargets.add(`sequence:${sequence.name}`)
  })

  return propertyTargets
}

const runSemanticDiagnostics = (analysis: PgmlDocumentAnalysis) => {
  const { diagnostics, tables, groups, customTypes, sequences, references, propertyTargets } = analysis
  const tableMap = new Map<string, PgmlTableSymbol>()
  const groupNames = new Set(groups.map(group => group.name))
  const validPropertyTargets = createPropertyTargets(groups, tables, customTypes, sequences)

  tables.forEach((table) => {
    tableMap.set(lower(table.fullName), table)
  })

  detectDuplicates(tables, table => lower(table.fullName)).forEach((entry) => {
    const duplicateLines = getDuplicateLineNumbers(entry.values)

    entry.values.slice(1).forEach((table) => {
      diagnostics.push({
        code: 'pgml/table-duplicate',
        severity: 'error',
        message: `Duplicate table definition for \`${table.fullName}\`. ${formatDuplicateLineSummary(duplicateLines)}`,
        from: table.from,
        to: table.to,
        line: table.line,
        lines: duplicateLines
      })
    })
  })

  detectDuplicates(groups, group => lower(group.name)).forEach((entry) => {
    const duplicateLines = getDuplicateLineNumbers(entry.values)

    entry.values.slice(1).forEach((group) => {
      diagnostics.push({
        code: 'pgml/group-duplicate',
        severity: 'error',
        message: `Duplicate group definition for \`${group.name}\`. ${formatDuplicateLineSummary(duplicateLines)}`,
        from: group.from,
        to: group.to,
        line: group.line,
        lines: duplicateLines
      })
    })
  })

  detectDuplicates(customTypes, customType => `${lower(customType.kind)}:${lower(customType.name)}`).forEach((entry) => {
    const duplicateLines = getDuplicateLineNumbers(entry.values)

    entry.values.slice(1).forEach((customType) => {
      diagnostics.push({
        code: 'pgml/custom-type-duplicate',
        severity: 'warning',
        message: `Duplicate ${customType.kind.toLowerCase()} definition for \`${customType.name}\`. ${formatDuplicateLineSummary(duplicateLines)}`,
        from: customType.from,
        to: customType.to,
        line: customType.line,
        lines: duplicateLines
      })
    })
  })

  tables.forEach((table) => {
    detectDuplicates(table.columns, column => lower(column.name)).forEach((entry) => {
      const duplicateLines = getDuplicateLineNumbers(entry.values)

      entry.values.slice(1).forEach((column) => {
        diagnostics.push({
          code: 'pgml/column-duplicate',
          severity: 'error',
          message: `Duplicate column \`${column.name}\` in table \`${table.fullName}\`. ${formatDuplicateLineSummary(duplicateLines)}`,
          from: column.from,
          to: column.to,
          line: column.line,
          lines: duplicateLines
        })
      })
    })

    if (table.groupName && !groupNames.has(table.groupName)) {
      diagnostics.push({
        code: 'pgml/table-group-missing',
        severity: 'error',
        message: `Table \`${table.fullName}\` references missing group \`${table.groupName}\`.`,
        from: table.from,
        to: table.to,
        line: table.line
      })
    }
  })

  const tableGroupAssignments = new Map<string, Set<string>>()

  groups.forEach((group) => {
    group.entries.forEach((entry) => {
      const normalizedEntry = lower(entry.tableName.includes('.') ? entry.tableName : `public.${entry.tableName}`)

      if (!tableGroupAssignments.has(normalizedEntry)) {
        tableGroupAssignments.set(normalizedEntry, new Set())
      }

      tableGroupAssignments.get(normalizedEntry)!.add(group.name)

      if (!tableMap.has(normalizedEntry)) {
        diagnostics.push({
          code: 'pgml/group-entry-missing-table',
          severity: 'warning',
          message: `Group \`${group.name}\` references missing table \`${entry.tableName}\`.`,
          from: entry.from,
          to: entry.to,
          line: entry.line
        })
      }
    })
  })

  tables.forEach((table) => {
    if (!table.groupName) {
      return
    }

    const key = lower(table.fullName)

    if (!tableGroupAssignments.has(key)) {
      tableGroupAssignments.set(key, new Set())
    }

    tableGroupAssignments.get(key)!.add(table.groupName)
  })

  tableGroupAssignments.forEach((groupSet, tableName) => {
    if (groupSet.size <= 1) {
      return
    }

    const matchingTable = tableMap.get(tableName)

    diagnostics.push({
      code: 'pgml/group-assignment-conflict',
      severity: 'warning',
      message: `Table \`${tableName}\` is assigned to multiple groups: ${Array.from(groupSet).join(', ')}.`,
      from: matchingTable ? matchingTable.from : 0,
      to: matchingTable ? matchingTable.to : 1,
      line: matchingTable ? matchingTable.line : 1
    })
  })

  references.forEach((reference) => {
    const fromTable = tableMap.get(lower(reference.fromTable))
    const toTable = tableMap.get(lower(reference.toTable))

    if (!fromTable) {
      diagnostics.push({
        code: 'pgml/ref-missing-from-table',
        severity: 'error',
        message: `Reference source table \`${reference.fromTable}\` does not exist.`,
        from: reference.from,
        to: reference.to,
        line: reference.line
      })
      return
    }

    if (!toTable) {
      diagnostics.push({
        code: 'pgml/ref-missing-to-table',
        severity: 'error',
        message: `Reference target table \`${reference.toTable}\` does not exist.`,
        from: reference.from,
        to: reference.to,
        line: reference.line
      })
      return
    }

    const fromColumnExists = fromTable.columns.some(column => lower(column.name) === lower(reference.fromColumn))

    if (!fromColumnExists) {
      diagnostics.push({
        code: 'pgml/ref-missing-from-column',
        severity: 'error',
        message: `Reference source column \`${reference.fromColumn}\` does not exist on \`${reference.fromTable}\`.`,
        from: reference.from,
        to: reference.to,
        line: reference.line
      })
    }

    const toColumnExists = toTable.columns.some(column => lower(column.name) === lower(reference.toColumn))

    if (!toColumnExists) {
      diagnostics.push({
        code: 'pgml/ref-missing-to-column',
        severity: 'error',
        message: `Reference target column \`${reference.toColumn}\` does not exist on \`${reference.toTable}\`.`,
        from: reference.from,
        to: reference.to,
        line: reference.line
      })
    }
  })

  detectDuplicates(
    references,
    reference => `${lower(reference.fromTable)}.${lower(reference.fromColumn)}:${reference.relation}:${lower(reference.toTable)}.${lower(reference.toColumn)}`
  ).forEach((entry) => {
    const duplicateLines = getDuplicateLineNumbers(entry.values)

    entry.values.slice(1).forEach((reference) => {
      diagnostics.push({
        code: 'pgml/ref-duplicate',
        severity: 'warning',
        message: `Duplicate relationship declaration. ${formatDuplicateLineSummary(duplicateLines)}`,
        from: reference.from,
        to: reference.to,
        line: reference.line,
        lines: duplicateLines
      })
    })
  })

  propertyTargets.forEach((propertyTarget) => {
    if (validPropertyTargets.has(propertyTarget.id)) {
      return
    }

    diagnostics.push({
      code: 'pgml/properties-target-missing',
      severity: 'error',
      message: `Properties target \`${propertyTarget.id}\` does not match a visible PGML entity.`,
      from: propertyTarget.from,
      to: propertyTarget.to,
      line: propertyTarget.line
    })
  })
}

const buildContexts = (blocks: PgmlRawBlock[], contexts: PgmlContextRange[]) => {
  blocks.forEach((block) => {
    if (block.kind === 'Table') {
      contexts.push({
        kind: 'table',
        blockKind: block.kind,
        from: block.from,
        to: block.to,
        startLine: block.startLine,
        endLine: block.endLine
      })
      return
    }

    if (block.kind === 'TableGroup') {
      contexts.push({
        kind: 'group',
        blockKind: block.kind,
        from: block.from,
        to: block.to,
        startLine: block.startLine,
        endLine: block.endLine
      })
      return
    }

    if (block.kind === 'Enum' || block.kind === 'Domain' || block.kind === 'Composite') {
      contexts.push({
        kind: 'custom-type',
        blockKind: block.kind,
        from: block.from,
        to: block.to,
        startLine: block.startLine,
        endLine: block.endLine
      })
      return
    }

    if (block.kind === 'Function' || block.kind === 'Procedure') {
      contexts.push({
        kind: 'routine',
        blockKind: block.kind,
        from: block.from,
        to: block.to,
        startLine: block.startLine,
        endLine: block.endLine
      })
      return
    }

    if (block.kind === 'Trigger') {
      contexts.push({
        kind: 'trigger',
        blockKind: block.kind,
        from: block.from,
        to: block.to,
        startLine: block.startLine,
        endLine: block.endLine
      })
      return
    }

    if (block.kind === 'Sequence') {
      contexts.push({
        kind: 'sequence',
        blockKind: block.kind,
        from: block.from,
        to: block.to,
        startLine: block.startLine,
        endLine: block.endLine
      })
      return
    }

    if (block.kind === 'Properties') {
      contexts.push({
        kind: 'properties',
        blockKind: block.kind,
        from: block.from,
        to: block.to,
        startLine: block.startLine,
        endLine: block.endLine
      })
    }
  })
}

export const analyzePgmlDocument = (source: string) => {
  if (analysisCache && analysisCache.source === source) {
    return analysisCache.analysis
  }

  const diagnostics: PgmlLanguageDiagnostic[] = []
  const contexts: PgmlContextRange[] = []
  const tables: PgmlTableSymbol[] = []
  const groups: PgmlGroupSymbol[] = []
  const customTypes: PgmlCustomTypeSymbol[] = []
  const sequences: PgmlNamedRange[] = []
  const references: PgmlReferenceSymbol[] = []
  const propertyTargets: PgmlPropertyTarget[] = []
  const { lines, normalizedSource } = createLineInfo(source)
  const { blocks, topLevelLines } = collectRawBlocks(lines, diagnostics, contexts)

  buildContexts(blocks, contexts)

  topLevelLines.forEach((line) => {
    if (line.trimmed.startsWith('Ref:')) {
      collectTopLevelReference(line, diagnostics, references)
      return
    }

    createDiagnostic(
      diagnostics,
      'pgml/top-level-entry',
      'error',
      'Unsupported top-level PGML statement.',
      line
    )
  })

  blocks.forEach((block) => {
    if (block.kind === 'Unknown') {
      createDiagnostic(
        diagnostics,
        'pgml/block-kind',
        'error',
        'Unsupported block header.',
        block.headerLine
      )
      return
    }

    if (block.kind === 'Table') {
      collectTableBody(block, diagnostics, tables, references)
      return
    }

    if (block.kind === 'TableGroup') {
      collectGroupBody(block, diagnostics, groups)
      return
    }

    if (block.kind === 'Enum' || block.kind === 'Domain' || block.kind === 'Composite') {
      collectCustomTypeBody(block, diagnostics, customTypes)
      return
    }

    if (block.kind === 'Function' || block.kind === 'Procedure' || block.kind === 'Trigger') {
      collectExecutableBody(block, diagnostics, contexts)

      if (block.kind === 'Trigger') {
        const triggerMatch = block.header.match(/^Trigger\s+([^\s]+)(?:\s+on\s+([^\s]+))?$/)

        if (!triggerMatch) {
          createDiagnostic(
            diagnostics,
            'pgml/trigger-header',
            'error',
            'Trigger headers must use `Trigger name on schema.table {` or `Trigger name {`.',
            block.headerLine
          )
        }
      }

      return
    }

    if (block.kind === 'Sequence') {
      const sequenceMatch = block.header.match(/^Sequence\s+(.+)$/)

      if (!sequenceMatch) {
        createDiagnostic(
          diagnostics,
          'pgml/sequence-header',
          'error',
          'Sequence headers must use `Sequence name {`.',
          block.headerLine
        )
      } else {
        const sequenceName = cleanName(sequenceMatch[1] || '')

        sequences.push(createNamedRange(sequenceName, block.headerLine, sequenceMatch[1] || sequenceName))
      }

      collectExecutableBody(block, diagnostics, contexts)
      return
    }

    if (block.kind === 'Properties') {
      collectPropertiesBody(block, diagnostics, propertyTargets)
    }
  })

  const analysis: PgmlDocumentAnalysis = {
    source: normalizedSource,
    diagnostics,
    blocks,
    contexts,
    lines,
    tables,
    groups,
    customTypes,
    sequences,
    references,
    propertyTargets
  }

  runSemanticDiagnostics(analysis)
  diagnostics.sort((left, right) => left.from - right.from || left.severity.localeCompare(right.severity))

  analysisCache = {
    source,
    analysis
  }

  return analysis
}

const getLineAtOffset = (analysis: PgmlDocumentAnalysis, offset: number) => {
  const clampedOffset = Math.max(0, Math.min(offset, analysis.source.length))

  for (const line of analysis.lines) {
    if (clampedOffset >= line.from && clampedOffset <= line.to + 1) {
      return line
    }
  }

  return analysis.lines[analysis.lines.length - 1] || {
    number: 1,
    text: '',
    trimmed: '',
    from: 0,
    to: 0
  }
}

const getInnermostContextAtOffset = (analysis: PgmlDocumentAnalysis, offset: number) => {
  const matches = analysis.contexts
    .filter(context => offset >= context.from && offset <= context.to + 1)
    .sort((left, right) => {
      const leftSpan = left.to - left.from
      const rightSpan = right.to - right.from

      return leftSpan - rightSpan
    })

  return matches[0] || null
}

const getCompletionSpan = (line: PgmlLineInfo, offset: number) => {
  const clampedOffset = Math.max(line.from, Math.min(offset, line.to))
  const beforeCursor = line.text.slice(0, clampedOffset - line.from)
  const fragmentMatch = beforeCursor.match(/[A-Za-z0-9_.:#-]+$/)
  const fragment = fragmentMatch ? fragmentMatch[0] : ''
  const from = fragment.length > 0 ? clampedOffset - fragment.length : clampedOffset

  return {
    fragment,
    from,
    to: clampedOffset
  }
}

const filterCompletionTemplates = (
  templates: ReadonlyArray<{ label: string, detail: string, apply: string }>,
  kind: PgmlLanguageCompletionKind,
  fragment: string,
  from: number,
  to: number
) => {
  const normalizedFragment = lower(fragment)

  return templates
    .filter((template) => {
      if (normalizedFragment.length === 0) {
        return true
      }

      return lower(template.label).startsWith(normalizedFragment)
    })
    .map(template => ({
      label: template.label,
      kind,
      detail: template.detail,
      apply: template.apply,
      from,
      to
    }))
}

const buildSymbolCompletionItems = (
  values: string[],
  detail: string,
  kind: PgmlLanguageCompletionKind,
  fragment: string,
  from: number,
  to: number
) => {
  const normalizedFragment = lower(fragment)

  return values
    .filter((value, index, entries) => entries.indexOf(value) === index)
    .filter((value) => {
      if (normalizedFragment.length === 0) {
        return true
      }

      return lower(value).startsWith(normalizedFragment)
    })
    .map(value => ({
      label: value,
      kind,
      detail,
      apply: value,
      from,
      to
    }))
}

const getReferencePathCompletions = (analysis: PgmlDocumentAnalysis, fragment: string, from: number, to: number) => {
  const values: string[] = []

  analysis.tables.forEach((table) => {
    table.columns.forEach((column) => {
      values.push(`${table.fullName}.${column.name}`)

      if (table.fullName.startsWith('public.')) {
        values.push(`${table.fullName.replace(/^public\./, '')}.${column.name}`)
      }
    })
  })

  return buildSymbolCompletionItems(values, 'Reference target', 'symbol', fragment, from, to)
}

const getPropertyTargetCompletions = (analysis: PgmlDocumentAnalysis, fragment: string, from: number, to: number) => {
  const values: string[] = []

  analysis.groups.forEach((group) => {
    values.push(`group:${group.name}`)
  })

  analysis.tables.forEach((table) => {
    values.push(table.fullName)
  })

  analysis.customTypes.forEach((customType) => {
    values.push(`custom-type:${customType.kind}:${customType.name}`)
  })

  analysis.sequences.forEach((sequence) => {
    values.push(`sequence:${sequence.name}`)
  })

  return buildSymbolCompletionItems(values, 'Properties target', 'symbol', fragment, from, to)
}

const getColumnTypeCompletions = (analysis: PgmlDocumentAnalysis, fragment: string, from: number, to: number) => {
  const values = [...commonPgmlColumnTypes]

  analysis.customTypes.forEach((customType) => {
    values.push(customType.name)
  })

  return buildSymbolCompletionItems(values, 'Column type', 'type', fragment, from, to)
}

const getGroupNameCompletions = (analysis: PgmlDocumentAnalysis, fragment: string, from: number, to: number) => {
  return buildSymbolCompletionItems(
    analysis.groups.map(group => group.name),
    'Defined group',
    'symbol',
    fragment,
    from,
    to
  )
}

const getGroupTableEntryCompletions = (analysis: PgmlDocumentAnalysis, fragment: string, from: number, to: number) => {
  const values: string[] = []

  analysis.tables.forEach((table) => {
    values.push(table.fullName)

    if (table.fullName.startsWith('public.')) {
      values.push(table.fullName.replace(/^public\./, ''))
    }
  })

  return buildSymbolCompletionItems(values, 'Defined table', 'symbol', fragment, from, to)
}

const getCompletionItemsForLine = (analysis: PgmlDocumentAnalysis, offset: number) => {
  const context = getInnermostContextAtOffset(analysis, offset)
  const line = getLineAtOffset(analysis, offset)
  const { fragment, from, to } = getCompletionSpan(line, offset)
  const beforeCursor = line.text.slice(0, Math.max(0, offset - line.from))
  const trimmedBeforeCursor = beforeCursor.trim()

  if (context?.kind === 'source') {
    return [] as PgmlLanguageCompletionItem[]
  }

  if (context?.kind === 'top-level' || context === null) {
    if (/^\s*Ref:\s*/.test(beforeCursor)) {
      return getReferencePathCompletions(analysis, fragment, from, to)
    }

    return filterCompletionTemplates(topLevelKeywordTemplates, 'keyword', fragment, from, to)
  }

  if (context.kind === 'properties') {
    if (/^\s*Properties\s+/.test(beforeCursor)) {
      return getPropertyTargetCompletions(analysis, fragment, from, to)
    }

    if (/^\s*(collapsed|visible|masonry):\s*[A-Za-z]*$/i.test(beforeCursor)) {
      return buildSymbolCompletionItems(['true', 'false'], 'Boolean value', 'value', fragment, from, to)
    }

    return filterCompletionTemplates(propertyKeywordTemplates, 'property', fragment, from, to)
  }

  if (context.kind === 'group') {
    if (/^\s*TableGroup\s+/.test(beforeCursor)) {
      return []
    }

    return getGroupTableEntryCompletions(analysis, fragment, from, to)
  }

  if (context.kind === 'table') {
    if (/^\s*Table\s+[^\s]+\s+in\s+[A-Za-z0-9_.-]*$/i.test(beforeCursor)) {
      return getGroupNameCompletions(analysis, fragment, from, to)
    }

    if (beforeCursor.includes('[') && !beforeCursor.includes(']')) {
      if (/ref:\s*[<>-]?\s*[A-Za-z0-9_.-]*$/i.test(beforeCursor)) {
        if (/ref:\s*$/.test(beforeCursor)) {
          return buildSymbolCompletionItems(['>', '<', '-'], 'Relation operator', 'value', fragment, from, to)
        }

        if (/ref:\s*[<>-]\s*[A-Za-z0-9_.-]*$/i.test(beforeCursor)) {
          return getReferencePathCompletions(analysis, fragment, from, to)
        }
      }

      return filterCompletionTemplates(modifierKeywordTemplates, 'property', fragment, from, to)
    }

    if (/^\s*[A-Za-z_][A-Za-z0-9_]*\s+[A-Za-z0-9_.()[\] ]*$/.test(beforeCursor) && !beforeCursor.trim().startsWith('Index') && !beforeCursor.trim().startsWith('Constraint')) {
      return getColumnTypeCompletions(analysis, fragment, from, to)
    }

    if (trimmedBeforeCursor.length === 0 || !trimmedBeforeCursor.includes(' ')) {
      return filterCompletionTemplates(tableBodyKeywordTemplates, 'keyword', fragment, from, to)
    }
  }

  if (context.kind === 'docs') {
    return filterCompletionTemplates(docsKeywordTemplates, 'property', fragment, from, to)
  }

  if (context.kind === 'affects') {
    return filterCompletionTemplates(affectsKeywordTemplates, 'property', fragment, from, to)
  }

  if (context.kind === 'routine' || context.kind === 'trigger' || context.kind === 'sequence') {
    return filterCompletionTemplates(executableKeywordTemplates, 'property', fragment, from, to)
  }

  return []
}

export const getPgmlCompletionItems = (source: string, offset: number) => {
  return getCompletionItemsForLine(analyzePgmlDocument(source), offset)
}

export const getPgmlDiagnostics = (source: string) => {
  return analyzePgmlDocument(source).diagnostics
}
