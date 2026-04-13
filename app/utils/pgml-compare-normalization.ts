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
  extractPgmlSequenceSourceDefinition,
  normalizePgmlSequenceMetadataEntries,
  type PgmlSequenceMetadataEntry
} from './pgml-sequence-metadata'
import { normalizePgmlTypeExpression } from './pgml-types'

const serialBaseTypeByValue: Readonly<Record<string, string>> = Object.freeze({
  bigserial: 'bigint',
  serial: 'integer',
  serial2: 'smallint',
  serial4: 'integer',
  serial8: 'bigint',
  smallserial: 'smallint'
})

const normalizeWhitespace = (value: string) => {
  return value.replaceAll(/\s+/g, ' ').trim()
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

export const normalizePgmlCompareRoutineValue = (routine: PgmlRoutine) => {
  return {
    affects: normalizePgmlCompareAffectsValue(routine.affects),
    docs: normalizePgmlCompareDocumentationValue(routine.docs),
    metadata: normalizePgmlCompareMetadataEntries(routine.metadata),
    name: routine.name,
    signature: routine.signature,
    source: routine.source?.trim() || null
  }
}

export const normalizePgmlCompareTriggerValue = (trigger: PgmlTrigger) => {
  return {
    affects: normalizePgmlCompareAffectsValue(trigger.affects),
    docs: normalizePgmlCompareDocumentationValue(trigger.docs),
    metadata: normalizePgmlCompareMetadataEntries(trigger.metadata),
    name: trigger.name,
    source: trigger.source?.trim() || null,
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
  const shouldOmitSource = extractedSourceDefinition.isFullyStructured
    && toStableJson(normalizedSourceMetadata) === toStableJson(metadata)

  return {
    affects: normalizePgmlCompareAffectsValue(sequence.affects),
    docs: normalizePgmlCompareDocumentationValue(sequence.docs),
    metadata,
    name: sequence.name,
    source: shouldOmitSource ? null : (sequence.source?.trim() || null)
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
