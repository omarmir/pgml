import { normalizePgmlCompatSource } from './pgml-dbml-compat'

type DbmlCommentRoutineImport = {
  endLine: number
  header: string
  kind: 'function' | 'procedure'
  name: string
  note: string | null
  source: string
  startLine: number
}

type DbmlCommentSequenceImport = {
  endLine: number
  header: string
  kind: 'sequence'
  name: string
  note: string | null
  sources: string[]
  startLine: number
}

type DbmlCommentSequenceAppend = {
  kind: 'sequence-alter'
  name: string
  source: string
}

type DbmlCommentTriggerImport = {
  endLine: number
  header: string
  kind: 'trigger'
  name: string
  note: string | null
  source: string
  startLine: number
}

type DbmlCommentIndexImport = {
  columns: string[]
  endLine: number
  kind: 'index'
  name: string
  note: string | null
  source: string
  startLine: number
  tableName: string
  type: string
}

type DbmlCommentExecutableImport = DbmlCommentIndexImport
  | DbmlCommentRoutineImport
  | DbmlCommentSequenceImport
  | DbmlCommentTriggerImport

type DbmlCommentExecutableImportWithoutNote = Omit<DbmlCommentIndexImport, 'note'>
  | Omit<DbmlCommentRoutineImport, 'note'>
  | Omit<DbmlCommentSequenceImport, 'note'>
  | Omit<DbmlCommentTriggerImport, 'note'>

type DbmlBlockCommentRange = {
  end: number
  start: number
}

type DbmlCommentExtractionResult = {
  executableBlocks: string[]
  source: string
  tableIndexes: DbmlCommentIndexImport[]
}

const normalizeLineEndings = (value: string) => {
  return value.replaceAll('\r\n', '\n')
}

const normalizeSqlWhitespace = (value: string) => {
  return value.replaceAll(/\s+/g, ' ').trim()
}

const trimSqlIdentifier = (value: string) => {
  return value.trim().replaceAll('"', '')
}

const splitIdentifierParts = (value: string) => {
  const parts: string[] = []
  let current = ''
  let doubleQuoted = false

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] || ''
    const nextCharacter = value[index + 1] || ''

    if (doubleQuoted) {
      current += character

      if (character === '"' && nextCharacter === '"') {
        current += nextCharacter
        index += 1
        continue
      }

      if (character === '"') {
        doubleQuoted = false
      }

      continue
    }

    if (character === '"') {
      doubleQuoted = true
      current += character
      continue
    }

    if (character === '.') {
      const nextPart = current.trim()

      if (nextPart.length > 0) {
        parts.push(nextPart)
      }

      current = ''
      continue
    }

    current += character
  }

  const trailingPart = current.trim()

  if (trailingPart.length > 0) {
    parts.push(trailingPart)
  }

  return parts
}

const normalizeQualifiedName = (value: string) => {
  const parts = splitIdentifierParts(value).map(trimSqlIdentifier)

  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
  }

  return `public.${parts[0] || trimSqlIdentifier(value)}`
}

const normalizeImportedTableName = (value: string) => {
  const cleanedValue = value.replaceAll('"', '').trim()
  const parts = cleanedValue.split('.')

  if (parts.length >= 2) {
    return `${parts[0] || 'public'}.${parts[1] || ''}`
  }

  return `public.${cleanedValue}`
}

