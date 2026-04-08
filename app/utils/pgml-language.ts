import { commonPgmlColumnTypes } from './pgml-table-editor'
import {
  collectDbmlCompatibleMultilineEntries,
  normalizePgmlCompatSource,
  parseDbmlCompatibleCheckDefinition,
  parseDbmlCompatibleIndexDefinition,
  parsePgmlCompatibleReference
} from './pgml-dbml-compat'

export type PgmlLanguageDiagnosticSeverity = 'error' | 'warning'

export type PgmlLanguageDiagnostic = {
  code: string
  severity: PgmlLanguageDiagnosticSeverity
  message: string
  from: number
  to: number
  line: number
  lines?: number[]
}

export type PgmlLanguageCompletionKind = 'keyword' | 'property' | 'symbol' | 'type' | 'value'

export type PgmlLanguageCompletionItem = {
  label: string
  kind: PgmlLanguageCompletionKind
  detail: string
  apply: string
  from: number
  to: number
}

type PgmlLineInfo = {
  number: number
  text: string
  trimmed: string
  from: number
  to: number
}

type PgmlBlockKind = 'Table'
  | 'Column'
  | 'TableGroup'
  | 'Enum'
  | 'Domain'
  | 'Composite'
  | 'Function'
  | 'Procedure'
  | 'Trigger'
  | 'Sequence'
  | 'Properties'
  | 'SchemaMetadata'
  | 'CompareExclusions'
  | 'VersionSet'
  | 'Workspace'
  | 'Version'
  | 'Comparison'
  | 'Snapshot'
  | 'View'
  | 'Unknown'

type PgmlRawBlock = {
  kind: PgmlBlockKind
  keyword: string
  header: string
  headerLine: PgmlLineInfo
  body: PgmlLineInfo[]
  startLine: number
  endLine: number
  from: number
  to: number
}

type PgmlContextKind = 'top-level'
  | 'version-set'
  | 'schema-metadata'
  | 'comparison'
  | 'compare-exclusions'
  | 'workspace'
  | 'version'
  | 'snapshot'
  | 'view'
  | 'table'
  | 'group'
  | 'custom-type'
  | 'routine'
  | 'trigger'
  | 'sequence'
  | 'properties'
  | 'docs'
  | 'affects'
  | 'source'

type PgmlContextRange = {
  kind: PgmlContextKind
  blockKind: PgmlBlockKind
  from: number
  to: number
  startLine: number
  endLine: number
}

type PgmlNamedRange = {
  name: string
  from: number
  to: number
  line: number
}

type PgmlColumnSymbol = PgmlNamedRange & {
  tableName: string
}

type PgmlTableSymbol = PgmlNamedRange & {
  fullName: string
  groupName: string | null
  columns: PgmlColumnSymbol[]
}

type PgmlGroupEntry = {
  tableName: string
  from: number
  to: number
  line: number
}

type PgmlGroupSymbol = PgmlNamedRange & {
  entries: PgmlGroupEntry[]
}

type PgmlCustomTypeSymbol = PgmlNamedRange & {
  kind: 'Enum' | 'Domain' | 'Composite'
}

type PgmlReferenceSymbol = {
  kind: 'inline' | 'top-level'
  relation: '>' | '<' | '-'
  fromTable: string
  fromColumn: string
  fromColumns?: string[]
  toTable: string
  toColumn: string
  toColumns?: string[]
  from: number
  to: number
  line: number
}

type PgmlPropertyTarget = PgmlNamedRange & {
  id: string
}

type PgmlAnalysisCache = {
  analysis: PgmlDocumentAnalysis
  source: string
}

export type PgmlDocumentAnalysis = {
  source: string
  diagnostics: PgmlLanguageDiagnostic[]
  blocks: PgmlRawBlock[]
  contexts: PgmlContextRange[]
  lines: PgmlLineInfo[]
  isVersionedDocument: boolean
  tables: PgmlTableSymbol[]
  groups: PgmlGroupSymbol[]
  customTypes: PgmlCustomTypeSymbol[]
  functions: PgmlNamedRange[]
  procedures: PgmlNamedRange[]
  triggers: PgmlNamedRange[]
  sequences: PgmlNamedRange[]
  references: PgmlReferenceSymbol[]
  propertyTargets: PgmlPropertyTarget[]
  versionIds: PgmlNamedRange[]
}

type DuplicateEntry<T> = {
  key: string
  values: T[]
}

type PgmlParsedMetadataLine = {
  entry: ReturnType<typeof parseMetadataEntry>
  line: PgmlLineInfo
}

const snapshotTopLevelKeywordTemplates = [
  { label: 'Table', detail: 'Start a table block.', apply: 'Table ' },
  { label: 'TableGroup', detail: 'Start a table group block.', apply: 'TableGroup ' },
  { label: 'Enum', detail: 'Start an enum block.', apply: 'Enum ' },
  { label: 'Domain', detail: 'Start a domain block.', apply: 'Domain ' },
  { label: 'Composite', detail: 'Start a composite type block.', apply: 'Composite ' },
  { label: 'Function', detail: 'Start a function block.', apply: 'Function ' },
  { label: 'Procedure', detail: 'Start a procedure block.', apply: 'Procedure ' },
  { label: 'Trigger', detail: 'Start a trigger block.', apply: 'Trigger ' },
  { label: 'Sequence', detail: 'Start a sequence block.', apply: 'Sequence ' },
  { label: 'Ref:', detail: 'Create a top-level relationship.', apply: 'Ref: ' },
  { label: 'Properties', detail: 'Attach persisted layout properties.', apply: 'Properties "' }
] as const

const rootKeywordTemplates = [
  { label: 'VersionSet', detail: 'Start a versioned PGML document.', apply: 'VersionSet "' },
  ...snapshotTopLevelKeywordTemplates
] as const

const versionSetKeywordTemplates = [
  { label: 'SchemaMetadata', detail: 'Persist table and column metadata outside version snapshots.', apply: 'SchemaMetadata {' },
  { label: 'Workspace', detail: 'Define the mutable working draft.', apply: 'Workspace {' },
  { label: 'Comparison', detail: 'Store a named compare preset with its exclusions.', apply: 'Comparison "' },
  { label: 'Version', detail: 'Lock an immutable checkpoint.', apply: 'Version ' }
] as const

const schemaMetadataKeywordTemplates = [
  { label: 'Table', detail: 'Attach custom fields to a table id.', apply: 'Table "' },
  { label: 'Column', detail: 'Attach custom fields to a column id.', apply: 'Column "' }
] as const

const workspaceMetadataKeywordTemplates = [
  { label: 'based_on', detail: 'Choose the locked version the workspace increments from.', apply: 'based_on: ' },
  { label: 'active_view', detail: 'Choose the active workspace diagram view id.', apply: 'active_view: ' },
  { label: 'updated_at', detail: 'Record the last workspace update timestamp.', apply: 'updated_at: "' }
] as const

const versionMetadataKeywordTemplates = [
  { label: 'name', detail: 'Set a user-facing checkpoint label.', apply: 'name: "' },
  { label: 'role', detail: 'Mark the checkpoint as design or implementation.', apply: 'role: ' },
  { label: 'parent', detail: 'Set the predecessor version id.', apply: 'parent: ' },
  { label: 'active_view', detail: 'Choose the active version diagram view id.', apply: 'active_view: ' },
  { label: 'created_at', detail: 'Record the checkpoint timestamp.', apply: 'created_at: "' }
] as const

const snapshotKeywordTemplates = [
  { label: 'Snapshot', detail: 'Open a nested schema snapshot block.', apply: 'Snapshot {' }
] as const

const viewKeywordTemplates = [
  { label: 'View', detail: 'Store a named diagram view for this workspace or version.', apply: 'View "' }
] as const

const comparisonMetadataKeywordTemplates = [
  { label: 'id', detail: 'Persist the stable id for this comparison.', apply: 'id: ' },
  { label: 'base', detail: 'Choose the base version, workspace, or empty state.', apply: 'base: ' },
  { label: 'target', detail: 'Choose the comparison target version or workspace.', apply: 'target: ' },
  { label: 'CompareExclusions', detail: 'Store excluded groups and tables for this comparison.', apply: 'CompareExclusions {' }
] as const

const viewMetadataKeywordTemplates = [
  { label: 'id', detail: 'Persist the stable id for this view.', apply: 'id: ' },
  { label: 'show_lines', detail: 'Hide or show relationship lines in this view.', apply: 'show_lines: false' },
  { label: 'snap_to_grid', detail: 'Persist whether node drops snap to the grid in this view.', apply: 'snap_to_grid: false' },
  { label: 'show_execs', detail: 'Hide or show executable objects in this view.', apply: 'show_execs: false' },
  { label: 'show_fields', detail: 'Hide or show table fields in this view.', apply: 'show_fields: false' }
] as const

const versionRoleValueTemplates = [
  { label: 'design', detail: 'A design-side checkpoint.', apply: 'design' },
  { label: 'implementation', detail: 'An implementation-side checkpoint.', apply: 'implementation' }
] as const

const workspaceMetadataKeys = new Set(['based_on', 'updated_at', 'active_view'])
const versionMetadataKeys = new Set(['name', 'role', 'parent', 'created_at', 'active_view', 'default_view'])
const comparisonMetadataKeys = new Set(['id', 'base', 'target'])
const compareExclusionsMetadataKeys = new Set(['group', 'table', 'include_group', 'include_table'])
const viewMetadataKeys = new Set(['id', 'show_lines', 'lines', 'snap_to_grid', 'snap', 'show_execs', 'execs', 'show_fields', 'fields'])

const tableBodyKeywordTemplates = [
  { label: 'Note:', detail: 'Add a table note.', apply: 'Note: ' },
  { label: 'Index', detail: 'Add an index definition.', apply: 'Index ' },
  { label: 'Indexes', detail: 'Add a DBML-style indexes block.', apply: 'Indexes {' },
  { label: 'Constraint', detail: 'Add a constraint definition.', apply: 'Constraint ' },
  { label: 'checks', detail: 'Add a DBML-style checks block.', apply: 'checks {' }
] as const

const executableKeywordTemplates = [
  { label: 'docs', detail: 'Start a docs block.', apply: 'docs {' },
  { label: 'affects', detail: 'Start an affects block.', apply: 'affects {' },
  { label: 'source', detail: 'Start a dollar-quoted source block.', apply: 'source: $sql$' },
  { label: 'definition', detail: 'Alias for a source block.', apply: 'definition: $sql$' },
  { label: 'language', detail: 'Set the routine language.', apply: 'language: ' },
  { label: 'volatility', detail: 'Set function volatility.', apply: 'volatility: ' },
  { label: 'security', detail: 'Set routine security mode.', apply: 'security: ' },
  { label: 'timing', detail: 'Set trigger timing.', apply: 'timing: ' },
  { label: 'events', detail: 'Set trigger events.', apply: 'events: []' },
  { label: 'level', detail: 'Set trigger level.', apply: 'level: ' },
  { label: 'function', detail: 'Reference a trigger routine.', apply: 'function: ' },
  { label: 'arguments', detail: 'Set trigger arguments.', apply: 'arguments: []' },
  { label: 'as', detail: 'Set sequence numeric type.', apply: 'as: ' },
  { label: 'start', detail: 'Set sequence start value.', apply: 'start: ' },
  { label: 'increment', detail: 'Set sequence increment.', apply: 'increment: ' },
  { label: 'min', detail: 'Set sequence minimum.', apply: 'min: ' },
  { label: 'max', detail: 'Set sequence maximum.', apply: 'max: ' },
  { label: 'cache', detail: 'Set sequence cache size.', apply: 'cache: ' },
  { label: 'cycle', detail: 'Set sequence cycling.', apply: 'cycle: ' },
  { label: 'owned_by', detail: 'Set sequence ownership.', apply: 'owned_by: ' }
] as const

const docsKeywordTemplates = [
  { label: 'summary', detail: 'Document the object summary.', apply: 'summary: ' }
] as const

const affectsKeywordTemplates = [
  { label: 'writes', detail: 'List written tables.', apply: 'writes: []' },
  { label: 'sets', detail: 'List written columns.', apply: 'sets: []' },
  { label: 'depends_on', detail: 'List dependencies.', apply: 'depends_on: []' },
  { label: 'reads', detail: 'List read tables.', apply: 'reads: []' },
  { label: 'calls', detail: 'List called routines.', apply: 'calls: []' },
  { label: 'uses', detail: 'List used types or objects.', apply: 'uses: []' },
  { label: 'owned_by', detail: 'List owner targets.', apply: 'owned_by: []' }
] as const

