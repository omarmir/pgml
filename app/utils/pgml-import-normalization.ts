import {
  normalizePgmlCompatSource,
  parsePgmlCompatibleReference
} from './pgml-dbml-compat'
import { normalizePgmlColumnModifiers } from './pgml-column-modifiers'
import { normalizePgmlTypeExpression } from './pgml-types'

export type PgmlImportIdentifierNormalizationOptions = {
  foldIdentifiersToLowercase?: boolean
}

type PgmlImportBlockKind = 'Composite'
  | 'Domain'
  | 'Enum'
  | 'Function'
  | 'Procedure'
  | 'Sequence'
  | 'Table'
  | 'TableGroup'
  | 'Trigger'

const sourceDelimiterPattern = /^(source|definition):\s*(\$(?:[A-Za-z0-9_]+)?\$)(.*)$/u

const normalizeLineEndings = (value: string) => {
  return value.replaceAll('\r\n', '\n')
}

const trimQuotedIdentifier = (value: string) => {
  return value.trim().replaceAll('"', '')
}

const applyIdentifierCase = (
  value: string,
  options: PgmlImportIdentifierNormalizationOptions
) => {
  return options.foldIdentifiersToLowercase ? value.toLowerCase() : value
}

const normalizeImportedIdentifier = (
  value: string,
  options: PgmlImportIdentifierNormalizationOptions
) => {
  return applyIdentifierCase(trimQuotedIdentifier(value), options)
}

