import { parsePgml } from './pgml'
import { normalizePgmlCompatSource } from './pgml-dbml-compat'
import { normalizeSchemaName } from './studio-browser-schemas'

export type DbmlImportResult = {
  pgml: string
  schemaName: string
}

const defaultImportedSchemaName = 'Imported schema'
const dbmlCommentLines = [
  '// Imported from DBML.',
  '// PGML preserves the DBML-like schema blocks and ignores top-level Project metadata during import.'
]

const normalizeDbmlLineEndings = (value: string) => {
  return value.replaceAll('\r\n', '\n')
}

const deriveDbmlFileName = (value: string | null | undefined) => {
  if (!value) {
    return defaultImportedSchemaName
  }

  return value.trim().replace(/\.(dbml|dbdiagram|txt)$/iu, '')
}

const deriveDbmlProjectName = (source: string) => {
  const projectMatch = normalizeDbmlLineEndings(source).match(/^\s*Project\s+([^\s{]+)\s*\{/imu)

  return projectMatch?.[1]?.trim().replaceAll(/^['"`]+|['"`]+$/g, '') || null
}

export const deriveDbmlSchemaName = (input?: {
  preferredName?: string | null
  source?: string
}) => {
  const preferredProjectName = input?.source ? deriveDbmlProjectName(input.source) : null
  const fallbackFileName = deriveDbmlFileName(input?.preferredName)

  return normalizeSchemaName(preferredProjectName || fallbackFileName)
}

const countOccurrences = (value: string, pattern: RegExp) => {
  return value.match(pattern)?.length || 0
}

const stripDbmlProjectBlocks = (source: string) => {
  const lines = normalizeDbmlLineEndings(source).split('\n')
  const keptLines: string[] = []
  let projectBlockDepth = 0

  lines.forEach((line) => {
    const trimmedLine = line.trim()

    if (projectBlockDepth === 0 && /^Project(?:\s+[^\s{]+)?\s*\{/iu.test(trimmedLine)) {
      // PGML currently imports the DBML-like schema surface it can already
      // parse. Top-level Project metadata is intentionally ignored so the
      // imported result stays valid PGML instead of a mixed grammar.
      projectBlockDepth += countOccurrences(line, /\{/g)
      projectBlockDepth -= countOccurrences(line, /\}/g)
      return
    }

    if (projectBlockDepth > 0) {
      projectBlockDepth += countOccurrences(line, /\{/g)
      projectBlockDepth -= countOccurrences(line, /\}/g)
      return
    }

    keptLines.push(line)
  })

  return keptLines.join('\n').trim()
}

const parseImportedTableName = (value: string) => {
  const cleanedValue = value.replaceAll('"', '').trim()
  const parts = cleanedValue.split('.')

  if (parts.length >= 2) {
    return {
      fullName: `${parts[0]}.${parts[1]}`,
      schema: parts[0] || 'public',
      table: parts[1] || ''
    }
  }

  return {
    fullName: `public.${cleanedValue}`,
    schema: 'public',
    table: cleanedValue
  }
}

const normalizeSerialBaseType = (value: string) => {
  const normalizedValue = value.trim().toLowerCase()

  if (normalizedValue === 'smallserial' || normalizedValue === 'serial2') {
    return 'smallint'
  }

  if (normalizedValue === 'bigserial' || normalizedValue === 'serial8') {
    return 'bigint'
  }

  return 'integer'
}

const normalizeDbmlSerialColumns = (source: string) => {
  const originalLines = normalizeDbmlLineEndings(source).split('\n')
  const visibleLines = normalizePgmlCompatSource(source).split('\n')
  const nextLines: string[] = []
  const generatedSequenceBlocks: string[] = []
  let tableDepth = 0
  let currentTable: ReturnType<typeof parseImportedTableName> | null = null

  originalLines.forEach((originalLine, index) => {
    const visibleLine = visibleLines[index] || ''
    const trimmedVisibleLine = visibleLine.trim()

    if (tableDepth === 0) {
      const tableHeaderMatch = trimmedVisibleLine.match(/^Table\s+([^\s]+)(?:\s+in\s+.+)?\s*\{$/)

      if (tableHeaderMatch) {
        currentTable = parseImportedTableName(tableHeaderMatch[1] || '')
        tableDepth = 1
        nextLines.push(originalLine)
        return
      }

      nextLines.push(originalLine)
      return
    }

    if (!currentTable) {
      nextLines.push(originalLine)
      return
    }

    if (
      tableDepth === 1
      && trimmedVisibleLine.length > 0
      && !trimmedVisibleLine.endsWith('{')
      && trimmedVisibleLine !== '}'
    ) {
      const columnMatch = visibleLine.match(/^(\s*)([^\s]+)\s+(smallserial|bigserial|serial(?:2|4|8)?)\b(?:\s+\[([^\]]+)\])?(\s*)$/i)

      if (columnMatch) {
        const indent = columnMatch[1] || ''
        const columnName = columnMatch[2] || ''
        const serialType = columnMatch[3] || 'serial'
        const modifierGroup = columnMatch[4] || ''
        const suffix = originalLine.slice(columnMatch[0].length)
        const nextBaseType = normalizeSerialBaseType(serialType)
        const sequenceName = `${currentTable.table}_${columnName}_seq`
        const qualifiedSequenceName = `${currentTable.schema}.${sequenceName}`
        const ownedByTarget = `${currentTable.fullName}.${columnName}`
        const modifiers = modifierGroup
          .split(',')
          .map(part => part.trim())
          .filter(part => part.length > 0)

        if (!modifiers.some(modifier => modifier.startsWith('default:'))) {
          modifiers.push(`default: nextval('${qualifiedSequenceName}')`)
        }

        generatedSequenceBlocks.push(`Sequence ${qualifiedSequenceName} {\n  as: ${nextBaseType}\n  owned_by: ${ownedByTarget}\n}`)
        nextLines.push(`${indent}${columnName} ${nextBaseType} [${modifiers.join(', ')}]${suffix}`)
      } else {
        nextLines.push(originalLine)
      }
    } else {
      nextLines.push(originalLine)
    }

    const openBraceCount = (visibleLine.match(/\{/g) || []).length
    const closeBraceCount = (visibleLine.match(/\}/g) || []).length
    tableDepth += openBraceCount - closeBraceCount

    if (tableDepth <= 0) {
      tableDepth = 0
      currentTable = null
    }
  })

  if (generatedSequenceBlocks.length === 0) {
    return source
  }

  return `${generatedSequenceBlocks.join('\n\n')}\n\n${nextLines.join('\n')}`.trim()
}

export const convertDbmlToPgml = (input: {
  dbml: string
  preferredName?: string | null
}): DbmlImportResult => {
  const normalizedDbml = normalizeDbmlSerialColumns(stripDbmlProjectBlocks(input.dbml))

  if (normalizedDbml.length === 0) {
    throw new Error('No importable schema objects were found in that DBML.')
  }

  // Reuse the PGML parser as the compatibility gate. If this DBML subset can
  // be parsed as PGML, the studio can open and edit it without a separate
  // DBML-only execution path.
  parsePgml(normalizedDbml)

  return {
    pgml: `${dbmlCommentLines.join('\n')}\n\n${normalizedDbml}`,
    schemaName: deriveDbmlSchemaName({
      preferredName: input.preferredName,
      source: input.dbml
    })
  }
}
