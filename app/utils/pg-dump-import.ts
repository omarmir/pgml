import { normalizeSchemaName } from './studio-browser-schemas'
import { canonicalizeImportedPgmlSource } from './pgml-import-normalization'
import { extractPgmlSequenceSourceDefinition } from './pgml-sequence-metadata'

type PgDumpImportColumn = {
  modifiers: string[]
  name: string
  type: string
}

type PgDumpImportConstraint = {
  expression: string
  name: string
}

type PgDumpImportIndex = {
  columns: string[]
  name: string
  type: string
}

type PgDumpImportTable = {
  columns: PgDumpImportColumn[]
  constraints: PgDumpImportConstraint[]
  indexes: PgDumpImportIndex[]
  name: string
}

type PgDumpImportEnum = {
  name: string
  values: string[]
}

type PgDumpImportDomain = {
  baseType: string
  details: string[]
  name: string
}

type PgDumpImportComposite = {
  fields: string[]
  name: string
}

type PgDumpImportRoutine = {
  signature: string
  source: string
}

type PgDumpImportTrigger = {
  name: string
  source: string
  tableName: string
}

type PgDumpImportSequence = {
  name: string
  statements: string[]
}

type PgDumpImportAccumulator = {
  composites: Map<string, PgDumpImportComposite>
  domains: Map<string, PgDumpImportDomain>
  enums: Map<string, PgDumpImportEnum>
  functions: Map<string, PgDumpImportRoutine>
  procedures: Map<string, PgDumpImportRoutine>
  sequences: Map<string, PgDumpImportSequence>
  tables: Map<string, PgDumpImportTable>
  triggers: Map<string, PgDumpImportTrigger>
}

type PgDumpImportReferenceActions = {
  onDelete: string | null
  onUpdate: string | null
  remainder: string
}

type PgDumpImportIdentifierNormalizationOptions = {
  foldIdentifiersToLowercase?: boolean
}

export type PgDumpImportResult = {
  pgml: string
  schemaName: string
}

const defaultImportedSchemaName = 'Imported schema'
const pgDumpCommentLines = [
  '// Imported from a text pg_dump.',
  '// PGML keeps schema objects here and omits table data, ownership, grants, and other pg_dump session commands.'
]
const ignoredStatementPrefixes = [
  'alter extension ',
  'alter function ',
  'alter materialized view ',
  'alter schema ',
  'alter type ',
  'alter view ',
  'comment on ',
  'create extension ',
  'grant ',
  'lock table ',
  'revoke ',
  'select pg_catalog.set_config',
  'set ',
  'vacuum ',
  'analyze '
]
const topLevelClauseKeywords = [
  'collate',
  'constraint',
  'default',
  'generated',
  'not null',
  'null',
  'primary key',
  'references',
  'unique',
  'check'
]

const normalizeSqlWhitespace = (value: string) => {
  return value.replaceAll(/\s+/g, ' ').trim()
}

const trimSqlIdentifier = (value: string) => {
  return value.trim().replaceAll('"', '')
}

const applyImportedIdentifierCase = (
  value: string,
  options: PgDumpImportIdentifierNormalizationOptions
) => {
  return options.foldIdentifiersToLowercase ? value.toLowerCase() : value
}

const isWordCharacter = (value: string) => {
  return /[a-z0-9_]/i.test(value)
}

const derivePgDumpFileName = (value: string | null | undefined) => {
  if (!value) {
    return defaultImportedSchemaName
  }

  return value.trim().replace(/\.(dump|pgdump|pgsql|sql|txt)$/iu, '')
}

