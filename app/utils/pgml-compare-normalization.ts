import {
  getNormalizedPgmlColumnDefaultModifierValue,
  normalizePgmlColumnModifiers
} from './pgml-column-modifiers'
import { normalizeImportedTableColumnReference } from './pgml-import-normalization'
import type {
  PgmlAffects,
  PgmlColumn,
  PgmlCustomType,
  PgmlDocumentation,
  PgmlMetadataEntry,
  PgmlRoutine,
  PgmlSchemaModel,
  PgmlSequence,
  PgmlTrigger
} from './pgml'
import {
  buildPgmlRoutineSemanticModel,
  buildPgmlSequenceSemanticModel,
  buildPgmlTriggerSemanticModel
} from './pgml-executable-parser'
import {
  extractPgmlSequenceSourceDefinition,
  normalizePgmlSequenceMetadataEntries,
  type PgmlSequenceMetadataEntry
} from './pgml-sequence-metadata'
import {
  normalizeExecutableSqlText,
  normalizeSqlIdentifier,
  normalizeWhitespace
} from './pgml-executable-sql'
import { normalizePgmlTypeExpression } from './pgml-types'

const serialBaseTypeByValue: Readonly<Record<string, string>> = Object.freeze({
  bigserial: 'bigint',
  serial: 'integer',
  serial2: 'smallint',
  serial4: 'integer',
  serial8: 'bigint',
  smallserial: 'smallint'
})

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
          raw: identifier
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
    raw: match[0]
  }
}

const readBalancedSqlSection = (
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

const splitArraySuffix = (value: string) => {
  let baseType = value.trim()
  let arrayDepth = 0

  while (/\s*\[\s*\]$/u.test(baseType)) {
    baseType = baseType.replace(/\s*\[\s*\]$/u, '').trim()
    arrayDepth += 1
  }

  return {
    arrayDepth,
    baseType
  }
}

const appendArraySuffix = (value: string, arrayDepth: number) => {
  return `${value}${'[]'.repeat(arrayDepth)}`
}

const splitQualifiedName = (value: string) => {
  const parts = value
    .split('.')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0)

  if (parts.length <= 1) {
    return {
      name: parts[0] || value.trim(),
      schema: null
    }
  }

  return {
    name: parts.at(-1) || value.trim(),
    schema: parts.slice(0, -1).join('.')
  }
}

const createCompareCustomTypeLookup = (models: PgmlSchemaModel[]) => {
  const publicTypeNames = new Set<string>()
  const nonPublicTypeNames = new Set<string>()

  models.forEach((model) => {
    model.customTypes.forEach((customType) => {
      const { name, schema } = splitQualifiedName(customType.name)

      if (schema === 'public') {
        publicTypeNames.add(name)
        return
      }

      if (schema) {
        nonPublicTypeNames.add(name)
      }
    })
  })

  return {
    nonPublicTypeNames,
    publicTypeNames
  }
}

export const createPgmlCompareTypeExpressionNormalizer = (
  models: PgmlSchemaModel[]
) => {
  const lookup = createCompareCustomTypeLookup(models)

  return (value: string) => {
    const normalizedValue = normalizePgmlTypeExpression(value)
    const { arrayDepth, baseType } = splitArraySuffix(normalizedValue)
    const { name, schema } = splitQualifiedName(baseType)

    if (
      schema === null
      && lookup.publicTypeNames.has(name)
      && !lookup.nonPublicTypeNames.has(name)
    ) {
      return appendArraySuffix(`public.${name}`, arrayDepth)
    }

    return appendArraySuffix(baseType, arrayDepth)
  }
}

export const normalizePgmlCompareCustomTypeName = (
  value: string,
  normalizeType: (value: string) => string
) => {
  return normalizeType(value)
}

const getSerialBaseType = (value: string) => {
  return serialBaseTypeByValue[value.trim().toLowerCase()] || null
}

export const buildPgmlImplicitSerialSequenceName = (
  tableId: string,
  columnName: string
) => {
  const { name, schema } = splitQualifiedName(tableId)
  const normalizedSchema = schema || 'public'

  return `${normalizedSchema}.${name}_${columnName}_seq`
}