const splitTopLevelSqlList = (value: string) => {
  const entries: string[] = []
  let current = ''
  let curlyDepth = 0
  let squareDepth = 0
  let roundDepth = 0
  let doubleQuoted = false
  let singleQuoted = false
  let dollarQuoted: string | null = null

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] || ''
    const nextCharacter = value[index + 1] || ''

    if (dollarQuoted) {
      if (value.startsWith(dollarQuoted, index)) {
        current += dollarQuoted
        index += dollarQuoted.length - 1
        dollarQuoted = null
        continue
      }

      current += character
      continue
    }

    if (singleQuoted) {
      current += character

      if (character === '\'' && nextCharacter === '\'') {
        current += nextCharacter
        index += 1
        continue
      }

      if (character === '\'') {
        singleQuoted = false
      }

      continue
    }

    if (doubleQuoted) {
      current += character

      if (character === '"' && nextCharacter === '"') {
        current += nextCharacter
        index += 1
        continue
      }

      if (character === '"') {
        doubleQuoted = false
      }

      continue
    }

    if (character === '\'') {
      singleQuoted = true
      current += character
      continue
    }

    if (character === '"') {
      doubleQuoted = true
      current += character
      continue
    }

    if (character === '$') {
      const remainder = value.slice(index)
      const match = remainder.match(/^\$[A-Za-z0-9_]*\$/u)

      if (match) {
        dollarQuoted = match[0]
        current += dollarQuoted
        index += dollarQuoted.length - 1
        continue
      }
    }

    if (character === '(') {
      roundDepth += 1
      current += character
      continue
    }

    if (character === ')') {
      roundDepth = Math.max(0, roundDepth - 1)
      current += character
      continue
    }

    if (character === '[') {
      squareDepth += 1
      current += character
      continue
    }

    if (character === ']') {
      squareDepth = Math.max(0, squareDepth - 1)
      current += character
      continue
    }

    if (character === '{') {
      curlyDepth += 1
      current += character
      continue
    }

    if (character === '}') {
      curlyDepth = Math.max(0, curlyDepth - 1)
      current += character
      continue
    }

    if (character === ',' && roundDepth === 0 && squareDepth === 0 && curlyDepth === 0) {
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

const readBalancedSection = (
  value: string,
  startIndex: number,
  delimiters: {
    close: string
    open: string
  } = {
    close: ')',
    open: '('
  }
) => {
  let current = ''
  let depth = 0
  let doubleQuoted = false
  let singleQuoted = false
  let dollarQuoted: string | null = null

  for (let index = startIndex; index < value.length; index += 1) {
    const character = value[index] || ''
    const nextCharacter = value[index + 1] || ''

    if (dollarQuoted) {
      if (value.startsWith(dollarQuoted, index)) {
        current += dollarQuoted
        index += dollarQuoted.length - 1
        dollarQuoted = null
        continue
      }

      current += character
      continue
    }

    if (singleQuoted) {
      current += character

      if (character === '\'' && nextCharacter === '\'') {
        current += nextCharacter
        index += 1
        continue
      }

      if (character === '\'') {
        singleQuoted = false
      }

      continue
    }

    if (doubleQuoted) {
      current += character

      if (character === '"' && nextCharacter === '"') {
        current += nextCharacter
        index += 1
        continue
      }

      if (character === '"') {
        doubleQuoted = false
      }

      continue
    }

    if (character === '\'') {
      singleQuoted = true
      current += character
      continue
    }

    if (character === '"') {
      doubleQuoted = true
      current += character
      continue
    }

    if (character === '$') {
      const remainder = value.slice(index)
      const match = remainder.match(/^\$[A-Za-z0-9_]*\$/u)

      if (match) {
        dollarQuoted = match[0]
        current += dollarQuoted
        index += dollarQuoted.length - 1
        continue
      }
    }

    if (character === delimiters.open) {
      depth += 1

      if (depth > 1) {
        current += character
      }

      continue
    }

    if (character === delimiters.close) {
      depth -= 1

      if (depth === 0) {
        return {
          content: current,
          endIndex: index
        }
      }

      current += character
      continue
    }

    if (depth > 0) {
      current += character
    }
  }

  return null
}

const parseRoutineSignature = (statement: string, keyword: 'function' | 'procedure') => {
  const normalized = normalizeSqlWhitespace(statement)
  const replacePrefix = normalized.toLowerCase().startsWith(`create or replace ${keyword} `) ? ' [replace]' : ''
  const keywordMatch = normalized.match(new RegExp(`^create\\s+(?:or\\s+replace\\s+)?${keyword}\\s+`, 'iu'))

  if (!keywordMatch) {
    return null
  }

  const afterKeyword = normalized.slice(keywordMatch[0].length)
  const openParenIndex = afterKeyword.indexOf('(')

  if (openParenIndex < 0) {
    return null
  }

  const name = normalizeQualifiedName(afterKeyword.slice(0, openParenIndex))
  const argsSection = readBalancedSection(afterKeyword, openParenIndex)

  if (!argsSection) {
    return null
  }

  const remainder = afterKeyword.slice(argsSection.endIndex + 1)

  if (keyword === 'procedure') {
    return `${name}(${argsSection.content.trim()})${replacePrefix}`
  }

  const returnsMatch = remainder.match(/^\s*returns\s+(.+?)(?=\s+(?:language|immutable|stable|volatile|security|leakproof|cost|rows|support|set|as)\b|$)/iu)

  if (!returnsMatch) {
    return `${name}(${argsSection.content.trim()})${replacePrefix}`
  }

  return `${name}(${argsSection.content.trim()}) returns ${(returnsMatch[1] || '').trim()}${replacePrefix}`
}

const collectDbmlBlockCommentRanges = (source: string) => {
  const ranges: DbmlBlockCommentRange[] = []
  let cursor = 0

  while (cursor < source.length) {
    const start = source.indexOf('/*', cursor)

    if (start < 0) {
      break
    }

    const end = source.indexOf('*/', start + 2)

    if (end < 0) {
      break
    }

    ranges.push({
      end: end + 2,
      start
    })

    cursor = end + 2
  }

  return ranges
}

const readFirstSqlStatement = (source: string) => {
  let current = ''
  let blockCommentDepth = 0
  let doubleQuoted = false
  let inLineComment = false
  let singleQuoted = false
  let dollarQuoted: string | null = null

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index] || ''
    const nextCharacter = source[index + 1] || ''

    if (inLineComment) {
      current += character

      if (character === '\n') {
        inLineComment = false
      }

      continue
    }

    if (blockCommentDepth > 0) {
      current += character

      if (character === '/' && nextCharacter === '*') {
        current += nextCharacter
        blockCommentDepth += 1
        index += 1
      } else if (character === '*' && nextCharacter === '/') {
        current += nextCharacter
        blockCommentDepth -= 1
        index += 1
      }

      continue
    }

    if (dollarQuoted) {
      if (source.startsWith(dollarQuoted, index)) {
        current += dollarQuoted
        index += dollarQuoted.length - 1
        dollarQuoted = null
        continue
      }

      current += character
      continue
    }

    if (singleQuoted) {
      current += character

      if (character === '\'' && nextCharacter === '\'') {
        current += nextCharacter
        index += 1
        continue
      }

      if (character === '\'') {
        singleQuoted = false
      }

      continue
    }

    if (doubleQuoted) {
      current += character

      if (character === '"' && nextCharacter === '"') {
        current += nextCharacter
        index += 1
        continue
      }

      if (character === '"') {
        doubleQuoted = false
      }

      continue
    }

    if (character === '-' && nextCharacter === '-') {
      inLineComment = true
      current += character
      current += nextCharacter
      index += 1
      continue
    }

    if (character === '/' && nextCharacter === '*') {
      blockCommentDepth += 1
      current += character
      current += nextCharacter
      index += 1
      continue
    }

    if (character === '\'') {
      singleQuoted = true
      current += character
      continue
    }

    if (character === '"') {
      doubleQuoted = true
      current += character
      continue
    }

    if (character === '$') {
      const remainder = source.slice(index)
      const match = remainder.match(/^\$[A-Za-z0-9_]*\$/u)

      if (match) {
        dollarQuoted = match[0]
        current += dollarQuoted
        index += dollarQuoted.length - 1
        continue
      }
    }

    current += character

    if (character === ';') {
      return {
        consumedLength: index + 1,
        statement: current.trim()
      }
    }
  }

  const trailingStatement = current.trim()

  if (trailingStatement.length === 0) {
    return null
  }

  return {
    consumedLength: source.length,
    statement: trailingStatement
  }
}

