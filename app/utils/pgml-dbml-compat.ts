import { getPgmlIndexKeyValue, parsePgmlIndexKeys, type PgmlIndexKey } from './pgml-index-keys'
import { readBalancedSection } from './sql-scan'

type BracketQuoteMode = { kind: 'normal' | 'single-quoted' | 'double-quoted' | 'backtick' }
type CompatLineMode = BracketQuoteMode | { kind: 'block-comment' }
type CompatSourceMode = { kind: 'pgml', blockComment: boolean }
  | { kind: 'source', delimiter: string, resumeBlockComment: boolean }

export type PgmlCompatibleRelation = '>' | '<' | '-'

export type PgmlCompatibleReferenceDeclaration = {
  fromColumns: string[]
  fromTable: string
  name: string | null
  onDelete: string | null
  onUpdate: string | null
  relation: PgmlCompatibleRelation
  toColumns: string[]
  toTable: string
}

export type PgmlCompatibleIndexDefinition = {
  columns: string[]
  keys: PgmlIndexKey[]
  name: string | null
  type: string | null
  unique: boolean
  where: string | null
}

export type PgmlCompatibleCheckDefinition = {
  expression: string
  name: string | null
}

export type PgmlCompatibleMultilineEntry = {
  endIndex: number
  startIndex: number
  text: string
}

const sourceDelimiterPattern = /^(source|definition):\s*(\$(?:[A-Za-z0-9_]+)?\$)(.*)$/

const cleanName = (value: string) => value.replaceAll('"', '').trim()

export const splitBracketParts = (value: string) => {
  const parts: string[] = []
  let currentPart = ''
  let mode: BracketQuoteMode = { kind: 'normal' }
  let parenthesisDepth = 0
  let bracketDepth = 0

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] || ''
    const nextCharacter = value[index + 1] || ''

    if (mode.kind === 'single-quoted') {
      currentPart += character

      if (character === '\'' && nextCharacter === '\'') {
        currentPart += nextCharacter
        index += 1
        continue
      }

      if (character === '\'') {
        mode = { kind: 'normal' }
      }

      continue
    }

    if (mode.kind === 'double-quoted') {
      currentPart += character

      if (character === '"' && nextCharacter === '"') {
        currentPart += nextCharacter
        index += 1
        continue
      }

      if (character === '"') {
        mode = { kind: 'normal' }
      }

      continue
    }

    if (mode.kind === 'backtick') {
      currentPart += character

      if (character === '`') {
        mode = { kind: 'normal' }
      }

      continue
    }

    if (character === '\'') {
      mode = { kind: 'single-quoted' }
      currentPart += character
      continue
    }

    if (character === '"') {
      mode = { kind: 'double-quoted' }
      currentPart += character
      continue
    }

    if (character === '`') {
      mode = { kind: 'backtick' }
      currentPart += character
      continue
    }

    if (character === '(') {
      parenthesisDepth += 1
      currentPart += character
      continue
    }

    if (character === ')') {
      parenthesisDepth = Math.max(0, parenthesisDepth - 1)
      currentPart += character
      continue
    }

    if (character === '[') {
      bracketDepth += 1
      currentPart += character
      continue
    }

    if (character === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1)
      currentPart += character
      continue
    }

    if (character === ',' && parenthesisDepth === 0 && bracketDepth === 0) {
      const trimmedPart = currentPart.trim()

      if (trimmedPart.length > 0) {
        parts.push(trimmedPart)
      }

      currentPart = ''
      continue
    }

    currentPart += character
  }

  const trimmedPart = currentPart.trim()

  if (trimmedPart.length > 0) {
    parts.push(trimmedPart)
  }

  return parts
}

const getBracketOptionValue = (
  options: string[],
  key: string
) => {
  const option = options.find((entry) => {
    return entry.toLowerCase().startsWith(`${key}:`)
  })

  if (!option) {
    return null
  }

  return option.slice(option.indexOf(':') + 1).trim().toLowerCase()
}

export const splitTrailingBracketOptions = (value: string) => {
  const trimmedValue = value.trim()

  if (!trimmedValue.endsWith(']')) {
    return {
      body: trimmedValue,
      options: null
    }
  }

  let mode: BracketQuoteMode = { kind: 'normal' }
  let bracketDepth = 0

  for (let index = trimmedValue.length - 1; index >= 0; index -= 1) {
    const character = trimmedValue[index] || ''
    const previousCharacter = trimmedValue[index - 1] || ''

    if (mode.kind === 'single-quoted') {
      if (character === '\'' && previousCharacter !== '\'') {
        mode = { kind: 'normal' }
      }

      continue
    }

    if (mode.kind === 'double-quoted') {
      if (character === '"' && previousCharacter !== '"') {
        mode = { kind: 'normal' }
      }

      continue
    }

    if (mode.kind === 'backtick') {
      if (character === '`') {
        mode = { kind: 'normal' }
      }

      continue
    }

    if (character === '\'') {
      mode = { kind: 'single-quoted' }
      continue
    }

    if (character === '"') {
      mode = { kind: 'double-quoted' }
      continue
    }

    if (character === '`') {
      mode = { kind: 'backtick' }
      continue
    }

    if (character === ']') {
      bracketDepth += 1
      continue
    }

    if (character === '[') {
      bracketDepth -= 1

      if (bracketDepth === 0) {
        return {
          body: trimmedValue.slice(0, index).trim(),
          options: trimmedValue.slice(index + 1, -1).trim()
        }
      }
    }
  }

  return {
    body: trimmedValue,
    options: null
  }
}