export const normalizePgmlCompareColumnValue = (input: {
  column: PgmlColumn
  normalizeType: (value: string) => string
  tableId: string
}) => {
  const normalizedModifiers = normalizePgmlColumnModifiers(input.column.modifiers)
  const serialBaseType = getSerialBaseType(input.column.type)

  if (!serialBaseType) {
    return {
      modifiers: normalizedModifiers,
      name: input.column.name,
      note: input.column.note,
      reference: input.column.reference,
      type: input.normalizeType(input.column.type)
    }
  }

  const normalizedDefault = getNormalizedPgmlColumnDefaultModifierValue(input.column.modifiers)
    || `nextval('${buildPgmlImplicitSerialSequenceName(input.tableId, input.column.name)}')`
  const modifiersWithoutDefault = normalizedModifiers.filter(modifier => !modifier.startsWith('default:'))

  return {
    modifiers: normalizePgmlColumnModifiers([
      ...modifiersWithoutDefault,
      `default: ${normalizedDefault}`
    ]),
    name: input.column.name,
    note: input.column.note,
    reference: input.column.reference,
    type: serialBaseType
  }
}

const normalizeBigintSequenceDefault = (
  entries: PgmlSequenceMetadataEntry[]
) => {
  return entries.filter((entry) => {
    return !(entry.key === 'as' && entry.value === 'bigint')
  })
}

export const normalizePgmlCompareSequenceMetadataEntries = (
  entries: PgmlSequenceMetadataEntry[],
  normalizeType: (value: string) => string
) => {
  return normalizeBigintSequenceDefault(normalizePgmlSequenceMetadataEntries(entries, {
    normalizeOwnedBy: normalizeImportedTableColumnReference,
    normalizeType
  }))
}

export const normalizePgmlCompareMetadataEntries = (
  entries: PgmlMetadataEntry[]
) => {
  return [...entries].sort((left, right) => {
    if (left.key !== right.key) {
      return left.key.localeCompare(right.key)
    }

    return left.value.localeCompare(right.value)
  }).map((entry) => {
    return {
      key: entry.key,
      value: entry.value
    }
  })
}

const normalizeTriggerMetadataValue = (entry: PgmlMetadataEntry) => {
  const normalizedKey = entry.key.trim().toLowerCase().replaceAll(/[^\w]+/g, '_')

  if (normalizedKey !== 'events') {
    return entry.value
  }

  const trimmedValue = entry.value.trim()
  const listMatch = trimmedValue.match(/^\[(.*)\]$/u)

  if (!listMatch?.[1]) {
    return entry.value
  }

  const normalizedEvents = listMatch[1]
    .split(',')
    .map(eventName => normalizeWhitespace(eventName))
    .filter(eventName => eventName.length > 0)
    .sort((left, right) => left.localeCompare(right))

  return `[${normalizedEvents.join(', ')}]`
}

const normalizePgmlCompareTriggerMetadataEntries = (
  entries: PgmlMetadataEntry[]
) => {
  return normalizePgmlCompareMetadataEntries(entries.map((entry) => {
    return {
      ...entry,
      value: normalizeTriggerMetadataValue(entry)
    }
  }))
}

export const normalizePgmlCompareDocumentationValue = (
  documentation: PgmlDocumentation | null
) => {
  if (!documentation) {
    return null
  }

  return {
    entries: normalizePgmlCompareMetadataEntries(documentation.entries),
    summary: documentation.summary
  }
}

export const normalizePgmlCompareAffectsValue = (
  affects: PgmlAffects | null
) => {
  if (!affects) {
    return null
  }

  const sortValues = (values: string[]) => {
    return [...values].sort((left, right) => left.localeCompare(right))
  }

  return {
    calls: sortValues(affects.calls),
    dependsOn: sortValues(affects.dependsOn),
    extras: [...affects.extras].map((entry) => {
      return {
        key: entry.key,
        values: sortValues(entry.values)
      }
    }).sort((left, right) => left.key.localeCompare(right.key)),
    ownedBy: sortValues(affects.ownedBy),
    reads: sortValues(affects.reads),
    sets: sortValues(affects.sets),
    uses: sortValues(affects.uses),
    writes: sortValues(affects.writes)
  }
}

const routineCompareClauseKeywords = [
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
] as const

const isWordCharacter = (value: string) => {
  return /[a-z0-9_]/i.test(value)
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

const findTopLevelKeywordIndex = (value: string, keywords: readonly string[]) => {
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

    const matchedKeyword = keywords.find((keyword) => {
      return lowercase.startsWith(keyword, index) && isKeywordBoundary(lowercase, index, keyword)
    })

    if (matchedKeyword) {
      return index
    }
  }

  return -1
}

