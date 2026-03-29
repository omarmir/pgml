import { describe, expect, it } from 'vitest'

import { tokenizePgmlSource } from '../../app/utils/pgml-codemirror'

describe('PGML CodeMirror tokenization', () => {
  it('assigns a dedicated token type to column types without recoloring the column name', () => {
    const source = `Table public.users {
  id uuid [pk]
  email text [unique, not null]
}`

    const tokens = tokenizePgmlSource(source).filter(token => token.value.trim().length > 0)

    expect(tokens).toEqual(expect.arrayContaining([
      expect.objectContaining({
        value: 'id',
        type: 'variableName'
      }),
      expect.objectContaining({
        value: 'uuid',
        type: 'className'
      }),
      expect.objectContaining({
        value: 'email',
        type: 'variableName'
      }),
      expect.objectContaining({
        value: 'text',
        type: 'className'
      })
    ]))
  })

  it('does not treat table body keywords as column types', () => {
    const source = `Table public.users {
  id uuid [pk]
  Index idx_users_email (email)
  Constraint chk_users_email: email <> ''
}`

    const tokens = tokenizePgmlSource(source).filter(token => token.value.trim().length > 0)

    expect(tokens).toEqual(expect.arrayContaining([
      expect.objectContaining({
        value: 'Index',
        type: 'keyword'
      }),
      expect.objectContaining({
        value: 'Constraint',
        type: 'keyword'
      }),
      expect.objectContaining({
        value: 'idx_users_email',
        type: 'variableName'
      }),
      expect.objectContaining({
        value: 'chk_users_email',
        type: 'variableName'
      })
    ]))
  })

  it('keeps enum members aligned with column names and domain base types aligned with column types', () => {
    const source = `Enum role_kind {
  owner
  analyst
}

Domain email_address {
  base: text
}`

    const tokens = tokenizePgmlSource(source).filter(token => token.value.trim().length > 0)

    expect(tokens).toEqual(expect.arrayContaining([
      expect.objectContaining({
        value: 'role_kind',
        type: 'typeName'
      }),
      expect.objectContaining({
        value: 'owner',
        type: 'variableName'
      }),
      expect.objectContaining({
        value: 'analyst',
        type: 'variableName'
      }),
      expect.objectContaining({
        value: 'email_address',
        type: 'typeName'
      }),
      expect.objectContaining({
        value: 'text',
        type: 'className'
      })
    ]))
  })

  it('keeps full hex property colors as a single token', () => {
    const source = `Properties "group:Commerce" {
  color: #f59e0b
  masonry: true
  table_columns: 1
  table_width_scale: 1.5
}`

    const tokens = tokenizePgmlSource(source).filter(token => token.value.trim().length > 0)

    expect(tokens).toEqual(expect.arrayContaining([
      expect.objectContaining({
        value: 'color',
        type: 'propertyName'
      }),
      expect.objectContaining({
        value: '#f59e0b',
        type: 'atom'
      }),
      expect.objectContaining({
        value: 'masonry',
        type: 'propertyName'
      }),
      expect.objectContaining({
        value: 'table_columns',
        type: 'propertyName'
      }),
      expect.objectContaining({
        value: 'table_width_scale',
        type: 'propertyName'
      })
    ]))
  })

  it('treats multiline source blocks as string content', () => {
    const source = `Function public.register_entity(entity_kind text) returns trigger {
  source: $sql$
    CREATE OR REPLACE FUNCTION public.register_entity(entity_kind text)
  $sql$
}`

    const tokens = tokenizePgmlSource(source).filter(token => token.value.trim().length > 0)

    expect(tokens).toEqual(expect.arrayContaining([
      expect.objectContaining({
        value: '  source: $sql$',
        type: 'string'
      }),
      expect.objectContaining({
        value: '    CREATE OR REPLACE FUNCTION public.register_entity(entity_kind text)',
        type: 'string'
      }),
      expect.objectContaining({
        value: '  $sql$',
        type: 'string'
      })
    ]))
  })

  it('highlights version grammar keywords, metadata, and role values', () => {
    const source = `VersionSet "Billing" {
  Workspace {
    based_on: v2
    updated_at: "2026-03-29T14:12:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }

  Version v2 {
    name: "Workspace base"
    role: implementation
    parent: v1
    created_at: "2026-03-24T10:30:00.000Z"

    Snapshot {
      Table public.users {
        id uuid [pk]
      }
    }
  }
}`

    const tokens = tokenizePgmlSource(source).filter(token => token.value.trim().length > 0)

    expect(tokens).toEqual(expect.arrayContaining([
      expect.objectContaining({
        value: 'VersionSet',
        type: 'keyword'
      }),
      expect.objectContaining({
        value: 'Workspace',
        type: 'keyword'
      }),
      expect.objectContaining({
        value: 'Snapshot',
        type: 'keyword'
      }),
      expect.objectContaining({
        value: 'Version',
        type: 'keyword'
      }),
      expect.objectContaining({
        value: 'based_on',
        type: 'propertyName'
      }),
      expect.objectContaining({
        value: 'updated_at',
        type: 'propertyName'
      }),
      expect.objectContaining({
        value: 'role',
        type: 'propertyName'
      }),
      expect.objectContaining({
        value: 'implementation',
        type: 'atom'
      }),
      expect.objectContaining({
        value: 'parent',
        type: 'propertyName'
      }),
      expect.objectContaining({
        value: 'v1',
        type: 'typeName'
      })
    ]))
  })
})
