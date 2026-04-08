import { describe, expect, it } from 'vitest'

import { parsePgml } from '../../app/utils/pgml'
import { retainPgmlTableGroupsFromBaseSource } from '../../app/utils/pgml-import-groups'

describe('pgml import group retention', () => {
  it('retains matching table groups from the selected base source', () => {
    const baseSource = `Table public.users in Core {
  id uuid [pk]
}

Table public.orders in Core {
  id uuid [pk]
}

Table public.audit_log in Core {
  id uuid [pk]
}

TableGroup Core {
  public.users
  public.orders
  public.audit_log
  Note: Shared transactional tables
}`
    const importedSource = `// Imported from a text pg_dump.

Table public.users {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
}

Table public.invoices {
  id uuid [pk]
}`

    const retainedSource = retainPgmlTableGroupsFromBaseSource({
      baseSource,
      importedSource
    })
    const retainedModel = parsePgml(retainedSource)

    expect(retainedSource).toContain('Table public.users in Core {')
    expect(retainedSource).toContain('Table public.orders in Core {')
    expect(retainedSource).toContain('TableGroup Core {')
    expect(retainedSource).toContain('Note: Shared transactional tables')
    expect(retainedModel.tables.find(table => table.fullName === 'public.users')?.groupName).toBe('Core')
    expect(retainedModel.tables.find(table => table.fullName === 'public.orders')?.groupName).toBe('Core')
    expect(retainedModel.tables.find(table => table.fullName === 'public.invoices')?.groupName).toBe(null)
    expect(retainedModel.groups).toEqual([
      expect.objectContaining({
        name: 'Core',
        note: 'Shared transactional tables',
        tableNames: ['public.users', 'public.orders']
      })
    ])
  })

  it('returns the imported source unchanged when no grouped tables match the base', () => {
    const baseSource = `Table public.users in Core {
  id uuid [pk]
}

TableGroup Core {
  public.users
}`
    const importedSource = `// Imported from a text pg_dump.

Table public.orders {
  id uuid [pk]
}`

    expect(retainPgmlTableGroupsFromBaseSource({
      baseSource,
      importedSource
    })).toBe(importedSource)
  })
})