const propertyKeywordTemplates = [
  { label: 'x', detail: 'Set stored x position.', apply: 'x: ' },
  { label: 'y', detail: 'Set stored y position.', apply: 'y: ' },
  { label: 'width', detail: 'Set stored width.', apply: 'width: ' },
  { label: 'height', detail: 'Set stored height.', apply: 'height: ' },
  { label: 'color', detail: 'Set node accent color.', apply: 'color: #' },
  { label: 'collapsed', detail: 'Set collapsed state.', apply: 'collapsed: false' },
  { label: 'visible', detail: 'Set visibility state.', apply: 'visible: false' },
  { label: 'masonry', detail: 'Pack grouped tables to reduce whitespace.', apply: 'masonry: true' },
  { label: 'table_columns', detail: 'Set group table column count.', apply: 'table_columns: 2' },
  { label: 'table_width_scale', detail: 'Scale grouped table widths.', apply: 'table_width_scale: 1.5' }
] as const

const modifierKeywordTemplates = [
  { label: 'pk', detail: 'Mark the column as a primary key.', apply: 'pk' },
  { label: 'unique', detail: 'Mark the column as unique.', apply: 'unique' },
  { label: 'not null', detail: 'Prevent null values.', apply: 'not null' },
  { label: 'default:', detail: 'Set a default expression.', apply: 'default: ' },
  { label: 'note:', detail: 'Add a note to the column.', apply: 'note: ' },
  { label: 'ref:', detail: 'Add a relationship modifier.', apply: 'ref: > ' },
  { label: 'delete:', detail: 'Set the ON DELETE action for a reference.', apply: 'delete: cascade' },
  { label: 'update:', detail: 'Set the ON UPDATE action for a reference.', apply: 'update: cascade' }
] as const

const propertyKeySet = new Set(['x', 'y', 'width', 'height', 'color', 'collapsed', 'visible', 'masonry', 'table_columns', 'tablecolumns', 'columns', 'table_width_scale', 'tablewidthscale', 'table_width', 'tablewidth'])
const booleanPropertyKeys = new Set(['collapsed', 'visible', 'masonry'])
const numericPropertyKeys = new Set(['x', 'y', 'width', 'height', 'table_columns', 'tablecolumns', 'columns', 'table_width_scale', 'tablewidthscale', 'table_width', 'tablewidth'])
const validColorPattern = /^#(?:[\da-f]{3}|[\da-f]{6})$/i
let analysisCache: PgmlAnalysisCache | null = null

type PgmlAnalysisState = {
  tables: PgmlTableSymbol[]
  groups: PgmlGroupSymbol[]
  customTypes: PgmlCustomTypeSymbol[]
  functions: PgmlNamedRange[]
  procedures: PgmlNamedRange[]
  triggers: PgmlNamedRange[]
  sequences: PgmlNamedRange[]
  references: PgmlReferenceSymbol[]
  propertyTargets: PgmlPropertyTarget[]
  versionIds: PgmlNamedRange[]
}

type PgmlDocumentRootMode = 'snapshot' | 'version-set' | 'workspace' | 'version'

type CollectRawBlocksOptions = {
  topLevelContextKind?: PgmlContextKind | null
  topLevelBlockKind?: PgmlBlockKind
}

export type PgmlCompletionLineOverride = {
  from: number
  text: string
  to: number
}

const normalizeLineEndings = (source: string) => source.replaceAll('\r\n', '\n')
const cleanName = (value: string) => value.replaceAll('"', '').trim()
const cleanText = (value: string) => value.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
const lower = (value: string) => value.toLowerCase()
const normalizeMetadataKey = (value: string) => lower(cleanName(value)).replaceAll(/[^\w]+/g, '_')
const getDuplicateLineNumbers = <T extends { line: number }>(values: T[]) => {
  return Array.from(new Set(values.map(value => value.line))).sort((left, right) => left - right)
}
const formatDuplicateLineSummary = (lines: number[]) => {
  return `Lines ${lines.join(', ')}.`
}

const parseTableName = (value: string) => {
  const cleanedValue = cleanName(value)
  const parts = cleanedValue.split('.')

  if (parts.length >= 2) {
    return {
      schema: parts[0] ? parts[0].trim() : 'public',
      table: parts[1] ? parts[1].trim() : ''
    }
  }

  return {
    schema: 'public',
    table: cleanedValue
  }
}

const parseReferenceTarget = (value: string) => {
  const cleanedValue = cleanName(value)
  const parts = cleanedValue.split('.')

  if (parts.length >= 3) {
    return {
      schema: parts[0] ? parts[0].trim() : 'public',
      table: parts[1] ? parts[1].trim() : '',
      column: parts[2] ? parts[2].trim() : ''
    }
  }

  if (parts.length === 2) {
    return {
      schema: 'public',
      table: parts[0] ? parts[0].trim() : '',
      column: parts[1] ? parts[1].trim() : ''
    }
  }

  return {
    schema: 'public',
    table: cleanedValue,
    column: ''
  }
}

const createLineInfo = (source: string) => {
  const normalizedSource = normalizeLineEndings(source)
  const rawLines = normalizedSource.split('\n')
  const lines: PgmlLineInfo[] = []
  let offset = 0

  rawLines.forEach((text, index) => {
    const from = offset
    const to = from + text.length

    lines.push({
      number: index + 1,
      text,
      trimmed: text.trim(),
      from,
      to
    })

    offset = to + 1
  })

  return {
    lines,
    normalizedSource
  }
}

const findSourceDelimiter = (trimmedLine: string) => {
  const match = trimmedLine.match(/^(source|definition):\s*(\$(?:[A-Za-z0-9_]+)?\$)(.*)$/)

  if (!match) {
    return null
  }

  const delimiter = match[2]
  const remainder = match[3]

  if (!delimiter) {
    return null
  }

  if (typeof remainder === 'string' && remainder.includes(delimiter)) {
    return ''
  }

  return delimiter
}

const parseBlockKind = (header: string): { kind: PgmlBlockKind, keyword: string } => {
  const keyword = header.split(/\s+/)[0] || ''

  if (keyword === 'Table') {
    return { kind: 'Table', keyword }
  }

  if (keyword === 'TableGroup') {
    return { kind: 'TableGroup', keyword }
  }

  if (keyword === 'Enum') {
    return { kind: 'Enum', keyword }
  }

  if (keyword === 'Domain') {
    return { kind: 'Domain', keyword }
  }

  if (keyword === 'Composite') {
    return { kind: 'Composite', keyword }
  }

  if (keyword === 'Function') {
    return { kind: 'Function', keyword }
  }

  if (keyword === 'Procedure') {
    return { kind: 'Procedure', keyword }
  }

  if (keyword === 'Trigger') {
    return { kind: 'Trigger', keyword }
  }

  if (keyword === 'Sequence') {
    return { kind: 'Sequence', keyword }
  }

  if (keyword === 'Properties') {
    return { kind: 'Properties', keyword }
  }

  if (keyword === 'SchemaMetadata') {
    return { kind: 'SchemaMetadata', keyword }
  }

  if (keyword === 'CompareExclusions') {
    return { kind: 'CompareExclusions', keyword }
  }

  if (keyword === 'VersionSet') {
    return { kind: 'VersionSet', keyword }
  }

  if (keyword === 'Workspace') {
    return { kind: 'Workspace', keyword }
  }

  if (keyword === 'Version') {
    return { kind: 'Version', keyword }
  }

  if (keyword === 'Comparison') {
    return { kind: 'Comparison', keyword }
  }

  if (keyword === 'Snapshot') {
    return { kind: 'Snapshot', keyword }
  }

  if (keyword === 'View') {
    return { kind: 'View', keyword }
  }

  if (keyword === 'Column') {
    return { kind: 'Column', keyword }
  }

  return {
    kind: 'Unknown',
    keyword
  }
}

const createDiagnostic = (
  diagnostics: PgmlLanguageDiagnostic[],
  code: string,
  severity: PgmlLanguageDiagnosticSeverity,
  message: string,
  line: PgmlLineInfo,
  from: number = line.from,
  to: number = line.to
) => {
  diagnostics.push({
    code,
    severity,
    message,
    from,
    to: Math.max(from + 1, to),
    line: line.number
  })
}

const collectRawBlocks = (
  lines: PgmlLineInfo[],
  diagnostics: PgmlLanguageDiagnostic[],
  contexts: PgmlContextRange[],
  options: CollectRawBlocksOptions = {}
) => {
  const blocks: PgmlRawBlock[] = []
  const topLevelLines: PgmlLineInfo[] = []
  const topLevelContextKind = options.topLevelContextKind === undefined ? 'top-level' : options.topLevelContextKind
  const topLevelBlockKind = options.topLevelBlockKind || 'Unknown'
  let index = 0

  if (topLevelContextKind) {
    contexts.push({
      kind: topLevelContextKind,
      blockKind: topLevelBlockKind,
      from: lines[0] ? lines[0].from : 0,
      to: lines.length > 0 ? lines[lines.length - 1]!.to : 0,
      startLine: lines[0] ? lines[0].number : 1,
      endLine: lines.length > 0 ? lines[lines.length - 1]!.number : 1
    })
  }

  while (index < lines.length) {
    const line = lines[index]

    if (!line) {
      break
    }

    if (line.trimmed.length === 0 || line.trimmed.startsWith('//')) {
      index += 1
      continue
    }

    if (!line.trimmed.endsWith('{')) {
      topLevelLines.push(line)
      index += 1
      continue
    }

    const { kind, keyword } = parseBlockKind(line.trimmed.slice(0, -1).trim())
    const body: PgmlLineInfo[] = []
    let depth = 1
    let blockEndLine = line
    let bodyIndex = index + 1
    let sourceDelimiter: string | null = null
    let sourceStartLine: PgmlLineInfo | null = null

    while (bodyIndex < lines.length && depth > 0) {
      const bodyLine = lines[bodyIndex]

      if (!bodyLine) {
        break
      }

      if (sourceDelimiter) {
        body.push(bodyLine)

        if (bodyLine.text.includes(sourceDelimiter)) {
          contexts.push({
            kind: 'source',
            blockKind: kind,
            from: sourceStartLine ? sourceStartLine.from : bodyLine.from,
            to: bodyLine.to,
            startLine: sourceStartLine ? sourceStartLine.number : bodyLine.number,
            endLine: bodyLine.number
          })
          sourceDelimiter = null
          sourceStartLine = null
        }

        blockEndLine = bodyLine
        bodyIndex += 1
        continue
      }

      const detectedDelimiter = findSourceDelimiter(bodyLine.trimmed)

      if (detectedDelimiter !== null && detectedDelimiter.length > 0) {
        sourceDelimiter = detectedDelimiter
        sourceStartLine = bodyLine
      }

      if (bodyLine.trimmed.endsWith('{')) {
        depth += 1
      }

      if (bodyLine.trimmed === '}') {
        depth -= 1

        if (depth === 0) {
          blockEndLine = bodyLine
          bodyIndex += 1
          break
        }
      }

      if (depth > 0) {
        body.push(bodyLine)
      }

      blockEndLine = bodyLine
      bodyIndex += 1
    }

    if (sourceDelimiter) {
      createDiagnostic(
        diagnostics,
        'pgml/source-unclosed',
        'error',
        'Dollar-quoted source block is not closed.',
        sourceStartLine ? sourceStartLine : line
      )
    }

    if (depth !== 0) {
      createDiagnostic(
        diagnostics,
        'pgml/block-unclosed',
        'error',
        'Block is not closed with a matching `}`.',
        line
      )
    }

    const block: PgmlRawBlock = {
      kind,
      keyword,
      header: line.trimmed.slice(0, -1).trim(),
      headerLine: line,
      body,
      startLine: line.number,
      endLine: blockEndLine.number,
      from: line.from,
      to: blockEndLine.to
    }

    blocks.push(block)
    index = bodyIndex
  }

  return {
    blocks,
    topLevelLines
  }
}

const collectNestedBlock = (
  lines: PgmlLineInfo[],
  startIndex: number,
  diagnostics: PgmlLanguageDiagnostic[]
) => {
  const body: PgmlLineInfo[] = []
  const startLine = lines[startIndex]
  let depth = 1
  let index = startIndex + 1
  let endLine = startLine ? startLine.number : 1

  while (index < lines.length && depth > 0) {
    const line = lines[index]

    if (!line) {
      break
    }

    if (line.trimmed.endsWith('{')) {
      depth += 1
    }

    if (line.trimmed === '}') {
      depth -= 1

      if (depth === 0) {
        endLine = line.number
        index += 1
        break
      }
    }

    if (depth > 0) {
      body.push(line)
    }

    endLine = line.number
    index += 1
  }

  if (depth !== 0 && startLine) {
    createDiagnostic(
      diagnostics,
      'pgml/nested-block-unclosed',
      'error',
      'Nested block is not closed with a matching `}`.',
      startLine
    )
  }

  return {
    body,
    endLine,
    nextIndex: index
  }
}

const createNamedRange = (name: string, line: PgmlLineInfo, rawValue?: string): PgmlNamedRange => {
  const searchValue = rawValue ? rawValue : name
  const start = line.text.indexOf(searchValue)
  const from = start >= 0 ? line.from + start : line.from

  return {
    name,
    from,
    to: from + searchValue.length,
    line: line.number
  }
}

