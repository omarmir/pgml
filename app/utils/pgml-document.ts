import { nanoid } from 'nanoid'
import {
  buildPgmlWithNodeProperties,
  dedentPgmlSourceForEditor,
  normalizePgmlSourceIndentation,
  parsePgml,
  stripPgmlPropertiesBlocks,
  type PgmlNodeProperties
} from './pgml'
import {
  clonePgmlDocumentSchemaMetadata,
  createEmptyPgmlDocumentSchemaMetadata,
  type PgmlDocumentColumnSchemaMetadata,
  type PgmlDocumentSchemaMetadata,
  type PgmlDocumentTableSchemaMetadata
} from './pgml-schema-metadata'

export type PgmlVersionRole = 'design' | 'implementation'

export type PgmlDocumentSnapshot = {
  source: string
}

export type PgmlDocumentDiagramView = {
  id: string
  name: string
  nodeProperties: Record<string, PgmlNodeProperties>
  showExecutableObjects: boolean
  showRelationshipLines: boolean
  showTableFields: boolean
}

export type PgmlWorkspaceDocumentBlock = {
  activeViewId: string | null
  basedOnVersionId: string | null
  snapshot: PgmlDocumentSnapshot
  updatedAt: string | null
  views: PgmlDocumentDiagramView[]
}

export type PgmlVersionDocumentBlock = {
  activeViewId: string | null
  createdAt: string
  id: string
  name: string | null
  parentVersionId: string | null
  role: PgmlVersionRole
  snapshot: PgmlDocumentSnapshot
  views: PgmlDocumentDiagramView[]
}

export type PgmlVersionSetDocument = {
  kind: 'versioned'
  name: string
  schemaMetadata: PgmlDocumentSchemaMetadata
  versions: PgmlVersionDocumentBlock[]
  workspace: PgmlWorkspaceDocumentBlock
}

export type PgmlDocumentEditorScope
  = | 'all'
    | 'workspace-block'
    | `version:${string}`

type PgmlNamedBlock = {
  body: string[]
  header: string
}

type PgmlViewOwnerBlock = {
  activeViewId: string | null
  snapshot: PgmlDocumentSnapshot
  views: PgmlDocumentDiagramView[]
}

const workspaceKeyword = 'Workspace'
const snapshotKeyword = 'Snapshot'
const schemaMetadataKeyword = 'SchemaMetadata'
const viewKeyword = 'View'
const defaultPgmlDocumentViewName = 'Default'

const createPgmlVersionId = () => {
  return `v_${nanoid()}`
}

const createPgmlDocumentViewId = () => {
  return `view_${nanoid()}`
}

const normalizeLineEndings = (value: string) => {
  return value.replaceAll('\r\n', '\n')
}

const clonePgmlNodePropertiesRecord = (nodeProperties: Record<string, PgmlNodeProperties>) => {
  return Object.entries(nodeProperties).reduce<Record<string, PgmlNodeProperties>>((entries, [id, properties]) => {
    entries[id] = {
      ...properties
    }

    return entries
  }, {})
}

export const createPgmlDocumentView = (input?: {
  id?: string | null
  name?: string | null
  nodeProperties?: Record<string, PgmlNodeProperties>
  showExecutableObjects?: boolean
  showRelationshipLines?: boolean
  showTableFields?: boolean
}) => {
  return {
    id: input?.id && input.id.trim().length > 0 ? input.id.trim() : createPgmlDocumentViewId(),
    name: input?.name && input.name.trim().length > 0 ? input.name.trim() : defaultPgmlDocumentViewName,
    nodeProperties: clonePgmlNodePropertiesRecord(input?.nodeProperties || {}),
    showExecutableObjects: input?.showExecutableObjects ?? true,
    showRelationshipLines: input?.showRelationshipLines ?? true,
    showTableFields: input?.showTableFields ?? true
  } satisfies PgmlDocumentDiagramView
}

export const clonePgmlDocumentView = (view: PgmlDocumentDiagramView) => {
  return createPgmlDocumentView(view)
}

const getPgmlDocumentViewById = (
  views: PgmlDocumentDiagramView[],
  viewId: string | null | undefined
) => {
  if (!viewId) {
    return null
  }

  return views.find(view => view.id === viewId) || null
}

const resolvePgmlDocumentViewId = (
  views: PgmlDocumentDiagramView[],
  preferredViewId: string | null | undefined
) => {
  const preferredView = getPgmlDocumentViewById(views, preferredViewId)

  if (preferredView) {
    return preferredView.id
  }

  return views[0]?.id || null
}

const normalizePgmlDocumentViews = (input: {
  activeViewId?: string | null
  ensureView?: boolean
  views?: PgmlDocumentDiagramView[]
}) => {
  const nextViews = (input.views || []).map((view, index) => {
    return createPgmlDocumentView({
      ...view,
      name: view.name && view.name.trim().length > 0 ? view.name : (index === 0 ? defaultPgmlDocumentViewName : `View ${index + 1}`)
    })
  })

  if (nextViews.length === 0 && input.ensureView !== false) {
    nextViews.push(createPgmlDocumentView())
  }

  return {
    activeViewId: resolvePgmlDocumentViewId(nextViews, input.activeViewId),
    views: nextViews
  }
}

const mergePgmlNodeProperties = (
  baseProperties: Record<string, PgmlNodeProperties>,
  overrideProperties: Record<string, PgmlNodeProperties>
) => {
  const mergedProperties = clonePgmlNodePropertiesRecord(baseProperties)

  Object.entries(overrideProperties).forEach(([id, properties]) => {
    mergedProperties[id] = {
      ...(mergedProperties[id] || {}),
      ...properties
    }
  })

  return mergedProperties
}

const splitSnapshotSourceFromLegacyProperties = (source: string) => {
  const normalizedSource = normalizePgmlSnapshotSource(source)

  return {
    nodeProperties: parsePgml(normalizedSource).nodeProperties,
    snapshotSource: normalizePgmlSnapshotSource(stripPgmlPropertiesBlocks(normalizedSource))
  }
}

const normalizeViewOwnerBlock = (
  input: PgmlViewOwnerBlock
) => {
  const {
    nodeProperties: legacyNodeProperties,
    snapshotSource
  } = splitSnapshotSourceFromLegacyProperties(input.snapshot.source)
  const normalizedViews = normalizePgmlDocumentViews({
    activeViewId: input.activeViewId,
    views: input.views
  })

  if (Object.keys(legacyNodeProperties).length > 0) {
    const targetViewId = normalizedViews.activeViewId || normalizedViews.views[0]?.id || null
    const targetViewIndex = normalizedViews.views.findIndex(view => view.id === targetViewId)

    if (targetViewIndex >= 0) {
      const targetView = normalizedViews.views[targetViewIndex]!

      normalizedViews.views[targetViewIndex] = createPgmlDocumentView({
        ...targetView,
        nodeProperties: mergePgmlNodeProperties(legacyNodeProperties, targetView.nodeProperties)
      })
    }
  }

  return {
    activeViewId: normalizedViews.activeViewId,
    snapshot: {
      source: snapshotSource
    },
    views: normalizedViews.views
  }
}

export const normalizePgmlSnapshotSource = (value: string) => {
  // Snapshot sources are serialized inside Workspace/Version wrappers, but the
  // editor always works on the inner body. Normalizing here keeps equality,
  // dirty-state checks, and round-trips aligned on that canonical form.
  return normalizePgmlSourceIndentation(normalizeLineEndings(value)).trim()
}

