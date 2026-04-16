import { normalizeImportedTableColumnReference } from './pgml-import-normalization'
import { normalizeExecutableSqlText } from './pgml-executable-sql'
import {
  normalizePgmlSequenceMetadataEntries,
  type PgmlSequenceMetadataEntry
} from './pgml-sequence-metadata'
import { normalizePgmlTypeExpression } from './pgml-types'

export type PgmlExecutableParserVersion = 15 | 16 | 17

export type PgmlExecutableParseStatus = 'invalid' | 'opaque' | 'parsed' | 'unavailable'

export type PgmlExecutableParseDiagnostic = {
  cursorPosition: number | null
  message: string
  version: PgmlExecutableParserVersion
}

export type PgmlRoutineSemanticOptionEntry = {
  name: string
  value: unknown
}

export type PgmlRoutineSemanticBody = {
  extras: string[] | null
  kind: 'normalized_text' | 'opaque_text' | 'sql_ast'
  value: unknown
}

export type PgmlRoutineSemanticFingerprint = {
  body: PgmlRoutineSemanticBody | null
  kind: 'function' | 'procedure'
  language: string | null
  name: string | null
  optionEntries: PgmlRoutineSemanticOptionEntry[]
  parameters: Array<{
    defaultValue: unknown | null
    mode: string | null
    name: string | null
    type: string | unknown | null
  }>
  returnType: string | unknown | null
}

export type PgmlRoutineSemanticModel = {
  diagnostics: PgmlExecutableParseDiagnostic[]
  fingerprint: PgmlRoutineSemanticFingerprint | null
  parserVersion: PgmlExecutableParserVersion
  status: PgmlExecutableParseStatus
}

export type PgmlTriggerSemanticFingerprint = {
  arguments: unknown[]
  columns: string[]
  constraint: boolean
  constraintTable: string | null
  events: number | null
  level: 'row' | 'statement'
  name: string | null
  relation: string | null
  routineName: string | null
  timing: number | null
  transitionRels: Array<{
    isNew: boolean
    isTable: boolean
    name: string | null
  }>
  when: unknown | null
}

export type PgmlTriggerSemanticModel = {
  diagnostics: PgmlExecutableParseDiagnostic[]
  fingerprint: PgmlTriggerSemanticFingerprint | null
  parserVersion: PgmlExecutableParserVersion
  status: PgmlExecutableParseStatus
}

export type PgmlSequenceSemanticFingerprint = {
  metadata: PgmlSequenceMetadataEntry[]
  name: string | null
}

export type PgmlSequenceSemanticModel = {
  diagnostics: PgmlExecutableParseDiagnostic[]
  fingerprint: PgmlSequenceSemanticFingerprint | null
  parserVersion: PgmlExecutableParserVersion
  status: PgmlExecutableParseStatus
}

type PgsqlParserModule = {
  loadModule: () => Promise<void>
  parseSync: (query: string) => {
    stmts?: Array<{
      stmt?: unknown
    }>
  }
}

const defaultParserVersion: PgmlExecutableParserVersion = 17
const parserLoadPromiseByVersion = new Map<PgmlExecutableParserVersion, Promise<PgsqlParserModule>>()
const parserModuleByVersion = new Map<PgmlExecutableParserVersion, PgsqlParserModule>()
const routineSemanticCache = new Map<string, PgmlRoutineSemanticModel>()
const triggerSemanticCache = new Map<string, PgmlTriggerSemanticModel>()
const sequenceSemanticCache = new Map<string, PgmlSequenceSemanticModel>()

const parserNoiseKeys = new Set([
  'catalogname',
  'defnamespace',
  'location',
  'stmt_len',
  'stmt_location'
])

const normalizeBigintSequenceMetadataDefaults = (entries: PgmlSequenceMetadataEntry[]) => {
  return entries.filter((entry) => {
    return !(entry.key === 'as' && entry.value === 'bigint')
  })
}