const parseReferenceEndpointWithOptions = (value: string) => {
  const parsedValue = splitTrailingBracketOptions(value)
  const endpoint = cleanName(parsedValue.body)
  const options = parsedValue.options ? splitBracketParts(parsedValue.options) : []

  return {
    endpoint,
    onDelete: getBracketOptionValue(options, 'delete'),
    onUpdate: getBracketOptionValue(options, 'update')
  }
}

const findSourceDelimiter = (line: string) => {
  const match = line.trim().match(sourceDelimiterPattern)

  if (!match?.[2]) {
    return null
  }

  if (typeof match[3] === 'string' && match[3].includes(match[2])) {
    return ''
  }

  return match[2]
}

const stripCommentsFromLine = (
  line: string,
  isInsideBlockComment: boolean
) => {
  const characters = Array.from(line)
  let mode: CompatLineMode = { kind: isInsideBlockComment ? 'block-comment' : 'normal' }
  let index = 0

  while (index < characters.length) {
    const character = characters[index] || ''
    const nextCharacter = characters[index + 1] || ''

    if (mode.kind === 'block-comment') {
      characters[index] = ' '

      if (character === '*' && nextCharacter === '/') {
        characters[index + 1] = ' '
        mode = { kind: 'normal' }
        index += 2
        continue
      }

      index += 1
      continue
    }

    if (mode.kind === 'single-quoted') {
      if (character === '\'' && nextCharacter === '\'') {
        index += 2
        continue
      }

      if (character === '\'') {
        mode = { kind: 'normal' }
      }

      index += 1
      continue
    }

    if (mode.kind === 'double-quoted') {
      if (character === '"' && nextCharacter === '"') {
        index += 2
        continue
      }

      if (character === '"') {
        mode = { kind: 'normal' }
      }

      index += 1
      continue
    }

    if (mode.kind === 'backtick') {
      if (character === '`') {
        mode = { kind: 'normal' }
      }

      index += 1
      continue
    }

    if (character === '\'') {
      mode = { kind: 'single-quoted' }
      index += 1
      continue
    }

    if (character === '"') {
      mode = { kind: 'double-quoted' }
      index += 1
      continue
    }

    if (character === '`') {
      mode = { kind: 'backtick' }
      index += 1
      continue
    }

    if (character === '/' && nextCharacter === '*') {
      characters[index] = ' '
      characters[index + 1] = ' '
      mode = { kind: 'block-comment' }
      index += 2
      continue
    }

    if (character === '/' && nextCharacter === '/') {
      for (let offset = index; offset < characters.length; offset += 1) {
        characters[offset] = ' '
      }

      break
    }

    index += 1
  }

  return {
    isInsideBlockComment: mode.kind === 'block-comment',
    line: characters.join('')
  }
}

export const normalizePgmlCompatSource = (source: string) => {
  const normalizedSource = source.replaceAll('\r\n', '\n')
  const lines = normalizedSource.split('\n')
  const nextLines: string[] = []
  let mode: CompatSourceMode = { kind: 'pgml', blockComment: false }

  lines.forEach((line) => {
    if (mode.kind === 'source') {
      nextLines.push(line)

      if (line.includes(mode.delimiter)) {
        mode = { kind: 'pgml', blockComment: mode.resumeBlockComment }
      }

      return
    }

    const normalizedLine = stripCommentsFromLine(line, mode.blockComment)
    nextLines.push(normalizedLine.line)
    mode = { kind: 'pgml', blockComment: normalizedLine.isInsideBlockComment }

    const detectedDelimiter = findSourceDelimiter(normalizedLine.line)

    if (detectedDelimiter && detectedDelimiter.length > 0) {
      mode = { kind: 'source', delimiter: detectedDelimiter, resumeBlockComment: mode.blockComment }
    }
  })

  return nextLines.join('\n')
}

const parseReferenceEndpoint = (value: string) => {
  const trimmedValue = cleanName(value)
  const compositeMatch = trimmedValue.match(/^(.+?)\.\(([^)]+)\)$/)

  if (compositeMatch) {
    return {
      columns: (compositeMatch[2] || '')
        .split(',')
        .map(column => cleanName(column))
        .filter(column => column.length > 0),
      table: cleanName(compositeMatch[1] || '')
    }
  }

  const parts = trimmedValue
    .split('.')
    .map(part => part.trim())
    .filter(part => part.length > 0)

  if (parts.length >= 2) {
    return {
      columns: [parts.at(-1) || ''].filter(column => column.length > 0),
      table: parts.slice(0, -1).join('.')
    }
  }

  return {
    columns: [],
    table: trimmedValue
  }
}

