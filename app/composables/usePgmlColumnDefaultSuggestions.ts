export type PgmlColumnDefaultSuggestion = {
  description: string
  label: string
  value: string
}

type NormalizedColumnType = {
  baseType: string
  castType: string
  isArray: boolean
}

const timestampTypeLabels: Record<string, string> = {
  date: 'date',
  time: 'time',
  timetz: 'time with time zone',
  timestamp: 'timestamp',
  timestamptz: 'timestamp with time zone'
}
const timestampCurrentValues: Record<string, string> = {
  date: 'CURRENT_DATE',
  time: 'CURRENT_TIME',
  timetz: 'CURRENT_TIME',
  timestamp: 'CURRENT_TIMESTAMP',
  timestamptz: 'CURRENT_TIMESTAMP'
}

const numericTypes = new Set([
  'bigint',
  'bigserial',
  'decimal',
  'double precision',
  'float4',
  'float8',
  'int',
  'int2',
  'int4',
  'int8',
  'integer',
  'numeric',
  'real',
  'serial',
  'serial2',
  'serial4',
  'serial8',
  'smallint',
  'smallserial'
])

const stringTypes = new Set([
  'bpchar',
  'char',
  'character',
  'character varying',
  'citext',
  'text',
  'varchar'
])

const normalizeColumnType = (columnType: string): NormalizedColumnType => {
  const trimmedType = columnType.trim().replace(/\s+/g, ' ')
  const isArray = trimmedType.endsWith('[]')
  const withoutArray = isArray ? trimmedType.slice(0, -2).trim() : trimmedType
  const withoutCatalog = withoutArray.replace(/^pg_catalog\./i, '')
  const withoutPrecision = withoutCatalog.replace(/\([^)]*\)/g, '').trim().toLowerCase()

  const normalizedBaseType = withoutPrecision
    .replace(/^character varying$/, 'varchar')
    .replace(/^character$/, 'char')
    .replace(/^timestamp without time zone$/, 'timestamp')
    .replace(/^timestamp with time zone$/, 'timestamptz')
    .replace(/^time without time zone$/, 'time')
    .replace(/^time with time zone$/, 'timetz')
    .replace(/^bool$/, 'boolean')
    .replace(/^decimal$/, 'numeric')

  return {
    baseType: normalizedBaseType,
    castType: trimmedType.length > 0 ? trimmedType : 'text',
    isArray
  }
}

const uniqueSuggestions = (suggestions: PgmlColumnDefaultSuggestion[]) => {
  const seenValues = new Set<string>()

  return suggestions.filter((suggestion) => {
    if (seenValues.has(suggestion.value)) {
      return false
    }

    seenValues.add(suggestion.value)

    return true
  })
}

const createSuggestion = (value: string, description: string, label?: string): PgmlColumnDefaultSuggestion => {
  return {
    description,
    label: label || value,
    value
  }
}

const buildArraySuggestions = (castType: string) => {
  return [
    createSuggestion(`'{}'::${castType}`, 'Start the column with an empty array.'),
    createSuggestion(`ARRAY[]::${castType}`, 'Use the explicit Postgres array constructor.')
  ]
}