export const getPgmlVersionRoleDisplayLabel = (role: PgmlVersionRole) => {
  return role === 'implementation' ? 'Implementation' : 'Design'
}

export const getPgmlVersionDisplayLabel = (version: PgmlVersionDocumentBlock) => {
  return version.name && version.name.trim().length > 0 ? version.name : version.id
}

const normalizePgmlTimestamp = (value: string, context: string) => {
  const parsedTimestamp = new Date(value)

  if (Number.isNaN(parsedTimestamp.getTime())) {
    throw new Error(`${context} requires a valid ISO timestamp.`)
  }

  return parsedTimestamp.toISOString()
}

const comparePgmlVersionsByRecency = (
  left: PgmlVersionDocumentBlock,
  right: PgmlVersionDocumentBlock
) => {
  // Timestamps are the primary ordering key for timeline-style operations.
  // Version id remains the deterministic tie-breaker for equal timestamps.
  if (left.createdAt !== right.createdAt) {
    return right.createdAt.localeCompare(left.createdAt)
  }

  return right.id.localeCompare(left.id)
}

const getLatestPgmlVersionFromList = (versions: PgmlVersionDocumentBlock[]) => {
  // Callers often need the most recent item from a pre-filtered slice such as
  // roots, leaves, or one role. Centralizing the sort keeps those selectors in
  // sync with the same timestamp + id ordering semantics.
  return [...versions].sort(comparePgmlVersionsByRecency)[0] || null
}

const getLatestPgmlVersionByPredicate = (
  document: PgmlVersionSetDocument,
  predicate: (version: PgmlVersionDocumentBlock) => boolean
) => {
  // Most "latest" lookups differ only by the subset of versions they consider.
  // Centralizing the filter keeps recency semantics consistent across roots,
  // leaves, role-specific helpers, and future graph-derived selectors.
  return getLatestPgmlVersionFromList(document.versions.filter(predicate))
}

const filterPgmlVersionsByParentId = (
  document: PgmlVersionSetDocument,
  parentVersionId: string | null
) => {
  // Parent id `null` is the root of a branch; non-null parent ids describe the
  // direct edge between checkpoints in the version graph.
  return document.versions.filter(version => version.parentVersionId === parentVersionId)
}

export const arePgmlSnapshotsEquivalent = (
  leftSource: string,
  rightSource: string,
  includeLayout = true
) => {
  const normalizedLeftSource = includeLayout
    ? normalizePgmlSnapshotSource(leftSource)
    : normalizePgmlSnapshotSource(stripPgmlPropertiesBlocks(leftSource))
  const normalizedRightSource = includeLayout
    ? normalizePgmlSnapshotSource(rightSource)
    : normalizePgmlSnapshotSource(stripPgmlPropertiesBlocks(rightSource))

  return normalizedLeftSource === normalizedRightSource
}

const normalizePgmlDocumentViewForComparison = (view: PgmlDocumentDiagramView) => {
  return {
    name: view.name,
    nodePropertiesSource: buildPgmlWithNodeProperties('', view.nodeProperties),
    showExecutableObjects: view.showExecutableObjects,
    showRelationshipLines: view.showRelationshipLines,
    showTableFields: view.showTableFields
  }
}

const hasMeaningfulPgmlDocumentViewState = (owner: PgmlViewOwnerBlock) => {
  if (owner.views.length === 0) {
    return false
  }

  if (owner.views.length > 1) {
    return true
  }

  const firstView = owner.views[0]

  if (!firstView) {
    return false
  }

  if (firstView.name !== defaultPgmlDocumentViewName) {
    return true
  }

  if (owner.activeViewId !== firstView.id) {
    return true
  }

  if (!firstView.showRelationshipLines || !firstView.showExecutableObjects || !firstView.showTableFields) {
    return true
  }

  return Object.keys(firstView.nodeProperties).length > 0
}

const arePgmlViewOwnersEquivalent = (
  leftOwner: PgmlViewOwnerBlock,
  rightOwner: PgmlViewOwnerBlock
) => {
  const leftActiveView = getPgmlDocumentView(leftOwner, leftOwner.activeViewId)
  const rightActiveView = getPgmlDocumentView(rightOwner, rightOwner.activeViewId)

  return JSON.stringify({
    activeViewName: leftActiveView?.name || null,
    views: leftOwner.views.map(normalizePgmlDocumentViewForComparison)
  }) === JSON.stringify({
    activeViewName: rightActiveView?.name || null,
    views: rightOwner.views.map(normalizePgmlDocumentViewForComparison)
  })
}

export const isPgmlWorkspaceDirty = (
  document: PgmlVersionSetDocument,
  includeLayout = true
) => {
  const baseVersion = getPgmlWorkspaceBaseVersion(document)

  if (!baseVersion) {
    // A document without checkpoints treats any non-empty workspace snapshot
    // as meaningful draft state that still needs its first locked version.
    return normalizePgmlSnapshotSource(document.workspace.snapshot.source).length > 0
      || (includeLayout && hasMeaningfulPgmlDocumentViewState(document.workspace))
  }

  const snapshotsDiffer = !arePgmlSnapshotsEquivalent(
    document.workspace.snapshot.source,
    baseVersion.snapshot.source,
    includeLayout
  )

  if (snapshotsDiffer) {
    return true
  }

  return includeLayout && !arePgmlViewOwnersEquivalent(document.workspace, baseVersion)
}

export const canCreatePgmlCheckpoint = (
  document: PgmlVersionSetDocument,
  includeLayout = true
) => {
  return isPgmlWorkspaceDirty(document, includeLayout)
}

export const buildPgmlCheckpointName = (
  document: PgmlVersionSetDocument,
  input: {
    createdAt: string
    role: PgmlVersionRole
  }
) => {
  const roleLabel = getPgmlVersionRoleDisplayLabel(input.role)
  const roleVersionCount = getPgmlVersionRoleCount(document, input.role) + 1
  const normalizedDate = input.createdAt.slice(0, 10)

  return `${roleLabel} checkpoint ${roleVersionCount} · ${normalizedDate}`
}

export const getPgmlDocumentVersionStats = (
  document: PgmlVersionSetDocument,
  includeLayout = true
) => {
  return {
    branchVersionCount: document.versions.filter((version) => {
      return getPgmlChildVersions(document, version.parentVersionId).length > 1
    }).length,
    designVersionCount: getPgmlVersionRoleCount(document, 'design'),
    implementationVersionCount: getPgmlVersionRoleCount(document, 'implementation'),
    rootVersionCount: getPgmlRootVersionCount(document),
    versionCount: getPgmlVersionCount(document),
    workspaceDirty: isPgmlWorkspaceDirty(document, includeLayout)
  }
}

export const getPgmlNearestCommonAncestor = (
  document: PgmlVersionSetDocument,
  leftVersionId: string | null,
  rightVersionId: string | null
) => {
  const versionsById = getPgmlVersionMap(document)
  const leftLineageIds = new Set(getPgmlVersionLineageFromMap(versionsById, leftVersionId).map(version => version.id))
  const rightLineage = getPgmlVersionLineageFromMap(versionsById, rightVersionId)

  for (let index = rightLineage.length - 1; index >= 0; index -= 1) {
    const candidateVersion = rightLineage[index]

    if (candidateVersion && leftLineageIds.has(candidateVersion.id)) {
      return candidateVersion
    }
  }

  return null
}

