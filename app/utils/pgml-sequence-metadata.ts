import { normalizePgmlTypeExpression } from './pgml-types'

export type PgmlSequenceMetadataEntry = {
  key: string
  value: string
}

export type PgmlSequenceMetadataNormalizationOptions = {
  normalizeName?: (value: string) => string
  normalizeOwnedBy?: (value: string) => string
  normalizeType?: (value: string) => string
  preserveDefaults?: boolean
}

export type PgmlSequenceSourceDefinition = {
  isFullyStructured: boolean
  metadata: PgmlSequenceMetadataEntry[]
  name: string | null
}

const sequenceMetadataOrder = [
  'as',
  'start',
  'increment',
  'min',
  'max',
  'cache',
  'cycle',
  'owned_by'
] as const

const sequenceClauseKeywordValues = new Set([
  'AS',
  'BY',
  'CACHE',
  'CYCLE',
  'INCREMENT',
  'MAXVALUE',
  'MINVALUE',
  'NO',
  'OWNED',
  'START'
])

const trimQuotedScalar = (value: string) => {
  return value.trim().replace(/^"(.*)"$/u, '$1').replace(/^'(.*)'$/u, '$1')
}

const normalizeSequenceMetadataKey = (value: string) => {
  const normalized = value.trim().toLowerCase()

  if (normalized === 'maxvalue') {
    return 'max'
  }

  if (normalized === 'minvalue') {
    return 'min'
  }

  if (normalized === 'ownedby') {
    return 'owned_by'
  }

  return normalized
}

const normalizeSequenceCycleValue = (value: string) => {
  const normalizedValue = trimQuotedScalar(value).toLowerCase()

  if (normalizedValue === 'cycle' || normalizedValue === 'true') {
    return 'true'
  }

  if (normalizedValue === 'no cycle' || normalizedValue === 'false') {
    return 'false'
  }

  return normalizedValue
}

const normalizeSequenceMinMaxValue = (value: string) => {
  const normalizedValue = trimQuotedScalar(value)
  const normalizedUpperValue = normalizedValue.toUpperCase()

  if (
    normalizedUpperValue.length === 0
    || normalizedUpperValue === 'NO'
    || normalizedUpperValue === 'NO MINVALUE'
    || normalizedUpperValue === 'NO MAXVALUE'
    || sequenceClauseKeywordValues.has(normalizedUpperValue)
  ) {
    return null
  }

  return normalizedValue
}

const isSequenceDefaultOne = (value: string | undefined) => {
  return value?.trim() === '1'
}

const sortSequenceMetadataEntries = (entries: PgmlSequenceMetadataEntry[]) => {
  return [...entries].sort((left, right) => {
    const leftIndex = sequenceMetadataOrder.indexOf(left.key as typeof sequenceMetadataOrder[number])
    const rightIndex = sequenceMetadataOrder.indexOf(right.key as typeof sequenceMetadataOrder[number])

    if (leftIndex >= 0 || rightIndex >= 0) {
      if (leftIndex < 0) {
        return 1
      }

      if (rightIndex < 0) {
        return -1
      }

      if (leftIndex !== rightIndex) {
        return leftIndex - rightIndex
      }
    }

    if (left.key !== right.key) {
      return left.key.localeCompare(right.key)
    }

    return left.value.localeCompare(right.value)
  })
}

export const normalizePgmlSequenceMetadataEntries = (
  entries: PgmlSequenceMetadataEntry[],
  options: PgmlSequenceMetadataNormalizationOptions = {}
) => {
  const normalizeType = options.normalizeType || normalizePgmlTypeExpression
  const metadataByKey = new Map<string, string>()
  const extraEntries: PgmlSequenceMetadataEntry[] = []

  entries.forEach((entry) => {
    const normalizedKey = normalizeSequenceMetadataKey(entry.key)
    const trimmedValue = trimQuotedScalar(entry.value).replaceAll('\\"', '"')

    if (trimmedValue.length === 0) {
      return
    }

    if (normalizedKey === 'as') {
      metadataByKey.set(normalizedKey, normalizeType(trimmedValue))
      return
    }

    if (normalizedKey === 'owned_by') {
      metadataByKey.set(
        normalizedKey,
        options.normalizeOwnedBy ? options.normalizeOwnedBy(trimmedValue) : trimmedValue
      )
      return
    }

    if (normalizedKey === 'cycle') {
      metadataByKey.set(normalizedKey, normalizeSequenceCycleValue(trimmedValue))
      return
    }

    if (normalizedKey === 'min' || normalizedKey === 'max') {
      const normalizedValue = normalizeSequenceMinMaxValue(trimmedValue)

      if (normalizedValue) {
        metadataByKey.set(normalizedKey, normalizedValue)
      }

      return
    }

    if (sequenceMetadataOrder.includes(normalizedKey as typeof sequenceMetadataOrder[number])) {
      metadataByKey.set(normalizedKey, trimmedValue)
      return
    }

    extraEntries.push({
      key: entry.key.trim(),
      value: trimmedValue
    })
  })

  if (!options.preserveDefaults) {
    if (metadataByKey.get('cycle') === 'false') {
      metadataByKey.delete('cycle')
    }

    if (isSequenceDefaultOne(metadataByKey.get('increment'))) {
      metadataByKey.delete('increment')
    }

    if (isSequenceDefaultOne(metadataByKey.get('cache'))) {
      metadataByKey.delete('cache')
    }

    if (isSequenceDefaultOne(metadataByKey.get('start')) && !metadataByKey.has('min')) {
      metadataByKey.delete('start')
    }
  }

  return sortSequenceMetadataEntries([
    ...Array.from(metadataByKey.entries()).map(([key, value]) => {
      return { key, value }
    }),
    ...extraEntries
  ])
}