const supportedStatementPrefixes = [
  'alter sequence ',
  'create function ',
  'create index ',
  'create or replace function ',
  'create or replace procedure ',
  'create procedure ',
  'create sequence ',
  'create trigger ',
  'create unique index '
]

const isSupportedExecutableStatementStart = (value: string) => {
  const normalized = value.trim().toLowerCase()

  return supportedStatementPrefixes.some((prefix) => {
    return normalized.startsWith(prefix)
  })
}

const parseCommentExecutableStatement = (statement: string) => {
  const normalized = normalizeSqlWhitespace(statement)
  const lowercase = normalized.toLowerCase()

  if (lowercase.startsWith('create sequence ')) {
    const sequenceMatch = normalized.match(/^create sequence\s+([^\s]+)\b/iu)

    if (!sequenceMatch) {
      return null
    }

    const name = normalizeQualifiedName(sequenceMatch[1] || '')

    return {
      header: `Sequence ${name}`,
      kind: 'sequence',
      name,
      sources: [statement.trim()]
    } satisfies Omit<DbmlCommentSequenceImport, 'endLine' | 'note' | 'startLine'>
  }

  if (lowercase.startsWith('alter sequence ')) {
    const sequenceMatch = normalized.match(/^alter sequence\s+([^\s]+)\s+owned by\s+.+$/iu)

    if (!sequenceMatch) {
      return null
    }

    return {
      kind: 'sequence-alter',
      name: normalizeQualifiedName(sequenceMatch[1] || ''),
      source: statement.trim()
    } satisfies DbmlCommentSequenceAppend
  }

  if (lowercase.startsWith('create function ') || lowercase.startsWith('create or replace function ')) {
    const signature = parseRoutineSignature(statement, 'function')

    if (!signature) {
      return null
    }

    const name = signature.slice(0, signature.indexOf('('))

    return {
      header: `Function ${signature}`,
      kind: 'function',
      name,
      source: statement.trim()
    } satisfies Omit<DbmlCommentRoutineImport, 'endLine' | 'note' | 'startLine'>
  }

  if (lowercase.startsWith('create procedure ') || lowercase.startsWith('create or replace procedure ')) {
    const signature = parseRoutineSignature(statement, 'procedure')

    if (!signature) {
      return null
    }

    const name = signature.slice(0, signature.indexOf('('))

    return {
      header: `Procedure ${signature}`,
      kind: 'procedure',
      name,
      source: statement.trim()
    } satisfies Omit<DbmlCommentRoutineImport, 'endLine' | 'note' | 'startLine'>
  }

  if (lowercase.startsWith('create trigger ')) {
    const triggerMatch = normalized.match(/^create trigger\s+([^\s]+)\s+.+\s+on\s+([^\s]+)\s+.+$/iu)

    if (!triggerMatch) {
      return null
    }

    const name = trimSqlIdentifier(triggerMatch[1] || '')
    const tableName = normalizeQualifiedName(triggerMatch[2] || '')

    return {
      header: `Trigger ${name} on ${tableName}`,
      kind: 'trigger',
      name,
      source: statement.trim()
    } satisfies Omit<DbmlCommentTriggerImport, 'endLine' | 'note' | 'startLine'>
  }

  if (lowercase.startsWith('create index ') || lowercase.startsWith('create unique index ')) {
    const indexMatch = normalized.match(/^create\s+(unique\s+)?index\s+([^\s]+)\s+on\s+(?:only\s+)?([^\s]+)(?:\s+using\s+([^\s]+))?\s*\((.+)\)(?:\s+where\s+.+)?;?$/iu)

    if (!indexMatch) {
      return null
    }

    const columns = splitTopLevelSqlList(indexMatch[5] || '')

    if (columns.length === 0 || columns.some(column => column.includes('(') || column.includes(')'))) {
      return null
    }

    return {
      columns: columns.map((column) => {
        return trimSqlIdentifier(column)
      }),
      kind: 'index',
      name: trimSqlIdentifier(indexMatch[2] || ''),
      tableName: normalizeQualifiedName(indexMatch[3] || ''),
      type: trimSqlIdentifier(indexMatch[4] || 'btree').toLowerCase()
    } satisfies Omit<DbmlCommentIndexImport, 'endLine' | 'note' | 'source' | 'startLine'>
  }

  return null
}

