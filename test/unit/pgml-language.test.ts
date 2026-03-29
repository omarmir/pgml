import { describe, expect, it } from 'vitest'

import { analyzePgmlDocument, getPgmlCompletionItems } from '../../app/utils/pgml-language'
import { buildVersionedCompletionFixture, validVersionedEditorSource } from './pgml-editor-fixtures'

describe('PGML language utility', () => {
  it('collects no diagnostics for a structurally valid document', () => {
    const source = `TableGroup Core {
  users
}

Table public.users in Core {
  id uuid [pk]
  email text [unique, not null]
}

Properties "public.users" {
  x: 120
  y: 84
  collapsed: false
  masonry: true
  table_width_scale: 1.5
}

Function orphan_report() {
  language: sql
  source: $sql$
    select 1;
  $sql$
}

Properties "function:orphan_report" {
  collapsed: false
}`

    const analysis = analyzePgmlDocument(source)

    expect(analysis.diagnostics).toEqual([])
  })

  it('reports duplicate columns and missing reference targets', () => {
    const source = `Table public.users {
  id uuid [pk]
  id uuid
  role_id uuid [ref: > public.roles.id]
}`

    const diagnostics = analyzePgmlDocument(source).diagnostics

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'pgml/column-duplicate',
        lines: [2, 3],
        severity: 'error'
      }),
      expect.objectContaining({
        code: 'pgml/ref-missing-to-table',
        severity: 'error'
      })
    ]))
  })

  it('reports invalid property targets and invalid property values', () => {
    const source = `Table public.users {
  id uuid [pk]
}

Properties "group:Missing" {
  color: blue
  collapsed: maybe
  masonry: maybe
}`

    const diagnostics = analyzePgmlDocument(source).diagnostics

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'pgml/properties-color',
        severity: 'error'
      }),
      expect.objectContaining({
        code: 'pgml/properties-boolean',
        severity: 'error'
      }),
      expect.objectContaining({
        code: 'pgml/properties-target-missing',
        severity: 'error'
      })
    ]))
  })

  it('reports duplicate enum definitions as warnings', () => {
    const source = `Enum public.Language_Preference {
  eng
  fra
}

Enum public.language_preference {
  eng
  fra
}`

    const diagnostics = analyzePgmlDocument(source).diagnostics

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'pgml/custom-type-duplicate',
        lines: [1, 6],
        message: 'Duplicate enum definition for `public.language_preference`. Lines 1, 6.',
        severity: 'warning'
      })
    ]))
  })

  it('offers top-level keyword completions', () => {
    const items = getPgmlCompletionItems('', 0)

    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'VersionSet',
        kind: 'keyword'
      }),
      expect.objectContaining({
        label: 'Table',
        kind: 'keyword'
      }),
      expect.objectContaining({
        label: 'Ref:',
        kind: 'keyword'
      })
    ]))
  })

  it('collects no diagnostics for a structurally valid versioned document', () => {
    const analysis = analyzePgmlDocument(validVersionedEditorSource)

    expect(analysis.isVersionedDocument).toBe(true)
    expect(analysis.diagnostics).toEqual([])
  })

  it('offers table width scale as a properties completion', () => {
    const source = `TableGroup Core {
  public.users
}

Table public.users in Core {
  id uuid [pk]
}

Properties "group:Core" {
  table_
}`
    const items = getPgmlCompletionItems(source, source.indexOf('table_') + 'table_'.length)

    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'table_width_scale',
        kind: 'property'
      })
    ]))
  })

  it('offers standalone executable targets in properties completions', () => {
    const source = `Function orphan_report() {
  language: sql
  source: $sql$
    select 1;
  $sql$
}

Properties "fun" {
}`
    const cursor = source.indexOf('fun') + 'fun'.length
    const items = getPgmlCompletionItems(source, cursor)

    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'function:orphan_report',
        kind: 'symbol'
      })
    ]))
  })

  it('offers context-aware completions for groups, column modifiers, and references', () => {
    const source = `TableGroup Core {
  users
}

Table public.users in C {
  id uuid [pk]
  role_id u [
}

Ref: public.users.id > public.u`

    const groupCompletions = getPgmlCompletionItems(source, source.indexOf('in C') + 4)
    const modifierCompletions = getPgmlCompletionItems(source, source.indexOf('[') + 1)
    const referenceCompletions = getPgmlCompletionItems(source, source.length)

    expect(groupCompletions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'Core'
      })
    ]))
    expect(modifierCompletions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'pk'
      }),
      expect.objectContaining({
        label: 'ref:'
      }),
      expect.objectContaining({
        label: 'delete:'
      }),
      expect.objectContaining({
        label: 'update:'
      })
    ]))
    expect(referenceCompletions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'public.users.id'
      })
    ]))
  })

  it('offers version-set, workspace, and version-aware completions', () => {
    const versionSetSource = buildVersionedCompletionFixture(`  Wor
`)
    const workspaceSource = buildVersionedCompletionFixture(`  Workspace {
    ba
  }

  Version v1 {
    role: implementation
    created_at: "2026-03-20T15:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }
`)
    const versionRoleSource = buildVersionedCompletionFixture(`  Workspace {
    based_on: v1

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v1 {
    role: im
    created_at: "2026-03-20T15:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }
`)
    const versionParentSource = buildVersionedCompletionFixture(`  Workspace {
    based_on: v1

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v1 {
    role: implementation
    created_at: "2026-03-20T15:00:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v2 {
    parent: v
    role: design
    created_at: "2026-03-24T10:30:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }
`)

    const versionSetItems = getPgmlCompletionItems(versionSetSource, versionSetSource.indexOf('Wor') + 'Wor'.length)
    const workspaceItems = getPgmlCompletionItems(workspaceSource, workspaceSource.indexOf('ba') + 'ba'.length)
    const versionRoleItems = getPgmlCompletionItems(versionRoleSource, versionRoleSource.indexOf('im') + 'im'.length)
    const versionParentItems = getPgmlCompletionItems(versionParentSource, versionParentSource.indexOf('parent: v') + 'parent: v'.length)

    expect(versionSetItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'Workspace',
        kind: 'keyword'
      })
    ]))
    expect(workspaceItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'based_on',
        kind: 'property'
      })
    ]))
    expect(versionRoleItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'implementation',
        kind: 'value'
      })
    ]))
    expect(versionParentItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'v1',
        kind: 'symbol'
      })
    ]))
  })
})