export const getLatestPgmlVersion = (document: PgmlVersionSetDocument) => {
  return getLatestPgmlVersionByPredicate(document, () => true)
}

export const getLatestPgmlVersionByRole = (
  document: PgmlVersionSetDocument,
  role: PgmlVersionRole
) => {
  return getLatestPgmlVersionByPredicate(document, version => version.role === role)
}

export const getLatestPgmlLeafVersion = (document: PgmlVersionSetDocument) => {
  const leafVersionIds = new Set(getPgmlLeafVersions(document).map(version => version.id))

  return getLatestPgmlVersionByPredicate(document, version => leafVersionIds.has(version.id))
}

export const getLatestPgmlLeafVersionByRole = (
  document: PgmlVersionSetDocument,
  role: PgmlVersionRole
) => {
  const leafVersionIds = new Set(getPgmlLeafVersions(document).map(version => version.id))

  return getLatestPgmlVersionByPredicate(document, (version) => {
    return version.role === role && leafVersionIds.has(version.id)
  })
}

export const getLatestPgmlRootVersion = (document: PgmlVersionSetDocument) => {
  const rootVersionIds = new Set(getPgmlRootVersions(document).map(version => version.id))

  return getLatestPgmlVersionByPredicate(document, version => rootVersionIds.has(version.id))
}

export const getLatestPgmlRootVersionByRole = (
  document: PgmlVersionSetDocument,
  role: PgmlVersionRole
) => {
  const rootVersionIds = new Set(getPgmlRootVersions(document).map(version => version.id))

  return getLatestPgmlVersionByPredicate(document, (version) => {
    return version.role === role && rootVersionIds.has(version.id)
  })
}

export const getPgmlRootVersions = (document: PgmlVersionSetDocument) => {
  return filterPgmlVersionsByParentId(document, null)
}

export const getPgmlRootVersionCount = (document: PgmlVersionSetDocument) => {
  return getPgmlRootVersions(document).length
}

export const isPgmlRootVersion = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  return getPgmlRootVersions(document).some(version => version.id === versionId)
}

export const getPgmlVersionCount = (document: PgmlVersionSetDocument) => {
  return document.versions.length
}

export const getPgmlVersionRoleCount = (
  document: PgmlVersionSetDocument,
  role: PgmlVersionRole
) => {
  return document.versions.filter(version => version.role === role).length
}

export const hasPgmlVersionRole = (
  document: PgmlVersionSetDocument,
  role: PgmlVersionRole
) => {
  return getPgmlVersionRoleCount(document, role) > 0
}

export const hasPgmlVersions = (document: PgmlVersionSetDocument) => {
  return getPgmlVersionCount(document) > 0
}

export const getPgmlLeafVersions = (document: PgmlVersionSetDocument) => {
  // Leaves are the checkpoints that nothing else builds on yet, so they define
  // branch tips and the latest immutable endpoints available for compare/restore.
  const parentIds = new Set(
    document.versions
      .map(version => version.parentVersionId)
      .filter((versionId): versionId is string => versionId !== null)
  )

  return document.versions.filter(version => !parentIds.has(version.id))
}

export const getPgmlLeafVersionCount = (document: PgmlVersionSetDocument) => {
  return getPgmlLeafVersions(document).length
}

export const isPgmlLeafVersion = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  return getPgmlLeafVersions(document).some(version => version.id === versionId)
}

const trimQuotedValue = (value: string) => {
  const trimmed = value.trim()
  const doubleQuotedMatch = trimmed.match(/^"(.*)"$/u)

  if (doubleQuotedMatch) {
    return doubleQuotedMatch[1] || ''
  }

  const singleQuotedMatch = trimmed.match(/^'(.*)'$/u)

  if (singleQuotedMatch) {
    return singleQuotedMatch[1] || ''
  }

  return trimmed
}