const normalizeGroupEntry = (value: string) => {
  const cleanedValue = cleanName(value.replace(/,$/, ''))

  if (!cleanedValue.includes('.')) {
    return cleanedValue
  }

  return cleanedValue
}

const parseMetadataEntry = (trimmedLine: string) => {
  const match = trimmedLine.match(/^([^:]+):\s*(.+)$/)

  if (!match) {
    return null
  }

  return {
    key: cleanName(match[1] || ''),
    value: cleanText(match[2] || '')
  }
}

const getVersionIdFromHeader = (header: string) => {
  const match = header.match(/^Version\s+([A-Za-z][\w-]*)$/)

  return match?.[1] || null
}

const getVersionSetNameFromHeader = (header: string) => {
  const match = header.match(/^VersionSet\s+(.+)$/)

  if (!match) {
    return null
  }

  return cleanText(match[1] || '')
}

const getComparisonNameFromHeader = (header: string) => {
  const match = header.match(/^Comparison\s+(.+)$/)

  if (!match) {
    return null
  }

  return cleanText(match[1] || '')
}

const getViewNameFromHeader = (header: string) => {
  const match = header.match(/^View\s+(.+)$/)

  if (!match) {
    return null
  }

  return cleanText(match[1] || '')
}

const collectTableBody = (
  block: PgmlRawBlock,
  diagnostics: PgmlLanguageDiagnostic[],
  tables: PgmlTableSymbol[],
  references: PgmlReferenceSymbol[]
) => {
  const headerMatch = block.header.match(/^Table\s+([^\s]+)(?:\s+in\s+(.+))?$/)

  if (!headerMatch) {
    createDiagnostic(
      diagnostics,
      'pgml/table-header',
      'error',
      'Table header must use `Table name {` or `Table name in Group {`.',
      block.headerLine
    )
    return
  }

  const rawTableName = headerMatch[1] ? headerMatch[1].trim() : ''
  const rawGroupName = headerMatch[2] ? cleanName(headerMatch[2]) : null
  const parsedName = parseTableName(rawTableName)
  const fullName = `${parsedName.schema}.${parsedName.table}`
  const tableRange = createNamedRange(fullName, block.headerLine, rawTableName)
  const tableSymbol: PgmlTableSymbol = {
    ...tableRange,
    fullName,
    groupName: rawGroupName,
    columns: []
  }
  let index = 0

  while (index < block.body.length) {
    const line = block.body[index]

    if (!line) {
      break
    }

    if (line.trimmed.length === 0 || line.trimmed.startsWith('//')) {
      index += 1
      continue
    }

    if (line.trimmed.startsWith('Note:')) {
      index += 1
      continue
    }

    if (/^Indexes\s*\{$/i.test(line.trimmed)) {
      const nested = collectNestedBlock(block.body, index, diagnostics)

      nested.body.forEach((nestedLine) => {
        if (nestedLine.trimmed.length === 0 || nestedLine.trimmed.startsWith('//')) {
          return
        }

        if (!parseDbmlCompatibleIndexDefinition(nestedLine.trimmed)) {
          createDiagnostic(
            diagnostics,
            'pgml/table-index-entry',
            'error',
            'Index entries inside `Indexes {}` must use `(column_a, column_b) [name: ...]`.',
            nestedLine
          )
        }
      })

      index = nested.nextIndex
      continue
    }

    if (/^checks\s*\{$/i.test(line.trimmed)) {
      const nested = collectNestedBlock(block.body, index, diagnostics)

      collectDbmlCompatibleMultilineEntries(nested.body.map(entry => entry.text)).forEach((nestedEntry) => {
        const diagnosticLine = nested.body[nestedEntry.startIndex]

        if (!diagnosticLine) {
          return
        }

        if (!parseDbmlCompatibleCheckDefinition(nestedEntry.text)) {
          createDiagnostic(
            diagnostics,
            'pgml/table-check-entry',
            'error',
            'Check entries inside `checks {}` must use `` `expression` [name: ...] ``.',
            diagnosticLine
          )
        }
      })

      index = nested.nextIndex
      continue
    }

    const indexMatch = line.trimmed.match(/^Index\s+([^\s(]+)\s*\(([^)]*)\)(?:\s*\[([^\]]+)\])?$/)

    if (indexMatch) {
      index += 1
      continue
    }

    const constraintMatch = line.trimmed.match(/^Constraint\s+([^:]+):\s*(.+)$/)

    if (constraintMatch) {
      index += 1
      continue
    }

    const columnMatch = line.trimmed.match(/^([^\s]+)\s+([^[\]]+?)(?:\s+\[([^\]]+)\])?$/)

    if (!columnMatch) {
      createDiagnostic(
        diagnostics,
        'pgml/table-entry',
        'error',
        'Table entries must be columns, `Index`, `Indexes`, `Constraint`, `checks`, or `Note:` lines.',
        line
      )
      index += 1
      continue
    }

    const columnName = cleanName(columnMatch[1] || '')
    const columnRange = createNamedRange(columnName, line, columnMatch[1] || columnName)
    tableSymbol.columns.push({
      ...columnRange,
      tableName: fullName
    })

    const modifierGroup = columnMatch[3] ? columnMatch[3].trim() : ''

    if (modifierGroup.length > 0) {
      modifierGroup
        .split(',')
        .map(part => part.trim())
        .filter(part => part.length > 0)
        .forEach((modifier) => {
          if (!modifier.startsWith('ref:')) {
            return
          }

          const refMatch = modifier.match(/^ref:\s*([<>-])\s*(.+)$/)

          if (!refMatch) {
            createDiagnostic(
              diagnostics,
              'pgml/ref-inline-shape',
              'error',
              'Inline ref modifiers must use `ref: > schema.table.column`.',
              line
            )
            return
          }

          const relation = refMatch[1] as '>' | '<' | '-'
          const target = parseReferenceTarget(refMatch[2] || '')

          references.push({
            kind: 'inline',
            relation,
            fromTable: fullName,
            fromColumn: columnName,
            fromColumns: [columnName],
            toTable: `${target.schema}.${target.table}`,
            toColumn: target.column,
            toColumns: [target.column],
            from: line.from,
            to: line.to,
            line: line.number
          })
        })
    }

    index += 1
  }

  tables.push(tableSymbol)
}

const collectGroupBody = (
  block: PgmlRawBlock,
  diagnostics: PgmlLanguageDiagnostic[],
  groups: PgmlGroupSymbol[]
) => {
  const headerMatch = block.header.match(/^TableGroup\s+(.+)$/)

  if (!headerMatch) {
    createDiagnostic(
      diagnostics,
      'pgml/group-header',
      'error',
      'TableGroup header must use `TableGroup Name {`.',
      block.headerLine
    )
    return
  }

  const groupName = cleanName(headerMatch[1] || '')
  const groupEntries: PgmlGroupEntry[] = []

  block.body.forEach((line) => {
    if (line.trimmed.length === 0 || line.trimmed.startsWith('//')) {
      return
    }

    if (line.trimmed.startsWith('Note:')) {
      return
    }

    if (line.trimmed.startsWith('tables:')) {
      const listMatch = line.trimmed.match(/^tables:\s*\[(.*)\]$/)

      if (!listMatch) {
        createDiagnostic(
          diagnostics,
          'pgml/group-tables-shape',
          'error',
          'Group table lists must use `tables: [a, b, c]`.',
          line
        )
        return
      }

      const rawEntries = (listMatch[1] || '')
        .split(',')
        .map(entry => normalizeGroupEntry(entry))
        .filter(entry => entry.length > 0)

      rawEntries.forEach((tableName) => {
        groupEntries.push({
          tableName,
          from: line.from,
          to: line.to,
          line: line.number
        })
      })
      return
    }

    if (!line.trimmed.includes(':')) {
      const tableName = normalizeGroupEntry(line.trimmed)

      groupEntries.push({
        tableName,
        from: line.from,
        to: line.to,
        line: line.number
      })
      return
    }

    createDiagnostic(
      diagnostics,
      'pgml/group-entry',
      'error',
      'Group entries must be table names, a `tables:` list, or `Note:`.',
      line
    )
  })

  groups.push({
    ...createNamedRange(groupName, block.headerLine, headerMatch[1] || groupName),
    entries: groupEntries
  })
}

const collectCustomTypeBody = (
  block: PgmlRawBlock,
  diagnostics: PgmlLanguageDiagnostic[],
  customTypes: PgmlCustomTypeSymbol[]
) => {
  const headerMatch = block.header.match(/^(Enum|Domain|Composite)\s+(.+)$/)

  if (!headerMatch) {
    createDiagnostic(
      diagnostics,
      'pgml/custom-type-header',
      'error',
      'Custom type headers must use `Enum`, `Domain`, or `Composite`.',
      block.headerLine
    )
    return
  }

  const kind = headerMatch[1] as 'Enum' | 'Domain' | 'Composite'
  const name = cleanName(headerMatch[2] || '')

  customTypes.push({
    ...createNamedRange(name, block.headerLine, headerMatch[2] || name),
    kind
  })
}

const collectRoutineSymbol = (
  block: PgmlRawBlock,
  keyword: 'Function' | 'Procedure',
  routines: PgmlNamedRange[]
) => {
  const headerMatch = block.header.match(new RegExp(`^${keyword}\\s+(.+)$`))

  if (!headerMatch) {
    return
  }

  const signature = cleanName(headerMatch[1] || '')
  const name = cleanName(signature.split('(')[0] || '')

  if (name.length === 0) {
    return
  }

  routines.push(createNamedRange(name, block.headerLine, headerMatch[1] || name))
}

const collectTriggerSymbol = (block: PgmlRawBlock, triggers: PgmlNamedRange[]) => {
  const headerMatch = block.header.match(/^Trigger\s+([^\s]+)(?:\s+on\s+([^\s]+))?$/)

  if (!headerMatch) {
    return
  }

  const name = cleanName(headerMatch[1] || '')

  if (name.length === 0) {
    return
  }

  triggers.push(createNamedRange(name, block.headerLine, headerMatch[1] || name))
}

const collectTopLevelReference = (
  line: PgmlLineInfo,
  diagnostics: PgmlLanguageDiagnostic[],
  references: PgmlReferenceSymbol[]
) => {
  const declaration = parsePgmlCompatibleReference(line.trimmed)

  if (!declaration) {
    createDiagnostic(
      diagnostics,
      'pgml/ref-top-level',
      'error',
      'Top-level refs must use `Ref: table.column > table.column` or `Ref name: table.(column_a, column_b) > table.(column_a, column_b)`.',
      line
    )
    return
  }

  const fromTarget = parseTableName(declaration.fromTable)
  const toTarget = parseTableName(declaration.toTable)
  const fromColumns = declaration.fromColumns.map(column => cleanName(column))
  const toColumns = declaration.toColumns.map(column => cleanName(column))

  references.push({
    kind: 'top-level',
    relation: declaration.relation,
    fromTable: `${fromTarget.schema}.${fromTarget.table}`,
    fromColumn: fromColumns[0] || '',
    fromColumns,
    toTable: `${toTarget.schema}.${toTarget.table}`,
    toColumn: toColumns[0] || '',
    toColumns,
    from: line.from,
    to: line.to,
    line: line.number
  })
}

const collectExecutableBody = (
  block: PgmlRawBlock,
  diagnostics: PgmlLanguageDiagnostic[],
  contexts: PgmlContextRange[]
) => {
  let index = 0

  while (index < block.body.length) {
    const line = block.body[index]

    if (!line) {
      break
    }

    if (line.trimmed.length === 0 || line.trimmed.startsWith('//')) {
      index += 1
      continue
    }

    if (line.trimmed === 'docs {' || line.trimmed.startsWith('docs {')) {
      const nested = collectNestedBlock(block.body, index, diagnostics)

      contexts.push({
        kind: 'docs',
        blockKind: block.kind,
        from: line.from,
        to: nested.body.length > 0 ? nested.body[nested.body.length - 1]!.to : line.to,
        startLine: line.number,
        endLine: nested.endLine
      })

      nested.body.forEach((nestedLine) => {
        if (nestedLine.trimmed.length === 0 || nestedLine.trimmed.startsWith('//')) {
          return
        }

        if (!parseMetadataEntry(nestedLine.trimmed)) {
          createDiagnostic(
            diagnostics,
            'pgml/docs-entry',
            'error',
            'Docs entries must use `key: value` syntax.',
            nestedLine
          )
        }
      })

      index = nested.nextIndex
      continue
    }

    if (line.trimmed === 'affects {' || line.trimmed.startsWith('affects {')) {
      const nested = collectNestedBlock(block.body, index, diagnostics)

      contexts.push({
        kind: 'affects',
        blockKind: block.kind,
        from: line.from,
        to: nested.body.length > 0 ? nested.body[nested.body.length - 1]!.to : line.to,
        startLine: line.number,
        endLine: nested.endLine
      })

      nested.body.forEach((nestedLine) => {
        if (nestedLine.trimmed.length === 0 || nestedLine.trimmed.startsWith('//')) {
          return
        }

        if (!parseMetadataEntry(nestedLine.trimmed)) {
          createDiagnostic(
            diagnostics,
            'pgml/affects-entry',
            'error',
            'Affects entries must use `key: value` syntax.',
            nestedLine
          )
        }
      })

      index = nested.nextIndex
      continue
    }

    if (line.trimmed.startsWith('source:') || line.trimmed.startsWith('definition:')) {
      const detectedDelimiter = findSourceDelimiter(line.trimmed)

      if (detectedDelimiter === null) {
        createDiagnostic(
          diagnostics,
          'pgml/source-shape',
          'error',
          'Source blocks must use a dollar-quoted delimiter.',
          line
        )
      }

      index += 1

      if (detectedDelimiter === null || detectedDelimiter.length === 0) {
        continue
      }

      while (index < block.body.length) {
        const sourceLine = block.body[index]

        if (!sourceLine) {
          break
        }

        if (sourceLine.text.includes(detectedDelimiter)) {
          break
        }

        index += 1
      }

      index += 1
      continue
    }

    if (!parseMetadataEntry(line.trimmed)) {
      createDiagnostic(
        diagnostics,
        'pgml/executable-entry',
        'error',
        'Executable blocks may contain metadata lines, `docs`, `affects`, or `source`.',
        line
      )
    }

    index += 1
  }
}