const toStableJson = (value: unknown): string => {
  if (typeof value === 'bigint') {
    return JSON.stringify(`${value}`)
  }

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

const loadVersionParserModule = async (version: PgmlExecutableParserVersion): Promise<PgsqlParserModule> => {
  switch (version) {
    case 15:
      return import('./pgsql-parser-v15').then(module => module.default)
    case 16:
      return import('./pgsql-parser-v16').then(module => module.default)
    case 17:
      return import('./pgsql-parser-v17').then(module => module.default)
  }
}

export const initializePgmlExecutableParser = async (
  version: PgmlExecutableParserVersion = defaultParserVersion
) => {
  const existingModule = parserModuleByVersion.get(version)

  if (existingModule) {
    return existingModule
  }

  const existingPromise = parserLoadPromiseByVersion.get(version)

  if (existingPromise) {
    return existingPromise
  }

  const nextPromise = loadVersionParserModule(version).then(async (module) => {
    await module.loadModule()
    parserModuleByVersion.set(version, module)
    return module
  })

  parserLoadPromiseByVersion.set(version, nextPromise)
  return nextPromise
}

export const isPgmlExecutableParserReady = (
  version: PgmlExecutableParserVersion = defaultParserVersion
) => {
  return parserModuleByVersion.has(version)
}

const buildCacheKey = (
  kind: 'routine' | 'sequence' | 'trigger',
  source: string,
  version: PgmlExecutableParserVersion
) => {
  return `${version}:${kind}:${source}`
}

const unwrapPgsqlNode = (value: unknown) => {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return null
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)

  if (entries.length !== 1) {
    return null
  }

  const entry = entries[0] || null

  if (!entry) {
    return null
  }

  const [type, node] = entry

  if (!type) {
    return null
  }

  return {
    node,
    type
  }
}

const normalizeAstValue = (value: unknown): unknown => {
  if (typeof value === 'bigint') {
    return `${value}`
  }

  if (Array.isArray(value)) {
    return value.map(entry => normalizeAstValue(entry))
  }

  if (!value || typeof value !== 'object') {
    return value
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key, entry]) => {
      if (entry === undefined) {
        return false
      }

      if (parserNoiseKeys.has(key) && (entry === '' || typeof entry === 'number')) {
        return false
      }

      return true
    })
    .sort(([left], [right]) => left.localeCompare(right))

  return entries.reduce<Record<string, unknown>>((record, [key, entry]) => {
    record[key] = normalizeAstValue(entry)
    return record
  }, {})
}

const readStringNode = (value: unknown) => {
  const unwrappedNode = unwrapPgsqlNode(value)

  if (unwrappedNode?.type !== 'String' || !unwrappedNode.node || typeof unwrappedNode.node !== 'object') {
    return null
  }

  const stringValue = (unwrappedNode.node as Record<string, unknown>).sval
  return typeof stringValue === 'string' ? stringValue : null
}

const readBooleanNode = (value: unknown) => {
  const unwrappedNode = unwrapPgsqlNode(value)

  if (unwrappedNode?.type !== 'Boolean' || !unwrappedNode.node || typeof unwrappedNode.node !== 'object') {
    return null
  }

  const booleanValue = (unwrappedNode.node as Record<string, unknown>).boolval
  return typeof booleanValue === 'boolean' ? booleanValue : null
}

const readIntegerNode = (value: unknown) => {
  const unwrappedNode = unwrapPgsqlNode(value)

  if (unwrappedNode?.type !== 'Integer' || !unwrappedNode.node || typeof unwrappedNode.node !== 'object') {
    return null
  }

  const integerValue = (unwrappedNode.node as Record<string, unknown>).ival
  return typeof integerValue === 'number' ? integerValue : null
}

const readFloatNode = (value: unknown) => {
  const unwrappedNode = unwrapPgsqlNode(value)

  if (unwrappedNode?.type !== 'Float' || !unwrappedNode.node || typeof unwrappedNode.node !== 'object') {
    return null
  }

  const floatValue = (unwrappedNode.node as Record<string, unknown>).str
  return typeof floatValue === 'string' ? floatValue : null
}

const readQualifiedName = (value: unknown[] | undefined) => {
  const parts = (value || [])
    .map(node => readStringNode(node))
    .filter((entry): entry is string => Boolean(entry))

  if (parts.length === 0) {
    return null
  }

  return parts.join('.')
}

const normalizeRangeVar = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return null
  }

  const rangeVar = value as Record<string, unknown>
  const relationName = typeof rangeVar.relname === 'string' ? rangeVar.relname : null
  const schemaName = typeof rangeVar.schemaname === 'string' ? rangeVar.schemaname : null

  if (!relationName) {
    return null
  }

  return schemaName ? `${schemaName}.${relationName}` : relationName
}

