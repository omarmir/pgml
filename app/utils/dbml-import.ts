import { parsePgml } from './pgml'
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

export const convertDbmlToPgml = (input: {
  dbml: string
  preferredName?: string | null
}): DbmlImportResult => {
  const normalizedDbml = stripDbmlProjectBlocks(input.dbml)

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
