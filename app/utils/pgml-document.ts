import { nanoid } from 'nanoid'

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
    source: normalizeLineEndings(block.body.join('\n')).trim()
  } satisfies PgmlDocumentSnapshot
}

const parseWorkspaceBlock = (block: PgmlNamedBlock): PgmlWorkspaceDocumentBlock => {
  if (block.header !== workspaceKeyword) {
    throw new Error('VersionSet requires a Workspace block.')
  }

  const nested = collectBlocks(block.body.join('\n'))
  const metadata = nested.topLevel.reduce<Record<string, string>>((entries, line) => {
    const entry = parseMetadataEntry(line)

    if (entry) {
      entries[entry.key] = entry.value
    }

    return entries
  }, {})

  assertNoUnexpectedTopLevelLines(
    nested.topLevel.filter(line => parseMetadataEntry(line) === null),
    'Workspace'
  )

  if (nested.blocks.length !== 1) {
    throw new Error('Workspace requires exactly one Snapshot block.')
  }

  return {
    basedOnVersionId: metadata.based_on || null,
    snapshot: parseSnapshotBlock(nested.blocks[0]!, 'Workspace'),
    updatedAt: metadata.updated_at || null
  }
}

const parseVersionBlock = (block: PgmlNamedBlock): PgmlVersionDocumentBlock => {
  const versionId = getVersionId(block.header)

  if (!versionId) {
    throw new Error('Invalid Version block header.')
  }

  const nested = collectBlocks(block.body.join('\n'))
  const metadata = nested.topLevel.reduce<Record<string, string>>((entries, line) => {
    const entry = parseMetadataEntry(line)

    if (entry) {
      entries[entry.key] = entry.value
    }

    return entries
  }, {})

  assertNoUnexpectedTopLevelLines(
    nested.topLevel.filter(line => parseMetadataEntry(line) === null),
    `Version ${versionId}`
  )

  if (nested.blocks.length !== 1) {
    throw new Error(`Version ${versionId} requires exactly one Snapshot block.`)
  }

  const role = metadata.role

  if (role !== 'design' && role !== 'implementation') {
    throw new Error(`Version ${versionId} requires role to be design or implementation.`)
  }

  return {
    createdAt: getRequiredMetadataValue(metadata, 'created_at', `Version ${versionId}`),
    id: versionId,
    name: metadata.name || null,
    parentVersionId: metadata.parent || null,
    role,
    snapshot: parseSnapshotBlock(nested.blocks[0]!, `Version ${versionId}`)
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

  const workspaceBlocks = nested.blocks.filter(block => block.header === workspaceKeyword)
  const versionBlocks = nested.blocks.filter(block => getVersionId(block.header) !== null)

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
  const normalizedSource = normalizeLineEndings(snapshot.source).trim()
  const lines = [`${'  '.repeat(level)}Snapshot {`]

  if (normalizedSource.length > 0) {
    lines.push(indentLines(normalizedSource, level + 1))
  }

  lines.push(`${'  '.repeat(level)}}`)

  return lines.join('\n')
}

const buildWorkspaceBlock = (workspace: PgmlWorkspaceDocumentBlock) => {
  const lines = ['  Workspace {']

  if (workspace.basedOnVersionId) {
    lines.push(`    based_on: ${workspace.basedOnVersionId}`)
  }

  if (workspace.updatedAt) {
    lines.push(`    updated_at: ${quoteMetadataValue(workspace.updatedAt)}`)
  }

  if (lines.length > 1) {
    lines.push('')
  }

  lines.push(buildSnapshotBlock(workspace.snapshot, 2))
  lines.push('  }')

  return lines.join('\n')
}

const buildVersionBlock = (version: PgmlVersionDocumentBlock) => {
  const lines = [`  Version ${version.id} {`]

  if (version.name) {
    lines.push(`    name: ${quoteMetadataValue(version.name)}`)
  }

  lines.push(`    role: ${version.role}`)

  if (version.parentVersionId) {
    lines.push(`    parent: ${version.parentVersionId}`)
  }

  lines.push(`    created_at: ${quoteMetadataValue(version.createdAt)}`)
  lines.push('')
  lines.push(buildSnapshotBlock(version.snapshot, 2))
  lines.push('  }')

  return lines.join('\n')
}

export const getPgmlVersionMap = (document: PgmlVersionSetDocument) => {
  return new Map(document.versions.map(version => [version.id, version] as const))
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

export const getPgmlVersionLineage = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  const versionsById = getPgmlVersionMap(document)
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

export const getPgmlChildVersions = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  return document.versions.filter(version => version.parentVersionId === versionId)
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

export const getPgmlVersionDepth = (
  document: PgmlVersionSetDocument,
  versionId: string | null
) => {
  const lineage = getPgmlVersionLineage(document, versionId)

  return lineage.length > 0 ? lineage.length - 1 : 0
}

export const serializePgmlDocument = (document: PgmlVersionSetDocument) => {
  validateVersionSetDocument(document)

  const sections = [
    `VersionSet ${quoteMetadataValue(document.name)} {`,
    buildWorkspaceBlock(document.workspace),
    ...document.versions.map(buildVersionBlock),
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
      id: createPgmlVersionId()
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
  const nextVersion: PgmlVersionDocumentBlock = {
    createdAt: input.createdAt,
    id: createPgmlVersionId(),
    name: input.name,
    parentVersionId: document.workspace.basedOnVersionId,
    role: input.role,
    snapshot: {
      source: document.workspace.snapshot.source
    }
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
        source: normalizeLineEndings(input.source).trim()
      },
      updatedAt: input.updatedAt ?? document.workspace.updatedAt
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