const quoteMetadataValue = (value: string) => {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

const indentLines = (value: string, level: number) => {
  const indent = '  '.repeat(level)

  return normalizeLineEndings(value)
    .split('\n')
    .map((line) => {
      return line.length > 0 ? `${indent}${line}` : ''
    })
    .join('\n')
}

const collectBlocks = (source: string) => {
  const lines = normalizeLineEndings(source).split('\n')
  const topLevel: string[] = []
  const blocks: PgmlNamedBlock[] = []
  let index = 0

  while (index < lines.length) {
    const rawLine = lines[index] || ''
    const trimmed = rawLine.trim()

    if (trimmed.length === 0 || trimmed.startsWith('//')) {
      index += 1
      continue
    }

    if (trimmed.endsWith('{')) {
      const header = trimmed.slice(0, -1).trim()
      const body: string[] = []
      let depth = 1

      index += 1

      while (index < lines.length && depth > 0) {
        const nextLine = lines[index] || ''
        const nextTrimmed = nextLine.trim()

        if (nextTrimmed.endsWith('{')) {
          depth += 1
        }

        if (nextTrimmed === '}') {
          depth -= 1

          if (depth === 0) {
            index += 1
            break
          }
        }

        if (depth > 0) {
          body.push(nextLine)
        }

        index += 1
      }

      blocks.push({
        body,
        header
      })
      continue
    }

    topLevel.push(trimmed)
    index += 1
  }

  return {
    blocks,
    topLevel
  }
}

const parseMetadataEntry = (line: string) => {
  const match = line.trim().match(/^([^:]+):\s*(.+)$/u)

  if (!match) {
    return null
  }

  return {
    key: (match[1] || '').trim().toLowerCase().replaceAll(/[^\w]+/g, '_'),
    value: trimQuotedValue(match[2] || '')
  }
}

const parseSchemaMetadataEntry = (line: string) => {
  const match = line.trim().match(/^([^:]+):\s*(.+)$/u)

  if (!match) {
    return null
  }

  return {
    key: (match[1] || '').trim(),
    value: trimQuotedValue(match[2] || '')
  }
}

const assertNoUnexpectedTopLevelLines = (lines: string[], context: string) => {
  if (lines.length > 0) {
    throw new Error(`${context} only allows metadata entries and nested blocks.`)
  }
}

const collectBlockMetadata = (
  lines: string[],
  context: string
) => {
  const metadata = lines.reduce<Record<string, string>>((entries, line) => {
    const entry = parseMetadataEntry(line)

    if (entry) {
      entries[entry.key] = entry.value
    }

    return entries
  }, {})

  assertNoUnexpectedTopLevelLines(
    lines.filter(line => parseMetadataEntry(line) === null),
    context
  )

  return metadata
}

const getRequiredMetadataValue = (
  metadata: Record<string, string>,
  key: string,
  context: string
) => {
  const value = metadata[key]

  if (!value || value.trim().length === 0) {
    throw new Error(`${context} requires ${key}.`)
  }

  return value
}

const getVersionSetName = (header: string) => {
  const match = header.match(/^VersionSet\s+(.+)$/u)

  if (!match) {
    return null
  }

  return trimQuotedValue(match[1] || '')
}

const getVersionId = (header: string) => {
  const match = header.match(/^Version\s+([A-Za-z][\w-]*)$/u)

  if (!match) {
    return null
  }

  return match[1] || null
}

const getViewName = (header: string) => {
  const match = header.match(/^View\s+(.+)$/u)

  if (!match) {
    return null
  }

  return trimQuotedValue(match[1] || '')
}

const getSchemaMetadataTarget = (
  header: string,
  keyword: 'Table' | 'Column'
) => {
  const match = header.match(new RegExp(`^${keyword}\\s+(.+)$`, 'u'))

  if (!match) {
    return null
  }

  return trimQuotedValue(match[1] || '')
}

const parseSchemaMetadataEntries = (
  lines: string[],
  context: string
) => {
  const entries = lines.reduce<Array<{ key: string, value: string }>>((nextEntries, line) => {
    const entry = parseSchemaMetadataEntry(line)

    if (entry) {
      nextEntries.push(entry)
    }

    return nextEntries
  }, [])

  assertNoUnexpectedTopLevelLines(
    lines.filter(line => parseSchemaMetadataEntry(line) === null),
    context
  )

  return entries
}

const parseSchemaMetadataTableBlock = (
  block: PgmlNamedBlock
): PgmlDocumentTableSchemaMetadata => {
  const tableId = getSchemaMetadataTarget(block.header, 'Table')

  if (!tableId || tableId.trim().length === 0) {
    throw new Error('SchemaMetadata Table blocks require a table identifier.')
  }

  const nested = collectBlocks(block.body.join('\n'))

  if (nested.blocks.length > 0) {
    throw new Error(`SchemaMetadata Table ${tableId} only allows metadata entries.`)
  }

  return {
    entries: parseSchemaMetadataEntries(nested.topLevel, `SchemaMetadata Table ${tableId}`),
    tableId
  }
}

const parseSchemaMetadataColumnBlock = (
  block: PgmlNamedBlock
): PgmlDocumentColumnSchemaMetadata => {
  const columnTarget = getSchemaMetadataTarget(block.header, 'Column')

  if (!columnTarget || columnTarget.trim().length === 0) {
    throw new Error('SchemaMetadata Column blocks require a column identifier.')
  }

  const normalizedTarget = columnTarget.trim()
  const lastSeparatorIndex = normalizedTarget.lastIndexOf('.')

  if (lastSeparatorIndex <= 0 || lastSeparatorIndex === normalizedTarget.length - 1) {
    throw new Error(`SchemaMetadata Column ${columnTarget} must use schema.table.column syntax.`)
  }

  const nested = collectBlocks(block.body.join('\n'))

  if (nested.blocks.length > 0) {
    throw new Error(`SchemaMetadata Column ${columnTarget} only allows metadata entries.`)
  }

  return {
    columnName: normalizedTarget.slice(lastSeparatorIndex + 1),
    entries: parseSchemaMetadataEntries(nested.topLevel, `SchemaMetadata Column ${columnTarget}`),
    tableId: normalizedTarget.slice(0, lastSeparatorIndex)
  }
}

const parseSchemaMetadataBlock = (block: PgmlNamedBlock): PgmlDocumentSchemaMetadata => {
  if (block.header !== schemaMetadataKeyword) {
    throw new Error('VersionSet SchemaMetadata blocks must use `SchemaMetadata {`.')
  }

  const nested = collectBlocks(block.body.join('\n'))

  if (nested.topLevel.length > 0) {
    throw new Error('SchemaMetadata only allows Table and Column blocks.')
  }

  if (nested.blocks.some((nestedBlock) => {
    return getSchemaMetadataTarget(nestedBlock.header, 'Table') === null
      && getSchemaMetadataTarget(nestedBlock.header, 'Column') === null
  })) {
    throw new Error('SchemaMetadata only allows Table and Column blocks.')
  }

  return clonePgmlDocumentSchemaMetadata({
    columns: nested.blocks
      .filter(nestedBlock => getSchemaMetadataTarget(nestedBlock.header, 'Column') !== null)
      .map(parseSchemaMetadataColumnBlock),
    tables: nested.blocks
      .filter(nestedBlock => getSchemaMetadataTarget(nestedBlock.header, 'Table') !== null)
      .map(parseSchemaMetadataTableBlock)
  })
}

const parseSnapshotBlock = (block: PgmlNamedBlock, context: string) => {
  if (block.header !== snapshotKeyword) {
    throw new Error(`${context} requires a Snapshot block.`)
  }

  return {
    // Snapshot blocks are serialized inside Workspace/Version wrappers, so the
    // parser must remove that wrapper indentation before handing the snapshot
    // back to the live workspace editor.
    source: normalizePgmlSnapshotSource(dedentPgmlSourceForEditor(block.body.join('\n')))
  } satisfies PgmlDocumentSnapshot
}

const parseViewBooleanMetadata = (value: string | undefined, fallback: boolean) => {
  if (!value) {
    return fallback
  }

  if (value === 'true') {
    return true
  }

  if (value === 'false') {
    return false
  }

  return fallback
}

const parseViewBlock = (block: PgmlNamedBlock, context: string): PgmlDocumentDiagramView => {
  const viewName = getViewName(block.header)

  if (!viewName || viewName.trim().length === 0) {
    throw new Error(`${context} View blocks require a quoted name.`)
  }

  const nested = collectBlocks(block.body.join('\n'))
  const metadata = collectBlockMetadata(nested.topLevel, `${context} View ${viewName}`)

  if (nested.blocks.some(nestedBlock => !nestedBlock.header.startsWith('Properties '))) {
    throw new Error(`${context} View ${viewName} only allows nested Properties blocks.`)
  }

  const viewSource = nested.blocks.map((nestedBlock) => {
    return `${nestedBlock.header} {\n${nestedBlock.body.join('\n')}\n}`
  }).join('\n\n')

  return createPgmlDocumentView({
    id: metadata.id || null,
    name: viewName,
    nodeProperties: viewSource.length > 0 ? parsePgml(viewSource).nodeProperties : {},
    showExecutableObjects: parseViewBooleanMetadata(
      metadata.show_execs || metadata.execs,
      true
    ),
    showRelationshipLines: parseViewBooleanMetadata(
      metadata.show_lines || metadata.lines,
      true
    ),
    showTableFields: parseViewBooleanMetadata(
      metadata.show_fields || metadata.fields,
      true
    )
  })
}

const parseWorkspaceBlock = (block: PgmlNamedBlock): PgmlWorkspaceDocumentBlock => {
  if (block.header !== workspaceKeyword) {
    throw new Error('VersionSet requires a Workspace block.')
  }

  const nested = collectBlocks(block.body.join('\n'))
  const metadata = collectBlockMetadata(nested.topLevel, 'Workspace')

  const snapshotBlocks = nested.blocks.filter(nestedBlock => nestedBlock.header === snapshotKeyword)
  const viewBlocks = nested.blocks.filter(nestedBlock => getViewName(nestedBlock.header) !== null)

  if (snapshotBlocks.length !== 1) {
    throw new Error('Workspace requires exactly one Snapshot block.')
  }

  if (snapshotBlocks.length + viewBlocks.length !== nested.blocks.length) {
    throw new Error('Workspace only allows Snapshot and View blocks.')
  }

  const normalizedWorkspace = normalizeViewOwnerBlock({
    activeViewId: metadata.active_view || null,
    snapshot: parseSnapshotBlock(snapshotBlocks[0]!, 'Workspace'),
    views: viewBlocks.map(viewBlock => parseViewBlock(viewBlock, 'Workspace'))
  })

  return {
    activeViewId: normalizedWorkspace.activeViewId,
    basedOnVersionId: metadata.based_on || null,
    snapshot: normalizedWorkspace.snapshot,
    updatedAt: metadata.updated_at ? normalizePgmlTimestamp(metadata.updated_at, 'Workspace updated_at') : null,
    views: normalizedWorkspace.views
  }
}

const parseVersionBlock = (block: PgmlNamedBlock): PgmlVersionDocumentBlock => {
  const versionId = getVersionId(block.header)

  if (!versionId) {
    throw new Error('Invalid Version block header.')
  }

  const nested = collectBlocks(block.body.join('\n'))
  const metadata = collectBlockMetadata(nested.topLevel, `Version ${versionId}`)
  const snapshotBlocks = nested.blocks.filter(nestedBlock => nestedBlock.header === snapshotKeyword)
  const viewBlocks = nested.blocks.filter(nestedBlock => getViewName(nestedBlock.header) !== null)

  const role = metadata.role

  if (role !== 'design' && role !== 'implementation') {
    throw new Error(`Version ${versionId} requires role to be design or implementation.`)
  }

  if (snapshotBlocks.length !== 1) {
    throw new Error(`Version ${versionId} requires exactly one Snapshot block.`)
  }

  if (snapshotBlocks.length + viewBlocks.length !== nested.blocks.length) {
    throw new Error(`Version ${versionId} only allows Snapshot and View blocks.`)
  }

  const normalizedVersion = normalizeViewOwnerBlock({
    activeViewId: metadata.active_view || metadata.default_view || null,
    snapshot: parseSnapshotBlock(snapshotBlocks[0]!, `Version ${versionId}`),
    views: viewBlocks.map(viewBlock => parseViewBlock(viewBlock, `Version ${versionId}`))
  })

  return {
    activeViewId: normalizedVersion.activeViewId,
    createdAt: normalizePgmlTimestamp(
      getRequiredMetadataValue(metadata, 'created_at', `Version ${versionId}`),
      `Version ${versionId} created_at`
    ),
    id: versionId,
    name: metadata.name || null,
    parentVersionId: metadata.parent || null,
    role,
    snapshot: normalizedVersion.snapshot,
    views: normalizedVersion.views
  }
}

const partitionVersionSetBlocks = (blocks: PgmlNamedBlock[]) => {
  const schemaMetadataBlocks = blocks.filter(block => block.header === schemaMetadataKeyword)
  const workspaceBlocks = blocks.filter(block => block.header === workspaceKeyword)
  const versionBlocks = blocks.filter(block => getVersionId(block.header) !== null)

  return {
    schemaMetadataBlocks,
    versionBlocks,
    workspaceBlocks
  }
}

const validateVersionSetDocument = (document: PgmlVersionSetDocument) => {
  const versionIds = new Set<string>()
  const schemaMetadataTableIds = new Set<string>()
  const schemaMetadataColumnIds = new Set<string>()
  const versionsById = new Map(document.versions.map(version => [version.id, version] as const))
  let rootVersionCount = 0
  const validateViewOwner = (
    owner: PgmlViewOwnerBlock,
    context: string
  ) => {
    const viewIds = new Set<string>()
    const viewNames = new Set<string>()

    owner.views.forEach((view) => {
      if (viewIds.has(view.id)) {
        throw new Error(`${context} duplicates view id ${view.id}.`)
      }

      if (viewNames.has(view.name)) {
        throw new Error(`${context} duplicates view name ${view.name}.`)
      }

      viewIds.add(view.id)
      viewNames.add(view.name)
    })

    if (owner.activeViewId && !viewIds.has(owner.activeViewId)) {
      throw new Error(`${context} active_view references missing view ${owner.activeViewId}.`)
    }
  }

  document.schemaMetadata.tables.forEach((entry) => {
    if (schemaMetadataTableIds.has(entry.tableId)) {
      throw new Error(`SchemaMetadata duplicates table metadata for ${entry.tableId}.`)
    }

    schemaMetadataTableIds.add(entry.tableId)
  })

  document.schemaMetadata.columns.forEach((entry) => {
    const columnId = `${entry.tableId}.${entry.columnName}`

    if (schemaMetadataColumnIds.has(columnId)) {
      throw new Error(`SchemaMetadata duplicates column metadata for ${columnId}.`)
    }

    schemaMetadataColumnIds.add(columnId)
  })

  validateViewOwner(document.workspace, 'Workspace')

  document.versions.forEach((version) => {
    validateViewOwner(version, `Version ${version.id}`)

    if (versionIds.has(version.id)) {
      throw new Error(`Version ${version.id} is duplicated.`)
    }

    versionIds.add(version.id)

    if (version.parentVersionId === version.id) {
      throw new Error(`Version ${version.id} cannot reference itself as parent.`)
    }

    if (version.parentVersionId === null) {
      rootVersionCount += 1
      return
    }

    if (!versionsById.has(version.parentVersionId)) {
      throw new Error(`Version ${version.id} references missing parent ${version.parentVersionId}.`)
    }
  })

  if (document.versions.length > 0 && rootVersionCount === 0) {
    throw new Error('VersionSet requires at least one root Version.')
  }

  if (document.versions.length > 0 && !document.workspace.basedOnVersionId) {
    throw new Error('Workspace requires based_on when versions exist.')
  }

  if (
    document.workspace.basedOnVersionId
    && !document.versions.some(version => version.id === document.workspace.basedOnVersionId)
  ) {
    throw new Error(`Workspace based_on references missing version ${document.workspace.basedOnVersionId}.`)
  }

  document.versions.forEach((version) => {
    const ancestry = new Set<string>([version.id])
    let currentParentId = version.parentVersionId

    while (currentParentId) {
      if (ancestry.has(currentParentId)) {
        throw new Error(`Version ${version.id} forms a parent cycle through ${currentParentId}.`)
      }

      ancestry.add(currentParentId)
      currentParentId = versionsById.get(currentParentId)?.parentVersionId || null
    }
  })
}

export const parsePgmlDocument = (source: string): PgmlVersionSetDocument => {
  const normalizedSource = normalizeLineEndings(source).trim()
  const collected = collectBlocks(normalizedSource)

  if (collected.topLevel.length > 0) {
    throw new Error('Versioned PGML only allows VersionSet at the top level.')
  }

  if (collected.blocks.length !== 1) {
    throw new Error('Versioned PGML requires exactly one VersionSet root block.')
  }

  const rootBlock = collected.blocks[0]!
  const documentName = getVersionSetName(rootBlock.header)

  if (!documentName || documentName.trim().length === 0) {
    throw new Error('VersionSet requires a name.')
  }

  const nested = collectBlocks(rootBlock.body.join('\n'))

  if (nested.topLevel.length > 0) {
    throw new Error('VersionSet only allows SchemaMetadata, Workspace, and Version blocks.')
  }

  // VersionSet is intentionally strict: the root only coordinates workspace
  // state and immutable Version blocks. All schema entities live inside nested
  // Snapshot blocks, never directly under the document root.
  const {
    schemaMetadataBlocks,
    versionBlocks,
    workspaceBlocks
  } = partitionVersionSetBlocks(nested.blocks)

  if (workspaceBlocks.length !== 1) {
    throw new Error('VersionSet requires exactly one Workspace block.')
  }

  if (schemaMetadataBlocks.length > 1) {
    throw new Error('VersionSet only allows one SchemaMetadata block.')
  }

  if (schemaMetadataBlocks.length + workspaceBlocks.length + versionBlocks.length !== nested.blocks.length) {
    throw new Error('VersionSet only allows SchemaMetadata, Workspace, and Version blocks.')
  }

  const document: PgmlVersionSetDocument = {
    kind: 'versioned',
    name: documentName,
    schemaMetadata: schemaMetadataBlocks[0]
      ? parseSchemaMetadataBlock(schemaMetadataBlocks[0]!)
      : createEmptyPgmlDocumentSchemaMetadata(),
    versions: versionBlocks.map(parseVersionBlock),
    workspace: parseWorkspaceBlock(workspaceBlocks[0]!)
  }

  validateVersionSetDocument(document)

  return document
}

const buildSnapshotBlock = (snapshot: PgmlDocumentSnapshot, level: number) => {
  const normalizedSource = normalizePgmlSnapshotSource(snapshot.source)
  const lines = [`${'  '.repeat(level)}Snapshot {`]

  if (normalizedSource.length > 0) {
    lines.push(indentLines(normalizedSource, level + 1))
  }

  lines.push(`${'  '.repeat(level)}}`)

  return lines.join('\n')
}

const buildMetadataLine = (
  key: string,
  value: string,
  level: number,
  quoteValue = false
) => {
  return `${'  '.repeat(level)}${key}: ${quoteValue ? quoteMetadataValue(value) : value}`
}

const pushMetadataSpacer = (lines: string[]) => {
  if (lines.length > 1) {
    lines.push('')
  }
}

const buildViewBlock = (
  view: PgmlDocumentDiagramView,
  level: number
) => {
  const lines = [`${'  '.repeat(level)}${viewKeyword} ${quoteMetadataValue(view.name)} {`]
  const propertiesSource = buildPgmlWithNodeProperties('', view.nodeProperties)

  lines.push(buildMetadataLine('id', view.id, level + 1))

  if (!view.showRelationshipLines) {
    lines.push(buildMetadataLine('show_lines', 'false', level + 1))
  }

  if (!view.showExecutableObjects) {
    lines.push(buildMetadataLine('show_execs', 'false', level + 1))
  }

  if (!view.showTableFields) {
    lines.push(buildMetadataLine('show_fields', 'false', level + 1))
  }

  if (propertiesSource.length > 0) {
    lines.push('')
    lines.push(indentLines(propertiesSource, level + 1))
  }

  lines.push(`${'  '.repeat(level)}}`)

  return lines.join('\n')
}

const buildWorkspaceBlock = (
  workspace: PgmlWorkspaceDocumentBlock,
  level = 1
) => {
  const lines = [`${'  '.repeat(level)}Workspace {`]

  if (workspace.basedOnVersionId) {
    lines.push(buildMetadataLine('based_on', workspace.basedOnVersionId, level + 1))
  }

  if (workspace.updatedAt) {
    lines.push(buildMetadataLine('updated_at', workspace.updatedAt, level + 1, true))
  }

  if (workspace.activeViewId) {
    lines.push(buildMetadataLine('active_view', workspace.activeViewId, level + 1))
  }

  pushMetadataSpacer(lines)
  lines.push(buildSnapshotBlock(workspace.snapshot, level + 1))

  if (workspace.views.length > 0) {
    lines.push('')
    lines.push(workspace.views.map(view => buildViewBlock(view, level + 1)).join('\n\n'))
  }

  lines.push(`${'  '.repeat(level)}}`)

  return lines.join('\n')
}

const buildVersionBlock = (
  version: PgmlVersionDocumentBlock,
  level = 1
) => {
  const lines = [`${'  '.repeat(level)}Version ${version.id} {`]

  if (version.name) {
    lines.push(buildMetadataLine('name', version.name, level + 1, true))
  }

  lines.push(buildMetadataLine('role', version.role, level + 1))

  if (version.parentVersionId) {
    lines.push(buildMetadataLine('parent', version.parentVersionId, level + 1))
  }

  lines.push(buildMetadataLine('created_at', version.createdAt, level + 1, true))

  if (version.activeViewId) {
    lines.push(buildMetadataLine('active_view', version.activeViewId, level + 1))
  }

  lines.push('')
  lines.push(buildSnapshotBlock(version.snapshot, level + 1))

  if (version.views.length > 0) {
    lines.push('')
    lines.push(version.views.map(view => buildViewBlock(view, level + 1)).join('\n\n'))
  }

  lines.push(`${'  '.repeat(level)}}`)

  return lines.join('\n')
}

const buildSchemaMetadataTargetBlock = (input: {
  entries: Array<{ key: string, value: string }>
  level: number
  target: string
  targetKeyword: 'Column' | 'Table'
}) => {
  const lines = [`${'  '.repeat(input.level)}${input.targetKeyword} ${quoteMetadataValue(input.target)} {`]

  input.entries.forEach((entry) => {
    lines.push(buildMetadataLine(entry.key, entry.value, input.level + 1, true))
  })

  lines.push(`${'  '.repeat(input.level)}}`)

  return lines.join('\n')
}

const buildSchemaMetadataBlock = (
  schemaMetadata: PgmlDocumentSchemaMetadata,
  level = 1
) => {
  const normalizedSchemaMetadata = clonePgmlDocumentSchemaMetadata(schemaMetadata)

  if (
    normalizedSchemaMetadata.tables.length === 0
    && normalizedSchemaMetadata.columns.length === 0
  ) {
    return null
  }

  const lines = [`${'  '.repeat(level)}${schemaMetadataKeyword} {`]
  const nestedBlocks = [
    ...normalizedSchemaMetadata.tables.map((entry) => {
      return buildSchemaMetadataTargetBlock({
        entries: entry.entries,
        level: level + 1,
        target: entry.tableId,
        targetKeyword: 'Table'
      })
    }),
    ...normalizedSchemaMetadata.columns.map((entry) => {
      return buildSchemaMetadataTargetBlock({
        entries: entry.entries,
        level: level + 1,
        target: `${entry.tableId}.${entry.columnName}`,
        targetKeyword: 'Column'
      })
    })
  ]

  if (nestedBlocks.length > 0) {
    lines.push('')
    lines.push(nestedBlocks.join('\n\n'))
    lines.push('')
  }

  lines.push(`${'  '.repeat(level)}}`)

  return lines.join('\n')
}

export const getPgmlVersionMap = (document: PgmlVersionSetDocument) => {
  return new Map(document.versions.map(version => [version.id, version] as const))
}

export const getPgmlDocumentView = (
  block: PgmlViewOwnerBlock,
  preferredViewId: string | null = null
) => {
  return getPgmlDocumentViewById(
    block.views,
    resolvePgmlDocumentViewId(block.views, preferredViewId || block.activeViewId)
  )
}

export const buildPgmlDocumentViewSource = (
  snapshotSource: string,
  view: PgmlDocumentDiagramView | null
) => {
  const normalizedSnapshotSource = normalizePgmlSnapshotSource(stripPgmlPropertiesBlocks(snapshotSource))

  return view
    ? buildPgmlWithNodeProperties(normalizedSnapshotSource, view.nodeProperties)
    : normalizedSnapshotSource
}

export const getPgmlDocumentBlockPreviewSource = (
  block: PgmlViewOwnerBlock,
  preferredViewId: string | null = null
) => {
  return buildPgmlDocumentViewSource(
    block.snapshot.source,
    getPgmlDocumentView(block, preferredViewId)
  )
}

const cloneDocumentSnapshot = (snapshot: PgmlDocumentSnapshot) => {
  return {
    source: normalizePgmlSnapshotSource(snapshot.source)
  } satisfies PgmlDocumentSnapshot
}

// Lineage reads happen throughout compare, restore, and migration flows. Keep
// the parent walk in one helper so ancestry semantics stay consistent.
const getPgmlVersionLineageFromMap = (
  versionsById: Map<string, PgmlVersionDocumentBlock>,
  versionId: string | null
) => {
  const lineage: PgmlVersionDocumentBlock[] = []
  let currentVersion = versionId ? versionsById.get(versionId) || null : null

  while (currentVersion) {
    lineage.unshift(currentVersion)
    currentVersion = currentVersion.parentVersionId
      ? versionsById.get(currentVersion.parentVersionId) || null
      : null
  }

  return lineage
}

export const clonePgmlVersionSetDocument = (document: PgmlVersionSetDocument) => {
  return {
    ...document,
    schemaMetadata: clonePgmlDocumentSchemaMetadata(document.schemaMetadata),
    versions: document.versions.map((version) => {
      return {
        ...version,
        snapshot: cloneDocumentSnapshot(version.snapshot),
        views: version.views.map(clonePgmlDocumentView)
      }
    }),
    workspace: {
      ...document.workspace,
      snapshot: cloneDocumentSnapshot(document.workspace.snapshot),
      views: document.workspace.views.map(clonePgmlDocumentView)
    }
  } satisfies PgmlVersionSetDocument
}

export const getPgmlVersionById = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  if (!versionId) {
    return null
  }

  return getPgmlVersionMap(document).get(versionId) || null
}