const extractDollarQuotedBody = (value: string) => {
  const openDelimiterIndex = value.indexOf('$body$')

  if (openDelimiterIndex < 0) {
    return null
  }

  const closeDelimiterIndex = value.indexOf('$body$', openDelimiterIndex + '$body$'.length)

  if (closeDelimiterIndex < 0) {
    return null
  }

  return {
    body: value.slice(openDelimiterIndex + '$body$'.length, closeDelimiterIndex),
    prefix: value.slice(0, openDelimiterIndex),
    suffix: value.slice(closeDelimiterIndex + '$body$'.length)
  }
}

const normalizeRoutineSourceForCompare = (source: string | null) => {
  const normalizedSource = normalizeExecutableSqlText(source)

  if (!normalizedSource) {
    return null
  }

  const keywordMatch = normalizedSource.match(/^create\s+(?:or\s+replace\s+)?(function|procedure)\s+/u)

  if (!keywordMatch) {
    return normalizedSource
  }

  const afterKeyword = normalizedSource.slice(keywordMatch[0].length)
  const identifier = readSqlIdentifier(afterKeyword)

  if (!identifier?.raw) {
    return normalizedSource
  }

  let remainder = afterKeyword.slice(identifier.nextIndex).trim()

  if (!remainder.startsWith('(')) {
    return normalizedSource
  }

  const argumentsSection = readBalancedSqlSection(remainder, 0)

  if (!argumentsSection) {
    return normalizedSource
  }

  remainder = remainder.slice(argumentsSection.endIndex + 1).trim()

  if (keywordMatch[1] === 'function' && remainder.startsWith('returns ')) {
    const afterReturns = remainder.slice('returns '.length)
    const nextKeywordIndex = findTopLevelKeywordIndex(afterReturns, routineCompareClauseKeywords)

    remainder = nextKeywordIndex < 0
      ? ''
      : afterReturns.slice(nextKeywordIndex).trim()
  }

  const extractedBody = extractDollarQuotedBody(remainder)
  const body = extractedBody?.body || null
  let clauseRemainder = normalizeWhitespace(`${extractedBody?.prefix || remainder} ${extractedBody?.suffix || ''}`)

  clauseRemainder = clauseRemainder
    .replaceAll(/\blanguage\s+[^\s;]+/gu, '')
    .replaceAll(/\b(?:immutable|stable|volatile)\b/gu, '')
    .replaceAll(/\bsecurity\s+(?:definer|invoker)\b/gu, '')
    .replaceAll(/\bas\b/gu, '')
  clauseRemainder = normalizeWhitespace(clauseRemainder)

  return {
    body,
    clauses: clauseRemainder.length > 0 ? clauseRemainder : null
  }
}

const normalizeTriggerEvents = (value: string) => {
  return value
    .split(/\s+or\s+/u)
    .map(eventName => normalizeWhitespace(eventName))
    .filter(eventName => eventName.length > 0)
    .sort((left, right) => left.localeCompare(right))
}

const normalizeTriggerArguments = (value: string) => {
  const normalizedValue = normalizeWhitespace(value)

  if (normalizedValue.length === 0) {
    return []
  }

  return splitSqlValueList(normalizedValue)
    .map(entry => normalizeExecutableSqlText(entry) || '')
    .filter(entry => entry.length > 0)
}