const normalizeLookupKey = (value: string) => {
  return trimQuotedIdentifier(value).toLowerCase()
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

export const normalizeImportedQualifiedName = (
  value: string,
  options: PgmlImportIdentifierNormalizationOptions = {}
) => {
  const parts = splitIdentifierParts(value)
    .map(part => normalizeImportedIdentifier(part, options))
    .filter(part => part.length > 0)

  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}.${parts[parts.length - 1]}`
  }

  const bareName = parts[0] || normalizeImportedIdentifier(value, options)

  if (bareName.length === 0) {
    return 'public'
  }

  return `public.${bareName}`
}

export const normalizeImportedTableColumnReference = (
  value: string,
  options: PgmlImportIdentifierNormalizationOptions = {}
) => {
  const parts = splitIdentifierParts(value)
    .map(part => normalizeImportedIdentifier(part, options))
    .filter(part => part.length > 0)

  if (parts.length >= 3) {
    return `${parts[parts.length - 3]}.${parts[parts.length - 2]}.${parts[parts.length - 1]}`
  }

  if (parts.length === 2) {
    return `public.${parts[0]}.${parts[1]}`
  }

  return normalizeImportedIdentifier(value, options)
}

const splitTopLevelList = (value: string) => {
  const entries: string[] = []
  let current = ''
  let curlyDepth = 0
  let roundDepth = 0
  let squareDepth = 0
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

const getVisibleLineSuffix = (originalLine: string, visibleLine: string) => {
  return originalLine.slice(visibleLine.trimEnd().length)
}

const rebuildLine = (
  originalLine: string,
  visibleLine: string,
  content: string
) => {
  const leadingWhitespace = originalLine.match(/^[ \t]*/u)?.[0] || ''

  return `${leadingWhitespace}${content}${getVisibleLineSuffix(originalLine, visibleLine)}`
}

const registerCustomTypeName = (
  lookup: Map<string, string>,
  typeName: string,
  options: PgmlImportIdentifierNormalizationOptions
) => {
  const canonicalName = normalizeImportedQualifiedName(typeName, options)
  const bareName = canonicalName.split('.').at(-1) || canonicalName

  lookup.set(normalizeLookupKey(canonicalName), canonicalName)
  lookup.set(normalizeLookupKey(bareName), canonicalName)
}

const collectImportedCustomTypeLookup = (
  source: string,
  options: PgmlImportIdentifierNormalizationOptions
) => {
  const lookup = new Map<string, string>()
  const visibleLines = normalizePgmlCompatSource(source).split('\n')
  let depth = 0
  let sourceDelimiter: string | null = null

  visibleLines.forEach((visibleLine) => {
    if (sourceDelimiter) {
      if (visibleLine.includes(sourceDelimiter)) {
        sourceDelimiter = null
      }

      return
    }

    const trimmedVisibleLine = visibleLine.trim()

    if (depth === 0) {
      const customTypeMatch = trimmedVisibleLine.match(/^(Enum|Domain|Composite)\s+(.+?)\s*\{$/u)

      if (customTypeMatch?.[2]) {
        registerCustomTypeName(lookup, customTypeMatch[2], options)
      }
    }

    const detectedDelimiter = findSourceDelimiter(visibleLine)

    if (detectedDelimiter && detectedDelimiter.length > 0) {
      sourceDelimiter = detectedDelimiter
    }

    depth += (trimmedVisibleLine.match(/\{/g) || []).length
    depth -= (trimmedVisibleLine.match(/\}/g) || []).length
    depth = Math.max(depth, 0)
  })

  return lookup
}

const normalizeImportedTypeExpression = (
  value: string,
  customTypeLookup: Map<string, string>,
  options: PgmlImportIdentifierNormalizationOptions
) => {
  const trimmedValue = value.trim()

  if (trimmedValue.length === 0) {
    return ''
  }

  const arraySuffixMatch = trimmedValue.match(/(?:\s*\[\])+$/u)
  const arraySuffix = arraySuffixMatch
    ? arraySuffixMatch[0].replaceAll(/\s+/g, '')
    : ''
  const coreValue = arraySuffixMatch
    ? trimmedValue.slice(0, trimmedValue.length - arraySuffixMatch[0].length).trim()
    : trimmedValue
  const directMatch = customTypeLookup.get(normalizeLookupKey(coreValue))

  if (directMatch) {
    return `${directMatch}${arraySuffix}`
  }

  return `${normalizePgmlTypeExpression(applyIdentifierCase(coreValue, options))}${arraySuffix}`
}

const buildReferenceEndpoint = (
  tableName: string,
  columnNames: string[],
  options: PgmlImportIdentifierNormalizationOptions
) => {
  const normalizedTableName = normalizeImportedQualifiedName(tableName, options)
  const normalizedColumns = columnNames.map((columnName) => {
    return normalizeImportedIdentifier(columnName, options)
  })

  if (normalizedColumns.length > 1) {
    return `${normalizedTableName}.(${normalizedColumns.join(', ')})`
  }

  return `${normalizedTableName}.${normalizedColumns[0] || ''}`
}

const normalizeReferenceLine = (
  trimmedVisibleLine: string,
  options: PgmlImportIdentifierNormalizationOptions
) => {
  const declaration = parsePgmlCompatibleReference(trimmedVisibleLine)

  if (!declaration) {
    return trimmedVisibleLine
  }

  const normalizedName = declaration.name
    ? ` ${normalizeImportedIdentifier(declaration.name, options)}`
    : ''

  return `Ref${normalizedName}: ${buildReferenceEndpoint(declaration.fromTable, declaration.fromColumns, options)} ${declaration.relation} ${buildReferenceEndpoint(declaration.toTable, declaration.toColumns, options)}`
}

const normalizeTableGroupLine = (
  trimmedVisibleLine: string,
  options: PgmlImportIdentifierNormalizationOptions
) => {
  if (
    trimmedVisibleLine.startsWith('Note:')
    || trimmedVisibleLine.length === 0
    || trimmedVisibleLine === '}'
  ) {
    return trimmedVisibleLine
  }

  if (trimmedVisibleLine.startsWith('tables:')) {
    const listMatch = trimmedVisibleLine.match(/^tables:\s*\[(.*)\]$/u)

    if (!listMatch) {
      return trimmedVisibleLine
    }

    const normalizedEntries = splitTopLevelList(listMatch[1] || '').map((entry) => {
      return normalizeImportedQualifiedName(entry, options)
    })

    return `tables: [${normalizedEntries.join(', ')}]`
  }

  return normalizeImportedQualifiedName(trimmedVisibleLine.replace(/,$/u, ''), options)
}

const normalizeIndexLine = (
  trimmedVisibleLine: string,
  options: PgmlImportIdentifierNormalizationOptions
) => {
  const indexMatch = trimmedVisibleLine.match(/^Index\s+([^\s(]+)\s*\(([^)]*)\)(?:\s+\[([^\]]+)\])?$/u)

  if (!indexMatch) {
    return trimmedVisibleLine
  }

  const indexName = normalizeImportedIdentifier(indexMatch[1] || '', options)
  const normalizedColumns = splitTopLevelList(indexMatch[2] || '').map((entry) => {
    return normalizeImportedIdentifier(entry, options)
  })

  if (!indexMatch[3]) {
    return `Index ${indexName} (${normalizedColumns.join(', ')})`
  }

  return `Index ${indexName} (${normalizedColumns.join(', ')}) [${indexMatch[3]}]`
}

const normalizeColumnModifier = (
  modifier: string,
  options: PgmlImportIdentifierNormalizationOptions
) => {
  const trimmedModifier = modifier.trim()
  const referenceMatch = trimmedModifier.match(/^ref:\s*([<>-])\s*(.+)$/iu)

  if (referenceMatch?.[2]) {
    return `ref: ${referenceMatch[1] || '>'} ${normalizeImportedTableColumnReference(referenceMatch[2], options)}`
  }

  return trimmedModifier
}

const normalizeTableColumnLine = (
  trimmedVisibleLine: string,
  customTypeLookup: Map<string, string>,
  options: PgmlImportIdentifierNormalizationOptions
) => {
  const columnMatch = trimmedVisibleLine.match(/^([^\s]+)\s+([^[\]]+?)(?:\s+\[([^\]]+)\])?$/u)

  if (!columnMatch) {
    return trimmedVisibleLine
  }

  const normalizedColumnName = normalizeImportedIdentifier(columnMatch[1] || '', options)
  const normalizedType = normalizeImportedTypeExpression(columnMatch[2] || '', customTypeLookup, options)

  if (!columnMatch[3]) {
    return `${normalizedColumnName} ${normalizedType}`
  }

  const normalizedModifiers = normalizePgmlColumnModifiers(
    splitTopLevelList(columnMatch[3] || '').map((modifier) => {
      return normalizeColumnModifier(modifier, options)
    })
  )

  return `${normalizedColumnName} ${normalizedType} [${normalizedModifiers.join(', ')}]`
}

const normalizeCompositeFieldLine = (
  trimmedVisibleLine: string,
  customTypeLookup: Map<string, string>,
  options: PgmlImportIdentifierNormalizationOptions
) => {
  const fieldMatch = trimmedVisibleLine.match(/^([^\s]+)\s+(.+)$/u)

  if (!fieldMatch) {
    return trimmedVisibleLine
  }

  return `${normalizeImportedIdentifier(fieldMatch[1] || '', options)} ${normalizeImportedTypeExpression(fieldMatch[2] || '', customTypeLookup, options)}`
}

const normalizeSequenceMetadataLine = (
  trimmedVisibleLine: string,
  customTypeLookup: Map<string, string>,
  options: PgmlImportIdentifierNormalizationOptions
) => {
  const metadataMatch = trimmedVisibleLine.match(/^([^:]+):\s*(.+)$/u)

  if (!metadataMatch) {
    return trimmedVisibleLine
  }

  const key = trimQuotedIdentifier(metadataMatch[1] || '').toLowerCase()
  const value = metadataMatch[2] || ''

  if (key === 'owned_by') {
    return `${metadataMatch[1]}: ${normalizeImportedTableColumnReference(value, options)}`
  }

  if (key === 'as') {
    return `${metadataMatch[1]}: ${normalizeImportedTypeExpression(value, customTypeLookup, options)}`
  }

  return trimmedVisibleLine
}

const normalizeTriggerMetadataLine = (
  trimmedVisibleLine: string,
  options: PgmlImportIdentifierNormalizationOptions
) => {
  const metadataMatch = trimmedVisibleLine.match(/^([^:]+):\s*(.+)$/u)

  if (!metadataMatch) {
    return trimmedVisibleLine
  }

  const key = trimQuotedIdentifier(metadataMatch[1] || '').toLowerCase()
  const value = metadataMatch[2] || ''

  if (key === 'function') {
    return `${metadataMatch[1]}: ${normalizeImportedIdentifier(value, options)}`
  }

  return trimmedVisibleLine
}

const normalizeDomainDetailLine = (
  trimmedVisibleLine: string,
  customTypeLookup: Map<string, string>,
  options: PgmlImportIdentifierNormalizationOptions
) => {
  const detailMatch = trimmedVisibleLine.match(/^base:\s*(.+)$/u)

  if (!detailMatch) {
    return trimmedVisibleLine
  }

  return `base: ${normalizeImportedTypeExpression(detailMatch[1] || '', customTypeLookup, options)}`
}

const normalizeRoutineSignature = (
  value: string,
  customTypeLookup: Map<string, string>,
  options: PgmlImportIdentifierNormalizationOptions
) => {
  const trimmedValue = value.trim()
  const replaceSuffix = trimmedValue.endsWith('[replace]') ? ' [replace]' : ''
  const signatureWithoutReplace = replaceSuffix.length > 0
    ? trimmedValue.slice(0, -replaceSuffix.length).trimEnd()
    : trimmedValue
  const openParenIndex = signatureWithoutReplace.indexOf('(')

  if (openParenIndex < 0) {
    return `${normalizeImportedQualifiedName(signatureWithoutReplace, options)}${replaceSuffix}`
  }

  let depth = 0
  let closeParenIndex = -1

  for (let index = openParenIndex; index < signatureWithoutReplace.length; index += 1) {
    const character = signatureWithoutReplace[index] || ''

    if (character === '(') {
      depth += 1
      continue
    }

    if (character === ')') {
      depth -= 1

      if (depth === 0) {
        closeParenIndex = index
        break
      }
    }
  }

  if (closeParenIndex < 0) {
    return `${normalizeImportedQualifiedName(signatureWithoutReplace, options)}${replaceSuffix}`
  }

  const name = signatureWithoutReplace.slice(0, openParenIndex)
  const parameters = signatureWithoutReplace.slice(openParenIndex + 1, closeParenIndex)
  const remainder = signatureWithoutReplace.slice(closeParenIndex + 1).trim()
  const normalizedParameters = applyIdentifierCase(parameters, options)

  if (!remainder.startsWith('returns ')) {
    return `${normalizeImportedQualifiedName(name, options)}(${normalizedParameters})${remainder.length > 0 ? ` ${applyIdentifierCase(remainder, options)}` : ''}${replaceSuffix}`
  }

  const returnType = remainder.replace(/^returns\s+/u, '')
  const normalizedReturnType = normalizeImportedTypeExpression(returnType, customTypeLookup, options)

  return `${normalizeImportedQualifiedName(name, options)}(${normalizedParameters}) returns ${normalizedReturnType}${replaceSuffix}`
}

const normalizeTopLevelHeader = (
  trimmedVisibleLine: string,
  customTypeLookup: Map<string, string>,
  options: PgmlImportIdentifierNormalizationOptions
) => {
  const tableMatch = trimmedVisibleLine.match(/^Table\s+([^\s]+)(?:\s+in\s+(.+))?\s*\{$/u)

  if (tableMatch?.[1]) {
    const normalizedTableName = normalizeImportedQualifiedName(tableMatch[1], options)

    if (tableMatch[2]) {
      return `Table ${normalizedTableName} in ${trimQuotedIdentifier(tableMatch[2])} {`
    }

    return `Table ${normalizedTableName} {`
  }

  const groupMatch = trimmedVisibleLine.match(/^TableGroup\s+(.+?)\s*\{$/u)

  if (groupMatch?.[1]) {
    return `TableGroup ${trimQuotedIdentifier(groupMatch[1])} {`
  }

  const sequenceMatch = trimmedVisibleLine.match(/^Sequence\s+(.+?)\s*\{$/u)

  if (sequenceMatch?.[1]) {
    return `Sequence ${normalizeImportedQualifiedName(sequenceMatch[1], options)} {`
  }

  const triggerMatch = trimmedVisibleLine.match(/^Trigger\s+([^\s]+)(?:\s+on\s+([^\s]+))?\s*\{$/u)

  if (triggerMatch?.[1]) {
    const normalizedTriggerName = normalizeImportedIdentifier(triggerMatch[1], options)
    const normalizedTableName = triggerMatch[2]
      ? ` on ${normalizeImportedQualifiedName(triggerMatch[2], options)}`
      : ''

    return `Trigger ${normalizedTriggerName}${normalizedTableName} {`
  }

  const customTypeMatch = trimmedVisibleLine.match(/^(Enum|Domain|Composite)\s+(.+?)\s*\{$/u)

  if (customTypeMatch?.[2]) {
    return `${customTypeMatch[1]} ${normalizeImportedQualifiedName(customTypeMatch[2], options)} {`
  }

  const routineMatch = trimmedVisibleLine.match(/^(Function|Procedure)\s+(.+?)\s*\{$/u)

  if (routineMatch?.[2]) {
    return `${routineMatch[1]} ${normalizeRoutineSignature(routineMatch[2], customTypeLookup, options)} {`
  }

  return trimmedVisibleLine
}

const detectBlockKind = (trimmedVisibleLine: string): PgmlImportBlockKind | null => {
  if (/^Table\s+/u.test(trimmedVisibleLine)) {
    return 'Table'
  }

  if (/^TableGroup\s+/u.test(trimmedVisibleLine)) {
    return 'TableGroup'
  }

  if (/^Sequence\s+/u.test(trimmedVisibleLine)) {
    return 'Sequence'
  }

  if (/^Function\s+/u.test(trimmedVisibleLine)) {
    return 'Function'
  }

  if (/^Procedure\s+/u.test(trimmedVisibleLine)) {
    return 'Procedure'
  }

  if (/^Trigger\s+/u.test(trimmedVisibleLine)) {
    return 'Trigger'
  }

  if (/^Enum\s+/u.test(trimmedVisibleLine)) {
    return 'Enum'
  }

  if (/^Domain\s+/u.test(trimmedVisibleLine)) {
    return 'Domain'
  }

  if (/^Composite\s+/u.test(trimmedVisibleLine)) {
    return 'Composite'
  }

  return null
}

export const canonicalizePgmlSource = (
  source: string,
  options: PgmlImportIdentifierNormalizationOptions = {}
) => {
  const normalizedSource = normalizeLineEndings(source)

  if (normalizedSource.trim().length === 0) {
    return ''
  }

  const originalLines = normalizedSource.split('\n')
  const visibleLines = normalizePgmlCompatSource(normalizedSource).split('\n')
  const customTypeLookup = collectImportedCustomTypeLookup(normalizedSource, options)
  const nextLines: string[] = []
  let currentBlockKind: PgmlImportBlockKind | null = null
  let depth = 0
  let sourceDelimiter: string | null = null

  originalLines.forEach((originalLine, index) => {
    const visibleLine = visibleLines[index] || ''
    const trimmedVisibleLine = visibleLine.trim()

    if (sourceDelimiter) {
      nextLines.push(originalLine)

      if (visibleLine.includes(sourceDelimiter)) {
        sourceDelimiter = null
      }

      return
    }

    let nextVisibleContent = trimmedVisibleLine

    if (depth === 0) {
      if (trimmedVisibleLine.startsWith('Ref')) {
        nextVisibleContent = normalizeReferenceLine(trimmedVisibleLine, options)
      } else if (trimmedVisibleLine.endsWith('{')) {
        nextVisibleContent = normalizeTopLevelHeader(trimmedVisibleLine, customTypeLookup, options)
      }
    } else if (depth === 1 && currentBlockKind === 'Table') {
      if (trimmedVisibleLine.startsWith('Index ')) {
        nextVisibleContent = normalizeIndexLine(trimmedVisibleLine, options)
      } else if (!trimmedVisibleLine.startsWith('Constraint ') && !trimmedVisibleLine.startsWith('Note:')) {
        nextVisibleContent = normalizeTableColumnLine(trimmedVisibleLine, customTypeLookup, options)
      }
    } else if (depth === 1 && currentBlockKind === 'TableGroup') {
      nextVisibleContent = normalizeTableGroupLine(trimmedVisibleLine, options)
    } else if (depth === 1 && currentBlockKind === 'Sequence') {
      nextVisibleContent = normalizeSequenceMetadataLine(trimmedVisibleLine, customTypeLookup, options)
    } else if (depth === 1 && currentBlockKind === 'Trigger') {
      nextVisibleContent = normalizeTriggerMetadataLine(trimmedVisibleLine, options)
    } else if (depth === 1 && currentBlockKind === 'Domain') {
      nextVisibleContent = normalizeDomainDetailLine(trimmedVisibleLine, customTypeLookup, options)
    } else if (depth === 1 && currentBlockKind === 'Composite') {
      nextVisibleContent = normalizeCompositeFieldLine(trimmedVisibleLine, customTypeLookup, options)
    }

    if (trimmedVisibleLine.length === 0) {
      nextLines.push(originalLine)
    } else {
      nextLines.push(rebuildLine(originalLine, visibleLine, nextVisibleContent))
    }

    const detectedDelimiter = findSourceDelimiter(visibleLine)

    if (detectedDelimiter && detectedDelimiter.length > 0) {
      sourceDelimiter = detectedDelimiter
    }

    if (depth === 0 && trimmedVisibleLine.endsWith('{')) {
      currentBlockKind = detectBlockKind(trimmedVisibleLine)
    }

    depth += (trimmedVisibleLine.match(/\{/g) || []).length
    depth -= (trimmedVisibleLine.match(/\}/g) || []).length
    depth = Math.max(depth, 0)

    if (depth === 0) {
      currentBlockKind = null
    }
  })

  return nextLines.join('\n').trim()
}

export const canonicalizeImportedPgmlSource = (
  source: string,
  options: PgmlImportIdentifierNormalizationOptions = {}
) => {
  return canonicalizePgmlSource(source, options)
}