export const getPgmlWorkspaceBaseVersion = (document: PgmlVersionSetDocument) => {
  return getPgmlVersionById(document, document.workspace.basedOnVersionId)
}

export const hasPgmlWorkspaceBaseVersion = (document: PgmlVersionSetDocument) => {
  return getPgmlWorkspaceBaseVersion(document) !== null
}

export const getPgmlVersionLineage = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  return getPgmlVersionLineageFromMap(getPgmlVersionMap(document), versionId)
}

export const getPgmlVersionLineageIds = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  return getPgmlVersionLineage(document, versionId).map(version => version.id)
}

export const getPgmlVersionAncestorCount = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  const lineage = getPgmlVersionLineage(document, versionId)

  return lineage.length > 0 ? lineage.length - 1 : 0
}

export const buildPgmlVersionLineageLabel = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  return getPgmlVersionLineage(document, versionId)
    .map(getPgmlVersionDisplayLabel)
    .join(' -> ')
}

export const isPgmlVersionAncestor = (
  document: PgmlVersionSetDocument,
  ancestorVersionId: string | null,
  descendantVersionId: string | null
) => {
  if (!ancestorVersionId || !descendantVersionId || ancestorVersionId === descendantVersionId) {
    return false
  }

  return getPgmlVersionLineage(document, descendantVersionId).some(version => version.id === ancestorVersionId)
}