export const derivePgDumpSchemaName = (value?: string | null) => {
  return normalizeSchemaName(derivePgDumpFileName(value))
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

const stripPgDumpCopySections = (source: string) => {
  const lines = source.replaceAll('\r\n', '\n').split('\n')
  const keptLines: string[] = []
  let skippingCopyRows = false

  lines.forEach((line) => {
    const trimmed = line.trim()

    if (!skippingCopyRows && /^COPY\s+.+\s+FROM\s+stdin;$/iu.test(trimmed)) {
      skippingCopyRows = true
      return
    }

    if (skippingCopyRows) {
      if (trimmed === '\\.') {
        skippingCopyRows = false
      }

      return
    }

    if (trimmed.startsWith('\\')) {
      return
    }

    keptLines.push(line)
  })

  return keptLines.join('\n')
}

const splitSqlStatements = (source: string) => {
  const statements: string[] = []
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
      if (character === '\n') {
        inLineComment = false
      }

      continue
    }

    if (blockCommentDepth > 0) {
      if (character === '/' && nextCharacter === '*') {
        blockCommentDepth += 1
        index += 1
      } else if (character === '*' && nextCharacter === '/') {
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
      index += 1
      continue
    }

    if (character === '/' && nextCharacter === '*') {
      blockCommentDepth += 1
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

    if (character === ';') {
      const statement = current.trim()

      if (statement.length > 0) {
        statements.push(statement)
      }

      current = ''
      continue
    }

    current += character
  }

  const trailingStatement = current.trim()

  if (trailingStatement.length > 0) {
    statements.push(trailingStatement)
  }

  return statements
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

const normalizeQualifiedNameForImportedSource = (
  value: string,
  options: PgDumpImportIdentifierNormalizationOptions
) => {
  const parts = splitIdentifierParts(value)
    .map(trimSqlIdentifier)
    .map(part => applyImportedIdentifierCase(part, options))

  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
  }

  return `public.${parts[0] || applyImportedIdentifierCase(trimSqlIdentifier(value), options)}`
}

const normalizeReferenceTarget = (tableName: string, columnName: string) => {
  return `${normalizeQualifiedName(tableName)}.${trimSqlIdentifier(columnName)}`
}

const normalizeReferenceTargetForImportedSource = (
  tableName: string,
  columnName: string,
  options: PgDumpImportIdentifierNormalizationOptions
) => {
  return `${normalizeQualifiedNameForImportedSource(tableName, options)}.${applyImportedIdentifierCase(trimSqlIdentifier(columnName), options)}`
}

const readSqlIdentifier = (value: string) => {
  const trimmed = value.trimStart()
  const leadingOffset = value.length - trimmed.length

  if (trimmed.length === 0) {
    return null
  }

  if (trimmed.startsWith('"')) {
    let identifier = ''

    for (let index = 0; index < trimmed.length; index += 1) {
      const character = trimmed[index] || ''
      const nextCharacter = trimmed[index + 1] || ''

      identifier += character

      if (character === '"' && nextCharacter === '"') {
        identifier += nextCharacter
        index += 1
        continue
      }

      if (index > 0 && character === '"') {
        return {
          nextIndex: leadingOffset + identifier.length,
          raw: identifier,
          value: trimSqlIdentifier(identifier)
        }
      }
    }
  }

  const match = trimmed.match(/^[^\s(),]+/u)

  if (!match) {
    return null
  }

  return {
    nextIndex: leadingOffset + match[0].length,
    raw: match[0],
    value: trimSqlIdentifier(match[0])
  }
}

const isKeywordBoundary = (value: string, startIndex: number, keyword: string) => {
  const previousCharacter = startIndex > 0 ? value[startIndex - 1] || '' : ''
  const afterIndex = startIndex + keyword.length
  const nextCharacter = afterIndex < value.length ? value[afterIndex] || '' : ''

  if (previousCharacter.length > 0 && isWordCharacter(previousCharacter)) {
    return false
  }

  return nextCharacter.length === 0 || !isWordCharacter(nextCharacter)
}

const findTopLevelKeywordIndex = (value: string, keywords: string[]) => {
  let doubleQuoted = false
  let roundDepth = 0
  let squareDepth = 0
  let singleQuoted = false
  let dollarQuoted: string | null = null
  const lowercase = value.toLowerCase()

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] || ''
    const nextCharacter = value[index + 1] || ''

    if (dollarQuoted) {
      if (value.startsWith(dollarQuoted, index)) {
        index += dollarQuoted.length - 1
        dollarQuoted = null
      }

      continue
    }

    if (singleQuoted) {
      if (character === '\'' && nextCharacter === '\'') {
        index += 1
        continue
      }

      if (character === '\'') {
        singleQuoted = false
      }

      continue
    }

    if (doubleQuoted) {
      if (character === '"' && nextCharacter === '"') {
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
      continue
    }

    if (character === '"') {
      doubleQuoted = true
      continue
    }

    if (character === '$') {
      const remainder = value.slice(index)
      const match = remainder.match(/^\$[A-Za-z0-9_]*\$/u)

      if (match) {
        dollarQuoted = match[0]
        index += dollarQuoted.length - 1
        continue
      }
    }

    if (character === '(') {
      roundDepth += 1
      continue
    }

    if (character === ')') {
      roundDepth = Math.max(0, roundDepth - 1)
      continue
    }

    if (character === '[') {
      squareDepth += 1
      continue
    }

    if (character === ']') {
      squareDepth = Math.max(0, squareDepth - 1)
      continue
    }

    if (roundDepth > 0 || squareDepth > 0) {
      continue
    }

    const matchingKeyword = keywords.find((keyword) => {
      return lowercase.startsWith(keyword, index) && isKeywordBoundary(lowercase, index, keyword)
    })

    if (matchingKeyword) {
      return index
    }
  }

  return -1
}

const readKeywordClause = (value: string, keyword: string, trailingKeywords: string[]) => {
  const lowercase = value.toLowerCase()
  const keywordIndex = findTopLevelKeywordIndex(lowercase, [keyword])

  if (keywordIndex < 0) {
    return null
  }

  const contentStart = keywordIndex + keyword.length
  const remainder = value.slice(contentStart)
  const nextKeywordIndex = findTopLevelKeywordIndex(remainder, trailingKeywords)
  const clauseValue = nextKeywordIndex < 0
    ? remainder.trim()
    : remainder.slice(0, nextKeywordIndex).trim()

  return {
    endIndex: nextKeywordIndex < 0 ? value.length : contentStart + nextKeywordIndex,
    value: clauseValue
  }
}