const normalizeTriggerSourceForCompare = (source: string | null) => {
  const normalizedSource = normalizeExecutableSqlText(source)

  if (!normalizedSource) {
    return null
  }

  const normalizedExecuteSource = normalizedSource.replace(/\bexecute\s+procedure\b/gu, 'execute function')
  const triggerMatch = normalizedExecuteSource.match(
    /^create\s+(constraint\s+)?trigger\s+([^\s]+)\s+(before|after|instead\s+of)\s+(.+?)\s+on\s+([^\s]+)\s+(.+)$/u
  )

  if (!triggerMatch) {
    return normalizedExecuteSource
  }

  const trailingSource = triggerMatch[6] || ''
  const executeMatch = trailingSource.match(
    /^(.*?)(?:\s+for\s+each\s+(row|statement))?(?:\s+when\s*\((.+)\))?\s+execute\s+function\s+([^(;\s]+)\s*(?:\((.*?)\))?\s*;?$/u
  )

  if (!executeMatch) {
    return normalizedExecuteSource
  }

  const prefix = normalizeWhitespace(executeMatch[1] || '')
  const fromMatch = prefix.match(/\bfrom\s+([^\s]+)\b/u)
  const initiallyMatch = prefix.match(/\binitially\s+(deferred|immediate)\b/u)
  const deferrable = /\bnot\s+deferrable\b/u.test(prefix)
    ? 'not deferrable'
    : /\bdeferrable\b/u.test(prefix)
      ? 'deferrable'
      : null

  return {
    arguments: normalizeTriggerArguments(executeMatch[5] || ''),
    constraint: Boolean(triggerMatch[1]),
    deferrable,
    events: normalizeTriggerEvents(triggerMatch[4] || ''),
    fromTable: fromMatch?.[1] ? normalizeSqlIdentifier(fromMatch[1]) : null,
    initially: initiallyMatch?.[1] || null,
    level: executeMatch[2] || null,
    routineName: normalizeSqlIdentifier(executeMatch[4] || ''),
    tableName: normalizeSqlIdentifier(triggerMatch[5] || ''),
    timing: normalizeWhitespace(triggerMatch[3] || ''),
    when: executeMatch[3] ? normalizeExecutableSqlText(executeMatch[3]) : null
  }
}

export const normalizePgmlCompareRoutineValue = (routine: PgmlRoutine) => {
  const semantic = routine.semantic || buildPgmlRoutineSemanticModel(routine.source)

  return {
    affects: normalizePgmlCompareAffectsValue(routine.affects),
    docs: normalizePgmlCompareDocumentationValue(routine.docs),
    metadata: normalizePgmlCompareMetadataEntries(routine.metadata),
    name: routine.name,
    signature: routine.signature,
    source: semantic?.status === 'parsed'
      ? semantic.fingerprint
      : normalizeRoutineSourceForCompare(routine.source)
  }
}

export const normalizePgmlCompareTriggerValue = (trigger: PgmlTrigger) => {
  const semantic = trigger.semantic || buildPgmlTriggerSemanticModel(trigger.source)

  return {
    affects: normalizePgmlCompareAffectsValue(trigger.affects),
    docs: normalizePgmlCompareDocumentationValue(trigger.docs),
    metadata: normalizePgmlCompareTriggerMetadataEntries(trigger.metadata),
    name: trigger.name,
    source: semantic?.status === 'parsed'
      ? semantic.fingerprint
      : normalizeTriggerSourceForCompare(trigger.source),
    tableName: trigger.tableName
  }
}

export const normalizePgmlCompareSequenceValue = (
  sequence: PgmlSequence,
  normalizeType: (value: string) => string
) => {
  const metadata = normalizePgmlCompareSequenceMetadataEntries(sequence.metadata, normalizeType)
  const extractedSourceDefinition = extractPgmlSequenceSourceDefinition(sequence.source, {
    normalizeOwnedBy: normalizeImportedTableColumnReference,
    normalizeType
  })
  const normalizedSourceMetadata = normalizeBigintSequenceDefault(extractedSourceDefinition.metadata)
  const semantic = sequence.semantic || buildPgmlSequenceSemanticModel(sequence.source)
  const shouldOmitSource = extractedSourceDefinition.isFullyStructured
    && toStableJson(normalizedSourceMetadata) === toStableJson(metadata)

  return {
    affects: normalizePgmlCompareAffectsValue(sequence.affects),
    docs: normalizePgmlCompareDocumentationValue(sequence.docs),
    metadata,
    name: sequence.name,
    source: shouldOmitSource
      ? null
      : semantic?.status === 'parsed'
        ? semantic.fingerprint
        : normalizeExecutableSqlText(sequence.source)
  }
}

export const normalizePgmlCompareCustomTypeValue = (
  customType: PgmlCustomType,
  normalizeType: (value: string) => string
) => {
  if (customType.kind === 'Domain') {
    return {
      ...customType,
      baseType: customType.baseType ? normalizeType(customType.baseType) : null,
      name: normalizePgmlCompareCustomTypeName(customType.name, normalizeType)
    }
  }

  if (customType.kind === 'Composite') {
    return {
      ...customType,
      fields: customType.fields.map((field) => {
        return {
          ...field,
          type: normalizeType(field.type)
        }
      }),
      name: normalizePgmlCompareCustomTypeName(customType.name, normalizeType)
    }
  }

  return {
    ...customType,
    name: normalizePgmlCompareCustomTypeName(customType.name, normalizeType)
  }
}

const stripSqlLiteralCasts = (value: string) => {
  return value.replaceAll(
    /('(?:[^']|'')*')::(?:(?:[A-Za-z_][A-Za-z0-9_]*)|(?:"[^"]+"))(?:\.(?:(?:[A-Za-z_][A-Za-z0-9_]*)|(?:"[^"]+")))*(?:\s*\[\s*\])*/g,
    '$1'
  )
}

