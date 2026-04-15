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

const splitBracketParts = (value: string) => {
  const parts: string[] = []
  let currentPart = ''
  let insideSingleQuote = false
  let insideDoubleQuote = false
  let insideBacktick = false
  let parenthesisDepth = 0
  let bracketDepth = 0

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] || ''
    const nextCharacter = value[index + 1] || ''

    if (insideSingleQuote) {
      currentPart += character

      if (character === '\'' && nextCharacter === '\'') {
        currentPart += nextCharacter
        index += 1
        continue
      }

      if (character === '\'') {
        insideSingleQuote = false
      }

      continue
    }

    if (insideDoubleQuote) {
      currentPart += character

      if (character === '"' && nextCharacter === '"') {
        currentPart += nextCharacter
        index += 1
        continue
      }

      if (character === '"') {
        insideDoubleQuote = false
      }

      continue
    }

    if (insideBacktick) {
      currentPart += character

      if (character === '`') {
        insideBacktick = false
      }

      continue
    }

    if (character === '\'') {
      insideSingleQuote = true
      currentPart += character
      continue
    }

    if (character === '"') {
      insideDoubleQuote = true
      currentPart += character
      continue
    }

    if (character === '`') {
      insideBacktick = true
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

const splitTrailingBracketOptions = (value: string) => {
  const trimmedValue = value.trim()

  if (!trimmedValue.endsWith(']')) {
    return {
      body: trimmedValue,
      options: null
    }
  }

  let insideSingleQuote = false
  let insideDoubleQuote = false
  let insideBacktick = false
  let bracketDepth = 0

  for (let index = trimmedValue.length - 1; index >= 0; index -= 1) {
    const character = trimmedValue[index] || ''
    const previousCharacter = trimmedValue[index - 1] || ''

    if (insideSingleQuote) {
      if (character === '\'' && previousCharacter !== '\'') {
        insideSingleQuote = false
      }

      continue
    }

    if (insideDoubleQuote) {
      if (character === '"' && previousCharacter !== '"') {
        insideDoubleQuote = false
      }

      continue
    }

    if (insideBacktick) {
      if (character === '`') {
        insideBacktick = false
      }

      continue
    }

    if (character === '\'') {
      insideSingleQuote = true
      continue
    }

    if (character === '"') {
      insideDoubleQuote = true
      continue
    }

    if (character === '`') {
      insideBacktick = true
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
  let insideBlockComment = isInsideBlockComment
  let insideSingleQuote = false
  let insideDoubleQuote = false
  let insideBacktick = false
  let index = 0

  while (index < characters.length) {
    const character = characters[index] || ''
    const nextCharacter = characters[index + 1] || ''

    if (insideBlockComment) {
      characters[index] = ' '

      if (character === '*' && nextCharacter === '/') {
        characters[index + 1] = ' '
        insideBlockComment = false
        index += 2
        continue
      }

      index += 1
      continue
    }

    if (insideSingleQuote) {
      if (character === '\'' && nextCharacter === '\'') {
        index += 2
        continue
      }

      if (character === '\'') {
        insideSingleQuote = false
      }

      index += 1
      continue
    }

    if (insideDoubleQuote) {
      if (character === '"' && nextCharacter === '"') {
        index += 2
        continue
      }

      if (character === '"') {
        insideDoubleQuote = false
      }

      index += 1
      continue
    }

    if (insideBacktick) {
      if (character === '`') {
        insideBacktick = false
      }

      index += 1
      continue
    }

    if (character === '\'') {
      insideSingleQuote = true
      index += 1
      continue
    }

    if (character === '"') {
      insideDoubleQuote = true
      index += 1
      continue
    }

    if (character === '`') {
      insideBacktick = true
      index += 1
      continue
    }

    if (character === '/' && nextCharacter === '*') {
      characters[index] = ' '
      characters[index + 1] = ' '
      insideBlockComment = true
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
    isInsideBlockComment: insideBlockComment,
    line: characters.join('')
  }
}

export const normalizePgmlCompatSource = (source: string) => {
  const normalizedSource = source.replaceAll('\r\n', '\n')
  const lines = normalizedSource.split('\n')
  const nextLines: string[] = []
  let isInsideBlockComment = false
  let sourceDelimiter: string | null = null

  lines.forEach((line) => {
    if (sourceDelimiter) {
      nextLines.push(line)

      if (line.includes(sourceDelimiter)) {
        sourceDelimiter = null
      }

      return
    }

    const normalizedLine = stripCommentsFromLine(line, isInsideBlockComment)
    nextLines.push(normalizedLine.line)
    isInsideBlockComment = normalizedLine.isInsideBlockComment

    const detectedDelimiter = findSourceDelimiter(normalizedLine.line)

    if (detectedDelimiter && detectedDelimiter.length > 0) {
      sourceDelimiter = detectedDelimiter
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
  const columnList = rawColumnValue.startsWith('(') && rawColumnValue.endsWith(')')
    ? rawColumnValue.slice(1, -1)
    : rawColumnValue
  const options = parsedValue.options ? splitBracketParts(parsedValue.options) : []
  const nameEntry = options.find(option => option.startsWith('name:'))
  const typeEntry = options.find(option => option.startsWith('type:'))
  const whereEntry = options.find(option => option.startsWith('where:'))

  return {
    columns: columnList
      .split(',')
      .map(column => cleanName(column))
      .filter(column => column.length > 0),
    name: nameEntry ? nameEntry.replace(/^name:\s*/, '').replaceAll(/^['"`]+|['"`]+$/g, '').trim() : null,
    type: typeEntry ? typeEntry.replace(/^type:\s*/, '').trim() : null,
    unique: options.includes('unique'),
    where: whereEntry ? whereEntry.replace(/^where:\s*/, '').trim() : null
  }
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
  let currentLines: string[] = []
  let currentStartIndex = 0
  let insideEntry = false

  lines.forEach((line, index) => {
    const trimmedLine = line.trim()

    if (!insideEntry) {
      if (trimmedLine.length === 0) {
        return
      }

      currentLines = [trimmedLine]
      currentStartIndex = index
      insideEntry = (trimmedLine.match(/`/g) || []).length % 2 === 1

      if (!insideEntry) {
        entries.push({
          endIndex: index,
          startIndex: index,
          text: trimmedLine
        })
      }

      return
    }

    currentLines.push(trimmedLine)

    if ((trimmedLine.match(/`/g) || []).length % 2 === 1) {
      entries.push({
        endIndex: index,
        startIndex: currentStartIndex,
        text: currentLines.join('\n')
      })
      currentLines = []
      insideEntry = false
    }
  })

  if (insideEntry) {
    entries.push({
      endIndex: lines.length - 1,
      startIndex: currentStartIndex,
      text: currentLines.join('\n')
    })
  }

  return entries
}
