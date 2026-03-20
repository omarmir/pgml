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
  table_columns: 1
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
        value: 'table_columns',
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
})