const collectPropertiesBody = (
  block: PgmlRawBlock,
  diagnostics: PgmlLanguageDiagnostic[],
  propertyTargets: PgmlPropertyTarget[]
) => {
  const headerMatch = block.header.match(/^Properties\s+(.+)$/)

  if (!headerMatch) {
    createDiagnostic(
      diagnostics,
      'pgml/properties-header',
      'error',
      'Properties blocks must use `Properties "target" {`.',
      block.headerLine
    )
    return
  }

  const rawTarget = headerMatch[1] || ''
  const targetId = cleanName(rawTarget)

  propertyTargets.push({
    ...createNamedRange(targetId, block.headerLine, rawTarget),
    id: targetId
  })

  block.body.forEach((line) => {
    if (line.trimmed.length === 0 || line.trimmed.startsWith('//')) {
      return
    }

    const entry = parseMetadataEntry(line.trimmed)

    if (!entry) {
      createDiagnostic(
        diagnostics,
        'pgml/properties-entry',
        'error',
        'Properties entries must use `key: value` syntax.',
        line
      )
      return
    }

    const normalizedKey = lower(entry.key).replaceAll(/[^\w]+/g, '_')

    if (!propertyKeySet.has(normalizedKey)) {
      createDiagnostic(
        diagnostics,
        'pgml/properties-key',
        'error',
        'Unsupported properties key.',
        line
      )
      return
    }

    if (booleanPropertyKeys.has(normalizedKey)) {
      if (entry.value !== 'true' && entry.value !== 'false') {
        createDiagnostic(
          diagnostics,
          'pgml/properties-boolean',
          'error',
          'Boolean properties must use `true` or `false`.',
          line
        )
      }
      return
    }

    if (normalizedKey === 'color') {
      if (!validColorPattern.test(entry.value)) {
        createDiagnostic(
          diagnostics,
          'pgml/properties-color',
          'error',
          'Color properties must use a 3- or 6-digit hex value.',
          line
        )
      }
      return
    }

    if (numericPropertyKeys.has(normalizedKey) && !Number.isFinite(Number.parseFloat(entry.value))) {
      createDiagnostic(
        diagnostics,
        'pgml/properties-number',
        'error',
        'Numeric properties must use a valid number.',
        line
      )
    }
  })
}

const detectDuplicates = <T>(values: T[], getKey: (value: T) => string) => {
  const entries = new Map<string, T[]>()

  values.forEach((value) => {
    const key = getKey(value)

    if (!entries.has(key)) {
      entries.set(key, [])
    }

    entries.get(key)!.push(value)
  })

  const duplicates: Array<DuplicateEntry<T>> = []

  entries.forEach((entryValues, key) => {
    if (entryValues.length > 1) {
      duplicates.push({
        key,
        values: entryValues
      })
    }
  })

  return duplicates
}

const createPropertyTargets = (
  groups: PgmlGroupSymbol[],
  tables: PgmlTableSymbol[],
  customTypes: PgmlCustomTypeSymbol[],
  functions: PgmlNamedRange[],
  procedures: PgmlNamedRange[],
  triggers: PgmlNamedRange[],
  sequences: PgmlNamedRange[]
) => {
  const propertyTargets: Set<string> = new Set()

  groups.forEach((group) => {
    propertyTargets.add(`group:${group.name}`)
  })

  tables.forEach((table) => {
    propertyTargets.add(table.fullName)
  })

  customTypes.forEach((customType) => {
    propertyTargets.add(`custom-type:${customType.kind}:${customType.name}`)
  })

  functions.forEach((pgFunction) => {
    propertyTargets.add(`function:${pgFunction.name}`)
  })

  procedures.forEach((procedure) => {
    propertyTargets.add(`procedure:${procedure.name}`)
  })

  triggers.forEach((trigger) => {
    propertyTargets.add(`trigger:${trigger.name}`)
  })

  sequences.forEach((sequence) => {
    propertyTargets.add(`sequence:${sequence.name}`)
  })

  return propertyTargets
}

const runSemanticDiagnostics = (analysis: PgmlDocumentAnalysis) => {
  const { diagnostics, tables, groups, customTypes, functions, procedures, triggers, sequences, references, propertyTargets } = analysis
  const tableMap = new Map<string, PgmlTableSymbol>()
  const groupNames = new Set(groups.map(group => group.name))
  const validPropertyTargets = createPropertyTargets(groups, tables, customTypes, functions, procedures, triggers, sequences)

  tables.forEach((table) => {
    tableMap.set(lower(table.fullName), table)
  })

  detectDuplicates(tables, table => lower(table.fullName)).forEach((entry) => {
    const duplicateLines = getDuplicateLineNumbers(entry.values)

    entry.values.slice(1).forEach((table) => {
      diagnostics.push({
        code: 'pgml/table-duplicate',
        severity: 'error',
        message: `Duplicate table definition for \`${table.fullName}\`. ${formatDuplicateLineSummary(duplicateLines)}`,
        from: table.from,
        to: table.to,
        line: table.line,
        lines: duplicateLines
      })
    })
  })

  detectDuplicates(groups, group => lower(group.name)).forEach((entry) => {
    const duplicateLines = getDuplicateLineNumbers(entry.values)

    entry.values.slice(1).forEach((group) => {
      diagnostics.push({
        code: 'pgml/group-duplicate',
        severity: 'error',
        message: `Duplicate group definition for \`${group.name}\`. ${formatDuplicateLineSummary(duplicateLines)}`,
        from: group.from,
        to: group.to,
        line: group.line,
        lines: duplicateLines
      })
    })
  })

  detectDuplicates(customTypes, customType => `${lower(customType.kind)}:${lower(customType.name)}`).forEach((entry) => {
    const duplicateLines = getDuplicateLineNumbers(entry.values)

    entry.values.slice(1).forEach((customType) => {
      diagnostics.push({
        code: 'pgml/custom-type-duplicate',
        severity: 'warning',
        message: `Duplicate ${customType.kind.toLowerCase()} definition for \`${customType.name}\`. ${formatDuplicateLineSummary(duplicateLines)}`,
        from: customType.from,
        to: customType.to,
        line: customType.line,
        lines: duplicateLines
      })
    })
  })

  tables.forEach((table) => {
    detectDuplicates(table.columns, column => lower(column.name)).forEach((entry) => {
      const duplicateLines = getDuplicateLineNumbers(entry.values)

      entry.values.slice(1).forEach((column) => {
        diagnostics.push({
          code: 'pgml/column-duplicate',
          severity: 'error',
          message: `Duplicate column \`${column.name}\` in table \`${table.fullName}\`. ${formatDuplicateLineSummary(duplicateLines)}`,
          from: column.from,
          to: column.to,
          line: column.line,
          lines: duplicateLines
        })
      })
    })

    if (table.groupName && !groupNames.has(table.groupName)) {
      diagnostics.push({
        code: 'pgml/table-group-missing',
        severity: 'error',
        message: `Table \`${table.fullName}\` references missing group \`${table.groupName}\`.`,
        from: table.from,
        to: table.to,
        line: table.line
      })
    }
  })

  const tableGroupAssignments = new Map<string, Set<string>>()

  groups.forEach((group) => {
    group.entries.forEach((entry) => {
      const normalizedEntry = lower(entry.tableName.includes('.') ? entry.tableName : `public.${entry.tableName}`)

      if (!tableGroupAssignments.has(normalizedEntry)) {
        tableGroupAssignments.set(normalizedEntry, new Set())
      }

      tableGroupAssignments.get(normalizedEntry)!.add(group.name)

      if (!tableMap.has(normalizedEntry)) {
        diagnostics.push({
          code: 'pgml/group-entry-missing-table',
          severity: 'warning',
          message: `Group \`${group.name}\` references missing table \`${entry.tableName}\`.`,
          from: entry.from,
          to: entry.to,
          line: entry.line
        })
      }
    })
  })

  tables.forEach((table) => {
    if (!table.groupName) {
      return
    }

    const key = lower(table.fullName)

    if (!tableGroupAssignments.has(key)) {
      tableGroupAssignments.set(key, new Set())
    }

    tableGroupAssignments.get(key)!.add(table.groupName)
  })

  tableGroupAssignments.forEach((groupSet, tableName) => {
    if (groupSet.size <= 1) {
      return
    }

    const matchingTable = tableMap.get(tableName)

    diagnostics.push({
      code: 'pgml/group-assignment-conflict',
      severity: 'warning',
      message: `Table \`${tableName}\` is assigned to multiple groups: ${Array.from(groupSet).join(', ')}.`,
      from: matchingTable ? matchingTable.from : 0,
      to: matchingTable ? matchingTable.to : 1,
      line: matchingTable ? matchingTable.line : 1
    })
  })

  references.forEach((reference) => {
    const fromTable = tableMap.get(lower(reference.fromTable))
    const toTable = tableMap.get(lower(reference.toTable))
    const fromColumns = reference.fromColumns && reference.fromColumns.length > 0
      ? reference.fromColumns
      : [reference.fromColumn]
    const toColumns = reference.toColumns && reference.toColumns.length > 0
      ? reference.toColumns
      : [reference.toColumn]

    if (!fromTable) {
      diagnostics.push({
        code: 'pgml/ref-missing-from-table',
        severity: 'error',
        message: `Reference source table \`${reference.fromTable}\` does not exist.`,
        from: reference.from,
        to: reference.to,
        line: reference.line
      })
      return
    }

    if (!toTable) {
      diagnostics.push({
        code: 'pgml/ref-missing-to-table',
        severity: 'error',
        message: `Reference target table \`${reference.toTable}\` does not exist.`,
        from: reference.from,
        to: reference.to,
        line: reference.line
      })
      return
    }

    const missingFromColumns = fromColumns.filter((columnName) => {
      return !fromTable.columns.some(column => lower(column.name) === lower(columnName))
    })

    if (missingFromColumns.length > 0) {
      const missingColumnLabel = missingFromColumns.map(columnName => `\`${columnName}\``).join(', ')

      diagnostics.push({
        code: 'pgml/ref-missing-from-column',
        severity: 'error',
        message: `Reference source column${missingFromColumns.length === 1 ? '' : 's'} ${missingColumnLabel} ${missingFromColumns.length === 1 ? 'does' : 'do'} not exist on \`${reference.fromTable}\`.`,
        from: reference.from,
        to: reference.to,
        line: reference.line
      })
    }

    const missingToColumns = toColumns.filter((columnName) => {
      return !toTable.columns.some(column => lower(column.name) === lower(columnName))
    })

    if (missingToColumns.length > 0) {
      const missingColumnLabel = missingToColumns.map(columnName => `\`${columnName}\``).join(', ')

      diagnostics.push({
        code: 'pgml/ref-missing-to-column',
        severity: 'error',
        message: `Reference target column${missingToColumns.length === 1 ? '' : 's'} ${missingColumnLabel} ${missingToColumns.length === 1 ? 'does' : 'do'} not exist on \`${reference.toTable}\`.`,
        from: reference.from,
        to: reference.to,
        line: reference.line
      })
    }
  })

  detectDuplicates(
    references,
    reference => [
      lower(reference.fromTable),
      (reference.fromColumns && reference.fromColumns.length > 0 ? reference.fromColumns : [reference.fromColumn]).map(column => lower(column)).join(','),
      reference.relation,
      lower(reference.toTable),
      (reference.toColumns && reference.toColumns.length > 0 ? reference.toColumns : [reference.toColumn]).map(column => lower(column)).join(',')
    ].join(':')
  ).forEach((entry) => {
    const duplicateLines = getDuplicateLineNumbers(entry.values)

    entry.values.slice(1).forEach((reference) => {
      diagnostics.push({
        code: 'pgml/ref-duplicate',
        severity: 'warning',
        message: `Duplicate relationship declaration. ${formatDuplicateLineSummary(duplicateLines)}`,
        from: reference.from,
        to: reference.to,
        line: reference.line,
        lines: duplicateLines
      })
    })
  })

  propertyTargets.forEach((propertyTarget) => {
    if (validPropertyTargets.has(propertyTarget.id)) {
      return
    }

    diagnostics.push({
      code: 'pgml/properties-target-missing',
      severity: 'error',
      message: `Properties target \`${propertyTarget.id}\` does not match a visible PGML entity.`,
      from: propertyTarget.from,
      to: propertyTarget.to,
      line: propertyTarget.line
    })
  })
}