const trimOuterParentheses = (value: string) => {
  let trimmed = value.trim()

  while (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    const balanced = readBalancedSection(trimmed, 0)

    if (!balanced || balanced.endIndex !== trimmed.length - 1) {
      return trimmed
    }

    trimmed = balanced.content.trim()
  }

  return trimmed
}

const ensureTable = (tables: Map<string, PgDumpImportTable>, tableName: string) => {
  const normalizedName = normalizeQualifiedName(tableName)
  const existingTable = tables.get(normalizedName)

  if (existingTable) {
    return existingTable
  }

  const nextTable: PgDumpImportTable = {
    columns: [],
    constraints: [],
    indexes: [],
    name: normalizedName
  }

  tables.set(normalizedName, nextTable)

  return nextTable
}

const addColumnModifier = (column: PgDumpImportColumn, modifier: string) => {
  if (modifier.includes(',')) {
    return false
  }

  if (column.modifiers.includes(modifier)) {
    return true
  }

  column.modifiers.push(modifier)

  return true
}

const findTableColumn = (table: PgDumpImportTable, columnName: string) => {
  return table.columns.find((column) => {
    return column.name === trimSqlIdentifier(columnName)
  }) || null
}

const applySingleColumnConstraint = (
  table: PgDumpImportTable,
  columnNames: string[],
  modifier: 'pk' | 'unique'
) => {
  if (columnNames.length !== 1) {
    return false
  }

  const column = findTableColumn(table, columnNames[0] || '')

  if (!column) {
    return false
  }

  addColumnModifier(column, modifier)

  return true
}

const parseConstraintColumns = (value: string) => {
  return splitTopLevelSqlList(value).map((entry) => {
    return trimSqlIdentifier(entry)
  })
}

const extractReferenceAction = (
  value: string,
  kind: 'delete' | 'update'
) => {
  const match = value.match(new RegExp(`\\bon ${kind}\\s+(no action|restrict|cascade|set null|set default)\\b`, 'iu'))

  if (!match) {
    return {
      action: null,
      remainder: normalizeSqlWhitespace(value)
    }
  }

  const matchIndex = match.index || 0
  const matchedValue = match[0] || ''
  const remainder = `${value.slice(0, matchIndex)} ${value.slice(matchIndex + matchedValue.length)}`

  return {
    action: normalizeSqlWhitespace(match[1] || '').toLowerCase(),
    remainder: normalizeSqlWhitespace(remainder)
  }
}

const parseReferenceActions = (value: string): PgDumpImportReferenceActions => {
  const deleteAction = extractReferenceAction(value, 'delete')
  const updateAction = extractReferenceAction(deleteAction.remainder, 'update')

  return {
    onDelete: deleteAction.action,
    onUpdate: updateAction.action,
    remainder: updateAction.remainder
  }
}

const buildForeignKeyConstraintExpression = (
  columns: string[],
  targetTable: string,
  targetColumns: string[],
  suffix: string
) => {
  const columnList = columns.join(', ')
  const targetColumnList = targetColumns.join(', ')
  const normalizedSuffix = suffix.trim()

  return `foreign key (${columnList}) references ${normalizeQualifiedName(targetTable)} (${targetColumnList})${normalizedSuffix.length > 0 ? ` ${normalizedSuffix}` : ''}`
}

const applyForeignKeyConstraint = (
  table: PgDumpImportTable,
  columns: string[],
  targetTable: string,
  targetColumns: string[],
  actions: PgDumpImportReferenceActions
) => {
  if (columns.length !== 1 || targetColumns.length !== 1) {
    return false
  }

  const column = findTableColumn(table, columns[0] || '')

  if (!column) {
    return false
  }

  if (!addColumnModifier(column, `ref: > ${normalizeReferenceTarget(targetTable, targetColumns[0] || '')}`)) {
    return false
  }

  if (actions.onDelete && !addColumnModifier(column, `delete: ${actions.onDelete}`)) {
    return false
  }

  if (actions.onUpdate && !addColumnModifier(column, `update: ${actions.onUpdate}`)) {
    return false
  }

  return true
}