const trimBalancedOuterParentheses = (value: string) => {
  let nextValue = value.trim()

  while (nextValue.startsWith('(') && nextValue.endsWith(')')) {
    let depth = 0
    let balanced = true
    let inString = false

    for (let index = 0; index < nextValue.length; index += 1) {
      const character = nextValue[index] || ''
      const nextCharacter = nextValue[index + 1] || ''

      if (inString) {
        if (character === '\'' && nextCharacter === '\'') {
          index += 1
          continue
        }

        if (character === '\'') {
          inString = false
        }

        continue
      }

      if (character === '\'') {
        inString = true
        continue
      }

      if (character === '(') {
        depth += 1
      } else if (character === ')') {
        depth -= 1

        if (depth === 0 && index < nextValue.length - 1) {
          balanced = false
          break
        }
      }
    }

    if (!balanced || depth !== 0) {
      break
    }

    nextValue = nextValue.slice(1, -1).trim()
  }

  return nextValue
}

const splitSqlValueList = (value: string) => {
  const entries: string[] = []
  let current = ''
  let depth = 0
  let inString = false

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] || ''
    const nextCharacter = value[index + 1] || ''

    if (inString) {
      current += character

      if (character === '\'' && nextCharacter === '\'') {
        current += nextCharacter
        index += 1
        continue
      }

      if (character === '\'') {
        inString = false
      }

      continue
    }

    if (character === '\'') {
      inString = true
      current += character
      continue
    }

    if (character === '(' || character === '[') {
      depth += 1
      current += character
      continue
    }

    if (character === ')' || character === ']') {
      depth = Math.max(0, depth - 1)
      current += character
      continue
    }

    if (character === ',' && depth === 0) {
      const nextEntry = current.trim()

      if (nextEntry.length > 0) {
        entries.push(nextEntry)
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

const normalizeMembershipListEntry = (value: string) => {
  return normalizeWhitespace(stripSqlLiteralCasts(value))
}

const normalizeMembershipExpression = (
  value: string,
  options: {
    pattern: RegExp
    operator: 'IN' | 'NOT IN'
  }
) => {
  const trimmedValue = trimBalancedOuterParentheses(normalizeWhitespace(stripSqlLiteralCasts(value)))
  const matched = trimmedValue.match(options.pattern)

  if (!matched?.[1] || !matched[2]) {
    return null
  }

  const normalizedLeftSide = normalizeWhitespace(trimBalancedOuterParentheses(matched[1]))
  const normalizedEntries = splitSqlValueList(matched[2])
    .map(normalizeMembershipListEntry)
    .filter(entry => entry.length > 0)
    .sort((left, right) => left.localeCompare(right))

  if (normalizedLeftSide.length === 0 || normalizedEntries.length === 0) {
    return null
  }

  return `${normalizedLeftSide} ${options.operator} (${normalizedEntries.join(', ')})`
}

export const normalizePgmlCompareConstraintExpression = (value: string) => {
  const normalizedValue = normalizeWhitespace(stripSqlLiteralCasts(value))
  const normalizedNotInExpression = normalizeMembershipExpression(normalizedValue, {
    operator: 'NOT IN',
    pattern: /^(.*?)\s+not\s+in\s*\((.+)\)$/iu
  })

  if (normalizedNotInExpression) {
    return normalizedNotInExpression
  }

  const normalizedAllExpression = normalizeMembershipExpression(normalizedValue, {
    operator: 'NOT IN',
    pattern: /^(.*?)\s*<>\s*all\s*\(\s*array\s*\[(.+)\]\s*\)$/iu
  })

  if (normalizedAllExpression) {
    return normalizedAllExpression
  }

  const normalizedInExpression = normalizeMembershipExpression(normalizedValue, {
    operator: 'IN',
    pattern: /^(.*?)\s+in\s*\((.+)\)$/iu
  })

  if (normalizedInExpression) {
    return normalizedInExpression
  }

  const normalizedAnyExpression = normalizeMembershipExpression(normalizedValue, {
    operator: 'IN',
    pattern: /^(.*?)\s*=\s*any\s*\(\s*array\s*\[(.+)\]\s*\)$/iu
  })

  return normalizedAnyExpression || normalizedValue
}

export const toStableJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(entry => toStableJson(entry)).join(',')}]`
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `"${key}":${toStableJson(entry)}`)

    return `{${entries.join(',')}}`
  }

  return JSON.stringify(value)
}