const buildContexts = (blocks: PgmlRawBlock[], contexts: PgmlContextRange[]) => {
  blocks.forEach((block) => {
    if (block.kind === 'VersionSet') {
      contexts.push({
        kind: 'version-set',
        blockKind: block.kind,
        from: block.from,
        to: block.to,
        startLine: block.startLine,
        endLine: block.endLine
      })
      return
    }

    if (block.kind === 'SchemaMetadata') {
      contexts.push({
        kind: 'schema-metadata',
        blockKind: block.kind,
        from: block.from,
        to: block.to,
        startLine: block.startLine,
        endLine: block.endLine
      })
      return
    }

    if (block.kind === 'Workspace') {
      contexts.push({
        kind: 'workspace',
        blockKind: block.kind,
        from: block.from,
        to: block.to,
        startLine: block.startLine,
        endLine: block.endLine
      })
      return
    }

    if (block.kind === 'Comparison') {
      contexts.push({
        kind: 'comparison',
        blockKind: block.kind,
        from: block.from,
        to: block.to,
        startLine: block.startLine,
        endLine: block.endLine
      })
      return
    }

    if (block.kind === 'Version') {
      contexts.push({
        kind: 'version',
        blockKind: block.kind,
        from: block.from,
        to: block.to,
        startLine: block.startLine,
        endLine: block.endLine
      })
      return
    }

    if (block.kind === 'Snapshot') {
      contexts.push({
        kind: 'snapshot',
        blockKind: block.kind,
        from: block.from,
        to: block.to,
        startLine: block.startLine,
        endLine: block.endLine
      })
      return
    }

    if (block.kind === 'CompareExclusions') {
      contexts.push({
        kind: 'compare-exclusions',
        blockKind: block.kind,
        from: block.from,
        to: block.to,
        startLine: block.startLine,
        endLine: block.endLine
      })
      return
    }

    if (block.kind === 'View') {
      contexts.push({
        kind: 'view',
        blockKind: block.kind,
        from: block.from,
        to: block.to,
        startLine: block.startLine,
        endLine: block.endLine
      })
      return
    }

    if (block.kind === 'Table') {
      contexts.push({
        kind: 'table',
        blockKind: block.kind,
        from: block.from,
        to: block.to,
        startLine: block.startLine,
        endLine: block.endLine
      })
      return
    }

    if (block.kind === 'TableGroup') {
      contexts.push({
        kind: 'group',
        blockKind: block.kind,
        from: block.from,
        to: block.to,
        startLine: block.startLine,
        endLine: block.endLine
      })
      return
    }

    if (block.kind === 'Enum' || block.kind === 'Domain' || block.kind === 'Composite') {
      contexts.push({
        kind: 'custom-type',
        blockKind: block.kind,
        from: block.from,
        to: block.to,
        startLine: block.startLine,
        endLine: block.endLine
      })
      return
    }

    if (block.kind === 'Function' || block.kind === 'Procedure') {
      contexts.push({
        kind: 'routine',
        blockKind: block.kind,
        from: block.from,
        to: block.to,
        startLine: block.startLine,
        endLine: block.endLine
      })
      return
    }

    if (block.kind === 'Trigger') {
      contexts.push({
        kind: 'trigger',
        blockKind: block.kind,
        from: block.from,
        to: block.to,
        startLine: block.startLine,
        endLine: block.endLine
      })
      return
    }

    if (block.kind === 'Sequence') {
      contexts.push({
        kind: 'sequence',
        blockKind: block.kind,
        from: block.from,
        to: block.to,
        startLine: block.startLine,
        endLine: block.endLine
      })
      return
    }

    if (block.kind === 'Properties') {
      contexts.push({
        kind: 'properties',
        blockKind: block.kind,
        from: block.from,
        to: block.to,
        startLine: block.startLine,
        endLine: block.endLine
      })
    }
  })
}

const analyzeSnapshotBlocks = (
  blocks: PgmlRawBlock[],
  topLevelLines: PgmlLineInfo[],
  diagnostics: PgmlLanguageDiagnostic[],
  contexts: PgmlContextRange[],
  analysisState: PgmlAnalysisState
) => {
  // Snapshot bodies reuse the legacy schema grammar even when the enclosing
  // document is versioned, so the editor keeps one semantic pipeline for
  // tables, refs, routines, and stored layout properties.
  buildContexts(blocks, contexts)

  topLevelLines.forEach((line) => {
    if (/^Ref(?:\s+[^:]+)?:/.test(line.trimmed)) {
      collectTopLevelReference(line, diagnostics, analysisState.references)
      return
    }

    createDiagnostic(
      diagnostics,
      'pgml/top-level-entry',
      'error',
      'Unsupported top-level PGML statement.',
      line
    )
  })

  blocks.forEach((block) => {
    if (block.kind === 'Unknown') {
      createDiagnostic(
        diagnostics,
        'pgml/block-kind',
        'error',
        'Unsupported block header.',
        block.headerLine
      )
      return
    }

    if (
      block.kind === 'Column'
      || block.kind === 'SchemaMetadata'
      || block.kind === 'VersionSet'
      || block.kind === 'Workspace'
      || block.kind === 'Version'
      || block.kind === 'Snapshot'
      || block.kind === 'View'
    ) {
      createDiagnostic(
        diagnostics,
        'pgml/snapshot-block-kind',
        'error',
        'Snapshots only allow schema blocks, refs, and properties.',
        block.headerLine
      )
      return
    }

    if (block.kind === 'Table') {
      collectTableBody(block, diagnostics, analysisState.tables, analysisState.references)
      return
    }

    if (block.kind === 'TableGroup') {
      collectGroupBody(block, diagnostics, analysisState.groups)
      return
    }

    if (block.kind === 'Enum' || block.kind === 'Domain' || block.kind === 'Composite') {
      collectCustomTypeBody(block, diagnostics, analysisState.customTypes)
      return
    }

    if (block.kind === 'Function' || block.kind === 'Procedure' || block.kind === 'Trigger') {
      collectExecutableBody(block, diagnostics, contexts)

      if (block.kind === 'Function') {
        collectRoutineSymbol(block, 'Function', analysisState.functions)
        return
      }

      if (block.kind === 'Procedure') {
        collectRoutineSymbol(block, 'Procedure', analysisState.procedures)
        return
      }

      if (block.kind === 'Trigger') {
        const triggerMatch = block.header.match(/^Trigger\s+([^\s]+)(?:\s+on\s+([^\s]+))?$/)

        if (!triggerMatch) {
          createDiagnostic(
            diagnostics,
            'pgml/trigger-header',
            'error',
            'Trigger headers must use `Trigger name on schema.table {` or `Trigger name {`.',
            block.headerLine
          )
        } else {
          collectTriggerSymbol(block, analysisState.triggers)
        }
      }

      return
    }

    if (block.kind === 'Sequence') {
      const sequenceMatch = block.header.match(/^Sequence\s+(.+)$/)

      if (!sequenceMatch) {
        createDiagnostic(
          diagnostics,
          'pgml/sequence-header',
          'error',
          'Sequence headers must use `Sequence name {`.',
          block.headerLine
        )
      } else {
        const sequenceName = cleanName(sequenceMatch[1] || '')

        analysisState.sequences.push(createNamedRange(sequenceName, block.headerLine, sequenceMatch[1] || sequenceName))
      }

      collectExecutableBody(block, diagnostics, contexts)
      return
    }

    if (block.kind === 'Properties') {
      collectPropertiesBody(block, diagnostics, analysisState.propertyTargets)
    }
  })
}

const analyzeNestedSnapshotBlock = (
  block: PgmlRawBlock,
  diagnostics: PgmlLanguageDiagnostic[],
  contexts: PgmlContextRange[],
  analysisState: PgmlAnalysisState,
  containerLabel: string
) => {
  if (block.kind !== 'Snapshot') {
    createDiagnostic(
      diagnostics,
      'pgml/snapshot-header',
      'error',
      `${containerLabel} requires a Snapshot block.`,
      block.headerLine
    )
    return
  }

  const nestedSnapshot = collectRawBlocks(block.body, diagnostics, contexts, {
    topLevelContextKind: null
  })

  analyzeSnapshotBlocks(
    nestedSnapshot.blocks,
    nestedSnapshot.topLevelLines,
    diagnostics,
    contexts,
    analysisState
  )
}

const collectNestedHistoryBlocks = (
  block: PgmlRawBlock,
  diagnostics: PgmlLanguageDiagnostic[],
  contexts: PgmlContextRange[]
) => {
  const nested = collectRawBlocks(block.body, diagnostics, contexts, {
    topLevelContextKind: null
  })

  buildContexts(nested.blocks, contexts)

  return nested
}

const validateMetadataOnlyLines = (
  metadataLines: PgmlParsedMetadataLine[],
  diagnostics: PgmlLanguageDiagnostic[],
  options: {
    allowedKeys: Set<string>
    entryCode: string
    entryMessage: string
    keyCode: string
    keyMessage: string
  }
) => {
  metadataLines.forEach(({ entry, line }) => {
    if (!entry) {
      createDiagnostic(
        diagnostics,
        options.entryCode,
        'error',
        options.entryMessage,
        line
      )
      return
    }

    if (!options.allowedKeys.has(normalizeMetadataKey(entry.key))) {
      createDiagnostic(
        diagnostics,
        options.keyCode,
        'error',
        options.keyMessage,
        line
      )
    }
  })
}

const collectParsedMetadataLines = (lines: PgmlLineInfo[]) => {
  return lines.map((line) => {
    return {
      entry: parseMetadataEntry(line.trimmed),
      line
    } satisfies PgmlParsedMetadataLine
  })
}

const analyzeSchemaMetadataBlock = (
  block: PgmlRawBlock,
  diagnostics: PgmlLanguageDiagnostic[],
  contexts: PgmlContextRange[]
) => {
  if (block.header !== 'SchemaMetadata') {
    createDiagnostic(
      diagnostics,
      'pgml/schema-metadata-header',
      'error',
      'SchemaMetadata blocks must use `SchemaMetadata {`.',
      block.headerLine
    )
    return
  }

  const nested = collectRawBlocks(block.body, diagnostics, contexts, {
    topLevelContextKind: null
  })

  nested.topLevelLines.forEach((line) => {
    createDiagnostic(
      diagnostics,
      'pgml/schema-metadata-entry',
      'error',
      'SchemaMetadata only allows nested Table and Column blocks.',
      line
    )
  })

  nested.blocks.forEach((nestedBlock) => {
    if (nestedBlock.kind !== 'Table' && nestedBlock.kind !== 'Column') {
      createDiagnostic(
        diagnostics,
        'pgml/schema-metadata-block-kind',
        'error',
        'SchemaMetadata only allows nested Table and Column blocks.',
        nestedBlock.headerLine
      )
      return
    }

    const headerPattern = nestedBlock.kind === 'Table'
      ? /^Table\s+(.+)$/
      : /^Column\s+(.+)$/

    if (!headerPattern.test(nestedBlock.header)) {
      createDiagnostic(
        diagnostics,
        'pgml/schema-metadata-target-header',
        'error',
        `${nestedBlock.kind} metadata headers must use \`${nestedBlock.kind} "target" {\`.`,
        nestedBlock.headerLine
      )
      return
    }

    nestedBlock.body.forEach((line) => {
      if (line.trimmed.length === 0 || line.trimmed.startsWith('//')) {
        return
      }

      if (!parseMetadataEntry(line.trimmed)) {
        createDiagnostic(
          diagnostics,
          'pgml/schema-metadata-target-entry',
          'error',
          `${nestedBlock.kind} metadata blocks only allow \`key: value\` entries.`,
          line
        )
      }
    })
  })
}

