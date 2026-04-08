const normalizeTypeWhitespace = (value: string) => {
  return value.replaceAll(/\s+/g, ' ').trim()
}

const normalizeTypeArgumentSpacing = (value: string) => {
  return normalizeTypeWhitespace(value)
    .replaceAll(/\s*\(\s*/g, '(')
    .replaceAll(/\s*\)/g, ')')
    .replaceAll(/\s*,\s*/g, ', ')
}

const splitArraySuffix = (value: string) => {
  let baseType = normalizeTypeArgumentSpacing(value)
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

const normalizeBuiltinTypeBase = (value: string) => {
  const normalizedValue = normalizeTypeArgumentSpacing(value)
  const withoutPgCatalog = normalizedValue.replace(/^pg_catalog\./iu, '')
  const loweredValue = withoutPgCatalog.toLowerCase()
  const characterVaryingMatch = loweredValue.match(/^character varying(\([^)]*\))?$/u)

  if (characterVaryingMatch) {
    return `varchar${characterVaryingMatch[1] || ''}`
  }

  const characterMatch = loweredValue.match(/^character(\([^)]*\))?$/u)

  if (characterMatch) {
    return `char${characterMatch[1] || ''}`
  }

  const timestampWithoutTimeZoneMatch = loweredValue.match(/^timestamp(\([^)]*\))? without time zone$/u)

  if (timestampWithoutTimeZoneMatch) {
    return `timestamp${timestampWithoutTimeZoneMatch[1] || ''}`
  }

  const timestampWithTimeZoneMatch = loweredValue.match(/^timestamp(\([^)]*\))? with time zone$/u)

  if (timestampWithTimeZoneMatch) {
    return `timestamptz${timestampWithTimeZoneMatch[1] || ''}`
  }

  const timeWithoutTimeZoneMatch = loweredValue.match(/^time(\([^)]*\))? without time zone$/u)

  if (timeWithoutTimeZoneMatch) {
    return `time${timeWithoutTimeZoneMatch[1] || ''}`
  }

  const timeWithTimeZoneMatch = loweredValue.match(/^time(\([^)]*\))? with time zone$/u)

  if (timeWithTimeZoneMatch) {
    return `timetz${timeWithTimeZoneMatch[1] || ''}`
  }

  if (loweredValue === 'bool') {
    return 'boolean'
  }

  if (loweredValue === 'bpchar') {
    return 'char'
  }

  if (loweredValue === 'decimal') {
    return 'numeric'
  }

  if (loweredValue === 'int') {
    return 'integer'
  }

  if (loweredValue === 'int2') {
    return 'smallint'
  }

  if (loweredValue === 'int4') {
    return 'integer'
  }

  if (loweredValue === 'int8') {
    return 'bigint'
  }

  if (loweredValue === 'float4') {
    return 'real'
  }

  if (loweredValue === 'float8') {
    return 'double precision'
  }

  if (withoutPgCatalog !== normalizedValue) {
    const canonicalBuiltinNames = new Set([
      'bigint',
      'boolean',
      'char',
      'citext',
      'date',
      'double precision',
      'integer',
      'interval',
      'json',
      'jsonb',
      'numeric',
      'real',
      'smallint',
      'text',
      'time',
      'timetz',
      'timestamp',
      'timestamptz',
      'uuid',
      'varchar',
      'xml'
    ])

    if (canonicalBuiltinNames.has(loweredValue)) {
      return loweredValue
    }
  }

  return null
}

export const normalizePgmlTypeExpression = (value: string) => {
  const normalizedValue = normalizeTypeArgumentSpacing(value)

  if (normalizedValue.length === 0) {
    return ''
  }

  const { arrayDepth, baseType } = splitArraySuffix(normalizedValue)
  const normalizedBaseType = normalizeBuiltinTypeBase(baseType)

  if (!normalizedBaseType) {
    return appendArraySuffix(baseType, arrayDepth)
  }

  return appendArraySuffix(normalizedBaseType, arrayDepth)
}