const collapseSequenceSqlWhitespace = (value: string) => {
  return value.replaceAll(/\s+/g, ' ').trim()
}

const splitSequenceSqlStatements = (value: string) => {
  return value
    .split(';')
    .map(statement => collapseSequenceSqlWhitespace(statement))
    .filter(statement => statement.length > 0)
}

const parseCreateSequenceStatement = (
  statement: string,
  options: PgmlSequenceMetadataNormalizationOptions
) => {
  const match = statement.match(/^create\s+sequence\s+([^\s;]+)(?:\s+(.*))?$/iu)

  if (!match?.[1]) {
    return null
  }

  let remainder = match[2]?.trim() || ''
  const metadata: PgmlSequenceMetadataEntry[] = []
  const consume = (
    pattern: RegExp,
    onMatch?: (...args: string[]) => void
  ) => {
    const matched = remainder.match(pattern)

    if (!matched) {
      return
    }

    if (onMatch) {
      onMatch(...matched.slice(1))
    }

    remainder = remainder.replace(pattern, ' ').replaceAll(/\s+/g, ' ').trim()
  }

  consume(/\bno\s+minvalue\b/iu)
  consume(/\bno\s+maxvalue\b/iu)
  consume(/\bno\s+cycle\b/iu, () => {
    metadata.push({ key: 'cycle', value: 'false' })
  })
  consume(/\bas\s+([^\s;]+)/iu, (value) => {
    metadata.push({ key: 'as', value })
  })
  consume(/\bstart(?:\s+with)?\s+([^\s;]+)/iu, (value) => {
    metadata.push({ key: 'start', value })
  })
  consume(/\bincrement(?:\s+by)?\s+([^\s;]+)/iu, (value) => {
    metadata.push({ key: 'increment', value })
  })
  consume(/\bminvalue\s+([^\s;]+)/iu, (value) => {
    metadata.push({ key: 'min', value })
  })
  consume(/\bmaxvalue\s+([^\s;]+)/iu, (value) => {
    metadata.push({ key: 'max', value })
  })
  consume(/\bcache\s+([^\s;]+)/iu, (value) => {
    metadata.push({ key: 'cache', value })
  })
  consume(/\bcycle\b/iu, () => {
    metadata.push({ key: 'cycle', value: 'true' })
  })
  consume(/\bowned\s+by\s+([^\s;]+)/iu, (value) => {
    metadata.push({ key: 'owned_by', value })
  })

  return {
    isFullyStructured: remainder.length === 0,
    metadata,
    name: options.normalizeName ? options.normalizeName(match[1]) : trimQuotedScalar(match[1])
  }
}

const parseAlterSequenceOwnedByStatement = (
  statement: string,
  options: PgmlSequenceMetadataNormalizationOptions
) => {
  const match = statement.match(/^alter\s+sequence\s+([^\s;]+)\s+owned\s+by\s+(.+)$/iu)

  if (!match?.[1] || !match[2]) {
    return null
  }

  return {
    isFullyStructured: true,
    metadata: [{
      key: 'owned_by',
      value: trimQuotedScalar(match[2])
    }],
    name: options.normalizeName ? options.normalizeName(match[1]) : trimQuotedScalar(match[1])
  }
}

export const extractPgmlSequenceSourceDefinition = (
  source: string | null,
  options: PgmlSequenceMetadataNormalizationOptions = {}
): PgmlSequenceSourceDefinition => {
  if (!source || source.trim().length === 0) {
    return {
      isFullyStructured: false,
      metadata: [],
      name: null
    }
  }

  const statements = splitSequenceSqlStatements(source)
  const metadata: PgmlSequenceMetadataEntry[] = []
  let isFullyStructured = statements.length > 0
  let sequenceName: string | null = null

  statements.forEach((statement) => {
    const parsedCreateStatement = parseCreateSequenceStatement(statement, options)

    if (parsedCreateStatement) {
      sequenceName = sequenceName || parsedCreateStatement.name
      isFullyStructured = isFullyStructured && parsedCreateStatement.isFullyStructured

      if (sequenceName !== parsedCreateStatement.name) {
        isFullyStructured = false
      }

      metadata.push(...parsedCreateStatement.metadata)
      return
    }

    const parsedAlterStatement = parseAlterSequenceOwnedByStatement(statement, options)

    if (parsedAlterStatement) {
      sequenceName = sequenceName || parsedAlterStatement.name
      isFullyStructured = isFullyStructured && parsedAlterStatement.isFullyStructured

      if (sequenceName !== parsedAlterStatement.name) {
        isFullyStructured = false
      }

      metadata.push(...parsedAlterStatement.metadata)
      return
    }

    isFullyStructured = false
  })

  return {
    isFullyStructured,
    metadata: normalizePgmlSequenceMetadataEntries(metadata, options),
    name: sequenceName
  }
}