const analyzeViewBlock = (
  block: PgmlRawBlock,
  diagnostics: PgmlLanguageDiagnostic[],
  contexts: PgmlContextRange[],
  analysisState: PgmlAnalysisState,
  containerLabel: string
) => {
  const viewName = getViewNameFromHeader(block.header)

  if (!viewName || viewName.trim().length === 0) {
    createDiagnostic(
      diagnostics,
      'pgml/view-header',
      'error',
      `${containerLabel} view headers must use \`View "Name" {\`.`,
      block.headerLine
    )
    return
  }

  const nested = collectRawBlocks(block.body, diagnostics, contexts, {
    topLevelContextKind: null
  })
  const metadataLines = collectParsedMetadataLines(nested.topLevelLines)

  validateMetadataOnlyLines(metadataLines, diagnostics, {
    allowedKeys: viewMetadataKeys,
    entryCode: 'pgml/view-entry',
    entryMessage: 'View blocks only allow metadata entries and nested Properties blocks.',
    keyCode: 'pgml/view-key',
    keyMessage: 'View blocks only support `id`, `show_lines`, `snap_to_grid`, `show_execs`, and `show_fields` metadata.'
  })

  metadataLines.forEach(({ entry, line }) => {
    const normalizedKey = entry ? normalizeMetadataKey(entry.key) : null

    if (!entry || !normalizedKey || (
      normalizedKey !== 'show_lines'
      && normalizedKey !== 'lines'
      && normalizedKey !== 'snap_to_grid'
      && normalizedKey !== 'snap'
      && normalizedKey !== 'show_execs'
      && normalizedKey !== 'execs'
      && normalizedKey !== 'show_fields'
      && normalizedKey !== 'fields'
    )) {
      return
    }

    if (entry.value !== 'true' && entry.value !== 'false') {
      createDiagnostic(
        diagnostics,
        'pgml/view-boolean',
        'error',
        'View toggle metadata must use `true` or `false`.',
        line
      )
    }
  })

  nested.blocks.forEach((nestedBlock) => {
    if (nestedBlock.kind !== 'Properties') {
      createDiagnostic(
        diagnostics,
        'pgml/view-block-kind',
        'error',
        'View blocks only allow nested Properties blocks.',
        nestedBlock.headerLine
      )
      return
    }

    collectPropertiesBody(nestedBlock, diagnostics, analysisState.propertyTargets)
  })
}

const validateSnapshotOnlyChildren = (
  nestedBlocks: PgmlRawBlock[],
  diagnostics: PgmlLanguageDiagnostic[],
  options: {
    allowedSiblingKinds?: PgmlBlockKind[]
    fallbackLine: PgmlLineInfo
    missingCode: string
    missingMessage: string
    duplicateCode: string
    duplicateMessage: string
    invalidBlockCode: string
    invalidBlockMessage: string
  }
) => {
  const snapshotBlocks = nestedBlocks.filter(nestedBlock => nestedBlock.kind === 'Snapshot')
  const allowedSiblingKinds = new Set(options.allowedSiblingKinds || [])

  if (snapshotBlocks.length === 0) {
    const firstBlock = nestedBlocks[0]

    diagnostics.push({
      code: options.missingCode,
      severity: 'error',
      message: options.missingMessage,
      from: firstBlock ? firstBlock.from : options.fallbackLine.from,
      to: firstBlock ? firstBlock.to : Math.max(options.fallbackLine.from + 1, options.fallbackLine.to),
      line: firstBlock ? firstBlock.startLine : options.fallbackLine.number
    })
  }

  if (snapshotBlocks.length > 1) {
    snapshotBlocks.slice(1).forEach((snapshotBlock) => {
      createDiagnostic(
        diagnostics,
        options.duplicateCode,
        'error',
        options.duplicateMessage,
        snapshotBlock.headerLine
      )
    })
  }

  nestedBlocks.forEach((nestedBlock) => {
    if (nestedBlock.kind !== 'Snapshot' && !allowedSiblingKinds.has(nestedBlock.kind)) {
      createDiagnostic(
        diagnostics,
        options.invalidBlockCode,
        'error',
        options.invalidBlockMessage,
        nestedBlock.headerLine
      )
    }
  })

  return snapshotBlocks
}

const validateVersionSetChildren = (
  nestedBlocks: PgmlRawBlock[],
  diagnostics: PgmlLanguageDiagnostic[],
  fallbackLine: PgmlLineInfo
) => {
  const comparisonBlocks = nestedBlocks.filter(nestedBlock => nestedBlock.kind === 'Comparison')
  const schemaMetadataBlocks = nestedBlocks.filter(nestedBlock => nestedBlock.kind === 'SchemaMetadata')
  const workspaceBlocks = nestedBlocks.filter(nestedBlock => nestedBlock.kind === 'Workspace')
  const versionBlocks = nestedBlocks.filter(nestedBlock => nestedBlock.kind === 'Version')

  if (workspaceBlocks.length === 0) {
    createDiagnostic(
      diagnostics,
      'pgml/version-set-workspace-missing',
      'error',
      'VersionSet requires a Workspace block.',
      fallbackLine
    )
  }

  if (workspaceBlocks.length > 1) {
    workspaceBlocks.slice(1).forEach((workspaceBlock) => {
      createDiagnostic(
        diagnostics,
        'pgml/version-set-workspace-duplicate',
        'error',
        'VersionSet only allows one Workspace block.',
        workspaceBlock.headerLine
      )
    })
  }

  if (schemaMetadataBlocks.length > 1) {
    schemaMetadataBlocks.slice(1).forEach((schemaMetadataBlock) => {
      createDiagnostic(
        diagnostics,
        'pgml/version-set-schema-metadata-duplicate',
        'error',
        'VersionSet only allows one SchemaMetadata block.',
        schemaMetadataBlock.headerLine
      )
    })
  }

  nestedBlocks.forEach((nestedBlock) => {
    if (
      nestedBlock.kind !== 'SchemaMetadata'
      && nestedBlock.kind !== 'Workspace'
      && nestedBlock.kind !== 'Comparison'
      && nestedBlock.kind !== 'Version'
    ) {
      createDiagnostic(
        diagnostics,
        'pgml/version-set-block-kind',
        'error',
        'VersionSet only allows SchemaMetadata, Workspace, Comparison, and Version blocks.',
        nestedBlock.headerLine
      )
    }
  })

  return {
    comparisonBlocks,
    schemaMetadataBlock: schemaMetadataBlocks[0] || null,
    versionBlocks,
    workspaceBlock: workspaceBlocks[0] || null
  }
}

const analyzeCompareExclusionsBlock = (
  block: PgmlRawBlock,
  diagnostics: PgmlLanguageDiagnostic[],
  contexts: PgmlContextRange[],
  containerLabel: string
) => {
  if (block.header !== 'CompareExclusions') {
    createDiagnostic(
      diagnostics,
      'pgml/compare-exclusions-header',
      'error',
      `${containerLabel} CompareExclusions blocks must use \`CompareExclusions {\`.`,
      block.headerLine
    )
    return
  }

  const nested = collectRawBlocks(block.body, diagnostics, contexts, {
    topLevelContextKind: null
  })
  const metadataLines = collectParsedMetadataLines(nested.topLevelLines)

  validateMetadataOnlyLines(metadataLines, diagnostics, {
    allowedKeys: compareExclusionsMetadataKeys,
    entryCode: 'pgml/compare-exclusions-entry',
    entryMessage: 'CompareExclusions only allows metadata entries.',
    keyCode: 'pgml/compare-exclusions-key',
    keyMessage: 'CompareExclusions only supports `group`, `table`, `include_group`, and `include_table` metadata.'
  })

  nested.blocks.forEach((nestedBlock) => {
    createDiagnostic(
      diagnostics,
      'pgml/compare-exclusions-block-kind',
      'error',
      'CompareExclusions does not allow nested blocks.',
      nestedBlock.headerLine
    )
  })
}

const analyzeComparisonBlock = (
  block: PgmlRawBlock,
  diagnostics: PgmlLanguageDiagnostic[],
  contexts: PgmlContextRange[],
  _analysisState: PgmlAnalysisState
) => {
  const comparisonName = getComparisonNameFromHeader(block.header)

  if (!comparisonName || comparisonName.trim().length === 0) {
    createDiagnostic(
      diagnostics,
      'pgml/comparison-header',
      'error',
      'Comparison headers must use `Comparison "Name" {`.',
      block.headerLine
    )
    return
  }

  const nested = collectRawBlocks(block.body, diagnostics, contexts, {
    topLevelContextKind: null
  })
  const metadataLines = collectParsedMetadataLines(nested.topLevelLines)

  validateMetadataOnlyLines(metadataLines, diagnostics, {
    allowedKeys: comparisonMetadataKeys,
    entryCode: 'pgml/comparison-entry',
    entryMessage: 'Comparison only allows metadata entries plus nested CompareExclusions blocks.',
    keyCode: 'pgml/comparison-key',
    keyMessage: 'Comparison only supports `id`, `base`, and `target` metadata.'
  })

  nested.blocks.forEach((nestedBlock) => {
    if (nestedBlock.kind !== 'CompareExclusions') {
      createDiagnostic(
        diagnostics,
        'pgml/comparison-block-kind',
        'error',
        'Comparison only allows nested CompareExclusions blocks.',
        nestedBlock.headerLine
      )
    }
  })

  nested.blocks
    .filter(nestedBlock => nestedBlock.kind === 'CompareExclusions')
    .forEach(nestedBlock => analyzeCompareExclusionsBlock(nestedBlock, diagnostics, contexts, `Comparison ${comparisonName}`))
}

const analyzeWorkspaceBlock = (
  block: PgmlRawBlock,
  diagnostics: PgmlLanguageDiagnostic[],
  contexts: PgmlContextRange[],
  analysisState: PgmlAnalysisState
) => {
  if (block.header !== 'Workspace') {
    createDiagnostic(
      diagnostics,
      'pgml/workspace-header',
      'error',
      'Workspace blocks must use `Workspace {`.',
      block.headerLine
    )
    return
  }

  const nested = collectNestedHistoryBlocks(block, diagnostics, contexts)
  const metadataLines = collectParsedMetadataLines(nested.topLevelLines)

  validateMetadataOnlyLines(metadataLines, diagnostics, {
    allowedKeys: workspaceMetadataKeys,
    entryCode: 'pgml/workspace-entry',
    entryMessage: 'Workspace only allows metadata entries plus nested Snapshot, View, and CompareExclusions blocks.',
    keyCode: 'pgml/workspace-key',
    keyMessage: 'Workspace only supports `based_on`, `active_view`, and `updated_at` metadata.'
  })

  const snapshotBlocks = validateSnapshotOnlyChildren(nested.blocks, diagnostics, {
    allowedSiblingKinds: ['View', 'CompareExclusions'],
    fallbackLine: block.headerLine,
    missingCode: 'pgml/workspace-snapshot-missing',
    missingMessage: 'Workspace requires a Snapshot block.',
    duplicateCode: 'pgml/workspace-snapshot-duplicate',
    duplicateMessage: 'Workspace only allows one Snapshot block.',
    invalidBlockCode: 'pgml/workspace-block-kind',
    invalidBlockMessage: 'Workspace only allows nested Snapshot, View, and CompareExclusions blocks.'
  })

  if (snapshotBlocks[0]) {
    analyzeNestedSnapshotBlock(snapshotBlocks[0], diagnostics, contexts, analysisState, 'Workspace')
  }

  nested.blocks
    .filter(nestedBlock => nestedBlock.kind === 'View')
    .forEach(nestedBlock => analyzeViewBlock(nestedBlock, diagnostics, contexts, analysisState, 'Workspace'))
  nested.blocks
    .filter(nestedBlock => nestedBlock.kind === 'CompareExclusions')
    .forEach(nestedBlock => analyzeCompareExclusionsBlock(nestedBlock, diagnostics, contexts, 'Workspace'))
}

const analyzeVersionBlock = (
  block: PgmlRawBlock,
  diagnostics: PgmlLanguageDiagnostic[],
  contexts: PgmlContextRange[],
  analysisState: PgmlAnalysisState
) => {
  const versionId = getVersionIdFromHeader(block.header)

  if (!versionId) {
    createDiagnostic(
      diagnostics,
      'pgml/version-header',
      'error',
      'Version headers must use `Version id {`.',
      block.headerLine
    )
    return
  }

  analysisState.versionIds.push(createNamedRange(versionId, block.headerLine, versionId))

  const nested = collectNestedHistoryBlocks(block, diagnostics, contexts)
  const metadataLines = collectParsedMetadataLines(nested.topLevelLines)

  validateMetadataOnlyLines(metadataLines, diagnostics, {
    allowedKeys: versionMetadataKeys,
    entryCode: 'pgml/version-entry',
    entryMessage: 'Version only allows metadata entries plus nested Snapshot, View, and CompareExclusions blocks.',
    keyCode: 'pgml/version-key',
    keyMessage: 'Version only supports `name`, `role`, `parent`, `active_view`, and `created_at` metadata.'
  })

  metadataLines.forEach(({ entry, line }) => {
    if (!entry || normalizeMetadataKey(entry.key) !== 'role') {
      return
    }

    if (entry.value !== 'design' && entry.value !== 'implementation') {
      createDiagnostic(
        diagnostics,
        'pgml/version-role',
        'error',
        'Version role must be `design` or `implementation`.',
        line
      )
    }
  })

  const snapshotBlocks = validateSnapshotOnlyChildren(nested.blocks, diagnostics, {
    allowedSiblingKinds: ['View', 'CompareExclusions'],
    fallbackLine: block.headerLine,
    missingCode: 'pgml/version-snapshot-missing',
    missingMessage: `Version ${versionId} requires a Snapshot block.`,
    duplicateCode: 'pgml/version-snapshot-duplicate',
    duplicateMessage: `Version ${versionId} only allows one Snapshot block.`,
    invalidBlockCode: 'pgml/version-block-kind',
    invalidBlockMessage: 'Version only allows nested Snapshot, View, and CompareExclusions blocks.'
  })

  if (snapshotBlocks[0]) {
    analyzeNestedSnapshotBlock(snapshotBlocks[0], diagnostics, contexts, analysisState, `Version ${versionId}`)
  }

  nested.blocks
    .filter(nestedBlock => nestedBlock.kind === 'View')
    .forEach(nestedBlock => analyzeViewBlock(nestedBlock, diagnostics, contexts, analysisState, `Version ${versionId}`))
  nested.blocks
    .filter(nestedBlock => nestedBlock.kind === 'CompareExclusions')
    .forEach(nestedBlock => analyzeCompareExclusionsBlock(nestedBlock, diagnostics, contexts, `Version ${versionId}`))
}