export const isPgmlVersionDescendant = (
  document: PgmlVersionSetDocument,
  descendantVersionId: string | null,
  ancestorVersionId: string | null
) => {
  return isPgmlVersionAncestor(document, ancestorVersionId, descendantVersionId)
}

export const getPgmlBranchRootVersion = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  return getPgmlVersionLineage(document, versionId)[0] || null
}

export const getPgmlBranchRootId = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  return getPgmlBranchRootVersion(document, versionId)?.id || null
}

export const getPgmlBranchRootLabel = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  const rootVersion = getPgmlBranchRootVersion(document, versionId)

  if (!rootVersion) {
    return null
  }

  return getPgmlVersionDisplayLabel(rootVersion)
}

export const getPgmlChildVersions = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  return filterPgmlVersionsByParentId(document, versionId)
}

export const hasPgmlChildVersions = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  return getPgmlChildVersions(document, versionId).length > 0
}

export const getPgmlDescendantVersions = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  return walkPgmlVersionBreadthFirst(
    document,
    getPgmlChildVersions(document, versionId),
    nextVersionId => getPgmlChildVersions(document, nextVersionId)
  )
}

export const getPgmlDescendantVersionCount = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  return getPgmlDescendantVersions(document, versionId).length
}

const getPgmlBranchVersions = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  const branchRoot = getPgmlVersionById(document, versionId)

  if (!branchRoot) {
    return [] as PgmlVersionDocumentBlock[]
  }

  return [branchRoot, ...getPgmlDescendantVersions(document, versionId)]
}