const normalizeFunctionParameterMode = (value: unknown) => {
  return typeof value === 'string' ? value.replace(/^FUNC_PARAM_/u, '').toLowerCase() : null
}

const renderSimpleTypeModifier = (value: unknown) => {
  const integerValue = readIntegerNode(value)

  if (integerValue !== null) {
    return `${integerValue}`
  }

  const floatValue = readFloatNode(value)

  if (floatValue !== null) {
    return floatValue
  }

  const stringValue = readStringNode(value)

  if (stringValue !== null) {
    return stringValue
  }

  return toStableJson(normalizeAstValue(value))
}

const renderTypeName = (value: unknown): string | unknown | null => {
  if (!value || typeof value !== 'object') {
    return value ?? null
  }

  const typeName = value as Record<string, unknown>
  const baseName = readQualifiedName(typeName.names as unknown[] | undefined)

  if (!baseName) {
    return normalizeAstValue(value)
  }

  const typmods = Array.isArray(typeName.typmods)
    ? typeName.typmods.map(entry => renderSimpleTypeModifier(entry))
    : []
  const normalizedBaseName = normalizePgmlTypeExpression(baseName)
  const typeWithModifiers = typmods.length > 0
    ? `${normalizedBaseName}(${typmods.join(', ')})`
    : normalizedBaseName
  const arrayDepth = Array.isArray(typeName.arrayBounds)
    ? typeName.arrayBounds.length
    : 0

  return `${typeWithModifiers}${'[]'.repeat(arrayDepth)}`
}

const readListStringValues = (value: unknown) => {
  const unwrappedNode = unwrapPgsqlNode(value)

  if (unwrappedNode?.type !== 'List' || !unwrappedNode.node || typeof unwrappedNode.node !== 'object') {
    return null
  }

  const items = Array.isArray((unwrappedNode.node as Record<string, unknown>).items)
    ? (unwrappedNode.node as Record<string, unknown>).items as unknown[]
    : []
  const stringValues = items.map(item => readStringNode(item))

  if (stringValues.some(entry => entry === null)) {
    return null
  }

  return stringValues.filter((entry): entry is string => Boolean(entry))
}

const normalizeVariableSetArgument = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return normalizeAstValue(value)
  }

  const variableSetStatement = value as Record<string, unknown>

  return {
    args: Array.isArray(variableSetStatement.args)
      ? variableSetStatement.args.map(entry => normalizeAstValue(entry))
      : [],
    kind: typeof variableSetStatement.kind === 'string' ? variableSetStatement.kind : null,
    name: typeof variableSetStatement.name === 'string' ? variableSetStatement.name : null
  }
}

const sortRoutineOptionEntries = (entries: PgmlRoutineSemanticOptionEntry[]) => {
  return [...entries].sort((left, right) => {
    if (left.name !== right.name) {
      return left.name.localeCompare(right.name)
    }

    return toStableJson(left.value).localeCompare(toStableJson(right.value))
  })
}

const parseWithLoadedParserSync = (
  source: string,
  version: PgmlExecutableParserVersion
) => {
  const parserModule = parserModuleByVersion.get(version) || null

  if (!parserModule) {
    return {
      diagnostics: [] as PgmlExecutableParseDiagnostic[],
      statements: [] as unknown[],
      status: 'unavailable' as PgmlExecutableParseStatus
    }
  }

  try {
    const parsed = parserModule.parseSync(source)
    const statements = (parsed.stmts || [])
      .map(statement => statement.stmt || null)
      .filter(statement => statement !== null) as unknown[]

    return {
      diagnostics: [] as PgmlExecutableParseDiagnostic[],
      statements,
      status: 'parsed' as PgmlExecutableParseStatus
    }
  } catch (error) {
    const parserError = error as Error & {
      sqlDetails?: {
        cursorPosition?: number
      }
    }

    return {
      diagnostics: [{
        cursorPosition: typeof parserError.sqlDetails?.cursorPosition === 'number'
          ? parserError.sqlDetails.cursorPosition
          : null,
        message: parserError.message,
        version
      }],
      statements: [] as unknown[],
      status: 'invalid' as PgmlExecutableParseStatus
    }
  }
}

const normalizeParsedStatementList = (statements: unknown[]) => {
  return statements.map(statement => normalizeAstValue(statement))
}