const getSuggestionsForBaseType = (baseType: string) => {
  if (baseType === 'boolean') {
    return [
      createSuggestion('false', 'Default the column to false.'),
      createSuggestion('true', 'Default the column to true.')
    ]
  }

  if (baseType === 'uuid') {
    return [
      createSuggestion('gen_random_uuid()', 'Preferred for pgcrypto-backed UUID defaults.'),
      createSuggestion('uuid_generate_v4()', 'Use when the uuid-ossp extension is enabled.')
    ]
  }

  if (baseType in timestampTypeLabels) {
    const typeLabel = timestampTypeLabels[baseType] || baseType
    const suggestions = [
      createSuggestion(timestampCurrentValues[baseType] || 'CURRENT_TIMESTAMP', `Use the current ${typeLabel} keyword.`)
    ]

    if (baseType === 'timestamp' || baseType === 'timestamptz') {
      suggestions.unshift(
        createSuggestion('now()', 'Common Postgres function for created-at style columns.'),
        createSuggestion('CURRENT_TIMESTAMP', 'ANSI current timestamp expression.')
      )
    }

    if (baseType === 'date') {
      suggestions.push(createSuggestion('now()::date', 'Cast the current timestamp down to a date.'))
    }

    if (baseType === 'time' || baseType === 'timetz') {
      suggestions.push(createSuggestion('now()::time', 'Cast the current timestamp down to a time.'))
    }

    return suggestions
  }

  if (numericTypes.has(baseType)) {
    return [
      createSuggestion('0', 'Start counters and numeric flags at zero.'),
      createSuggestion('1', 'Use one when the value should start populated.')
    ]
  }

  if (stringTypes.has(baseType)) {
    return [
      createSuggestion(`''`, 'Use an empty string literal.'),
      createSuggestion(`'pending'`, 'Handy when the column behaves like a status label.')
    ]
  }

  if (baseType === 'jsonb') {
    return [
      createSuggestion(`'{}'::jsonb`, 'Default to an empty JSON object.'),
      createSuggestion(`'[]'::jsonb`, 'Default to an empty JSON array.')
    ]
  }

  if (baseType === 'json') {
    return [
      createSuggestion(`'{}'::json`, 'Default to an empty JSON object.'),
      createSuggestion(`'[]'::json`, 'Default to an empty JSON array.')
    ]
  }

  if (baseType === 'bytea') {
    return [
      createSuggestion(`'\\\\x'::bytea`, 'Default to an empty byte array.'),
      createSuggestion(`decode('', 'hex')`, 'Build an empty bytea value from hex input.')
    ]
  }

  if (baseType === 'interval') {
    return [
      createSuggestion(`interval '0'`, 'Use a zero interval.'),
      createSuggestion(`interval '1 day'`, 'Default to a one-day interval.')
    ]
  }

  if (baseType === 'inet') {
    return [
      createSuggestion(`'0.0.0.0'`, 'Default to an IPv4 address literal.'),
      createSuggestion(`'::1'`, 'Default to an IPv6 loopback address.')
    ]
  }

  if (baseType === 'cidr') {
    return [
      createSuggestion(`'0.0.0.0/0'`, 'Default to the full IPv4 CIDR range.'),
      createSuggestion(`'10.0.0.0/8'`, 'Use a common private network range.')
    ]
  }

  if (baseType === 'macaddr' || baseType === 'macaddr8') {
    return [
      createSuggestion(`'00:00:00:00:00:00'`, 'Default to a zeroed MAC address.'),
      createSuggestion(`'02:00:00:00:00:00'`, 'Use a locally administered MAC address.')
    ]
  }

  if (baseType === 'tsvector') {
    return [
      createSuggestion(`to_tsvector('simple', '')`, 'Create an empty tsvector.'),
      createSuggestion(`to_tsvector('english', '')`, 'Create an empty English-language tsvector.')
    ]
  }

  return []
}

export const usePgmlColumnDefaultSuggestions = () => {
  const getColumnDefaultSuggestions = (columnType: string) => {
    const normalizedType = normalizeColumnType(columnType)

    if (normalizedType.isArray) {
      return uniqueSuggestions(buildArraySuggestions(normalizedType.castType))
    }

    return uniqueSuggestions(getSuggestionsForBaseType(normalizedType.baseType))
  }

  const getColumnDefaultPlaceholder = (columnType: string) => {
    const suggestions = getColumnDefaultSuggestions(columnType)

    if (suggestions.length > 0) {
      return suggestions[0]!.value
    }

    return 'Type a default expression'
  }

  return {
    getColumnDefaultPlaceholder,
    getColumnDefaultSuggestions
  }
}
