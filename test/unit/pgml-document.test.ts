import { describe, expect, it } from 'vitest'

import {
  createInitialPgmlDocument,
  createPgmlVersionFromWorkspace,
  getPgmlChildVersions,
  getPgmlDescendantVersions,
  getPgmlVersionById,
  getPgmlVersionLineage,
  getPgmlVersionMap,
  getPgmlWorkspaceBaseVersion,
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