export const getPgmlBranchVersionCount = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  return getPgmlBranchVersions(document, versionId).length
}

export const getPgmlBranchLeafVersionCount = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  return getPgmlBranchVersions(document, versionId)
    .filter(version => !hasPgmlChildVersions(document, version.id))
    .length
}

export const getPgmlBranchMaxDepth = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  const branchVersions = getPgmlBranchVersions(document, versionId)
  const branchRoot = branchVersions[0]

  if (!branchRoot) {
    return 0
  }

  return branchVersions
    .reduce((maxDepth, version) => {
      return Math.max(maxDepth, getPgmlVersionDepth(document, version.id))
    }, getPgmlVersionDepth(document, branchRoot.id))
}

export const getPgmlVersionDepth = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  const lineage = getPgmlVersionLineage(document, versionId)

  return lineage.length > 0 ? lineage.length - 1 : 0
}

export const getPgmlSiblingVersions = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  const targetVersion = getPgmlVersionById(document, versionId)

  if (!targetVersion) {
    return []
  }

  return getPgmlChildVersions(document, targetVersion.parentVersionId)
    .filter(version => version.id !== targetVersion.id)
}

export const hasPgmlSiblingVersions = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  return getPgmlSiblingVersions(document, versionId).length > 0
}

export const getPgmlSiblingVersionCount = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  return getPgmlSiblingVersions(document, versionId).length
}

const sortVersionSiblings = (versions: PgmlVersionDocumentBlock[]) => {
  return [...versions].sort((left, right) => {
    if (left.createdAt !== right.createdAt) {
      return left.createdAt.localeCompare(right.createdAt)
    }

    return left.id.localeCompare(right.id)
  })
}

const getSortedPgmlChildVersions = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  return sortVersionSiblings(getPgmlChildVersions(document, versionId))
}

const walkPgmlVersionBreadthFirst = (
  document: PgmlVersionSetDocument,
  initialVersions: PgmlVersionDocumentBlock[],
  getChildren: (versionId: string) => PgmlVersionDocumentBlock[]
) => {
  // Compare, restore, serialization, and lineage metrics all rely on a stable
  // breadth-first walk of the version graph. Keep the queue semantics in one
  // helper so graph ordering stays consistent across those consumers.
  const visitedVersions: PgmlVersionDocumentBlock[] = []
  const pendingVersions = [...initialVersions]

  while (pendingVersions.length > 0) {
    const nextVersion = pendingVersions.shift() || null

    if (!nextVersion) {
      continue
    }

    visitedVersions.push(nextVersion)
    getChildren(nextVersion.id).forEach((childVersion) => {
      pendingVersions.push(childVersion)
    })
  }

  return visitedVersions
}

export const getPgmlVersionsInTopologicalOrder = (document: PgmlVersionSetDocument) => {
  return walkPgmlVersionBreadthFirst(
    document,
    getSortedPgmlChildVersions(document, null),
    versionId => getSortedPgmlChildVersions(document, versionId)
  )
}