const analyzeVersionSetBlock = (
  block: PgmlRawBlock,
  diagnostics: PgmlLanguageDiagnostic[],
  contexts: PgmlContextRange[],
  analysisState: PgmlAnalysisState
) => {
  // VersionSet is the grammar boundary between document history and schema
  // contents. Its direct children are structural history blocks only.
  const documentName = getVersionSetNameFromHeader(block.header)

  if (!documentName || documentName.trim().length === 0) {
    createDiagnostic(
      diagnostics,
      'pgml/version-set-header',
      'error',
      'VersionSet headers must use `VersionSet "Name" {`.',
      block.headerLine
    )
  }

  const nested = collectRawBlocks(block.body, diagnostics, contexts, {
    topLevelContextKind: null
  })

  buildContexts(nested.blocks, contexts)

  nested.topLevelLines.forEach((line) => {
    createDiagnostic(
      diagnostics,
      'pgml/version-set-entry',
      'error',
      'VersionSet only allows SchemaMetadata, Workspace, Comparison, and Version blocks.',
      line
    )
  })

  const {
    comparisonBlocks,
    schemaMetadataBlock,
    workspaceBlock,
    versionBlocks
  } = validateVersionSetChildren(nested.blocks, diagnostics, block.headerLine)

  if (schemaMetadataBlock) {
    analyzeSchemaMetadataBlock(schemaMetadataBlock, diagnostics, contexts)
  }

  if (workspaceBlock) {
    analyzeWorkspaceBlock(workspaceBlock, diagnostics, contexts, analysisState)
  }

  comparisonBlocks.forEach(comparisonBlock => analyzeComparisonBlock(comparisonBlock, diagnostics, contexts, analysisState))
  versionBlocks.forEach(versionBlock => analyzeVersionBlock(versionBlock, diagnostics, contexts, analysisState))
}

const analyzeVersionedDocumentBlocks = (
  blocks: PgmlRawBlock[],
  topLevelLines: PgmlLineInfo[],
  diagnostics: PgmlLanguageDiagnostic[],
  contexts: PgmlContextRange[],
  analysisState: PgmlAnalysisState
) => {
  topLevelLines.forEach((line) => {
    createDiagnostic(
      diagnostics,
      'pgml/versioned-top-level-entry',
      'error',
      'Versioned PGML only allows VersionSet at the top level.',
      line
    )
  })

  if (blocks.length !== 1 || blocks[0]?.kind !== 'VersionSet') {
    blocks.forEach((block) => {
      if (block.kind !== 'VersionSet') {
        createDiagnostic(
          diagnostics,
          'pgml/versioned-root-block-kind',
          'error',
          'Versioned PGML only allows VersionSet at the top level.',
          block.headerLine
        )
      }
    })
  }

  blocks.forEach((block) => {
    if (block.kind === 'VersionSet') {
      analyzeVersionSetBlock(block, diagnostics, contexts, analysisState)
      return
    }

    if (block.kind === 'Unknown') {
      createDiagnostic(
        diagnostics,
        'pgml/block-kind',
        'error',
        'Unsupported block header.',
        block.headerLine
      )
    }
  })
}

const analyzeWorkspaceDocumentBlocks = (
  blocks: PgmlRawBlock[],
  topLevelLines: PgmlLineInfo[],
  diagnostics: PgmlLanguageDiagnostic[],
  contexts: PgmlContextRange[],
  analysisState: PgmlAnalysisState
) => {
  // Scoped workspace views reuse the same analyzer as full VersionSet
  // documents, but the root contract is narrower because the editor dropdown
  // can show just the Workspace block on its own.
  topLevelLines.forEach((line) => {
    createDiagnostic(
      diagnostics,
      'pgml/workspace-root-entry',
      'error',
      'Scoped Workspace documents only allow Workspace at the top level.',
      line
    )
  })

  if (blocks.length !== 1 || blocks[0]?.kind !== 'Workspace') {
    blocks.forEach((block) => {
      if (block.kind !== 'Workspace') {
        createDiagnostic(
          diagnostics,
          'pgml/workspace-root-block-kind',
          'error',
          'Scoped Workspace documents only allow Workspace at the top level.',
          block.headerLine
        )
      }
    })
  }

  blocks.forEach((block) => {
    if (block.kind === 'Workspace') {
      analyzeWorkspaceBlock(block, diagnostics, contexts, analysisState)
      return
    }

    if (block.kind === 'Unknown') {
      createDiagnostic(
        diagnostics,
        'pgml/block-kind',
        'error',
        'Unsupported block header.',
        block.headerLine
      )
    }
  })
}

const analyzeVersionDocumentBlocks = (
  blocks: PgmlRawBlock[],
  topLevelLines: PgmlLineInfo[],
  diagnostics: PgmlLanguageDiagnostic[],
  contexts: PgmlContextRange[],
  analysisState: PgmlAnalysisState
) => {
  // Version block scopes power the read-only raw editor slice for one locked
  // checkpoint, so diagnostics must accept Version as the document root here.
  topLevelLines.forEach((line) => {
    createDiagnostic(
      diagnostics,
      'pgml/version-root-entry',
      'error',
      'Scoped Version documents only allow a single Version block at the top level.',
      line
    )
  })

  if (blocks.length !== 1 || blocks[0]?.kind !== 'Version') {
    blocks.forEach((block) => {
      if (block.kind !== 'Version') {
        createDiagnostic(
          diagnostics,
          'pgml/version-root-block-kind',
          'error',
          'Scoped Version documents only allow a single Version block at the top level.',
          block.headerLine
        )
      }
    })
  }

  blocks.forEach((block) => {
    if (block.kind === 'Version') {
      analyzeVersionBlock(block, diagnostics, contexts, analysisState)
      return
    }

    if (block.kind === 'Unknown') {
      createDiagnostic(
        diagnostics,
        'pgml/block-kind',
        'error',
        'Unsupported block header.',
        block.headerLine
      )
    }
  })
}

const getPgmlDocumentRootMode = (
  blocks: PgmlRawBlock[]
): PgmlDocumentRootMode => {
  // Root mode detection decides which top-level grammar rules and completions
  // apply before semantic analysis runs. VersionSet wins over scoped modes so
  // mixed content still surfaces the stricter versioned-root diagnostics.
  if (blocks.some(block => block.kind === 'VersionSet')) {
    return 'version-set'
  }

  if (blocks.length === 1 && blocks[0]?.kind === 'Workspace') {
    return 'workspace'
  }

  if (blocks.length === 1 && blocks[0]?.kind === 'Version') {
    return 'version'
  }

  return 'snapshot'
}

export const analyzePgmlDocument = (source: string) => {
  if (analysisCache && analysisCache.source === source) {
    return analysisCache.analysis
  }

  const diagnostics: PgmlLanguageDiagnostic[] = []
  const contexts: PgmlContextRange[] = []
  const tables: PgmlTableSymbol[] = []
  const groups: PgmlGroupSymbol[] = []
  const customTypes: PgmlCustomTypeSymbol[] = []
  const functions: PgmlNamedRange[] = []
  const procedures: PgmlNamedRange[] = []
  const triggers: PgmlNamedRange[] = []
  const sequences: PgmlNamedRange[] = []
  const references: PgmlReferenceSymbol[] = []
  const propertyTargets: PgmlPropertyTarget[] = []
  const versionIds: PgmlNamedRange[] = []
  const { lines, normalizedSource } = createLineInfo(normalizePgmlCompatSource(source))
  const { blocks, topLevelLines } = collectRawBlocks(lines, diagnostics, contexts)
  const analysisState: PgmlAnalysisState = {
    tables,
    groups,
    customTypes,
    functions,
    procedures,
    triggers,
    sequences,
    references,
    propertyTargets,
    versionIds
  }
  const rootMode = getPgmlDocumentRootMode(blocks)
  const isVersionedDocument = rootMode !== 'snapshot'

  buildContexts(blocks, contexts)

  if (rootMode === 'version-set') {
    // Versioned documents are parsed from the root downward so invalid root
    // siblings can be flagged before nested Snapshot blocks reuse schema rules.
    analyzeVersionedDocumentBlocks(blocks, topLevelLines, diagnostics, contexts, analysisState)
  } else if (rootMode === 'workspace') {
    analyzeWorkspaceDocumentBlocks(blocks, topLevelLines, diagnostics, contexts, analysisState)
  } else if (rootMode === 'version') {
    analyzeVersionDocumentBlocks(blocks, topLevelLines, diagnostics, contexts, analysisState)
  } else {
    analyzeSnapshotBlocks(blocks, topLevelLines, diagnostics, contexts, analysisState)
  }

  const analysis: PgmlDocumentAnalysis = {
    source: normalizedSource,
    diagnostics,
    blocks,
    contexts,
    lines,
    isVersionedDocument,
    tables,
    groups,
    customTypes,
    functions,
    procedures,
    triggers,
    sequences,
    references,
    propertyTargets,
    versionIds
  }

  if (!isVersionedDocument) {
    runSemanticDiagnostics(analysis)
  }
  diagnostics.sort((left, right) => left.from - right.from || left.severity.localeCompare(right.severity))

  analysisCache = {
    source,
    analysis
  }

  return analysis
}

const getLineAtOffset = (analysis: PgmlDocumentAnalysis, offset: number) => {
  const clampedOffset = Math.max(0, Math.min(offset, analysis.source.length))

  for (const line of analysis.lines) {
    if (clampedOffset >= line.from && clampedOffset <= line.to + 1) {
      return line
    }
  }

  return analysis.lines[analysis.lines.length - 1] || {
    number: 1,
    text: '',
    trimmed: '',
    from: 0,
    to: 0
  }
}

const getInnermostContextAtOffset = (analysis: PgmlDocumentAnalysis, offset: number) => {
  const matches = analysis.contexts
    .filter(context => offset >= context.from && offset <= context.to + 1)
    .sort((left, right) => {
      const leftSpan = left.to - left.from
      const rightSpan = right.to - right.from

      if (leftSpan !== rightSpan) {
        return leftSpan - rightSpan
      }

      return Number(left.kind === 'top-level') - Number(right.kind === 'top-level')
    })

  return matches[0] || null
}

