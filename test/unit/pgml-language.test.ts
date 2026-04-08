import { describe, expect, it } from 'vitest'

import {
  analyzePgmlDocument,
  getPgmlCompletionItems,
  getPgmlCompletionItemsFromAnalysis
} from '../../app/utils/pgml-language'
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

  it('accepts DBML-style imported indexes, checks, comments, and named composite refs', () => {
    const source = `/*
Imported from DBML.
*/
Table public.users {
  id bigint [pk, not null] // System ID
  email text [not null]
  status text [not null]

  Indexes {
    email [name: 'users_email_idx']
    (email, status) [name: 'users_email_status_idx', unique, where: \`status <> ''\`]
  }

  checks {
    \`status <> ''\` [name: 'users_status_check']
    \`NOT (
      status = 'draft'
      AND email = ''
    )\` [name: 'users_status_email_check']
  }
}

Table public.accounts {
  id bigint [pk]
  user_id bigint [not null]
  entity_type text [not null]
}

Ref account_user_ref: public.accounts.(user_id, entity_type) > public.users.(id, status)`

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

  it('reuses cached analysis for completion requests without changing the suggestions', () => {
    const source = buildVersionedCompletionFixture(`  Workspace {
    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }`)
    const offset = source.indexOf('    Snapshot {') + '    Snapshot {'.length
    const analysis = analyzePgmlDocument(source)

    expect(getPgmlCompletionItemsFromAnalysis(analysis, offset)).toEqual(
      getPgmlCompletionItems(source, offset)
    )
  })

  it('collects no diagnostics for a structurally valid versioned document', () => {
    const analysis = analyzePgmlDocument(validVersionedEditorSource)

    expect(analysis.isVersionedDocument).toBe(true)
    expect(analysis.diagnostics).toEqual([])
  })

  it('accepts SchemaMetadata blocks at the VersionSet root and offers matching completions', () => {
    const source = buildVersionedCompletionFixture(`  SchemaMetadata {
    Table "public.users" {
      owner: "identity"
    }

    Column "public.users.email" {
      pii: "restricted"
    }
  }

  Workspace {
    Snapshot {
      Table public.users {
        id uuid [pk]
        email text
      }
    }
  }`)
    const completionOffset = source.indexOf('  SchemaMetadata {') + '  SchemaMetadata {'.length
    const completions = getPgmlCompletionItems(source, completionOffset)
    const analysis = analyzePgmlDocument(source)

    expect(analysis.diagnostics).toEqual([])
    expect(completions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'Table',
        kind: 'keyword'
      }),
      expect.objectContaining({
        label: 'Column',
        kind: 'keyword'
      })
    ]))
  })

  it('accepts Comparison blocks at the VersionSet root and offers comparison completions', () => {
    const source = buildVersionedCompletionFixture(`  Workspace {
    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Comparison "Implemented scope" {
    id: cmp_scope
    base: workspace
    target: workspace
    
  }`)
    const comparisonOffset = source.indexOf('    \n  }', source.indexOf('target: workspace')) + 4
    const comparisonCompletions = getPgmlCompletionItems(source, comparisonOffset)
    const analysis = analyzePgmlDocument(source)

    expect(analysis.diagnostics).toEqual([])
    expect(comparisonCompletions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'id',
        kind: 'property'
      }),
      expect.objectContaining({
        label: 'CompareExclusions',
        kind: 'property'
      })
    ]))
  })

  it('collects no diagnostics for standalone workspace and version document scopes', () => {
    const workspaceScopeSource = `Workspace {
  based_on: v2
  updated_at: "2026-03-29T14:12:00.000Z"

  Snapshot {
    Table public.users {
      id uuid [pk]
    }
  }
}`
    const versionScopeSource = `Version v2 {
  name: "Workspace base"
  role: design
  parent: v1
  created_at: "2026-03-24T10:30:00.000Z"

  Snapshot {
    Table public.users {
      id uuid [pk]
    }
  }
}`

    const workspaceAnalysis = analyzePgmlDocument(workspaceScopeSource)
    const versionAnalysis = analyzePgmlDocument(versionScopeSource)

    expect(workspaceAnalysis.isVersionedDocument).toBe(true)
    expect(workspaceAnalysis.diagnostics).toEqual([])
    expect(versionAnalysis.isVersionedDocument).toBe(true)
    expect(versionAnalysis.diagnostics).toEqual([])
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

  it('offers workspace and version completions when those blocks are the scoped root', () => {
    const workspaceScopeSource = `Workspace {
  ba

  Snapshot {
    Table public.users {
      id uuid [pk]
    }
  }
}`
    const versionScopeSource = `Version v2 {
  role: im
  created_at: "2026-03-24T10:30:00.000Z"

  Snapshot {
    Table public.users {
      id uuid [pk]
    }
  }
}`

    const workspaceItems = getPgmlCompletionItems(workspaceScopeSource, workspaceScopeSource.indexOf('ba') + 'ba'.length)
    const versionItems = getPgmlCompletionItems(versionScopeSource, versionScopeSource.indexOf('im') + 'im'.length)

    expect(workspaceItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'based_on',
        kind: 'property'
      })
    ]))
    expect(versionItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'implementation',
        kind: 'value'
      })
    ]))
  })

  it('offers View block completions inside workspace and version scopes', () => {
    const source = `VersionSet "Billing" {
  Workspace {
    act

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }

    Vi

    View "Default" {
      id: workspace_default

      Prop
    }
  }

  Version v1 {
    role: design
    created_at: "2026-03-24T10:30:00.000Z"
    active_view: version_default

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }

    View "Default" {
      id: version_default
      show_l
      snap
    }
  }
}`

    const workspaceMetadataItems = getPgmlCompletionItems(source, source.indexOf('act') + 'act'.length)
    const workspaceViewItems = getPgmlCompletionItems(source, source.indexOf('\n\n    Vi') + '\n\n    Vi'.length)
    const viewPropertiesItems = getPgmlCompletionItems(source, source.indexOf('Prop') + 'Prop'.length)
    const viewBooleanItems = getPgmlCompletionItems(source, source.indexOf('show_l') + 'show_l'.length)
    const viewSnapItems = getPgmlCompletionItems(source, source.indexOf('snap') + 'snap'.length)

    expect(workspaceMetadataItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'active_view',
        kind: 'property'
      })
    ]))
    expect(workspaceViewItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'View',
        kind: 'keyword'
      })
    ]))
    expect(viewPropertiesItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'Properties',
        kind: 'keyword'
      })
    ]))
    expect(viewBooleanItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'show_lines',
        kind: 'property'
      })
    ]))
    expect(viewSnapItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: 'snap_to_grid',
        kind: 'property'
      })
    ]))
  })
})