export const serializePgmlDocument = (document: PgmlVersionSetDocument) => {
  validateVersionSetDocument(document)
  const schemaMetadataBlock = buildSchemaMetadataBlock(document.schemaMetadata)

  const sections = [`VersionSet ${quoteMetadataValue(document.name)} {`]

  if (schemaMetadataBlock) {
    sections.push(schemaMetadataBlock)
  }

  sections.push(
    buildWorkspaceBlock(document.workspace),
    ...getPgmlVersionsInTopologicalOrder(document).map(buildVersionBlock),
    '}'
  )

  return sections.join('\n\n')
}

export const serializePgmlWorkspaceBlock = (workspace: PgmlWorkspaceDocumentBlock) => {
  return buildWorkspaceBlock(workspace, 0)
}

export const serializePgmlVersionBlock = (version: PgmlVersionDocumentBlock) => {
  return buildVersionBlock(version, 0)
}

const getPgmlDocumentScopeVersionId = (scope: PgmlDocumentEditorScope) => {
  return scope.replace(/^version:/, '')
}

const serializeStandalonePgmlDocumentScope = (
  document: PgmlVersionSetDocument,
  scope: Exclude<PgmlDocumentEditorScope, 'all'>
) => {
  if (scope === 'workspace-block') {
    return serializePgmlWorkspaceBlock(document.workspace)
  }

  const versionId = getPgmlDocumentScopeVersionId(scope)
  const version = getPgmlVersionById(document, versionId)

  return version ? serializePgmlVersionBlock(version) : serializePgmlDocument(document)
}

export const normalizePgmlDocumentEditorScope = (
  document: PgmlVersionSetDocument,
  scope: PgmlDocumentEditorScope
) => {
  if (scope === 'all' || scope === 'workspace-block') {
    return scope
  }

  const versionId = getPgmlDocumentScopeVersionId(scope)

  return getPgmlVersionById(document, versionId) ? scope : 'all'
}

export const serializePgmlDocumentScope = (
  document: PgmlVersionSetDocument,
  scope: PgmlDocumentEditorScope
) => {
  const normalizedScope = normalizePgmlDocumentEditorScope(document, scope)

  if (normalizedScope === 'all') {
    return serializePgmlDocument(document)
  }

  return serializeStandalonePgmlDocumentScope(document, normalizedScope)
}

export const createInitialPgmlDocument = (input?: {
  basedOnVersionId?: string | null
  initialVersion?: Omit<PgmlVersionDocumentBlock, 'id' | 'views' | 'activeViewId'> & {
    activeViewId?: string | null
    views?: PgmlDocumentDiagramView[]
  }
  name?: string
  workspaceSource?: string
}) => {
  const initialVersion = input?.initialVersion
  const versions: PgmlVersionDocumentBlock[] = []
  let normalizedInitialVersion: ReturnType<typeof normalizeViewOwnerBlock> | null = null

  if (initialVersion) {
    normalizedInitialVersion = normalizeViewOwnerBlock({
      activeViewId: initialVersion.activeViewId || null,
      snapshot: cloneDocumentSnapshot(initialVersion.snapshot),
      views: initialVersion.views || []
    })

    versions.push({
      ...initialVersion,
      activeViewId: normalizedInitialVersion.activeViewId,
      createdAt: normalizePgmlTimestamp(initialVersion.createdAt, 'Initial version created_at'),
      id: createPgmlVersionId(),
      snapshot: normalizedInitialVersion.snapshot,
      views: normalizedInitialVersion.views
    })
  }

  const normalizedWorkspace = normalizeViewOwnerBlock({
    activeViewId: input?.workspaceSource === undefined ? normalizedInitialVersion?.activeViewId || null : null,
    snapshot: {
      source: input?.workspaceSource ?? initialVersion?.snapshot.source ?? ''
    },
    views: input?.workspaceSource === undefined
      ? normalizedInitialVersion?.views.map(clonePgmlDocumentView) || []
      : []
  })

  return {
    kind: 'versioned',
    name: input?.name || 'Untitled schema',
    schemaMetadata: createEmptyPgmlDocumentSchemaMetadata(),
    versions,
    workspace: {
      activeViewId: normalizedWorkspace.activeViewId,
      basedOnVersionId: initialVersion ? versions[0]!.id : input?.basedOnVersionId || null,
      snapshot: normalizedWorkspace.snapshot,
      updatedAt: null,
      views: normalizedWorkspace.views
    }
  } satisfies PgmlVersionSetDocument
}

export const createPgmlVersionFromWorkspace = (
  document: PgmlVersionSetDocument,
  input: {
    createdAt: string
    name: string
    role: PgmlVersionRole
  }
) => {
  // Versions are immutable checkpoints. When locking one from the workspace,
  // always copy the current snapshot so future draft edits cannot mutate
  // already-recorded history by reference.
  const nextVersion: PgmlVersionDocumentBlock = {
    activeViewId: document.workspace.activeViewId,
    createdAt: normalizePgmlTimestamp(input.createdAt, 'Version created_at'),
    id: createPgmlVersionId(),
    name: input.name,
    parentVersionId: document.workspace.basedOnVersionId,
    role: input.role,
    snapshot: cloneDocumentSnapshot(document.workspace.snapshot),
    views: document.workspace.views.map(clonePgmlDocumentView)
  }

  return {
    ...document,
    versions: [...document.versions, nextVersion],
    workspace: {
      ...document.workspace,
      basedOnVersionId: nextVersion.id
    }
  } satisfies PgmlVersionSetDocument
}

export const replacePgmlWorkspaceFromSnapshot = (
  document: PgmlVersionSetDocument,
  input: {
    activeViewId?: string | null
    basedOnVersionId: string | null
    source: string
    updatedAt?: string | null
    views?: PgmlDocumentDiagramView[]
  }
) => {
  const normalizedWorkspace = normalizeViewOwnerBlock({
    activeViewId: input.activeViewId === undefined
      ? document.workspace.activeViewId
      : input.activeViewId,
    snapshot: {
      source: input.source
    },
    views: input.views === undefined
      ? document.workspace.views.map(clonePgmlDocumentView)
      : input.views
  })

  return {
    ...document,
    workspace: {
      activeViewId: normalizedWorkspace.activeViewId,
      basedOnVersionId: input.basedOnVersionId,
      snapshot: normalizedWorkspace.snapshot,
      updatedAt: input.updatedAt === undefined || input.updatedAt === null
        ? document.workspace.updatedAt
        : normalizePgmlTimestamp(input.updatedAt, 'Workspace updated_at'),
      views: normalizedWorkspace.views
    }
  } satisfies PgmlVersionSetDocument
}

export const replacePgmlDocumentSchemaMetadata = (
  document: PgmlVersionSetDocument,
  schemaMetadata: PgmlDocumentSchemaMetadata
) => {
  return {
    ...document,
    schemaMetadata: clonePgmlDocumentSchemaMetadata(schemaMetadata)
  } satisfies PgmlVersionSetDocument
}

export const getPgmlDocumentPreviewSource = (
  document: PgmlVersionSetDocument,
  previewTarget: 'workspace' | { versionId: string, viewId?: string | null }
) => {
  if (previewTarget === 'workspace') {
    return getPgmlDocumentBlockPreviewSource(document.workspace)
  }

  const version = document.versions.find(entry => entry.id === previewTarget.versionId) || null

  return version
    ? getPgmlDocumentBlockPreviewSource(version, previewTarget.viewId || null)
    : ''
}
