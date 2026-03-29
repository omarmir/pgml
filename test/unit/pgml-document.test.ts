import { describe, expect, it } from 'vitest'

import {
  createInitialPgmlDocument,
  createPgmlVersionFromWorkspace,
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
})