const getCompletionSpan = (line: PgmlLineInfo, offset: number) => {
  const clampedOffset = Math.max(line.from, Math.min(offset, line.to))
  const beforeCursor = line.text.slice(0, clampedOffset - line.from)
  const fragmentMatch = beforeCursor.match(/[A-Za-z0-9_.:#-]+$/)
  const fragment = fragmentMatch ? fragmentMatch[0] : ''
  const from = fragment.length > 0 ? clampedOffset - fragment.length : clampedOffset

  return {
    fragment,
    from,
    to: clampedOffset
  }
}

const filterCompletionTemplates = (
  templates: ReadonlyArray<{ label: string, detail: string, apply: string }>,
  kind: PgmlLanguageCompletionKind,
  fragment: string,
  from: number,
  to: number
) => {
  const normalizedFragment = lower(fragment)

  return templates
    .filter((template) => {
      if (normalizedFragment.length === 0) {
        return true
      }

      return lower(template.label).startsWith(normalizedFragment)
    })
    .map(template => ({
      label: template.label,
      kind,
      detail: template.detail,
      apply: template.apply,
      from,
      to
    }))
}

const buildSymbolCompletionItems = (
  values: string[],
  detail: string,
  kind: PgmlLanguageCompletionKind,
  fragment: string,
  from: number,
  to: number
) => {
  const normalizedFragment = lower(fragment)

  return values
    .filter((value, index, entries) => entries.indexOf(value) === index)
    .filter((value) => {
      if (normalizedFragment.length === 0) {
        return true
      }

      return lower(value).startsWith(normalizedFragment)
    })
    .map(value => ({
      label: value,
      kind,
      detail,
      apply: value,
      from,
      to
    }))
}

const getReferencePathCompletions = (analysis: PgmlDocumentAnalysis, fragment: string, from: number, to: number) => {
  const values: string[] = []

  analysis.tables.forEach((table) => {
    table.columns.forEach((column) => {
      values.push(`${table.fullName}.${column.name}`)

      if (table.fullName.startsWith('public.')) {
        values.push(`${table.fullName.replace(/^public\./, '')}.${column.name}`)
      }
    })
  })

  return buildSymbolCompletionItems(values, 'Reference target', 'symbol', fragment, from, to)
}

const getPropertyTargetCompletions = (analysis: PgmlDocumentAnalysis, fragment: string, from: number, to: number) => {
  const values: string[] = []

  analysis.groups.forEach((group) => {
    values.push(`group:${group.name}`)
  })

  analysis.tables.forEach((table) => {
    values.push(table.fullName)
  })

  analysis.customTypes.forEach((customType) => {
    values.push(`custom-type:${customType.kind}:${customType.name}`)
  })

  analysis.functions.forEach((pgFunction) => {
    values.push(`function:${pgFunction.name}`)
  })

  analysis.procedures.forEach((procedure) => {
    values.push(`procedure:${procedure.name}`)
  })

  analysis.triggers.forEach((trigger) => {
    values.push(`trigger:${trigger.name}`)
  })

  analysis.sequences.forEach((sequence) => {
    values.push(`sequence:${sequence.name}`)
  })

  return buildSymbolCompletionItems(values, 'Properties target', 'symbol', fragment, from, to)
}

const getColumnTypeCompletions = (analysis: PgmlDocumentAnalysis, fragment: string, from: number, to: number) => {
  const values = [...commonPgmlColumnTypes]

  analysis.customTypes.forEach((customType) => {
    values.push(customType.name)
  })

  return buildSymbolCompletionItems(values, 'Column type', 'type', fragment, from, to)
}

const getGroupNameCompletions = (analysis: PgmlDocumentAnalysis, fragment: string, from: number, to: number) => {
  return buildSymbolCompletionItems(
    analysis.groups.map(group => group.name),
    'Defined group',
    'symbol',
    fragment,
    from,
    to
  )
}

const getGroupTableEntryCompletions = (analysis: PgmlDocumentAnalysis, fragment: string, from: number, to: number) => {
  const values: string[] = []

  analysis.tables.forEach((table) => {
    values.push(table.fullName)

    if (table.fullName.startsWith('public.')) {
      values.push(table.fullName.replace(/^public\./, ''))
    }
  })

  return buildSymbolCompletionItems(values, 'Defined table', 'symbol', fragment, from, to)
}

const getVersionIdCompletions = (analysis: PgmlDocumentAnalysis, fragment: string, from: number, to: number) => {
  return buildSymbolCompletionItems(
    analysis.versionIds.map(version => version.name),
    'Locked version',
    'symbol',
    fragment,
    from,
    to
  )
}

const getRootCompletionItems = (
  analysis: PgmlDocumentAnalysis,
  beforeCursor: string,
  fragment: string,
  from: number,
  to: number
) => {
  if (/^\s*Ref(?:\s+[^:]+)?:\s*/.test(beforeCursor)) {
    return getReferencePathCompletions(analysis, fragment, from, to)
  }

  return filterCompletionTemplates(rootKeywordTemplates, 'keyword', fragment, from, to)
}

const getVersionSetCompletionItems = (
  fragment: string,
  from: number,
  to: number,
  beforeCursor: string
) => {
  if (/^\s*VersionSet\s+/.test(beforeCursor)) {
    return [] as PgmlLanguageCompletionItem[]
  }

  return filterCompletionTemplates(versionSetKeywordTemplates, 'keyword', fragment, from, to)
}

const getSchemaMetadataCompletionItems = (
  beforeCursor: string,
  fragment: string,
  from: number,
  to: number
) => {
  if (/^\s*(Table|Column)\s+/.test(beforeCursor)) {
    return [] as PgmlLanguageCompletionItem[]
  }

  return filterCompletionTemplates(schemaMetadataKeywordTemplates, 'keyword', fragment, from, to)
}

const getWorkspaceCompletionItems = (
  analysis: PgmlDocumentAnalysis,
  beforeCursor: string,
  fragment: string,
  from: number,
  to: number
) => {
  if (/^\s*Workspace\s*/.test(beforeCursor)) {
    return [] as PgmlLanguageCompletionItem[]
  }

  if (/^\s*based_on:\s*[A-Za-z0-9_-]*$/i.test(beforeCursor)) {
    return getVersionIdCompletions(analysis, fragment, from, to)
  }

  return [
    ...filterCompletionTemplates(workspaceMetadataKeywordTemplates, 'property', fragment, from, to),
    ...filterCompletionTemplates(snapshotKeywordTemplates, 'keyword', fragment, from, to),
    ...filterCompletionTemplates(viewKeywordTemplates, 'keyword', fragment, from, to)
  ]
}

const getVersionCompletionItems = (
  analysis: PgmlDocumentAnalysis,
  beforeCursor: string,
  fragment: string,
  from: number,
  to: number
) => {
  if (/^\s*Version\s+[A-Za-z0-9_-]*$/i.test(beforeCursor)) {
    return [] as PgmlLanguageCompletionItem[]
  }

  if (/^\s*role:\s*[A-Za-z]*$/i.test(beforeCursor)) {
    return filterCompletionTemplates(versionRoleValueTemplates, 'value', fragment, from, to)
  }

  if (/^\s*parent:\s*[A-Za-z0-9_-]*$/i.test(beforeCursor)) {
    return getVersionIdCompletions(analysis, fragment, from, to)
  }

  return [
    ...filterCompletionTemplates(versionMetadataKeywordTemplates, 'property', fragment, from, to),
    ...filterCompletionTemplates(snapshotKeywordTemplates, 'keyword', fragment, from, to),
    ...filterCompletionTemplates(viewKeywordTemplates, 'keyword', fragment, from, to)
  ]
}

const getComparisonCompletionItems = (
  beforeCursor: string,
  fragment: string,
  from: number,
  to: number
) => {
  if (/^\s*Comparison\s+/.test(beforeCursor)) {
    return [] as PgmlLanguageCompletionItem[]
  }

  return filterCompletionTemplates(comparisonMetadataKeywordTemplates, 'property', fragment, from, to)
}

const getViewCompletionItems = (
  analysis: PgmlDocumentAnalysis,
  beforeCursor: string,
  fragment: string,
  from: number,
  to: number
) => {
  if (/^\s*View\s+/.test(beforeCursor)) {
    return [] as PgmlLanguageCompletionItem[]
  }

  if (/^\s*Properties\s+/.test(beforeCursor)) {
    return getPropertyTargetCompletions(analysis, fragment, from, to)
  }

  if (/^\s*(show_lines|lines|show_execs|execs|show_fields|fields):\s*[A-Za-z]*$/i.test(beforeCursor)) {
    return buildSymbolCompletionItems(['true', 'false'], 'Boolean value', 'value', fragment, from, to)
  }

  return [
    ...filterCompletionTemplates(viewMetadataKeywordTemplates, 'property', fragment, from, to),
    ...filterCompletionTemplates([
      { label: 'Properties', detail: 'Attach persisted layout properties for this view.', apply: 'Properties "' }
    ], 'keyword', fragment, from, to)
  ]
}

const getSnapshotCompletionItems = (
  analysis: PgmlDocumentAnalysis,
  beforeCursor: string,
  fragment: string,
  from: number,
  to: number
) => {
  if (/^\s*Ref(?:\s+[^:]+)?:\s*/.test(beforeCursor)) {
    return getReferencePathCompletions(analysis, fragment, from, to)
  }

  if (/^\s*Snapshot\s*/.test(beforeCursor)) {
    return [] as PgmlLanguageCompletionItem[]
  }

  return filterCompletionTemplates(snapshotTopLevelKeywordTemplates, 'keyword', fragment, from, to)
}

const getCompletionItemsForLine = (
  analysis: PgmlDocumentAnalysis,
  offset: number,
  lineOverride?: PgmlCompletionLineOverride
) => {
  const clampedOffset = Math.max(0, Math.min(offset, analysis.source.length))
  const context = getInnermostContextAtOffset(analysis, clampedOffset)
  const line = lineOverride
    ? {
        number: getLineAtOffset(analysis, clampedOffset).number,
        text: lineOverride.text,
        trimmed: lineOverride.text.trim(),
        from: lineOverride.from,
        to: lineOverride.to
      }
    : getLineAtOffset(analysis, clampedOffset)
  const { fragment, from, to } = getCompletionSpan(line, clampedOffset)
  const beforeCursor = line.text.slice(0, Math.max(0, clampedOffset - line.from))
  const trimmedBeforeCursor = beforeCursor.trim()

  if (context?.kind === 'source') {
    return [] as PgmlLanguageCompletionItem[]
  }

  if (context?.kind === 'top-level' || context === null) {
    return getRootCompletionItems(analysis, beforeCursor, fragment, from, to)
  }

  if (context.kind === 'version-set') {
    return getVersionSetCompletionItems(fragment, from, to, beforeCursor)
  }

  if (context.kind === 'schema-metadata') {
    return getSchemaMetadataCompletionItems(beforeCursor, fragment, from, to)
  }

  if (context.kind === 'workspace') {
    return getWorkspaceCompletionItems(analysis, beforeCursor, fragment, from, to)
  }

  if (context.kind === 'version') {
    return getVersionCompletionItems(analysis, beforeCursor, fragment, from, to)
  }

  if (context.kind === 'comparison') {
    return getComparisonCompletionItems(beforeCursor, fragment, from, to)
  }

  if (context.kind === 'snapshot') {
    return getSnapshotCompletionItems(analysis, beforeCursor, fragment, from, to)
  }

  if (context.kind === 'view') {
    return getViewCompletionItems(analysis, beforeCursor, fragment, from, to)
  }

  if (context.kind === 'properties') {
    if (/^\s*Properties\s+/.test(beforeCursor)) {
      return getPropertyTargetCompletions(analysis, fragment, from, to)
    }

    if (/^\s*(collapsed|visible|masonry):\s*[A-Za-z]*$/i.test(beforeCursor)) {
      return buildSymbolCompletionItems(['true', 'false'], 'Boolean value', 'value', fragment, from, to)
    }

    return filterCompletionTemplates(propertyKeywordTemplates, 'property', fragment, from, to)
  }

  if (context.kind === 'group') {
    if (/^\s*TableGroup\s+/.test(beforeCursor)) {
      return []
    }

    return getGroupTableEntryCompletions(analysis, fragment, from, to)
  }

  if (context.kind === 'table') {
    if (/^\s*Table\s+[^\s]+\s+in\s+[A-Za-z0-9_.-]*$/i.test(beforeCursor)) {
      return getGroupNameCompletions(analysis, fragment, from, to)
    }

    if (beforeCursor.includes('[') && !beforeCursor.includes(']')) {
      if (/ref:\s*[<>-]?\s*[A-Za-z0-9_.-]*$/i.test(beforeCursor)) {
        if (/ref:\s*$/.test(beforeCursor)) {
          return buildSymbolCompletionItems(['>', '<', '-'], 'Relation operator', 'value', fragment, from, to)
        }

        if (/ref:\s*[<>-]\s*[A-Za-z0-9_.-]*$/i.test(beforeCursor)) {
          return getReferencePathCompletions(analysis, fragment, from, to)
        }
      }

      return filterCompletionTemplates(modifierKeywordTemplates, 'property', fragment, from, to)
    }

    if (/^\s*[A-Za-z_][A-Za-z0-9_]*\s+[A-Za-z0-9_.()[\] ]*$/.test(beforeCursor) && !beforeCursor.trim().startsWith('Index') && !beforeCursor.trim().startsWith('Constraint')) {
      return getColumnTypeCompletions(analysis, fragment, from, to)
    }

    if (trimmedBeforeCursor.length === 0 || !trimmedBeforeCursor.includes(' ')) {
      return filterCompletionTemplates(tableBodyKeywordTemplates, 'keyword', fragment, from, to)
    }
  }

  if (context.kind === 'docs') {
    return filterCompletionTemplates(docsKeywordTemplates, 'property', fragment, from, to)
  }

  if (context.kind === 'affects') {
    return filterCompletionTemplates(affectsKeywordTemplates, 'property', fragment, from, to)
  }

  if (context.kind === 'routine' || context.kind === 'trigger' || context.kind === 'sequence') {
    return filterCompletionTemplates(executableKeywordTemplates, 'property', fragment, from, to)
  }

  return []
}

export const getPgmlCompletionItems = (source: string, offset: number) => {
  return getCompletionItemsForLine(analyzePgmlDocument(source), offset)
}

export const getPgmlCompletionItemsFromAnalysis = (
  analysis: PgmlDocumentAnalysis,
  offset: number,
  lineOverride?: PgmlCompletionLineOverride
) => {
  return getCompletionItemsForLine(analysis, offset, lineOverride)
}

export const getPgmlDiagnostics = (source: string) => {
  return analyzePgmlDocument(source).diagnostics
}
