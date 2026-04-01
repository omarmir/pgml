export type PgmlCompatibleRelation = '>' | '<' | '-'

export type PgmlCompatibleReferenceDeclaration = {
  fromColumns: string[]
  fromTable: string
  name: string | null
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
  return value
    .split(',')
    .map(part => part.trim())
    .filter(part => part.length > 0)
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
  const toTarget = parseReferenceEndpoint(declarationMatch[4] || '')

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
    relation,
    toColumns: toTarget.columns,
    toTable: toTarget.table
  }
}

export const parseDbmlCompatibleIndexDefinition = (value: string): PgmlCompatibleIndexDefinition | null => {
  const match = value.trim().match(/^(.*?)(?:\s*\[([^\]]+)\])?$/)

  if (!match?.[1]) {
    return null
  }

  const rawColumnValue = match[1].trim()
  const columnList = rawColumnValue.startsWith('(') && rawColumnValue.endsWith(')')
    ? rawColumnValue.slice(1, -1)
    : rawColumnValue
  const options = match[2] ? splitBracketParts(match[2]) : []
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
  const match = value.trim().match(/^`([\s\S]+)`(?:\s*\[([^\]]+)\])?$/)

  if (!match) {
    return null
  }

  const options = match[2] ? splitBracketParts(match[2]) : []
  const nameEntry = options.find(option => option.startsWith('name:'))

  return {
    expression: (match[1] || '').trim(),
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