const normalizeRoutineBodyFromSqlText = (
  body: string,
  language: string | null,
  version: PgmlExecutableParserVersion
): PgmlRoutineSemanticBody | null => {
  const trimmedBody = body.trim()

  if (trimmedBody.length === 0) {
    return null
  }

  if (language === 'sql') {
    const parsedBody = parseWithLoadedParserSync(trimmedBody, version)

    if (parsedBody.status === 'parsed') {
      return {
        extras: null,
        kind: 'sql_ast',
        value: normalizeParsedStatementList(parsedBody.statements)
      }
    }
  }

  if (language === 'plpgsql') {
    return {
      extras: null,
      kind: 'normalized_text',
      value: normalizeExecutableSqlText(trimmedBody)
    }
  }

  return {
    extras: null,
    kind: 'opaque_text',
    value: trimmedBody
  }
}

const normalizeRoutineBodyFromAsOption = (
  argument: unknown,
  language: string | null,
  version: PgmlExecutableParserVersion
): PgmlRoutineSemanticBody | null => {
  const stringValues = readListStringValues(argument)

  if (!stringValues || stringValues.length === 0) {
    return {
      extras: null,
      kind: 'opaque_text',
      value: normalizeAstValue(argument)
    }
  }

  const [firstValue, ...extraValues] = stringValues
  const normalizedBody = normalizeRoutineBodyFromSqlText(firstValue || '', language, version)

  if (!normalizedBody) {
    return null
  }

  return {
    ...normalizedBody,
    extras: extraValues.length > 0 ? extraValues.map(value => value.trim()) : null
  }
}

const normalizeRoutineOptionValue = (
  optionName: string,
  argument: unknown
) => {
  if (optionName === 'language') {
    return readStringNode(argument)?.toLowerCase() || normalizeAstValue(argument)
  }

  if (optionName === 'security') {
    const booleanValue = readBooleanNode(argument)

    if (booleanValue === true) {
      return 'definer'
    }

    if (booleanValue === false) {
      return 'invoker'
    }
  }

  if (optionName === 'set') {
    const unwrappedNode = unwrapPgsqlNode(argument)

    if (unwrappedNode?.type === 'VariableSetStmt') {
      return normalizeVariableSetArgument(unwrappedNode.node)
    }
  }

  if (optionName === 'volatility' || optionName === 'parallel') {
    return readStringNode(argument)?.toLowerCase() || normalizeAstValue(argument)
  }

  if (optionName === 'support') {
    const unwrappedNode = unwrapPgsqlNode(argument)

    if (unwrappedNode?.type === 'List' && unwrappedNode.node && typeof unwrappedNode.node === 'object') {
      return readQualifiedName((unwrappedNode.node as Record<string, unknown>).items as unknown[] | undefined)
    }
  }

  if (optionName === 'transform') {
    const unwrappedNode = unwrapPgsqlNode(argument)

    if (unwrappedNode?.type === 'List' && unwrappedNode.node && typeof unwrappedNode.node === 'object') {
      const items = Array.isArray((unwrappedNode.node as Record<string, unknown>).items)
        ? (unwrappedNode.node as Record<string, unknown>).items as unknown[]
        : []

      return items.map(item => normalizeAstValue(item))
    }
  }

  return normalizeAstValue(argument)
}

const collectDefElemEntries = (options: unknown[] | undefined) => {
  return (options || []).map((option) => {
    const unwrappedNode = unwrapPgsqlNode(option)

    if (unwrappedNode?.type !== 'DefElem' || !unwrappedNode.node || typeof unwrappedNode.node !== 'object') {
      return null
    }

    const defElement = unwrappedNode.node as Record<string, unknown>
    return {
      argument: defElement.arg,
      name: typeof defElement.defname === 'string' ? defElement.defname : null
    }
  }).filter((entry): entry is {
    argument: unknown
    name: string
  } => Boolean(entry?.name))
}

const buildRoutineOptionEntries = (
  options: unknown[] | undefined
) => {
  return collectDefElemEntries(options)
    .filter(entry => entry.name !== 'as' && entry.name !== 'language')
    .map((entry) => {
      return {
        name: entry.name,
        value: normalizeRoutineOptionValue(entry.name, entry.argument)
      }
    })
}

const getRoutineLanguage = (options: unknown[] | undefined) => {
  const languageEntry = collectDefElemEntries(options).find(entry => entry.name === 'language') || null

  if (!languageEntry) {
    return null
  }

  return readStringNode(languageEntry.argument)?.toLowerCase() || null
}