export const parsePgmlCompatibleReference = (value: string): PgmlCompatibleReferenceDeclaration | null => {
  const declarationMatch = value.trim().match(/^Ref(?:\s+([^:]+))?:\s*(.+?)\s*([<>-])\s*(.+)$/)

  if (!declarationMatch) {
    return null
  }

  const fromTarget = parseReferenceEndpoint(declarationMatch[2] || '')
  const relation = (declarationMatch[3] || '>') as PgmlCompatibleRelation
  const parsedTarget = parseReferenceEndpointWithOptions(declarationMatch[4] || '')
  const toTarget = parseReferenceEndpoint(parsedTarget.endpoint)

  if (fromTarget.table.length === 0 || toTarget.table.length === 0) {
    return null
  }

  if (fromTarget.columns.length === 0 || toTarget.columns.length === 0) {
    return null
  }

  if (fromTarget.columns.length !== toTarget.columns.length) {
    return null
  }

  return {
    fromColumns: fromTarget.columns,
    fromTable: fromTarget.table,
    name: declarationMatch[1] ? cleanName(declarationMatch[1]) : null,
    onDelete: parsedTarget.onDelete,
    onUpdate: parsedTarget.onUpdate,
    relation,
    toColumns: toTarget.columns,
    toTable: toTarget.table
  }
}

export const parseDbmlCompatibleIndexDefinition = (value: string): PgmlCompatibleIndexDefinition | null => {
  const parsedValue = splitTrailingBracketOptions(value)

  if (parsedValue.body.length === 0) {
    return null
  }

  const rawColumnValue = parsedValue.body
  const section = rawColumnValue.startsWith('(') ? readBalancedSection(rawColumnValue, 0) : null

  if (rawColumnValue.startsWith('(') && (!section || section.endIndex !== rawColumnValue.length - 1)) {
    return null
  }

  const columnList = section ? section.content : rawColumnValue
  const keys = parsePgmlIndexKeys(columnList)
  const options = parsedValue.options ? splitBracketParts(parsedValue.options) : []
  const nameEntry = options.find(option => option.startsWith('name:'))
  const typeEntry = options.find(option => option.startsWith('type:'))
  const whereEntry = options.find(option => option.startsWith('where:'))

  return {
    columns: keys.map(getPgmlIndexKeyValue),
    keys,
    name: nameEntry ? nameEntry.replace(/^name:\s*/, '').replaceAll(/^['"`]+|['"`]+$/g, '').trim() : null,
    type: typeEntry ? typeEntry.replace(/^type:\s*/, '').trim() : null,
    unique: options.includes('unique'),
    where: whereEntry ? whereEntry.replace(/^where:\s*/, '').trim() : null
  }
}

export const parsePgmlInlineIndexDefinition = (value: string) => {
  const header = value.match(/^Index\s+([^\s(]+)\s*(?=\()/u)

  if (!header || header[1] === undefined) {
    return null
  }

  const body = value.slice(header[0].length)
  const definition = parseDbmlCompatibleIndexDefinition(body)

  if (!definition) {
    return null
  }

  return { ...definition, name: cleanName(header[1]), options: splitTrailingBracketOptions(body).options }
}

export const parseDbmlCompatibleCheckDefinition = (value: string): PgmlCompatibleCheckDefinition | null => {
  const parsedValue = splitTrailingBracketOptions(value)
  const body = parsedValue.body.trim()
  const expressionMatch = body.match(/^`([\s\S]+)`$/)

  if (!expressionMatch) {
    return null
  }

  const options = parsedValue.options ? splitBracketParts(parsedValue.options) : []
  const nameEntry = options.find(option => option.startsWith('name:'))

  return {
    expression: (expressionMatch[1] || '').trim(),
    name: nameEntry ? nameEntry.replace(/^name:\s*/, '').replaceAll(/^['"`]+|['"`]+$/g, '').trim() : null
  }
}

export const collectDbmlCompatibleMultilineEntries = (lines: string[]) => {
  const entries: PgmlCompatibleMultilineEntry[] = []
  let entry: { lines: string[], startIndex: number } | null = null

  for (const [index, line] of lines.entries()) {
    const trimmedLine = line.trim()

    if (!entry) {
      if (trimmedLine.length === 0) {
        continue
      }

      if ((trimmedLine.match(/`/g) || []).length % 2 === 1) {
        entry = { lines: [trimmedLine], startIndex: index }
      } else {
        entries.push({
          endIndex: index,
          startIndex: index,
          text: trimmedLine
        })
      }

      continue
    }

    entry.lines.push(trimmedLine)

    if ((trimmedLine.match(/`/g) || []).length % 2 === 1) {
      entries.push({
        endIndex: index,
        startIndex: entry.startIndex,
        text: entry.lines.join('\n')
      })
      entry = null
    }
  }

  if (entry) {
    entries.push({
      endIndex: lines.length - 1,
      startIndex: entry.startIndex,
      text: entry.lines.join('\n')
    })
  }

  return entries
}
