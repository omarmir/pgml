import { nanoid } from 'nanoid'
import { stripPgmlPropertiesBlocks } from './pgml'

export type PgmlVersionRole = 'design' | 'implementation'

export type PgmlDocumentSnapshot = {
  source: string
}

export type PgmlWorkspaceDocumentBlock = {
  basedOnVersionId: string | null
  snapshot: PgmlDocumentSnapshot
  updatedAt: string | null
}

export type PgmlVersionDocumentBlock = {
  createdAt: string
  id: string
  name: string | null
  parentVersionId: string | null
  role: PgmlVersionRole
  snapshot: PgmlDocumentSnapshot
}

export type PgmlVersionSetDocument = {
  kind: 'versioned'
  name: string
  versions: PgmlVersionDocumentBlock[]
  workspace: PgmlWorkspaceDocumentBlock
}

type PgmlNamedBlock = {
  body: string[]
  header: string
}

const workspaceKeyword = 'Workspace'
const snapshotKeyword = 'Snapshot'

const createPgmlVersionId = () => {
  return `v_${nanoid()}`
}

const normalizeLineEndings = (value: string) => {
  return value.replaceAll('\r\n', '\n')
}

export const normalizePgmlSnapshotSource = (value: string) => {
  return normalizeLineEndings(value).trim()
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
  return [...versions].sort(comparePgmlVersionsByRecency)[0] || null
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

export const isPgmlWorkspaceDirty = (
  document: PgmlVersionSetDocument,
  includeLayout = true
) => {
  const baseVersion = getPgmlWorkspaceBaseVersion(document)

  if (!baseVersion) {
    return normalizePgmlSnapshotSource(document.workspace.snapshot.source).length > 0
  }

  return !arePgmlSnapshotsEquivalent(
    document.workspace.snapshot.source,
    baseVersion.snapshot.source,
    includeLayout
  )
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
  return getLatestPgmlVersionFromList(document.versions)
}

export const getLatestPgmlVersionByRole = (
  document: PgmlVersionSetDocument,
  role: PgmlVersionRole
) => {
  return getLatestPgmlVersionFromList(document.versions.filter(version => version.role === role))
}

export const getLatestPgmlLeafVersion = (document: PgmlVersionSetDocument) => {
  return getLatestPgmlVersionFromList(getPgmlLeafVersions(document))
}

export const getLatestPgmlLeafVersionByRole = (
  document: PgmlVersionSetDocument,
  role: PgmlVersionRole
) => {
  return getLatestPgmlVersionFromList(
    getPgmlLeafVersions(document).filter(version => version.role === role)
  )
}

export const getLatestPgmlRootVersion = (document: PgmlVersionSetDocument) => {
  return getLatestPgmlVersionFromList(getPgmlRootVersions(document))
}

export const getLatestPgmlRootVersionByRole = (
  document: PgmlVersionSetDocument,
  role: PgmlVersionRole
) => {
  return getLatestPgmlVersionFromList(
    getPgmlRootVersions(document).filter(version => version.role === role)
  )
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

const parseSnapshotBlock = (block: PgmlNamedBlock, context: string) => {
  if (block.header !== snapshotKeyword) {
    throw new Error(`${context} requires a Snapshot block.`)
  }

  return {
    source: normalizePgmlSnapshotSource(block.body.join('\n'))
  } satisfies PgmlDocumentSnapshot
}

const parseWorkspaceBlock = (block: PgmlNamedBlock): PgmlWorkspaceDocumentBlock => {
  if (block.header !== workspaceKeyword) {
    throw new Error('VersionSet requires a Workspace block.')
  }

  const nested = collectBlocks(block.body.join('\n'))
  const metadata = collectBlockMetadata(nested.topLevel, 'Workspace')

  if (nested.blocks.length !== 1) {
    throw new Error('Workspace requires exactly one Snapshot block.')
  }

  return {
    basedOnVersionId: metadata.based_on || null,
    snapshot: parseSnapshotBlock(nested.blocks[0]!, 'Workspace'),
    updatedAt: metadata.updated_at ? normalizePgmlTimestamp(metadata.updated_at, 'Workspace updated_at') : null
  }
}

const parseVersionBlock = (block: PgmlNamedBlock): PgmlVersionDocumentBlock => {
  const versionId = getVersionId(block.header)

  if (!versionId) {
    throw new Error('Invalid Version block header.')
  }

  const nested = collectBlocks(block.body.join('\n'))
  const metadata = collectBlockMetadata(nested.topLevel, `Version ${versionId}`)

  if (nested.blocks.length !== 1) {
    throw new Error(`Version ${versionId} requires exactly one Snapshot block.`)
  }

  const role = metadata.role

  if (role !== 'design' && role !== 'implementation') {
    throw new Error(`Version ${versionId} requires role to be design or implementation.`)
  }

  return {
    createdAt: normalizePgmlTimestamp(
      getRequiredMetadataValue(metadata, 'created_at', `Version ${versionId}`),
      `Version ${versionId} created_at`
    ),
    id: versionId,
    name: metadata.name || null,
    parentVersionId: metadata.parent || null,
    role,
    snapshot: parseSnapshotBlock(nested.blocks[0]!, `Version ${versionId}`)
  }
}

const partitionVersionSetBlocks = (blocks: PgmlNamedBlock[]) => {
  const workspaceBlocks = blocks.filter(block => block.header === workspaceKeyword)
  const versionBlocks = blocks.filter(block => getVersionId(block.header) !== null)

  return {
    versionBlocks,
    workspaceBlocks
  }
}

const validateVersionSetDocument = (document: PgmlVersionSetDocument) => {
  const versionIds = new Set<string>()
  const versionsById = new Map(document.versions.map(version => [version.id, version] as const))
  let rootVersionCount = 0

  document.versions.forEach((version) => {
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
    throw new Error('VersionSet only allows Workspace and Version blocks.')
  }

  // VersionSet is intentionally strict: the root only coordinates workspace
  // state and immutable Version blocks. All schema entities live inside nested
  // Snapshot blocks, never directly under the document root.
  const {
    versionBlocks,
    workspaceBlocks
  } = partitionVersionSetBlocks(nested.blocks)

  if (workspaceBlocks.length !== 1) {
    throw new Error('VersionSet requires exactly one Workspace block.')
  }

  if (workspaceBlocks.length + versionBlocks.length !== nested.blocks.length) {
    throw new Error('VersionSet only allows Workspace and Version blocks.')
  }

  const document: PgmlVersionSetDocument = {
    kind: 'versioned',
    name: documentName,
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

const buildWorkspaceBlock = (workspace: PgmlWorkspaceDocumentBlock) => {
  const lines = ['  Workspace {']

  if (workspace.basedOnVersionId) {
    lines.push(buildMetadataLine('based_on', workspace.basedOnVersionId, 2))
  }

  if (workspace.updatedAt) {
    lines.push(buildMetadataLine('updated_at', workspace.updatedAt, 2, true))
  }

  pushMetadataSpacer(lines)
  lines.push(buildSnapshotBlock(workspace.snapshot, 2))
  lines.push('  }')

  return lines.join('\n')
}

const buildVersionBlock = (version: PgmlVersionDocumentBlock) => {
  const lines = [`  Version ${version.id} {`]

  if (version.name) {
    lines.push(buildMetadataLine('name', version.name, 2, true))
  }

  lines.push(buildMetadataLine('role', version.role, 2))

  if (version.parentVersionId) {
    lines.push(buildMetadataLine('parent', version.parentVersionId, 2))
  }

  lines.push(buildMetadataLine('created_at', version.createdAt, 2, true))
  lines.push('')
  lines.push(buildSnapshotBlock(version.snapshot, 2))
  lines.push('  }')

  return lines.join('\n')
}

export const getPgmlVersionMap = (document: PgmlVersionSetDocument) => {
  return new Map(document.versions.map(version => [version.id, version] as const))
}

const cloneDocumentSnapshot = (snapshot: PgmlDocumentSnapshot) => {
  return {
    source: snapshot.source
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
    versions: document.versions.map((version) => {
      return {
        ...version,
        snapshot: cloneDocumentSnapshot(version.snapshot)
      }
    }),
    workspace: {
      ...document.workspace,
      snapshot: cloneDocumentSnapshot(document.workspace.snapshot)
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
  const descendants: PgmlVersionDocumentBlock[] = []
  const pendingVersionIds = getPgmlChildVersions(document, versionId).map(version => version.id)

  while (pendingVersionIds.length > 0) {
    const nextVersionId = pendingVersionIds.shift() || null
    const nextVersion = getPgmlVersionById(document, nextVersionId)

    if (!nextVersion) {
      continue
    }

    descendants.push(nextVersion)
    getPgmlChildVersions(document, nextVersion.id).forEach((childVersion) => {
      pendingVersionIds.push(childVersion.id)
    })
  }

  return descendants
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

export const getPgmlVersionsInTopologicalOrder = (document: PgmlVersionSetDocument) => {
  const orderedVersions: PgmlVersionDocumentBlock[] = []
  const pendingVersions = getSortedPgmlChildVersions(document, null)

  while (pendingVersions.length > 0) {
    const nextVersion = pendingVersions.shift() || null

    if (!nextVersion) {
      continue
    }

    orderedVersions.push(nextVersion)
    getSortedPgmlChildVersions(document, nextVersion.id).forEach((childVersion) => {
      pendingVersions.push(childVersion)
    })
  }

  return orderedVersions
}

export const serializePgmlDocument = (document: PgmlVersionSetDocument) => {
  validateVersionSetDocument(document)

  const sections = [
    `VersionSet ${quoteMetadataValue(document.name)} {`,
    buildWorkspaceBlock(document.workspace),
    ...getPgmlVersionsInTopologicalOrder(document).map(buildVersionBlock),
    '}'
  ]

  return sections.join('\n\n')
}

export const createInitialPgmlDocument = (input?: {
  basedOnVersionId?: string | null
  initialVersion?: Omit<PgmlVersionDocumentBlock, 'id'>
  name?: string
  workspaceSource?: string
}) => {
  const initialVersion = input?.initialVersion
  const versions: PgmlVersionDocumentBlock[] = []

  if (initialVersion) {
    versions.push({
      ...initialVersion,
      createdAt: normalizePgmlTimestamp(initialVersion.createdAt, 'Initial version created_at'),
      id: createPgmlVersionId(),
      snapshot: cloneDocumentSnapshot(initialVersion.snapshot)
    })
  }

  return {
    kind: 'versioned',
    name: input?.name || 'Untitled schema',
    versions,
    workspace: {
      basedOnVersionId: initialVersion ? versions[0]!.id : input?.basedOnVersionId || null,
      snapshot: {
        source: input?.workspaceSource ?? initialVersion?.snapshot.source ?? ''
      },
      updatedAt: null
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
    createdAt: normalizePgmlTimestamp(input.createdAt, 'Version created_at'),
    id: createPgmlVersionId(),
    name: input.name,
    parentVersionId: document.workspace.basedOnVersionId,
    role: input.role,
    snapshot: cloneDocumentSnapshot(document.workspace.snapshot)
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
    basedOnVersionId: string | null
    source: string
    updatedAt?: string | null
  }
) => {
  return {
    ...document,
    workspace: {
      basedOnVersionId: input.basedOnVersionId,
      snapshot: {
        source: normalizePgmlSnapshotSource(input.source)
      },
      updatedAt: input.updatedAt === undefined || input.updatedAt === null
        ? document.workspace.updatedAt
        : normalizePgmlTimestamp(input.updatedAt, 'Workspace updated_at')
    }
  } satisfies PgmlVersionSetDocument
}

export const getPgmlDocumentPreviewSource = (
  document: PgmlVersionSetDocument,
  previewTarget: 'workspace' | { versionId: string }
) => {
  if (previewTarget === 'workspace') {
    return document.workspace.snapshot.source
  }

  return document.versions.find(version => version.id === previewTarget.versionId)?.snapshot.source || ''
}