const getRoutineBody = (
  statement: Record<string, unknown>,
  version: PgmlExecutableParserVersion
): PgmlRoutineSemanticBody | null => {
  const language = getRoutineLanguage(statement.options as unknown[] | undefined)

  if (statement.sql_body) {
    return {
      extras: null,
      kind: 'sql_ast',
      value: normalizeAstValue(statement.sql_body)
    }
  }

  const asEntry = collectDefElemEntries(statement.options as unknown[] | undefined)
    .find(entry => entry.name === 'as') || null

  if (!asEntry) {
    return null
  }

  return normalizeRoutineBodyFromAsOption(asEntry.argument, language, version)
}

const buildRoutineSemanticFingerprint = (
  statement: Record<string, unknown>,
  version: PgmlExecutableParserVersion
): PgmlRoutineSemanticFingerprint => {
  const isProcedure = statement.is_procedure === true

  return {
    body: getRoutineBody(statement, version),
    kind: isProcedure ? 'procedure' : 'function',
    language: getRoutineLanguage(statement.options as unknown[] | undefined),
    name: readQualifiedName(statement.funcname as unknown[] | undefined),
    optionEntries: sortRoutineOptionEntries(buildRoutineOptionEntries(
      statement.options as unknown[] | undefined
    )),
    parameters: Array.isArray(statement.parameters)
      ? statement.parameters.map((parameter) => {
          const unwrappedParameter = unwrapPgsqlNode(parameter)

          if (unwrappedParameter?.type !== 'FunctionParameter' || !unwrappedParameter.node || typeof unwrappedParameter.node !== 'object') {
            return {
              defaultValue: normalizeAstValue(parameter),
              mode: null,
              name: null,
              type: null
            }
          }

          const functionParameter = unwrappedParameter.node as Record<string, unknown>

          return {
            defaultValue: functionParameter.defexpr ? normalizeAstValue(functionParameter.defexpr) : null,
            mode: normalizeFunctionParameterMode(functionParameter.mode),
            name: typeof functionParameter.name === 'string' ? functionParameter.name : null,
            type: functionParameter.argType ? renderTypeName(functionParameter.argType) : null
          }
        })
      : [],
    returnType: statement.returnType ? renderTypeName(statement.returnType) : null
  }
}

const normalizeTriggerArgument = (value: unknown) => {
  const stringValue = readStringNode(value)

  if (stringValue !== null) {
    return stringValue
  }

  return normalizeAstValue(value)
}

const buildTriggerSemanticFingerprint = (statement: Record<string, unknown>): PgmlTriggerSemanticFingerprint => {
  const transitionRelations = (statement.transitionRels as unknown[] | undefined || [])
    .map((entry) => {
      const unwrappedEntry = unwrapPgsqlNode(entry)

      if (unwrappedEntry?.type !== 'TriggerTransition' || !unwrappedEntry.node || typeof unwrappedEntry.node !== 'object') {
        return null
      }

      const transitionRelation = unwrappedEntry.node as Record<string, unknown>

      return {
        isNew: transitionRelation.isNew === true,
        isTable: transitionRelation.isTable === true,
        name: typeof transitionRelation.name === 'string' ? transitionRelation.name : null
      }
    })
    .filter((entry): entry is {
      isNew: boolean
      isTable: boolean
      name: string | null
    } => Boolean(entry))
    .sort((left, right) => {
      return toStableJson(left).localeCompare(toStableJson(right))
    })

  return {
    arguments: Array.isArray(statement.args)
      ? statement.args.map(argument => normalizeTriggerArgument(argument))
      : [],
    columns: (statement.columns as unknown[] | undefined || [])
      .map(entry => readStringNode(entry))
      .filter((entry): entry is string => Boolean(entry))
      .sort((left, right) => left.localeCompare(right)),
    constraint: statement.isconstraint === true,
    constraintTable: statement.constrrel ? normalizeRangeVar(statement.constrrel) : null,
    events: typeof statement.events === 'number' ? statement.events : null,
    level: statement.row === true ? 'row' : 'statement',
    name: typeof statement.trigname === 'string' ? statement.trigname : null,
    relation: statement.relation ? normalizeRangeVar(statement.relation) : null,
    routineName: readQualifiedName(statement.funcname as unknown[] | undefined),
    timing: typeof statement.timing === 'number' ? statement.timing : null,
    transitionRels: transitionRelations,
    when: statement.whenClause ? normalizeAstValue(statement.whenClause) : null
  }
}