const parseForeignKeyDefinition = (value: string) => {
  const match = normalizeSqlWhitespace(value).match(/^foreign key\s*\((.+)\)\s+references\s+([^\s(]+)\s*\((.+)\)(.*)$/iu)

  if (!match) {
    return null
  }

  return {
    columns: parseConstraintColumns(match[1] || ''),
    suffix: (match[4] || '').trim(),
    targetColumns: parseConstraintColumns(match[3] || ''),
    targetTable: match[2] || ''
  }
}

const applyTableConstraint = (
  table: PgDumpImportTable,
  input: {
    expression: string
    name: string
  }
) => {
  const normalizedExpression = normalizeSqlWhitespace(input.expression)
  const primaryKeyMatch = normalizedExpression.match(/^primary key\s*\((.+)\)$/iu)

  if (primaryKeyMatch) {
    const columns = parseConstraintColumns(primaryKeyMatch[1] || '')

    if (applySingleColumnConstraint(table, columns, 'pk')) {
      return
    }

    table.constraints.push({
      expression: `primary key (${columns.join(', ')})`,
      name: input.name
    })
    return
  }

  const uniqueMatch = normalizedExpression.match(/^unique\s*\((.+)\)$/iu)

  if (uniqueMatch) {
    const columns = parseConstraintColumns(uniqueMatch[1] || '')

    if (applySingleColumnConstraint(table, columns, 'unique')) {
      return
    }

    table.constraints.push({
      expression: `unique (${columns.join(', ')})`,
      name: input.name
    })
    return
  }

  const checkMatch = normalizedExpression.match(/^check\s*\((.+)\)$/iu)

  if (checkMatch) {
    table.constraints.push({
      expression: trimOuterParentheses(checkMatch[1] || ''),
      name: input.name
    })
    return
  }

  const foreignKeyDefinition = parseForeignKeyDefinition(normalizedExpression)

  if (foreignKeyDefinition) {
    const referenceActions = parseReferenceActions(foreignKeyDefinition.suffix)
    const appliedReference = applyForeignKeyConstraint(
      table,
      foreignKeyDefinition.columns,
      foreignKeyDefinition.targetTable,
      foreignKeyDefinition.targetColumns,
      referenceActions
    )

    if (!appliedReference || referenceActions.remainder.length > 0) {
      table.constraints.push({
        expression: buildForeignKeyConstraintExpression(
          foreignKeyDefinition.columns,
          foreignKeyDefinition.targetTable,
          foreignKeyDefinition.targetColumns,
          foreignKeyDefinition.suffix
        ),
        name: input.name
      })
    }

    return
  }

  table.constraints.push({
    expression: normalizedExpression,
    name: input.name
  })
}

const parseColumnModifiers = (value: string, column: PgDumpImportColumn) => {
  let remainder = value.trim()

  while (remainder.length > 0) {
    const normalizedRemainder = remainder.toLowerCase()

    if (normalizedRemainder.startsWith('constraint ')) {
      const constraintName = readSqlIdentifier(remainder.slice('constraint '.length))

      remainder = constraintName ? remainder.slice('constraint '.length + constraintName.nextIndex).trim() : ''
      continue
    }

    if (normalizedRemainder.startsWith('not null')) {
      addColumnModifier(column, 'not null')
      remainder = remainder.slice('not null'.length).trim()
      continue
    }

    if (normalizedRemainder.startsWith('null')) {
      remainder = remainder.slice('null'.length).trim()
      continue
    }

    if (normalizedRemainder.startsWith('primary key')) {
      addColumnModifier(column, 'pk')
      remainder = remainder.slice('primary key'.length).trim()
      continue
    }

    if (normalizedRemainder.startsWith('unique')) {
      addColumnModifier(column, 'unique')
      remainder = remainder.slice('unique'.length).trim()
      continue
    }

    if (normalizedRemainder.startsWith('default ')) {
      const defaultClause = readKeywordClause(remainder, 'default', [
        'constraint',
        'generated',
        'not null',
        'null',
        'primary key',
        'references',
        'unique',
        'check'
      ])

      if (!defaultClause) {
        return
      }

      addColumnModifier(column, `default: ${defaultClause.value}`)
      remainder = remainder.slice(defaultClause.endIndex).trim()
      continue
    }

    if (normalizedRemainder.startsWith('references ')) {
      const referencesClause = readKeywordClause(remainder, 'references', [
        'constraint',
        'generated',
        'not null',
        'null',
        'primary key',
        'unique',
        'check'
      ])

      if (!referencesClause) {
        return
      }

      const referenceMatch = referencesClause.value.match(/^([^\s(]+)\s*\((.+)\)(.*)$/iu)

      if (referenceMatch) {
        const referenceColumns = parseConstraintColumns(referenceMatch[2] || '')
        const referenceActions = parseReferenceActions(referenceMatch[3] || '')

        if (referenceColumns.length === 1) {
          addColumnModifier(column, `ref: > ${normalizeReferenceTarget(referenceMatch[1] || '', referenceColumns[0] || '')}`)

          if (referenceActions.onDelete) {
            addColumnModifier(column, `delete: ${referenceActions.onDelete}`)
          }

          if (referenceActions.onUpdate) {
            addColumnModifier(column, `update: ${referenceActions.onUpdate}`)
          }
        }
      }

      remainder = remainder.slice(referencesClause.endIndex).trim()
      continue
    }

    if (normalizedRemainder.startsWith('generated always as identity')) {
      addColumnModifier(column, 'generated: always as identity')
      remainder = remainder.slice('generated always as identity'.length).trim()
      continue
    }

    if (normalizedRemainder.startsWith('generated by default as identity')) {
      addColumnModifier(column, 'generated: by default as identity')
      remainder = remainder.slice('generated by default as identity'.length).trim()
      continue
    }

    if (normalizedRemainder.startsWith('collate ')) {
      const collateClause = readKeywordClause(remainder, 'collate', topLevelClauseKeywords)

      if (!collateClause) {
        return
      }

      addColumnModifier(column, `collate: ${trimSqlIdentifier(collateClause.value)}`)
      remainder = remainder.slice(collateClause.endIndex).trim()
      continue
    }

    return
  }
}

const parseColumnDefinition = (value: string) => {
  const identifier = readSqlIdentifier(value)

  if (!identifier) {
    return null
  }

  const remainder = value.slice(identifier.nextIndex).trim()
  const nextKeywordIndex = findTopLevelKeywordIndex(remainder, topLevelClauseKeywords)
  const columnType = nextKeywordIndex < 0 ? remainder : remainder.slice(0, nextKeywordIndex).trim()
  const modifiersSegment = nextKeywordIndex < 0 ? '' : remainder.slice(nextKeywordIndex).trim()
  const column: PgDumpImportColumn = {
    modifiers: [],
    name: identifier.value,
    type: columnType
  }

  if (modifiersSegment.length > 0) {
    parseColumnModifiers(modifiersSegment, column)
  }

  return column
}

const parseCreateTableStatement = (statement: string, tables: Map<string, PgDumpImportTable>) => {
  const normalized = normalizeSqlWhitespace(statement)
  const openParenIndex = normalized.indexOf('(')

  if (openParenIndex < 0) {
    return
  }

  const tableMatch = normalized.match(/^create\s+(?:unlogged\s+)?table\s+(?:if not exists\s+)?(.+?)\s*\(/iu)

  if (!tableMatch) {
    return
  }

  const bodySection = readBalancedSection(normalized, openParenIndex)

  if (!bodySection) {
    return
  }

  const table = ensureTable(tables, tableMatch[1] || '')
  const entries = splitTopLevelSqlList(bodySection.content)

  entries.forEach((entry) => {
    const trimmedEntry = entry.trim()
    const normalizedEntry = trimmedEntry.toLowerCase()

    if (normalizedEntry.startsWith('constraint ')) {
      const constraintMatch = trimmedEntry.match(/^constraint\s+([^\s]+)\s+(.+)$/iu)

      if (constraintMatch) {
        applyTableConstraint(table, {
          expression: constraintMatch[2] || '',
          name: trimSqlIdentifier(constraintMatch[1] || '')
        })
      }

      return
    }

    if (
      normalizedEntry.startsWith('primary key')
      || normalizedEntry.startsWith('unique')
      || normalizedEntry.startsWith('check')
      || normalizedEntry.startsWith('foreign key')
    ) {
      applyTableConstraint(table, {
        expression: trimmedEntry,
        name: `${table.name.replaceAll('.', '_')}_constraint_${table.constraints.length + 1}`
      })
      return
    }

    const nextColumn = parseColumnDefinition(trimmedEntry)

    if (nextColumn) {
      table.columns.push(nextColumn)
    }
  })
}

const parseAlterTableStatement = (statement: string, tables: Map<string, PgDumpImportTable>) => {
  const normalized = normalizeSqlWhitespace(statement)
  const addConstraintMatch = normalized.match(/^alter table(?: only)?\s+([^\s]+)\s+add constraint\s+([^\s]+)\s+(.+)$/iu)

  if (addConstraintMatch) {
    const table = ensureTable(tables, addConstraintMatch[1] || '')

    applyTableConstraint(table, {
      expression: addConstraintMatch[3] || '',
      name: trimSqlIdentifier(addConstraintMatch[2] || '')
    })
    return
  }

  const setDefaultMatch = normalized.match(/^alter table(?: only)?\s+([^\s]+)\s+alter column\s+([^\s]+)\s+set default\s+(.+)$/iu)

  if (setDefaultMatch) {
    const table = ensureTable(tables, setDefaultMatch[1] || '')
    const column = findTableColumn(table, setDefaultMatch[2] || '')

    if (column) {
      addColumnModifier(column, `default: ${setDefaultMatch[3] || ''}`)
    }

    return
  }

  const setNotNullMatch = normalized.match(/^alter table(?: only)?\s+([^\s]+)\s+alter column\s+([^\s]+)\s+set not null$/iu)

  if (setNotNullMatch) {
    const table = ensureTable(tables, setNotNullMatch[1] || '')
    const column = findTableColumn(table, setNotNullMatch[2] || '')

    if (column) {
      addColumnModifier(column, 'not null')
    }
  }
}

const parseCreateIndexDefinition = (statement: string) => {
  const normalized = normalizeSqlWhitespace(statement)
  const keywordMatch = normalized.match(/^create\s+(unique\s+)?index\s+/iu)

  if (!keywordMatch) {
    return null
  }

  let remainder = normalized.slice(keywordMatch[0].length).trim()

  if (remainder.toLowerCase().startsWith('concurrently ')) {
    remainder = remainder.slice('concurrently '.length).trim()
  }

  if (remainder.toLowerCase().startsWith('if not exists ')) {
    remainder = remainder.slice('if not exists '.length).trim()
  }

  const indexIdentifier = readSqlIdentifier(remainder)

  if (!indexIdentifier?.raw) {
    return null
  }

  remainder = remainder.slice(indexIdentifier.nextIndex).trim()

  if (!remainder.toLowerCase().startsWith('on ')) {
    return null
  }

  remainder = remainder.slice('on '.length).trim()

  if (remainder.toLowerCase().startsWith('only ')) {
    remainder = remainder.slice('only '.length).trim()
  }

  const tableIdentifier = readSqlIdentifier(remainder)

  if (!tableIdentifier?.raw) {
    return null
  }

  remainder = remainder.slice(tableIdentifier.nextIndex).trim()

  let indexType = 'btree'

  if (remainder.toLowerCase().startsWith('using ')) {
    remainder = remainder.slice('using '.length).trim()

    const methodIdentifier = readSqlIdentifier(remainder)

    if (!methodIdentifier?.raw) {
      return null
    }

    indexType = trimSqlIdentifier(methodIdentifier.raw).toLowerCase()
    remainder = remainder.slice(methodIdentifier.nextIndex).trim()
  }

  const openParenIndex = remainder.indexOf('(')

  if (openParenIndex < 0) {
    return null
  }

  const columnsSection = readBalancedSection(remainder, openParenIndex)

  if (!columnsSection) {
    return null
  }

  const columns = splitTopLevelSqlList(columnsSection.content)

  if (columns.length === 0) {
    return null
  }

  return {
    columns: columns.map((column) => {
      return trimSqlIdentifier(column)
    }),
    name: trimSqlIdentifier(indexIdentifier.raw),
    tableName: normalizeQualifiedName(tableIdentifier.raw),
    type: indexType
  } satisfies PgDumpImportIndex & { tableName: string }
}

const parseCreateIndexStatement = (statement: string, tables: Map<string, PgDumpImportTable>) => {
  const parsedIndex = parseCreateIndexDefinition(statement)

  if (!parsedIndex) {
    return
  }

  const table = ensureTable(tables, parsedIndex.tableName)

  table.indexes.push({
    columns: parsedIndex.columns,
    name: parsedIndex.name,
    type: parsedIndex.type
  })
}

const parseCreateEnumStatement = (statement: string, enums: Map<string, PgDumpImportEnum>) => {
  const normalized = normalizeSqlWhitespace(statement)
  const enumMatch = normalized.match(/^create type\s+([^\s]+)\s+as enum\s*\((.+)\)$/iu)

  if (!enumMatch) {
    return
  }

  enums.set(normalizeQualifiedName(enumMatch[1] || ''), {
    name: normalizeQualifiedName(enumMatch[1] || ''),
    values: splitTopLevelSqlList(enumMatch[2] || '').map((entry) => {
      return entry.trim().replace(/^'(.*)'$/u, '$1')
    })
  })
}

const parseCreateCompositeStatement = (statement: string, composites: Map<string, PgDumpImportComposite>) => {
  const normalized = normalizeSqlWhitespace(statement)
  const compositeMatch = normalized.match(/^create type\s+([^\s]+)\s+as\s*\((.+)\)$/iu)

  if (!compositeMatch) {
    return
  }

  composites.set(normalizeQualifiedName(compositeMatch[1] || ''), {
    fields: splitTopLevelSqlList(compositeMatch[2] || '').map((field) => {
      return field.trim()
    }),
    name: normalizeQualifiedName(compositeMatch[1] || '')
  })
}

const parseCreateDomainStatement = (statement: string, domains: Map<string, PgDumpImportDomain>) => {
  const normalized = normalizeSqlWhitespace(statement)
  const domainMatch = normalized.match(/^create domain\s+([^\s]+)\s+as\s+(.+)$/iu)

  if (!domainMatch) {
    return
  }

  const definition = domainMatch[2] || ''
  const baseTypeEndIndex = findTopLevelKeywordIndex(definition, [
    'constraint',
    'check',
    'collate',
    'default',
    'not null'
  ])
  const baseType = baseTypeEndIndex < 0 ? definition.trim() : definition.slice(0, baseTypeEndIndex).trim()
  const details: string[] = [`base: ${baseType}`]
  const checkMatch = definition.match(/\bcheck\s*\((.+)\)/iu)
  const defaultMatch = definition.match(/\bdefault\s+(.+?)(?:\s+not null|\s+constraint|\s+check|$)/iu)

  if (checkMatch) {
    details.push(`check: ${trimOuterParentheses(checkMatch[1] || '')}`)
  }

  if (defaultMatch) {
    details.push(`default: ${(defaultMatch[1] || '').trim()}`)
  }

  if (/\bnot null\b/iu.test(definition)) {
    details.push('not_null: true')
  }

  domains.set(normalizeQualifiedName(domainMatch[1] || ''), {
    baseType,
    details,
    name: normalizeQualifiedName(domainMatch[1] || '')
  })
}

const parseCreateSequenceStatement = (
  statement: string,
  sequences: Map<string, PgDumpImportSequence>,
  options: PgDumpImportIdentifierNormalizationOptions
) => {
  const normalized = normalizeSqlWhitespace(statement)
  const keywordMatch = normalized.match(/^create sequence\s+/iu)

  if (!keywordMatch) {
    return
  }

  const afterKeyword = normalized.slice(keywordMatch[0].length)
  const identifier = readSqlIdentifier(afterKeyword)

  if (!identifier?.raw) {
    return
  }

  const normalizedName = normalizeQualifiedName(identifier.raw)
  const remainder = afterKeyword.slice(identifier.nextIndex).trim()
  const normalizedSourceStatement = `CREATE SEQUENCE ${normalizeQualifiedNameForImportedSource(identifier.raw, options)}${remainder.length > 0 ? ` ${remainder}` : ''}`

  sequences.set(normalizedName, {
    name: normalizedName,
    statements: [normalizedSourceStatement.trim()]
  })
}

const appendSequenceStatement = (
  statement: string,
  sequences: Map<string, PgDumpImportSequence>,
  options: PgDumpImportIdentifierNormalizationOptions
) => {
  const normalized = normalizeSqlWhitespace(statement)
  const sequenceMatch = normalized.match(/^alter sequence\s+([^\s]+)\s+owned by\s+([^\s]+)\.([^\s;]+)$/iu)

  if (!sequenceMatch?.[1] || !sequenceMatch[2] || !sequenceMatch[3]) {
    return false
  }

  const normalizedName = normalizeQualifiedName(sequenceMatch[1] || '')
  const sequence = sequences.get(normalizedName)

  if (!sequence) {
    return false
  }

  sequence.statements.push(
    `ALTER SEQUENCE ${normalizeQualifiedNameForImportedSource(sequenceMatch[1] || '', options)} OWNED BY ${normalizeReferenceTargetForImportedSource(sequenceMatch[2], sequenceMatch[3], options)}`
  )

  return true
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

  const returnsClause = readKeywordClause(remainder, 'returns', [
    'language',
    'immutable',
    'stable',
    'volatile',
    'security',
    'leakproof',
    'cost',
    'rows',
    'support',
    'set',
    'as'
  ])

  if (!returnsClause) {
    return `${name}(${argsSection.content.trim()})${replacePrefix}`
  }

  return `${name}(${argsSection.content.trim()}) returns ${returnsClause.value}${replacePrefix}`
}

const parseRoutineStatement = (
  statement: string,
  keyword: 'function' | 'procedure',
  routines: Map<string, PgDumpImportRoutine>
) => {
  const signature = parseRoutineSignature(statement, keyword)

  if (!signature) {
    return
  }

  routines.set(signature, {
    signature,
    source: statement.trim()
  })
}

const parseTriggerStatement = (statement: string, triggers: Map<string, PgDumpImportTrigger>) => {
  const normalized = normalizeSqlWhitespace(statement)
  const triggerMatch = normalized.match(/^create trigger\s+([^\s]+)\s+.+\s+on\s+([^\s]+)\s+.+$/iu)

  if (!triggerMatch) {
    return
  }

  const triggerName = trimSqlIdentifier(triggerMatch[1] || '')

  triggers.set(triggerName, {
    name: triggerName,
    source: statement.trim(),
    tableName: normalizeQualifiedName(triggerMatch[2] || '')
  })
}

const shouldIgnoreStatement = (statement: string) => {
  const normalized = normalizeSqlWhitespace(statement).toLowerCase()

  if (normalized.length === 0) {
    return true
  }

  if (normalized.startsWith('copy ')) {
    return true
  }

  if (normalized.startsWith('alter sequence ') && normalized.includes(' owner to ')) {
    return true
  }

  if (normalized.startsWith('alter table ') && normalized.includes(' owner to ')) {
    return true
  }

  return ignoredStatementPrefixes.some((prefix) => {
    return normalized.startsWith(prefix)
  })
}

const renderTable = (table: PgDumpImportTable) => {
  const lines = [`Table ${table.name} {`]
  const inlineIndexes = table.indexes.filter((index) => {
    return index.columns.every((column) => {
      return !column.includes('(') && !column.includes(')')
    })
  })
  const structuredIndexes = table.indexes.filter((index) => {
    return index.columns.some((column) => {
      return column.includes('(') || column.includes(')')
    })
  })

  table.columns.forEach((column) => {
    const modifiers = column.modifiers.length > 0 ? ` [${column.modifiers.join(', ')}]` : ''

    lines.push(`  ${column.name} ${column.type}${modifiers}`)
  })

  if (table.constraints.length > 0 || table.indexes.length > 0) {
    lines.push('')
  }

  table.constraints.forEach((constraint) => {
    lines.push(`  Constraint ${constraint.name}: ${constraint.expression}`)
  })

  inlineIndexes.forEach((index) => {
    lines.push(`  Index ${index.name} (${index.columns.join(', ')}) [type: ${index.type}]`)
  })

  if (structuredIndexes.length > 0) {
    lines.push('  Indexes {')

    structuredIndexes.forEach((index) => {
      lines.push(`    (${index.columns.join(', ')}) [name: ${index.name}, type: ${index.type}]`)
    })

    lines.push('  }')
  }

  lines.push('}')

  return lines.join('\n')
}

const renderSqlSourceBlock = (header: string, source: string) => {
  return `${header} {\n  source: $sql$\n${indentSqlSource(source)}\n  $sql$\n}`
}

const renderSequenceBlock = (name: string, metadata: Array<{ key: string, value: string }>) => {
  return `Sequence ${name} {\n${metadata.map(entry => `  ${entry.key}: ${entry.value}`).join('\n')}\n}`
}

const renderImportedPgml = (accumulator: PgDumpImportAccumulator) => {
  const sections: string[] = [pgDumpCommentLines.join('\n')]

  accumulator.enums.forEach((entry) => {
    sections.push(`Enum ${entry.name} {\n${entry.values.map(value => `  ${value}`).join('\n')}\n}`)
  })

  accumulator.domains.forEach((entry) => {
    sections.push(`Domain ${entry.name} {\n${entry.details.map(detail => `  ${detail}`).join('\n')}\n}`)
  })

  accumulator.composites.forEach((entry) => {
    sections.push(`Composite ${entry.name} {\n${entry.fields.map(field => `  ${field}`).join('\n')}\n}`)
  })

  accumulator.sequences.forEach((entry) => {
    const source = `${entry.statements.join(';\n\n')};`
    const extractedDefinition = extractPgmlSequenceSourceDefinition(source)

    if (extractedDefinition.isFullyStructured && extractedDefinition.metadata.length > 0) {
      sections.push(renderSequenceBlock(entry.name, extractedDefinition.metadata))
      return
    }

    sections.push(renderSqlSourceBlock(`Sequence ${entry.name}`, source))
  })

  accumulator.tables.forEach((entry) => {
    sections.push(renderTable(entry))
  })

  accumulator.functions.forEach((entry) => {
    sections.push(renderSqlSourceBlock(`Function ${entry.signature}`, entry.source.endsWith(';') ? entry.source : `${entry.source};`))
  })

  accumulator.procedures.forEach((entry) => {
    sections.push(renderSqlSourceBlock(`Procedure ${entry.signature}`, entry.source.endsWith(';') ? entry.source : `${entry.source};`))
  })

  accumulator.triggers.forEach((entry) => {
    sections.push(renderSqlSourceBlock(`Trigger ${entry.name} on ${entry.tableName}`, entry.source.endsWith(';') ? entry.source : `${entry.source};`))
  })

  return sections.join('\n\n')
}

export const convertPgDumpToPgml = (input: {
  foldIdentifiersToLowercase?: boolean
  preferredName?: string | null
  sql: string
}): PgDumpImportResult => {
  const strippedSource = stripPgDumpCopySections(input.sql)
  const statements = splitSqlStatements(strippedSource)
  const accumulator: PgDumpImportAccumulator = {
    composites: new Map<string, PgDumpImportComposite>(),
    domains: new Map<string, PgDumpImportDomain>(),
    enums: new Map<string, PgDumpImportEnum>(),
    functions: new Map<string, PgDumpImportRoutine>(),
    procedures: new Map<string, PgDumpImportRoutine>(),
    sequences: new Map<string, PgDumpImportSequence>(),
    tables: new Map<string, PgDumpImportTable>(),
    triggers: new Map<string, PgDumpImportTrigger>()
  }

  statements.forEach((statement) => {
    const normalized = normalizeSqlWhitespace(statement).toLowerCase()

    if (shouldIgnoreStatement(statement)) {
      return
    }

    if (normalized.startsWith('create table ')) {
      parseCreateTableStatement(statement, accumulator.tables)
      return
    }

    if (normalized.startsWith('alter table ')) {
      parseAlterTableStatement(statement, accumulator.tables)
      return
    }

    if (normalized.startsWith('create index ') || normalized.startsWith('create unique index ')) {
      parseCreateIndexStatement(statement, accumulator.tables)
      return
    }

    if (normalized.startsWith('create type ') && normalized.includes(' as enum ')) {
      parseCreateEnumStatement(statement, accumulator.enums)
      return
    }

    if (normalized.startsWith('create type ') && normalized.includes(' as (')) {
      parseCreateCompositeStatement(statement, accumulator.composites)
      return
    }

    if (normalized.startsWith('create domain ')) {
      parseCreateDomainStatement(statement, accumulator.domains)
      return
    }

    if (normalized.startsWith('create sequence ')) {
      parseCreateSequenceStatement(statement, accumulator.sequences, input)
      return
    }

    if (normalized.startsWith('alter sequence ') && normalized.includes(' owned by ')) {
      appendSequenceStatement(statement, accumulator.sequences, input)
      return
    }

    if (normalized.startsWith('create function ') || normalized.startsWith('create or replace function ')) {
      parseRoutineStatement(statement, 'function', accumulator.functions)
      return
    }

    if (normalized.startsWith('create procedure ') || normalized.startsWith('create or replace procedure ')) {
      parseRoutineStatement(statement, 'procedure', accumulator.procedures)
      return
    }

    if (normalized.startsWith('create trigger ')) {
      parseTriggerStatement(statement, accumulator.triggers)
    }
  })

  const pgml = canonicalizeImportedPgmlSource(renderImportedPgml(accumulator), {
    foldIdentifiersToLowercase: input.foldIdentifiersToLowercase
  })
  const hasImportedObjects = accumulator.tables.size > 0
    || accumulator.enums.size > 0
    || accumulator.domains.size > 0
    || accumulator.composites.size > 0
    || accumulator.sequences.size > 0
    || accumulator.functions.size > 0
    || accumulator.procedures.size > 0
    || accumulator.triggers.size > 0

  if (!hasImportedObjects) {
    throw new Error('No importable schema objects were found in that pg_dump.')
  }

  return {
    pgml,
    schemaName: derivePgDumpSchemaName(input.preferredName)
  }
}
