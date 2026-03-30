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