const renderSequenceMetadataScalar = (value: unknown): string | null => {
  const integerValue = readIntegerNode(value)

  if (integerValue !== null) {
    return `${integerValue}`
  }

  const floatValue = readFloatNode(value)

  if (floatValue !== null) {
    return floatValue
  }

  const booleanValue = readBooleanNode(value)

  if (booleanValue !== null) {
    return booleanValue ? 'true' : 'false'
  }

  const stringValue = readStringNode(value)

  if (stringValue !== null) {
    return stringValue
  }

  const unwrappedNode = unwrapPgsqlNode(value)

  if (unwrappedNode?.type === 'TypeName') {
    const renderedTypeName = renderTypeName(unwrappedNode.node)
    return typeof renderedTypeName === 'string' ? renderedTypeName : toStableJson(renderedTypeName)
  }

  const stringValues = readListStringValues(value)

  if (stringValues) {
    return stringValues.join('.')
  }

  return null
}

const buildSequenceMetadataEntries = (statements: unknown[]) => {
  const metadata: PgmlSequenceMetadataEntry[] = []
  let sequenceName: string | null = null

  statements.forEach((statement) => {
    const unwrappedStatement = unwrapPgsqlNode(statement)

    if (!unwrappedStatement?.node || typeof unwrappedStatement.node !== 'object') {
      return
    }

    const parsedStatement = unwrappedStatement.node as Record<string, unknown>

    if (unwrappedStatement.type === 'CreateSeqStmt') {
      sequenceName = sequenceName || normalizeRangeVar(parsedStatement.sequence)

      collectDefElemEntries(parsedStatement.options as unknown[] | undefined).forEach((entry) => {
        const renderedValue = renderSequenceMetadataScalar(entry.argument)

        if (!renderedValue) {
          return
        }

        metadata.push({
          key: entry.name,
          value: renderedValue
        })
      })
    }

    if (unwrappedStatement.type === 'AlterSeqStmt') {
      sequenceName = sequenceName || normalizeRangeVar(parsedStatement.sequence)

      collectDefElemEntries(parsedStatement.options as unknown[] | undefined)
        .filter(entry => entry.name === 'owned_by')
        .forEach((entry) => {
          const renderedValue = renderSequenceMetadataScalar(entry.argument)

          if (!renderedValue) {
            return
          }

          metadata.push({
            key: 'owned_by',
            value: renderedValue
          })
        })
    }
  })

  return {
    metadata: normalizeBigintSequenceMetadataDefaults(normalizePgmlSequenceMetadataEntries(metadata, {
      normalizeOwnedBy: normalizeImportedTableColumnReference,
      normalizeType: normalizePgmlTypeExpression
    })),
    sequenceName
  }
}

export const buildPgmlRoutineSemanticModel = (
  source: string | null,
  version: PgmlExecutableParserVersion = defaultParserVersion
): PgmlRoutineSemanticModel | null => {
  if (!source || source.trim().length === 0) {
    return null
  }

  const cacheKey = buildCacheKey('routine', source, version)
  const cachedValue = routineSemanticCache.get(cacheKey) || null

  if (cachedValue) {
    return cachedValue
  }

  const parsed = parseWithLoadedParserSync(source, version)

  if (parsed.status !== 'parsed') {
    const result: PgmlRoutineSemanticModel = {
      diagnostics: parsed.diagnostics,
      fingerprint: null,
      parserVersion: version,
      status: parsed.status
    }

    routineSemanticCache.set(cacheKey, result)
    return result
  }

  if (parsed.statements.length !== 1) {
    const result: PgmlRoutineSemanticModel = {
      diagnostics: [],
      fingerprint: null,
      parserVersion: version,
      status: 'opaque'
    }

    routineSemanticCache.set(cacheKey, result)
    return result
  }

  const unwrappedStatement = unwrapPgsqlNode(parsed.statements[0])

  if (unwrappedStatement?.type !== 'CreateFunctionStmt' || !unwrappedStatement.node || typeof unwrappedStatement.node !== 'object') {
    const result: PgmlRoutineSemanticModel = {
      diagnostics: [],
      fingerprint: null,
      parserVersion: version,
      status: 'opaque'
    }

    routineSemanticCache.set(cacheKey, result)
    return result
  }

  const result: PgmlRoutineSemanticModel = {
    diagnostics: [],
    fingerprint: buildRoutineSemanticFingerprint(unwrappedStatement.node as Record<string, unknown>, version),
    parserVersion: version,
    status: 'parsed'
  }

  routineSemanticCache.set(cacheKey, result)
  return result
}

