import { describe, expect, it } from 'vitest'

import {
  arePgmlSnapshotsEquivalent,
  buildPgmlCheckpointName,
  canCreatePgmlCheckpoint,
  clonePgmlVersionSetDocument,
  createInitialPgmlDocument,
  createPgmlVersionFromWorkspace,
  getPgmlDocumentVersionStats,
  getPgmlChildVersions,
  hasPgmlChildVersions,
  getPgmlDescendantVersions,
  getPgmlDescendantVersionCount,
  getLatestPgmlVersion,
  getLatestPgmlVersionByRole,
  getPgmlBranchRootVersion,
  getPgmlBranchRootId,
  getPgmlBranchRootLabel,
  getPgmlVersionDisplayLabel,
  getPgmlLeafVersions,
  getPgmlLeafVersionCount,
  getPgmlVersionRoleCount,
  hasPgmlVersionRole,
  isPgmlLeafVersion,
  getPgmlRootVersions,
  getPgmlRootVersionCount,
  isPgmlRootVersion,
  isPgmlVersionDescendant,
  isPgmlVersionAncestor,
  buildPgmlVersionLineageLabel,
  getPgmlNearestCommonAncestor,
  getPgmlVersionById,
  getPgmlVersionCount,
  getPgmlVersionAncestorCount,
  getPgmlVersionDepth,
  getPgmlVersionLineage,
  getPgmlVersionLineageIds,
  getPgmlVersionMap,
  getPgmlVersionsInTopologicalOrder,
  getPgmlSiblingVersions,
  getPgmlSiblingVersionCount,
  hasPgmlSiblingVersions,
  getPgmlWorkspaceBaseVersion,
  hasPgmlVersions,
  isPgmlWorkspaceDirty,
  normalizePgmlSnapshotSource,
  parsePgmlDocument,
  replacePgmlWorkspaceFromSnapshot,
  serializePgmlDocument
} from '../../app/utils/pgml-document'

const baseSnapshotSource = `Table public.users {
  id uuid [pk]
}`

