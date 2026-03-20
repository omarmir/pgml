import { describe, expect, it } from 'vitest'

import { parsePgml } from '../../app/utils/pgml'
import {
  applyEditableGroupDraftToSource,
  applyEditableTableDraftToSource,
  createEditableGroupDraft,
  createEditableGroupDraftForCreate,
  createEditableTableDraft,
  createEditableTableDraftForGroup
} from '../../app/utils/pgml-table-editor'

const source = `TableGroup Core {
  users
}

Table public.users in Core {
  id uuid [pk, not null]
  email text [not null]
}`

describe('PGML table editor', () => {
  it('rewrites an edited table block and keeps the group list aligned', () => {
    const model = parsePgml(source)
    const usersTable = model.tables.find(table => table.fullName === 'public.users')

    if (!usersTable) {
      throw new Error('Expected users table in test model.')
    }

    const draft = createEditableTableDraft(usersTable)

    draft.name = 'members'
    draft.note = 'Managed through the modal editor.'
    draft.columns[1]!.type = 'email_address'
    draft.columns[1]!.unique = true

    const nextSource = applyEditableTableDraftToSource(source, model, draft)

    expect(nextSource).toContain('TableGroup Core {\n  members\n}')
    expect(nextSource).toContain('Table public.members in Core {')
    expect(nextSource).toContain('Note: Managed through the modal editor.')
    expect(nextSource).toContain('email email_address [not null, unique]')
  })

  it('creates a new table block and registers it in the target group', () => {
    const model = parsePgml(source)
    const draft = createEditableTableDraftForGroup('Core')

    draft.name = 'roles'
    draft.columns = [
      {
        ...draft.columns[0]!,
        name: 'id',
        type: 'uuid'
      },
      {
        ...draft.columns[0]!,
        id: 'role-key',
        name: 'key',
        notNull: true,
        primaryKey: false,
        type: 'text',
        unique: true
      }
    ]

    const nextSource = applyEditableTableDraftToSource(source, model, draft)

    expect(nextSource).toContain('TableGroup Core {\n  users\n  roles\n}')
    expect(nextSource).toContain('Table public.roles in Core {')
    expect(nextSource).toContain('key text [not null, unique]')
  })

  it('creates an empty group block from the group editor draft', () => {
    const model = parsePgml(source)
    const draft = createEditableGroupDraftForCreate()

    draft.name = 'Billing'
    draft.note = 'Invoices and payouts'

    const nextSource = applyEditableGroupDraftToSource(source, model, draft)
    const nextModel = parsePgml(nextSource)
    const billingGroup = nextModel.groups.find(group => group.name === 'Billing')

    expect(nextSource).toContain('TableGroup Billing {')
    expect(nextSource).toContain('Note: Invoices and payouts')
    expect(billingGroup).toEqual(expect.objectContaining({
      name: 'Billing',
      note: 'Invoices and payouts',
      tableNames: []
    }))
  })

  it('renames a group, keeps its members, and migrates stored group properties', () => {
    const sourceWithProperties = `${source}

Properties "group:Core" {
  x: 120
  y: 90
}`
    const model = parsePgml(sourceWithProperties)
    const coreGroup = model.groups.find(group => group.name === 'Core')

    if (!coreGroup) {
      throw new Error('Expected Core group in test model.')
    }

    const draft = createEditableGroupDraft(coreGroup)

    draft.name = 'Identity'
    draft.note = 'Shared auth and tenant ownership.'

    const nextSource = applyEditableGroupDraftToSource(sourceWithProperties, model, draft)

    expect(nextSource).toContain('TableGroup Identity {\n  users\n  Note: Shared auth and tenant ownership.\n}')
    expect(nextSource).toContain('Table public.users in Identity {')
    expect(nextSource).toContain('Properties "group:Identity" {')
    expect(nextSource).not.toContain('Properties "group:Core" {')
  })
})