export const buildPgmlTriggerSemanticModel = (
  source: string | null,
  version: PgmlExecutableParserVersion = defaultParserVersion
): PgmlTriggerSemanticModel | null => {
  if (!source || source.trim().length === 0) {
    return null
  }

  const cacheKey = buildCacheKey('trigger', source, version)
  const cachedValue = triggerSemanticCache.get(cacheKey) || null

  if (cachedValue) {
    return cachedValue
  }

  const parsed = parseWithLoadedParserSync(source, version)

  if (parsed.status !== 'parsed') {
    const result: PgmlTriggerSemanticModel = {
      diagnostics: parsed.diagnostics,
      fingerprint: null,
      parserVersion: version,
      status: parsed.status
    }

    triggerSemanticCache.set(cacheKey, result)
    return result
  }

  if (parsed.statements.length !== 1) {
    const result: PgmlTriggerSemanticModel = {
      diagnostics: [],
      fingerprint: null,
      parserVersion: version,
      status: 'opaque'
    }

    triggerSemanticCache.set(cacheKey, result)
    return result
  }

  const unwrappedStatement = unwrapPgsqlNode(parsed.statements[0])

  if (unwrappedStatement?.type !== 'CreateTrigStmt' || !unwrappedStatement.node || typeof unwrappedStatement.node !== 'object') {
    const result: PgmlTriggerSemanticModel = {
      diagnostics: [],
      fingerprint: null,
      parserVersion: version,
      status: 'opaque'
    }

    triggerSemanticCache.set(cacheKey, result)
    return result
  }

  const result: PgmlTriggerSemanticModel = {
    diagnostics: [],
    fingerprint: buildTriggerSemanticFingerprint(unwrappedStatement.node as Record<string, unknown>),
    parserVersion: version,
    status: 'parsed'
  }

  triggerSemanticCache.set(cacheKey, result)
  return result
}

export const buildPgmlSequenceSemanticModel = (
  source: string | null,
  version: PgmlExecutableParserVersion = defaultParserVersion
): PgmlSequenceSemanticModel | null => {
  if (!source || source.trim().length === 0) {
    return null
  }

  const cacheKey = buildCacheKey('sequence', source, version)
  const cachedValue = sequenceSemanticCache.get(cacheKey) || null

  if (cachedValue) {
    return cachedValue
  }

  const parsed = parseWithLoadedParserSync(source, version)

  if (parsed.status !== 'parsed') {
    const result: PgmlSequenceSemanticModel = {
      diagnostics: parsed.diagnostics,
      fingerprint: null,
      parserVersion: version,
      status: parsed.status
    }

    sequenceSemanticCache.set(cacheKey, result)
    return result
  }

  if (parsed.statements.length === 0) {
    const result: PgmlSequenceSemanticModel = {
      diagnostics: [],
      fingerprint: null,
      parserVersion: version,
      status: 'opaque'
    }

    sequenceSemanticCache.set(cacheKey, result)
    return result
  }

  const hasOnlySequenceStatements = parsed.statements.every((statement) => {
    const unwrappedStatement = unwrapPgsqlNode(statement)
    return unwrappedStatement?.type === 'CreateSeqStmt' || unwrappedStatement?.type === 'AlterSeqStmt'
  })

  if (!hasOnlySequenceStatements) {
    const result: PgmlSequenceSemanticModel = {
      diagnostics: [],
      fingerprint: null,
      parserVersion: version,
      status: 'opaque'
    }

    sequenceSemanticCache.set(cacheKey, result)
    return result
  }

  const sequenceMetadata = buildSequenceMetadataEntries(parsed.statements)
  const result: PgmlSequenceSemanticModel = {
    diagnostics: [],
    fingerprint: {
      metadata: sequenceMetadata.metadata,
      name: sequenceMetadata.sequenceName
    },
    parserVersion: version,
    status: 'parsed'
  }

  sequenceSemanticCache.set(cacheKey, result)
  return result
}