describe('PGML versioned documents', () => {
  it('serializes and parses a VersionSet document with immutable versions and a workspace snapshot', () => {
    const document = createInitialPgmlDocument({
      initialVersion: {
        createdAt: '2026-03-29T12:00:00.000Z',
        name: 'Initial implementation',
        parentVersionId: null,
        role: 'implementation',
        snapshot: {
          source: baseSnapshotSource
        }
      },
      name: 'Billing',
      workspaceSource: `${baseSnapshotSource}

Table public.orders {
  id uuid [pk]
}`
    })

    const serialized = serializePgmlDocument(document)
    const reparsed = parsePgmlDocument(serialized)

    expect(serialized).toContain('VersionSet "Billing" {')
    expect(serialized).toContain('Workspace {')
    expect(serialized).toContain('Version ')
    expect(reparsed.name).toBe('Billing')
    expect(reparsed.versions).toHaveLength(1)
    expect(reparsed.versions[0]?.createdAt).toBe('2026-03-29T12:00:00.000Z')
    expect(reparsed.workspace.basedOnVersionId).toBe(reparsed.versions[0]?.id)
    expect(reparsed.versions[0]?.role).toBe('implementation')
    expect(reparsed.workspace.snapshot.source).toContain('Table public.orders')
  })

  it('creates new versions from the workspace and keeps parent lineage intact', () => {
    const initialDocument = createInitialPgmlDocument({
      name: 'Billing',
      workspaceSource: baseSnapshotSource
    })
    const withFirstVersion = createPgmlVersionFromWorkspace(initialDocument, {
      createdAt: '2026-03-29T12:00:00.000Z',
      name: 'Initial design',
      role: 'design'
    })
    const withUpdatedWorkspace = replacePgmlWorkspaceFromSnapshot(withFirstVersion, {
      basedOnVersionId: withFirstVersion.workspace.basedOnVersionId,
      source: `${baseSnapshotSource}

Table public.memberships {
  id uuid [pk]
}`,
      updatedAt: '2026-03-29T12:05:00.000Z'
    })
    const withSecondVersion = createPgmlVersionFromWorkspace(withUpdatedWorkspace, {
      createdAt: '2026-03-29T12:10:00.000Z',
      name: 'Add memberships',
      role: 'design'
    })

    expect(withFirstVersion.versions[0]?.parentVersionId).toBeNull()
    expect(withFirstVersion.versions[0]?.id.startsWith('v_')).toBe(true)
    expect(withSecondVersion.versions[1]?.parentVersionId).toBe(withFirstVersion.versions[0]?.id)
    expect(withSecondVersion.versions[1]?.id.startsWith('v_')).toBe(true)
    expect(withSecondVersion.workspace.basedOnVersionId).toBe(withSecondVersion.versions[1]?.id)
  })

  it('exposes version lookup helpers for ids and the current workspace base', () => {
    const document = createInitialPgmlDocument({
      initialVersion: {
        createdAt: '2026-03-29T12:00:00.000Z',
        name: 'Initial implementation',
        parentVersionId: null,
        role: 'implementation',
        snapshot: {
          source: baseSnapshotSource
        }
      },
      name: 'Billing'
    })
    const versionMap = getPgmlVersionMap(document)
    const workspaceBaseVersion = getPgmlWorkspaceBaseVersion(document)

    expect(versionMap.size).toBe(1)
    expect(workspaceBaseVersion?.id).toBe(document.workspace.basedOnVersionId)
    expect(getPgmlVersionById(document, workspaceBaseVersion?.id || null)?.name).toBe('Initial implementation')
    expect(getPgmlVersionById(document, 'missing-version')).toBeNull()
    expect(getPgmlVersionCount(document)).toBe(1)
    expect(hasPgmlVersions(document)).toBe(true)
    expect(getPgmlVersionRoleCount(document, 'implementation')).toBe(1)
    expect(hasPgmlVersionRole(document, 'implementation')).toBe(true)
  })

  it('returns ordered lineage from the root version to the selected checkpoint', () => {
    const initialDocument = createInitialPgmlDocument({
      name: 'Billing',
      workspaceSource: baseSnapshotSource
    })
    const firstVersion = createPgmlVersionFromWorkspace(initialDocument, {
      createdAt: '2026-03-29T12:00:00.000Z',
      name: 'Initial design',
      role: 'design'
    })
    const secondVersion = createPgmlVersionFromWorkspace(replacePgmlWorkspaceFromSnapshot(firstVersion, {
      basedOnVersionId: firstVersion.workspace.basedOnVersionId,
      source: `${baseSnapshotSource}

Table public.orders {
  id uuid [pk]
}`,
      updatedAt: '2026-03-29T12:05:00.000Z'
    }), {
      createdAt: '2026-03-29T12:10:00.000Z',
      name: 'Add orders',
      role: 'design'
    })
    const targetVersion = secondVersion.versions[1]

    expect(getPgmlVersionLineage(secondVersion, targetVersion?.id || null).map(version => version.name)).toEqual([
      'Initial design',
      'Add orders'
    ])
    expect(getPgmlVersionLineageIds(secondVersion, targetVersion?.id || null)).toHaveLength(2)
    expect(getPgmlVersionAncestorCount(secondVersion, targetVersion?.id || null)).toBe(1)
    expect(getPgmlVersionLineage(secondVersion, null)).toEqual([])
  })

  it('returns direct child versions for a selected branch point', () => {
    const initialDocument = createInitialPgmlDocument({
      name: 'Billing',
      workspaceSource: baseSnapshotSource
    })
    const rootDocument = createPgmlVersionFromWorkspace(initialDocument, {
      createdAt: '2026-03-29T12:00:00.000Z',
      name: 'Initial design',
      role: 'design'
    })
    const rootVersionId = rootDocument.workspace.basedOnVersionId
    const featureADocument = createPgmlVersionFromWorkspace(replacePgmlWorkspaceFromSnapshot(rootDocument, {
      basedOnVersionId: rootVersionId,
      source: `${baseSnapshotSource}

Table public.orders {
  id uuid [pk]
}`,
      updatedAt: '2026-03-29T12:05:00.000Z'
    }), {
      createdAt: '2026-03-29T12:10:00.000Z',
      name: 'Orders branch',
      role: 'design'
    })
    const featureBDocument = createPgmlVersionFromWorkspace(replacePgmlWorkspaceFromSnapshot(featureADocument, {
      basedOnVersionId: rootVersionId,
      source: `${baseSnapshotSource}

Table public.memberships {
  id uuid [pk]
}`,
      updatedAt: '2026-03-29T12:15:00.000Z'
    }), {
      createdAt: '2026-03-29T12:20:00.000Z',
      name: 'Memberships branch',
      role: 'design'
    })

    expect(getPgmlChildVersions(featureBDocument, rootVersionId).map(version => version.name)).toEqual([
      'Orders branch',
      'Memberships branch'
    ])
    expect(hasPgmlChildVersions(featureBDocument, rootVersionId)).toBe(true)
    expect(getPgmlChildVersions(featureBDocument, null).map(version => version.name)).toEqual([
      'Initial design'
    ])
  })

  it('returns all descendant versions under a selected branch point', () => {
    const initialDocument = createInitialPgmlDocument({
      name: 'Billing',
      workspaceSource: baseSnapshotSource
    })
    const rootDocument = createPgmlVersionFromWorkspace(initialDocument, {
      createdAt: '2026-03-29T12:00:00.000Z',
      name: 'Initial design',
      role: 'design'
    })
    const rootVersionId = rootDocument.workspace.basedOnVersionId
    const branchDocument = createPgmlVersionFromWorkspace(replacePgmlWorkspaceFromSnapshot(rootDocument, {
      basedOnVersionId: rootVersionId,
      source: `${baseSnapshotSource}

Table public.orders {
  id uuid [pk]
}`,
      updatedAt: '2026-03-29T12:05:00.000Z'
    }), {
      createdAt: '2026-03-29T12:10:00.000Z',
      name: 'Orders branch',
      role: 'design'
    })
    const branchVersionId = branchDocument.workspace.basedOnVersionId
    const finalDocument = createPgmlVersionFromWorkspace(replacePgmlWorkspaceFromSnapshot(branchDocument, {
      basedOnVersionId: branchVersionId,
      source: `${baseSnapshotSource}

Table public.orders {
  id uuid [pk]
}

Table public.order_items {
  id uuid [pk]
}`,
      updatedAt: '2026-03-29T12:15:00.000Z'
    }), {
      createdAt: '2026-03-29T12:20:00.000Z',
      name: 'Order items',
      role: 'design'
    })

    expect(getPgmlDescendantVersions(finalDocument, rootVersionId).map(version => version.name)).toEqual([
      'Orders branch',
      'Order items'
    ])
    expect(getPgmlDescendantVersionCount(finalDocument, rootVersionId)).toBe(2)
  })

  it('calculates branch depth from the selected version lineage', () => {
    const initialDocument = createInitialPgmlDocument({
      name: 'Billing',
      workspaceSource: baseSnapshotSource
    })
    const firstVersion = createPgmlVersionFromWorkspace(initialDocument, {
      createdAt: '2026-03-29T12:00:00.000Z',
      name: 'Initial design',
      role: 'design'
    })
    const secondVersion = createPgmlVersionFromWorkspace(replacePgmlWorkspaceFromSnapshot(firstVersion, {
      basedOnVersionId: firstVersion.workspace.basedOnVersionId,
      source: `${baseSnapshotSource}

Table public.orders {
  id uuid [pk]
}`,
      updatedAt: '2026-03-29T12:05:00.000Z'
    }), {
      createdAt: '2026-03-29T12:10:00.000Z',
      name: 'Add orders',
      role: 'design'
    })

    expect(getPgmlVersionDepth(secondVersion, secondVersion.versions[0]?.id || null)).toBe(0)
    expect(getPgmlVersionDepth(secondVersion, secondVersion.versions[1]?.id || null)).toBe(1)
    expect(getPgmlVersionDepth(secondVersion, null)).toBe(0)
  })

  it('returns sibling versions that branch from the same parent', () => {
    const initialDocument = createInitialPgmlDocument({
      name: 'Billing',
      workspaceSource: baseSnapshotSource
    })
    const rootDocument = createPgmlVersionFromWorkspace(initialDocument, {
      createdAt: '2026-03-29T12:00:00.000Z',
      name: 'Initial design',
      role: 'design'
    })
    const rootVersionId = rootDocument.workspace.basedOnVersionId
    const branchADocument = createPgmlVersionFromWorkspace(replacePgmlWorkspaceFromSnapshot(rootDocument, {
      basedOnVersionId: rootVersionId,
      source: `${baseSnapshotSource}

Table public.orders {
  id uuid [pk]
}`,
      updatedAt: '2026-03-29T12:05:00.000Z'
    }), {
      createdAt: '2026-03-29T12:10:00.000Z',
      name: 'Orders branch',
      role: 'design'
    })
    const branchBDocument = createPgmlVersionFromWorkspace(replacePgmlWorkspaceFromSnapshot(branchADocument, {
      basedOnVersionId: rootVersionId,
      source: `${baseSnapshotSource}

Table public.memberships {
  id uuid [pk]
}`,
      updatedAt: '2026-03-29T12:15:00.000Z'
    }), {
      createdAt: '2026-03-29T12:20:00.000Z',
      name: 'Memberships branch',
      role: 'design'
    })

    expect(getPgmlSiblingVersions(branchBDocument, branchBDocument.versions[1]?.id || null).map(version => version.name)).toEqual([
      'Memberships branch'
    ])
    expect(getPgmlSiblingVersions(branchBDocument, branchBDocument.versions[2]?.id || null).map(version => version.name)).toEqual([
      'Orders branch'
    ])
    expect(hasPgmlSiblingVersions(branchBDocument, branchBDocument.versions[1]?.id || null)).toBe(true)
    expect(getPgmlSiblingVersionCount(branchBDocument, branchBDocument.versions[1]?.id || null)).toBe(1)
  })

  it('serializes versions in deterministic topological order', () => {
    const parsed = parsePgmlDocument(`VersionSet "Billing" {
  Workspace {
    based_on: v2

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v2 {
    name: "Orders branch"
    role: design
    parent: v1
    created_at: "2026-03-29T12:05:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v1 {
    name: "Root"
    role: implementation
    created_at: "2026-03-29T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }
}`)

    expect(getPgmlVersionsInTopologicalOrder(parsed).map(version => version.id)).toEqual(['v1', 'v2'])
    expect(serializePgmlDocument(parsed).indexOf('Version v1')).toBeLessThan(serializePgmlDocument(parsed).indexOf('Version v2'))
  })

  it('clones document state and normalizes snapshot source text', () => {
    const document = createInitialPgmlDocument({
      name: 'Billing',
      workspaceSource: `\r\n${baseSnapshotSource}\r\n`
    })
    const clonedDocument = clonePgmlVersionSetDocument(document)

    clonedDocument.workspace.snapshot.source = 'Table public.accounts {\n  id uuid [pk]\n}'

    expect(document.workspace.snapshot.source).toContain('Table public.users')
    expect(normalizePgmlSnapshotSource(`\r\n${baseSnapshotSource}\r\n`)).toBe(baseSnapshotSource)
  })

  it('compares snapshots with optional layout stripping', () => {
    const layoutSource = `Table public.users {
  id uuid [pk]
}

Properties "public.users" {
  x: 120
  y: 180
}`

    expect(arePgmlSnapshotsEquivalent(layoutSource, baseSnapshotSource, true)).toBe(false)
    expect(arePgmlSnapshotsEquivalent(layoutSource, baseSnapshotSource, false)).toBe(true)
  })

  it('reports whether the workspace differs from its selected base version', () => {
    const document = createInitialPgmlDocument({
      initialVersion: {
        createdAt: '2026-03-29T12:00:00.000Z',
        name: 'Initial implementation',
        parentVersionId: null,
        role: 'implementation',
        snapshot: {
          source: baseSnapshotSource
        }
      },
      name: 'Billing',
      workspaceSource: baseSnapshotSource
    })
    const dirtyDocument = replacePgmlWorkspaceFromSnapshot(document, {
      basedOnVersionId: document.workspace.basedOnVersionId,
      source: `${baseSnapshotSource}

Table public.orders {
  id uuid [pk]
}`
    })

    expect(isPgmlWorkspaceDirty(document)).toBe(false)
    expect(isPgmlWorkspaceDirty(dirtyDocument)).toBe(true)
  })

  it('only allows checkpoint creation when the workspace has a meaningful delta', () => {
    const cleanDocument = createInitialPgmlDocument({
      initialVersion: {
        createdAt: '2026-03-29T12:00:00.000Z',
        name: 'Initial implementation',
        parentVersionId: null,
        role: 'implementation',
        snapshot: {
          source: baseSnapshotSource
        }
      },
      name: 'Billing',
      workspaceSource: baseSnapshotSource
    })
    const dirtyDocument = replacePgmlWorkspaceFromSnapshot(cleanDocument, {
      basedOnVersionId: cleanDocument.workspace.basedOnVersionId,
      source: `${baseSnapshotSource}

Table public.orders {
  id uuid [pk]
}`
    })

    expect(canCreatePgmlCheckpoint(cleanDocument)).toBe(false)
    expect(canCreatePgmlCheckpoint(dirtyDocument)).toBe(true)
  })

  it('builds consistent fallback checkpoint names from role and timestamp', () => {
    const document = createInitialPgmlDocument({
      initialVersion: {
        createdAt: '2026-03-29T12:00:00.000Z',
        name: 'Initial implementation',
        parentVersionId: null,
        role: 'implementation',
        snapshot: {
          source: baseSnapshotSource
        }
      },
      name: 'Billing'
    })

    expect(buildPgmlCheckpointName(document, {
      createdAt: '2026-03-30T09:30:00.000Z',
      role: 'design'
    })).toBe('Design checkpoint 1 · 2026-03-30')
    expect(buildPgmlCheckpointName(document, {
      createdAt: '2026-03-30T09:30:00.000Z',
      role: 'implementation'
    })).toBe('Implementation checkpoint 2 · 2026-03-30')
  })

  it('summarizes version counts, branch counts, and workspace drift', () => {
    const initialDocument = createInitialPgmlDocument({
      name: 'Billing',
      workspaceSource: baseSnapshotSource
    })
    const rootDocument = createPgmlVersionFromWorkspace(initialDocument, {
      createdAt: '2026-03-29T12:00:00.000Z',
      name: 'Initial design',
      role: 'design'
    })
    const rootVersionId = rootDocument.workspace.basedOnVersionId
    const branchADocument = createPgmlVersionFromWorkspace(replacePgmlWorkspaceFromSnapshot(rootDocument, {
      basedOnVersionId: rootVersionId,
      source: `${baseSnapshotSource}

Table public.orders {
  id uuid [pk]
}`,
      updatedAt: '2026-03-29T12:05:00.000Z'
    }), {
      createdAt: '2026-03-29T12:10:00.000Z',
      name: 'Orders branch',
      role: 'design'
    })
    const branchBDocument = createPgmlVersionFromWorkspace(replacePgmlWorkspaceFromSnapshot(branchADocument, {
      basedOnVersionId: rootVersionId,
      source: `${baseSnapshotSource}

Table public.memberships {
  id uuid [pk]
}`,
      updatedAt: '2026-03-29T12:15:00.000Z'
    }), {
      createdAt: '2026-03-29T12:20:00.000Z',
      name: 'Memberships branch',
      role: 'implementation'
    })
    const stats = getPgmlDocumentVersionStats(branchBDocument)

    expect(stats).toEqual({
      branchVersionCount: 2,
      designVersionCount: 2,
      implementationVersionCount: 1,
      rootVersionCount: 1,
      versionCount: 3,
      workspaceDirty: false
    })
  })

  it('finds the nearest common ancestor between branch versions', () => {
    const initialDocument = createInitialPgmlDocument({
      name: 'Billing',
      workspaceSource: baseSnapshotSource
    })
    const rootDocument = createPgmlVersionFromWorkspace(initialDocument, {
      createdAt: '2026-03-29T12:00:00.000Z',
      name: 'Initial design',
      role: 'design'
    })
    const rootVersionId = rootDocument.workspace.basedOnVersionId
    const branchADocument = createPgmlVersionFromWorkspace(replacePgmlWorkspaceFromSnapshot(rootDocument, {
      basedOnVersionId: rootVersionId,
      source: `${baseSnapshotSource}

Table public.orders {
  id uuid [pk]
}`,
      updatedAt: '2026-03-29T12:05:00.000Z'
    }), {
      createdAt: '2026-03-29T12:10:00.000Z',
      name: 'Orders branch',
      role: 'design'
    })
    const branchBDocument = createPgmlVersionFromWorkspace(replacePgmlWorkspaceFromSnapshot(branchADocument, {
      basedOnVersionId: rootVersionId,
      source: `${baseSnapshotSource}

Table public.memberships {
  id uuid [pk]
}`,
      updatedAt: '2026-03-29T12:15:00.000Z'
    }), {
      createdAt: '2026-03-29T12:20:00.000Z',
      name: 'Memberships branch',
      role: 'design'
    })

    expect(getPgmlNearestCommonAncestor(
      branchBDocument,
      branchBDocument.versions[1]?.id || null,
      branchBDocument.versions[2]?.id || null
    )?.name).toBe('Initial design')
  })

  it('rejects invalid timestamps and normalizes valid ones to ISO strings', () => {
    const document = createInitialPgmlDocument({
      initialVersion: {
        createdAt: '2026-03-29 12:00:00Z',
        name: 'Initial implementation',
        parentVersionId: null,
        role: 'implementation',
        snapshot: {
          source: baseSnapshotSource
        }
      },
      name: 'Billing'
    })

    expect(document.versions[0]?.createdAt).toBe('2026-03-29T12:00:00.000Z')
    expect(() => parsePgmlDocument(`VersionSet "Broken" {
  Workspace {
    based_on: v1

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v1 {
    name: "Initial"
    role: design
    created_at: "not-a-timestamp"

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
    }
}`)).toThrow('Version v1 created_at requires a valid ISO timestamp.')
  })

  it('returns the latest version by timestamp instead of document order', () => {
    const parsed = parsePgmlDocument(`VersionSet "Billing" {
  Workspace {
    based_on: v1

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v1 {
    name: "Older"
    role: design
    created_at: "2026-03-29T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v2 {
    name: "Newest"
    role: design
    parent: v1
    created_at: "2026-03-30T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }
}`)

    expect(getLatestPgmlVersion(parsed)?.id).toBe('v2')
  })

  it('returns all root versions in a branched document', () => {
    const parsed = parsePgmlDocument(`VersionSet "Billing" {
  Workspace {
    based_on: v2

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v1 {
    name: "Implementation root"
    role: implementation
    created_at: "2026-03-29T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v2 {
    name: "Design branch"
    role: design
    parent: v1
    created_at: "2026-03-30T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
        email text
      }
    }
  }
}`)

    expect(getPgmlRootVersions(parsed).map(version => version.id)).toEqual(['v1'])
    expect(getPgmlRootVersionCount(parsed)).toBe(1)
    expect(isPgmlRootVersion(parsed, 'v1')).toBe(true)
  })

  it('returns leaf versions that have no child checkpoints', () => {
    const parsed = parsePgmlDocument(`VersionSet "Billing" {
  Workspace {
    based_on: v3

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v1 {
    name: "Root"
    role: implementation
    created_at: "2026-03-29T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v2 {
    name: "Orders branch"
    role: design
    parent: v1
    created_at: "2026-03-30T12:00:00.000Z"

    Snapshot {
      Table public.orders {
        id uuid [pk]
      }
    }
  }

  Version v3 {
    name: "Members branch"
    role: design
    parent: v1
    created_at: "2026-03-31T12:00:00.000Z"

    Snapshot {
      Table public.members {
        id uuid [pk]
      }
    }
  }
}`)

    expect(getPgmlLeafVersions(parsed).map(version => version.id)).toEqual(['v2', 'v3'])
    expect(getPgmlLeafVersionCount(parsed)).toBe(2)
    expect(isPgmlLeafVersion(parsed, 'v2')).toBe(true)
    expect(isPgmlLeafVersion(parsed, 'v1')).toBe(false)
  })

  it('returns the latest version for a specific role', () => {
    const parsed = parsePgmlDocument(`VersionSet "Billing" {
  Workspace {
    based_on: v3

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v1 {
    name: "Implementation root"
    role: implementation
    created_at: "2026-03-29T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v2 {
    name: "Design branch"
    role: design
    parent: v1
    created_at: "2026-03-30T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
        email text
      }
    }
  }

  Version v3 {
    name: "Implementation sync"
    role: implementation
    parent: v2
    created_at: "2026-03-31T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
        email text
      }
    }
  }
}`)

    expect(getLatestPgmlVersionByRole(parsed, 'design')?.id).toBe('v2')
    expect(getLatestPgmlVersionByRole(parsed, 'implementation')?.id).toBe('v3')
  })

  it('builds lineage labels from version names when available', () => {
    const parsed = parsePgmlDocument(`VersionSet "Billing" {
  Workspace {
    based_on: v2

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v1 {
    name: "Implementation root"
    role: implementation
    created_at: "2026-03-29T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v2 {
    name: "Design branch"
    role: design
    parent: v1
    created_at: "2026-03-30T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
        email text
      }
    }
  }
}`)

    expect(buildPgmlVersionLineageLabel(parsed, 'v2')).toBe('Implementation root -> Design branch')
  })

  it('builds a display label from the version name when present', () => {
    expect(getPgmlVersionDisplayLabel({
      createdAt: '2026-03-29T12:00:00.000Z',
      id: 'v1',
      name: 'Named version',
      parentVersionId: null,
      role: 'design',
      snapshot: {
        source: baseSnapshotSource
      }
    })).toBe('Named version')
    expect(getPgmlVersionDisplayLabel({
      createdAt: '2026-03-29T12:00:00.000Z',
      id: 'v2',
      name: '   ',
      parentVersionId: null,
      role: 'design',
      snapshot: {
        source: baseSnapshotSource
      }
    })).toBe('v2')
  })

  it('detects whether one version is an ancestor of another', () => {
    const parsed = parsePgmlDocument(`VersionSet "Billing" {
  Workspace {
    based_on: v3

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v1 {
    name: "Root"
    role: implementation
    created_at: "2026-03-29T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v2 {
    name: "Branch"
    role: design
    parent: v1
    created_at: "2026-03-30T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
        email text
      }
    }
  }

  Version v3 {
    name: "Leaf"
    role: design
    parent: v2
    created_at: "2026-03-31T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
        email text
        status text
      }
    }
  }
}`)

    expect(isPgmlVersionAncestor(parsed, 'v1', 'v3')).toBe(true)
    expect(isPgmlVersionAncestor(parsed, 'v2', 'v3')).toBe(true)
    expect(isPgmlVersionAncestor(parsed, 'v3', 'v1')).toBe(false)
    expect(isPgmlVersionAncestor(parsed, 'v2', 'v2')).toBe(false)
  })

  it('detects whether one version is a descendant of another', () => {
    const parsed = parsePgmlDocument(`VersionSet "Billing" {
  Workspace {
    based_on: v2

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v1 {
    name: "Root"
    role: implementation
    created_at: "2026-03-29T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v2 {
    name: "Leaf"
    role: design
    parent: v1
    created_at: "2026-03-30T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
        email text
      }
    }
  }
}`)

    expect(isPgmlVersionDescendant(parsed, 'v2', 'v1')).toBe(true)
    expect(isPgmlVersionDescendant(parsed, 'v1', 'v2')).toBe(false)
  })

  it('returns the root version for any branch member', () => {
    const parsed = parsePgmlDocument(`VersionSet "Billing" {
  Workspace {
    based_on: v3

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v1 {
    name: "Root"
    role: implementation
    created_at: "2026-03-29T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v2 {
    name: "Middle"
    role: design
    parent: v1
    created_at: "2026-03-30T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
        email text
      }
    }
  }

  Version v3 {
    name: "Leaf"
    role: design
    parent: v2
    created_at: "2026-03-31T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
        email text
        status text
      }
    }
  }
}`)

    expect(getPgmlBranchRootVersion(parsed, 'v3')?.id).toBe('v1')
    expect(getPgmlBranchRootVersion(parsed, 'v1')?.id).toBe('v1')
    expect(getPgmlBranchRootId(parsed, 'v3')).toBe('v1')
    expect(getPgmlBranchRootLabel(parsed, 'v3')).toBe('Root')
  })

  it('rejects invalid VersionSet documents that reference missing parent or base versions', () => {
    const invalidDocumentSource = `VersionSet "Broken" {
  Workspace {
    based_on: v2

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v1 {
    name: "Initial"
    role: design
    created_at: "2026-03-29T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }
}`

    expect(() => parsePgmlDocument(invalidDocumentSource)).toThrow(
      'Workspace based_on references missing version v2.'
    )
  })

  it('rejects parent cycles in version graphs', () => {
    const invalidDocumentSource = `VersionSet "Broken cycle" {
  Workspace {
    based_on: v0

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v0 {
    name: "Root"
    role: implementation
    created_at: "2026-03-29T11:55:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v1 {
    name: "Initial"
    role: design
    parent: v2
    created_at: "2026-03-29T12:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v2 {
    name: "Follow-up"
    role: design
    parent: v1
    created_at: "2026-03-29T12:05:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
        email text
      }
    }
  }
}`

    expect(() => parsePgmlDocument(invalidDocumentSource)).toThrow(
      'Version v1 forms a parent cycle through v1.'
    )
  })
})