const isCommentSeparatorLine = (value: string) => {
  return /^[-=*#]{3,}$/u.test(value.trim())
}

const createImportIdentityCandidates = (entry: DbmlCommentExecutableImportWithoutNote) => {
  const candidates = new Set<string>()
  const addCandidate = (value: string) => {
    const normalizedValue = value.trim().toLowerCase()

    if (normalizedValue.length > 0) {
      candidates.add(normalizedValue)
    }
  }

  if (entry.kind === 'index') {
    addCandidate(entry.name)
    addCandidate(entry.tableName)
  } else {
    addCandidate(entry.name)
    addCandidate(entry.header.replace(/^(Function|Procedure|Sequence|Trigger)\s+/u, ''))
  }

  const bareName = entry.name.split('.').at(-1) || entry.name
  addCandidate(bareName)

  return candidates
}

const buildCommentEntityNote = (
  contextLines: string[],
  entry: DbmlCommentExecutableImportWithoutNote,
  sqlSource: string
) => {
  const notes: string[] = []
  const identityCandidates = createImportIdentityCandidates(entry)
  const normalizedSqlSource = normalizeSqlWhitespace(sqlSource).toLowerCase()
  const seen = new Set<string>()

  contextLines.forEach((line) => {
    const trimmedLine = line.trim()

    if (trimmedLine.length === 0 || isCommentSeparatorLine(trimmedLine)) {
      return
    }

    const labelMatch = trimmedLine.match(/^([A-Za-z][A-Za-z0-9 _-]*):\s*(.+)$/u)
    const label = labelMatch ? (labelMatch[1] || '').trim().toLowerCase() : ''
    const nextValue = labelMatch ? (labelMatch[2] || '').trim() : trimmedLine
    const normalizedValue = nextValue.toLowerCase()

    if (nextValue.length === 0 || identityCandidates.has(normalizedValue)) {
      return
    }

    if (
      (label === 'function' || label === 'procedure' || label === 'sequence' || label === 'trigger' || label === 'index')
      && identityCandidates.has(normalizedValue)
    ) {
      return
    }

    if (/^[A-Za-z_][A-Za-z0-9_.]*$/u.test(nextValue) && normalizedSqlSource.includes(normalizedValue)) {
      return
    }

    if (seen.has(normalizedValue)) {
      return
    }

    seen.add(normalizedValue)
    notes.push(nextValue)
  })

  return notes.length > 0 ? notes.join(' ') : null
}

const countNewlines = (value: string) => {
  return value.split('\n').length - 1
}

const extractExecutableEntitiesFromCommentBlock = (source: string) => {
  const normalizedSource = normalizeLineEndings(source)
  const lines = normalizedSource.split('\n')
  const recognizedEntries: DbmlCommentExecutableImportWithoutNote[] = []

  let lineIndex = 0

  while (lineIndex < lines.length) {
    const trimmedLine = (lines[lineIndex] || '').trim()

    if (!isSupportedExecutableStatementStart(trimmedLine)) {
      lineIndex += 1
      continue
    }

    const statementSource = lines.slice(lineIndex).join('\n')
    const nextStatement = readFirstSqlStatement(statementSource)

    if (!nextStatement) {
      return null
    }

    const consumedSource = statementSource.slice(0, nextStatement.consumedLength)
    const endLine = lineIndex + countNewlines(consumedSource)
    const parsedStatement = parseCommentExecutableStatement(nextStatement.statement)

    if (!parsedStatement) {
      return null
    }

    if (parsedStatement.kind === 'sequence-alter') {
      const previousEntry = recognizedEntries.at(-1)

      if (!previousEntry || previousEntry.kind !== 'sequence' || previousEntry.name !== parsedStatement.name) {
        return null
      }

      previousEntry.sources.push(parsedStatement.source)
      previousEntry.endLine = endLine
      lineIndex = endLine + 1
      continue
    }

    if (parsedStatement.kind === 'index') {
      recognizedEntries.push({
        ...parsedStatement,
        endLine,
        source: nextStatement.statement.trim(),
        startLine: lineIndex
      })
      lineIndex = endLine + 1
      continue
    }

    recognizedEntries.push({
      ...parsedStatement,
      endLine,
      startLine: lineIndex
    })
    lineIndex = endLine + 1
  }

  if (recognizedEntries.length === 0) {
    return null
  }

  let previousEndLine = -1

  return recognizedEntries.map((entry, entryIndex) => {
    const trailingContext = entryIndex === recognizedEntries.length - 1
      ? lines.slice(entry.endLine + 1)
      : []
    const leadingContext = lines.slice(previousEndLine + 1, entry.startLine)
    const sqlSource = entry.kind === 'sequence' ? entry.sources.join(';\n\n') : entry.source
    const note = buildCommentEntityNote(
      [...leadingContext, ...trailingContext],
      entry,
      sqlSource
    )

    previousEndLine = entry.endLine

    return {
      ...entry,
      note
    }
  })
}

const indentSqlSource = (value: string) => {
  return value
    .trim()
    .split('\n')
    .map((line) => {
      return `    ${line}`
    })
    .join('\n')
}

const ensureSqlStatementsTerminated = (sources: string[]) => {
  return sources
    .map((source) => {
      const trimmedSource = source.trim()

      return trimmedSource.endsWith(';') ? trimmedSource : `${trimmedSource};`
    })
    .join('\n\n')
}

const renderExecutableBlock = (entry: Exclude<DbmlCommentExecutableImport, DbmlCommentIndexImport>) => {
  const lines = [`${entry.header} {`]

  if (entry.note) {
    lines.push(`  note: ${JSON.stringify(entry.note)}`)
    lines.push('')
  }

  lines.push('  source: $sql$')
  lines.push(indentSqlSource(
    entry.kind === 'sequence'
      ? ensureSqlStatementsTerminated(entry.sources)
      : ensureSqlStatementsTerminated([entry.source])
  ))
  lines.push('  $sql$')
  lines.push('}')

  return lines.join('\n')
}

const sanitizeIndexNoteValue = (value: string) => {
  return value
    .replaceAll('[', '(')
    .replaceAll(']', ')')
    .replaceAll(',', ';')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

const renderIndexLine = (entry: DbmlCommentIndexImport, indent: string) => {
  const modifiers = [`type: ${entry.type || 'btree'}`]

  if (entry.note) {
    const normalizedNote = sanitizeIndexNoteValue(entry.note)

    if (normalizedNote.length > 0) {
      modifiers.push(`note: ${normalizedNote}`)
    }
  }

  return `${indent}Index ${entry.name} (${entry.columns.join(', ')}) [${modifiers.join(', ')}]`
}

const readExistingIndexNameFromTableLine = (value: string) => {
  const trimmedValue = value.trim()
  const directIndexMatch = trimmedValue.match(/^Index\s+([^\s(]+)\s*\(/u)

  if (directIndexMatch?.[1]) {
    return trimSqlIdentifier(directIndexMatch[1])
  }

  const bracketNameMatch = trimmedValue.match(/\bname:\s*['"]?([^,'"\]]+)['"]?/iu)

  if (trimmedValue.startsWith('(') && bracketNameMatch?.[1]) {
    return trimSqlIdentifier(bracketNameMatch[1])
  }

  return null
}

const injectCommentDerivedIndexes = (source: string, indexes: DbmlCommentIndexImport[]) => {
  if (indexes.length === 0) {
    return source
  }

  const originalLines = normalizeLineEndings(source).split('\n')
  const visibleLines = normalizePgmlCompatSource(source).split('\n')
  const groupedIndexes = new Map<string, DbmlCommentIndexImport[]>()
  const locatedTables = new Map<string, {
    endLine: number
    existingIndexNames: Set<string>
    indent: string
  }>()
  let tableDepth = 0
  let currentTableName: string | null = null
  let currentTableIndent = '  '
  let currentTableExistingIndexNames = new Set<string>()

  indexes.forEach((index) => {
    const existingIndexes = groupedIndexes.get(index.tableName) || []

    if (!existingIndexes.some(existingIndex => existingIndex.name === index.name)) {
      existingIndexes.push(index)
      groupedIndexes.set(index.tableName, existingIndexes)
    }
  })

  visibleLines.forEach((visibleLine, index) => {
    const trimmedVisibleLine = visibleLine.trim()

    if (tableDepth === 0) {
      const tableHeaderMatch = trimmedVisibleLine.match(/^Table\s+([^\s]+)(?:\s+in\s+.+)?\s*\{$/u)

      if (tableHeaderMatch) {
        currentTableName = normalizeImportedTableName(tableHeaderMatch[1] || '')
        currentTableIndent = `${originalLines[index]?.match(/^[ \t]*/u)?.[0] || ''}  `
        currentTableExistingIndexNames = new Set<string>()
        tableDepth = 1
        return
      }

      return
    }

    const existingIndexName = readExistingIndexNameFromTableLine(trimmedVisibleLine)

    if (existingIndexName) {
      currentTableExistingIndexNames.add(existingIndexName)
    }

    const openBraceCount = (visibleLine.match(/\{/g) || []).length
    const closeBraceCount = (visibleLine.match(/\}/g) || []).length
    tableDepth += openBraceCount - closeBraceCount

    if (tableDepth <= 0 && currentTableName) {
      locatedTables.set(currentTableName, {
        endLine: index,
        existingIndexNames: new Set(currentTableExistingIndexNames),
        indent: currentTableIndent
      })
      currentTableName = null
      currentTableExistingIndexNames = new Set<string>()
      tableDepth = 0
    }
  })

  const insertionTargets = Array.from(groupedIndexes.entries())
    .map(([tableName, tableIndexes]) => {
      const location = locatedTables.get(tableName) || null

      if (!location) {
        return null
      }

      const renderableIndexes = tableIndexes
        .filter((tableIndex) => {
          return !location.existingIndexNames.has(tableIndex.name)
        })
        .map((tableIndex) => {
          return renderIndexLine(tableIndex, location.indent)
        })

      if (renderableIndexes.length === 0) {
        return null
      }

      return {
        endLine: location.endLine,
        lines: renderableIndexes
      }
    })
    .filter(target => target !== null)
    .sort((left, right) => {
      return right.endLine - left.endLine
    })

  insertionTargets.forEach((target) => {
    if (!target) {
      return
    }

    const previousLine = originalLines[target.endLine - 1] || ''

    if (previousLine.trim().length > 0) {
      originalLines.splice(target.endLine, 0, ...['', ...target.lines])
      return
    }

    originalLines.splice(target.endLine, 0, ...target.lines)
  })

  const appendedTableBlocks = Array.from(groupedIndexes.entries())
    .filter(([tableName]) => {
      return !locatedTables.has(tableName)
    })
    .map(([tableName, tableIndexes]) => {
      const lines = [`Table ${tableName} {`]

      tableIndexes.forEach((tableIndex) => {
        lines.push(renderIndexLine(tableIndex, '  '))
      })

      lines.push('}')

      return lines.join('\n')
    })

  const normalizedSource = originalLines.join('\n').trim()

  if (appendedTableBlocks.length === 0) {
    return normalizedSource
  }

  return `${normalizedSource}\n\n${appendedTableBlocks.join('\n\n')}`
}

const collapseImportWhitespace = (value: string) => {
  return normalizeLineEndings(value)
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim()
}

export const extractExecutableEntitiesFromDbmlComments = (source: string): DbmlCommentExtractionResult => {
  const normalizedSource = normalizeLineEndings(source)
  const blockComments = collectDbmlBlockCommentRanges(normalizedSource)

  if (blockComments.length === 0) {
    return {
      executableBlocks: [],
      source: normalizedSource,
      tableIndexes: []
    }
  }

  const executableBlocks: string[] = []
  const tableIndexes: DbmlCommentIndexImport[] = []
  let nextSource = ''
  let previousIndex = 0

  blockComments.forEach((blockComment) => {
    nextSource += normalizedSource.slice(previousIndex, blockComment.start)
    previousIndex = blockComment.end

    const innerComment = normalizedSource.slice(blockComment.start + 2, blockComment.end - 2)
    const extractedEntries = extractExecutableEntitiesFromCommentBlock(innerComment)

    if (!extractedEntries) {
      nextSource += normalizedSource.slice(blockComment.start, blockComment.end)
      return
    }

    const renderedExecutableBlocks = extractedEntries
      .filter((entry) => {
        return entry.kind !== 'index'
      })
      .map((entry) => {
        return renderExecutableBlock(entry)
      })

    if (renderedExecutableBlocks.length > 0) {
      nextSource += renderedExecutableBlocks.join('\n\n')
    }

    extractedEntries.forEach((entry) => {
      if (entry.kind === 'index') {
        tableIndexes.push(entry)
        return
      }

      executableBlocks.push(renderExecutableBlock(entry))
    })
  })

  nextSource += normalizedSource.slice(previousIndex)

  return {
    executableBlocks,
    source: injectCommentDerivedIndexes(collapseImportWhitespace(nextSource), tableIndexes),
    tableIndexes
  }
}
