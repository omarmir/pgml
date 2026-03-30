import { describe, expect, it } from 'vitest'

import { convertDbmlToPgml, deriveDbmlSchemaName } from '../../app/utils/dbml-import'
import { parsePgml } from '../../app/utils/pgml'

describe('DBML import utilities', () => {
  it('converts DBML-like schema blocks into importable PGML and strips Project metadata', () => {
    const result = convertDbmlToPgml({
      dbml: `Project commerce {
  database_type: 'PostgreSQL'
}

Table users {
  id uuid [pk]
  email text [unique]
}

Table orders {
  id uuid [pk]
  user_id uuid
}

Ref: users.id < orders.user_id`
    })

    const model = parsePgml(result.pgml)

    expect(result.schemaName).toBe('commerce')
    expect(result.pgml).toContain('// Imported from DBML.')
    expect(result.pgml).not.toContain('Project commerce')
    expect(model.tables.map(table => table.name)).toEqual(['users', 'orders'])
    expect(model.references).toHaveLength(1)
  })

  it('derives imported schema names from the preferred file name when there is no Project block', () => {
    expect(deriveDbmlSchemaName({
      preferredName: 'billing.dbml'
    })).toBe('billing')
  })

  it('normalizes serial pseudo-types into explicit sequence-backed PGML columns', () => {
    const result = convertDbmlToPgml({
      dbml: `Table orders {
  id bigserial [pk, not null] // System ID
  item_id serial [not null]
}`
    })

    expect(result.pgml).toContain(`Sequence public.orders_id_seq {
  as: bigint
  owned_by: public.orders.id
}`)
    expect(result.pgml).toContain(`Sequence public.orders_item_id_seq {
  as: integer
  owned_by: public.orders.item_id
}`)
    expect(result.pgml).toContain(`id bigint [pk, not null, default: nextval('public.orders_id_seq')] // System ID`)
    expect(result.pgml).toContain(`item_id integer [not null, default: nextval('public.orders_item_id_seq')]`)

    const model = parsePgml(result.pgml)

    expect(model.sequences.map(sequence => sequence.name)).toEqual([
      'public.orders_id_seq',
      'public.orders_item_id_seq'
    ])
    expect(model.tables.find(table => table.fullName === 'public.orders')?.columns).toEqual(expect.arrayContaining([
      expect.objectContaining({
        modifiers: expect.arrayContaining([`default: nextval('public.orders_id_seq')`]),
        name: 'id',
        type: 'bigint'
      }),
      expect.objectContaining({
        modifiers: expect.arrayContaining([`default: nextval('public.orders_item_id_seq')`]),
        name: 'item_id',
        type: 'integer'
      })
    ]))
  })

  it('rejects DBML that does not contain importable schema objects', () => {
    expect(() => {
      convertDbmlToPgml({
        dbml: `Project blank {
  database_type: 'PostgreSQL'
}`
      })
    }).toThrow('No importable schema objects were found in that DBML.')
  })
})
