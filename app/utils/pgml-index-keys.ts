import { splitTopLevelSqlList } from './sql-scan'

// Backtick expressions need grouping; complete SQL keys can include ordering and opclasses.
export type PgmlIndexKey = { kind: 'column', name: string }
  | { kind: 'expression', sql: string }
  | { kind: 'sql', sql: string }

const ordinaryIdentifierPattern = /^[a-z_$][\w$]*$/iu
const quoteIdentifier = (value: string) => `"${value.replaceAll('"', '""')}"`
const quotedSqlTokenPattern = /--[^\r\n]*|\/\*[\s\S]*?\*\/|[eE]'(?:[^'\\]|\\[\s\S]|'')*'|'(?:[^']|'')*'|\$([A-Za-z0-9_]*)\$[\s\S]*?\$\1\$|"((?:[^"]|"")*)"|([A-Za-z_$][\w$]*)|(\S)/gu

const parseIndexKey = (value: string): PgmlIndexKey => {
  const quotedIdentifier = value.match(/^"((?:[^"]|"")*)"$/su)

  if (quotedIdentifier && quotedIdentifier[1] !== undefined) {
    return { kind: 'column', name: quotedIdentifier[1].replaceAll('""', '"') }
  }

  if (ordinaryIdentifierPattern.test(value)) {
    return { kind: 'column', name: value }
  }

  if (value.startsWith('`') && value.endsWith('`')) {
    return { kind: 'expression', sql: value.slice(1, -1) }
  }

  return { kind: 'sql', sql: value }
}

export const parsePgmlIndexKeys = (value: string): PgmlIndexKey[] => {
  return splitTopLevelSqlList(value)
    .map(parseIndexKey)
    .filter(key => key.kind !== 'column' || key.name.length > 0)
}

// Parsed keys own their semantics; columns is the compatibility view for older models.
export const getPgmlIndexKeys = (index: {
  columns: readonly string[]
  keys?: readonly PgmlIndexKey[]
}): readonly PgmlIndexKey[] => {
  if (index.keys !== undefined) {
    return index.keys
  }

  return index.columns.map(name => ({ kind: 'column', name }))
}

export const getPgmlIndexKeyValue = (key: PgmlIndexKey) => {
  return key.kind === 'column' ? key.name : key.sql
}

export const foldPgmlIndexKeyIdentifiers = (
  key: PgmlIndexKey,
  importedIdentifierNames: ReadonlySet<string> | null = null
): PgmlIndexKey => {
  if (key.kind === 'column') {
    return { kind: 'column', name: key.name.toLowerCase() }
  }

  let role: 'reference' | 'collation-name' | 'collation-tail' = 'reference'

  // Match whole SQL literals before identifiers so folding cannot change their contents.
  const sql = key.sql.replace(quotedSqlTokenPattern, (
    token: string,
    _tag: string | undefined,
    identifier: string | undefined,
    word: string | undefined,
    symbol: string | undefined
  ) => {
    if (identifier === undefined && word === undefined && symbol === undefined) {
      return token
    }

    if (role === 'collation-tail') {
      if (symbol === '.') {
        role = 'collation-name'
        return token
      }

      role = 'reference'
    }

    if (role === 'collation-name') {
      role = identifier !== undefined || word !== undefined ? 'collation-tail' : 'reference'
      return token
    }

    if (word !== undefined && word.toLowerCase() === 'collate') {
      role = 'collation-name'
      return token
    }

    if (identifier === undefined) {
      return token
    }

    const name = identifier.replaceAll('""', '"')

    return importedIdentifierNames === null || importedIdentifierNames.has(name) ? quoteIdentifier(name.toLowerCase()) : token
  })

  return { ...key, sql }
}

export const formatPgmlIndexKeyForSql = (key: PgmlIndexKey) => {
  if (key.kind === 'expression') {
    return `(${key.sql})`
  }

  return key.kind === 'column' ? quoteIdentifier(key.name) : key.sql
}

export const formatPgmlIndexKeyForSource = (key: PgmlIndexKey) => {
  if (key.kind === 'expression') {
    return `\`${key.sql}\``
  }

  if (key.kind === 'sql') {
    return key.sql
  }

  return ordinaryIdentifierPattern.test(key.name) ? key.name : quoteIdentifier(key.name)
}
