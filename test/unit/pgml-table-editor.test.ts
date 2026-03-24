import { describe, expect, it } from 'vitest'

import { parsePgml } from '../../app/utils/pgml'
import {
  applyEditableGroupDraftToSource,
  applyEditableTableDraftToSource,
  commonPgmlColumnTypes,
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
  it('offers bigserial in the common column type presets', () => {
    expect(commonPgmlColumnTypes).toContain('bigserial')
  })

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

    expect(nextSource).toContain('TableGroup Core {\n  public.members\n}')
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

    expect(nextSource).toContain('TableGroup Core {\n  public.users\n  public.roles\n}')
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

    expect(nextSource).toContain('TableGroup Identity {\n  public.users\n  Note: Shared auth and tenant ownership.\n}')
    expect(nextSource).toContain('Table public.users in Identity {')
    expect(nextSource).toContain('Properties "group:Identity" {')
    expect(nextSource).not.toContain('Properties "group:Core" {')
  })

  it('reassigns tables through the group editor and keeps table headers aligned', () => {
    const sourceWithMultipleGroups = `TableGroup Core {
  public.users
  public.audit_log
}

TableGroup Billing {
  public.invoices
}

Table public.users in Core {
  id uuid [pk]
}

Table public.audit_log in Core {
  id uuid [pk]
}

Table public.invoices in Billing {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
}`
    const model = parsePgml(sourceWithMultipleGroups)
    const coreGroup = model.groups.find(group => group.name === 'Core')

    if (!coreGroup) {
      throw new Error('Expected Core group in test model.')
    }

    const draft = createEditableGroupDraft(coreGroup)

    draft.tableNames = ['public.users', 'public.orders', 'public.invoices']

    const nextSource = applyEditableGroupDraftToSource(sourceWithMultipleGroups, model, draft)

    expect(nextSource).toContain('TableGroup Core {\n  public.users\n  public.orders\n  public.invoices\n}')
    expect(nextSource).toContain('TableGroup Billing {\n}')
    expect(nextSource).toContain('Table public.orders in Core {')
    expect(nextSource).toContain('Table public.invoices in Core {')
    expect(nextSource).toContain('Table public.audit_log {')
  })

  it('keeps same-named tables from different schemas distinct inside a group', () => {
    const sourceWithDuplicateNames = `TableGroup Core {
  public.users
}

Table public.users in Core {
  id uuid [pk]
}

Table billing.users {
  id uuid [pk]
}`
    const model = parsePgml(sourceWithDuplicateNames)
    const billingUsers = model.tables.find(table => table.fullName === 'billing.users')

    if (!billingUsers) {
      throw new Error('Expected billing.users table in test model.')
    }

    const draft = createEditableTableDraft(billingUsers)

    draft.groupName = 'Core'

    const nextSource = applyEditableTableDraftToSource(sourceWithDuplicateNames, model, draft)

    expect(nextSource).toContain('TableGroup Core {\n  public.users\n  billing.users\n}')
    expect(nextSource).toContain('Table billing.users in Core {')
  })

  it('persists reference delete and update actions through the table editor draft', () => {
    const sourceWithReference = `Table public.users {
  id uuid [pk]
}

Table public.orders {
  id uuid [pk]
  customer_id uuid [ref: > public.users.id]
}`
    const model = parsePgml(sourceWithReference)
    const ordersTable = model.tables.find(table => table.fullName === 'public.orders')

    if (!ordersTable) {
      throw new Error('Expected orders table in test model.')
    }

    const draft = createEditableTableDraft(ordersTable)

    draft.columns[1]!.referenceDeleteAction = 'restrict'
    draft.columns[1]!.referenceUpdateAction = 'cascade'

    const nextSource = applyEditableTableDraftToSource(sourceWithReference, model, draft)

    expect(nextSource).toContain('customer_id uuid [ref: > public.users.id, delete: restrict, update: cascade]')
  })
})
